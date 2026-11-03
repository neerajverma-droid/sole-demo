/**
 * The connected bank accounts on the Transactions screen — sole-ocr's
 * `/bank/*` resource, which proxies to the feed service: Fiskil's routes for
 * Australian accounts, `/bank/akahu/*` for New Zealand ones. Each account says
 * which it came through (`provider`), so the actions below pick the routes per
 * account rather than per country.
 *
 * Mirrors sole-webapp's `pages/bankaccounts.js` (`listAccounts`,
 * `openHistoricalSyncPrompt`) and `components/Banking/AccountSummary.js`
 * (re-sync, disconnect). The dashboard's compact list reads a different,
 * balance-only endpoint (`lib/dashboard.ts`); this one carries the account
 * number, type and per-account sync time the cards show.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { currentUserId } from "@/stores/session";
import { bankIdFor } from "@/lib/dashboard";
import type { BankFeedProvider } from "@/lib/country-context";

type ApiEnvelope<T> = { success: boolean; message?: string; data?: T };

type ApiBankAccount = {
  id: number | string;
  bank_connection_id?: number | string | null;
  bank_name?: string | null;
  account_number?: string | null;
  account_type?: string | null;
  balance?: number | string | null;
  available?: number | string | null;
  /**
   * Already formatted server-side: "29/09/2026, 11:04:10 am", in Sydney time
   * for a Fiskil account and Auckland time for an Akahu one.
   */
  last_synced_at?: string | null;
  /** "fiskil" or "akahu"; absent from older feed services, which were Fiskil-only. */
  provider?: string | null;
};

type ApiBankAccountsPayload = {
  /** The feed service's own flag, nested inside sole-ocr's envelope. */
  success?: boolean;
  accounts?: ApiBankAccount[];
  total_balance?: number | string | null;
};

export type BankAccount = {
  id: string;
  /**
   * The bank login this account came in through. Disconnecting works on this,
   * not on the account — so it takes every account sharing the login with it.
   */
  bankConnectionId: string | null;
  /** Keys into BANKS for the card's mark; null if we don't know the bank. */
  bankId: string | null;
  /** The feed it came in through — decides which `/bank` routes manage it. */
  provider: BankFeedProvider;
  name: string;
  accountNumber: string;
  /** Verbatim from the feed, e.g. "TRANS_AND_SAVINGS_ACCOUNTS" (Fiskil), "CHECKING" (Akahu). */
  accountType: string;
  balance: number;
  available: number | null;
  lastSyncedAt: string | null;
};

export type BankAccountsList = {
  accounts: BankAccount[];
  totalBalance: number;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toId(value: unknown): string | null {
  return value === null || value === undefined || value === ""
    ? null
    : String(value);
}

export function mapBankAccount(row: ApiBankAccount): BankAccount {
  return {
    id: String(row.id),
    bankConnectionId: toId(row.bank_connection_id),
    bankId: bankIdFor(row.bank_name),
    provider: row.provider === "akahu" ? "akahu" : "fiskil",
    name: row.bank_name?.trim() || "Unnamed account",
    accountNumber: row.account_number?.trim() || "",
    accountType: row.account_type?.trim() || "Unknown type",
    balance: toNumber(row.balance) ?? 0,
    available: toNumber(row.available),
    lastSyncedAt: row.last_synced_at?.trim() || null,
  };
}

/** The server's own message on a failure body, where it gave one. */
function bodyMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["message", "error"]) {
      if (typeof record[key] === "string" && record[key]) {
        return record[key] as string;
      }
    }
  }
  return fallback;
}

/**
 * Every connected account. sole-webapp treats the list as loaded only when
 * both envelopes say success — sole-ocr's, and the feed service's inside it —
 * and so does this; anything else is a failure, not an empty list.
 *
 * `userId` is still sent because sole-webapp sends it; sole-ocr ignores it and
 * reads the owner from the session.
 */
export async function fetchBankAccounts(): Promise<BankAccountsList> {
  const userId = currentUserId();
  const response = await api.get<ApiEnvelope<ApiBankAccountsPayload>>(
    apiRoutes.bankAccounts.list,
    { params: userId ? { userId } : undefined },
  );

  const body = response.data;
  if (!body?.success || body.data?.success !== true) {
    throw new Error(bodyMessage(body, "Couldn't load your bank accounts."));
  }

  const accounts = (body.data.accounts ?? []).map(mapBankAccount);
  const totalBalance =
    toNumber(body.data.total_balance) ??
    accounts.reduce((sum, account) => sum + account.balance, 0);

  return { accounts, totalBalance };
}

function requireUserId(): string {
  const userId = currentUserId();
  if (!userId) throw new Error("Sign in again before managing bank accounts.");
  return userId;
}

/** Pulls the latest transactions for one account from the bank. */
export async function refreshBankAccount(
  accountId: string,
  provider: BankFeedProvider = "fiskil",
): Promise<void> {
  const response =
    provider === "akahu"
      ? await api.post<ApiEnvelope<unknown>>(
          apiRoutes.bankConnection.akahu.singleRefresh,
          { accountId },
        )
      : await api.get<ApiEnvelope<unknown>>(
          apiRoutes.bankConnection.singleRefresh,
          { params: { userId: requireUserId(), accountId } },
        );
  if (response.data?.success === false) {
    throw new Error(bodyMessage(response.data, "Sync failed."));
  }
}

