/**
 * Matching an asset against a bank transaction — reconciling what it cost
 * against money that actually left the account.
 *
 * A cross-module concern deliberately kept out of `lib/assets.ts`: the
 * asset side only ever reads its own reconciliation state
 * (`isReconciled`/`remainingAmount`/`possibleMatchCount`, mapped in
 * `lib/assets.ts`); everything that actually changes it — finding
 * candidates, confirming a match, undoing one — lives here, against
 * sole-ocr's bank-transaction endpoints, not the asset ones.
 */
import { apiErrorMessage } from "@/lib/api-error";
import { assetValue, type Asset } from "@/lib/assets";
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";

/* ------------------------------------------------------------------ *
 * Which undo an asset offers
 * ------------------------------------------------------------------ */

type UndoableAsset = Pick<
  Asset,
  "paidWithCash" | "isReconciled" | "remainingAmount" | "costPrice"
> &
  Partial<Pick<Asset, "matchedJournalEntries">>;

/**
 * Whether an asset has a bank match that can be undone — fully reconciled,
 * or partly paid (something matched, something still remaining), or carrying
 * a matched journal entry. Never for one paid with cash: that "match" is a
 * cash payment, undone through `undoAssetCashPaymentApi` instead — the generic
 * undo-match would leave its cash transaction behind. The same rule as
 * sole-webapp's `canUndoAssetMatch`.
 */
export function canUndoAssetMatch(asset: UndoableAsset): boolean {
  if (asset.paidWithCash) return false;
  if (asset.isReconciled) return true;
  if ((asset.matchedJournalEntries?.length ?? 0) > 0) return true;
  const value = assetValue(asset);
  const remaining = Number(asset.remainingAmount);
  // A sub-cent gap is rounding, not a partial match.
  return Number.isFinite(remaining) && remaining > 0.005 && remaining < value - 0.005;
}

/** Whether the asset was paid with cash, which is undone as a cash payment. */
export function canUndoAssetCashPayment(
  asset: Pick<Asset, "paidWithCash">,
): boolean {
  return asset.paidWithCash;
}

/** Which undo the register offers for an asset, if any. */
export function assetUndoKind(asset: UndoableAsset): "cash" | "match" | null {
  if (canUndoAssetCashPayment(asset)) return "cash";
  if (canUndoAssetMatch(asset)) return "match";
  return null;
}

export type PossibleMatchTransaction = {
  id: string;
  date: string;
  description: string;
  amount: string;
  /** What's left unmatched on this transaction — it may already be partly used. */
  availableAmount: string;
};

type ApiPossibleMatchTransaction = {
  id: number | string;
  transaction_date?: string | null;
  description?: string | null;
  reference?: string | null;
  amount?: number | string | null;
  available_amount?: number | string | null;
};

function mapPossibleMatch(
  raw: ApiPossibleMatchTransaction,
): PossibleMatchTransaction {
  return {
    id: String(raw.id),
    date: raw.transaction_date ?? "",
    description: raw.description || raw.reference || "",
    amount: raw.amount != null ? String(raw.amount) : "0",
    availableAmount:
      raw.available_amount != null ? String(raw.available_amount) : "0",
  };
}

export type PossibleAssetMatches = {
  transactions: PossibleMatchTransaction[];
  /** The asset's own unreconciled amount, as the endpoint sees it right now. */
  remainingAmount: string;
};

/**
 * Debit bank transactions within tolerance of what's left to reconcile —
 * `GET /possible-matches/asset/:id`, confirmed against
 * `controllers/possibleMatches.js`. `multipleMatchMode` widens the candidate
 * list to every unmatched debit transaction in the lookback window (not just
 * ones within tolerance) — sole-webapp requests it for its "Assign to
 * Multiple" tab, where several smaller transactions can add up to one
 * asset's cost.
 */
export async function fetchPossibleAssetMatches(
  assetId: string,
  multipleMatchMode = false,
): Promise<PossibleAssetMatches> {
  const url = `${apiRoutes.bankTransaction.fetchPossibleMatchTransaction}/asset/${assetId}`;
  type Response = {
    success: boolean;
    message?: string;
    data?: {
      list?: ApiPossibleMatchTransaction[];
      asset_remaining_amount?: number | string;
    };
  };
  const response = multipleMatchMode
    ? await api.get<Response>(url, { params: { multiple_match_mode: true } })
    : await api.get<Response>(url);
  const data = response.data?.data;
  return {
    transactions: (data?.list ?? []).map(mapPossibleMatch),
    remainingAmount:
      data?.asset_remaining_amount != null
        ? String(data.asset_remaining_amount)
        : "0",
  };
}

/**
 * A clean match, or one of the two tolerance-exceeded outcomes the backend
 * reports instead of writing anything. Neither prompt is an error — both are
 * legitimate results this asset's price didn't exactly match the
 * transaction, and the dialog shows them rather than treating them as a
 * failed request.
 */
export type AssetMatchResult =
  | { status: "matched" }
  | {
      status: "writeoff_prompt" | "manual_correction_required";
      difference: string;
      message: string;
    };

/**
 * `POST /v2/bank-transaction/match-asset-expense` — confirmed against
 * `services/v2/bankTransaction.js`'s `setMatchAssetsExpenses`. Only ever
 * matches one asset per call here (the endpoint also accepts a batch of
 * `assets`/`expenses` together, a multi-select flow this module doesn't
 * offer). A successful match does **not** set `bank_transaction_id` back on
 * the asset — the service explicitly nulls it and records the link via a
 * journal entry / reconciliation record instead, which is why
 * `Asset.isReconciled` (not a transaction id) is the field to watch.
 */
