export const INVENTORY_STATUSES = {
  AVAILABLE: "Disponible",
  RESERVED: "Reservado",
  SOLD: "Vendido",
  MAINTENANCE: "Mantenimiento/Limpieza",
  REMOVED: "Retirado"
} as const;

export type InventoryStatus = keyof typeof INVENTORY_STATUSES;

export const ROLES = ["SUPER_ADMIN", "ADMIN", "SELLER"] as const;
export type RoleCode = (typeof ROLES)[number];

export const INITIAL_CONDITIONS = [
  "Premium",
  "Excelente",
  "Muy bueno",
  "Bueno",
  "Regular"
] as const;

export const PRODUCT_REQUIRED_FIELDS = [
  "internalCode",
  "brandName",
  "size",
  "conditionName",
  "purchaseCost",
  "salePrice",
  "inventoryStatus"
] as const;

