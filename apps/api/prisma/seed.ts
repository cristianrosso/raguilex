import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { InventoryStatus, MovementType, PrismaClient, RoleCode } from "@prisma/client";
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

type DemoProduct = {
  internalCode: string;
  brandName: string;
  model: string;
  size: string;
  color: string;
  conditionName: string;
  purchaseCost: number;
  salePrice: number;
  status?: InventoryStatus;
  barcode?: string;
  observations?: string;
};

const demoProducts: DemoProduct[] = [
  { internalCode: "TN-00001", brandName: "Nike", model: "Air Max 90", size: "40", color: "Blanco/Rojo", conditionName: "Excelente", purchaseCost: 210, salePrice: 360, barcode: "RGX-DEMO-001" },
  { internalCode: "TN-00002", brandName: "Adidas", model: "Forum Low", size: "41", color: "Blanco/Azul", conditionName: "Muy bueno", purchaseCost: 190, salePrice: 330, barcode: "RGX-DEMO-002" },
  { internalCode: "TN-00003", brandName: "Puma", model: "RS-X", size: "39", color: "Negro/Verde", conditionName: "Bueno", purchaseCost: 150, salePrice: 270, barcode: "RGX-DEMO-003" },
  { internalCode: "TN-00004", brandName: "Reebok", model: "Classic Leather", size: "38", color: "Blanco", conditionName: "Excelente", purchaseCost: 180, salePrice: 310, barcode: "RGX-DEMO-004" },
  { internalCode: "TN-00005", brandName: "New Balance", model: "574", size: "42", color: "Gris", conditionName: "Premium", purchaseCost: 240, salePrice: 420, barcode: "RGX-DEMO-005" },
  { internalCode: "TN-00006", brandName: "Nike", model: "Dunk Low", size: "37", color: "Negro/Blanco", conditionName: "Muy bueno", purchaseCost: 220, salePrice: 390, barcode: "RGX-DEMO-006" },
  { internalCode: "TN-00007", brandName: "Vans", model: "Old Skool", size: "40", color: "Negro", conditionName: "Bueno", purchaseCost: 120, salePrice: 230, barcode: "RGX-DEMO-007" },
  { internalCode: "TN-00008", brandName: "Converse", model: "Chuck Taylor", size: "39", color: "Rojo", conditionName: "Regular", purchaseCost: 95, salePrice: 180, barcode: "RGX-DEMO-008" },
  { internalCode: "TN-00009", brandName: "Jordan", model: "Air Jordan 1 Mid", size: "43", color: "Negro/Rojo", conditionName: "Premium", purchaseCost: 360, salePrice: 620, barcode: "RGX-DEMO-009" },
  { internalCode: "TN-00010", brandName: "Adidas", model: "Ultraboost", size: "42", color: "Azul", conditionName: "Excelente", purchaseCost: 260, salePrice: 450, barcode: "RGX-DEMO-010" },
  { internalCode: "TN-00011", brandName: "Asics", model: "Gel Lyte III", size: "41", color: "Crema", conditionName: "Muy bueno", purchaseCost: 170, salePrice: 310, barcode: "RGX-DEMO-011" },
  { internalCode: "TN-00012", brandName: "Fila", model: "Disruptor II", size: "38", color: "Blanco", conditionName: "Bueno", purchaseCost: 130, salePrice: 240, barcode: "RGX-DEMO-012" },
  { internalCode: "TN-00013", brandName: "Nike", model: "Pegasus", size: "44", color: "Negro", conditionName: "Excelente", purchaseCost: 200, salePrice: 350, barcode: "RGX-DEMO-013" },
  { internalCode: "TN-00014", brandName: "Under Armour", model: "HOVR Sonic", size: "40", color: "Gris/Azul", conditionName: "Muy bueno", purchaseCost: 160, salePrice: 295, barcode: "RGX-DEMO-014" },
  { internalCode: "TN-00015", brandName: "Adidas", model: "Samba OG", size: "39", color: "Negro/Blanco", conditionName: "Premium", purchaseCost: 230, salePrice: 410, status: InventoryStatus.RESERVED, barcode: "RGX-DEMO-015" },
  { internalCode: "TN-00016", brandName: "Puma", model: "Suede Classic", size: "41", color: "Azul Marino", conditionName: "Bueno", purchaseCost: 125, salePrice: 235, status: InventoryStatus.RESERVED, barcode: "RGX-DEMO-016" },
  { internalCode: "TN-00017", brandName: "Nike", model: "Blazer Mid", size: "42", color: "Blanco/Negro", conditionName: "Regular", purchaseCost: 140, salePrice: 260, status: InventoryStatus.MAINTENANCE, barcode: "RGX-DEMO-017", observations: "Producto demo en revision de limpieza." }
];

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

async function seedDemoProducts() {
  const [category, location, seedOwner] = await Promise.all([
    prisma.category.upsert({
      where: { name: "Tenis/Calzado" },
      update: {},
      create: { name: "Tenis/Calzado" }
    }),
    prisma.location.upsert({
      where: { name: "Raguilex Principal" },
      update: {},
      create: { name: "Raguilex Principal" }
    }),
    prisma.user.findFirst({ where: { username: process.env.ADMIN_USERNAME ?? "admin" } })
  ]);

  for (const item of demoProducts) {
    const [brand, condition] = await Promise.all([
      prisma.brand.upsert({
        where: { name: item.brandName },
        update: {},
        create: { name: item.brandName }
      }),
      prisma.productCondition.upsert({
        where: { name: item.conditionName },
        update: {},
        create: { name: item.conditionName }
      })
    ]);

    const existing = await prisma.product.findUnique({ where: { internalCode: item.internalCode } });
    const status = item.status ?? InventoryStatus.AVAILABLE;

    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          categoryId: category.id,
          brandId: brand.id,
          model: item.model,
          size: item.size,
          color: item.color,
          conditionId: condition.id,
          purchaseCost: item.purchaseCost,
          salePrice: item.salePrice,
          status,
          barcode: item.barcode,
          observations: item.observations,
          locationId: location.id,
          active: true,
          updatedById: seedOwner?.id
        }
      });
      continue;
    }

    const product = await prisma.product.create({
      data: {
        internalCode: item.internalCode,
        categoryId: category.id,
        brandId: brand.id,
        model: item.model,
        size: item.size,
        color: item.color,
        conditionId: condition.id,
        purchaseCost: item.purchaseCost,
        salePrice: item.salePrice,
        status,
        barcode: item.barcode,
        observations: item.observations,
        locationId: location.id,
        createdById: seedOwner?.id,
        updatedById: seedOwner?.id
      }
    });

    await prisma.inventoryMovement.create({
      data: {
        productId: product.id,
        movementType: MovementType.ENTRY,
        newStatus: product.status,
        userId: seedOwner?.id,
        referenceType: "DEMO_SEED",
        referenceId: product.id,
        observations: "Producto de prueba cargado por seed"
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: seedOwner?.id,
        action: "DEMO_PRODUCT_SEED",
        entity: "PRODUCT",
        entityId: product.id,
        afterValues: { internalCode: product.internalCode, status: product.status }
      }
    });
  }
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

  await seedDemoProducts();
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
