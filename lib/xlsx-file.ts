const XML = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  CRC_TABLE[index] = value >>> 0;
}

export interface WorkbookSheet {
  name: string;
  rows: string[][];
}

function sheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "Sheet").slice(0, 31);
}

function columnName(index: number): string {
  let name = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellText(value: string): string {
  const text = value.length > 32767 ? value.slice(0, 32767) : value;
  return escapeXml(text);
}

async function pause() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function sheetXml(rows: string[][]): Promise<string> {
  const columns = rows.reduce((width, row) => Math.max(width, row?.length ?? 0), 0);
  const lastRow = Math.max(rows.length, 1);
  const lastColumn = Math.max(columns, 1);
  const ref = `A1:${columnName(lastColumn - 1)}${lastRow}`;
  const body: string[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    const cells: string[] = [];
    for (let column = 0; column < row.length; column++) {
      const value = row[column] ?? "";
      if (rowIndex > 0 && value === "") continue;
      cells.push(`<c r="${columnName(column)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${cellText(value)}</t></is></c>`);
    }
    if (cells.length) body.push(`<row r="${rowIndex + 1}">${cells.join("")}</row>`);
    if (rowIndex > 0 && rowIndex % 1500 === 0) await pause();
  }
  const widths = (rows[0] ?? []).map((header, index) => {
    const width = Math.min(42, Math.max(14, String(header).length + 4));
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="${XML}" xmlns:r="${REL}">` +
    `<dimension ref="${ref}"/>` +
    `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
    (widths.length ? `<cols>${widths.join("")}</cols>` : "") +
    `<sheetData>${body.join("")}</sheetData>` +
    (rows.length && columns ? `<autoFilter ref="${ref}"/>` : "") +
    `<ignoredErrors><ignoredError numberStoredAsText="1" sqref="${ref}"/></ignoredErrors>` +
    `</worksheet>`;
}

function workbookXml(names: string[]): string {
  const sheets = names.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="${XML}" xmlns:r="${REL}"><sheets>${sheets}</sheets></workbook>`;
}

function workbookRels(count: number): string {
  const sheets = Array.from({ length: count }, (_, index) => (
    `<Relationship Id="rId${index + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  )).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${PKG}">${sheets}` +
    `<Relationship Id="rId${count + 1}" Type="${REL}/styles" Target="styles.xml"/>` +
    `</Relationships>`;
}

function contentTypes(count: number): string {
  const sheets = Array.from({ length: count }, (_, index) => (
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  )).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheets +
    `</Types>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="${XML}">` +
  `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
  `</styleSheet>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="${PKG}">` +
  `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

function bytesPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index++) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflate(bytes: Uint8Array): Promise<{ data: Uint8Array; method: number }> {
  if (typeof CompressionStream === "undefined") return { data: bytes, method: 0 };
  const stream = new CompressionStream("deflate-raw");
  const compressed = await new Response(new Blob([bytesPart(bytes)]).stream().pipeThrough(stream)).arrayBuffer();
  return { data: new Uint8Array(compressed), method: 8 };
}

function zip(files: { name: string; rawLength: number; compressed: Uint8Array; method: number; crc: number }[]): Blob {
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, file.method, true);
    view.setUint32(14, file.crc, true);
    view.setUint32(18, file.compressed.length, true);
    view.setUint32(22, file.rawLength, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(bytesPart(local), bytesPart(file.compressed));
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, file.method, true);
    centralView.setUint32(16, file.crc, true);
    centralView.setUint32(20, file.compressed.length, true);
    centralView.setUint32(24, file.rawLength, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length + file.compressed.length;
  }
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts.map(bytesPart), bytesPart(end)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function pack(name: string, text: string) {
  const bytes = new TextEncoder().encode(text);
  const compressed = await deflate(bytes);
  return { name, rawLength: bytes.length, compressed: compressed.data, method: compressed.method, crc: crc32(bytes) };
}

export async function buildXlsx(sheets: WorkbookSheet[]): Promise<Blob> {
  const names = sheets.map((sheet) => sheetName(sheet.name));
  const files = [
    await pack("[Content_Types].xml", contentTypes(sheets.length)),
    await pack("_rels/.rels", ROOT_RELS),
    await pack("xl/workbook.xml", workbookXml(names)),
    await pack("xl/_rels/workbook.xml.rels", workbookRels(sheets.length)),
    await pack("xl/styles.xml", STYLES),
  ];
  for (let index = 0; index < sheets.length; index++) {
    const xml = await sheetXml(sheets[index].rows);
    files.push(await pack(`xl/worksheets/sheet${index + 1}.xml`, xml));
    await pause();
  }
  return zip(files);
}
