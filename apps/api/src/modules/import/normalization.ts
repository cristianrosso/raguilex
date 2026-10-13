import { InventoryStatus } from "@prisma/client";

export type Severity = "INFO" | "WARN" | "ERROR";

export type ImportIssue = {
  sheet: string;
  excelRow: number;
  field: string;
  originalValue: unknown;
  normalizedValue: unknown;
  severity: Severity;
  action: string;
};

export type NormalizedProductRow = {
  sourceSheet: string;
  sourceExcelRow: number;
  rowKind: "product_candidate" | "placeholder_code_only";
  internalCode: string | null;
  categoryName: string;
  brandName: string | null;
  model: string | null;
  size: string | null;
  color: string | null;
  conditionName: string | null;
  purchaseCost: string | null;
  salePrice: string | null;
  currency: "BOB";
  inventoryStatus: InventoryStatus | null;
  barcode: string | null;
  origin: string | null;
  entryDate: string | null;
  locationName: string;
  observations: string | null;
  imageFilename: string | null;
  originalPayload: Record<string, unknown>;
  issues: ImportIssue[];
};

const codePattern = /^TN-\d{5}$/i;
const moneyWordPattern = /(bs\.?|bob|bolivianos?)/gi;

export function normalizeHeader(value: unknown) {
  const text = cleanText(value) ?? "";
  return removeAccents(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "sin_nombre";
}

export function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

export function removeAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeBrand(value: unknown) {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const key = removeAccents(cleaned).toLowerCase();
  const known: Record<string, string> = {
    nike: "Nike",
    adidas: "Adidas",
    puma: "Puma",
    reebok: "Reebok",
    vans: "Vans",
    converse: "Converse",
    fila: "Fila",
    "new balance": "New Balance",
    "under armour": "Under Armour",
    jordan: "Jordan",
    asics: "Asics"
  };
  return known[key] ?? key.split(" ").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function normalizeCondition(value: unknown) {
  const cleaned = cleanText(value);
  if (!cleaned) return { value: null, unknown: false };
  const key = removeAccents(cleaned).toLowerCase();
  const mapping: Record<string, string> = {
    premium: "Premium",
    excelente: "Excelente",
    exelente: "Excelente",
    "10/10 - como nuevo": "Premium",
    "9/10 - excelente": "Excelente",
    "8/10 - muy bueno": "Muy bueno",
    "7/10 - bueno": "Bueno",
    "6/10 - regular": "Regular",
    "muy bueno": "Muy bueno",
    "muy buena": "Muy bueno",
    bueno: "Bueno",
    buena: "Bueno",
    regular: "Regular"
  };
  return mapping[key] ? { value: mapping[key], unknown: false } : { value: cleaned, unknown: true };
}

export function normalizeStatus(value: unknown) {
  const cleaned = cleanText(value);
  if (!cleaned) return { value: null, label: null, unknown: false };
  const key = removeAccents(cleaned).toLowerCase();
  const mapping: Record<string, { value: InventoryStatus; label: string }> = {
    disponible: { value: InventoryStatus.AVAILABLE, label: "Disponible" },
    available: { value: InventoryStatus.AVAILABLE, label: "Disponible" },
    reservado: { value: InventoryStatus.RESERVED, label: "Reservado" },
    reserved: { value: InventoryStatus.RESERVED, label: "Reservado" },
    vendido: { value: InventoryStatus.SOLD, label: "Vendido" },
    sold: { value: InventoryStatus.SOLD, label: "Vendido" },
    "en limpieza": { value: InventoryStatus.MAINTENANCE, label: "Mantenimiento/Limpieza" },
    limpieza: { value: InventoryStatus.MAINTENANCE, label: "Mantenimiento/Limpieza" },
    "en reparacion": { value: InventoryStatus.MAINTENANCE, label: "Mantenimiento/Limpieza" },
    mantenimiento: { value: InventoryStatus.MAINTENANCE, label: "Mantenimiento/Limpieza" },
    baja: { value: InventoryStatus.REMOVED, label: "Retirado" },
    retirado: { value: InventoryStatus.REMOVED, label: "Retirado" },
    removed: { value: InventoryStatus.REMOVED, label: "Retirado" }
  };
  return mapping[key] ? { ...mapping[key], unknown: false } : { value: null, label: cleaned, unknown: true };
}

export function parseMoney(value: unknown) {
  if (value === null || value === undefined || value === "") return { value: null, invalid: false };
  if (typeof value === "number" && Number.isFinite(value)) return { value: value.toFixed(2), invalid: false };

  const raw = String(value).trim();
  if (!raw) return { value: null, invalid: false };
  let cleaned = raw.replace(moneyWordPattern, "");
  if (/[A-Za-z]/.test(cleaned)) return { value: null, invalid: true };
  cleaned = cleaned.replace(/\s+/g, "");
  if (cleaned.includes(",") && cleaned.includes(".")) {
    cleaned = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else {
    cleaned = cleaned.replace(",", ".");
  }
  cleaned = cleaned.replace(/[^0-9.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? { value: number.toFixed(2), invalid: false } : { value: null, invalid: true };
}

export function normalizeProductRow(sheet: string, excelRow: number, raw: Record<string, unknown>): NormalizedProductRow {
  const issues: ImportIssue[] = [];
  const nonCodeValues = Object.entries(raw).filter(([key, value]) => key !== "codigo_interno" && cleanText(value) !== null);
  const rowKind = nonCodeValues.length === 0 ? "placeholder_code_only" : "product_candidate";

  const internalCode = cleanText(raw.codigo_interno)?.toUpperCase() ?? null;
  if (!internalCode) pushIssue("codigo_interno", raw.codigo_interno, null, "ERROR", "codigo_faltante");
  if (internalCode && !codePattern.test(internalCode)) {
    pushIssue("codigo_interno", raw.codigo_interno, internalCode, "ERROR", "codigo_formato_no_estandar");
  }

  const brandName = normalizeBrand(raw.marca);
  const model = cleanText(raw.modelo_linea);
  const size = cleanText(raw.talla);
  const color = cleanText(raw.color);
  const condition = normalizeCondition(raw.condicion);
  const purchaseCost = parseMoney(raw.costo_compra_bs);
  const salePrice = parseMoney(raw.precio_venta_bs);
  const status = normalizeStatus(raw.estado);
  const barcode = cleanText(raw.codigo_original_opcional);
  const origin = cleanText(raw.origen);
  const locationName = cleanText(raw.ubicacion) ?? "Raguilex Principal";
  const observations = cleanText(raw.descripcion_observaciones);
  const imageFilename = cleanText(raw.nombre_archivo_foto_opcional);
  const entryDate = normalizeDate(raw.fecha_ingreso);

  if (condition.unknown) pushIssue("condicion", raw.condicion, condition.value, "WARN", "condicion_requiere_revision");
  if (purchaseCost.invalid) pushIssue("costo_compra_bs", raw.costo_compra_bs, null, "ERROR", "costo_no_numerico");
  if (salePrice.invalid) pushIssue("precio_venta_bs", raw.precio_venta_bs, null, "ERROR", "precio_no_numerico");
  if (status.unknown) pushIssue("estado", raw.estado, status.label, "ERROR", "estado_inventario_invalido");

  if (rowKind === "product_candidate") {
    const required: Array<[string, unknown]> = [
      ["marca", brandName],
      ["talla", size],
      ["condicion", condition.value],
      ["costo_compra_bs", purchaseCost.value],
      ["precio_venta_bs", salePrice.value],
      ["estado", status.value]
    ];
    for (const [field, value] of required) {
      if (value === null || value === undefined || value === "") {
        pushIssue(field, raw[field], null, "ERROR", `${field}_faltante`);
      }
    }
  }

  function pushIssue(field: string, originalValue: unknown, normalizedValue: unknown, severity: Severity, action: string) {
    issues.push({ sheet, excelRow, field, originalValue, normalizedValue, severity, action });
  }

  return {
    sourceSheet: sheet,
    sourceExcelRow: excelRow,
    rowKind,
    internalCode,
    categoryName: "Tenis/Calzado",
    brandName,
    model,
    size,
    color,
    conditionName: condition.value,
    purchaseCost: purchaseCost.value,
    salePrice: salePrice.value,
    currency: "BOB",
    inventoryStatus: status.value,
    barcode,
    origin,
    entryDate,
    locationName,
    observations,
    imageFilename,
    originalPayload: raw,
    issues
  };
}

function normalizeDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return cleanText(value);
}
