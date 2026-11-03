"use client";

import { useAtom } from "jotai";

import {
  MatchTransactionDialog as SharedMatchTransactionDialog,
  type MatchableEntity,
} from "@/components/shared/match-transaction-dialog";
import { matchInvoiceIdAtom } from "@/lib/atoms";
import { invoiceAmount, invoiceOutstanding } from "@/lib/invoices";
import { useInvoicesStore } from "@/stores/invoices";

/**
 * Reconciling an invoice against the bank feed — the same modal Super
 * Contributions, Liabilities and Equity open for "Match"/"AI Match"
 * (`components/shared/match-transaction-dialog.tsx`), parameterized here for
 * `type: "invoice"` so it hits `setMatchInvoices`/`setMultipleInvoices` with
 * the same payload the invoice list's own match call always used.
 */
export function MatchTransactionDialog() {
  const [matchId, setMatchId] = useAtom(matchInvoiceIdAtom);
  const invoices = useInvoicesStore((state) => state.invoices);
  const invoice = invoices.find((entry) => entry.id === matchId);

  const entity: MatchableEntity | null = invoice
    ? {
        id: invoice.id,
        title: invoice.number,
        subtitle: invoice.clientName,
        amount: invoiceAmount(invoice),
        remainingAmount: invoiceOutstanding(invoice),
      }
    : null;

  return (
    <SharedMatchTransactionDialog
      type="invoice"
      noun="invoice"
      open={matchId !== null}
      entity={entity}
      onClose={() => setMatchId(null)}
      invalidateQueryKeys={[["invoices"]]}
    />
  );
}
