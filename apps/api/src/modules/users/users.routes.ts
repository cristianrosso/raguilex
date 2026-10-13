import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { RoleCode } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";

const createUserSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(3),
  email: z.string().email().optional(),
  password: z.string().min(8),
  role: z.nativeEnum(RoleCode).default(RoleCode.SELLER),
  active: z.boolean().default(true)
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  role: z.nativeEnum(RoleCode).optional(),
  active: z.boolean().optional()
});

export async function usersRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request) => {
    return prisma.user.findMany({
      where: request.user.role === RoleCode.ADMIN ? { role: { code: RoleCode.SELLER } } : undefined,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, username: true, email: true, active: true, createdAt: true, lastLogin: true, role: true }
    });
  });

  app.post("/", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const body = createUserSchema.parse(request.body);
    if (request.user.role !== RoleCode.SUPER_ADMIN && body.role !== RoleCode.SELLER) {
      return reply.status(403).send({ message: "Solo super admin puede crear administradores." });
    }

    const role = await prisma.role.findUniqueOrThrow({ where: { code: body.role } });
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        name: body.name,
        username: body.username,
        email: body.email,
        passwordHash,
        roleId: role.id,
        active: body.active
      },
      select: { id: true, name: true, username: true, email: true, active: true, role: true }
    });

    await prisma.auditLog.create({
      data: {
        userId: request.user.sub,
        action: "CREATE_USER",
        entity: "USER",
        entityId: user.id,
        afterValues: { id: user.id, username: user.username, role: user.role.code }
      }
    });

    return user;
  });

  app.patch("/:id", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateUserSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { id: params.id }, include: { role: true } });
    if (!existing) return reply.status(404).send({ message: "Usuario no encontrado." });
    if (request.user.role === RoleCode.ADMIN && existing.role.code !== RoleCode.SELLER) {
      return reply.status(403).send({ message: "Solo super admin puede administrar este usuario." });
    }
    if (request.user.role === RoleCode.ADMIN && body.role && body.role !== RoleCode.SELLER) {
      return reply.status(403).send({ message: "Solo super admin puede asignar administradores." });
    }

    const role = body.role ? await prisma.role.findUniqueOrThrow({ where: { code: body.role } }) : null;
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        email: body.email,
        active: body.active,
        roleId: role?.id
      },
      select: { id: true, name: true, username: true, email: true, active: true, lastLogin: true, role: true }
    });

    await prisma.auditLog.create({
      data: {
        userId: request.user.sub,
        action: body.active === false ? "DISABLE_USER" : "UPDATE_USER",
        entity: "USER",
        entityId: user.id,
        beforeValues: { active: existing.active, role: existing.role.code },
        afterValues: { active: user.active, role: user.role.code }
      }
    });

    return user;
  });
}
