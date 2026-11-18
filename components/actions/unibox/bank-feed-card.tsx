"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
import { Landmark, Upload } from "lucide-react";

import {
  CardAddButton,
  CardRow,
  CardRows,
  RowAction,
  UniboxCard,
} from "@/components/actions/unibox/unibox-ui";
import { MatchTransactionDialog } from "@/components/transactions/transaction-dialogs";
import { useRefreshUnibox, useUniboxQuery } from "@/hooks/use-unibox-query";
import { matchTransactionIdAtom } from "@/lib/atoms";
import { mapUnmatchedRow } from "@/lib/bank-transactions";
import { type UniboxBankTransaction } from "@/lib/unibox";
import { isDemoRow, showSampleNotice } from "@/lib/unibox-demo";
import {
  bankAmountText,
  bankDetail,
  bankFeedRows,
  bankLabel,
  bankMatchRow,
  isCreditLine,
} from "@/lib/unibox-rules";
import { useTransactionsStore } from "@/stores/transactions";

/**
 * Opens the bank-feed match dialog on a unibox row.
 *
 * The dialog is atom-driven and finds its transaction in the transactions
 * store, which this screen never fills — so the row is mapped the way the
 * Transactions list maps it and upserted first. Field-for-field the same
 * object sole-webapp's `openBankMatch` built: the transaction's own id wins,
 * then the row id, then the priority item's entity id.
 */
export function useOpenBankMatch() {
  const setMatchId = useSetAtom(matchTransactionIdAtom);
  return React.useCallback(
    (row: Partial<UniboxBankTransaction>, fallbackId?: string | number) => {
      const prepared = bankMatchRow(row, fallbackId);
      if (!prepared) return;
      const transaction = mapUnmatchedRow(prepared as Parameters<typeof mapUnmatchedRow>[0]);
      useTransactionsStore.setState((state) => ({
        transactions: [
          transaction,
          ...state.transactions.filter((existing) => existing.id !== transaction.id),
        ],
      }));
      setMatchId(transaction.id);
    },
    [setMatchId],
  );
}

/**
 * The bank match dialog, mounted once for the whole screen — the card and the
 * urgent five both open it. When it closes the feed, the priorities and the
 * progress figures are refetched, as `handleBankMatchDone` did.
 */
export function BankMatchHost() {
  const [matchId] = useAtom(matchTransactionIdAtom);
  const refresh = useRefreshUnibox();
  const wasOpen = React.useRef(false);

  React.useEffect(() => {
    if (matchId !== null) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    void refresh("bankTransactions", "priorities", "progress");
  }, [matchId, refresh]);

  return <MatchTransactionDialog />;
}

export function BankFeedCard() {
  const router = useRouter();
  const query = useUniboxQuery("bankTransactions");
  const openMatch = useOpenBankMatch();

  const rows = bankFeedRows(query.data ?? []);

  return (
    <UniboxCard
      icon={Landmark}
      title="Bank feed"
      tourId="quick-actions-bank-feed"
      sample={query.isDemo}
      count={rows.length}
      loading={query.isLoading}
      action={
        <CardAddButton label="Import" icon={Upload} onClick={() => router.push("/transactions/bulk")} />
      }
    >
      <CardRows loading={query.isLoading} empty={rows.length === 0} emptyText="No transactions to match">
        {rows.map((row, index) => {
          const credit = isCreditLine(row);
          return (
            <CardRow
              key={String(row.bank_transacton_id ?? row.id ?? index)}
              tourId={index === 0 ? "quick-actions-bank-row" : undefined}
              icon={Landmark}
              iconTone="bg-muted text-muted-foreground"
              title={bankLabel(row)}
              sub={bankDetail(row)}
              amount={bankAmountText(row)}
              amountTone={credit ? "text-success" : "text-destructive"}
              action={
                <RowAction
                  label="Match"
                  onClick={() => (isDemoRow(row) ? showSampleNotice() : openMatch(row))}
                />
              }
            />
          );
        })}
      </CardRows>
    </UniboxCard>
  );
}
