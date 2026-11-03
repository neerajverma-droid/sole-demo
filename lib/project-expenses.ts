/**
 * A project's Expenses tab — sole-webapp's `Projects/invoices-expenses/ExpensesTab.js`.
 *
 * Reads:
 *  - `GET /v2/expense/project/:projectId` — the expenses linked to a project,
 *    paginated, with the job and invoice each one is on. Its rows use the raw
 *    model shape (`id`, `accountSubcategory`, `business_amount`), not the
 *    `/expense/list` projection `lib/expenses.ts` maps, so they get their own
 *    mapper here.
 *  - `GET /v2/expense?mode=project` — every expense not linked to any project
 *    yet, which is what "Assign to multiple" picks from.
 *  - `GET /project-job/project/:projectId` — the jobs an expense can be filed under.
 *
 * Writes, all encrypted through `buildEncryptedRequestBody`:
 *  - `PATCH /v2/expense/add-to-project` — the controller reads only
 *    `decryptPayload(req.body.data)`, so the encrypted body is the only shape
 *    it accepts. `expenseIds` survives encryption as a real array.
 *  - `POST /v2/expense` and `POST /v2/expense/edit` — create/edit carrying the
 *    project link (see `projectExpenseFields`).
 *  - Marking an expense invoiced reuses `markExpenseInvoicedApi` from
 *    `lib/expenses.ts`, which already encrypts.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import type { ExpenseDraft } from "@/lib/expenses";
import { newLineItem, type InvoiceLineItem, type InvoiceSeed } from "@/lib/invoices";
import type { PageInfo } from "@/lib/products";
import { compactPayload, num, optionalId, str, type Project } from "@/lib/projects";

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
  meta?: { total?: number | string | null } | null;
};

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

export type ProjectExpense = {
  id: string;
  /** `YYYY-MM-DD` as stored. */
  date: string;
  description: string;
  supplierName: string;
  category: string;
  jobId: string | null;
  jobLabel: string;
  invoiceId: string | null;
  invoiceNo: string;
  /** `invoice_id` or `is_invoiced` — sole-webapp treats either as already on an invoice. */
  invoiced: boolean;
  /**
   * The business portion when the expense is split, otherwise the whole price —
   * the figure sole-webapp shows in the Amount column and bills on conversion.
   */
  amount: number;
};

type ApiProjectExpenseRow = {
  id: number | string;
  name?: string | null;
  price?: number | string | null;
  business_amount?: number | string | null;
  date?: string | null;
  project_job_id?: number | string | null;
  invoice_id?: number | string | null;
  is_invoiced?: number | boolean | string | null;
  client?: { name?: string | null } | null;
  accountSubcategory?: { name?: string | null } | null;
  invoice?: { invoice_no?: string | null } | null;
  projectJob?: { job_name?: string | null; job_code?: string | null } | null;
};

/** `parseFloat(business_amount) > 0 ? business_amount : price`, as sole-webapp computes it. */
function billableAmount(raw: { business_amount?: unknown; price?: unknown }): number {
  const business = num(raw.business_amount);
  return business > 0 ? business : num(raw.price);
}

function jobLabel(job: ApiProjectExpenseRow["projectJob"]): string {
  const name = str(job?.job_name);
  if (!name) return "";
  const code = str(job?.job_code);
  return code ? `${name} (${code})` : name;
}

function mapProjectExpense(raw: ApiProjectExpenseRow): ProjectExpense {
  const invoiceId = optionalId(raw.invoice_id);
  return {
    id: str(raw.id),
    date: str(raw.date),
    description: str(raw.name),
    supplierName: str(raw.client?.name),
    category: str(raw.accountSubcategory?.name),
    jobId: optionalId(raw.project_job_id),
    jobLabel: jobLabel(raw.projectJob),
    invoiceId,
    invoiceNo: str(raw.invoice?.invoice_no),
    invoiced: Boolean(invoiceId) || num(raw.is_invoiced) === 1 || raw.is_invoiced === true,
    amount: billableAmount(raw),
  };
}

export type ProjectExpensePage = { expenses: ProjectExpense[]; total: number };

