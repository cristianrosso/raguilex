import { mkdir, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join } from "node:path";
import type { FastifyInstance } from "fastify";
import { InventoryStatus, MovementType, RoleCode } from "@prisma/client";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "../../db/prisma.js";
import { nextInternalCode, previewNextInternalCode } from "./code.service.js";
import { config } from "../../config.js";
import { stripSellerFinancials } from "../security/sanitize.js";

const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z.nativeEnum(InventoryStatus).optional(),
  brand: z.string().optional(),
  size: z.string().optional(),
  category: z.string().optional(),
  condition: z.string().optional(),
  location: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(50)
});

const productCreateSchema = z.object({
  internalCode: z.string().regex(/^TN-\d{5}$/).optional(),
  brandName: z.string().min(1),
  model: z.string().optional(),
  size: z.string().min(1),
  color: z.string().optional(),
  conditionName: z.string().min(1),
  purchaseCost: z.coerce.number().nonnegative().optional(),
  salePrice: z.coerce.number().nonnegative().optional(),
  status: z.nativeEnum(InventoryStatus).default(InventoryStatus.AVAILABLE),
  barcode: z.string().optional(),
  observations: z.string().optional(),
  locationName: z.string().default("Raguilex Principal"),
  categoryName: z.string().default("Tenis/Calzado")
});

const productUpdateSchema = productCreateSchema.partial().extend({
  status: z.nativeEnum(InventoryStatus).optional()
});

