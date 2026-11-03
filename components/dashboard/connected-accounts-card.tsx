"use client";

import * as React from "react";
import { useSetAtom } from "jotai";
import { Landmark, Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Shimmer } from "@/components/ui/shimmer";
import { BankLogo } from "@/components/transactions/bank-logo";
import { connectBankIntroOpenAtom } from "@/lib/atoms";
import { money } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";
import { accountBank, useAccountsStore } from "@/stores/accounts";
import { useDashboardBankAccountsQuery } from "@/hooks/use-dashboard-query";

/** Long enough to read as work being done, short enough not to be a wait. */
const SYNC_MS = 900;

/**
 * Light list beside the heavier income statement. Fills the row height with a
 * bottom-anchored sync line, so the two cards share a baseline instead of
 * leaving a gap under this one.
 *
 * Adding an account opens the same Connect your bank flow Transactions uses —
 * the dialog is rendered here and driven by the shared atom, so there's one
 * connect flow on the platform and this card is another door into it.
 */
export function ConnectedAccountsCard() {
  const { isLoading } = useDashboardBankAccountsQuery();
  const setConnectOpen = useSetAtom(connectBankIntroOpenAtom);
  const accounts = useAccountsStore((state) => state.accounts);
  const lastSynced = useAccountsStore((state) => state.lastSynced);
  const sync = useAccountsStore((state) => state.sync);

  const openConnect = () => setConnectOpen(true);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base">Connected accounts</CardTitle>
        {/* A button, not a link dressed as one: this opens a dialog in place,
            and Button carries the hover fill and focus ring with it. */}
        <Button variant="ghost" size="sm" onClick={openConnect}>
          <Plus className="size-4" />
          Add account
        </Button>
      </CardHeader>

      <CardContent className="flex-1 pb-5">
        {isLoading ? (
          <div className="space-y-2.5 py-1">
            <Shimmer className="h-14 w-full" />
            <Shimmer className="h-14 w-full" />
          </div>
        ) : accounts.length === 0 ? (
          <Empty className="border-0 bg-transparent px-0 py-6 shadow-none">
            <EmptyMedia>
              <Landmark aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>No accounts connected</EmptyTitle>
              <EmptyDescription>
                Connect a bank account to auto-import transactions and reconcile
                them against your invoices.
              </EmptyDescription>
            </div>
            <EmptyActions>
              <Button variant="outline" size="sm" onClick={openConnect}>
                Connect an account
              </Button>
            </EmptyActions>
          </Empty>
        ) : (
          <ul className="divide-y">
            {accounts.map((account) => {
              const bank = accountBank(account);

              return (
                <li
                  key={account.id}
                  className="flex items-center gap-3 py-2.5 first:pt-0"
                >
                  {bank ? (
                    // Smaller than the dialog's tile — this is a list row, not
                    // a thing being chosen.
                    <BankLogo bank={bank} className="size-8 rounded-lg" />
                  ) : (
                    <Landmark
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {account.name}
                    </p>
                    <p className="text-xs text-muted-foreground tabular">
                      {account.account}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular">
                    {money(account.balance)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <SyncFooter
        hasAccounts={accounts.length > 0}
        lastSynced={lastSynced}
        onSync={sync}
      />
    </Card>
  );
}

/**
 * Feed freshness, flush to the bottom — same footer treatment as the income
 * statement's net total, so the two bottom edges line up.
 *
 * The refresh icon was decoration sitting next to a sentence it looked like it
 * should control. It's the button now; with nothing connected there's nothing
 * to refresh, so it goes back to being a line of text.
 */
function SyncFooter({
  hasAccounts,
  lastSynced,
  onSync,
}: {
  hasAccounts: boolean;
  lastSynced: string;
  onSync: () => void;
}) {
  const [syncing, setSyncing] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // The sync outlives a fast navigation away from the dashboard otherwise, and
  // lands its state update on an unmounted card.
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const className =
    "mt-auto flex w-full items-center gap-2 border-t bg-muted/40 px-6 py-4 text-left text-xs text-muted-foreground";

  if (!hasAccounts) {
    return (
      <div className={className}>
        <RefreshCw className="size-3.5 shrink-0" aria-hidden />
        Nothing to sync yet
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (syncing) return;
        setSyncing(true);
        timer.current = setTimeout(() => {
          onSync();
          setSyncing(false);
        }, SYNC_MS);
      }}
      aria-label="Refresh account balances"
      aria-busy={syncing}
      className={cn(
        className,
        "outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      )}
    >
      <RefreshCw
        className={cn(
          "size-3.5 shrink-0",
          syncing && "motion-safe:animate-spin",
        )}
        aria-hidden
      />
      {syncing ? "Syncing…" : `Last synced ${lastSynced}`}
    </button>
  );
}
