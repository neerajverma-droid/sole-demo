/**
 * Spreadsheet parsing for the bulk importers — the port of sole-webapp's
 * `utils/fileParser.js`.
 *
 * Both importers read the file in the browser and send rows as JSON; nothing
 * here uploads a file. That's sole-webapp's own design (its server-side
 * upload/column-mapping endpoints are dead code — `BulkTransactionMigrations`
 * still references `apiRoutes.bulkTransaction.uploadFile`, which doesn't
 * exist), and it's why a 5 MB workbook costs one request instead of three.
 *
 * SheetJS reads CSV and XLSX through the same code path, so accepting a
 * `.xlsx` export costs nothing beyond the `accept` attribute.
 */
import * as XLSX from "xlsx";

/** What the file input accepts, and what `isSupportedImportFile` allows. */
export const IMPORT_FILE_EXTENSIONS = [".csv", ".xls", ".xlsx"] as const;

export const IMPORT_FILE_ACCEPT =
  ".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ParsedSheet = {
  /** Header row, trimmed, with blank columns dropped. */
  columns: string[];
  /** One entry per data row, keyed by header. Empty rows are dropped. */
  rows: Record<string, string>[];
};

export function isSupportedImportFile(file: File): boolean {
  const name = (file.name || "").toLowerCase();
  return IMPORT_FILE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/**
 * Excel stores dates as a day count from 1899-12-30, so a date column in an
 * `.xlsx` arrives as `45123` rather than `20/07/2026`. Only columns whose
 * header mentions a date are converted, and only within the serial range that
 * spans 1968–2036 — outside that a five-digit number is far more likely to be
 * a reference or an amount than a date.
 */
function convertExcelDate(value: string, header: string): string {
  if (!/date/i.test(header)) return value;

  const serial = /^\d{5}(\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isFinite(serial) || serial <= 25000 || serial >= 50000) {
    return value;
  }

  const epoch = Date.UTC(1899, 11, 30);
  const converted = new Date(epoch + serial * 24 * 60 * 60 * 1000);
  if (Number.isNaN(converted.getTime())) return value;

  const year = converted.getUTCFullYear();
  const month = String(converted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(converted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Reads the workbook's first sheet into headers plus row objects.
 *
 * Deliberately goes through `header: 1` (array of arrays) and builds the row
 * objects here rather than letting `sheet_to_json` key them itself: SheetJS
 * 0.18's object mode is the path with the prototype-pollution advisory
 * against it, and these rows come straight off a file someone was handed.
 * The objects are null-prototype for the same reason — a column literally
 * headed `__proto__` becomes an ordinary key.
 */
export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();

  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    cellNF: false,
    cellText: false,
    raw: true,
  });

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) return { columns: [], rows: [] };

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  });

  if (grid.length === 0) return { columns: [], rows: [] };

  const columns = (grid[0] ?? [])
    .map((header) => (header == null ? "" : String(header).trim()))
    .filter((header) => header !== "");

  const rows = grid
    .slice(1)
    .map((cells) => {
      const row: Record<string, string> = Object.create(null);
      columns.forEach((header, index) => {
        const raw = cells[index];
        const value = raw == null ? "" : String(raw).trim();
        row[header] = convertExcelDate(value, header);
      });
      return row;
    })
    .filter((row) => Object.values(row).some((value) => value !== ""));

  return { columns, rows };
}

/** Lowercased, punctuation-stripped, single-spaced — how headers are compared. */
function normalizeHeader(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Guesses which Sole field each column of the file holds.
 *
 * Same three-tier scoring as sole-webapp: an exact header match, then a known
 * alias, then a partial word overlap that has to clear a threshold before it
 * counts. Anything below the threshold is left unmapped rather than guessed —
 * a wrong guess on the Map step is worse than a blank one, because the blank
 * is visible and the wrong guess reads as confirmed.
 *
 * Returns a map from column index to field name; columns with no confident
 * match are absent.
 */
export function autoMapColumns(
  fileColumns: string[],
  targetFields: readonly string[],
  aliases: Record<string, readonly string[]> = {},
): Record<number, string> {
  const mapping: Record<number, string> = {};
  if (!Array.isArray(fileColumns)) return mapping;

  fileColumns.forEach((fileColumn, index) => {
    const normalized = normalizeHeader(fileColumn);
    if (!normalized) return;

    const words = normalized.split(" ");
    let bestMatch = "";
    let bestScore = 0;

    for (const field of targetFields) {
      const normalizedField = normalizeHeader(field);
      const fieldAliases = (aliases[field] ?? []).map(normalizeHeader);

      if (normalized === normalizedField) {
        bestMatch = field;
        bestScore = 100;
        break;
      }

      if (fieldAliases.includes(normalized)) {
        bestMatch = field;
        bestScore = 95;
        continue;
      }

      // Partial overlap: every word that appears in the field name (or in one of
      // its aliases) contributes its own length, so "transaction date" beats
      // "date" on a column headed "Transaction Date".
      // Only whole words of three letters or more take part. Without the
      // floor, an alias containing "e" scores against every column whose
      // header happens to have an e in it, and an unrelated column gets
      // confidently mapped to a field it has nothing to do with.
      const overlap = (candidate: string): number => {
        const candidateWords = candidate
          .split(" ")
          .filter((word) => word.length >= 3);
        return words.reduce(
          (score, word) =>
            word.length >= 3 &&
            candidateWords.some(
              (other) => other.includes(word) || word.includes(other),
            )
              ? score + word.length
              : score,
          0,
        );
      };

      const score = [normalizedField, ...fieldAliases].reduce(
        (best, candidate) => Math.max(best, overlap(candidate)),
        0,
      );

      if (score > bestScore) {
        bestScore = score;
        bestMatch = field;
      }
    }

    if (bestMatch && bestScore > 5) mapping[index] = bestMatch;
  });

  return mapping;
}

/** Triggers a browser download of `content` as `filename`. */
export function downloadCsv(filename: string, content: string): void {
  // The BOM is what stops Excel reading a UTF-8 template as Latin-1.
  const blob = new Blob(["﻿" + content], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** One CSV row, quoting only the cells that need it. */
export function csvRow(cells: (string | number)[]): string {
  return cells
    .map((cell) => {
      const value = String(cell ?? "");
      return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    })
    .join(",");
}
