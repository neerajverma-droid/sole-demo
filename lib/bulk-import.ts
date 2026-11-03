/**
 * The machinery every bulk importer shares.
 *
 * Contacts and Transactions each grew their own copy of this — the same
 * column mapping, the same live-recomputed row issues, the same grouped error
 * summary, the same annotated error CSV — and Invoices, Expenses and Assets
 * would have made five. What differs between the modules is only *data*: which
 * fields exist, what makes a row invalid, and where the rows are posted. So
 * that's what a module supplies, and the engine here does the rest.
 *
 * Rows are keyed by field label rather than by a per-module named type. That's
 * what lets one Map step, one Review table and one error export serve all of
 * them; the module converts to its own API shape at the point of posting,
 * which is the only place the distinction is real.
 */
import { autoMapColumns, csvRow } from "@/lib/file-parser";
import { FALLBACK_CONTACT_FORM, type FormField } from "@/lib/country-forms";
import type { MigrationStepId } from "@/lib/migrations";

/** How a field is edited in the Review table, when it's shown there at all. */
export type BulkFieldEditor =
  | { kind: "text"; inputMode?: "text" | "tel" | "decimal" | "email" }
  | { kind: "select"; options: readonly string[]; placeholder?: string };

export type BulkField = {
  /**
   * The row key — and, unless `display` says otherwise, the Map step's
   * dropdown entry and the template header.
   */
  label: string;
  /**
   * What the field is called on screen and in the template where the
   * business's country words it differently — "NZBN" for the ABN column,
   * "VAT included" for "GST included". `label` stays the row key, so rows and
   * mappings made before the country context landed still line up, and a file
   * headed with the Australian name still maps.
   */
  display?: string;
  /** What the backend calls it, where the two differ. */
  apiKey?: string;
  /** Shown with an asterisk in the "Mandatory fields" list. */
  required?: boolean;
  /** The one-line explanation beside the name in that list. */
  desc?: string;
  /** Header spellings the auto-mapper should also accept. */
  aliases?: readonly string[];
  /**
   * Present when the field gets a column in the Review table. Absent fields
   * still import — they're carried, just not shown, because a table with
   * twenty columns is a table nobody reads.
   */
  review?: { heading: string; editor: BulkFieldEditor; mono?: boolean };
};

/** One way a row can be wrong. `summary` is the plural phrasing for the group. */
export type BulkIssue = {
  message: string;
  summary: string;
  test: (values: BulkValues) => boolean;
};

/** A row's cells, keyed by field label. */
export type BulkValues = Record<string, string>;

export type BulkRow = {
  /** Position in the file, 0-based. Displayed as `index + 1`. */
  index: number;
  values: BulkValues;
  /** Empty when the row is ready to import. */
  issues: string[];
};

/**
 * Everything one module tells the engine about itself.
 *
 * Deliberately data, not callbacks-with-JSX: a module that needed to render
 * its own step would be a module the engine isn't serving, and the point of
 * this is that all five look and behave identically.
 */
export type BulkImportSpec = {
  /** Dialog heading, e.g. "Invoice bulk upload". */
  title: string;
  /** The sentence under it. */
  description: string;
  /** "invoice" / "invoices" — used throughout the copy. */
  noun: string;
  nounPlural: string;
  /** Which Data Migration Center step a finished import ticks off. */
  migrationStep: MigrationStepId;
  fields: readonly BulkField[];
  /** The template's columns, in order — a subset of the field labels. */
  templateColumns: readonly string[];
  /** Example rows, aligned to `templateColumns`. Shown *and* downloaded. */
  sampleRows: readonly (readonly string[])[];
  issues: readonly BulkIssue[];
  templateFilename: string;
  errorsFilename: string;
  /** Names the row in the grouped error list — usually its first text field. */
  rowLabelField: string;
};

/** The option the Map step uses for a column that shouldn't be imported. */
export const DO_NOT_IMPORT = "Do not import";

export function fieldOptions(spec: BulkImportSpec): string[] {
  return [...spec.fields.map((field) => field.label), DO_NOT_IMPORT];
}

/** A field's on-screen name: its country's wording, else its label. */
export function fieldDisplay(field: BulkField): string {
  return field.display ?? field.label;
}

/** The on-screen name for a field label (a template column, a Map option). */
export function labelDisplay(spec: BulkImportSpec, label: string): string {
  const field = spec.fields.find((entry) => entry.label === label);
  return field ? fieldDisplay(field) : label;
}

/** Only the fields that get a column in the Review table, in order. */
export function reviewFields(spec: BulkImportSpec): BulkField[] {
  return spec.fields.filter((field) => field.review);
}

