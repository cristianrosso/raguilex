import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "outputs/raguilex_phase1/INVENTARIO_RAGUILEX_limpio_para_importacion.xlsx";
const outputDir = "outputs/raguilex_phase1/previews";
await fs.mkdir(outputDir, { recursive: true });

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 6000,
  tableMaxRows: 5,
  tableMaxCols: 8,
  tableMaxCellChars: 80,
});
console.log(summary.ndjson);

for (const sheetName of ["diagnostico", "import_ready", "cleaning_report", "mapping"]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    `${outputDir}/${sheetName}.png`,
    new Uint8Array(await preview.arrayBuffer()),
  );
}
