/**
 * The Reporting suite's tabular reports, one config each.
 *
 * Every column below names the *exact* key string `sole-ocr` sends — these were
 * read off the SQL aliases and the controller's own display-key maps, not
 * guessed, because a key that's one character out renders an empty column with
 * no error anywhere. `lib/report-configs.test.ts` asserts each set against a
 * recorded response so a backend rename fails a test instead of a customer's
 * report.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import {
  auditTrailSource,
  reportEndpointSource,
  rowFromCells,
  pageCountOf,
  AUDIT_COLUMNS,
  type ReportColumnSpec,
  type ReportSource,
  type TabularReportConfig,
} from "@/lib/report-table";
import type { ReportPeriod } from "@/lib/report-periods";

/* ------------------------------------------------------------------ *
 * Asset Listing — report_type_id 3
 * ------------------------------------------------------------------ */

export const ASSET_LISTING_REPORT_TYPE_ID = "3";

const ASSET_LISTING_COLUMNS: ReportColumnSpec[] = [
  { key: "Asset Number", label: "#", align: "left" },
  { key: "Asset Name", emphasis: true },
  { key: "Date of Purchase", label: "Purchased", format: "date" },
  { key: "Asset Value (excl. GST)", label: "Value (ex GST)", format: "money" },
  { key: "GST Value", label: "GST", format: "money" },
  {
    key: "Asset Total Value (incl. GST)",
    label: "Total (inc GST)",
    format: "money",
  },
  {
    key: "Matched",
    format: "badge",
    align: "center",
    secondary: true,
    // Unreconciled is the row that needs doing something about, so it's the
    // one that stands out; a matched asset is simply finished.
    tone: (value) => (value.toLowerCase() === "yes" ? "success" : "warning"),
  },
];

export const assetListingConfig: TabularReportConfig = {
  id: "asset-listing",
  title: "Asset Listing",
  description: "Every asset you've bought in the period, with its GST split.",
  tip: "Assets purchased between the two dates, from the asset register. 'Matched' shows whether the purchase has been reconciled against a bank transaction.",
  columns: ASSET_LISTING_COLUMNS,
  periods: [
    "This month",
    "This quarter",
    "This financial year",
    "Last financial year",
    "Custom range",
  ] as readonly ReportPeriod[],
  source: reportEndpointSource(ASSET_LISTING_REPORT_TYPE_ID),
  itemLabel: "asset",
  reportTypeId: ASSET_LISTING_REPORT_TYPE_ID,
};

/* ------------------------------------------------------------------ *
 * Customer / Supplier — report_type_id 9
 * ------------------------------------------------------------------ */

export const CUSTOMER_SUPPLIER_REPORT_TYPE_ID = "9";

/**
 * The five things the report can list about a contact.
 *
 * `recordType` is not optional in practice: without it `getClientReport`
 * returns an unpaginated five-way `UNION ALL` while still reporting a page
 * count, so the grid would show everything and the pager would lie. One tab is
 * always selected, and one `recordType` always goes up.
 */
export const CUSTOMER_SUPPLIER_TABS = [
  "Contacts",
  "Invoices",
  "Quotes",
  "Expenses",
  "Assets",
] as const;

export type CustomerSupplierTab = (typeof CUSTOMER_SUPPLIER_TABS)[number];

/** The tab's own `recordType` value — singular, and "Contacts" is "Client". */
export const RECORD_TYPE_OF: Record<CustomerSupplierTab, string> = {
  Contacts: "Client",
  Invoices: "Invoice",
  Quotes: "Quote",
  Expenses: "Expense",
  Assets: "Asset",
};

const CONTACT_NAME: ReportColumnSpec = { key: "Contact Name", emphasis: true };

/** "Supplier" is the one worth distinguishing at a glance from a client. */
const contactTypeTone = (value: string) =>
  value.toLowerCase() === "supplier" ? ("warning" as const) : ("outline" as const);

