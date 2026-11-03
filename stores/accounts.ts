import { create } from "zustand";

import { bankById, type Bank } from "@/lib/banks";

/**
 * The bank feeds, once they're something a person can add to.
 *
 * Populated from the real feed by `useDashboardBankAccountsQuery` (mirrored
 * in the same way `useInvoicesQuery` populates the invoice store). Actually
 * connecting a bank goes through the real Fiskil flow now (see
 * `lib/bank-connection.ts`, `components/transactions/connect-bank-dialog.tsx`)
 * rather than through this store — `archive`/`restore`/`remove`/`sync`/
 * `syncOne` below are still local-only, since disconnecting/refreshing a real
 * account is a separate follow-up.
 */
export type ConnectedAccount = {
  id: string;
  /** Keys into BANKS for the row's mark; null if the feed named no bank. */
  bankId: string | null;
  name: string;
  /** Masked, as a feed returns it. */
  account: string;
  balance: number;
  /**
   * The product type as the data provider names it — CDR feeds return these in
   * exactly this shouty form, and showing it verbatim is what makes an account
   * identifiable when someone has three at the same bank.
   */
  accountType: string;
  /** When this account last came back with data. Per-account, not global. */
  syncedAt: string;
  /**
   * Archived accounts stay in the data and leave the row of cards: a closed
   * account still owns the transactions it imported, so deleting it would
   * orphan them.
   */
  archived: boolean;
};

type AccountsState = {
  accounts: ConnectedAccount[];
  /** Read as "Last synced {label}" — a phrase, not a timestamp. */
  lastSynced: string;
  /** Replaces the list wholesale with a fresh feed read. */
  setAccounts: (accounts: ConnectedAccount[]) => void;
  sync: () => void;
  /** One account, rather than the lot. */
  syncOne: (id: string) => void;
  archive: (id: string) => void;
  restore: (id: string) => void;
  remove: (id: string) => void;
};

const JUST_NOW = "just now";

export const useAccountsStore = create<AccountsState>()((set) => ({
  accounts: [],
  lastSynced: "—",

  setAccounts: (accounts) => set({ accounts, lastSynced: JUST_NOW }),

  sync: () =>
    set((state) => ({
      lastSynced: JUST_NOW,
      accounts: state.accounts.map((account) =>
        account.archived ? account : { ...account, syncedAt: JUST_NOW },
      ),
    })),

  syncOne: (id) =>
    set((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === id ? { ...account, syncedAt: JUST_NOW } : account,
      ),
    })),

  archive: (id) =>
    set((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === id ? { ...account, archived: true } : account,
      ),
    })),

  restore: (id) =>
    set((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === id ? { ...account, archived: false } : account,
      ),
    })),

  remove: (id) =>
    set((state) => ({
      accounts: state.accounts.filter((account) => account.id !== id),
    })),
}));

/** The bank behind an account row, where the feed named one we know. */
export function accountBank(account: ConnectedAccount): Bank | undefined {
  return account.bankId ? bankById(account.bankId) : undefined;
}
