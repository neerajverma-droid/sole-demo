"use client";

import * as React from "react";
import { CalendarClock, TriangleAlert } from "lucide-react";
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
import { useScheduleRateMutation } from "@/hooks/use-admin-countries-query";
import {
  registryErrorMessage,
  APPLIES_TO,
  MIN_BACKDATE_REASON,
  RATE_CATEGORIES,
  formatRegistryDate,
  isBackdated,
  scheduleRateIssues,
  type RateCategory,
  type ScheduleRateInput,
  type TaxRate,
} from "@/lib/admin/countries";

const CATEGORY_LABELS: Record<RateCategory, string> = {
  standard: "Standard rate",
  reduced: "Reduced rate",
  zero: "Zero-rated",
  exempt: "Exempt",
  out_of_scope: "Out of scope",
};

const APPLIES_TO_LABELS: Record<string, string> = {
  both: "Sales and purchases",
  sales: "Sales only",
  purchases: "Purchases only",
};

const empty = (taxCode = ""): ScheduleRateInput => ({
  taxCode,
  name: "",
  category: "standard",
  rate: "",
  appliesTo: "both",
  effectiveFrom: "",
  isDefault: false,
  isCapital: false,
});

/**
 * Schedule a tax rate.
 *
 * This is the screen a government announcement turns into: "GST becomes 12.5%
 * from 1 April" is one rate, one date, published once. The period it replaces
 * is end-dated the day before — by the backend, at publish — so the timeline
 * has no gap and no overlap, and nothing changes for a business until the date
 * arrives.
 *
 * Back-dating is a separate, deliberate act. A period that has already started
 * may have been filed on, so the backend refuses a past date unless a super
 * admin passes a written reason, which is recorded in the audit log.
 */
