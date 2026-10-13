import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient, RoleCode } from "@prisma/client";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();
const currentDir = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: resolve(currentDir, "../../../.env") });

type SeedUser = {
  name: string;
  username: string;
  email: string | null;
  password: string | undefined;
  roleCode: RoleCode;
  placeholder?: string;
};

async function upsertSeedUser(user: SeedUser) {
  if (!user.password || user.password === user.placeholder) {
    console.warn(`Password no configurado para ${user.username}; se omite usuario.`);
    return;
  }

  const role = await prisma.role.findUniqueOrThrow({
    where: { code: user.roleCode }
  });
  const passwordHash = await bcrypt.hash(user.password, 12);

  await prisma.user.upsert({
    where: { username: user.username },
    update: {
      name: user.name,
      email: user.email,
      passwordHash,
      roleId: role.id,
      active: true
    },
    create: {
      name: user.name,
      username: user.username,
      email: user.email,
      passwordHash,
      roleId: role.id,
      active: true
    }
  });
}

async function main() {
  const roles = [
    { code: RoleCode.SUPER_ADMIN, name: "Super administrador" },
    { code: RoleCode.ADMIN, name: "Administrador" },
    { code: RoleCode.SELLER, name: "Vendedor" }
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role
    });
  }

  for (const name of ["Tenis/Calzado", "Ropa"]) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name }
    });
  }

  const conditions = [
    ["Premium", 10],
    ["Excelente", 20],
    ["Muy bueno", 30],
    ["Bueno", 40],
    ["Regular", 50]
  ] as const;

  for (const [name, sortOrder] of conditions) {
    await prisma.productCondition.upsert({
      where: { name },
      update: { sortOrder },
      create: { name, sortOrder }
    });
  }

  await prisma.location.upsert({
    where: { name: "Raguilex Principal" },
    update: {},
    create: { name: "Raguilex Principal" }
  });

  await prisma.internalCodeCounter.upsert({
    where: { prefix: "TN" },
    update: { lastNumber: { increment: 0 } },
    create: { prefix: "TN", lastNumber: 300 }
  });

  const seedUsers: SeedUser[] = [
    {
      name: process.env.SUPER_ADMIN_NAME ?? "RAGUILEX Super Admin",
      username: process.env.SUPER_ADMIN_USERNAME ?? "superadmin",
      email: process.env.SUPER_ADMIN_EMAIL ?? null,
      password: process.env.SUPER_ADMIN_PASSWORD,
      roleCode: RoleCode.SUPER_ADMIN,
      placeholder: "change-this-password"
    },
    {
      name: process.env.ADMIN_NAME ?? "RAGUILEX Administrador",
      username: process.env.ADMIN_USERNAME ?? "admin",
      email: process.env.ADMIN_EMAIL ?? "admin.operaciones@raguilex.local",
      password: process.env.ADMIN_PASSWORD,
      roleCode: RoleCode.ADMIN,
      placeholder: "change-admin-password"
    },
    {
      name: process.env.SELLER_NAME ?? "RAGUILEX Vendedor",
      username: process.env.SELLER_USERNAME ?? "vendedor",
      email: process.env.SELLER_EMAIL ?? "ventas@raguilex.local",
      password: process.env.SELLER_PASSWORD,
      roleCode: RoleCode.SELLER,
      placeholder: "change-seller-password"
    }
  ];

  for (const user of seedUsers) {
    await upsertSeedUser(user);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