/**
 * Every column the old report shows, for each tab.
 *
 * All 36 backend keys across the five sections are covered — the descriptions,
 * the address and the website included. They're the columns someone exports the
 * report *for*, so dropping them to keep the grid tidy would quietly make this
 * report less useful than the one it replaces.
 */
const CUSTOMER_SUPPLIER_COLUMNS: Record<CustomerSupplierTab, ReportColumnSpec[]> = {
  Contacts: [
    CONTACT_NAME,
    {
      key: "Contact Type",
      label: "Type",
      format: "badge",
      align: "center",
      tone: contactTypeTone,
    },
    { key: "Contact BusinessName", label: "Business name" },
    { key: "Contact Mail", label: "Email" },
    { key: "Contact Mobile", label: "Mobile", secondary: true },
    { key: "Contact Address", label: "Address", secondary: true },
    { key: "Contact Website", label: "Website", secondary: true },
    { key: "Contact ABN", label: "ABN", secondary: true },
  ],
  Invoices: [
    CONTACT_NAME,
    { key: "Invoice RefID", label: "Ref" },
    { key: "Invoice Status", label: "Status", format: "badge", align: "center" },
    { key: "Invoice Date", label: "Date", format: "date" },
    { key: "Invoice Due Date", label: "Due", format: "date", secondary: true },
    { key: "Invoice Value ($) - Excl. GST", label: "Ex GST", format: "money" },
    { key: "Invoice Value ($) - Incl. GST", label: "Inc GST", format: "money" },
    { key: "Invoice Description", label: "Description", secondary: true },
  ],
  Quotes: [
    CONTACT_NAME,
    { key: "Quote RefID", label: "Ref" },
    { key: "Quote Status", label: "Status", format: "badge", align: "center" },
    { key: "Quote Date", label: "Date", format: "date" },
    { key: "Quote Value ($) - Excl. GST", label: "Ex GST", format: "money" },
    { key: "Quote Value ($) - Incl. GST", label: "Inc GST", format: "money" },
    { key: "Quote Description", label: "Description", secondary: true },
  ],
  Expenses: [
    CONTACT_NAME,
    { key: "Expense Name", label: "Expense", emphasis: true },
    { key: "Expense Category", label: "Category", secondary: true },
    { key: "Expense Date", label: "Date", format: "date" },
    { key: "Expense Value ($) - Excl. GST", label: "Ex GST", format: "money" },
    { key: "Expense Value ($) - Incl. GST", label: "Inc GST", format: "money" },
    { key: "Expense Description", label: "Description", secondary: true },
  ],
  Assets: [
    CONTACT_NAME,
    { key: "Asset Name", emphasis: true },
    { key: "Asset Category", label: "Category", secondary: true },
    { key: "Asset Date", label: "Date", format: "date" },
    { key: "Asset Value ($) - Excl. GST", label: "Ex GST", format: "money" },
    { key: "Asset Value ($) - Incl. GST", label: "Inc GST", format: "money" },
  ],
};

/**
 * A row where every value is blank is the backend's *header* row, not a record.
 *
 * `getClientReport` answers an empty section with one row built from the
 * section's headers and empty values (`buildHeaderRow`), so taking the response
 * at face value would draw a single ghost row of dashes and claim a result.
 */
export function isHeaderOnlyRow(cells: Record<string, string | null>): boolean {
  const values = Object.values(cells);
  return values.length > 0 && values.every((value) => value === "" || value == null);
}

/**
 * The customer/supplier source: the standard `/report` call, minus the header
 * row the backend sends in place of an empty result.
 */
export function customerSupplierSource(): ReportSource {
  const inner = reportEndpointSource(CUSTOMER_SUPPLIER_REPORT_TYPE_ID);
  return async (args) => {
    const result = await inner(args);
    const rows = result.rows.filter((row) => !isHeaderOnlyRow(row.cells));
    if (rows.length === result.rows.length) return result;
    // Every row on the page was the placeholder, so the section is empty.
    const total = rows.length === 0 ? 0 : result.total;
    return { rows, total, pageCount: rows.length === 0 ? 1 : result.pageCount };
  };
}

