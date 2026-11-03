/**
 * The Match modal's two tabs — sole-webapp's `MatchTransaction.js`
 * ("Assign to Multiple" via `MatchList.js`) and `MatchCreditNote.js`
 * ("Vendor Refund" / "Client Refund").
 *
 * - Assign to Multiple settles one bank line against several records that
 *   already exist: expenses and assets for money out, invoices for money in.
 * - The refund tab posts money going back against a record that was already
 *   matched: a supplier refunding an expense (money in), or you refunding a
 *   client's invoice (money out). It writes a credit note on the fly, then
 *   matches the bank line to it.
 *
 * Every write is encrypted, as everywhere else in the app; each handler here
 * reads its body through a decrypt-aware helper in sole-ocr.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { currentUserId } from "@/stores/session";

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

export type MatchDirection = "Credit" | "Debit";

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isoDay(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

/* ------------------------------------------------------------------ *
 * Assign to Multiple — candidates
 * ------------------------------------------------------------------ */

export type CandidateKind = "Expense" | "Asset" | "Invoice";

export type MatchCandidate = {
  /** `expense:12`, `asset:4`, `invoice:9` — unique across the three tables. */
  key: string;
  id: string;
  kind: CandidateKind;
  /** Expense/asset name, or the invoice number. */
  title: string;
  /** The account (expense/asset) or the invoice's description. */
  subtitle: string;
  contactName: string;
  contactEmail: string;
  amount: number;
  /** ISO day — an expense's date, an asset's purchase date, an invoice's due date. */
  date: string;
  /** Invoices only: due / overdue / partially_paid. */
  status: string;
  /**
   * A foreign-currency invoice's figure in its own currency — sole-webapp's
   * `client.total_after_exchange`. Its presence is what makes it an FX
   * invoice.
   */
  fxAmount: string;
  currency: string;
};

type ApiAssetExpense = {
  type?: string | null;
  asset_id?: number | string | null;
  expense_id?: number | string | null;
  name?: string | null;
  price?: number | string | null;
  date?: string | null;
  date_of_purchase?: string | null;
  paid_with_cash?: number | boolean | null;
  bank_transaction_id?: number | string | null;
  client?: { name?: string | null; email?: string | null; currency?: string | null } | null;
  account_subcategory?: { name?: string | null } | null;
};

type ApiInvoice = {
  invoice_id?: number | string | null;
  invoice_no?: string | null;
  total?: number | string | null;
  status?: string | null;
  due_date?: string | null;
  description?: string | null;
  paid_with_cash?: number | boolean | null;
  bank_transaction_id?: number | string | null;
  client?: {
    name?: string | null;
    email?: string | null;
    currency?: string | null;
    total_after_exchange?: number | string | null;
  } | null;
};

/** Already settled by cash, or by another bank line — not on offer. */
function taken(row: {
  paid_with_cash?: number | boolean | null;
  bank_transaction_id?: number | string | null;
}): boolean {
  return Boolean(Number(row.paid_with_cash)) || num(row.bank_transaction_id) > 0;
}

/** The invoice statuses sole-webapp's list offers. */
const MATCHABLE_INVOICE_STATUSES = ["due", "overdue", "partially_paid"];

export function mapAssetExpense(row: ApiAssetExpense): MatchCandidate | null {
  const isAsset =
    text(row.type).toLowerCase() === "asset" ||
    (row.asset_id != null && row.expense_id == null);
  const id = isAsset ? row.asset_id : row.expense_id;
  if (id == null) return null;
  return {
    key: `${isAsset ? "asset" : "expense"}:${id}`,
    id: String(id),
    kind: isAsset ? "Asset" : "Expense",
    title: text(row.name) || (isAsset ? "Asset" : "Expense"),
    subtitle: text(row.account_subcategory?.name),
    contactName: text(row.client?.name),
    contactEmail: text(row.client?.email),
    amount: num(row.price),
    date: isoDay(isAsset ? row.date_of_purchase || row.date : row.date || row.date_of_purchase),
    status: "",
    fxAmount: "",
    currency: text(row.client?.currency),
  };
}

export function mapMatchInvoice(row: ApiInvoice): MatchCandidate | null {
  if (row.invoice_id == null) return null;
  const fx = row.client?.total_after_exchange;
  return {
    key: `invoice:${row.invoice_id}`,
    id: String(row.invoice_id),
    kind: "Invoice",
    title: text(row.invoice_no) || `Invoice #${row.invoice_id}`,
    subtitle: text(row.description).slice(0, 80),
    contactName: text(row.client?.name),
    contactEmail: text(row.client?.email),
    amount: num(row.total),
    date: isoDay(row.due_date),
    status: text(row.status).toLowerCase(),
    fxAmount: fx === null || fx === undefined || fx === "" ? "" : String(fx),
    currency: text(row.client?.currency),
  };
}

