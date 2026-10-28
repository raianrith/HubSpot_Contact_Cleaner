import { DUPLICATE_ISSUE_CODES } from "./issue-copy";
import type { CleanResult } from "./types";
import { buildXlsx } from "./xlsx-file";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function fileBase(fileName: string): string {
  return fileName.replace(/\.(xlsx|xls|xlsm|csv)$/i, "") || "contacts";
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function duplicateRowIndexes(result: CleanResult): Set<number> {
  const duplicateRows = new Set<number>();
  for (const group of result.duplicates) {
    for (const rowIndex of group.rowIndexes) duplicateRows.add(rowIndex);
  }
  return duplicateRows;
}

export function cleanedSheet(result: CleanResult): string[][] {
  const duplicateRows = duplicateRowIndexes(result);
  return [
    [...result.headers, "is duplicate"],
    ...result.rows.map((row, index) => [...row, duplicateRows.has(index) ? "yes" : "no"]),
  ];
}

export function cleanedSheetWithoutDuplicates(result: CleanResult): string[][] {
  const duplicateRows = duplicateRowIndexes(result);
  return [
    [...result.headers, "is duplicate"],
    ...result.rows.flatMap((row, index) => (duplicateRows.has(index) ? [] : [[...row, "no"]])),
  ];
}

export function reviewSheet(result: CleanResult): string[][] {
  const duplicateByRow = new Map<number, string>();
  for (const group of result.duplicates) {
    for (const rowIndex of group.rowIndexes) duplicateByRow.set(rowIndex, group.id);
  }
  const attentionByRow = new Map<number, string[]>();
  for (const issue of result.issues) {
    if (issue.severity === "info" || DUPLICATE_ISSUE_CODES.has(issue.code)) continue;
    const list = attentionByRow.get(issue.rowIndex) ?? [];
    list.push(issue.message);
    attentionByRow.set(issue.rowIndex, list);
  }
  return [
    ["Row", "Duplicate group", "Needs attention", ...result.headers],
    ...result.rows.flatMap((row, index) => {
      const notes = attentionByRow.get(index);
      if (!notes?.length) return [];
      return [[
        String(result.excelRows[index] ?? index + 2),
        duplicateByRow.get(index) ?? "",
        notes.join(" | "),
        ...row,
      ]];
    }),
  ];
}

export function duplicatesSheet(result: CleanResult): string[][] {
  return [
    ["Group", "Matched on", "Conflicts", "Row", ...result.headers],
    ...result.duplicates.flatMap((group) =>
      group.rowIndexes.map((index) => [
        group.id,
        group.match === "email" ? "Same email" : "Same name and company",
        group.conflicts.join("; "),
        String(result.excelRows[index] ?? index + 2),
        ...(result.rows[index] ?? []),
      ]),
    ),
  ];
}

export function downloadCsv(result: CleanResult, fileName: string) {
  const lines = cleanedSheet(result).map((row) => row.map((cell) => csvCell(cell ?? "")).join(","));
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${fileBase(fileName)}-cleaned.csv`);
}

export async function downloadWorkbook(result: CleanResult, fileName: string) {
  const changes = [
    ["Row", "Column", "Before", "After", "What changed"],
    ...result.changes.map((change) => [String(change.row), change.column, change.before, change.after, change.reason]),
  ];
  const companies = [
    ["Original", "Cleaned name", "Rows"],
    ...result.companyAlignments.map((item) => [item.from, item.to, String(item.count)]),
  ];
  const blob = await buildXlsx([
    { name: "Cleaned - No Duplicates", rows: cleanedSheetWithoutDuplicates(result) },
    { name: "Cleaned - Has Duplicates", rows: cleanedSheet(result) },
    { name: "Review", rows: reviewSheet(result) },
    { name: "Changes", rows: changes },
    { name: "Companies", rows: companies },
    { name: "Duplicates", rows: duplicatesSheet(result) },
  ]);
  downloadBlob(blob, `${fileBase(fileName)}-cleaned.xlsx`);
}
