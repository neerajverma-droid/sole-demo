"use client";

import * as React from "react";
import { useAtom } from "jotai";
import { ArrowLeftRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/documents/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { markTransferIdAtom } from "@/lib/atoms";
import { invoiceMoney } from "@/lib/invoices";
import { formatTransactionDate } from "@/lib/transactions";
import { useAccountsStore } from "@/stores/accounts";
import { useTransactionsStore } from "@/stores/transactions";
import { useMarkTransaction } from "@/hooks/use-bank-transactions-query";

/**
 * Which account the money went to.
 *
 * A transfer needs the other side named before it means anything — "this wasn't
 * income" is only half the statement. The list is the accounts on file minus
 * this transaction's own, since an account can't transfer to itself.
 */
export function MarkTransferDialog() {
  const [id, setId] = useAtom(markTransferIdAtom);
  const transactions = useTransactionsStore((state) => state.transactions);
  const mark = useMarkTransaction();
  const accounts = useAccountsStore((state) => state.accounts);

  const transaction = transactions.find((entry) => entry.id === id);
  const options = accounts
    .map(
      (account) => `${account.name} ···· ${account.account.replace(/\D/g, "")}`,
    )
    .filter((label) => label !== transaction?.account);

  const [choice, setChoice] = React.useState("");
  const saving = mark.isPending;

  // Re-seeded per transaction, since which account is excluded differs.
  const firstOption = options[0] ?? "";
  React.useEffect(() => {
    setChoice(firstOption);
  }, [id, firstOption]);

  /*
   * sole-webapp's mark-transaction with `type: "transfer"`. The backend takes
   * no destination account, so the choice above isn't sent — it names the
   * other side for the person marking it, nothing more.
   */
  const save = () => {
    if (!transaction || saving) return;
    mark.mutate(
      { row: transaction, kind: "transfer" },
      { onSettled: () => setId(null) },
    );
  };

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && setId(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary"
              aria-hidden
            >
              <ArrowLeftRight className="size-3.5" />
            </span>
            Mark as transfer
          </DialogTitle>
          <DialogDescription>
            {transaction
              ? `${transaction.description} · ${invoiceMoney(transaction.amount)} · ${formatTransactionDate(transaction.date)}`
              : null}
          </DialogDescription>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There&apos;s no other account on file to name as the other side.
            It&apos;s marked as a transfer all the same, and leaves your income
            and expense figures.
          </p>
        ) : (
          <Field label="Money went to" hint="The account on the other side.">
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger aria-label="Destination account">
                <SelectValue placeholder="Choose an account" />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setId(null)}>
            Cancel
          </Button>
          <Button
            disabled={saving || (options.length > 0 && !choice)}
            onClick={save}
          >
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            {saving ? "Marking…" : "Mark as transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
