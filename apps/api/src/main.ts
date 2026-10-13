import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { RoleCode } from "@prisma/client";
import { config, webOrigins } from "./config.js";
import { prisma } from "./db/prisma.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { productsRoutes } from "./modules/products/products.routes.js";
import { importRoutes } from "./modules/import/import.routes.js";
import { auditRoutes } from "./modules/audit/audit.routes.js";
import { cashRoutes } from "./modules/cash/cash.routes.js";
import { inventoryRoutes } from "./modules/inventory/inventory.routes.js";
import { qrRoutes } from "./modules/qr/qr.routes.js";
import { reportsRoutes } from "./modules/reports/reports.routes.js";
import { reservationsRoutes } from "./modules/reservations/reservations.routes.js";
import { returnsRoutes } from "./modules/returns/returns.routes.js";
import { salesRoutes } from "./modules/sales/sales.routes.js";
import { settingsRoutes } from "./modules/settings/settings.routes.js";
import { usersRoutes } from "./modules/users/users.routes.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin || webOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origen no permitido por CORS"), false);
  },
  credentials: true
});
await app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024 }
});
await app.register(rateLimit, {
  global: false,
  max: 60,
  timeWindow: "1 minute"
});
await app.register(authPlugin);

app.get("/health", async () => ({ ok: true, service: "raguilex-api" }));
app.get("/health/internal", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN]) }, async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { ok: true, service: "raguilex-api", database: "ok", storage: config.UPLOAD_DIR };
});
await app.register(authRoutes, { prefix: "/auth" });
await app.register(dashboardRoutes, { prefix: "/dashboard" });
await app.register(productsRoutes, { prefix: "/products" });
await app.register(importRoutes, { prefix: "/import" });
await app.register(inventoryRoutes, { prefix: "/inventory" });
await app.register(qrRoutes, { prefix: "/qr" });
await app.register(reportsRoutes, { prefix: "/reports" });
await app.register(salesRoutes, { prefix: "/sales" });
await app.register(cashRoutes, { prefix: "/cash" });
await app.register(reservationsRoutes, { prefix: "/reservations" });
await app.register(returnsRoutes, { prefix: "/returns" });
await app.register(settingsRoutes, { prefix: "/settings" });
await app.register(usersRoutes, { prefix: "/users" });
await app.register(auditRoutes, { prefix: "/audit" });

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
