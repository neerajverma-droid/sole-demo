"use client";

import * as React from "react";
import { useAtomValue } from "jotai";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountUp } from "@/components/ui/count-up";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Shimmer } from "@/components/ui/shimmer";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { accountStageAtom } from "@/lib/atoms";
import { money } from "@/lib/dashboard-data";
import { currentFinancialYear, financialYearRevenue } from "@/lib/invoices";
import {
  useRevenueGoalQuery,
  useSaveRevenueGoalMutation,
} from "@/hooks/use-goal-tracker-query";
import { useDashboardStore } from "@/stores/dashboard";
import { useInvoicesStore } from "@/stores/invoices";
import { activeCurrencySymbol } from "@/lib/country-context";

/**
 * Progress against the year's target.
 *
 * Every figure here is derived from the invoice book rather than read off a
 * constant. It used to report a frozen $86,500 earned, a frozen average and a
 * frozen 304 invoices needed — which meant raising an invoice moved nothing on
 * this card, and the three figures couldn't be checked against each other
 * because none of them came from the same place.
 */
export function RevenueGoalCard() {
  const goalQuery = useRevenueGoalQuery();
  const stage = useAtomValue(accountStageAtom);
  const goalTarget = useDashboardStore((s) => s.goalTarget);
  const invoices = useInvoicesStore((s) => s.invoices);
  const invoicesHydrated = useInvoicesStore((s) => s.hydrated);
  const [editing, setEditing] = React.useState(false);
  const loading = goalQuery.isLoading || !invoicesHydrated;

  const fiscalYearStart = useFiscalYearStart();
  const year = currentFinancialYear(new Date(), fiscalYearStart);
  const isActive = stage === "active";

  /*
   * The preview toggle's "new account" stage reports an empty book rather than
   * a zeroed figure, so the average and the invoices needed fall out of the
   * same arithmetic as the live case instead of needing a second branch each.
   */
  const billed = financialYearRevenue(isActive ? invoices : [], year);
  const earned = billed.amount;

  const pct = goalTarget > 0 ? Math.min((earned / goalTarget) * 100, 100) : 0;
  const monthlyTarget = goalTarget > 0 ? Math.round(goalTarget / 12) : 0;

  /*
   * What's left, at the rate this year's invoices have actually gone out.
   *
   * Both guarded, and both on the same denominator: an average of no invoices
   * is not zero, it's unanswerable, and dividing by it to say how many more are
   * needed would report Infinity as a number of invoices. Where there's nothing
   * to average from, the figures say so instead.
   */
  const avgInvoiceValue = billed.count > 0 ? earned / billed.count : 0;
  const invoicesNeeded =
    avgInvoiceValue > 0
      ? Math.ceil(Math.max(0, goalTarget - earned) / avgInvoiceValue)
      : 0;

  return (
    <Card data-tour="revenue-goal" data-usertour="dashboard-revenue-goal">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Revenue goal</CardTitle>
          <p className="text-xs text-muted-foreground">{year.label}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="text-muted-foreground" />
          Edit goal
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        {loading ? (
          <>
            <Shimmer className="h-8 w-40" />
            <Shimmer className="h-2 w-full" />
            <div className="grid grid-cols-3 gap-4 border-t pt-4">
              <Shimmer className="h-10 w-full" />
              <Shimmer className="h-10 w-full" />
              <Shimmer className="h-10 w-full" />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight tabular">
                <CountUp value={earned} format={money} />
              </span>
              <span className="text-sm text-muted-foreground tabular">
                of {goalTarget > 0 ? money(goalTarget) : "no goal set"}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium tabular">
                  {Math.round(pct)}% complete
                </span>
              </div>
              <Progress value={pct} aria-label="Revenue goal progress" />
            </div>

            <dl className="grid grid-cols-3 gap-4 border-t pt-4">
              <Stat
                label="To stay on track"
                value={
                  monthlyTarget > 0 ? (
                    <CountUp value={monthlyTarget} format={money} />
                  ) : (
                    "—"
                  )
                }
                suffix={monthlyTarget > 0 ? "/mo" : undefined}
              />
              <Stat
                label="Avg invoice value"
                value={
                  billed.count > 0 ? (
                    <CountUp value={avgInvoiceValue} format={money} />
                  ) : (
                    "—"
                  )
                }
              />
              <Stat
                label="Invoices needed"
                value={
                  avgInvoiceValue > 0 ? <CountUp value={invoicesNeeded} /> : "—"
                }
              />
            </dl>
          </>
        )}
      </CardContent>

      <EditGoalDialog open={editing} onOpenChange={setEditing} />
    </Card>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-semibold tabular">
        {value}
        {suffix && (
          <span className="text-xs font-normal text-muted-foreground">
            {suffix}
          </span>
        )}
      </dd>
    </div>
  );
}

function EditGoalDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Radix unmounts the content while closed, so the form below mounts
        fresh on every open and can seed its field from the stored goal in
        its initial state rather than in an effect.

        Radix's focus scope also focuses the first field on open — and does it
        with `select()`, which is what left the whole amount highlighted so the
        first keystroke replaced it. Taking over that focus step keeps the
        field focused but puts the caret after the figure instead.
      */}
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const input = inputRef.current;
          if (!input) return;
          input.focus({ preventScroll: true });
          const end = input.value.length;
          input.setSelectionRange(end, end);
        }}
      >
        <EditGoalForm inputRef={inputRef} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}

function EditGoalForm({
  inputRef,
  onOpenChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onOpenChange: (open: boolean) => void;
}) {
  const goalTarget = useDashboardStore((s) => s.goalTarget);
  const resetGoalTarget = useDashboardStore((s) => s.resetGoalTarget);
  const saveGoal = useSaveRevenueGoalMutation();
  /*
   * Seeded at mount, not from an effect, so the figure is already in the field
   * when the dialog's open-focus handler places the caret after it.
   */
  const [draft, setDraft] = React.useState(() =>
    goalTarget > 0 ? goalTarget.toLocaleString("en-AU") : "",
  );

  const draftValue = Number(draft.replace(/[^0-9]/g, "")) || 0;
  const canSave = draftValue > 0 && draftValue !== goalTarget;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit revenue goal</DialogTitle>
        <DialogDescription>
          Set your annual income target to track progress through the year.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">Current goal</span>
          <span className="font-medium tabular">
            {goalTarget > 0 ? money(goalTarget) : "No goal set yet"}
          </span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="goal-target">
            New target for this financial year
          </Label>
          <div className="flex items-center overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-ring">
            <span className="border-r bg-muted px-3 py-2 text-sm text-muted-foreground">
              {activeCurrencySymbol()}
            </span>
            <Input
              id="goal-target"
              ref={inputRef}
              inputMode="numeric"
              placeholder="0"
              value={draft}
              onChange={(event) => {
                const digits = event.target.value.replace(/[^0-9]/g, "");
                setDraft(digits ? Number(digits).toLocaleString("en-AU") : "");
              }}
              className="border-0 tabular focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            We&apos;ll recalculate your monthly target and invoices needed
            automatically.
          </p>
        </div>
      </div>

      <DialogFooter className="sm:justify-between">
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            resetGoalTarget();
            onOpenChange(false);
            toast.success("Revenue goal reset");
          }}
        >
          Reset goal
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSave || saveGoal.isPending}
            onClick={() => {
              saveGoal.mutate(draftValue, {
                onSuccess: () => {
                  onOpenChange(false);
                  toast.success("Revenue goal updated");
                },
                onError: () => {
                  toast.error("Couldn't save the goal. Try again.");
                },
              });
            }}
          >
            {saveGoal.isPending ? "Saving…" : "Save goal"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