/** Revokes the bank login behind `bankConnectionId` — every account on it. */
export async function disconnectBankConnection(
  bankConnectionId: string,
  provider: BankFeedProvider = "fiskil",
): Promise<void> {
  const response =
    provider === "akahu"
      ? await api.post<ApiEnvelope<unknown>>(
          apiRoutes.bankConnection.akahu.disconnect,
          { bankConnectionId },
        )
      : await api.get<ApiEnvelope<unknown>>(
          apiRoutes.bankConnection.disconnect,
          { params: { userId: requireUserId(), bankConnectionId } },
        );
  if (response.data?.success === false) {
    throw new Error(bodyMessage(response.data, "Failed to disconnect bank."));
  }
}

type ApiHistoricalStatus = {
  alreadyImported?: boolean;
  skipped?: boolean;
  success?: boolean;
  message?: string;
};

/** sole-ocr wraps the feed service's reply in `data`; older replies don't. */
function unwrap(body: unknown): ApiHistoricalStatus {
  if (body && typeof body === "object" && "data" in body) {
    const inner = (body as { data?: unknown }).data;
    if (inner && typeof inner === "object") return inner as ApiHistoricalStatus;
  }
  return (body ?? {}) as ApiHistoricalStatus;
}

export async function fetchHistoricalStatus(
  accountId: string,
  provider: BankFeedProvider = "fiskil",
): Promise<{ alreadyImported: boolean }> {
  const response = await api.get(
    provider === "akahu"
      ? apiRoutes.bankConnection.akahu.historicalStatus(accountId)
      : apiRoutes.bankAccounts.historicalStatus(accountId),
  );
  return { alreadyImported: Boolean(unwrap(response.data).alreadyImported) };
}

export type HistoricalImportResult = "already-imported" | "started";

/**
 * Imports the previous financial year for one account: checks first, and only
 * starts a sync when that year isn't already in. The feed service works out
 * which year that is — 1 July to 30 June for a Fiskil account, 1 April to
 * 31 March for an Akahu one.
 *
 * The body is plain JSON rather than `buildEncryptedRequestBody`'s ciphertext,
 * deliberately: sole-ocr's `FiskilHistoricalSync` reads `req.body.accountId`
 * directly with no decrypt step, so an encrypted body arrives with no
 * `accountId` and is rejected. This is exactly what sole-webapp sends. Switch
 * it over once that handler goes through a `getRequestPayload`-style helper.
 */
export async function importPreviousFinancialYear(
  accountId: string,
  provider: BankFeedProvider = "fiskil",
): Promise<HistoricalImportResult> {
  const status = await fetchHistoricalStatus(accountId, provider);
  if (status.alreadyImported) return "already-imported";

  const numericId = Number(accountId);
  const response = await api.post(
    provider === "akahu"
      ? apiRoutes.bankConnection.akahu.historicalSync
      : apiRoutes.bankAccounts.historicalSync,
    { accountId: Number.isFinite(numericId) ? numericId : accountId },
  );

  const body = response.data as ApiEnvelope<unknown> | undefined;
  if (body?.success === false) {
    throw new Error(bodyMessage(body, "Historical sync failed."));
  }
  return unwrap(body).skipped ? "already-imported" : "started";
}

/**
 * Whether to show the one-off "we've upgraded bank sync, please reconnect"
 * prompt — sole-webapp's `ManageAccounts` asks this on every mount.
 */
export async function fetchBankSyncUpgradePrompt(): Promise<boolean> {
  const response = await api.get<{ showPopup?: boolean }>(
    apiRoutes.bankConnection.fiskilPopUp,
  );
  return response.data?.showPopup === true;
}

/**
 * Short labels for the connected accounts — "Bank 1", "Bank 2", … — so the
 * transaction list can say which feed a line came from without spelling out
 * the account's full name on every row. Numbered by account id, so a label
 * stays put as accounts load in any order; the account cards show the same
 * label, which is where it's explained.
 */
export function bankLabels(
  accounts: Pick<BankAccount, "id">[],
): Map<string, string> {
  const sorted = [...accounts].sort((a, b) => {
    const left = Number(a.id);
    const right = Number(b.id);
    return Number.isFinite(left) && Number.isFinite(right)
      ? left - right
      : a.id.localeCompare(b.id);
  });
  return new Map(sorted.map((account, index) => [account.id, `Bank ${index + 1}`]));
}

/**
 * The connected account a transaction came in through: by the account id the
 * line carries, else by the bank name it was imported under (older lines only
 * have the name).
 */
export function accountForTransaction(
  accounts: BankAccount[],
  line: { bankAccountId?: string | null; bankName?: string | null },
): BankAccount | undefined {
  if (line.bankAccountId) {
    const byId = accounts.find((account) => account.id === line.bankAccountId);
    if (byId) return byId;
  }
  const name = line.bankName?.trim().toLowerCase();
  if (!name) return undefined;
  return accounts.find((account) => account.name.trim().toLowerCase() === name);
}
