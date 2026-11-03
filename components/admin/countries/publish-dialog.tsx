"use client";

import * as React from "react";
import { ArrowRight, CalendarClock, CircleAlert, Loader2, Users } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import { AuthError } from "@/components/auth/auth-states";
import {
  useAdminCountryPreviewQuery,
  usePublishCountryMutation,
} from "@/hooks/use-admin-countries-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCount } from "@/lib/admin/format";
import {
  registryErrorMessage,
  formatRate,
  formatRegistryDate,
  publishNoteIssue,
  type PublishPreview,
} from "@/lib/admin/countries";

/**
 * Publish everything staged for a country, as one version.
 *
 * The dialog is mostly the preview, not the form. Publishing a rate is the one
 * action in this console that reaches every business in the country at once, so
 * what it shows first is how many that is, what re-prices, and when the change
 * actually bites — a rate dated 1 April changes nothing today.
 *
 * The server decides whether it can be published at all; the dialog shows the
 * reasons it gave and keeps the button disabled rather than finding out on
 * submit.
 */
export function PublishDialog({
  iso2,
  country,
  open,
  onOpenChange,
}: {
  iso2: string;
  country: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const preview = useAdminCountryPreviewQuery(iso2, open);
  const publish = usePublishCountryMutation(iso2);
  const [note, setNote] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setNote("");
    setSubmitted(false);
    setServerError(null);
    publish.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const plan = preview.data;
  const noteIssue = submitted ? publishNoteIssue(note) : null;

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (publishNoteIssue(note) || !plan?.canPublish || publish.isPending) return;

    publish.mutate(note, {
      onSuccess: (result) => {
        toast.success(`${country} published`, { description: `Now at version ${result.version}.` });
        onOpenChange(false);
      },
      onError: (error) => setServerError(registryErrorMessage(error, "The changes couldn't be published.")),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !publish.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Publish {country}</DialogTitle>
          <DialogDescription>
            {plan
              ? `Everything staged becomes version ${plan.nextVersion}, and a snapshot of version ${plan.currentVersion} is kept so this can be rolled back.`
              : "Checking what's staged…"}
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Working out what this would change…
          </div>
        ) : preview.isError ? (
          <AuthError
            message={apiErrorMessage(preview.error, "The preview couldn't be loaded.")}
          />
        ) : plan ? (
          <form onSubmit={onSubmit} className="space-y-5">
            <PreviewBody plan={plan} />

            {plan.errors.length > 0 ? (
              <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <CircleAlert className="size-4 text-destructive" aria-hidden />
                  This can&apos;t be published yet
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {plan.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Field
              label="What changed, and why"
              htmlFor="publish-note"
              hint="Kept with the version forever, and written to the audit log."
              error={noteIssue ?? undefined}
            >
              <Textarea
                id="publish-note"
                rows={2}
                value={note}
                onChange={(event) => {
                  setServerError(null);
                  setNote(event.target.value);
                }}
                placeholder="IRD — GST rate change to 12.5% effective 1 Apr 2027"
              />
            </Field>

            {serverError ? <AuthError message={serverError} /> : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={publish.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={publish.isPending || !plan.canPublish}>
                {publish.isPending ? "Publishing…" : `Publish version ${plan.nextVersion}`}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({ plan }: { plan: PublishPreview }) {
  const nothingStaged =
    plan.changes.length === 0 && plan.stagedTaxRates.length === 0 && plan.stagedThresholds.length === 0;

  if (nothingStaged) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Nothing is staged for this country. Schedule a rate or a threshold, or edit its settings,
        and they&apos;ll be listed here before they go out.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          Who this reaches
        </h3>
        <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3">
          <Figure label="Businesses" value={formatCount(plan.impact.businesses)} />
          <Figure
            label="Follow the registry rate"
            value={formatCount(plan.impact.followingCountryRate)}
            hint="A rate change applies to these automatically."
          />
          <Figure
            label="On a custom rate"
            value={formatCount(plan.impact.customRate)}
            hint="Pinned by an accountant; unaffected."
          />
        </div>
        {plan.impact.draftInvoices + plan.impact.draftQuotes + plan.impact.recurringTemplates > 0 ? (
          <p className="text-xs text-muted-foreground">
            Issued documents keep the rate recorded on their lines.{" "}
            {formatCount(plan.impact.draftInvoices)} draft{" "}
            {plan.impact.draftInvoices === 1 ? "invoice" : "invoices"},{" "}
            {formatCount(plan.impact.draftQuotes)} draft{" "}
            {plan.impact.draftQuotes === 1 ? "quote" : "quotes"} and{" "}
            {formatCount(plan.impact.recurringTemplates)} recurring{" "}
            {plan.impact.recurringTemplates === 1 ? "template" : "templates"} re-price when the new
            rate takes effect.
          </p>
        ) : null}
      </section>

      {plan.stagedTaxRates.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">New tax rates</h3>
          <ul className="space-y-1.5">
            {plan.stagedTaxRates.map((rate) => (
              <li key={rate.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">{rate.taxCode}</span>
                <span className="tabular">{formatRate(rate.rate)}</span>
                <span className="text-muted-foreground">
                  from {formatRegistryDate(rate.effectiveFrom)}
                </span>
                {rate.isDefault ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    standard rate
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plan.stagedThresholds.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">New thresholds</h3>
          <ul className="space-y-1.5">
            {plan.stagedThresholds.map((threshold) => (
              <li key={threshold.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">{threshold.key}</span>
                <span className="tabular">
                  {threshold.currency} {threshold.amount.toLocaleString("en-AU")}
                </span>
                <span className="text-muted-foreground">
                  from {formatRegistryDate(threshold.effectiveFrom)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plan.changes.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Settings</h3>
          <ul className="space-y-1.5 text-sm">
            {plan.changes.map((change) => (
              <li key={change.field} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{change.field}</span>
                <span className="truncate text-muted-foreground line-through">
                  {summarise(change.from)}
                </span>
                <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate font-medium">{summarise(change.to)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plan.supersedes.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">What this ends</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {plan.supersedes.map((row) => (
              <li key={`${row.entity}-${row.id}-${row.effectiveTo ?? "default"}`}>
                {row.effectiveTo
                  ? `The ${row.entity === "tax_rate" ? "rate" : "threshold"} period it replaces ends on ${formatRegistryDate(row.effectiveTo)}, leaving no gap.`
                  : "Another tax code stops being the standard rate."}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plan.takesEffect.length > 0 ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            <span className="font-medium">Nothing changes today.</span>{" "}
            <span className="text-muted-foreground">
              {plan.takesEffect
                .map((entry) => `${entry.key} starts ${formatRegistryDate(entry.effectiveFrom)}`)
                .join("; ")}
              . Documents dated before then keep today&apos;s figures.
            </span>
          </span>
        </p>
      ) : null}
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A staged value, short enough to sit on one line beside the one it replaces. */
function summarise(value: unknown): string {
  if (value === null || value === undefined) return "not set";
  if (typeof value === "string") return value || "empty";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "none";
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length ? `${entries.length} settings` : "none";
}
