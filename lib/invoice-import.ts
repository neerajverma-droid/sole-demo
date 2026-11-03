/**
 * Bulk invoice import — the field contract, validation and payload builder.
 *
 * Ported from sole-webapp's `components/Migration/BulkInvoiceMigrations.js`,
 * which posts `{ invoices: [...] }` to `/invoice/bulk/create`. Two of its
 * rules are easy to miss and both matter:
 *
 *  - **Invoice Number is optional.** Blank means the backend generates one.
 *    Requiring it here would reject perfectly importable history.
 *  - **Total is calculated, never read.** `total = sub_total + total_gst`.
 *    A "Total Amount" column in the file is deliberately not a mappable
 *    field, because a file whose own total disagrees with its parts would
 *    otherwise import an invoice that doesn't add up.
 */
import {
  DEFAULT_BULK_IMPORT_COUNTRY,
  bulkNumber,
  isEmail,
  isMoney,
  isPhone,
  parseBulkDate,
  todayIso,
  type BulkImportCountry,
  type BulkImportSpec,
  type BulkRow,
  type BulkValues,
} from "@/lib/bulk-import";

/** The statuses an imported invoice can be marked as. */
export const INVOICE_IMPORT_STATUSES = ["Draft", "Paid", "Overdue"] as const;

/**
 * Built for the business's country: its word for the tax ("GST", "VAT") in
 * every name and message, and example rows taxed at its own rate. The GST
 * column names an Australian file carries still map — they're the labels.
 */
