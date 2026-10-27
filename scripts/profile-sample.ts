import * as XLSX from "xlsx";
import { cleanRecords } from "../lib/clean";
import { detectColumns } from "../lib/detect";
import { defaultOptions } from "../lib/types";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npx tsx scripts/profile-sample.ts <file.xlsx>");
  process.exit(1);
}
const workbook = XLSX.readFile(path, { cellDates: true });
const sheetName = workbook.SheetNames[0];
const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets[sheetName], {
  header: 1,
  raw: false,
  defval: "",
});
const width = Math.max(...matrix.map((row) => row.length));
const headers = Array.from({ length: width }, (_, index) => String(matrix[0]?.[index] ?? "").trim());
const rows: string[][] = [];
const excelRows: number[] = [];
for (let index = 1; index < matrix.length; index++) {
  const cells = Array.from({ length: width }, (_, cell) => String(matrix[index]?.[cell] ?? ""));
  if (cells.every((cell) => !cell.trim())) continue;
  rows.push(cells);
  excelRows.push(index + 1);
}

const mappings = detectColumns(headers, rows);
console.log("mappings", mappings.map((mapping) => `${mapping.header} -> ${mapping.kind}`).join("\n"));
const result = cleanRecords(headers, rows, excelRows, mappings, defaultOptions);
console.log("\nKPIS", result.kpis);
const byCode = new Map<string, number>();
for (const issue of result.issues) byCode.set(issue.code, (byCode.get(issue.code) ?? 0) + 1);
console.log("\nISSUES");
for (const [code, count] of [...byCode.entries()].sort((a, b) => b[1] - a[1])) console.log(String(count).padStart(5), code);

console.log("\nINVALID EMAILS");
for (const issue of result.issues.filter((item) => item.code === "invalid_email").slice(0, 20)) {
  console.log(issue.row, issue.value, "—", issue.message);
}
console.log("\nMISMATCH sample");
for (const issue of result.issues.filter((item) => item.code === "email_name_mismatch").slice(0, 25)) {
  const row = result.rows[issue.rowIndex];
  console.log(issue.row, row[2], row[3], row[4]);
}
console.log("\nTYPO sample");
for (const issue of result.issues.filter((item) => item.code === "email_name_typo").slice(0, 15)) {
  const row = result.rows[issue.rowIndex];
  console.log(issue.row, row[2], row[3], row[4]);
}
console.log("\nCOMPANY CHANGES", result.companyAlignments.length);
for (const item of result.companyAlignments.slice(0, 40)) console.log(String(item.count).padStart(4), item.from, "=>", item.to);
console.log("\nSIMILAR");
for (const item of result.similarCompanies) console.log(item.rowsA, item.a, "|", item.rowsB, item.b);
console.log("\nDUP groups", result.duplicates.length, "conflicts", result.kpis.conflictingDuplicates);
