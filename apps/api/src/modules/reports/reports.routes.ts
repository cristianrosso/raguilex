import type { FastifyInstance } from "fastify";
import { InventoryStatus, ReservationStatus, RoleCode, SaleStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});

export async function reportsRoutes(app: FastifyInstance) {
  app.get("/summary", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request) => {
    const query = querySchema.parse(request.query);
    const saleWhere = { createdAt: dateRange(query.from, query.to), status: SaleStatus.COMPLETED };
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const [statusCounts, inventoryValue, sales, soldItems, saleRows, movements, returns, activeReservations, productsWithoutPhoto, stagnantProducts, cashDifferences] = await Promise.all([
      prisma.product.groupBy({ by: ["status"], where: { active: true }, _count: { _all: true } }),
      prisma.product.aggregate({
        where: { active: true, status: { in: [InventoryStatus.AVAILABLE, InventoryStatus.RESERVED] } },
        _sum: { purchaseCost: true, salePrice: true }
      }),
      prisma.sale.aggregate({ where: saleWhere, _count: { _all: true }, _sum: { total: true, discount: true }, _avg: { total: true } }),
      prisma.saleItem.findMany({
        where: { sale: saleWhere },
        include: { sale: { include: { seller: true } }, product: { include: { brand: true } } }
      }),
      prisma.sale.findMany({
        where: saleWhere,
        take: 100,
        orderBy: { createdAt: "desc" },
        include: { seller: { select: { name: true, username: true } }, items: { include: { product: { include: { brand: true } } } } }
      }),
      prisma.inventoryMovement.findMany({ take: 100, orderBy: { createdAt: "desc" }, include: { product: true, user: true } }),
      prisma.productReturn.count({ where: { createdAt: dateRange(query.from, query.to) } }),
      prisma.reservation.count({ where: { status: ReservationStatus.ACTIVE } }),
      prisma.product.count({ where: { active: true, images: { none: {} } } }),
      prisma.product.findMany({
        take: 100,
        where: { active: true, status: { in: [InventoryStatus.AVAILABLE, InventoryStatus.RESERVED] }, createdAt: { lt: ninetyDaysAgo } },
        include: { brand: true, condition: true },
        orderBy: { createdAt: "asc" }
      }),
      prisma.cashSession.findMany({ where: { status: "CLOSED", difference: { not: 0 } }, take: 20, orderBy: { closedAt: "desc" } })
    ]);

    const byStatus = Object.fromEntries(statusCounts.map((item) => [item.status, item._count._all]));
    const profit = soldItems.reduce((total, item) => total + Number(item.salePrice) - Number(item.discount) - Number(item.purchaseCostSnapshot ?? 0), 0);
    const payments = summarizePayments(saleRows);

    return {
      inventory: {
        total: Object.values(byStatus).reduce((total, count) => total + Number(count), 0),
        available: byStatus.AVAILABLE ?? 0,
        sold: byStatus.SOLD ?? 0,
        reserved: byStatus.RESERVED ?? 0,
        maintenance: byStatus.MAINTENANCE ?? 0,
        removed: byStatus.REMOVED ?? 0,
        cost: inventoryValue._sum.purchaseCost ?? 0,
        potentialSale: inventoryValue._sum.salePrice ?? 0,
        potentialMargin: Number(inventoryValue._sum.salePrice ?? 0) - Number(inventoryValue._sum.purchaseCost ?? 0)
      },
      sales: {
        count: sales._count._all,
        products: soldItems.length,
        total: sales._sum.total ?? 0,
        todayTotal: sales._sum.total ?? 0,
        discounts: sales._sum.discount ?? 0,
        grossProfit: profit,
        averageTicket: sales._avg.total ?? 0
      },
      payments,
      topBrands: topBy(soldItems.map((item) => item.product.brand?.name ?? "Sin marca")),
      topSizes: topBy(soldItems.map((item) => item.product.size ?? "Sin talla")),
      topModels: topBy(soldItems.map((item) => item.product.model ?? "Sin modelo")),
      sizeAnalysis: sizeAnalysis(soldItems, byStatus),
      rotation: rotationBuckets(await prisma.product.findMany({ where: { active: true }, select: { createdAt: true, status: true } })),
      stagnantProducts,
      returns,
      activeReservations,
      alerts: [
        { type: "products_without_photo", label: "Productos sin fotografia", count: productsWithoutPhoto },
        { type: "active_reservations", label: "Reservas activas", count: activeReservations },
        { type: "expired_reservations", label: "Reservas vencidas", count: await prisma.reservation.count({ where: { status: ReservationStatus.ACTIVE, expiresAt: { lt: new Date() } } }) },
        { type: "stagnant_products", label: "Productos con mas de 90 dias", count: stagnantProducts.length },
        { type: "cash_differences", label: "Cierres con diferencia", count: cashDifferences.length }
      ],
      bySeller: summarizeSellers(soldItems),
      salesRows: saleRows,
      movements
    };
  });
}

