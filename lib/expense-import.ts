/**
 * Bulk expense import — the field contract, validation and payload builder.
 *
 * Ported from sole-webapp's `components/Migration/BulkExpenseMigration.js`,
 * which posts `{ expenses: [...] }` to `/expense/bulk/create`.
 *
 * The one piece that isn't pure data is the category. The backend wants an
 * `account_subcategory_id`, and the chart of accounts that says what those are
 * is fetched — so the spec is built by `expenseImportSpec(categories)` rather
 * than exported as a constant. That same list goes to the AI formatter with
 * the file (as id and name), which answers each row with the id of the account
 * it fits, or nothing; the row holds that id, Review shows a dropdown of the
 * accounts with it already chosen, and the person can change it.
 */
import {
  DEFAULT_BULK_IMPORT_COUNTRY,
  bulkNumber,
  isEmail,
  isMoney,
  isPhone,
  matchCategory,
  parseBulkBoolean,
  parseBulkDate,
  todayIso,
  type BulkImportCountry,
  type BulkImportSpec,
  type BulkRow,
  type BulkValues,
} from "@/lib/bulk-import";

/** A category the file can name, as the chart of accounts returns it. */
export type ExpenseCategoryOption = { id: string; name: string };

const YES_NO = ["Yes", "No"] as const;

/**
 * Builds the spec against a known set of categories.
 *
 * Passing an empty list (the fetch hasn't landed, or failed) deliberately
 * suppresses the category rule rather than failing every row: the dialog
 * blocks the upload while the list is loading, and when it failed there's
 * nothing to choose from, so requiring a pick would make every row
 * unimportable with no way to fix it.
 *
 * `country` words the tax column and its messages ("VAT included" in South
 * Africa); a file headed "GST included" still maps — that's the label.
 */
