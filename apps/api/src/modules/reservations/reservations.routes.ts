import type { FastifyInstance } from "fastify";
import { InventoryStatus, MovementType, ReservationStatus, RoleCode } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { stripSellerFinancials } from "../security/sanitize.js";

const reserveSchema = z.object({
  productId: z.string().uuid(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  observations: z.string().optional()
});

export async function reservationsRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireAuth }, async (request) => {
    await expireDueReservations(request.user.sub);
    const reservations = await prisma.reservation.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        product: { include: { brand: true, condition: true, images: true } },
        user: { select: { name: true, username: true } },
        sale: { select: { id: true, saleNumber: true, total: true } }
      }
    });
    return request.user.role === RoleCode.SELLER ? stripSellerFinancials(reservations) : reservations;
  });

  app.post("/", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.SELLER]) }, async (request, reply) => {
    const body = reserveSchema.parse(request.body);
    const settings = await reservationSettings();
    if (!settings.enabled) return reply.status(403).send({ message: "Las reservas estan deshabilitadas." });
    if (request.user.role === RoleCode.SELLER && !settings.sellerCanReserve) {
      return reply.status(403).send({ message: "El vendedor no esta autorizado para reservar." });
    }

    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: body.productId } });
      if (!product || !product.active) return reply.status(404).send({ message: "Producto no encontrado." });
      if (product.status !== InventoryStatus.AVAILABLE) return reply.status(409).send({ message: "Solo se pueden reservar productos disponibles." });

      const reservation = await tx.reservation.create({
        data: {
          productId: product.id,
          userId: request.user.sub,
          customerName: body.customerName,
          customerPhone: body.customerPhone,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + settings.defaultHours * 60 * 60 * 1000),
          observations: body.observations
        },
        include: { product: { include: { brand: true, condition: true, images: true } }, user: { select: { name: true, username: true } } }
      });

      await tx.product.update({ where: { id: product.id }, data: { status: InventoryStatus.RESERVED, updatedById: request.user.sub } });
      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          movementType: MovementType.ADJUSTMENT,
          previousStatus: product.status,
          newStatus: InventoryStatus.RESERVED,
          userId: request.user.sub,
          referenceType: "RESERVATION",
          referenceId: reservation.id,
          observations: body.observations
        }
      });
      await tx.auditLog.create({
        data: { userId: request.user.sub, action: "RESERVATION_CREATE", entity: "RESERVATION", entityId: reservation.id, afterValues: { product: product.internalCode } }
      });
      return request.user.role === RoleCode.SELLER ? stripSellerFinancials(reservation) : reservation;
    });
  });

  app.post("/:id/release", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    return updateReservationStatus(params.id, ReservationStatus.RELEASED, request.user.sub, reply);
  });

  app.post("/expire-due", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request) => {
    return expireDueReservations(request.user.sub);
  });
}

export async function activeReservationForProduct(productId: string) {
  return prisma.reservation.findFirst({ where: { productId, status: ReservationStatus.ACTIVE } });
}

export async function convertReservation(reservationId: string, saleId: string, userId: string) {
  const reservation = await prisma.reservation.update({
    where: { id: reservationId },
    data: { status: ReservationStatus.CONVERTED, saleId }
  });
  await prisma.auditLog.create({
    data: { userId, action: "RESERVATION_CONVERT", entity: "RESERVATION", entityId: reservation.id, afterValues: { saleId } }
  });
}

async function updateReservationStatus(id: string, status: "RELEASED" | "EXPIRED", userId: string, reply: { status: (code: number) => { send: (payload: object) => unknown } }) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({ where: { id }, include: { product: true } });
    if (!reservation) return reply.status(404).send({ message: "Reserva no encontrada." });
    if (reservation.status !== ReservationStatus.ACTIVE) return reply.status(409).send({ message: "La reserva ya no esta activa." });

    const updated = await tx.reservation.update({ where: { id }, data: { status } });
    await tx.product.update({ where: { id: reservation.productId }, data: { status: InventoryStatus.AVAILABLE, updatedById: userId } });
    await tx.inventoryMovement.create({
      data: {
        productId: reservation.productId,
        movementType: MovementType.ADJUSTMENT,
        previousStatus: InventoryStatus.RESERVED,
        newStatus: InventoryStatus.AVAILABLE,
        userId,
        referenceType: "RESERVATION",
        referenceId: reservation.id,
        observations: status === ReservationStatus.EXPIRED ? "Reserva vencida" : "Reserva liberada"
      }
    });
    await tx.auditLog.create({ data: { userId, action: status === ReservationStatus.EXPIRED ? "RESERVATION_EXPIRED" : "RESERVATION_RELEASE", entity: "RESERVATION", entityId: reservation.id } });
    return updated;
  });
}

async function expireDueReservations(userId: string) {
  const due = await prisma.reservation.findMany({
    where: { status: ReservationStatus.ACTIVE, expiresAt: { lt: new Date() } },
    select: { id: true }
  });
  for (const reservation of due) {
    await updateReservationStatus(reservation.id, ReservationStatus.EXPIRED, userId, { status: () => ({ send: (payload) => payload }) });
  }
  return { expired: due.length };
}

async function reservationSettings() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "reservations" } });
  const value = setting?.value as { enabled?: boolean; defaultHours?: number; sellerCanReserve?: boolean } | undefined;
  return {
    enabled: value?.enabled ?? true,
    defaultHours: Number(value?.defaultHours ?? 24),
    sellerCanReserve: value?.sellerCanReserve ?? true
  };
}