export function invoiceImportSpec(
  country: BulkImportCountry = DEFAULT_BULK_IMPORT_COUNTRY,
): BulkImportSpec {
  const tax = country.taxWord;
  const renamed = tax !== "GST";
  const taxWord = tax.toLowerCase();
  // The examples' tax, at the business's rate today — 10% of 1200.00 is the
  // 120.00 Australian files have always shown.
  const rate = country.taxOffered ? country.taxRateOn(todayIso()) : 0;
  const sampleTax = (subTotal: number) => (subTotal * rate / 100).toFixed(2);

  return {
    title: "Invoice bulk upload",
    description: "Import your client invoices and billing history from a file.",
    noun: "invoice",
    nounPlural: "invoices",
    migrationStep: "invoices",
    templateFilename: "invoice-import-template.csv",
    errorsFilename: "invoice-import-errors.csv",
    rowLabelField: "Client name",

    fields: [
      {
        label: "Client name",
        apiKey: "client_name",
        required: true,
        desc: "Who the invoice is addressed to",
        aliases: ["client", "customer", "customer name", "bill to", "client name"],
        review: { heading: "Client", editor: { kind: "text" } },
      },
      {
        label: "Invoice number",
        apiKey: "invoice_no",
        desc: "Left blank, Sole generates one",
        aliases: ["invoice no", "invoice number", "invoice #", "number", "inv no"],
        review: { heading: "Invoice no", editor: { kind: "text" }, mono: true },
      },
      {
        label: "Invoice date",
        apiKey: "invoice_date",
        desc: "DD/MM/YYYY",
        aliases: ["invoice date", "date", "issue date", "issued"],
        review: { heading: "Date", editor: { kind: "text" }, mono: true },
      },
      {
        label: "Due date",
        apiKey: "due_date",
        desc: "DD/MM/YYYY",
        aliases: ["due date", "due", "payment due"],
        review: { heading: "Due", editor: { kind: "text" }, mono: true },
      },
      {
        label: "Sub total",
        apiKey: "sub_total",
        required: true,
        desc: `Before ${tax}, no currency symbol`,
        aliases: [
          "sub total",
          "subtotal",
          "net",
          "amount ex gst",
          "ex gst",
          ...(renamed ? [`amount ex ${taxWord}`, `ex ${taxWord}`] : []),
        ],
        review: {
          heading: "Sub total",
          editor: { kind: "text", inputMode: "decimal" },
          mono: true,
        },
      },
      {
        label: "Total GST",
        ...(renamed ? { display: `Total ${tax}` } : {}),
        apiKey: "total_gst",
        required: true,
        desc: `${tax} amount — 0 if not registered`,
        aliases: [
          "total gst",
          "gst",
          "tax",
          "gst amount",
          ...(renamed ? [taxWord, `${taxWord} amount`] : []),
        ],
        review: {
          heading: tax,
          editor: { kind: "text", inputMode: "decimal" },
          mono: true,
        },
      },
      {
        label: "Mark as",
        apiKey: "mark_as",
        desc: `${INVOICE_IMPORT_STATUSES.join(", ")} — defaults to Draft`,
        aliases: ["mark as", "status", "state", "invoice status"],
        review: {
          heading: "Status",
          editor: {
            kind: "select",
            options: INVOICE_IMPORT_STATUSES,
            placeholder: "Draft",
          },
        },
      },
      {
        label: "Client email",
        apiKey: "client_email",
        desc: "Optional",
        aliases: ["client email", "email", "customer email", "e mail"],
      },
      {
        label: "Client phone",
        apiKey: "client_phone",
        desc: "Optional",
        aliases: ["client phone", "phone", "mobile", "contact number"],
      },
      {
        label: "Client address",
        apiKey: "client_address",
        desc: "Optional",
        aliases: ["client address", "address", "billing address"],
      },
      {
        label: "Payment terms",
        apiKey: "payment_term",
        desc: "Days — defaults to 30",
        aliases: ["payment terms", "terms", "payment term", "net days"],
      },
      {
        label: "Description",
        apiKey: "description",
        desc: "Optional",
        aliases: ["description", "details", "notes", "line item"],
      },
      {
        label: "Notes",
        apiKey: "notes",
        desc: "Optional",
        aliases: ["notes", "comment", "memo"],
      },
      {
        label: "Extra discount",
        apiKey: "extra_discount",
        desc: "Optional",
        aliases: ["extra discount", "discount", "additional discount"],
      },
      {
        label: "Reference number",
        apiKey: "reference_number",
        desc: "Optional — your own reference, or a PO",
        aliases: ["reference number", "reference", "po number", "po", "ref"],
      },
    ],

    templateColumns: [
      "Client name",
      "Invoice number",
      "Invoice date",
      "Due date",
      "Sub total",
      "Total GST",
      "Mark as",
      "Client email",
    ],

    sampleRows: [
      [
        "Williams Health",
        "INV-0001",
        "20/07/2025",
        "19/08/2025",
        "1200.00",
        sampleTax(1200),
        "Paid",
        "emma.williams@email.com",
      ],
      [
        "Johnson Logistics",
        "INV-0002",
        "02/08/2025",
        "01/09/2025",
        "860.00",
        sampleTax(860),
        "Draft",
        "liam.johnson@email.com",
      ],
      ["Michael Turner", "", "14/08/2025", "13/09/2025", "450.00", sampleTax(450), "Draft", ""],
    ],

    issues: [
      {
        message: "Client name is required",
        summary: "missing a client name",
        test: (row) => row["Client name"].trim() === "",
      },
      {
        message: "Sub total must be a positive number",
        summary: "missing a valid Sub total",
        test: (row) =>
          row["Sub total"].trim() === "" || !isMoney(row["Sub total"]),
      },
      {
        message: `Total ${tax} must be a number`,
        summary: `missing a valid Total ${tax}`,
        // Required, but zero is a perfectly good answer for anyone not
        // registered for GST — so "" fails and "0" passes.
        test: (row) =>
          row["Total GST"].trim() === "" || !isMoney(row["Total GST"]),
      },
      {
        message: "Invoice date must be DD/MM/YYYY",
        summary: "carrying an unreadable Invoice date",
        test: (row) =>
          row["Invoice date"].trim() !== "" && !parseBulkDate(row["Invoice date"]),
      },
      {
        message: "Due date must be DD/MM/YYYY",
        summary: "carrying an unreadable Due date",
        test: (row) =>
          row["Due date"].trim() !== "" && !parseBulkDate(row["Due date"]),
      },
      {
        message: `Mark as must be one of: ${INVOICE_IMPORT_STATUSES.join(", ")}`,
        summary: "carrying an unrecognised status",
        test: (row) =>
          row["Mark as"].trim() !== "" &&
          !INVOICE_IMPORT_STATUSES.some(
            (status) => status.toLowerCase() === row["Mark as"].trim().toLowerCase(),
          ),
      },
      {
        message: "An invoice marked Overdue needs a Due date in the past",
        summary: "marked Overdue without a past Due date",
        // sole-webapp's own extra rule. An "overdue" invoice dated in the
        // future is a contradiction the invoice list would then display.
        test: (row) => {
          if (row["Mark as"].trim().toLowerCase() !== "overdue") return false;
          const due = parseBulkDate(row["Due date"]);
          return !due || due >= todayIso();
        },
      },
      {
        message: "Invalid client email",
        summary: "carrying a malformed email",
        test: (row) =>
          row["Client email"].trim() !== "" && !isEmail(row["Client email"]),
      },
      {
        message: "Invalid client phone",
        summary: "carrying a malformed phone number",
        test: (row) =>
          row["Client phone"].trim() !== "" && !isPhone(row["Client phone"]),
      },
    ],
  };
}

