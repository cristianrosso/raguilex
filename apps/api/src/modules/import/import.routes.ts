import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { RoleCode } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { analyzeExcelFile, importValidRows, persistAnalysis, type ExcelAnalysis } from "./excel-importer.js";
import type { NormalizedProductRow } from "./normalization.js";

const pathBodySchema = z.object({
  filePath: z.string().min(1),
  persist: z.boolean().default(false),
  importValid: z.boolean().default(false)
});

export async function importRoutes(app: FastifyInstance) {
  app.post("/analyze", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request) => {
    const filePath = await resolveIncomingFile(request);
    const analysis = await analyzeExcelFile(filePath);
    const batch = await persistAnalysis(prisma, analysis, request.user.sub);
    return { batchId: batch.id, ...withoutRows(analysis), rows: analysis.rows.slice(0, 50) };
  });

  app.post("/from-path", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request) => {
    const body = pathBodySchema.parse(request.body);
    const analysis = await analyzeExcelFile(body.filePath);
    const batch = body.persist ? await persistAnalysis(prisma, analysis, request.user.sub) : null;
    const importResult = body.importValid ? await importValidRows(prisma, analysis, request.user.sub) : null;
    return { batchId: batch?.id, importResult, ...withoutRows(analysis), rows: analysis.rows.slice(0, 50) };
  });

  app.post("/commit/:batchId", { preHandler: app.requireRoles([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]) }, async (request, reply) => {
    const params = z.object({ batchId: z.string().uuid() }).parse(request.params);
    const batch = await prisma.importBatch.findUnique({ where: { id: params.batchId }, include: { rows: true } });
    if (!batch) return reply.status(404).send({ message: "Lote de importacion no encontrado." });

    const analysisRows: NormalizedProductRow[] = batch.rows.map((row) => ({
      ...(row.normalizedPayload as object),
      sourceSheet: row.excelSheet,
      sourceExcelRow: row.excelRow,
      originalPayload: row.originalPayload,
      issues: row.validationMessages
    } as NormalizedProductRow));
    const analysis = {
      sourceFilename: batch.sourceFilename,
      fileSha256: batch.fileSha256,
      sheets: [],
      mainSheet: "",
      rows: analysisRows,
      summary: {
        recordsFound: batch.totalRows,
        productCandidateRecords: 0,
        placeholderCodeOnlyRecords: 0,
        validRecords: batch.validRows,
        duplicateCodes: 0,
        duplicateBarcodes: 0,
        rowsWithErrors: batch.errorRows,
        rowsWithWarnings: batch.warningRows,
        nextCode: ""
      }
    } satisfies ExcelAnalysis;

    const result = await importValidRows(prisma, analysis, request.user.sub);
    await prisma.importBatch.update({ where: { id: batch.id }, data: { status: "IMPORTED" } });
    return result;
  });
}

async function resolveIncomingFile(request: FastifyRequest) {
  const part = await request.file();
  if (part) {
    const tempDir = await mkdtemp(join(tmpdir(), "raguilex-import-"));
    const filePath = join(tempDir, part.filename);
    await writeFile(filePath, await part.toBuffer());
    return filePath;
  }
  const body = pathBodySchema.parse(request.body);
  return body.filePath;
}

function withoutRows<T extends { rows: unknown[] }>(analysis: T) {
  const { rows, ...rest } = analysis;
  return rest;
}
