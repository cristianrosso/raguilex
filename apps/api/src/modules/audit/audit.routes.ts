import type { FastifyInstance } from "fastify";
import { RoleCode } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

export async function auditRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN]) }, async () => {
    return prisma.auditLog.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, username: true, role: true } } }
    });
  });
}