export function expenseImportSpec(
  categories: readonly ExpenseCategoryOption[],
  country: BulkImportCountry = DEFAULT_BULK_IMPORT_COUNTRY,
): BulkImportSpec {
  const known = categories.length > 0;
  const categoryOptions = categories.map(({ id, name }) => ({
    value: id,
    label: name,
  }));
  const tax = country.taxWord;
  const renamed = tax !== "GST";
  const taxWord = tax.toLowerCase();

  return {
    title: "Expense bulk upload",
    description: "Import your business expenses and receipts from a file.",
    noun: "expense",
    nounPlural: "expenses",
    migrationStep: "expenses",
    templateFilename: "expense-import-template.csv",
    errorsFilename: "expense-import-errors.csv",
    rowLabelField: "Expense name",

    fields: [
      {
        label: "Expense name",
        apiKey: "name",
        required: true,
        desc: "What the expense was for",
        aliases: [
          "expense name",
          "expense name description",
          "description",
          "name",
          "expense",
          "details",
        ],
        review: {
          heading: "Expense",
          editor: { kind: "text" },
          editWidth: "min-w-48",
        },
      },
      {
        label: "Supplier name",
        apiKey: "client_name",
        required: true,
        desc: "Who you paid",
        aliases: ["supplier name", "supplier", "vendor", "vendor name", "payee"],
        review: {
          heading: "Supplier",
          editor: { kind: "text" },
          editWidth: "min-w-44",
        },
      },
      {
        label: "Date",
        apiKey: "date",
        required: true,
        desc: "DD/MM/YYYY",
        aliases: ["date", "expense date", "transaction date", "paid on"],
        review: {
          heading: "Date",
          editor: { kind: "text" },
          mono: true,
          editWidth: "min-w-36",
        },
      },
      {
        label: "Total amount",
        apiKey: "price",
        required: true,
        desc: "What you paid in total, no currency symbol",
        aliases: ["total amount", "amount", "total", "cost", "price", "value"],
        review: {
          heading: "Amount",
          editor: { kind: "text", inputMode: "decimal" },
          mono: true,
          editWidth: "min-w-32",
        },
      },
      {
        label: "GST included",
        ...(renamed ? { display: `${tax} included` } : {}),
        apiKey: "gst",
        required: true,
        desc: "Yes or No",
        aliases: [
          "gst included",
          "gst",
          "include gst",
          "tax",
          "tax included",
          ...(renamed ? [taxWord, `include ${taxWord}`] : []),
        ],
        review: {
          heading: tax,
          editor: { kind: "select", options: YES_NO, placeholder: "Yes / No" },
          editWidth: "min-w-28",
        },
      },
      {
        label: "Category",
        apiKey: "account_subcategory_id",
        required: true,
        desc: "An expense account from your chart of accounts",
        aliases: ["category", "expense category", "account", "expense type"],
        review: {
          heading: "Category",
          editor: {
            kind: "choice",
            options: categoryOptions,
            placeholder: "Choose a category",
            // A plain-parse fallback leaves the file's own wording in the cell.
            resolve: (raw) => matchCategory(raw, categories) ?? "",
          },
          editWidth: "min-w-56",
        },
      },
      {
        label: "Paid",
        apiKey: "paid_with_cash",
        required: true,
        desc: "Yes or No — has it been paid already",
        aliases: ["paid", "is paid", "ispaid", "paid status", "settled"],
        review: {
          heading: "Paid",
          editor: { kind: "select", options: YES_NO, placeholder: "Yes / No" },
          editWidth: "min-w-28",
        },
      },
      {
        label: "Supplier email",
        apiKey: "client_email",
        desc: "Optional",
        aliases: ["supplier email", "email", "vendor email", "e mail"],
        review: {
          heading: "Email",
          editor: { kind: "text", inputMode: "email" },
          editWidth: "min-w-64",
        },
      },
      {
        label: "Supplier phone",
        apiKey: "client_phone",
        desc: "Optional",
        aliases: ["supplier phone", "phone", "mobile", "vendor phone"],
        review: {
          heading: "Phone",
          editor: { kind: "text", inputMode: "tel" },
          mono: true,
          editWidth: "min-w-44",
        },
      },
    ],

    templateColumns: [
      "Expense name",
      "Supplier name",
      "Date",
      "Total amount",
      "GST included",
      "Category",
      "Paid",
    ],

    sampleRows: [
      [
        "Office chairs",
        "Officeworks Melbourne",
        "21/07/2025",
        "482.90",
        "Yes",
        categories[0]?.name ?? "Office supplies",
        "Yes",
      ],
      [
        "Adobe Creative Cloud",
        "Adobe",
        "01/08/2025",
        "94.99",
        "Yes",
        categories[1]?.name ?? categories[0]?.name ?? "Software",
        "Yes",
      ],
      [
        "Studio rent — August",
        "Kirra Property",
        "01/08/2025",
        "1200.00",
        "No",
        categories[2]?.name ?? categories[0]?.name ?? "Rent",
        "No",
      ],
    ],

    issues: [
      {
        message: "Expense name is required",
        hint: "Required",
        field: "Expense name",
        summary: "missing an expense name",
        test: (row) => row["Expense name"].trim() === "",
      },
      {
        message: "Supplier name is required",
        hint: "Required",
        field: "Supplier name",
        summary: "missing a supplier name",
        test: (row) => row["Supplier name"].trim() === "",
      },
      {
        message: "Date is required (DD/MM/YYYY)",
        hint: "Required",
        field: "Date",
        summary: "missing a Date",
        test: (row) => row["Date"].trim() === "",
      },
      {
        message: "Date must be DD/MM/YYYY",
        hint: "Use DD/MM/YYYY",
        field: "Date",
        summary: "carrying a Date that isn't DD/MM/YYYY",
        test: (row) => row["Date"].trim() !== "" && !parseBulkDate(row["Date"]),
      },
      {
        message: "Date is in the future",
        hint: "Can't be in the future",
        field: "Date",
        summary: "dated in the future",
        test: (row) => {
          const date = parseBulkDate(row["Date"]);
          return date !== null && date > todayIso();
        },
      },
      {
        message: "Total amount is required",
        hint: "Required",
        field: "Total amount",
        summary: "missing a Total amount",
        test: (row) => row["Total amount"].trim() === "",
      },
      {
        message: "Total amount must be a positive number",
        hint: "Enter a number, e.g. 482.90",
        field: "Total amount",
        summary: "carrying a Total amount that isn't a number",
        test: (row) =>
          row["Total amount"].trim() !== "" && !isMoney(row["Total amount"]),
      },
      {
        message: `${tax} included must be Yes or No`,
        hint: "Choose Yes or No",
        field: "GST included",
        summary: `missing a Yes/No for ${tax}`,
        test: (row) => parseBulkBoolean(row["GST included"]) === null,
      },
      {
        message: "Paid must be Yes or No",
        hint: "Choose Yes or No",
        field: "Paid",
        summary: "missing a Yes/No for Paid",
        test: (row) => parseBulkBoolean(row["Paid"]) === null,
      },
      {
        message: "Category is required",
        hint: "Choose a category",
        field: "Category",
        summary: "without a category",
        test: (row) => known && row["Category"].trim() === "",
      },
      {
        message: "Category isn't one of your expense accounts",
        hint: "Not on your chart of accounts",
        field: "Category",
        summary: "naming a category that isn't on your chart of accounts",
        test: (row) =>
          known &&
          row["Category"].trim() !== "" &&
          !categories.some((category) => category.id === row["Category"].trim()),
      },
      {
        message: "Invalid supplier email",
        hint: "Not a valid email",
        field: "Supplier email",
        summary: "carrying a malformed email",
        test: (row) =>
          row["Supplier email"].trim() !== "" && !isEmail(row["Supplier email"]),
      },
      {
        message: "Invalid supplier phone",
        hint: "Use 8–15 digits",
        field: "Supplier phone",
        summary: "carrying a malformed phone number",
        test: (row) =>
          row["Supplier phone"].trim() !== "" && !isPhone(row["Supplier phone"]),
      },
    ],
  };
}

