import type { CleanResult } from "./types";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function fileBase(fileName: string): string {
  return fileName.replace(/\.(xlsx|xls|xlsm|csv)$/i, "") || "contacts";
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function downloadCsv(result: CleanResult, fileName: string) {
  const lines = [result.headers, ...result.rows].map((row) => row.map((cell) => csvCell(cell ?? "")).join(","));
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${fileBase(fileName)}-cleaned.csv`);
}

export async function downloadWorkbook(result: CleanResult, fileName: string) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const duplicateByRow = new Map<number, string>();
  for (const group of result.duplicates) {
    for (const rowIndex of group.rowIndexes) duplicateByRow.set(rowIndex, group.id);
  }
  const attentionByRow = new Map<number, string[]>();
  for (const issue of result.issues) {
    if (issue.severity === "info") continue;
    const list = attentionByRow.get(issue.rowIndex) ?? [];
    list.push(issue.message);
    attentionByRow.set(issue.rowIndex, list);
  }

  const review = [
    ["Row", "Duplicate group", "Needs attention", ...result.headers],
    ...result.rows.map((row, index) => [
      String(result.excelRows[index] ?? index + 2),
      duplicateByRow.get(index) ?? "",
      (attentionByRow.get(index) ?? []).join(" | "),
      ...row,
    ]),
  ];

  const changes = [
    ["Row", "Column", "Before", "After", "What changed"],
    ...result.changes.map((change) => [String(change.row), change.column, change.before, change.after, change.reason]),
  ];

  const companies = [
    ["Original", "Cleaned name", "Rows"],
    ...result.companyAlignments.map((item) => [item.from, item.to, String(item.count)]),
  ];

  const duplicates = [
    ["Group", "Matched on", "Rows", "Emails", "Phones", "Conflicts"],
    ...result.duplicates.map((group) => [
      group.id,
      group.match === "email" ? "Same email" : "Same name and company",
      group.rowIndexes.map((index) => String(result.excelRows[index] ?? index + 2)).join(", "),
      group.emails.join(", "),
      group.phones.join(", "),
      group.conflicts.join("; "),
    ]),
  ];

  addSheet(XLSX, workbook, "Cleaned", [result.headers, ...result.rows]);
  addSheet(XLSX, workbook, "Review", review);
  addSheet(XLSX, workbook, "Changes", changes);
  addSheet(XLSX, workbook, "Companies", companies);
  addSheet(XLSX, workbook, "Duplicates", duplicates);

  const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  downloadBlob(
    new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${fileBase(fileName)}-cleaned.xlsx`,
  );
}

function addSheet(
  XLSX: typeof import("xlsx"),
  workbook: import("xlsx").WorkBook,
  name: string,
  data: string[][],
) {
  const sheet = XLSX.utils.aoa_to_sheet(data);
  const ref = sheet["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let column = range.s.c; column <= range.e.c; column++) {
        const address = XLSX.utils.encode_cell({ r: row, c: column });
        const cell = sheet[address];
        if (!cell) continue;
        cell.t = "s";
        cell.v = cell.v === undefined || cell.v === null ? "" : String(cell.v);
      }
    }
    sheet["!autofilter"] = { ref };
  }
  sheet["!cols"] = (data[0] ?? []).map((header) => ({ wch: Math.min(42, Math.max(14, String(header).length + 4)) }));
  XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
}
