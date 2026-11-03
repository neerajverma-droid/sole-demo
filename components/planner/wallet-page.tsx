"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, Banknote, Wallet, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import { MoneyInput } from "@/components/planner/money-input";
import {
  PLANNER_ROOT,
  PlannerDetailHeader,
  usePlannerSection,
} from "@/components/planner/planner-detail";
import {
  StatCards,
  type StatCard,
} from "@/components/ui/stat-cards";
import { formatInvoiceDate, invoiceMoney } from "@/lib/invoices";
import {
  availableCash,
  cashOnHand,
  signedMoney,
  walletMovementIssue,
  walletTotals,
} from "@/lib/planner";
import { cn } from "@/lib/utils";
import {
  useCashWalletQuery,
  usePlannerBankAccountsQuery,
  useRemoveWalletMovementMutation,
  useWalletMovementMutation,
} from "@/hooks/use-planner-query";
import { apiErrorMessage } from "@/lib/api-error";
import { usePlannerStore, useWalletBalance } from "@/stores/planner";

const AVAILABLE_TIP =
  "Cash across your bank accounts and cash wallet, less what you've earmarked for goals and committed to expense plans.";
const WALLET_TIP =
  "What the wallet opened with, plus every movement recorded below.";

/**
 * The cash wallet page.
 *
 * A page rather than a dialog, matching the goal and expense-plan details: it
 * carries three figures, a form and a history, and a modal that holds a ledger
 * is a modal that wants to be a page.
 */