function aliasMap(spec: BulkImportSpec): Record<string, readonly string[]> {
  const aliases: Record<string, readonly string[]> = {};
  for (const field of spec.fields) {
    // The country's own name for the field matches as surely as its label.
    const names = [
      ...(field.display && field.display !== field.label ? [field.display] : []),
      ...(field.aliases ?? []),
    ];
    if (names.length) aliases[field.label] = names;
  }
  return aliases;
}

/**
 * The Map step's opening state: each column of the file matched to the field
 * its header suggests, or left on "Do not import".
 */
export function autoMapBulkColumns(
  spec: BulkImportSpec,
  columns: string[],
): Record<number, string> {
  const guessed = autoMapColumns(
    columns,
    spec.fields.map((field) => field.label),
    aliasMap(spec),
  );
  const mapping: Record<number, string> = {};
  const claimed = new Set<string>();

  columns.forEach((_, index) => {
    const field = guessed[index];
    // One field per column. Two columns both claiming "Date" would otherwise
    // both write it, last one silently winning.
    if (field && !claimed.has(field)) {
      claimed.add(field);
      mapping[index] = field;
    } else {
      mapping[index] = DO_NOT_IMPORT;
    }
  });

  return mapping;
}

/** Which fields the Map step has pointed at more than one column. */
export function duplicateBulkMappings(
  mapping: Record<number, string>,
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const field of Object.values(mapping)) {
    if (field === DO_NOT_IMPORT) continue;
    if (seen.has(field)) duplicates.add(field);
    seen.add(field);
  }

  return [...duplicates];
}

export function bulkRowIssues(
  spec: BulkImportSpec,
  values: BulkValues,
): string[] {
  return spec.issues.filter((issue) => issue.test(values)).map((i) => i.message);
}

/** Re-runs validation after an inline edit, so counts update live. */
export function withBulkIssues(spec: BulkImportSpec, row: BulkRow): BulkRow {
  return { ...row, issues: bulkRowIssues(spec, row.values) };
}

/**
 * Turns the parsed sheet into review rows using the Map step's choices.
 *
 * Reading by mapping rather than by position is the whole point of the Map
 * step: a file with its columns in a different order used to import one
 * field's values into another, silently.
 */
export function buildBulkRows(
  spec: BulkImportSpec,
  columns: string[],
  sheetRows: Record<string, string>[],
  mapping: Record<number, string>,
): BulkRow[] {
  const columnFor = (label: string): string | null => {
    const index = columns.findIndex((_, i) => mapping[i] === label);
    return index === -1 ? null : columns[index];
  };

  // Resolved once rather than per row — a 5,000-row file would otherwise scan
  // the column list once per field per row.
  const sourceColumns = new Map<string, string | null>(
    spec.fields.map((field) => [field.label, columnFor(field.label)]),
  );

  return sheetRows.map((sheetRow, index) => {
    const values: BulkValues = {};
    for (const field of spec.fields) {
      const column = sourceColumns.get(field.label);
      values[field.label] = column ? (sheetRow[column]?.trim() ?? "") : "";
    }
    return { index, values, issues: bulkRowIssues(spec, values) };
  });
}

export type BulkIssueGroup = {
  message: string;
  /** e.g. "12 rows are missing a valid Date" */
  headline: string;
  rows: BulkRow[];
};

