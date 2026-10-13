import type { FastifyInstance } from "fastify";
import { InventoryStatus, MovementType, RoleCode, SaleStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { stripSellerFinancials } from "../security/sanitize.js";

const saleItemSchema = z.object({
  productId: z.string().uuid(),
  discount: z.coerce.number().min(0).default(0)
});

const saleSchema = z.object({
  productId: z.string().uuid().optional(),
  items: z.array(saleItemSchema).min(1).max(20).optional(),
  salePrice: z.coerce.number().positive().optional(),
  discount: z.coerce.number().min(0).default(0),
  paymentMethod: z.enum(["EFECTIVO", "QR_TRANSFERENCIA", "OTRO"]).default("EFECTIVO"),
  observations: z.string().optional(),
  idempotencyKey: z.string().min(8).max(120).optional(),
  reservationId: z.string().uuid().optional()
}).refine((body) => body.productId || body.items?.length, "Debe seleccionar al menos un producto.");

const listQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  sellerId: z.string().uuid().optional(),
  paymentMethod: z.string().optional(),
  productCode: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(50)
});

const cancelSchema = z.object({
  reason: z.string().min(3)
});

export async function salesRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireAuth }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const admin = request.user.role !== RoleCode.SELLER;
    const sales = await prisma.sale.findMany({
      where: {
        sellerId: admin ? query.sellerId : request.user.sub,
        paymentMethod: query.paymentMethod || undefined,
        createdAt: dateRange(query.from, query.to),
        items: query.productCode
          ? { some: { product: { internalCode: { contains: normalizeCode(query.productCode), mode: "insensitive" } } } }
          : undefined
      },
      take: query.take,
      include: {
        seller: { select: { id: true, name: true, username: true } },
        items: { include: { product: { include: { brand: true, condition: true, images: true } } } }
      },
      orderBy: { createdAt: "desc" }
    });
    return request.user.role === RoleCode.SELLER ? stripSellerFinancials(sales) : sales;
  });

  app.get("/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const sale = await prisma.sale.findUnique({
      where: { id: params.id },
      include: {
        seller: { select: { id: true, name: true, username: true } },
        items: { include: { product: { include: { brand: true, condition: true, images: true } } } }
      }
    });
    if (!sale) return reply.status(404).send({ message: "Venta no encontrada." });
    if (request.user.role === RoleCode.SELLER && sale.sellerId !== request.user.sub) {
      return reply.status(403).send({ message: "No tienes permisos para realizar esta accion." });
    }
    return request.user.role === RoleCode.SELLER ? stripSellerFinancials(sale) : sale;
  });

  app.post("/", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.SELLER]) }, async (request, reply) => {
    const body = saleSchema.parse(request.body);
    const normalizedItems = body.items ?? [{ productId: body.productId!, discount: body.discount }];

    if (body.idempotencyKey) {
      const existing = await prisma.sale.findUnique({
        where: { idempotencyKey: body.idempotencyKey },
        include: { items: true, seller: { select: { id: true, name: true, username: true } } }
      });
      if (existing) return request.user.role === RoleCode.SELLER ? stripSellerFinancials(existing) : existing;
    }

    if (request.user.role === RoleCode.SELLER && normalizedItems.some((item) => item.discount > 0)) {
      return reply.status(403).send({ message: "Este descuento requiere autorizacion de un administrador." });
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const ids = [...new Set(normalizedItems.map((item) => item.productId))];
        if (ids.length !== normalizedItems.length) {
          return reply.status(409).send({ message: "El carrito tiene productos repetidos." });
        }

        const products = await tx.product.findMany({
          where: { id: { in: ids }, active: true },
          include: { location: true }
        });
        const byId = new Map(products.map((product) => [product.id, product]));
        const missing = ids.filter((id) => !byId.has(id));
        if (missing.length) return reply.status(404).send({ message: "Uno o mas productos no fueron encontrados." });

        const reservation = body.reservationId ? await tx.reservation.findFirst({ where: { productId: ids[0], status: "ACTIVE" } }) : null;
        if (body.reservationId && (!reservation || reservation.id !== body.reservationId)) {
          return reply.status(409).send({ message: "La reserva no esta activa para este producto." });
        }
        const unavailable = products.find((product) => {
          if (body.reservationId && ids.length === 1 && product.status === InventoryStatus.RESERVED) return false;
          return product.status !== InventoryStatus.AVAILABLE;
        });
        if (unavailable) {
          return reply.status(409).send({ message: `${unavailable.internalCode} esta vendido, reservado o no disponible.` });
        }

        const updated = await tx.product.updateMany({
          where: { id: { in: ids }, status: body.reservationId ? { in: [InventoryStatus.AVAILABLE, InventoryStatus.RESERVED] } : InventoryStatus.AVAILABLE },
          data: { status: InventoryStatus.SOLD, updatedById: request.user.sub }
        });
        if (updated.count !== ids.length) {
          return reply.status(409).send({ message: "Uno o mas productos acaban de ser vendidos o ya no estan disponibles." });
        }

        const itemRows = normalizedItems.map((item) => {
          const product = byId.get(item.productId)!;
          const originalPrice = Number(product.salePrice ?? body.salePrice ?? 0);
          return {
            product,
            originalPrice,
            discount: Number(item.discount ?? 0),
            finalPrice: originalPrice - Number(item.discount ?? 0)
          };
        });
        const subtotal = itemRows.reduce((total, item) => total + item.originalPrice, 0);
        const discount = itemRows.reduce((total, item) => total + item.discount, 0);
        const sale = await tx.sale.create({
          data: {
            saleNumber: `V-${Date.now()}`,
            idempotencyKey: body.idempotencyKey,
            sellerId: request.user.sub,
            locationId: itemRows[0]?.product.locationId,
            subtotal,
            discount,
            total: subtotal - discount,
            paymentMethod: body.paymentMethod,
            status: SaleStatus.COMPLETED,
            observations: body.observations,
            items: {
              create: itemRows.map((item) => ({
                productId: item.product.id,
                originalPrice: item.originalPrice,
                salePrice: item.finalPrice,
                discount: item.discount,
                purchaseCostSnapshot: item.product.purchaseCost
              }))
            }
          },
          include: {
            seller: { select: { id: true, name: true, username: true } },
            items: { include: { product: { include: { brand: true, condition: true, images: true } } } }
          }
        });

        await tx.inventoryMovement.createMany({
          data: itemRows.map((item) => ({
            productId: item.product.id,
            movementType: MovementType.SALE,
            previousStatus: body.reservationId ? InventoryStatus.RESERVED : InventoryStatus.AVAILABLE,
            newStatus: InventoryStatus.SOLD,
            userId: request.user.sub,
            referenceType: "SALE",
            referenceId: sale.id,
            observations: body.observations
          }))
        });

        if (body.reservationId) {
          await tx.reservation.update({
            where: { id: body.reservationId },
            data: { status: "CONVERTED", saleId: sale.id }
          });
          await tx.auditLog.create({
            data: { userId: request.user.sub, action: "RESERVATION_CONVERT", entity: "RESERVATION", entityId: body.reservationId, afterValues: { saleId: sale.id } }
          });
        }

        await tx.auditLog.create({
          data: {
            userId: request.user.sub,
            action: "SALE",
            entity: "SALE",
            entityId: sale.id,
            afterValues: {
              saleNumber: sale.saleNumber,
              products: itemRows.map((item) => item.product.internalCode),
              total: sale.total
            }
          }
        });

        return request.user.role === RoleCode.SELLER ? stripSellerFinancials(sale) : sale;
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ message: "No se pudo registrar la venta." });
    }
  });

  app.post("/:id/cancel", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = cancelSchema.parse(request.body);
    return prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: params.id },
        include: { items: { include: { product: true } } }
      });
      if (!sale) return reply.status(404).send({ message: "Venta no encontrada." });
      if (sale.status === SaleStatus.CANCELLED) return reply.status(409).send({ message: "La venta ya fue anulada." });

      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: SaleStatus.CANCELLED,
          cancellationReason: body.reason,
          cancelledAt: new Date(),
          cancelledById: request.user.sub
        }
      });
      for (const item of sale.items) {
        await tx.product.update({ where: { id: item.productId }, data: { status: InventoryStatus.AVAILABLE, updatedById: request.user.sub } });
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            movementType: MovementType.ADJUSTMENT,
            previousStatus: item.product.status,
            newStatus: InventoryStatus.AVAILABLE,
            userId: request.user.sub,
            referenceType: "SALE_CANCEL",
            referenceId: sale.id,
            observations: body.reason
          }
        });
      }
      await tx.auditLog.create({
        data: { userId: request.user.sub, action: "SALE_CANCEL", entity: "SALE", entityId: sale.id, afterValues: { reason: body.reason } }
      });
      return updated;
    });
  });
}

function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    gte: from ? new Date(`${from}T00:00:00-04:00`) : undefined,
    lte: to ? new Date(`${to}T23:59:59-04:00`) : undefined
  };
}

function normalizeCode(value: string) {
  const codeMatch = value.match(/^TN-?0*(\d+)$/i);
  if (codeMatch) return `TN-${codeMatch[1].padStart(5, "0")}`;
  return value;
}
