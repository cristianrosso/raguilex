import type { FastifyInstance } from "fastify";
import { RoleCode } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/catalogs", { preHandler: app.requireAuth }, async () => {
    const [roles, categories, brands, conditions, locations] = await Promise.all([
      prisma.role.findMany({ orderBy: { name: "asc" } }),
      prisma.category.findMany({ orderBy: { name: "asc" } }),
      prisma.brand.findMany({ orderBy: { name: "asc" } }),
      prisma.productCondition.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.location.findMany({ orderBy: { name: "asc" } })
    ]);

    return { roles, categories, brands, conditions, locations };
  });

  app.get("/audit", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN]) }, async () => {
    return prisma.auditLog.findMany({ take: 100, orderBy: { createdAt: "desc" } });
  });

  app.get("/system", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN]) }, async () => {
    const rows = await prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  });

  app.put("/system", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN]) }, async (request) => {
    const body = request.body as Record<string, unknown>;
    const allowedKeys = ["company", "inventory", "sales", "reservations", "locations"];
    for (const key of allowedKeys) {
      if (body[key] === undefined) continue;
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: body[key] as object, updatedBy: request.user.sub },
        create: { key, value: body[key] as object, updatedBy: request.user.sub }
      });
    }
    await prisma.auditLog.create({
      data: {
        userId: request.user.sub,
        action: "SETTINGS_CHANGE",
        entity: "SYSTEM_SETTINGS",
        afterValues: { keys: Object.keys(body).filter((key) => allowedKeys.includes(key)) }
      }
    });
    const rows = await prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  });
}
