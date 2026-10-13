import type { FastifyInstance } from "fastify";
import { InventoryStatus, MovementType, ReturnResultStatus, RoleCode, SaleStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";

const lookupSchema = z.object({
  saleNumber: z.string().optional(),
  productCode: z.string().optional()
}).refine((query) => query.saleNumber || query.productCode, "Busca por venta o codigo.");

const returnSchema = z.object({
  saleId: z.string().uuid(),
  productId: z.string().uuid(),
  reason: z.string().min(3),
  resultStatus: z.nativeEnum(ReturnResultStatus).default(ReturnResultStatus.AVAILABLE)
});

export async function returnsRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async () => {
    return prisma.productReturn.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        sale: { select: { saleNumber: true, createdAt: true, total: true } },
        product: { include: { brand: true, condition: true, images: true } },
        user: { select: { name: true, username: true } }
      }
    });
  });

  app.get("/lookup", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const query = lookupSchema.parse(request.query);
    const sale = await prisma.sale.findFirst({
      where: {
        saleNumber: query.saleNumber ? { equals: query.saleNumber, mode: "insensitive" } : undefined,
        items: query.productCode ? { some: { product: { internalCode: { equals: normalizeCode(query.productCode), mode: "insensitive" } } } } : undefined
      },
      include: {
        seller: { select: { name: true, username: true } },
        items: { include: { product: { include: { brand: true, condition: true, images: true } } } }
      },
      orderBy: { createdAt: "desc" }
    });
    if (!sale) return reply.status(404).send({ message: "No encontramos una venta para esa busqueda." });
    return sale;
  });

  app.post("/", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const body = returnSchema.parse(request.body);
    return prisma.$transaction(async (tx) => {
      const saleItem = await tx.saleItem.findFirst({
        where: { saleId: body.saleId, productId: body.productId, sale: { status: SaleStatus.COMPLETED } },
        include: { sale: true, product: true }
      });
      if (!saleItem) return reply.status(404).send({ message: "Producto o venta no encontrados para devolucion." });
      const existing = await tx.productReturn.findUnique({ where: { saleId_productId: { saleId: body.saleId, productId: body.productId } } });
      if (existing) return reply.status(409).send({ message: "Este producto ya tiene una devolucion registrada." });

      const newStatus = mapReturnStatus(body.resultStatus);
      const productReturn = await tx.productReturn.create({
        data: {
          saleId: body.saleId,
          productId: body.productId,
          userId: request.user.sub,
          reason: body.reason,
          resultStatus: body.resultStatus,
          amount: saleItem.salePrice
        }
      });
      await tx.product.update({ where: { id: body.productId }, data: { status: newStatus, updatedById: request.user.sub } });
      await tx.inventoryMovement.create({
        data: {
          productId: body.productId,
          movementType: MovementType.RETURN,
          previousStatus: saleItem.product.status,
          newStatus,
          userId: request.user.sub,
          referenceType: "RETURN",
          referenceId: productReturn.id,
          observations: body.reason
        }
      });
      await tx.auditLog.create({
        data: {
          userId: request.user.sub,
          action: "RETURN",
          entity: "RETURN",
          entityId: productReturn.id,
          afterValues: { saleNumber: saleItem.sale.saleNumber, product: saleItem.product.internalCode, resultStatus: body.resultStatus }
        }
      });
      return productReturn;
    });
  });
}

function mapReturnStatus(status: ReturnResultStatus) {
  if (status === ReturnResultStatus.MAINTENANCE) return InventoryStatus.MAINTENANCE;
  if (status === ReturnResultStatus.REMOVED) return InventoryStatus.REMOVED;
  return InventoryStatus.AVAILABLE;
}

function normalizeCode(value: string) {
  const codeMatch = value.match(/^TN-?0*(\d+)$/i);
  if (codeMatch) return `TN-${codeMatch[1].padStart(5, "0")}`;
  return value;
}
