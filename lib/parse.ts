export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: string[][];
  excelRows: number[];
}

export interface ParsedFile {
  fileName: string;
  sheets: ParsedSheet[];
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function usedWidth(matrix: string[][]): number {
  let width = 0;
  for (const row of matrix) {
    for (let index = row.length - 1; index >= 0; index--) {
      if (row[index]?.trim()) {
        width = Math.max(width, index + 1);
        break;
      }
    }
  }
  return width;
}

function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((row) => row.trim()) ?? "";
  const scored = [",", ";", "\t"].map((delimiter) => ({
    delimiter,
    count: line.split(delimiter).length - 1,
  }));
  scored.sort((a, b) => b.count - a.count);
  return scored[0].count > 0 ? scored[0].delimiter : ",";
}

function sheetFromMatrix(name: string, matrix: unknown[][]): ParsedSheet {
  const asRows = matrix.map((row) => (Array.isArray(row) ? row.map(asText) : []));
  const width = usedWidth(asRows);
  if (!width) {
    throw new Error(`“${name.trim() || "Sheet"}” is empty.`);
  }
  const headers = Array.from({ length: width }, (_, index) => asRows[0]?.[index]?.trim() || `Column ${index + 1}`);
  const rows: string[][] = [];
  const excelRows: number[] = [];
  for (let index = 1; index < asRows.length; index++) {
    const cells = Array.from({ length: width }, (_, cell) => asRows[index]?.[cell] ?? "");
    if (cells.every((cell) => !cell.trim())) continue;
    rows.push(cells);
    excelRows.push(index + 1);
  }
  return { name, headers, rows, excelRows };
}

export async function parseSpreadsheet(file: File): Promise<ParsedFile> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name) || file.type.includes("csv");
  let workbook;
  if (isCsv) {
    let text = new TextDecoder("utf-8").decode(buffer);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const delimiter = detectDelimiter(text);
    workbook = XLSX.read(text, { type: "string", FS: delimiter, raw: false });
  } else {
    workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
  }

  if (!workbook.SheetNames.length) {
    throw new Error("No sheets were found in that file.");
  }

  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true,
    });
    return sheetFromMatrix(name, matrix);
  });

  return { fileName: file.name, sheets };
}
