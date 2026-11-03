/**
 * Bulk-upload parsing for transactions. Mirrors the contacts importer: the
 * same live-recomputed issues, grouped error summary and annotated CSV export,
 * so both wizards behave identically.
 *
 * The validation here is deliberately a mirror of the backend's
 * `validateBulkTransactionRowBasic` rather than a looser front-of-house
 * version. `POST /v2/bulk-transactions/bulk-insert` rejects the **whole
 * batch** when one row fails, so a row this file waves through and the server
 * then refuses doesn't cost that row — it costs the import.
 */
import type { TransactionType } from "@/lib/transactions";
import type { AiFormatTarget } from "@/lib/ai-format";
import { autoMapColumns, csvRow } from "@/lib/file-parser";

export const TXN_CSV_COLUMNS = [
  "Transaction type",
  "Amount",
  "Date",
  "Description",
] as const;

export const TXN_FIELD_OPTIONS = [
  ...TXN_CSV_COLUMNS,
  "Category",
  "Reference",
  "Don't import",
] as const;

/** The four options that actually reach the backend. */
const TXN_MAPPABLE_FIELDS = TXN_CSV_COLUMNS;

/**
 * The template's columns as the AI formatter takes them (`lib/ai-format.ts`),
 * so a file in any layout comes back in exactly `TXN_CSV_COLUMNS`.
 */
export const TXN_AI_TARGET: AiFormatTarget = {
  type: "transactions",
  fields: [
    {
      label: "Transaction type",
      required: true,
      description: "Credit for money in, Debit for money out",
      options: ["Credit", "Debit"],
    },
    {
      label: "Amount",
      required: true,
      description: "Positive number, no currency symbol",
    },
    { label: "Date", required: true, description: "DD/MM/YYYY" },
    {
      label: "Description",
      required: true,
      description: "What the transaction was for",
    },
  ],
};

/**
 * Header spellings a bank export is likely to use, so the Map step opens with
 * the right answer already selected. Ported from sole-webapp's
 * `mapTransactionColumns`.
 */
const TXN_FIELD_ALIASES: Record<string, readonly string[]> = {
  "Transaction type": [
    "type",
    "transaction type",
    "txn type",
    "trans type",
    "credit or debit",
    "credit debit",
    "direction",
  ],
  Date: [
    "date",
    "transaction date",
    "txn date",
    "trans date",
    "posted date",
    "value date",
  ],
  Amount: ["amount", "transaction amount", "value", "debit credit amount"],
  Description: [
    "description",
    "transaction description",
    "details",
    "narrative",
    "particulars",
    "reference",
    "memo",
  ],
};

/** The editable half of a parsed row. */
export type ParsedTxnValues = {
  type: string;
  amount: string;
  date: string;
  description: string;
};

export type ParsedTxnRow = ParsedTxnValues & {
  index: number;
  /** Empty when the row is ready to import. */
  issues: string[];
};

export const TXN_REVIEW_TABS = [
  "All rows",
  "Clean rows",
  "Rows with issues",
] as const;
export type TxnReviewTab = (typeof TXN_REVIEW_TABS)[number];

/** The ceiling the backend enforces on `amount`. */
const MAX_AMOUNT = 99_999_999.99;

/**
 * One entry per way a row can fail. `summary` is the plural phrasing used when
 * the review step collapses an issue across many rows.
 */
const ROW_ISSUES: {
  message: string;
  summary: string;
  test: (row: ParsedTxnValues) => boolean;
}[] = [
  {
    message: "Type must be Credit or Debit",
    summary: "missing a valid Type",
    // Via `canonicalTxnType`, so the "CR"/"DR" and "Money in"/"Money out"
    // spellings a bank export uses pass rather than reading as missing.
    test: (row) => canonicalTxnType(row.type) === "",
  },
  {
    message: "Invalid amount",
    summary: "missing a valid Amount",
    test: (row) => {
      const cleaned = row.amount.replace(/[$,\s]/g, "");
      if (!cleaned || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return true;
      const value = Number(cleaned);
      return value <= 0 || value > MAX_AMOUNT;
    },
  },
  {
    message: "Date must be DD/MM/YYYY",
    summary: "missing a valid Date",
    test: (row) => !parseImportDate(row.date),
  },
  {
    // The backend refuses a transaction dated after today, and refuses the
    // batch with it — so it's caught here, where one row can be fixed.
    message: "Date is in the future",
    summary: "dated in the future",
    test: (row) => {
      const iso = parseImportDate(row.date);
      return iso !== null && iso > todayIso();
    },
  },
  {
    // Three, not two: `validateBulkTransactionRowBasic` requires
    // `description.length >= 3`.
    message: "Description must be at least 3 characters",
    summary: "missing a description",
    test: (row) => row.description.trim().length < 3,
  },
];

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The importer accepts the Australian DD/MM/YYYY the template specifies, plus
 * the ISO form an Excel date column arrives in once the parser has converted
 * its serial number.
 */
export function parseImportDate(value: string): string | null {
  const trimmed = value.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, year, month, day] = iso;
    return isRealDate(Number(year), Number(month), Number(day))
      ? `${year}-${pad(month)}-${pad(day)}`
      : null;
  }

  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return isRealDate(Number(year), Number(month), Number(day))
    ? `${year}-${pad(month)}-${pad(day)}`
    : null;
}

function pad(value: string): string {
  return String(Number(value)).padStart(2, "0");
}

/** Rejects 31/02 and friends, which a range check on its own lets through. */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function txnRowIssues(row: ParsedTxnValues): string[] {
  return ROW_ISSUES.filter((issue) => issue.test(row)).map((i) => i.message);
}

