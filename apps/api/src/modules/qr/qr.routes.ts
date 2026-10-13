import type { FastifyInstance } from "fastify";
import QRCode from "qrcode";
import { RoleCode } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { stripSellerFinancials } from "../security/sanitize.js";

export async function qrRoutes(app: FastifyInstance) {
  app.get("/resolve/:token", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = z.object({ token: z.string().min(1) }).parse(request.params);
    const token = normalizeQrInput(params.token);
    const product = await prisma.product.findUnique({
      where: { qrToken: token },
      include: { brand: true, category: true, condition: true, location: true, images: true, saleItems: { include: { sale: true } } }
    });
    if (!product || !product.active) return reply.status(404).send({ message: "Producto no encontrado." });
    return request.user.role === RoleCode.SELLER ? stripSellerFinancials(product) : product;
  });

  app.get("/code/:code", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = z.object({ code: z.string().min(1) }).parse(request.params);
    const product = await prisma.product.findUnique({
      where: { internalCode: normalizeCode(params.code) },
      include: { brand: true, category: true, condition: true, location: true, images: true, saleItems: { include: { sale: true } } }
    });
    if (!product || !product.active) return reply.status(404).send({ message: "Producto no encontrado." });
    return request.user.role === RoleCode.SELLER ? stripSellerFinancials(product) : product;
  });

  app.get("/product/:id", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const product = await prisma.product.findUnique({ where: { id: params.id }, include: { brand: true, condition: true } });
    if (!product) return reply.status(404).send({ message: "Producto no encontrado." });
    const scanUrl = `/scan/${product.qrToken}`;
    const svg = await QRCode.toString(scanUrl, { type: "svg", margin: 1, width: 260 });
    return {
      scanUrl,
      qrToken: product.qrToken,
      svg,
      label: {
        title: "RAGUILEX",
        code: product.internalCode,
        product: `${product.brand?.name ?? ""} ${product.model ?? ""}`.trim(),
        size: product.size,
        condition: product.condition?.name
      }
    };
  });
}

function normalizeQrInput(value: string) {
  const match = value.match(/\/scan\/([0-9a-f-]{36})/i);
  return match?.[1] ?? value;
}

function normalizeCode(value: string) {
  const codeMatch = value.match(/^TN-?0*(\d+)$/i);
  if (codeMatch) return `TN-${codeMatch[1].padStart(5, "0")}`;
  return value;
}
