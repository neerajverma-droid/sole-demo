/**
 * Bank-transaction matching — shared across every module with an
 * expense-or-asset-shaped record to reconcile against the bank feed.
 * sole-webapp's own reference is a single modal, `PossibleMatchTransactionNew`
 * (components/Common/), used by expenses, assets, invoices, liabilities,
 * equity and property income alike — super contributions go through it too,
 * as plain `type="expense"`, since a contribution is stored server-side as an
 * ordinary Expenses row with `fund_id` set.
 *
 * "liability" and "equity" match sole-webapp's own branches in that modal
 * exactly: single match posts `liabilities[]`/`equities[]` to
 * `setMatchLiability`/`setMatchEquity`, multi-match posts `liability_id`/
 * `equity_id` (not `entry_id`/`type`) to `setMultipleLiability`/
 * `setMultipleEquity` — genuinely different endpoints and field names from
 * expense/asset, not just a wider union.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";

export type BankMatchType =
  | "expense"
  | "asset"
  | "liability"
  | "equity"
  | "invoice";

export type MatchCandidate = {
  id: string;
  /** Raw `transaction_date` from the server. */
  date: string;
  description: string;
  reference: string;
  amount: number;
  /** What's left unclaimed on this transaction — at most `amount`. */
  availableAmount: number;
};

type ApiMatchCandidate = {
  id: string | number;
  transaction_date: string;
  description: string;
  reference?: string | null;
  amount: string | number;
  available_amount: string | number;
};

function mapApiMatchCandidate(raw: ApiMatchCandidate): MatchCandidate {
  return {
    id: String(raw.id),
    date: raw.transaction_date,
    description: raw.description,
    reference: raw.reference ?? "",
    amount: Number(raw.amount),
    availableAmount: Number(raw.available_amount),
  };
}

export type PossibleMatches = {
  candidates: MatchCandidate[];
  /** What's still unmatched on the record itself, from the server. */
  remainingAmount: number;
};

/**
 * `multiple` isn't a client-side view of one list — it's two genuinely
 * different server queries. Without it, candidates are filtered to ones
 * whose amount falls within the record's remaining balance; with it, every
 * debit in the last 260 days is offered instead, regardless of amount. So
 * switching tabs in the UI has to refetch, not just re-filter.
 */
export async function fetchPossibleMatches(
  type: BankMatchType,
  entryId: string,
  options: { multiple?: boolean } = {},
): Promise<PossibleMatches> {
  const params: Record<string, string> = {};
  if (options.multiple) params.multiple_match_mode = "true";

  const response = await api.get<{
    success: boolean;
    data?: {
      list?: ApiMatchCandidate[];
      expense_remaining_amount?: string | number;
      asset_remaining_amount?: string | number;
    };
  }>(`${apiRoutes.bankTransaction.fetchPossibleMatchTransaction}/${type}/${entryId}`, {
    params,
  });

  const data = response.data?.data;
  const remaining = data?.expense_remaining_amount ?? data?.asset_remaining_amount;
  return {
    candidates: (data?.list ?? []).map(mapApiMatchCandidate),
    remainingAmount: remaining != null ? Number(remaining) : 0,
  };
}

/**
 * The "Assign to multiple" tab's own search box — client-side, over whatever
 * this fetch already returned (sole-webapp's `LocalSearchInput`, filtering by
 * description or amount).
 */
export function filterMatchCandidates(
  candidates: MatchCandidate[],
  query: string,
): MatchCandidate[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return candidates;
  return candidates.filter(
    (candidate) =>
      candidate.description.toLowerCase().includes(needle) ||
      candidate.amount.toString().includes(needle),
  );
}

/** Running figures while ticking candidates, against the server's own remaining balance. */
export function matchSelectionTotals(
  remainingAmount: number,
  selected: MatchCandidate[],
) {
  const selectedTotal = selected.reduce((sum, entry) => sum + entry.amount, 0);
  const remaining = Math.max(0, remainingAmount - selectedTotal);
  return {
    selectedTotal,
    remaining,
    /** Drives the danger/success colour on Remaining. */
    settled: remaining < 0.005,
  };
}