/** The Australian spec — what every import was before the country context. */
export const INVOICE_IMPORT_SPEC: BulkImportSpec = invoiceImportSpec();

/** One invoice as `/invoice/bulk/create` expects it. */
export type InvoiceImportPayload = {
  client_name: string;
  client_email: string;
  client_phone: string;
  client_address: string;
  currency: string;
  invoice_date: string;
  due_date: string;
  payment_term: number;
  description: string;
  notes: string;
  mark_as: string;
  sub_total: number;
  total_gst: number;
  total: number;
  total_discount: number;
  extra_discount: number;
  show_bank_details: number;
  is_payrixpay: number;
  is_InstantPay: number;
  template_id: number;
  invoice_no: string;
  reference_number: string;
};

function money(value: string): number {
  const amount = bulkNumber(value);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
}

/**
 * `country` sets the currency a client the import creates is held in — the
 * business's own (NZD for a New Zealand business), where this used to send
 * AUD for everyone. The tax is the file's own figure; the server records the
 * business's rate against it when it's what that rate gives.
 */
export function invoicePayload(
  values: BulkValues,
  country: BulkImportCountry = DEFAULT_BULK_IMPORT_COUNTRY,
): InvoiceImportPayload {
  const subTotal = money(values["Sub total"]);
  const totalGst = money(values["Total GST"]);
  const terms = bulkNumber(values["Payment terms"]);

  return {
    client_name: values["Client name"].trim(),
    client_email: values["Client email"].trim(),
    client_phone: values["Client phone"].trim(),
    client_address: values["Client address"].trim(),
    currency: country.currency,
    invoice_date: parseBulkDate(values["Invoice date"]) ?? "",
    due_date: parseBulkDate(values["Due date"]) ?? "",
    // sole-webapp's own fallback — 30 days when the column is absent or
    // isn't a number.
    payment_term: Number.isFinite(terms) && terms > 0 ? terms : 30,
    description: values["Description"].trim(),
    notes: values["Notes"].trim(),
    mark_as: (values["Mark as"].trim() || "Draft").toLowerCase(),
    sub_total: subTotal,
    total_gst: totalGst,
    // Calculated, never read from the file. See the note at the top.
    total: Number((subTotal + totalGst).toFixed(2)),
    total_discount: 0,
    extra_discount: money(values["Extra discount"]),
    show_bank_details: 1,
    is_payrixpay: 0,
    is_InstantPay: 0,
    template_id: 1,
    invoice_no: values["Invoice number"].trim(),
    reference_number: values["Reference number"].trim(),
  };
}

export function invoicePayloads(
  rows: BulkRow[],
  country: BulkImportCountry = DEFAULT_BULK_IMPORT_COUNTRY,
): InvoiceImportPayload[] {
  return rows.map((row) => invoicePayload(row.values, country));
}
