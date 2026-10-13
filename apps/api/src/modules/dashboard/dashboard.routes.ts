import type { FastifyInstance } from "fastify";
import { InventoryStatus, RoleCode } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireAuth }, async (request) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    if (request.user.role === RoleCode.SELLER) {
      const [available, reserved, mySalesToday, mySoldToday] = await Promise.all([
        prisma.product.count({ where: { status: InventoryStatus.AVAILABLE, active: true } }),
        prisma.product.count({ where: { status: InventoryStatus.RESERVED, active: true } }),
        prisma.sale.aggregate({ where: { sellerId: request.user.sub, createdAt: { gte: todayStart } }, _sum: { total: true } }),
        prisma.saleItem.count({
          where: {
            sale: {
              sellerId: request.user.sub,
              createdAt: { gte: todayStart }
            }
          }
        })
      ]);

      return {
        role: request.user.role,
        products: { available, reserved },
        seller: {
          salesToday: mySalesToday._sum.total ?? 0,
          soldToday: mySoldToday
        }
      };
    }

    const [available, reserved, sold, soldToday, recentProducts, latestSold] = await Promise.all([
      prisma.product.count({ where: { status: InventoryStatus.AVAILABLE, active: true } }),
      prisma.product.count({ where: { status: InventoryStatus.RESERVED, active: true } }),
      prisma.product.count({ where: { status: InventoryStatus.SOLD, active: true } }),
      prisma.saleItem.count({ where: { sale: { createdAt: { gte: todayStart } } } }),
      prisma.product.findMany({
        take: 10,
        where: { active: true },
        orderBy: { createdAt: "desc" },
        include: { brand: true }
      }),
      prisma.product.findMany({
        take: 10,
        where: { active: true, status: InventoryStatus.SOLD },
        orderBy: { updatedAt: "desc" },
        include: { brand: true }
      })
    ]);

    const totals = await prisma.product.aggregate({
      where: { active: true, status: { in: [InventoryStatus.AVAILABLE, InventoryStatus.RESERVED] } },
      _sum: { purchaseCost: true, salePrice: true }
    });

    const [salesToday, salesMonth, soldItemsToday, soldItemsMonth] = await Promise.all([
      prisma.sale.aggregate({ where: { createdAt: { gte: todayStart } }, _sum: { total: true } }),
      prisma.sale.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { total: true } }),
      prisma.saleItem.findMany({ where: { sale: { createdAt: { gte: todayStart } } }, select: { salePrice: true, discount: true, purchaseCostSnapshot: true } }),
      prisma.saleItem.findMany({ where: { sale: { createdAt: { gte: monthStart } } }, select: { salePrice: true, discount: true, purchaseCostSnapshot: true } })
    ]);

    return {
      role: request.user.role,
      products: { available, reserved, sold, soldToday },
      inventoryValue: {
        purchaseCost: totals._sum.purchaseCost ?? 0,
        potentialSale: totals._sum.salePrice ?? 0,
        potentialMargin: Number(totals._sum.salePrice ?? 0) - Number(totals._sum.purchaseCost ?? 0)
      },
      sales: {
        today: salesToday._sum.total ?? 0,
        month: salesMonth._sum.total ?? 0,
        profitToday: grossProfit(soldItemsToday),
        profitMonth: grossProfit(soldItemsMonth)
      },
      recentProducts,
      latestSold
    };
  });
}

function grossProfit(items: { salePrice: unknown; discount: unknown; purchaseCostSnapshot: unknown }[]) {
  return items.reduce((total, item) => {
    return total + Number(item.salePrice ?? 0) - Number(item.discount ?? 0) - Number(item.purchaseCostSnapshot ?? 0);
  }, 0);
}
