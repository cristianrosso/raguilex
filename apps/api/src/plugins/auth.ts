import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { RoleCode } from "@prisma/client";
import { config } from "../config.js";

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRoles: (roles: RoleCode[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: RoleCode; username: string };
    user: { sub: string; role: RoleCode; username: string };
  }
}

export const authPlugin = fp(async (app) => {
  await app.register(jwt, { secret: config.JWT_SECRET });

  app.decorate("requireAuth", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: "Sesion requerida." });
    }
  });

  app.decorate("requireRoles", (roles) => {
    return async (request, reply) => {
      await app.requireAuth(request, reply);
      if (reply.sent) return;
      if (!roles.includes(request.user.role)) {
        return reply.status(403).send({ message: "No tienes permiso para esta accion." });
      }
    };
  });
});

