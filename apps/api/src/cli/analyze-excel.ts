import { resolve } from "node:path";
import { analyzeExcelFile } from "../modules/import/excel-importer.js";

const filePath = process.argv[2] ?? "C:\\Users\\ZBook\\Downloads\\INVENTARIO RAGUILEX.xlsx";
const analysis = await analyzeExcelFile(resolve(filePath));

console.log(JSON.stringify({
  sourceFilename: analysis.sourceFilename,
  sheets: analysis.sheets,
  mainSheet: analysis.mainSheet,
  summary: analysis.summary,
  firstRows: analysis.rows.slice(0, 5)
}, null, 2));
