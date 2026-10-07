import { read, utils, type CellObject } from "xlsx";

/** Parsers return inert text, never database records. Nothing is uploaded or executed. */
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_XLSX_BYTES = 4 * 1024 * 1024;
export const MAX_ROWS = 2000;
export const MAX_COLUMNS = 60;
export const MAX_CELL_LENGTH = 1024;

export type FileFormat = "csv" | "xlsx";
export type RawRow = { rowNumber: number; cells: string[] };
export type RawSheet = { name: string; rows: RawRow[] };
export type ParsedStatement = {
  format: FileFormat;
  filename: string;
  sheets: RawSheet[];
};

function checkCell(value: string): string {
  if (value.length > MAX_CELL_LENGTH)
    throw new Error("A cell exceeds the 1,024 character limit.");
  return value;
}

function checkRow(cells: string[], rowNumber: number): RawRow {
  if (cells.length > MAX_COLUMNS)
    throw new Error("Too many columns (limit: 60).");
  return { rowNumber, cells };
}

export function parseCsv(text: string): RawSheet {
  const rows: RawRow[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  let line = 1;
  let rowLine = 1;
  const pushCell = () => {
    row.push(checkCell(cell));
    cell = "";
    closed = false;
  };
  const pushRow = () => {
    pushCell();
    rows.push(checkRow(row, rowLine));
    if (rows.length > MAX_ROWS + 21)
      throw new Error("Too many rows (limit: 2,000 data rows).");
    row = [];
    rowLine = line;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else {
        cell += char;
        if (char === "\n") line++;
      }
    } else if (char === '"' && !cell && !closed) quoted = true;
    else if (char === ",") pushCell();
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      line++;
      pushRow();
    } else {
      if (closed || char === '"')
        throw new Error(`Malformed CSV near line ${line}.`);
      cell += char;
    }
    if (cell.length > MAX_CELL_LENGTH)
      throw new Error("A cell exceeds the 1,024 character limit.");
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted cell.");
  if (row.length || cell || closed) pushRow();
  if (
    !rows.length ||
    rows.every((item) => item.cells.every((value) => !value.trim()))
  )
    throw new Error("The CSV is empty.");
  return { name: "CSV", rows };
}

// Check ZIP central-directory metadata BEFORE decompressing untrusted XLSX. ZIP64,
// encrypted entries, huge inflated sizes and extreme compression ratios are rejected.
export function checkXlsxZip(bytes: Uint8Array): void {
  if (
    bytes.length < 22 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 3 ||
    bytes[3] !== 4
  )
    throw new Error("Not an XLSX (ZIP) file.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
    throw new Error("Invalid XLSX ZIP directory.");
  const entries = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);
  if (
    entries < 1 ||
    entries > 200 ||
    directorySize > bytes.length ||
    offset + directorySize > end
  )
    throw new Error("XLSX ZIP has too many entries or an invalid directory.");
  let inflated = 0;
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("Invalid XLSX ZIP entry.");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (
      next > end ||
      nameLength > 250 ||
      flags & 1 ||
      (method !== 0 && method !== 8) ||
      compressed === 0xffffffff ||
      size === 0xffffffff ||
      local === 0xffffffff ||
      size > 8 * 1024 * 1024 ||
      (size > 65536 && size > compressed * 100) ||
      local + 30 > bytes.length
    )
      throw new Error("Unsupported or unsafe XLSX ZIP entry.");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").includes("..") ||
      view.getUint32(local, true) !== 0x04034b50
    )
      throw new Error("Invalid XLSX ZIP path.");
    const start =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);
    if (start + compressed > bytes.length)
      throw new Error("Truncated XLSX ZIP entry.");
    inflated += size;
    if (inflated > 20 * 1024 * 1024)
      throw new Error("XLSX expands past the 20 MB limit.");
    offset = next;
  }
  if (offset !== view.getUint32(end + 16, true) + directorySize)
    throw new Error("Invalid XLSX ZIP directory size.");
}

export function parseXlsx(bytes: Uint8Array): RawSheet[] {
  checkXlsxZip(bytes);
  // Workbook read is synchronous; the compressed and inflated limits above bound work.
  const workbook = read(bytes, {
    type: "array",
    sheetRows: MAX_ROWS + 21,
    cellFormula: false,
    cellHTML: false,
    bookVBA: false,
    WTF: true,
  });
  if (!workbook.SheetNames.length || workbook.SheetNames.length > 12)
    throw new Error("XLSX must have 1–12 sheets.");
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) throw new Error("Missing worksheet.");
    const ref = sheet["!ref"];
    const fullRef = sheet["!fullref"];
    if (fullRef && utils.decode_range(fullRef).e.r > MAX_ROWS + 20)
      throw new Error("XLSX exceeds the 2,000 data row limit.");
    if (!ref) return { name, rows: [] };
    const range = utils.decode_range(ref);
    if (range.e.c >= MAX_COLUMNS || range.e.r - range.s.r > MAX_ROWS + 20)
      throw new Error("XLSX exceeds row or column limits.");
    const rows: RawRow[] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cells: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[utils.encode_cell({ r, c })] as
          CellObject | undefined;
        cells.push(checkCell(cell?.v == null ? "" : String(cell.v)));
      }
      rows.push(checkRow(cells, r + 1));
    }
    return { name, rows };
  });
}

/** Accepts only .csv/.xlsx; PDFs are not accepted or read. Files never leave the browser. */
export async function parseStatementFile(file: File): Promise<ParsedStatement> {
  const format = /\.csv$/i.test(file.name)
    ? "csv"
    : /\.xlsx$/i.test(file.name)
      ? "xlsx"
      : null;
  if (!format)
    throw new Error(
      "Choose a .csv or .xlsx file. PDF import is under construction.",
    );
  if (
    !file.size ||
    file.size > (format === "csv" ? MAX_CSV_BYTES : MAX_XLSX_BYTES)
  )
    throw new Error(
      "File is empty or exceeds the size limit (CSV 2 MB; XLSX 4 MB).",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size)
    throw new Error("File changed while being read.");
  const sheets =
    format === "csv"
      ? [
          parseCsv(
            new TextDecoder("utf-8", { fatal: true })
              .decode(bytes)
              .replace(/^\uFEFF/, ""),
          ),
        ]
      : parseXlsx(bytes);
  return { format, filename: file.name.slice(0, 120), sheets };
}