export async function fetchProjectExpenses(
  projectId: string,
  page: number,
  limit: number,
): Promise<ProjectExpensePage> {
  const response = await api.get<ApiEnvelope<ApiProjectExpenseRow[]>>(
    `${apiRoutes.projects.projectExpenseList}/${projectId}`,
    { params: { page, limit } },
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Couldn't load this project's expenses.");
  }
  const expenses = (response.data.data ?? []).map(mapProjectExpense);
  return { expenses, total: num(response.data.meta?.total, expenses.length) };
}

/**
 * The tab's stat cards. The project list has no totals endpoint, so the cards
 * read every linked expense in one request — the route applies whatever limit
 * it's given — rather than summing only the page on screen.
 */
const SUMMARY_LIMIT = 1000;

export type ProjectExpenseSummary = {
  count: number;
  total: number;
  invoiced: number;
  invoicedCount: number;
  notInvoiced: number;
  notInvoicedCount: number;
};

export async function fetchProjectExpenseSummary(
  projectId: string,
): Promise<ProjectExpenseSummary> {
  const { expenses, total: count } = await fetchProjectExpenses(projectId, 1, SUMMARY_LIMIT);
  const invoiced = expenses.filter((expense) => expense.invoiced);
  const notInvoiced = expenses.filter((expense) => !expense.invoiced);
  const sum = (rows: ProjectExpense[]) => rows.reduce((acc, row) => acc + row.amount, 0);
  return {
    count,
    total: sum(expenses),
    invoiced: sum(invoiced),
    invoicedCount: invoiced.length,
    notInvoiced: sum(notInvoiced),
    notInvoicedCount: notInvoiced.length,
  };
}

/* ------------------------------------------------------------------ *
 * Assign existing expenses
 * ------------------------------------------------------------------ */

export type UnassignedExpense = {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
};

type ApiUnassignedExpenseRow = {
  id: number | string;
  name?: string | null;
  price?: number | string | null;
  business_amount?: number | string | null;
  date?: string | null;
  accountSubcategory?: { name?: string | null } | null;
};

/** `mode=project` makes the route return only expenses with no project yet. */
export async function fetchUnassignedExpenses(
  page: number,
  limit: number,
): Promise<{ expenses: UnassignedExpense[]; total: number }> {
  const response = await api.get<ApiEnvelope<ApiUnassignedExpenseRow[]>>(
    apiRoutes.projects.getProjectExpenses,
    { params: { page, limit, mode: "project" } },
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Couldn't load your expenses.");
  }
  const expenses = (response.data.data ?? []).map((raw) => ({
    id: str(raw.id),
    date: str(raw.date),
    description: str(raw.name),
    category: str(raw.accountSubcategory?.name),
    amount: billableAmount(raw),
  }));
  return { expenses, total: num(response.data.meta?.total, expenses.length) };
}

/**
 * Files expenses under a project (and optionally one of its jobs).
 * `projectJobId` is left out rather than sent as `""` when there's no job: the
 * service only applies a job when it parses to a positive integer.
 */
export async function assignExpensesToProjectApi(input: {
  projectId: string;
  expenseIds: string[];
  projectJobId: string | null;
}): Promise<{ message: string }> {
  const response = await api.patch<ApiEnvelope<unknown>>(
    apiRoutes.expense.addExpenseToProject,
    buildEncryptedRequestBody(
      compactPayload({
        projectId: input.projectId,
        expenseIds: input.expenseIds,
        projectJobId: input.projectJobId,
      }),
    ),
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Couldn't add those expenses to the project.");
  }
  return { message: response.data.message || "Expenses added to project successfully." };
}

/* ------------------------------------------------------------------ *
 * Jobs
 * ------------------------------------------------------------------ */

export type ProjectJobOption = { id: string; label: string };

/** The first 100 jobs, as sole-webapp's tab loads them. */
export async function fetchProjectJobOptions(projectId: string): Promise<ProjectJobOption[]> {
  const response = await api.get<
    ApiEnvelope<{ id: number | string; job_name?: string | null; job_code?: string | null }[]>
  >(`${apiRoutes.projects.jobsListByProject}/${projectId}`, {
    params: { page: 1, limit: 100 },
  });
  if (!response.data?.success) return [];
  return (response.data.data ?? []).map((job) => ({
    id: str(job.id),
    label: jobLabel(job) || "Untitled job",
  }));
}

