import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { ImportRowStatus, InventoryStatus, MovementType, type Prisma, type PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { normalizeHeader, normalizeProductRow, type NormalizedProductRow } from "./normalization.js";

export type ExcelAnalysis = {
  sourceFilename: string;
  fileSha256: string;
  sheets: Array<{ name: string; headerRow: number; headers: string[]; records: number; blankColumns: string[] }>;
  mainSheet: string;
  rows: NormalizedProductRow[];
  summary: {
    recordsFound: number;
    productCandidateRecords: number;
    placeholderCodeOnlyRecords: number;
    validRecords: number;
    duplicateCodes: number;
    duplicateBarcodes: number;
    rowsWithErrors: number;
    rowsWithWarnings: number;
    nextCode: string;
  };
};

export async function analyzeExcelFile(filePath: string): Promise<ExcelAnalysis> {
  const fileBuffer = readFileSync(filePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheetProfiles = workbook.worksheets.map((sheet) => profileSheet(sheet, sheet.name));
  const main = sheetProfiles.filter((sheet) => sheet.rows.length > 0).sort((a, b) => b.rows.length - a.rows.length)[0];
  if (!main) throw new Error("No se encontraron filas de inventario en el Excel.");

  const normalizedRows = main.rows.map((row) => normalizeProductRow(main.name, row.excelRow, row.values));
  const codeRows = new Map<string, number[]>();
  const barcodeRows = new Map<string, number[]>();
  for (const row of normalizedRows) {
    if (row.internalCode) codeRows.set(row.internalCode, [...(codeRows.get(row.internalCode) ?? []), row.sourceExcelRow]);
    if (row.barcode) barcodeRows.set(row.barcode, [...(barcodeRows.get(row.barcode) ?? []), row.sourceExcelRow]);
  }

  for (const [code, rows] of codeRows.entries()) {
    if (rows.length <= 1) continue;
    for (const row of normalizedRows.filter((item) => item.internalCode === code)) {
      row.issues.push({
        sheet: row.sourceSheet,
        excelRow: row.sourceExcelRow,
        field: "codigo_interno",
        originalValue: code,
        normalizedValue: code,
        severity: "ERROR",
        action: "codigo_duplicado_en_excel"
      });
    }
  }

  for (const [barcode, rows] of barcodeRows.entries()) {
    if (rows.length <= 1) continue;
    for (const row of normalizedRows.filter((item) => item.barcode === barcode)) {
      row.issues.push({
        sheet: row.sourceSheet,
        excelRow: row.sourceExcelRow,
        field: "codigo_original_opcional",
        originalValue: barcode,
        normalizedValue: barcode,
        severity: "WARN",
        action: "codigo_original_duplicado"
      });
    }
  }

  const maxCodeNumber = Math.max(
    0,
    ...normalizedRows
      .map((row) => row.internalCode?.match(/^TN-(\d{5})$/)?.[1])
      .filter(Boolean)
      .map((number) => Number(number))
  );

  return {
    sourceFilename: basename(filePath),
    fileSha256: createHash("sha256").update(fileBuffer).digest("hex"),
    sheets: sheetProfiles.map((sheet) => ({
      name: sheet.name,
      headerRow: sheet.headerRow,
      headers: sheet.headers,
      records: sheet.rows.length,
      blankColumns: sheet.blankColumns
    })),
    mainSheet: main.name,
    rows: normalizedRows,
    summary: {
      recordsFound: normalizedRows.length,
      productCandidateRecords: normalizedRows.filter((row) => row.rowKind === "product_candidate").length,
      placeholderCodeOnlyRecords: normalizedRows.filter((row) => row.rowKind === "placeholder_code_only").length,
      validRecords: normalizedRows.filter(isImportable).length,
      duplicateCodes: [...codeRows.values()].filter((rows) => rows.length > 1).length,
      duplicateBarcodes: [...barcodeRows.values()].filter((rows) => rows.length > 1).length,
      rowsWithErrors: normalizedRows.filter((row) => row.issues.some((issue) => issue.severity === "ERROR")).length,
      rowsWithWarnings: normalizedRows.filter((row) => row.issues.some((issue) => issue.severity === "WARN")).length,
      nextCode: `TN-${String(maxCodeNumber + 1).padStart(5, "0")}`
    }
  };
}

export async function persistAnalysis(prisma: PrismaClient, analysis: ExcelAnalysis, createdBy?: string) {
  return prisma.importBatch.create({
    data: {
      sourceFilename: analysis.sourceFilename,
      fileSha256: analysis.fileSha256,
      totalRows: analysis.summary.recordsFound,
      validRows: analysis.summary.validRecords,
      warningRows: analysis.summary.rowsWithWarnings,
      errorRows: analysis.summary.rowsWithErrors,
      createdById: createdBy,
      rows: {
        create: analysis.rows.map((row) => ({
          excelSheet: row.sourceSheet,
          excelRow: row.sourceExcelRow,
          internalCode: row.internalCode,
          normalizedPayload: toJson(toPayload(row)),
          originalPayload: toJson(row.originalPayload),
          validationStatus: row.issues.some((issue) => issue.severity === "ERROR")
            ? ImportRowStatus.ERROR
            : row.issues.some((issue) => issue.severity === "WARN")
              ? ImportRowStatus.WARNING
              : ImportRowStatus.VALID,
          validationMessages: toJson(row.issues)
        }))
      }
    },
    include: { rows: true }
  });
}

export async function importValidRows(prisma: PrismaClient, analysis: ExcelAnalysis, userId?: string) {
  const validRows = analysis.rows.filter(isImportable);
  const result = { created: 0, skippedExisting: 0, errors: [] as Array<{ code: string | null; message: string }> };

  await prisma.$transaction(async (tx) => {
    const category = await tx.category.upsert({
      where: { name: "Tenis/Calzado" },
      update: {},
      create: { name: "Tenis/Calzado" }
    });

    for (const row of validRows) {
      if (!row.internalCode) continue;
      const existing = await tx.product.findUnique({ where: { internalCode: row.internalCode } });
      if (existing) {
        result.skippedExisting += 1;
        continue;
      }

      const [brand, condition, location] = await Promise.all([
        row.brandName ? tx.brand.upsert({ where: { name: row.brandName }, update: {}, create: { name: row.brandName } }) : null,
        row.conditionName ? tx.productCondition.upsert({ where: { name: row.conditionName }, update: {}, create: { name: row.conditionName } }) : null,
        tx.location.upsert({ where: { name: row.locationName }, update: {}, create: { name: row.locationName } })
      ]);

      const product = await tx.product.create({
        data: {
          internalCode: row.internalCode,
          categoryId: category.id,
          brandId: brand?.id,
          model: row.model,
          size: row.size,
          color: row.color,
          conditionId: condition?.id,
          purchaseCost: row.purchaseCost,
          salePrice: row.salePrice,
          currency: row.currency,
          status: row.inventoryStatus ?? InventoryStatus.AVAILABLE,
          observations: row.observations,
          locationId: location.id,
          barcode: row.barcode,
          createdById: userId,
          updatedById: userId,
          images: row.imageFilename
            ? { create: { imageUrl: row.imageFilename, isPrimary: true, sortOrder: 1 } }
            : undefined
        }
      });

      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          movementType: MovementType.IMPORT,
          newStatus: product.status,
          userId,
          referenceType: "IMPORT",
          observations: `Importado desde ${analysis.sourceFilename}, fila ${row.sourceExcelRow}`
        }
      });
      result.created += 1;
    }
  });

  return result;
}

