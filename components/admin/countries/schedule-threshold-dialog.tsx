"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { DatePicker } from "@/components/documents/date-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import { AuthError } from "@/components/auth/auth-states";
import { useScheduleThresholdMutation } from "@/hooks/use-admin-countries-query";
import {
  registryErrorMessage,
  KNOWN_THRESHOLD_KEYS,
  MIN_BACKDATE_REASON,
  isBackdated,
  scheduleThresholdIssues,
  type ScheduleThresholdInput,
  type Threshold,
} from "@/lib/admin/countries";

const CUSTOM = "__custom__";

const empty = (): ScheduleThresholdInput => ({ key: "", amount: "", effectiveFrom: "", notes: "" });

/**
 * Schedule a threshold — a registration turnover, a tax-invoice limit, a
 * cents-per-kilometre rate.
 *
 * The keys the product actually reads are offered by name, because a threshold
 * typed as `tax_registraton` is not a validation error: it saves cleanly and is
 * then simply never read by anything. "Something else" is still there, since a
 * country may need a value this build doesn't know about yet.
 */
export function ScheduleThresholdDialog({
  iso2,
  country,
  currency,
  existing,
  isSuperAdmin,
  open,
  onOpenChange,
  replacing,
}: {
  iso2: string;
  country: string;
  currency: string;
  existing: Threshold[];
  isSuperAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replacing?: Threshold | null;
}) {
  const schedule = useScheduleThresholdMutation(iso2);
  const [form, setForm] = React.useState<ScheduleThresholdInput>(empty());
  const [custom, setCustom] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [allowBackdate, setAllowBackdate] = React.useState(false);
  const [backdateReason, setBackdateReason] = React.useState("");
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setForm(replacing ? { ...empty(), key: replacing.key, amount: String(replacing.amount) } : empty());
    setCustom(
      Boolean(replacing) && !KNOWN_THRESHOLD_KEYS.some((entry) => entry.key === replacing?.key),
    );
    setSubmitted(false);
    setAllowBackdate(false);
    setBackdateReason("");
    setServerError(null);
    schedule.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, replacing]);

  const issues = submitted ? scheduleThresholdIssues(form, existing) : {};
  const backdating = isBackdated(form.effectiveFrom);
  const reasonTooShort = backdateReason.trim().length < MIN_BACKDATE_REASON;
  const blocked = backdating && (!isSuperAdmin || !allowBackdate || reasonTooShort);

  const update = (patch: Partial<ScheduleThresholdInput>) => {
    setServerError(null);
    setForm((current) => ({ ...current, ...patch }));
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(scheduleThresholdIssues(form, existing)).length > 0 || blocked || schedule.isPending)
      return;

    schedule.mutate(
      {
        input: form,
        override: backdating ? { allowBackdate: true, reason: backdateReason } : undefined,
      },
      {
        onSuccess: () => {
          toast.success(`${form.key.trim()} staged`, {
            description: "It stays invisible to businesses until you publish.",
          });
          onOpenChange(false);
        },
        onError: (error) =>
          setServerError(registryErrorMessage(error, "The threshold couldn't be scheduled.")),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !schedule.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule a threshold</DialogTitle>
          <DialogDescription>
            Staged for {country}. Amounts are in {currency || "the country's currency"}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Threshold" htmlFor="threshold-key" error={issues.key}>
            {custom ? (
              <Input
                id="threshold-key"
                value={form.key}
                onChange={(event) => update({ key: event.target.value.toLowerCase() })}
                placeholder="tax_registration"
                autoComplete="off"
                spellCheck={false}
              />
            ) : (
              <Select
                value={form.key}
                onValueChange={(value) => {
                  if (value === CUSTOM) {
                    setCustom(true);
                    update({ key: "" });
                  } else {
                    update({ key: value });
                  }
                }}
              >
                <SelectTrigger id="threshold-key">
                  <SelectValue placeholder="Choose a threshold" />
                </SelectTrigger>
                <SelectContent>
                  {KNOWN_THRESHOLD_KEYS.map((entry) => (
                    <SelectItem key={entry.key} value={entry.key}>
                      {entry.label}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Something else…</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Amount (${currency || "local"})`} htmlFor="threshold-amount" error={issues.amount}>
              <Input
                id="threshold-amount"
                value={form.amount}
                onChange={(event) => update({ amount: event.target.value })}
                inputMode="decimal"
                placeholder="75000"
              />
            </Field>
            <Field label="Takes effect from" htmlFor="threshold-from" error={issues.effectiveFrom}>
              <DatePicker
                id="threshold-from"
                label="Takes effect from"
                value={form.effectiveFrom}
                invalid={!!issues.effectiveFrom}
                onChange={(iso) => update({ effectiveFrom: iso })}
              />
            </Field>
          </div>

          <Field label="Note" htmlFor="threshold-notes" hint="Optional — where the figure comes from.">
            <Input
              id="threshold-notes"
              value={form.notes}
              onChange={(event) => update({ notes: event.target.value })}
              placeholder="Budget 2027, effective 1 April"
            />
          </Field>

          {backdating ? (
            <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="flex items-start gap-2 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                <span>
                  <span className="font-medium">This date is in the past.</span>{" "}
                  <span className="text-muted-foreground">
                    Back-dating changes figures a business may already have filed on.
                  </span>
                </span>
              </p>
              {isSuperAdmin ? (
                <>
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="threshold-backdate"
                      checked={allowBackdate}
                      onCheckedChange={(value) => setAllowBackdate(value === true)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="threshold-backdate" className="font-normal">
                      Back-date it anyway
                    </Label>
                  </div>
                  {allowBackdate ? (
                    <Field
                      label="Why"
                      htmlFor="threshold-backdate-reason"
                      hint="Recorded in the audit log against your account."
                      error={
                        submitted && reasonTooShort
                          ? `Give a reason of at least ${MIN_BACKDATE_REASON} characters.`
                          : undefined
                      }
                    >
                      <Textarea
                        id="threshold-backdate-reason"
                        rows={2}
                        value={backdateReason}
                        onChange={(event) => setBackdateReason(event.target.value)}
                      />
                    </Field>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Only a super admin can back-date a registry change.
                </p>
              )}
            </div>
          ) : null}

          {serverError ? <AuthError message={serverError} /> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={schedule.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={schedule.isPending || blocked}>
              {schedule.isPending ? "Scheduling…" : "Stage threshold"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