export async function matchAssetToTransactionApi(
  assetId: string,
  bankTransactionId: string,
): Promise<AssetMatchResult> {
  const response = await api.post<{
    success?: boolean;
    message?: string;
    status?: "writeoff_prompt" | "manual_correction_required";
    difference?: string | number;
  }>(apiRoutes.bankTransaction.setMatchExpenses, {
    bank_transaction_id: bankTransactionId,
    assets: [assetId],
  });
  if (response.data?.status) {
    return {
      status: response.data.status,
      difference: String(response.data.difference ?? "0"),
      message: response.data.message || "",
    };
  }
  if (!response.data?.success) {
    throw new Error(
      response.data?.message || "Failed to match this transaction.",
    );
  }
  return { status: "matched" };
}

export type MultiMatchResult = {
  remainingAmount: number;
  /** How many of the submitted transactions were actually applied before the asset's remainder hit zero. */
  matchedCount: number;
};

/**
 * Splits one asset's remaining cost across several bank transactions —
 * `POST /v2/bank-transaction/match-multiple-asset-expense`, confirmed
 * against `services/v2/bankTransaction.js`'s
 * `matchTransactionsToAssetOrExpense`. Applies transactions in the given
 * order, each absorbed up to the smaller of its own available amount or
 * what's still left on the asset, stopping once the remainder reaches zero
 * — so trailing transactions in the list may simply go unused rather than
 * causing an error.
 */
export async function matchAssetToMultipleTransactionsApi(
  assetId: string,
  transactionIds: string[],
): Promise<MultiMatchResult> {
  const response = await api.post<{
    success: boolean;
    message?: string;
    data?: {
      remaining_amount?: number | string;
      matches?: unknown[];
    };
  }>(apiRoutes.bankTransaction.matchMultipleExpensesAssets, {
    type: "asset",
    entry_id: assetId,
    transaction_ids: transactionIds,
  });
  if (!response.data?.success) {
    throw new Error(
      response.data?.message || "Failed to match those transactions.",
    );
  }
  return {
    remainingAmount: Number(response.data.data?.remaining_amount) || 0,
    matchedCount: response.data.data?.matches?.length ?? 0,
  };
}

/**
 * `POST /v2/bank/undo-match-transaction` — confirmed against
 * `services/v2/bankTransaction.js` (`resolveUndoMatchJournalEntryId`). With a
 * `journalEntryId` that one match is undone — how an asset matched to several
 * transactions has one of them taken off. Without, `asset_id` resolves to the
 * asset's most recent matched journal entry, and the asset reverts to
 * `is_reconciled: 0` server-side.
 */
export async function undoAssetMatchApi(
  assetId: string,
  journalEntryId?: string,
): Promise<void> {
  const fallback = "Failed to undo this match.";
  let response;
  try {
    response = await api.post<{ success: boolean; message?: string }>(
      apiRoutes.bankTransaction.undoMatchTransaction,
      journalEntryId ? { journal_entry_id: journalEntryId } : { asset_id: assetId },
    );
  } catch (error) {
    // The backend answers a refusal with a 4xx/5xx and its reason in the body
    // ("Matched journal entry not found."). Axios throws that as "Request
    // failed with status code 404", which tells the person nothing — pass the
    // backend's own words on.
    throw new Error(apiErrorMessage(error, fallback));
  }
  if (!response.data?.success) {
    throw new Error(response.data?.message || fallback);
  }
}

/**
 * `POST /v2/expense/undo-paid-with-cash` with `{type: "asset", id}` — what
 * sole-webapp's own "Undo Paid with Cash" sends (as form data), confirmed
 * against `controllers/v2/expense.js`'s `undoPaidWithCashAssetsExpenses`. It
 * reverses the cash payment and removes the cash transaction with it, which
 * the generic undo-match doesn't.
 */
export async function undoAssetCashPaymentApi(assetId: string): Promise<void> {
  const fallback = "Failed to undo this cash payment.";
  const form = new FormData();
  form.append("type", "asset");
  form.append("id", assetId);
  let response;
  try {
    response = await api.post<{ success: boolean; message?: string }>(
      apiRoutes.expense.undoExpenseInvoice,
      form,
    );
  } catch (error) {
    throw new Error(apiErrorMessage(error, fallback));
  }
  // A refusal ("Asset not found or not paid with cash.") comes back as a 200.
  if (!response.data?.success) {
    throw new Error(response.data?.message || fallback);
  }
}

export type BulkUndoMatchResult = { succeeded: string[]; failed: string[] };

/**
 * `POST /v2/bank/bulk-undo-match-transaction` with `asset_ids` — the same
 * shared bulk-undo endpoint sole-webapp's own "Undo match" bulk action uses,
 * confirmed against `services/v2/bankTransaction.js`. Only ever called with
 * ids the caller has already confirmed are matched — the endpoint itself
 * doesn't validate that and would otherwise silently no-op on an unmatched
 * asset.
 */
export async function bulkUndoAssetMatchesApi(
  assetIds: string[],
): Promise<BulkUndoMatchResult> {
  const response = await api.post<{
    success: boolean;
    message?: string;
    data?: { succeeded?: (string | number)[]; failed?: (string | number)[] };
  }>(apiRoutes.bankTransaction.bulkUndoMatchTransaction, {
    asset_ids: assetIds,
  });
  if (!response.data?.success) {
    throw new Error(
      response.data?.message || "Failed to undo those matches.",
    );
  }
  const data = response.data.data ?? {};
  return {
    succeeded: (data.succeeded ?? []).map(String),
    failed: (data.failed ?? []).map(String),
  };
}