/* ------------------------------------------------------------------ *
 * Create / edit with the project link
 * ------------------------------------------------------------------ */

/**
 * The same field set `lib/expenses.ts` sends for a plain expense, plus the
 * project link. That module's mapper always sends `project_id: null`, which the
 * edit service reads as "unlink" — so editing a project expense through it would
 * drop it off the project. Mirrored here instead of reused for that reason.
 *
 * Absent ids are stripped by `compactPayload`: encryption would turn them into
 * `""`, which the service tolerates, but leaving them out matches what
 * sole-webapp's FormData sent. Flags go as 1/0, never booleans.
 */
function projectExpenseFields(
  draft: ExpenseDraft,
  projectId: string,
  projectJobId: string | null,
): Record<string, unknown> {
  const businessAmount = draft.splitEnabled ? draft.businessAmount : draft.amount;
  const personalAmount = Math.max(0, draft.amount - businessAmount);
  return compactPayload({
    name: draft.description.trim(),
    price: draft.amount,
    date: draft.date,
    account_subcategory_id: draft.categoryId || null,
    client_id: draft.supplierId,
    contact_id: draft.contactId,
    gst: draft.gst ? 1 : 0,
    paid_with_cash: draft.paymentMethod === "Cash" ? 1 : 0,
    is_split: draft.splitEnabled ? 1 : 0,
    business_amount: businessAmount.toFixed(2),
    personal_amount: personalAmount.toFixed(2),
    project_id: projectId,
    project_job_id: projectJobId,
    transaction_date: draft.date,
    is_asset: "no",
  });
}

export async function createProjectExpenseApi(input: {
  draft: ExpenseDraft;
  files: File[];
  projectId: string;
  projectJobId: string | null;
}): Promise<{ id: string }> {
  const response = await api.post<ApiEnvelope<{ id: number | string }>>(
    apiRoutes.expense.addV2,
    buildEncryptedRequestBody(
      projectExpenseFields(input.draft, input.projectId, input.projectJobId),
      input.files,
    ),
  );
  if (!response.data?.success || response.data.data?.id == null) {
    throw new Error(response.data?.message || "Failed to save expense.");
  }
  // Same event the main expense form fires, so project-created expenses count too.
  track(EVENTS.EXPENSE_LOGGED, {
    amount: input.draft.amount,
    has_receipt: input.files.length > 0,
    has_gst: Boolean(input.draft.gst),
    payment_method: input.draft.paymentMethod ?? null,
    is_split: Boolean(input.draft.splitEnabled),
  });
  return { id: String(response.data.data.id) };
}

/**
 * The edit route never touches `project_job_id`, so the job the expense is
 * filed under stays as it is — sole-webapp's edit drawer didn't offer one either.
 */
export async function updateProjectExpenseApi(input: {
  id: string;
  draft: ExpenseDraft;
  projectId: string;
}): Promise<void> {
  const fields = projectExpenseFields(input.draft, input.projectId, null);
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.expense.updateV2,
    buildEncryptedRequestBody({ id: input.id, ...fields }),
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to update expense.");
  }
}

/**
 * Category 181 is left out of the project form's list, as sole-webapp's tab
 * filters it before handing categories to its expense form.
 */
export const PROJECT_HIDDEN_CATEGORY_ID = "181";

/* ------------------------------------------------------------------ *
 * Convert to invoice
 * ------------------------------------------------------------------ */

/**
 * sole-webapp's `buildInitialData`: the project's client, and the expense as a
 * single GST-free line at its billable amount — the amount already includes
 * whatever GST was paid, so a taxable line would charge it twice.
 */
export function invoiceSeedFromProjectExpense(
  expense: ProjectExpense,
  project: Pick<Project, "id" | "clientId" | "clientName" | "name">,
): InvoiceSeed {
  const amount = expense.amount.toFixed(2);
  const line: InvoiceLineItem = {
    ...newLineItem(),
    description: expense.description || "Expense",
    quantity: "1",
    price: amount,
    gst: false,
  };
  return {
    description: expense.description || "Expense",
    items: [line],
    clientId: project.clientId,
    clientName: project.clientName || project.name,
    projectId: project.id,
  };
}

