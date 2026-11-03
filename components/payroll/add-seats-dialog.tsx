"use client";

import * as React from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAddPayrollSeatsMutation } from "@/hooks/use-payroll-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  PAYROLL_CURRENCY,
  payrollMoney,
  plural,
  seatIntervalSuffix,
  seatUnitPrice,
  type PayrollSeats,
} from "@/lib/payroll";
import { cn } from "@/lib/utils";

const QUICK_PICKS = [1, 2, 5, 10] as const;
const DEFAULT_SEATS = 2;
const MAX_SEATS = 500;

/**
 * Buy more employee seats mid-cycle.
 *
 * The card on file is charged straight away for the seats added, at the full
 * per-seat price for the interval the seats are billed on — the backend does
 * the charging, this only says what it will be. "Keep for next cycle" decides
 * whether the subscription's seat count goes up too, or the extra seats lapse
 * at renewal.
 */
export function AddSeatsDialog({
  open,
  onOpenChange,
  seats,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seats: PayrollSeats;
  /** After a successful purchase — e.g. reopen the drawer that hit the limit. */
  onAdded?: () => void;
}) {
  const [count, setCount] = React.useState(DEFAULT_SEATS);
  const [recurring, setRecurring] = React.useState(true);
  const addSeats = useAddPayrollSeatsMutation();
  const saving = addSeats.isPending;

  React.useEffect(() => {
    if (!open) return;
    setCount(DEFAULT_SEATS);
    setRecurring(true);
  }, [open]);

  const unit = seatUnitPrice(seats.billingInterval);
  const suffix = seatIntervalSuffix(seats.billingInterval);
  const charge = count * unit;
  const newLimit = seats.employeeLimit + count;

  const setClamped = (next: number) =>
    setCount(Math.min(MAX_SEATS, Math.max(1, Math.round(next) || 1)));

  const onConfirm = async () => {
    try {
      await addSeats.mutateAsync({ additionalSeats: count, isRecurring: recurring });
      toast.success(
        count === 1 ? "1 seat added" : `${count} seats added`,
        { description: `Charged ${payrollMoney(charge)} ${PAYROLL_CURRENCY} to your card.` },
      );
      onAdded?.();
    } catch (error) {
      // The server's own reason — a declined card, an overdue balance, or
      // payroll not being enabled yet — rather than a generic failure.
      toast.error(apiErrorMessage(error, "Couldn't add seats. Nothing was charged."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add employee seats</DialogTitle>
          <DialogDescription>
            Each employee on payroll takes one seat.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-3">
              <dt className="text-xs text-muted-foreground">Seats in use</dt>
              <dd className="mt-1 text-lg font-semibold tabular">
                {seats.activeEmployees}/{seats.employeeLimit}
              </dd>
            </div>
            <div className="rounded-md border border-border p-3">
              <dt className="text-xs text-muted-foreground">Price per seat</dt>
              <dd className="mt-1 text-lg font-semibold tabular">
                {payrollMoney(unit)}
                <span className="text-sm font-normal text-muted-foreground">
                  {suffix}
                </span>
              </dd>
            </div>
          </dl>

          <div className="space-y-2">
            <p className="text-sm font-medium">Seats to add</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Quick picks">
              {QUICK_PICKS.map((pick) => (
                <button
                  key={pick}
                  type="button"
                  onClick={() => setCount(pick)}
                  aria-pressed={count === pick}
                  className={cn(
                    "inline-flex items-center rounded-full px-3.5 py-1.5 text-sm tabular outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    count === pick
                      ? "bg-primary font-medium text-primary-foreground"
                      : "border border-border bg-background hover:bg-muted",
                  )}
                >
                  +{pick}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9"
                onClick={() => setClamped(count - 1)}
                disabled={count <= 1}
                aria-label="One fewer seat"
              >
                <Minus />
              </Button>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_SEATS}
                value={count}
                onChange={(event) => setClamped(Number(event.target.value))}
                className="w-20 text-center tabular"
                aria-label="Seats to add"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9"
                onClick={() => setClamped(count + 1)}
                disabled={count >= MAX_SEATS}
                aria-label="One more seat"
              >
                <Plus />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Keep for the next billing cycle</p>
              <p className="text-xs text-muted-foreground">
                {recurring
                  ? `Renews at ${plural(newLimit, "seat")} × ${payrollMoney(unit)}${suffix}.`
                  : "These seats lapse at the end of the current cycle."}
              </p>
            </div>
            <Switch
              checked={recurring}
              onCheckedChange={setRecurring}
              aria-label="Keep for the next billing cycle"
            />
          </div>

          <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Charged today</span>
              <span className="font-semibold tabular">
                {payrollMoney(charge)} {PAYROLL_CURRENCY}
              </span>
            </div>
            <p className="text-xs text-muted-foreground tabular">
              {plural(count, "seat")} × {payrollMoney(unit)} · new limit{" "}
              {plural(newLimit, "seat")}
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Charged now to the default card on your subscription.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void onConfirm()} disabled={saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            {saving ? "Processing…" : `Pay ${payrollMoney(charge)} & add`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
