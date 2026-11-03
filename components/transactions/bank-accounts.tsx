"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSetAtom } from "jotai";
import {
  History,
  Landmark,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AccountMark,
  BankSyncUpgradeDialog,
  ManageBankAccountsDialog,
} from "@/components/transactions/manage-bank-accounts-dialog";
import { connectBankOpenAtom } from "@/lib/atoms";
import { bankLabels, type BankAccount } from "@/lib/bank-accounts";
import { invoiceMoney } from "@/lib/invoices";
import { cn } from "@/lib/utils";
import {
  useBankAccountsQuery,
  useDisconnectBankAccount,
  useImportPreviousYear,
  useRefreshBankAccount,
} from "@/hooks/use-bank-accounts-query";

/**
 * The connected accounts, as cards — sole-webapp's `AccountSummary`.
 *
 * The dashboard shows these as a compact list because there it's a glance; here
 * it's the thing being managed, so each account gets a card with its own
 * balance, sync state and controls. They wrap rather than scroll — a row of
 * accounts that runs off the side hides the account you were looking for.
 */
export function BankAccounts() {
  const query = useBankAccountsQuery();
  const accounts = React.useMemo(
    () => query.data?.accounts ?? [],
    [query.data],
  );
  const labels = React.useMemo(() => bankLabels(accounts), [accounts]);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState<BankAccount | null>(
    null,
  );

  useAddBankAccountDeepLink();

  return (
    <section data-tour="bank-accounts" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold">Bank accounts</h2>
          <p className="text-xs text-muted-foreground">
            {query.isPending
              ? "Loading your feeds…"
              : query.isError
                ? "Couldn't load your feeds"
                : accounts.length === 0
                  ? "No feeds connected yet"
                  : `${accounts.length} ${accounts.length === 1 ? "feed" : "feeds"} importing transactions`}
          </p>
        </div>
        <Button onClick={() => setManageOpen(true)}>
          <Landmark />
          Add Bank Accounts
        </Button>
      </div>

      {query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1].map((key) => (
            <AccountCardSkeleton key={key} />
          ))}
        </div>
      ) : query.isError ? (
        // A failed load isn't an empty list — say so, and offer the retry.
        <Empty className="rounded-xl border border-dashed border-border py-8">
          <EmptyMedia className="bg-destructive/10 text-destructive">
            <TriangleAlert aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Couldn&apos;t load your bank accounts</EmptyTitle>
          <EmptyDescription>
            {query.error instanceof Error
              ? query.error.message
              : "Something went wrong."}
          </EmptyDescription>
          <EmptyActions>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </EmptyActions>
        </Empty>
      ) : (
        accounts.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                label={labels.get(account.id) ?? ""}
                onDisconnect={() => setDisconnecting(account)}
              />
            ))}
          </div>
        )
      )}

      <ManageBankAccountsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        accounts={accounts}
        onDisconnect={setDisconnecting}
      />

      <DisconnectDialog
        account={disconnecting}
        accounts={accounts}
        onClose={() => setDisconnecting(null)}
      />

      <BankSyncUpgradeDialog />
    </section>
  );
}

/**
 * `/transactions?addBankAccount=1` opens Fiskil straight away — the deep link
 * sole-webapp's own "Connect bank" CTAs use. The flag is dropped once acted
 * on, so a refresh doesn't reopen the flow.
 */
function useAddBankAccountDeepLink() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const openProviderFlow = useSetAtom(connectBankOpenAtom);
  const flag = params?.get("addBankAccount");

  React.useEffect(() => {
    if (!flag) return;
    openProviderFlow(true);
    const next = new URLSearchParams(params?.toString() ?? "");
    next.delete("addBankAccount");
    const search = next.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, {
      scroll: false,
    });
  }, [flag, params, pathname, router, openProviderFlow]);
}

/**
 * Disconnecting revokes the bank login, not just the one account — so when
 * other accounts came in through the same login, the dialog names them.
 */