export function ScheduleRateDialog({
  iso2,
  country,
  taxType,
  existing,
  isSuperAdmin,
  open,
  onOpenChange,
  /** Pre-fills the code when replacing a specific rate. */
  replacing,
}: {
  iso2: string;
  country: string;
  taxType: string;
  existing: TaxRate[];
  isSuperAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replacing?: TaxRate | null;
}) {
  const schedule = useScheduleRateMutation(iso2);
  const [form, setForm] = React.useState<ScheduleRateInput>(empty());
  const [submitted, setSubmitted] = React.useState(false);
  const [allowBackdate, setAllowBackdate] = React.useState(false);
  const [backdateReason, setBackdateReason] = React.useState("");
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setForm(
      replacing
        ? {
            ...empty(replacing.taxCode),
            name: "",
            category: replacing.category,
            rate: String(replacing.rate),
            appliesTo: replacing.appliesTo,
            isDefault: replacing.isDefault,
            isCapital: replacing.isCapital,
          }
        : empty(),
    );
    setSubmitted(false);
    setAllowBackdate(false);
    setBackdateReason("");
    setServerError(null);
    schedule.reset();
    // `schedule` is stable enough; resetting on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, replacing]);

  const issues = submitted ? scheduleRateIssues(form, existing) : {};
  const backdating = isBackdated(form.effectiveFrom);
  const reasonTooShort = backdateReason.trim().length < MIN_BACKDATE_REASON;

  const update = (patch: Partial<ScheduleRateInput>) => {
    setServerError(null);
    setForm((current) => ({ ...current, ...patch }));
  };

  const superseded = React.useMemo(() => {
    const code = form.taxCode.trim().toUpperCase();
    if (!code || !form.effectiveFrom) return null;
    return (
      existing
        .filter((row) => row.taxCode === code && !row.effectiveTo && row.effectiveFrom < form.effectiveFrom)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null
    );
  }, [existing, form.taxCode, form.effectiveFrom]);

  const blocked = backdating && (!isSuperAdmin || !allowBackdate || reasonTooShort);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(scheduleRateIssues(form, existing)).length > 0 || blocked || schedule.isPending) return;

    schedule.mutate(
      {
        input: form,
        override: backdating ? { allowBackdate: true, reason: backdateReason } : undefined,
      },
      {
        onSuccess: () => {
          toast.success(`${form.taxCode.trim().toUpperCase()} staged`, {
            description: "It stays invisible to businesses until you publish.",
          });
          onOpenChange(false);
        },
        onError: (error) =>
          setServerError(registryErrorMessage(error, "The rate couldn't be scheduled.")),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !schedule.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Schedule a {taxType || "tax"} rate</DialogTitle>
          <DialogDescription>
            Staged for {country}. Nothing changes for a business until you publish, and then only
            from the date you set here.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tax code" htmlFor="rate-code" error={issues.taxCode}>
              <Input
                id="rate-code"
                value={form.taxCode}
                onChange={(event) => update({ taxCode: event.target.value.toUpperCase() })}
                placeholder="GST"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Field label="Rate (%)" htmlFor="rate-value" error={issues.rate}>
              <Input
                id="rate-value"
                value={form.rate}
                onChange={(event) => update({ rate: event.target.value })}
                inputMode="decimal"
                placeholder="12.5"
              />
            </Field>
          </div>

          <Field label="Display name" htmlFor="rate-name" hint="Optional — defaults to the code and rate.">
            <Input
              id="rate-name"
              value={form.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder={`${form.taxCode || "GST"} (${form.rate || "12.5"}%)`}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="rate-category">
              <Select
                value={form.category}
                onValueChange={(value) => update({ category: value as RateCategory })}
              >
                <SelectTrigger id="rate-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATE_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {CATEGORY_LABELS[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Applies to" htmlFor="rate-applies">
              <Select
                value={form.appliesTo}
                onValueChange={(value) => update({ appliesTo: value as ScheduleRateInput["appliesTo"] })}
              >
                <SelectTrigger id="rate-applies">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPLIES_TO.map((value) => (
                    <SelectItem key={value} value={value}>
                      {APPLIES_TO_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field
            label="Takes effect from"
            htmlFor="rate-from"
            error={issues.effectiveFrom}
            hint="Documents dated before this keep the old rate."
          >
            <DatePicker
              id="rate-from"
              label="Takes effect from"
              value={form.effectiveFrom}
              invalid={!!issues.effectiveFrom}
              onChange={(iso) => update({ effectiveFrom: iso })}
            />
          </Field>

          {superseded ? (
            <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <CalendarClock className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                Publishing this will end the current {superseded.taxCode} period on{" "}
                <span className="font-medium text-foreground">
                  {formatRegistryDate(previousDay(form.effectiveFrom))}
                </span>
                , so the timeline has no gap.
              </span>
            </p>
          ) : null}

          <div className="space-y-2 rounded-md border border-border p-3">
            <CheckboxRow
              id="rate-default"
              checked={form.isDefault}
              onChange={(checked) => update({ isDefault: checked })}
              label="This is the country's standard rate"
              hint="The rate used when a document doesn't name a tax code. Only one code can hold it."
            />
            <CheckboxRow
              id="rate-capital"
              checked={form.isCapital}
              onChange={(checked) => update({ isCapital: checked })}
              label="Capital purchases"
              hint="Reported separately on the return — the BAS's G10, VAT201's field 14."
            />
          </div>

          {backdating ? (
            <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="flex items-start gap-2 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                <span>
                  <span className="font-medium">This date is in the past.</span>{" "}
                  <span className="text-muted-foreground">
                    Back-dating changes returns that may already have been filed. Schedule a future
                    date instead unless you are correcting a mistake.
                  </span>
                </span>
              </p>
              {isSuperAdmin ? (
                <>
                  <CheckboxRow
                    id="rate-backdate"
                    checked={allowBackdate}
                    onChange={setAllowBackdate}
                    label="Back-date it anyway"
                  />
                  {allowBackdate ? (
                    <Field
                      label="Why"
                      htmlFor="rate-backdate-reason"
                      hint="Recorded in the audit log against your account."
                      error={
                        submitted && reasonTooShort
                          ? `Give a reason of at least ${MIN_BACKDATE_REASON} characters.`
                          : undefined
                      }
                    >
                      <Textarea
                        id="rate-backdate-reason"
                        rows={2}
                        value={backdateReason}
                        onChange={(event) => setBackdateReason(event.target.value)}
                        placeholder="Correcting the 1 Apr rate, which was entered as 12.0 instead of 12.5."
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
              {schedule.isPending ? "Scheduling…" : "Stage rate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CheckboxRow({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5"
      />
      <div className="min-w-0">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

/** The day before an ISO date, for the "ends on" line. */
function previousDay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - 1));
  return date.toISOString().slice(0, 10);
}