/**
 * One bank transaction, matched in full against one record. The backend can
 * come back with a shortfall (`writeoff_prompt`) or overpayment
 * (`manual_correction_required`) instead of a plain success — there's no
 * follow-up screen for either yet, so both surface as an error rather than a
 * silent partial success.
 */
function singleMatchRequest(
  type: BankMatchType,
  entryId: string,
  transactionId: string,
): { url: string; fields: Record<string, unknown> } {
  if (type === "liability") {
    return {
      url: apiRoutes.bankTransaction.setMatchLiability,
      fields: { bank_transaction_id: transactionId, liabilities: [entryId] },
    };
  }
  if (type === "equity") {
    return {
      url: apiRoutes.bankTransaction.setMatchEquity,
      fields: { bank_transaction_id: transactionId, equities: [entryId] },
    };
  }
  if (type === "invoice") {
    return {
      url: apiRoutes.bankTransaction.setMatchInvoices,
      // Matches the invoice list's own match call exactly: both ids
      // coerced to Number, unlike every other type here (which post them
      // as the plain strings they arrive in).
      fields: {
        bank_transaction_id: Number(transactionId),
        invoices: [Number(entryId)],
      },
    };
  }
  return {
    url: apiRoutes.bankTransaction.setMatchExpenses,
    fields: {
      bank_transaction_id: transactionId,
      [type === "asset" ? "assets" : "expenses"]: [entryId],
    },
  };
}

export async function matchSingleTransaction(
  type: BankMatchType,
  entryId: string,
  transactionId: string,
): Promise<void> {
  const { url, fields } = singleMatchRequest(type, entryId, transactionId);
  const body = buildEncryptedRequestBody(fields);

  const response = await api.post<{
    success: boolean;
    status?: string;
    message?: string;
  }>(url, body);

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to match that transaction");
  }
  if (response.data.status) {
    throw new Error(response.data.message || "This match needs manual review");
  }
}

function multipleMatchRequest(
  type: BankMatchType,
  entryId: string,
  transactionIds: string[],
): { url: string; fields: Record<string, unknown> } {
  if (type === "liability") {
    return {
      url: apiRoutes.bankTransaction.setMultipleLiability,
      fields: { transaction_ids: transactionIds, liability_id: entryId },
    };
  }
  if (type === "equity") {
    return {
      url: apiRoutes.bankTransaction.setMultipleEquity,
      fields: { transaction_ids: transactionIds, equity_id: entryId },
    };
  }
  if (type === "invoice") {
    return {
      url: apiRoutes.bankTransaction.setMultipleInvoices,
      fields: { transaction_ids: transactionIds, invoice_id: entryId },
    };
  }
  return {
    url: apiRoutes.bankTransaction.matchMultipleExpensesAssets,
    fields: { transaction_ids: transactionIds, entry_id: entryId, type },
  };
}

/** Several bank transactions, matched against one record's remaining balance. */
export async function matchMultipleTransactions(
  type: BankMatchType,
  entryId: string,
  transactionIds: string[],
): Promise<void> {
  const { url, fields } = multipleMatchRequest(type, entryId, transactionIds);
  const body = buildEncryptedRequestBody(fields);

  const response = await api.post<{ success: boolean; message?: string }>(
    url,
    body,
  );

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to match those transactions");
  }
}

/**
 * Reverses a match — same generic endpoint, and the same `journal_entry_id`
 * payload, sole-webapp's own "Undo match" sends for expenses, assets and
 * invoices alike. Falls back to the record's own id (`expense_id`/
 * `asset_id`) only when a journal entry id genuinely isn't known — the
 * backend can resolve that to the record's most recent matched journal entry
 * itself via `reference_type` + `reference_id`, but the direct id is what
 * the reference actually sends whenever it has one.
 */
export async function undoMatchTransaction(
  type: BankMatchType,
  entryId: string,
  journalEntryId?: string | null,
): Promise<void> {
  const body = buildEncryptedRequestBody(
    journalEntryId
      ? { journal_entry_id: journalEntryId }
      : { [`${type}_id`]: entryId },
  );

  const response = await api.post<{ success: boolean; message?: string }>(
    apiRoutes.bankTransaction.undoMatchTransaction,
    body,
  );

  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to undo that match.");
  }
}
