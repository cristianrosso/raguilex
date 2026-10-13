import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10),
  confirmPassword: z.string().min(10)
}).refine((body) => body.newPassword === body.confirmPassword, "La confirmacion no coincide.");

export async function authRoutes(app: FastifyInstance) {
  app.post("/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const identifier = body.username.trim();
    const user = await prisma.user.findUnique({
      where: identifier.includes("@") ? { email: identifier } : { username: identifier },
      include: { role: true }
    });

    if (!user || !user.active) {
      await prisma.auditLog.create({
        data: {
          action: "LOGIN_FAILED",
          entity: "AUTH",
          afterValues: { username: identifier, reason: !user ? "not_found" : "inactive" },
          ipAddress: request.ip
        }
      });
      return reply.status(401).send({ message: "Usuario o contrasena incorrectos." });
    }

    const validPassword = await bcrypt.compare(body.password, user.passwordHash);
    if (!validPassword) {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "LOGIN_FAILED",
          entity: "USER",
          entityId: user.id,
          afterValues: { reason: "invalid_password" },
          ipAddress: request.ip
        }
      });
      return reply.status(401).send({ message: "Usuario o contrasena incorrectos." });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "LOGIN",
        entity: "USER",
        entityId: user.id,
        ipAddress: request.ip
      }
    });

    const token = app.jwt.sign({
      sub: user.id,
      role: user.role.code,
      username: user.username
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role.code
      }
    };
  });

  app.get("/me", { preHandler: app.requireAuth }, async (request) => request.user);

  app.post("/change-password", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = changePasswordSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user) return reply.status(404).send({ message: "Usuario no encontrado." });

    const validPassword = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!validPassword) return reply.status(401).send({ message: "La contrasena actual no es correcta." });

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(body.newPassword, 12) }
    });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CHANGE_PASSWORD",
        entity: "USER",
        entityId: user.id,
        ipAddress: request.ip
      }
    });

    return { ok: true };
  });
}