export function WalletPage() {
  usePlannerSection("Overview");

  const opening = usePlannerStore((state) => state.walletOpening);
  const movements = usePlannerStore((state) => state.walletMovements);
  const goals = usePlannerStore((state) => state.goals);
  const plans = usePlannerStore((state) => state.plans);
  const balance = useWalletBalance();

  // The page is reachable directly, so it loads the wallet itself rather than
  // relying on the planner screen having been visited first.
  useCashWalletQuery();
  // Cash on hand counts the bank accounts too, not just the wallet.
  const banks = usePlannerBankAccountsQuery().data ?? [];
  // What's left once goal allocations are taken off — the ceiling on cash out.
  const available = usePlannerStore((state) => state.wallet?.available ?? 0);
  const recordMovement = useWalletMovementMutation();
  const removeMovement = useRemoveWalletMovementMutation();

  const totals = walletTotals(movements);

  const stats: StatCard[] = [
    {
      key: "wallet",
      label: "Cash wallet balance",
      tip: WALLET_TIP,
      value: invoiceMoney(balance),
      meta: `opened at ${invoiceMoney(opening)}`,
      icon: Wallet,
    },
    {
      key: "movements",
      label: "Recorded movements",
      value: String(movements.length),
      meta:
        movements.length > 0
          ? `${invoiceMoney(totals.in)} in · ${invoiceMoney(totals.out)} out`
          : "Nothing recorded yet",
      icon: Banknote,
    },
    {
      key: "available",
      label: "Estimated available cash",
      tip: AVAILABLE_TIP,
      value: invoiceMoney(availableCash(balance, goals, plans, banks)),
      meta: `${invoiceMoney(cashOnHand(balance, banks))} on hand across all accounts`,
      icon: ArrowUpRight,
    },
  ];

  return (
    <div className="space-y-6">
      <PlannerDetailHeader
        backHref={PLANNER_ROOT}
        backLabel="Business planner"
        crumbs={[
          { label: "Business planner", href: PLANNER_ROOT },
          { label: "Cash wallet" },
        ]}
      />

      <div data-usertour="wallet-stats">
        <StatCards stats={stats} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <AddCashCard
          balance={balance}
          available={available}
          pending={recordMovement.isPending}
          onAdd={async (movement) => {
            try {
              await recordMovement.mutateAsync(movement);
              return true;
            } catch (error) {
              toast.error(apiErrorMessage(error, "Failed to record movement."));
              return false;
            }
          }}
        />

        <Card className="flex h-full flex-col" data-usertour="wallet-history">
          <CardHeader className="flex-row items-baseline justify-between space-y-0 pb-4">
            <CardTitle className="text-base">History</CardTitle>
            <span className="text-xs text-muted-foreground tabular">
              {movements.length}{" "}
              {movements.length === 1 ? "movement" : "movements"}
            </span>
          </CardHeader>
          <CardContent className="flex-1">
            {movements.length === 0 ? (
              <Empty className="border-0 bg-transparent px-0 py-6 shadow-none">
                <EmptyMedia>
                  <Banknote aria-hidden />
                </EmptyMedia>
                <div className="space-y-1">
                  <EmptyTitle>No movements yet</EmptyTitle>
                  <EmptyDescription>
                    Record cash in or out and it appears here, with the balance
                    following from it.
                  </EmptyDescription>
                </div>
              </Empty>
            ) : (
              <ul className="divide-y">
                {movements.map((movement) => {
                  const out = movement.amount < 0;
                  return (
                    <li
                      key={movement.id}
                      className="flex items-center gap-3 py-3 first:pt-0"
                    >
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4",
                          out && "bg-warm text-warm-foreground",
                        )}
                        aria-hidden
                      >
                        {out ? <ArrowUpRight /> : <ArrowDownLeft />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          {movement.note || (out ? "Cash out" : "Cash in")}
                        </p>
                        <p className="text-xs text-muted-foreground tabular">
                          {formatInvoiceDate(movement.date)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium tabular">
                        {signedMoney(movement.amount)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        disabled={removeMovement.isPending}
                        onClick={async () => {
                          try {
                            await removeMovement.mutateAsync(movement.id);
                            toast.success("Movement removed");
                          } catch (error) {
                            toast.error(
                              apiErrorMessage(
                                error,
                                "Failed to remove movement.",
                              ),
                            );
                          }
                        }}
                        aria-label={`Remove ${movement.note || "movement"}`}
                      >
                        <X className="size-4 text-muted-foreground" />
                      </Button>
                    </li>
                  );
                })}
                {/* The balance follows from the movements, so the figure they
                    started from belongs in the same list. */}
                <li className="flex items-center justify-between gap-3 py-3 text-sm text-muted-foreground">
                  <span>Opening balance</span>
                  <span className="tabular">{invoiceMoney(opening)}</span>
                </li>
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Cash in or out, with the balance it will leave behind. */
function AddCashCard({
  balance,
  available,
  pending,
  onAdd,
}: {
  balance: number;
  /** What's left after goal allocations — the ceiling on taking cash out. */
  available: number;
  pending: boolean;
  /** Resolves true when the movement was accepted, so the form can clear. */
  onAdd: (movement: { amount: number; note: string }) => Promise<boolean>;
}) {
  const [direction, setDirection] = React.useState<"in" | "out">("in");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");

  const issue = walletMovementIssue(amount, direction, available);
  const value = Number(amount) || 0;
  const signed = direction === "out" ? -value : value;

  return (
    <Card className="h-fit" data-usertour="wallet-add-cash">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Add cash</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Direction">
          <Select
            value={direction}
            onValueChange={(next) => setDirection(next as "in" | "out")}
          >
            <SelectTrigger aria-label="Direction">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in">Cash in</SelectItem>
              <SelectItem value="out">Cash out</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Amount" required error={issue}>
          <MoneyInput
            value={amount}
            onChange={setAmount}
            label="Amount"
            invalid={!!issue}
          />
        </Field>

        <Field label="Note" hint="Optional.">
          <Textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Cash job — Ellis fit-out"
          />
        </Field>

        {/* The resulting balance, before committing to it. */}
        {!issue && value > 0 && (
          <p className="text-xs text-muted-foreground tabular">
            Leaves the wallet at {invoiceMoney(balance + signed)}
          </p>
        )}

        <Button
          className="w-full"
          disabled={!!issue || value <= 0 || pending}
          onClick={async () => {
            const cleared = await onAdd({
              amount: signed,
              note: note.trim(),
            });
            if (!cleared) return;
            toast.success(
              `${invoiceMoney(value)} ${direction === "out" ? "taken out" : "added"}`,
              { description: `Cash wallet is now ${invoiceMoney(balance + signed)}.` },
            );
            setAmount("");
            setNote("");
          }}
        >
          {pending
            ? "Saving..."
            : direction === "out"
              ? "Remove cash"
              : "Add cash"}
        </Button>

        <p className="text-xs leading-relaxed text-muted-foreground">
          The wallet counts towards your estimated available cash. Recording it
          here posts no accounting transaction.
        </p>
      </CardContent>
    </Card>
  );
}