/** One expense as `/expense/bulk/create` expects it. */
export type ExpenseImportPayload = {
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  account_subcategory_id: string | null;
  name: string;
  description: string;
  date: string;
  sub_total: number;
  total_gst: number;
  gst: number;
  price: number;
  paid_with_cash: boolean;
  bulk_upload: boolean;
};

/**
 * The GST split sole-webapp performs before posting.
 *
 * A GST-inclusive total is divided back out at the business's rate (10% AU,
 * 15% NZ, or its custom rate) — the backend stores `sub_total` and `total_gst`
 * separately and doesn't derive them, so sending the gross figure as the
 * sub-total would overstate every expense's net cost by the GST on it.
 */
export function splitGst(total: number, inclusive: boolean, ratePercent: number = 10) {
  if (!inclusive || !(total > 0) || !(ratePercent > 0)) {
    return { subTotal: Number(total.toFixed(2)), totalGst: 0 };
  }
  const subTotal = total / (1 + ratePercent / 100);
  return {
    subTotal: Number(subTotal.toFixed(2)),
    totalGst: Number((total - subTotal).toFixed(2)),
  };
}

/**
 * `values["Category"]` is the category's id (from the AI formatter or the
 * dropdown); `matchCategory` still reads a name, so a row that carries one
 * posts the right id too, and an id the list doesn't know posts as null.
 */
export function expensePayload(
  values: BulkValues,
  categories: readonly ExpenseCategoryOption[],
  /** The business's rate for an expense dated `date` (YYYY-MM-DD). */
  taxRateOn: (date: string) => number = () => 10,
): ExpenseImportPayload {
  const rawTotal = bulkNumber(values["Total amount"]);
  const total = Number.isFinite(rawTotal) ? rawTotal : 0;
  const gstIncluded = parseBulkBoolean(values["GST included"]) === true;
  const date = parseBulkDate(values["Date"]) ?? todayIso();
  const { subTotal, totalGst } = splitGst(total, gstIncluded, taxRateOn(date));
  const name = values["Expense name"].trim();

  return {
    client_name: values["Supplier name"].trim() || null,
    client_email: values["Supplier email"].trim() || null,
    client_phone: values["Supplier phone"].trim() || null,
    account_subcategory_id: matchCategory(values["Category"], categories),
    name: name || "Untitled Expense",
    description: name,
    date,
    sub_total: subTotal,
    total_gst: totalGst,
    gst: gstIncluded ? 1 : 0,
    price: Number(total.toFixed(2)),
    paid_with_cash: parseBulkBoolean(values["Paid"]) === true,
    bulk_upload: true,
  };
}

export function expensePayloads(
  rows: BulkRow[],
  categories: readonly ExpenseCategoryOption[],
  taxRateOn?: (date: string) => number,
): ExpenseImportPayload[] {
  return rows.map((row) => expensePayload(row.values, categories, taxRateOn));
}