function DisconnectDialog({
  account,
  accounts,
  onClose,
}: {
  account: BankAccount | null;
  accounts: BankAccount[];
  onClose: () => void;
}) {
  const disconnect = useDisconnectBankAccount();
  const siblings = account?.bankConnectionId
    ? accounts.filter(
        (other) =>
          other.id !== account.id &&
          other.bankConnectionId === account.bankConnectionId,
      )
    : [];

  return (
    <AlertDialog
      open={account !== null}
      onOpenChange={(open) => !open && !disconnect.isPending && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Disconnect {account?.name ?? "this bank"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The feed stops importing new transactions. Transactions it has
            already imported stay where they are, and you can reconnect any
            time.
            {siblings.length > 0 &&
              ` This also disconnects ${siblings
                .map((other) => other.name)
                .join(", ")}, which ${siblings.length === 1 ? "shares" : "share"} the same bank login.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={disconnect.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={disconnect.isPending}
            onClick={(event) => {
              // Stay open until the call settles, so the pending label shows.
              event.preventDefault();
              if (!account) return;
              disconnect.mutate(account, { onSettled: onClose });
            }}
          >
            {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AccountCard({
  account,
  label,
  onDisconnect,
}: {
  account: BankAccount;
  /** "Bank 1" — what the transaction list calls this account. */
  label: string;
  onDisconnect: () => void;
}) {
  const refresh = useRefreshBankAccount();
  const importPrevious = useImportPreviousYear();
  // Only known once asked: sole-webapp likewise learns it on the first click.
  const [previousYearIn, setPreviousYearIn] = React.useState(false);

  return (
    <article className="space-y-2.5 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <AccountMark account={account} className="size-9 rounded-lg" />
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{account.name}</span>
              {/* The label the transaction list uses for this account — shown
                  here, where it can be read against the full name. */}
              {label && (
                <span
                  className="shrink-0 rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold leading-5 text-primary"
                  title={`Transactions from ${account.name} show as "${label}"`}
                >
                  {label}
                </span>
              )}
            </p>
            {/* Number and product type on one line: together they're what
                tells two accounts at the same bank apart. */}
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-xs text-muted-foreground tabular">
                {account.accountNumber || "—"}
              </span>
              <span className="truncate rounded border border-border bg-muted px-1 py-px text-[10px] font-medium tracking-wide text-muted-foreground">
                {account.accountType}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center">
          <IconAction
            label={`Re-sync ${account.name}`}
            onClick={() => refresh.mutate(account)}
            disabled={refresh.isPending}
          >
            <RefreshCw
              className={cn(
                "size-3.5",
                refresh.isPending && "motion-safe:animate-spin",
              )}
            />
          </IconAction>
          <IconAction
            label={
              previousYearIn
                ? "Previous financial year already imported"
                : "Import previous financial year"
            }
            onClick={() =>
              importPrevious.mutate(account, {
                onSuccess: () => setPreviousYearIn(true),
              })
            }
            disabled={importPrevious.isPending}
            className={previousYearIn ? "text-success" : undefined}
          >
            <History
              className={cn(
                "size-3.5",
                importPrevious.isPending && "motion-safe:animate-pulse",
              )}
            />
          </IconAction>
          <IconAction
            label={`Disconnect ${account.name}`}
            onClick={onDisconnect}
            destructive
          >
            <Trash2 className="size-3.5" />
          </IconAction>
        </div>
      </div>

      {/* Green for a positive balance, red for an overdrawn one — the sign is
          the whole point of the figure on a bank card. */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-xl font-semibold leading-tight tracking-tight tabular",
              account.balance < 0 ? "text-destructive" : "text-success",
            )}
          >
            {invoiceMoney(account.balance)}
          </p>
          {account.available !== null && (
            <p className="text-xs text-muted-foreground tabular">
              {invoiceMoney(account.available)} available
            </p>
          )}
        </div>
        <p className="shrink-0 text-right text-[11px] leading-tight text-muted-foreground tabular">
          {account.lastSyncedAt ? (
            <>
              Synced
              <br />
              {account.lastSyncedAt}
            </>
          ) : (
            "Not synced yet"
          )}
        </p>
      </div>
    </article>
  );
}

/** Same shape as a card, so the grid doesn't jump when the data lands. */
function AccountCardSkeleton() {
  return (
    <div
      className="space-y-2.5 rounded-xl border border-border bg-card p-3 shadow-sm"
      aria-hidden
    >
      <div className="flex items-center gap-2.5">
        <Shimmer className="size-9 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Shimmer className="h-3.5 w-2/3 rounded" />
          <Shimmer className="h-3 w-1/2 rounded" />
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <Shimmer className="h-6 w-1/3 rounded" />
        <Shimmer className="h-3 w-1/4 rounded" />
      </div>
    </div>
  );
}

/** The card's controls: icon-only, so each one says what it is out loud. */
function IconAction({
  label,
  onClick,
  disabled,
  destructive,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "size-7 text-muted-foreground",
            destructive ? "hover:text-destructive" : "hover:text-foreground",
            className,
          )}
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