/**
 * What this bank line could be split across — sole-webapp's `getListData`:
 * unmatched expenses and assets priced up to the line's amount for money out,
 * open invoices for money in. Up to 100, newest first.
 */
export async function fetchMatchCandidates(
  direction: MatchDirection,
  amount: number,
): Promise<MatchCandidate[]> {
  if (direction === "Debit") {
    const response = await api.get<ApiEnvelope<{ asset_expense?: ApiAssetExpense[] }>>(
      apiRoutes.bankTransaction.fetchPossibleMatchExpenses,
      {
        params: {
          page_size: 100,
          "sort_by[date_of_purchase]": "desc",
          "filter_by[min_price]": 0,
          "filter_by[max_price]": amount,
        },
      },
    );
    return (response.data?.data?.asset_expense ?? [])
      .filter((row) => !taken(row))
      .map(mapAssetExpense)
      .filter((row): row is MatchCandidate => row !== null);
  }

  const response = await api.get<ApiEnvelope<{ invoice_details?: ApiInvoice[] }>>(
    apiRoutes.invoice.list,
    {
      params: {
        page_size: 100,
        "sort_by[invoice_id]": "desc",
        mode: "match_transaction",
      },
    },
  );
  return (response.data?.data?.invoice_details ?? [])
    .filter(
      (row) =>
        !taken(row) &&
        MATCHABLE_INVOICE_STATUSES.includes(text(row.status).toLowerCase()),
    )
    .map(mapMatchInvoice)
    .filter((row): row is MatchCandidate => row !== null);
}

/**
 * sole-webapp's FX rule for invoices: one foreign-currency invoice on its
 * own, or any number of AUD ones — never the two mixed.
 */
export function canSelectCandidate(
  candidate: MatchCandidate,
  selected: MatchCandidate[],
): boolean {
  if (candidate.kind !== "Invoice") return true;
  if (selected.some((entry) => entry.key === candidate.key)) return true;
  const invoices = selected.filter((entry) => entry.kind === "Invoice");
  if (invoices.length === 0) return true;
  const fxChosen = invoices.some((entry) => entry.fxAmount !== "");
  return !fxChosen && candidate.fxAmount === "";
}

async function postMatch(
  url: string,
  fields: Record<string, unknown>,
  fallback: string,
): Promise<string> {
  const response = await api.post<ApiEnvelope<unknown>>(
    url,
    buildEncryptedRequestBody(fields),
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || fallback);
  }
  return response.data.message || "";
}

/** "Match N Items/Invoices" — the selected records, in one call. */
export async function matchToMultipleApi(
  transactionId: string,
  direction: MatchDirection,
  selected: MatchCandidate[],
): Promise<string> {
  if (direction === "Debit") {
    if (selected.length === 0) {
      throw new Error("Please select at least one asset or expense to match.");
    }
    return postMatch(
      apiRoutes.bankTransaction.matchMultipleAssetsExpenses,
      {
        transaction_id: transactionId,
        expense_ids: selected.filter((row) => row.kind === "Expense").map((row) => row.id),
        asset_ids: selected.filter((row) => row.kind === "Asset").map((row) => row.id),
      },
      "Failed to match transaction.",
    );
  }

  if (selected.length === 0) {
    throw new Error("Please select at least one invoice to match.");
  }
  const fields: Record<string, unknown> = {
    transaction_id: transactionId,
    invoice_ids: selected.map((row) => row.id),
  };
  if (selected.some((row) => row.fxAmount !== "")) fields.is_fx = "1";
  return postMatch(
    apiRoutes.bankTransaction.matchMultipleInvoices,
    fields,
    "Failed to match transaction.",
  );
}

/* ------------------------------------------------------------------ *
 * Vendor / Client Refund
 * ------------------------------------------------------------------ */

/** Money in is a supplier refunding an expense; money out, you refunding an invoice. */
export function refundKind(direction: MatchDirection): "vendor" | "client" {
  return direction === "Credit" ? "vendor" : "client";
}

export type RefundRecord = {
  id: string;
  kind: "Expense" | "Invoice";
  /** Expense name, or invoice number. */
  title: string;
  contactName: string;
  date: string;
  amount: number;
  remaining: number;
  status: string;
};