/** Collapses one issue repeated across many rows into a single line. */
export function groupBulkIssues(
  spec: BulkImportSpec,
  rows: BulkRow[],
): BulkIssueGroup[] {
  return spec.issues
    .map((issue) => {
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
 * The downloadable starter file — the template's columns and the same rows
 * shown above the drop zone, so what someone downloads is what they were just
 * looking at.
 */
export function bulkTemplateCsv(spec: BulkImportSpec): string {
  return [
    csvRow(spec.templateColumns.map((column) => labelDisplay(spec, column))),
    ...spec.sampleRows.map((row) => csvRow([...row])),
  ].join("\r\n");
}

/**
 * The failing rows in the template's column order with an Error column
 * appended, so they can be fixed in a spreadsheet and re-uploaded as-is.
 */
export function bulkErrorRowsCsv(spec: BulkImportSpec, rows: BulkRow[]): string {
  const failing = rows.filter((row) => row.issues.length > 0);
  return [
    csvRow([...spec.templateColumns.map((column) => labelDisplay(spec, column)), "Error"]),
    ...failing.map((row) =>
      csvRow([
        ...spec.templateColumns.map((column) => row.values[column] ?? ""),
        row.issues.join("; "),
      ]),
    ),
  ].join("\r\n");
}

/**
 * One row's outcome, where the server reports per row.
 *
 * `/client/bulk/create` does; the invoice, expense and asset batch endpoints
 * answer with a bare count, so `rows` is absent for those and the results
 * dialog shows the banner and tiles alone.
 */
export type BulkResultRow = {
  /** 1-based, as the server numbers it. */
  row: number;
  status: "success" | "skipped" | "failed";
  /** Whatever names the record — a business name, an email, a row number. */
  identifier?: string;
  message?: string;
};

/** What an import reports back. `skipped` covers rows the server already had. */
export type BulkImportResult = {
  created: number;
  failed: number;
  skipped: number;
  rows?: BulkResultRow[];
};

/* ------------------------------------------------------------------ *
 * The business's country
 * ------------------------------------------------------------------ */

/**
 * What the open business's country decides about an import — the word for
 * its tax, the currency a contact starts in, the rate a row dated `date`
 * charges and the business-number rules — boiled down from the country
 * context (`bulkImportCountry` in `lib/bulk-import-country.ts`) so the specs
 * and payload builders stay pure.
 */
export type BulkImportCountry = {
  /** "GST", "VAT". */
  taxWord: string;
  /** The currency a contact the import creates starts in: AUD, NZD, ZAR. */
  currency: string;
  /** Whether the business charges tax at all — registered, and not switched off. */
  taxOffered: boolean;
  /** Percentage points a document dated `date` (YYYY-MM-DD) charges. */
  taxRateOn: (date: string) => number;
  /** The contact form's business-number field (ABN, NZBN), or null where there's none. */
  businessNumber: FormField | null;
};

/**
 * Australia, which is what every import assumed before the country context —
 * and what an import gets before that context lands. Same values as the
 * bundled Australian fallback.
 */
export const DEFAULT_BULK_IMPORT_COUNTRY: BulkImportCountry = {
  taxWord: "GST",
  currency:
    FALLBACK_CONTACT_FORM.fields.find((field) => field.key === "currency")?.default ?? "AUD",
  taxOffered: true,
  taxRateOn: () => 10,
  businessNumber: FALLBACK_CONTACT_FORM.fields.find((field) => field.key === "ABN") ?? null,
};

/* ------------------------------------------------------------------ *
 * Shared value helpers — the same coercions every module's issue list
 * and payload builder needs.
 * ------------------------------------------------------------------ */

/**
 * Reads the date formats the importers accept: the Australian DD/MM/YYYY the
 * templates specify, and the ISO form an Excel date column arrives in once
 * `parseSpreadsheet` has converted its serial number. Returns `yyyy-MM-dd`.
 */
export function parseBulkDate(value: string): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, year, month, day] = iso;
    return isRealDate(Number(year), Number(month), Number(day))
      ? `${year}-${pad(month)}-${pad(day)}`
      : null;
  }

  const local = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!local) return null;
  const [, day, month, year] = local;
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

/** Today as `yyyy-MM-dd`, in the browser's own timezone. */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Strips currency formatting. `NaN` when there's no number in there at all. */
export function bulkNumber(value: string): number {
  const cleaned = (value ?? "").replace(/[$,\s]/g, "");
  if (!cleaned) return Number.NaN;
  return Number(cleaned);
}

/** A non-negative money amount, which is what every one of these fields is. */
export function isMoney(value: string): boolean {
  const amount = bulkNumber(value);
  return Number.isFinite(amount) && amount >= 0;
}

/**
 * The yes/no spellings a spreadsheet actually contains. `null` for anything
 * unrecognised, so "required" and "invalid" stay distinguishable.
 */
export function parseBulkBoolean(value: string): boolean | null {
  const normalized = (value ?? "").replace(/\r/g, "").trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "yes", "y", "1", "paid", "included"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "n", "0", "unpaid", "excluded"].includes(normalized)) {
    return false;
  }
  return null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test((value ?? "").trim());
}

/** sole-webapp's own rule: an optional `+`, then 8 or more digits. */
export function isPhone(value: string): boolean {
  return /^\+?\d{8,15}$/.test((value ?? "").replace(/[\s()-]/g, ""));
}

/**
 * Matches a free-text category against the chart of accounts.
 *
 * Ported from sole-webapp's `findMatchingCategory`, minus its Levenshtein
 * pass. Exact then substring is predictable and explainable; fuzzy distance
 * silently books an expense to the wrong account when someone's spelling is
 * merely close, and the Review table gives no hint that it guessed.
 * Unmatched is surfaced as an issue the person can fix instead.
 */
export function matchCategory(
  value: string,
  options: readonly { id: string; name: string }[],
): string | null {
  const needle = (value ?? "").trim().toLowerCase();
  if (!needle || options.length === 0) return null;

  // A numeric cell is already an account_subcategory_id.
  if (/^\d+$/.test(needle)) {
    return options.some((option) => option.id === needle) ? needle : null;
  }

  const exact = options.find((option) => option.name.toLowerCase() === needle);
  if (exact) return exact.id;

  const partial = options.find((option) => {
    const name = option.name.toLowerCase();
    return name.includes(needle) || needle.includes(name);
  });
  return partial ? partial.id : null;
}
