import type { FastifyInstance } from "fastify";
import { InventoryStatus, MovementType, RoleCode } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";

const adjustmentSchema = z.object({
  productId: z.string().uuid(),
  newStatus: z.nativeEnum(InventoryStatus),
  observations: z.string().optional()
});

export async function inventoryRoutes(app: FastifyInstance) {
  app.get("/movements", { preHandler: app.requireAuth }, async () => {
    return prisma.inventoryMovement.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { id: true, internalCode: true, model: true, size: true } },
        user: { select: { id: true, name: true, username: true } }
      }
    });
  });

  app.post("/adjustments", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const body = adjustmentSchema.parse(request.body);
    if (body.newStatus === InventoryStatus.SOLD) {
      return reply.status(409).send({ message: "Registra una venta para marcar el producto como vendido." });
    }

    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: body.productId } });
      if (!product) return reply.status(404).send({ message: "Producto no encontrado." });

      const updated = await tx.product.update({
        where: { id: product.id },
        data: { status: body.newStatus, updatedById: request.user.sub }
      });

      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          movementType: MovementType.ADJUSTMENT,
          previousStatus: product.status,
          newStatus: body.newStatus,
          userId: request.user.sub,
          referenceType: "INVENTORY_ADJUSTMENT",
          referenceId: product.id,
          observations: body.observations
        }
      });

      await tx.auditLog.create({
        data: {
          userId: request.user.sub,
          action: "INVENTORY_ADJUSTMENT",
          entity: "PRODUCT",
          entityId: product.id,
          beforeValues: { status: product.status },
          afterValues: { status: updated.status }
        }
      });

      return updated;
    });
  });
}