/** Re-runs validation after an inline edit, so counts update live. */
export function withTxnIssues(row: ParsedTxnRow): ParsedTxnRow {
  return { ...row, issues: txnRowIssues(row) };
}

export type TxnIssueGroup = {
  message: string;
  headline: string;
  rows: ParsedTxnRow[];
};

/** Collapses one issue repeated across many rows into a single line. */
export function groupTxnIssues(rows: ParsedTxnRow[]): TxnIssueGroup[] {
  return ROW_ISSUES.map((issue) => {
    const matching = rows.filter((row) => row.issues.includes(issue.message));
    return {
      message: issue.message,
      headline: `${matching.length} ${
        matching.length === 1 ? "row is" : "rows are"
      } ${issue.summary}`,
      rows: matching,
    };
  })
    .filter((group) => group.rows.length > 0)
    .sort((a, b) => b.rows.length - a.rows.length);
}

/**
 * The Map step's opening state: each column of the file matched to the Sole
 * field its header suggests, or left on "Don't import".
 */
export function autoMapTxnColumns(columns: string[]): Record<number, string> {
  const guessed = autoMapColumns(columns, TXN_MAPPABLE_FIELDS, TXN_FIELD_ALIASES);
  const mapping: Record<number, string> = {};
  const claimed = new Set<string>();

  columns.forEach((_, index) => {
    const field = guessed[index];
    // One Sole field per column. A file with both "Date" and "Value Date"
    // would otherwise map both, and the backend takes whichever won the race.
    if (field && !claimed.has(field)) {
      claimed.add(field);
      mapping[index] = field;
    } else {
      mapping[index] = "Don't import";
    }
  });

  return mapping;
}

/** Which Sole fields are mapped twice — the Map step refuses to continue then. */
export function duplicateTxnMappings(
  mapping: Record<number, string>,
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const field of Object.values(mapping)) {
    if (!TXN_MAPPABLE_FIELDS.includes(field as (typeof TXN_MAPPABLE_FIELDS)[number])) {
      continue;
    }
    if (seen.has(field)) duplicates.add(field);
    seen.add(field);
  }

  return [...duplicates];
}

/**
 * Turns the parsed sheet into review rows using the Map step's choices.
 *
 * Reading by mapping rather than by position is the whole point of the Map
 * step: a bank export with its columns in a different order used to import
 * amounts into the description and dates into the amount, silently.
 */
export function buildTxnRows(
  columns: string[],
  sheetRows: Record<string, string>[],
  mapping: Record<number, string>,
): ParsedTxnRow[] {
  const columnFor = (field: string): string | null => {
    const index = columns.findIndex((_, i) => mapping[i] === field);
    return index === -1 ? null : columns[index];
  };

  const typeColumn = columnFor("Transaction type");
  const amountColumn = columnFor("Amount");
  const dateColumn = columnFor("Date");
  const descriptionColumn = columnFor("Description");

  return sheetRows.map((sheetRow, index) => {
    const row: ParsedTxnValues = {
      // The file's own wording is kept, not canonicalised: the Review table
      // shows this cell back to someone checking it against their export, and
      // "Credit" where the file said "CR" is a quiet lie about what was read.
      // Canonicalising happens on the way to the backend.
      type: typeColumn ? (sheetRow[typeColumn] ?? "") : "",
      amount: amountColumn ? (sheetRow[amountColumn] ?? "") : "",
      date: dateColumn ? (sheetRow[dateColumn] ?? "") : "",
      description: descriptionColumn
        ? (sheetRow[descriptionColumn] ?? "")
        : "",
    };
    return { index, ...row, issues: txnRowIssues(row) };
  });
}

export function filterReviewRows(
  rows: ParsedTxnRow[],
  tab: TxnReviewTab,
): ParsedTxnRow[] {
  if (tab === "Clean rows") return rows.filter((row) => !row.issues.length);
  if (tab === "Rows with issues") return rows.filter((row) => row.issues.length > 0);
  return rows;
}

/** Failing rows in the template's column order with the reasons appended. */
export function txnErrorRowsCsv(rows: ParsedTxnRow[]): string {
  const failing = rows.filter((row) => row.issues.length > 0);
  return [
    csvRow([...TXN_CSV_COLUMNS, "Error"]),
    ...failing.map((row) =>
      csvRow([
        row.type,
        row.amount,
        row.date,
        row.description,
        row.issues.join("; "),
      ]),
    ),
  ].join("\r\n");
}

/** The rows shown under "Example of CSV structure", and in the template. */
export const TXN_SAMPLE_ROWS: string[][] = [
  ["Credit", "1120.00", "20/07/2025", "Stripe payout"],
  ["Debit", "182.40", "21/07/2025", "Officeworks Melbourne"],
  ["Debit", "1200.00", "15/07/2025", "Rent — studio space"],
];

/**
 * The downloadable starter file.
 *
 * Same columns and same rows as the example table on the Import step, so what
 * someone downloads is what they were just shown.
 */
export function txnTemplateCsv(): string {
  return [csvRow([...TXN_CSV_COLUMNS]), ...TXN_SAMPLE_ROWS.map(csvRow)].join(
    "\r\n",
  );
}

/** Canonical casing for the review step's Type select; "" when unrecognised. */
export function canonicalTxnType(value: string): "" | TransactionType {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  // Bank exports spell this "CR"/"DR" and "Money in"/"Money out" as often as
  // they spell it out, and the backend only accepts credit or debit.
  if (/^(credit|cr|c|money in|deposit|in)$/.test(normalized)) return "Credit";
  if (/^(debit|dr|d|money out|withdrawal|out)$/.test(normalized)) return "Debit";
  return "";
}

export function importAmount(value: string): number {
  return Number(value.replace(/[$,\s]/g, "")) || 0;
}