/* ------------------------------------------------------------------ *
 * Paging
 * ------------------------------------------------------------------ */

/** The pagination bar's counters for a server-paged list. */
export function pageInfo(page: number, pageSize: number, total: number): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    page: current,
    pageCount,
    total,
    from: total === 0 ? 0 : (current - 1) * pageSize + 1,
    to: Math.min(current * pageSize, total),
  };
}

/* ------------------------------------------------------------------ *
 * View
 * ------------------------------------------------------------------ */

export type ProjectExpenseFile = { url: string; name: string; isImage: boolean };

/**
 * Exactly what sole-webapp's ExpensesInfo showed when opened from a project
 * (`canEdit={false}`): the receipt and documents, name, date, category,
 * supplier, sub total, GST, total, the business/personal split when there is
 * one, and whether it was paid with cash — nothing from the main Expenses
 * screen's fuller dialog (status, invoice, matched transaction, notes).
 */
export type ProjectExpenseView = {
  name: string;
  date: string;
  category: string;
  supplier: string;
  /** Null when the server sent nothing — shown as "-", as before. */
  subTotal: number | null;
  gst: number | null;
  totalPrice: number | null;
  isSplit: boolean;
  businessAmount: number | null;
  personalAmount: number | null;
  paidWithCash: boolean;
  files: ProjectExpenseFile[];
};

type ApiExpenseDocument = { file_path?: string | null; file_url?: string | null; url?: string | null; file_name?: string | null };

type ApiExpenseView = {
  name?: string | null;
  date?: string | null;
  account_subcategory?: { name?: string | null } | null;
  client?: { name?: string | null } | null;
  sub_total?: number | string | null;
  total_gst?: number | string | null;
  total_price?: number | string | null;
  price?: number | string | null;
  is_split?: number | string | boolean | null;
  business_amount?: number | string | null;
  personal_amount?: number | string | null;
  paid_with_cash?: number | string | boolean | null;
  image?: string | null;
  image_type?: string | null;
  documents?: (ApiExpenseDocument | string)[] | null;
};

const IMAGE_FILE = /\.(jpe?g|png|gif|webp)(\?|$)/i;

/** `formatMoney` from ExpensesInfo.js: blank or non-numeric reads as "-". */
function optionalAmount(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchProjectExpenseView(id: string): Promise<ProjectExpenseView> {
  const response = await api.get<{ success?: boolean; message?: string; data?: ApiExpenseView }>(
    `${apiRoutes.expense.info}${id}`,
  );
  const raw = response.data?.data;
  if (!response.data?.success || !raw) {
    throw new Error(response.data?.message || "Expense not found.");
  }

  const total = optionalAmount(raw.total_price) ?? optionalAmount(raw.price);
  const business = num(raw.business_amount);
  // `isSplitExpense` from ExpensesInfo.js: flagged, or a business share below the total.
  const isSplit =
    Number(raw.is_split || 0) === 1 || (business > 0 && (total ?? 0) > 0 && business < (total ?? 0));

  const files: ProjectExpenseFile[] = [];
  if (raw.image) {
    files.push({
      url: raw.image,
      name: "Receipt",
      isImage: raw.image_type === "image" || IMAGE_FILE.test(raw.image),
    });
  }
  (raw.documents ?? []).forEach((document, index) => {
    const url =
      typeof document === "string"
        ? document
        : document.file_path || document.file_url || document.url || "";
    if (!url || url === raw.image) return;
    files.push({
      url,
      name: (typeof document === "string" ? "" : document.file_name?.trim()) || `Document ${index + 1}`,
      isImage: IMAGE_FILE.test(url),
    });
  });

  return {
    name: str(raw.name),
    date: str(raw.date),
    category: str(raw.account_subcategory?.name),
    supplier: str(raw.client?.name),
    subTotal: optionalAmount(raw.sub_total),
    gst: optionalAmount(raw.total_gst),
    totalPrice: total,
    isSplit,
    businessAmount: optionalAmount(raw.price),
    personalAmount: optionalAmount(raw.personal_amount),
    paidWithCash: Number(raw.paid_with_cash) === 1 || raw.paid_with_cash === true,
    files,
  };
}
