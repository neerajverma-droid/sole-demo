"use client";

import * as React from "react";
import axios from "axios";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { apiErrorMessage } from "@/lib/api-error";
import {
  disconnectBankConnection,
  fetchBankAccounts,
  fetchBankSyncUpgradePrompt,
  importPreviousFinancialYear,
  refreshBankAccount,
  type BankAccount,
} from "@/lib/bank-accounts";

export const BANK_ACCOUNTS_QUERY_KEY = ["bank-accounts"] as const;

/**
 * Both readers of the feeds: this screen's list, and the dashboard's balance
 * card, which reads its own endpoint but shows the same accounts.
 */
export function invalidateBankAccounts(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: BANK_ACCOUNTS_QUERY_KEY });
  void queryClient.invalidateQueries({
    queryKey: ["dashboard", "bank-accounts"],
  });
}

/**
 * The most specific message available: the server's `message` or `error`
 * (the `/bank/*` handlers use both), else the one `lib/bank-accounts.ts`
 * threw from a failure body, else the fallback.
 */
function bankErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: unknown; error?: unknown }
      | undefined;
    const fromServer = apiErrorMessage(error, "");
    if (fromServer) return fromServer;
    if (typeof data?.error === "string" && data.error) return data.error;
    return fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function useBankAccountsQuery() {
  const query = useQuery({
    queryKey: BANK_ACCOUNTS_QUERY_KEY,
    queryFn: fetchBankAccounts,
  });

  // sole-webapp toasts a failed load (`handleApiError`) as well as showing it.
  // Keyed on the failure's timestamp, so each failed attempt toasts once — not
  // once per component that reads the query.
  const { isError, error, errorUpdatedAt } = query;
  React.useEffect(() => {
    if (!isError) return;
    toast.error(bankErrorMessage(error, "Couldn't load your bank accounts."), {
      id: `bank-accounts-error-${errorUpdatedAt}`,
    });
  }, [isError, error, errorUpdatedAt]);

  return query;
}

export function useRefreshBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (account: BankAccount) =>
      refreshBankAccount(account.id, account.provider),
    onSuccess: (_, account) => {
      toast.success(`${account.name} synced`);
      invalidateBankAccounts(queryClient);
    },
    onError: (error, account) => {
      toast.error(bankErrorMessage(error, `Couldn't sync ${account.name}.`));
    },
  });
}

export function useDisconnectBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (account: BankAccount) => {
      if (!account.bankConnectionId) {
        throw new Error("This account has no bank connection to disconnect.");
      }
      return disconnectBankConnection(
        account.bankConnectionId,
        account.provider,
      );
    },
    onSuccess: (_, account) => {
      toast.success(`${account.name} disconnected`);
      invalidateBankAccounts(queryClient);
    },
    onError: (error) => {
      toast.error(
        bankErrorMessage(error, "Couldn't disconnect the bank. Try again."),
      );
    },
  });
}

export function useImportPreviousYear() {
  return useMutation({
    mutationFn: (account: BankAccount) =>
      importPreviousFinancialYear(account.id, account.provider),
    onSuccess: (result) => {
      toast.success(
        result === "already-imported"
          ? "The previous financial year is already imported for this account."
          : "Importing the previous financial year — it can take a few minutes.",
      );
    },
    onError: (error) => {
      toast.error(bankErrorMessage(error, "Historical sync failed."));
    },
  });
}

/** Asked once per session; a failure means no prompt, plus a toast as sole-webapp shows. */
export function useBankSyncUpgradePrompt() {
  const query = useQuery({
    // Not under BANK_ACCOUNTS_QUERY_KEY, so invalidating the list doesn't re-ask.
    queryKey: ["bank-sync-upgrade-prompt"],
    queryFn: fetchBankSyncUpgradePrompt,
    staleTime: Infinity,
    retry: false,
  });

  const { isError, error, errorUpdatedAt } = query;
  React.useEffect(() => {
    if (!isError) return;
    toast.error(bankErrorMessage(error, "Something went wrong."), {
      id: `bank-sync-prompt-error-${errorUpdatedAt}`,
    });
  }, [isError, error, errorUpdatedAt]);

  return query;
}