export function isImportable(row: NormalizedProductRow) {
  return row.rowKind === "product_candidate" && !row.issues.some((issue) => issue.severity === "ERROR");
}

function toPayload(row: NormalizedProductRow) {
  const { issues, originalPayload, ...payload } = row;
  return payload;
}

function profileSheet(sheet: ExcelJS.Worksheet, name: string) {
  const sourceRows: Array<{ excelRow: number; values: unknown[] }> = [];
  const maxColumn = Math.max(sheet.columnCount, 1);
  sheet.eachRow({ includeEmpty: false }, (row, excelRow) => {
    const values = Array.from({ length: maxColumn }, (_, index) => cellValue(row.getCell(index + 1).value));
    if (values.some((value) => value !== null && value !== "")) {
      sourceRows.push({ excelRow, values });
    }
  });

  const headerIndex = detectHeaderRow(sourceRows.map((row) => row.values));
  const rawHeaders = (sourceRows[headerIndex]?.values ?? []).map((value, index) => cleanHeader(value, index));
  const normalizedHeaders = rawHeaders.map((value, index) => {
    const normalized = normalizeHeader(value);
    const earlier = rawHeaders.slice(0, index).map(normalizeHeader).filter((item) => item === normalized).length;
    return earlier ? `${normalized}_${earlier + 1}` : normalized;
  });

  const rows = sourceRows.slice(headerIndex + 1).map((row) => {
    const object: Record<string, unknown> = {};
    normalizedHeaders.forEach((header, colIndex) => {
      object[header] = row.values[colIndex] ?? null;
    });
    return { excelRow: row.excelRow, values: object };
  }).filter((row) => Object.values(row.values).some((value) => value !== null && value !== ""));

  const blankColumns = rawHeaders.filter((_, colIndex) => rows.every((row) => row.values[normalizedHeaders[colIndex]] === null || row.values[normalizedHeaders[colIndex]] === ""));

  return {
    name,
    headerRow: sourceRows[headerIndex]?.excelRow ?? headerIndex + 1,
    headers: rawHeaders,
    blankColumns,
    rows
  };
}

function detectHeaderRow(matrix: unknown[][]) {
  let bestIndex = 0;
  let bestScore = 0;
  const expectedHeaders = new Set([
    "codigo_interno",
    "marca",
    "modelo_linea",
    "talla",
    "color",
    "condicion",
    "costo_compra_bs",
    "precio_venta_bs",
    "estado",
    "origen",
    "ubicacion"
  ]);
  matrix.slice(0, 25).forEach((row, index) => {
    const values = row.filter((value) => value !== null && value !== "");
    const normalized = values.map(normalizeHeader);
    const knownHeaders = normalized.filter((value) => expectedHeaders.has(value)).length;
    const distinctValues = new Set(values.map((value) => String(value))).size;
    const score = knownHeaders * 20 + distinctValues + values.filter((value) => typeof value === "string").length;
    if (values.length >= 2 && score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return bestIndex;
}

function cleanHeader(value: unknown, index: number) {
  return String(value ?? `Columna ${index + 1}`).replace(/\s+/g, " ").trim();
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;

  if ("result" in value && value.result !== undefined) return cellValue(value.result as ExcelJS.CellValue);
  if ("text" in value && typeof value.text === "string") return value.text;
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }
  if ("hyperlink" in value && "text" in value && typeof value.text === "string") return value.text;
  return String(value);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