function summarizePayments(sales: { paymentMethod: string | null; total: unknown }[]) {
  const base = {
    EFECTIVO: { label: "Efectivo", total: 0, count: 0 },
    QR_TRANSFERENCIA: { label: "QR/Transferencia", total: 0, count: 0 },
    TARJETA: { label: "Tarjeta", total: 0, count: 0 },
    OTRO: { label: "Otro", total: 0, count: 0 }
  };
  for (const sale of sales) {
    const key = (sale.paymentMethod ?? "OTRO") as keyof typeof base;
    const bucket = base[key] ?? base.OTRO;
    bucket.total += Number(sale.total ?? 0);
    bucket.count += 1;
  }
  return base;
}

function sizeAnalysis(items: { product: { size: string | null } }[], _byStatus: Record<string, number>) {
  const sold = new Map<string, number>();
  for (const item of items) sold.set(item.product.size ?? "Sin talla", (sold.get(item.product.size ?? "Sin talla") ?? 0) + 1);
  return [...sold.entries()].map(([size, soldCount]) => ({ size, sold: soldCount })).sort((a, b) => a.size.localeCompare(b.size));
}

function rotationBuckets(products: { createdAt: Date; status: InventoryStatus }[]) {
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "+90": 0 };
  const now = Date.now();
  for (const product of products.filter((item) => item.status !== InventoryStatus.SOLD)) {
    const days = Math.floor((now - product.createdAt.getTime()) / 86400000);
    if (days <= 30) buckets["0-30"] += 1;
    else if (days <= 60) buckets["31-60"] += 1;
    else if (days <= 90) buckets["61-90"] += 1;
    else buckets["+90"] += 1;
  }
  return buckets;
}

function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    gte: from ? new Date(`${from}T00:00:00-04:00`) : undefined,
    lte: to ? new Date(`${to}T23:59:59-04:00`) : undefined
  };
}

function topBy(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function summarizeSellers(items: { sale: { id: string; seller: { id: string; name: string; username: string }; total: unknown; discount: unknown } }[]) {
  const map = new Map<string, { seller: string; sales: Set<string>; products: number; total: number; discounts: number }>();
  for (const item of items) {
    const key = item.sale.seller.id;
    const current = map.get(key) ?? { seller: item.sale.seller.name, sales: new Set<string>(), products: 0, total: 0, discounts: 0 };
    current.sales.add(item.sale.id);
    current.products += 1;
    current.total += Number(item.sale.total ?? 0);
    current.discounts += Number(item.sale.discount ?? 0);
    map.set(key, current);
  }
  return [...map.values()].map((item) => ({
    seller: item.seller,
    sales: item.sales.size,
    products: item.products,
    total: item.total,
    discounts: item.discounts,
    averageTicket: item.sales.size ? item.total / item.sales.size : 0
  }));
}
