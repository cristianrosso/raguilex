import type { FastifyInstance } from "fastify";
import { CashMovementType, CashSessionStatus, RoleCode, SaleStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";

const moneySchema = z.coerce.number().nonnegative();
const openSchema = z.object({
  openingAmount: moneySchema,
  observations: z.string().optional()
});
const movementSchema = z.object({
  type: z.nativeEnum(CashMovementType),
  amount: z.coerce.number().positive(),
  method: z.enum(["EFECTIVO", "QR_TRANSFERENCIA", "TARJETA", "OTRO"]).default("EFECTIVO"),
  concept: z.string().min(2),
  reason: z.string().min(3)
});
const closeSchema = z.object({
  countedAmount: moneySchema,
  closeNotes: z.string().optional()
});

export async function cashRoutes(app: FastifyInstance) {
  app.get("/current", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async () => {
    const session = await openSession();
    if (!session) return { session: null };
    return { session: await decorateSession(session.id) };
  });

  app.get("/history", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async () => {
    return prisma.cashSession.findMany({
      take: 50,
      orderBy: { openedAt: "desc" },
      include: {
        openedBy: { select: { name: true, username: true } },
        closedBy: { select: { name: true, username: true } },
        movements: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true, username: true } } } }
      }
    });
  });

  app.post("/open", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const body = openSchema.parse(request.body);
    const existing = await openSession();
    if (existing) {
      return reply.status(409).send({
        message: "Ya existe una caja abierta.",
        session: await decorateSession(existing.id)
      });
    }

    const session = await prisma.cashSession.create({
      data: {
        openedById: request.user.sub,
        openingAmount: body.openingAmount,
        observations: body.observations
      }
    });
    await audit(request.user.sub, "CASH_OPEN", "CASH_SESSION", session.id, { openingAmount: body.openingAmount });
    return decorateSession(session.id);
  });

  app.post("/movements", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const body = movementSchema.parse(request.body);
    const session = await openSession();
    if (!session) return reply.status(409).send({ message: "Debes abrir caja antes de registrar movimientos." });

    const movement = await prisma.cashMovement.create({
      data: {
        sessionId: session.id,
        userId: request.user.sub,
        type: body.type,
        amount: body.amount,
        method: body.method,
        concept: body.concept,
        reason: body.reason
      }
    });
    await audit(request.user.sub, `CASH_${body.type}`, "CASH_MOVEMENT", movement.id, body);
    return decorateSession(session.id);
  });

  app.post("/close", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const body = closeSchema.parse(request.body);
    const session = await openSession();
    if (!session) return reply.status(409).send({ message: "No hay una caja abierta para cerrar." });

    const summary = await cashSummary(session.openedAt, new Date(), session.id);
    const difference = body.countedAmount - summary.expectedCash;
    if (difference !== 0 && !body.closeNotes?.trim()) {
      return reply.status(400).send({ message: "La observacion es obligatoria cuando existe diferencia de caja." });
    }

    const closed = await prisma.cashSession.update({
      where: { id: session.id },
      data: {
        status: CashSessionStatus.CLOSED,
        closedById: request.user.sub,
        countedAmount: body.countedAmount,
        expectedCash: summary.expectedCash,
        cashSales: summary.cashSales,
        digitalSales: summary.digitalSales,
        otherSales: summary.otherSales,
        incomeCash: summary.incomeCash,
        expenseCash: summary.expenseCash,
        difference,
        closeNotes: body.closeNotes,
        closedAt: new Date()
      }
    });
    await audit(request.user.sub, "CASH_CLOSE", "CASH_SESSION", closed.id, { ...summary, countedAmount: body.countedAmount, difference });
    return decorateSession(closed.id);
  });
}

async function openSession() {
  return prisma.cashSession.findFirst({
    where: { status: CashSessionStatus.OPEN },
    orderBy: { openedAt: "desc" }
  });
}

async function decorateSession(sessionId: string) {
  const session = await prisma.cashSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      openedBy: { select: { name: true, username: true } },
      closedBy: { select: { name: true, username: true } },
      movements: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true, username: true } } } }
    }
  });
  const to = session.closedAt ?? new Date();
  return { ...session, summary: await cashSummary(session.openedAt, to, session.id) };
}

async function cashSummary(from: Date, to: Date, sessionId: string) {
  const [sales, movements] = await Promise.all([
    prisma.sale.groupBy({
      by: ["paymentMethod"],
      where: { createdAt: { gte: from, lte: to }, status: SaleStatus.COMPLETED },
      _sum: { total: true }
    }),
    prisma.cashMovement.findMany({ where: { sessionId } })
  ]);
  const cashSales = sumByPayment(sales, "EFECTIVO");
  const digitalSales = sumByPayment(sales, "QR_TRANSFERENCIA");
  const otherSales = sumByPayment(sales, "TARJETA") + sumByPayment(sales, "OTRO");
  const incomeCash = movements.filter((item) => item.type === CashMovementType.INCOME && item.method === "EFECTIVO").reduce((total, item) => total + Number(item.amount), 0);
  const expenseCash = movements.filter((item) => item.type === CashMovementType.EXPENSE && item.method === "EFECTIVO").reduce((total, item) => total + Number(item.amount), 0);
  const session = await prisma.cashSession.findUniqueOrThrow({ where: { id: sessionId }, select: { openingAmount: true } });
  return {
    cashSales,
    digitalSales,
    otherSales,
    incomeCash,
    expenseCash,
    expectedCash: Number(session.openingAmount) + cashSales + incomeCash - expenseCash
  };
}

function sumByPayment(rows: { paymentMethod: string | null; _sum: { total: unknown } }[], method: string) {
  return rows.filter((row) => row.paymentMethod === method).reduce((total, row) => total + Number(row._sum.total ?? 0), 0);
}

async function audit(userId: string, action: string, entity: string, entityId: string, afterValues?: unknown) {
  await prisma.auditLog.create({ data: { userId, action, entity, entityId, afterValues: afterValues as object } });
}
