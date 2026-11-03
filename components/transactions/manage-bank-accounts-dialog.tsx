"use client";

import * as React from "react";
import { useSetAtom } from "jotai";
import { Landmark, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BankLogo } from "@/components/transactions/bank-logo";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";

import { apiErrorMessage } from "@/lib/api-error";
import { startBankConnection } from "@/lib/bank-connection";
import { connectBankAuthUrlAtom, connectBankOpenAtom } from "@/lib/atoms";
import { bankFeedName, bankFeedProvider } from "@/lib/country-context";
import { bankById } from "@/lib/banks";
import type { BankAccount } from "@/lib/bank-accounts";
import { invoiceMoney } from "@/lib/invoices";
import { cn } from "@/lib/utils";
import { useBankSyncUpgradePrompt } from "@/hooks/use-bank-accounts-query";
import { useCountryContext } from "@/hooks/use-country-context";

/** The card's mark, or a plain bank tile where we don't know the bank. */
export function AccountMark({
  account,
  className,
}: {
  account: BankAccount;
  /** Overrides the tile's size, e.g. `size-9` for a compact card. */
  className?: string;
}) {
  const bank = account.bankId ? bankById(account.bankId) : undefined;
  if (bank) return <BankLogo bank={bank} className={className} />;
  return (
    <span
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary",
        className,
      )}
      aria-hidden
    >
      <Landmark className="size-[45%]" />
    </span>
  );
}

/**
 * "Add Bank Accounts" — sole-webapp's `ManageAccounts` modal: the accounts
 * already connected, and the one way to add another, which goes straight into
 * the provider's hosted flow (Fiskil's, or Akahu's in New Zealand) exactly as
 * it does there.
 *
 * sole-webapp's "Mark as Primary" isn't here: its endpoint
 * (`bankAccount.makePrimary`) is commented out of its own route config, so
 * there's nothing for the control to call.
 */
export function ManageBankAccountsDialog({
  open,
  onOpenChange,
  accounts,
  onDisconnect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: BankAccount[];
  onDisconnect: (account: BankAccount) => void;
}) {
  const openProviderFlow = useSetAtom(connectBankOpenAtom);
  const setAuthUrl = useSetAtom(connectBankAuthUrlAtom);
  const hasAccounts = accounts.length > 0;
  // Until the country is known the provider isn't, so the button waits for it.
  const { country, loading: countryLoading } = useCountryContext();
  const provider = bankFeedProvider(country);

  /*
   * As in sole-webapp: the button fetches Fiskil's link while showing its own
   * loading, and only then does this dialog give way to Fiskil — so there's
   * never a second, empty modal waiting on a spinner.
   */
  const connect = useMutation({
    mutationFn: () => startBankConnection(provider),
    onSuccess: (url) => {
      setAuthUrl(url);
      onOpenChange(false);
      openProviderFlow(true);
    },
    onError: (error) =>
      toast.error(
        apiErrorMessage(
          error,
          error instanceof Error && !axios.isAxiosError(error)
            ? error.message
            : "Couldn't start the bank connection. Try again.",
        ),
      ),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border p-5 text-left">
          <DialogTitle>Add Bank Accounts</DialogTitle>
          <DialogDescription>
            Connect a bank through {bankFeedName(country)}&apos;s secure,
            read-only feed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <h3 className="text-sm font-semibold">
            {hasAccounts ? "Connected accounts" : "Add a bank account"}
          </h3>
          <Button
            onClick={() => connect.mutate()}
            disabled={connect.isPending || countryLoading}
          >
            {connect.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Plus />
            )}
            {connect.isPending ? "Please wait..." : "Add Bank Account"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {hasAccounts ? (
            <ul className="space-y-2">
              {accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <AccountMark account={account} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {account.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {account.accountType}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {account.accountNumber && (
                      <p className="text-xs text-muted-foreground tabular">
                        ACC {account.accountNumber}
                      </p>
                    )}
                    <p className="text-sm font-medium tabular">
                      {invoiceMoney(account.balance)}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Disconnect ${account.name}`}
                        onClick={() => onDisconnect(account)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Disconnect {account.name}</TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No bank accounts connected yet. Add one to start importing
              transactions automatically.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The one-off "reconnect after the bank-sync upgrade" prompt. sole-ocr decides
 * whether this user still needs it; it shows once per visit at most.
 */
export function BankSyncUpgradeDialog() {
  const { data: shouldPrompt } = useBankSyncUpgradePrompt();
  const openProviderFlow = useSetAtom(connectBankOpenAtom);
  const [dismissed, setDismissed] = React.useState(false);

  return (
    <Dialog
      open={shouldPrompt === true && !dismissed}
      onOpenChange={(next) => !next && setDismissed(true)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span
            className="mb-1 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <RefreshCw className="size-5" />
          </span>
          <DialogTitle>Reconnect your bank</DialogTitle>
          <DialogDescription>
            We&apos;ve upgraded our bank sync to be faster and more reliable.
            Please re-sync your bank account.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDismissed(true)}>
            Close
          </Button>
          <Button
            onClick={() => {
              setDismissed(true);
              openProviderFlow(true);
            }}
          >
            Add Bank
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
