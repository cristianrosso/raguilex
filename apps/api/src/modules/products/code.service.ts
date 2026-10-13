import type { Prisma, PrismaClient } from "@prisma/client";

type CodeRow = { next_internal_code: string };
type RawQueryable = Pick<PrismaClient | Prisma.TransactionClient, "$queryRaw">;

export async function nextInternalCode(prisma: RawQueryable, prefix = "TN") {
  const result = await prisma.$queryRaw<CodeRow[]>`SELECT next_internal_code(${prefix})`;
  return result[0]?.next_internal_code;
}

export async function previewNextInternalCode(prisma: PrismaClient, prefix = "TN") {
  const counter = await prisma.internalCodeCounter.findUnique({ where: { prefix } });
  const nextNumber = (counter?.lastNumber ?? 0) + 1;
  return `${prefix}-${String(nextNumber).padStart(5, "0")}`;
}