export async function productsRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireAuth }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const search = normalizeSearch(query.q?.trim());

    const products = await prisma.product.findMany({
      take: query.take,
      where: {
        active: true,
        status: query.status,
        brand: query.brand ? { name: { equals: query.brand, mode: "insensitive" } } : undefined,
        size: query.size ? { equals: query.size, mode: "insensitive" } : undefined,
        category: query.category ? { name: { equals: query.category, mode: "insensitive" } } : undefined,
        condition: query.condition ? { name: { equals: query.condition, mode: "insensitive" } } : undefined,
        location: query.location ? { name: { equals: query.location, mode: "insensitive" } } : undefined,
        OR: search
          ? [
              { internalCode: { contains: search, mode: "insensitive" } },
              { model: { contains: search, mode: "insensitive" } },
              { size: { contains: search, mode: "insensitive" } },
              { color: { contains: search, mode: "insensitive" } },
              { barcode: { contains: search, mode: "insensitive" } },
              { brand: { name: { contains: search, mode: "insensitive" } } },
              { category: { name: { contains: search, mode: "insensitive" } } }
            ]
          : undefined
      },
      include: { brand: true, category: true, condition: true, location: true, images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] } },
      orderBy: { internalCode: "asc" }
    });
    return request.user.role === RoleCode.SELLER ? stripSellerFinancials(products) : products;
  });

  app.get("/next-code", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async () => {
    return { nextCodePreview: await previewNextInternalCode(prisma) };
  });

  app.post("/", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request) => {
    const body = productCreateSchema.parse(request.body);
    return createProduct(request.user.sub, body, "CREATE_PRODUCT");
  });

  app.post("/quick-entry", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request) => {
    const body = productCreateSchema.pick({
      brandName: true,
      size: true,
      color: true,
      purchaseCost: true,
      salePrice: true,
      barcode: true
    }).parse(request.body);
    return createProduct(request.user.sub, {
      ...body,
      categoryName: "Tenis/Calzado",
      conditionName: "Bueno",
      locationName: "Raguilex Principal",
      status: InventoryStatus.AVAILABLE
    }, "QUICK_ENTRY");
  });

  async function createProduct(userId: string, body: z.infer<typeof productCreateSchema>, auditAction: "CREATE_PRODUCT" | "QUICK_ENTRY") {
    return prisma.$transaction(async (tx) => {
      const [category, brand, condition, location] = await Promise.all([
        tx.category.upsert({ where: { name: body.categoryName }, update: {}, create: { name: body.categoryName } }),
        tx.brand.upsert({ where: { name: body.brandName }, update: {}, create: { name: body.brandName } }),
        tx.productCondition.upsert({ where: { name: body.conditionName }, update: {}, create: { name: body.conditionName } }),
        tx.location.upsert({ where: { name: body.locationName }, update: {}, create: { name: body.locationName } })
      ]);

      const internalCode = body.internalCode ?? (await nextInternalCode(tx));
      const product = await tx.product.create({
        data: {
          internalCode,
          categoryId: category.id,
          brandId: brand.id,
          model: body.model,
          size: body.size,
          color: body.color,
          conditionId: condition.id,
          purchaseCost: body.purchaseCost,
          salePrice: body.salePrice,
          status: body.status,
          barcode: body.barcode,
          observations: body.observations,
          locationId: location.id,
          createdById: userId,
          updatedById: userId
        },
        include: { brand: true, category: true, condition: true, location: true }
      });

      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          movementType: "ENTRY",
          newStatus: product.status,
          userId,
          referenceType: "PRODUCT",
          referenceId: product.id
        }
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: auditAction,
          entity: "PRODUCT",
          entityId: product.id,
          afterValues: { internalCode: product.internalCode, status: product.status }
        }
      });

      return product;
    });
  }

  app.get("/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const product = await prisma.product.findUnique({
      where: { id: params.id },
      include: {
        brand: true,
        category: true,
        condition: true,
        location: true,
        images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
        movements: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true, username: true } } } },
        createdBy: { select: { name: true, username: true } }
      }
    });
    if (!product) return reply.status(404).send({ message: "Producto no encontrado." });
    return request.user.role === RoleCode.SELLER ? stripSellerFinancials(product) : product;
  });

  app.put("/:id", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = productUpdateSchema.parse(request.body);

    if (body.status === InventoryStatus.SOLD) {
      return reply.status(409).send({ message: "Registra una venta para marcar el producto como vendido." });
    }

    return prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { id: params.id },
        include: { brand: true, category: true, condition: true, location: true }
      });
      if (!existing) return reply.status(404).send({ message: "Producto no encontrado." });

      const [category, brand, condition, location] = await Promise.all([
        body.categoryName ? tx.category.upsert({ where: { name: cleanName(body.categoryName) }, update: {}, create: { name: cleanName(body.categoryName) } }) : null,
        body.brandName ? tx.brand.upsert({ where: { name: cleanName(body.brandName) }, update: {}, create: { name: cleanName(body.brandName) } }) : null,
        body.conditionName ? tx.productCondition.upsert({ where: { name: cleanName(body.conditionName) }, update: {}, create: { name: cleanName(body.conditionName) } }) : null,
        body.locationName ? tx.location.upsert({ where: { name: cleanName(body.locationName) }, update: {}, create: { name: cleanName(body.locationName) } }) : null
      ]);

      const updated = await tx.product.update({
        where: { id: existing.id },
        data: {
          categoryId: category?.id,
          brandId: brand?.id,
          conditionId: condition?.id,
          locationId: location?.id,
          model: body.model,
          size: body.size,
          color: body.color,
          purchaseCost: body.purchaseCost,
          salePrice: body.salePrice,
          status: body.status,
          barcode: body.barcode,
          observations: body.observations,
          updatedById: request.user.sub
        },
        include: { brand: true, category: true, condition: true, location: true, images: true }
      });

      if (body.status && body.status !== existing.status) {
        await tx.inventoryMovement.create({
          data: {
            productId: existing.id,
            movementType: MovementType.ADJUSTMENT,
            previousStatus: existing.status,
            newStatus: body.status,
            userId: request.user.sub,
            referenceType: "PRODUCT_EDIT",
            referenceId: existing.id,
            observations: "Cambio de estado desde edicion"
          }
        });
      }

      await tx.auditLog.create({
        data: {
          userId: request.user.sub,
          action: "UPDATE_PRODUCT",
          entity: "PRODUCT",
          entityId: existing.id,
          beforeValues: {
            brand: existing.brand?.name,
            model: existing.model,
            size: existing.size,
            status: existing.status,
            salePrice: existing.salePrice
          },
          afterValues: {
            brand: updated.brand?.name,
            model: updated.model,
            size: updated.size,
            status: updated.status,
            salePrice: updated.salePrice
          }
        }
      });
      if (body.salePrice !== undefined && Number(body.salePrice) !== Number(existing.salePrice ?? 0)) {
        await tx.auditLog.create({
          data: {
            userId: request.user.sub,
            action: "PRICE_CHANGE",
            entity: "PRODUCT",
            entityId: existing.id,
            beforeValues: { salePrice: existing.salePrice },
            afterValues: { salePrice: updated.salePrice }
          }
        });
      }
      if (body.purchaseCost !== undefined && Number(body.purchaseCost) !== Number(existing.purchaseCost ?? 0)) {
        await tx.auditLog.create({
          data: {
            userId: request.user.sub,
            action: "COST_CHANGE",
            entity: "PRODUCT",
            entityId: existing.id,
            beforeValues: { purchaseCost: existing.purchaseCost },
            afterValues: { purchaseCost: updated.purchaseCost }
          }
        });
      }

      return updated;
    });
  });

  app.patch("/:id", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (_request, reply) => {
    return reply.status(405).send({ message: "Usa PUT para editar productos." });
  });

  app.delete("/:id", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const product = await prisma.product.findUnique({ where: { id: params.id } });
    if (!product) return reply.status(404).send({ message: "Producto no encontrado." });
    if (product.status === InventoryStatus.SOLD) return reply.status(409).send({ message: "No se puede desactivar un producto vendido." });
    const updated = await prisma.product.update({ where: { id: product.id }, data: { active: false, updatedById: request.user.sub } });
    await prisma.auditLog.create({
      data: {
        userId: request.user.sub,
        action: "DISABLE_PRODUCT",
        entity: "PRODUCT",
        entityId: product.id,
        beforeValues: { active: product.active },
        afterValues: { active: updated.active }
      }
    });
    return { ok: true };
  });

  app.post("/:id/images", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const product = await prisma.product.findUnique({ where: { id: params.id }, include: { images: true } });
    if (!product) return reply.status(404).send({ message: "Producto no encontrado." });

    const part = await request.file();
    if (!part) return reply.status(400).send({ message: "Selecciona una fotografia." });
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(part.mimetype)) return reply.status(400).send({ message: "Solo se aceptan imagenes JPEG, PNG o WEBP." });
    const buffer = await part.toBuffer();
    if (!hasAllowedImageSignature(buffer, part.mimetype)) {
      return reply.status(400).send({ message: "El contenido del archivo no corresponde a una imagen permitida." });
    }

    const productDir = join(config.UPLOAD_DIR, "products", product.id);
    await mkdir(productDir, { recursive: true });
    const extension = extname(part.filename) || ".jpg";
    const fileName = `${nanoid(12)}${extension}`;
    const filePath = join(productDir, fileName);
    await writeFile(filePath, buffer);

    const image = await prisma.productImage.create({
      data: {
        productId: product.id,
        imageUrl: `/products/${product.id}/images/${fileName}`,
        isPrimary: product.images.length === 0,
        sortOrder: product.images.length
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: request.user.sub,
        action: "ADD_IMAGE",
        entity: "PRODUCT",
        entityId: product.id,
        afterValues: { imageId: image.id }
      }
    });

    return image;
  });

  app.put("/:id/images/:imageId/primary", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid(), imageId: z.string().uuid() }).parse(request.params);
    const image = await prisma.productImage.findFirst({ where: { id: params.imageId, productId: params.id } });
    if (!image) return reply.status(404).send({ message: "Fotografia no encontrada." });

    await prisma.productImage.updateMany({ where: { productId: params.id }, data: { isPrimary: false } });
    return prisma.productImage.update({ where: { id: params.imageId }, data: { isPrimary: true } });
  });

  app.get("/:id/images/:fileName", async (request, reply) => {
    const params = z.object({ id: z.string().uuid(), fileName: z.string().min(1) }).parse(request.params);
    const image = await prisma.productImage.findFirst({
      where: { productId: params.id, imageUrl: `/products/${params.id}/images/${params.fileName}` }
    });
    if (!image) return reply.status(404).send({ message: "Fotografia no encontrada." });
    return reply.send(createReadStream(join(config.UPLOAD_DIR, "products", params.id, params.fileName)));
  });
}

function normalizeSearch(value?: string) {
  if (!value) return undefined;
  const codeMatch = value.match(/^TN-?0*(\d+)$/i);
  if (codeMatch) return `TN-${codeMatch[1].padStart(5, "0")}`;
  return value;
}

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function hasAllowedImageSignature(buffer: Buffer, mimetype: string) {
  if (mimetype === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimetype === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}