export function customerSupplierConfig(tab: CustomerSupplierTab): TabularReportConfig {
  return {
    id: `customer-supplier-${tab.toLowerCase()}`,
    title: "Customer / Supplier report",
    description: "Everything on record against your clients and suppliers.",
    tip: "One contact's dealings with you: their details, and the invoices, quotes, expenses and assets recorded against them in the period.",
    columns: CUSTOMER_SUPPLIER_COLUMNS[tab],
    periods: [
      "This month",
      "This quarter",
      "This financial year",
      "Last financial year",
      "Custom range",
    ] as readonly ReportPeriod[],
    source: customerSupplierSource(),
    itemLabel: tab === "Contacts" ? "contact" : tab.slice(0, -1).toLowerCase(),
    reportTypeId: CUSTOMER_SUPPLIER_REPORT_TYPE_ID,
  };
}

/* ------------------------------------------------------------------ *
 * Chart of Accounts — report_type_id 10
 * ------------------------------------------------------------------ */

export const CHART_OF_ACCOUNTS_REPORT_TYPE_ID = "10";

/** The order every accounting package lists accounts in — `REPORT_SECTION_ORDER`. */
export const COA_SECTIONS = [
  "Assets",
  "Liabilities",
  "Equity",
  "Income",
  "Cost of Sales",
  "Expenses",
] as const;

export type CoaSection = (typeof COA_SECTIONS)[number];

/** What the grid can be ordered by, server-side — the backend's whitelist. */
export const COA_SORTS = ["code", "name", "section"] as const;
export type CoaSort = (typeof COA_SORTS)[number];

/**
 * What an account's derived GST treatment looks like at a glance.
 *
 * "Mixed" is the one that earns a colour: an account posted both ways usually
 * means something was coded wrong, and finding those is why you read this list
 * before a BAS.
 */
export function gstTreatmentTone(label: string): "success" | "warning" | "secondary" | "outline" {
  if (label === "GST") return "success";
  if (label.startsWith("Mixed")) return "warning";
  if (label === "No transactions") return "secondary";
  return "outline";
}

const COA_COLUMNS: ReportColumnSpec[] = [
  // Repeats are blanked, so a run of accounts in one section reads as a group —
  // the same thing the old report's table did while rendering.
  { key: "Section", sortKey: "section", groupRuns: true },
  { key: "Account Code", label: "Code", sortKey: "code" },
  { key: "Account Name", label: "Account", emphasis: true, sortKey: "name" },
  {
    key: "GST Treatment",
    label: "GST treatment",
    format: "badge",
    align: "center",
    tone: gstTreatmentTone,
  },
  { key: "Transactions", format: "number" },
];

export const chartOfAccountsConfig: TabularReportConfig = {
  id: "chart-of-accounts",
  title: "Chart of Accounts",
  description: "Every account in your ledger, and how each one is treated for GST.",
  tip: "The full account list, with how many transactions have been coded to each and the GST treatment those transactions imply. Personal and Transfer accounts are left out.",
  columns: COA_COLUMNS,
  periods: [],
  source: reportEndpointSource(CHART_OF_ACCOUNTS_REPORT_TYPE_ID),
  itemLabel: "account",
  reportTypeId: CHART_OF_ACCOUNTS_REPORT_TYPE_ID,
  // `getChartsAccountData` accepts start/end and never uses them — the whole
  // ledger is counted whatever dates go up. A period control here would be a
  // lie, so there isn't one.
  dated: false,
};

/* ------------------------------------------------------------------ *
 * Cash Flow — report_type_id 11
 * ------------------------------------------------------------------ */

export const CASH_FLOW_REPORT_TYPE_ID = "11";

const CASH_FLOW_TONE: Record<string, "success" | "warning" | "secondary" | "outline"> = {
  Inflow: "success",
  Outflow: "outline",
  "Non-Cash": "secondary",
};