export type RefundPage = {
  records: RefundRecord[];
  total: number;
  totalPages: number;
};

type ApiMatchedExpense = {
  expense_id?: number | string | null;
  id?: number | string | null;
  name?: string | null;
  client?: { name?: string | null } | null;
  date?: string | null;
  price?: number | string | null;
  remainingAmount?: number | string | null;
};

type ApiMatchedInvoice = {
  invoice_id?: number | string | null;
  id?: number | string | null;
  invoice_no?: string | null;
  client?: { name?: string | null } | null;
  invoice_date?: string | null;
  issue_date?: string | null;
  date?: string | null;
  total?: number | string | null;
  remainingAmount?: number | string | null;
  status?: string | null;
};

/** Ten to a page, as sole-webapp pages them. */
export const REFUND_PAGE_SIZE = 10;

/**
 * Records already matched, which a refund can be posted against —
 * `/expense/matched` for a vendor refund, `/invoice/matched` for a client one.
 */
export async function fetchRefundRecords(
  direction: MatchDirection,
  page: number,
): Promise<RefundPage> {
  const vendor = refundKind(direction) === "vendor";
  const response = await api.get<
    ApiEnvelope<{
      expense_details?: ApiMatchedExpense[];
      invoice_details?: ApiMatchedInvoice[];
      total?: number | string;
      total_pages?: number | string;
    }>
  >(vendor ? apiRoutes.expense.matched : apiRoutes.invoice.matched, {
    params: { page, page_size: REFUND_PAGE_SIZE },
  });

  const data = response.data?.data;
  const records: RefundRecord[] = vendor
    ? (data?.expense_details ?? []).flatMap((row) => {
        const id = row.expense_id ?? row.id;
        if (id == null) return [];
        return [
          {
            id: String(id),
            kind: "Expense" as const,
            title: text(row.name) || `Expense #${id}`,
            contactName: text(row.client?.name),
            date: isoDay(row.date),
            amount: num(row.price),
            remaining: num(row.remainingAmount),
            status: "",
          },
        ];
      })
    : (data?.invoice_details ?? []).flatMap((row) => {
        const id = row.invoice_id ?? row.id;
        if (id == null) return [];
        return [
          {
            id: String(id),
            kind: "Invoice" as const,
            title: text(row.invoice_no) || `Invoice #${id}`,
            contactName: text(row.client?.name),
            date: isoDay(row.invoice_date || row.issue_date || row.date),
            amount: num(row.total),
            remaining: num(row.remainingAmount),
            status: text(row.status).toLowerCase(),
          },
        ];
      });

  return {
    records,
    total: num(data?.total),
    totalPages: Math.max(1, num(data?.total_pages)),
  };
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * sole-webapp's `matchCreditNotes`: number a credit note, write it against
 * the chosen record (its full amount, GST 0, status issued), then match the
 * bank line to it.
 */
export async function matchRefundApi(
  transactionId: string,
  direction: MatchDirection,
  record: RefundRecord,
): Promise<string> {
  const userId = currentUserId();
  if (!userId) throw new Error("Sign in again before matching a refund.");
  const kind = refundKind(direction);

  // A number from the server, or sole-webapp's own fallback if that fails.
  let number = `CN-${Date.now()}`;
  try {
    const generated = await api.post<ApiEnvelope<string>>(
      apiRoutes.creditNote.generate,
      buildEncryptedRequestBody({ user_id: userId }),
    );
    if (generated.data?.data) number = String(generated.data.data);
  } catch {
    // Keep the fallback.
  }

  const created = await api.post<ApiEnvelope<{ id?: number | string }>>(
    apiRoutes.creditNote.add,
    buildEncryptedRequestBody({
      user_id: userId,
      type: kind,
      related_invoice_id: kind === "client" ? record.id : null,
      related_expense_id: kind === "vendor" ? record.id : null,
      status: "issued",
      reason: "Refund",
      gst_amount: 0,
      total: record.amount,
      transaction_id: transactionId,
      credit_note_date: todayIso(),
      credit_note_number: number,
    }),
  );
  const creditNoteId = created.data?.data?.id;
  if (!created.data?.success || creditNoteId == null) {
    throw new Error(created.data?.message || "Couldn't create the credit note.");
  }

  await postMatch(
    apiRoutes.bankTransaction.matchCreditNote,
    {
      transaction_id: transactionId,
      credit_note_id: String(creditNoteId),
      credit_note_type: kind,
    },
    "Failed to match credit note. Please try again.",
  );
  return "Credit note matched successfully!";
}