const CASH_FLOW_COLUMNS: ReportColumnSpec[] = [
  { key: "Date", format: "date" },
  { key: "Transaction Type", label: "Type", secondary: true },
  { key: "Account Code", label: "Code", secondary: true },
  { key: "Account Name", label: "Account", emphasis: true },
  {
    key: "Cash Flow Type",
    label: "Flow",
    format: "badge",
    align: "center",
    tone: (value) => CASH_FLOW_TONE[value] ?? "outline",
  },
  { key: "Debit", format: "money" },
  { key: "Credit", format: "money" },
  { key: "Net Movement", label: "Net", format: "money" },
];

export const cashFlowConfig: TabularReportConfig = {
  id: "cash-flow",
  title: "Cash Flows",
  description: "The movement of money in and out of your bank and cash accounts.",
  tip: "Every transaction that hit a bank, cash or clearing account in the period, and which way it moved. This is liquidity, not profit — a sale on credit shows here only once it's actually banked.",
  columns: CASH_FLOW_COLUMNS,
  periods: [
    "This month",
    "This quarter",
    "This financial year",
    "Last financial year",
    "Custom range",
  ] as readonly ReportPeriod[],
  source: reportEndpointSource(CASH_FLOW_REPORT_TYPE_ID),
  itemLabel: "transaction",
  reportTypeId: CASH_FLOW_REPORT_TYPE_ID,
};

/** The drill-down behind one account row — `Subcategory Id` is its key. */
export type AccountDetail = {
  account: { subcategory_id: number; code: string; name: string; category: string };
  gst_treatment: {
    source: string;
    entries: number;
    with_gst: number;
    without_gst: number;
    gst_percentage: number;
    label: string;
  };
  activity: { net_amount: number; first_posted: string | null; last_posted: string | null };
};

export async function fetchAccountDetail(subcategoryId: string): Promise<AccountDetail> {
  const response = await api.get<{ success?: boolean; message?: string; data?: AccountDetail }>(
    `${apiRoutes.reporting.account}/${encodeURIComponent(subcategoryId)}`,
  );
  if (response.data.success === false || !response.data.data) {
    throw new Error(response.data.message ?? "Account not found.");
  }
  return response.data.data;
}

/* ------------------------------------------------------------------ *
 * Audit Trail — its own endpoint
 * ------------------------------------------------------------------ */

/**
 * Column order follows the old report's, with one addition.
 *
 * `sole-webapp` heads its last column "Action Performed" and renders
 * `description` into it — the readable sentence — so `action`, the raw event
 * name, was never shown at all. Description keeps that column and that weight;
 * `action` is added beside it rather than in place of it, because "which event
 * was this" is the thing you need when two entries read the same.
 */
const AUDIT_COLUMNS_SPEC: ReportColumnSpec[] = [
  { key: AUDIT_COLUMNS.when, label: "Date" },
  { key: AUDIT_COLUMNS.who, label: "Performed by" },
  { key: AUDIT_COLUMNS.module, label: "Module", format: "badge", align: "center" },
  { key: AUDIT_COLUMNS.description, label: "Action performed", emphasis: true },
  { key: AUDIT_COLUMNS.action, label: "Event", secondary: true },
];

/**
 * The Audit Trail.
 *
 * Not a report in `sole-ocr`'s sense at all — it has no `report_type_id`, no
 * date filter and no export endpoint, so it offers neither a period control nor
 * a download rather than pretending to. `When` keeps the backend's own
 * `"29/09/2026 at 03:41 PM"` string, because the time is the point of an audit
 * entry and reformatting to a date alone would throw it away.
 */
export const auditTrailConfig: TabularReportConfig = {
  id: "audit-trail",
  title: "Audit trail",
  description: "Who changed what, and when.",
  tip: "Every recorded change to your books, newest first. Read-only, and kept whether or not the record it describes still exists.",
  columns: AUDIT_COLUMNS_SPEC,
  periods: [],
  source: auditTrailSource,
  itemLabel: "entry",
  dated: false,
};

export { pageCountOf, rowFromCells };
