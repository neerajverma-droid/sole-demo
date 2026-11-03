"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, PiggyBank } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Shimmer } from "@/components/ui/shimmer";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { FundCombobox } from "@/components/super/fund-combobox";
import { SUPER_ROOT } from "@/components/super/super-screen";
import { apiErrorMessage } from "@/lib/api-error";
import { toIsoDate } from "@/lib/invoices";
import {
  amountFieldError,
  contributionIssues,
  contributionSummaryLine,
  createContributionApi,
  draftFromContribution,
  emptyContributionDraft,
  fetchContributionDetail,
  updateContributionApi,
  type ContributionDraft,
} from "@/lib/super";
import { cn } from "@/lib/utils";
import { activeCurrencySymbol } from "@/lib/country-context";

/**
 * The contribution form — a page, matching the expense and vendor refund forms
 * rather than a dialog. Same rhythm: one bordered section of fields, then a
 * footer with Cancel and the primary action.
 */
export function ContributionForm({
  contributionId,
  copyOfId,
}: {
  /** Editing an existing contribution. */
  contributionId?: string;
  /** Recording another like this one: its values seed a new contribution. */
  copyOfId?: string;
} = {}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // The list's own rows don't carry the fund's id (only its name), so
  // editing fetches the real record rather than reusing whatever's already
  // in the store.
  const detailQuery = useQuery({
    queryKey: ["super-contribution", contributionId],
    queryFn: () => fetchContributionDetail(contributionId as string),
    enabled: !!contributionId,
  });
  const editing = detailQuery.data;

  /**
   * Duplicate fetches the same real record editing does — sole-webapp's own
   * `fetchInitialData` runs identically for both, prefilling everything
   * including the original date. What makes this a duplicate rather than an
   * edit is `onSave` below: with no `contributionId`, it POSTs a new record
   * instead of PATCHing this one.
   */
  const copyOfQuery = useQuery({
    queryKey: ["super-contribution", copyOfId],
    queryFn: () => fetchContributionDetail(copyOfId as string),
    enabled: !!copyOfId,
  });
  const copyOf = copyOfQuery.data;

  const [draft, setDraft] = React.useState<ContributionDraft>(() =>
    emptyContributionDraft(toIsoDate(new Date())),
  );
  /**
   * Errors surface once the form has been edited — with submit disabled until
   * valid, a submit-time reveal could never fire.
   */
  const [edited, setEdited] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  // The fetch resolves once; further edits shouldn't be clobbered by a
  // background refetch of the same query key.
  const hydratedFromSource = React.useRef(false);

  React.useEffect(() => {
    if (hydratedFromSource.current) return;
    if (detailQuery.data) {
      setDraft(draftFromContribution(detailQuery.data));
      hydratedFromSource.current = true;
    } else if (copyOfQuery.data) {
      setDraft(draftFromContribution(copyOfQuery.data));
      hydratedFromSource.current = true;
    }
  }, [detailQuery.data, copyOfQuery.data]);

  React.useEffect(() => {
    if (copyOfId && copyOfQuery.isError) {
      toast.error("Couldn't load that contribution to copy — starting blank instead.");
    }
  }, [copyOfId, copyOfQuery.isError]);

  const issues = contributionIssues(draft);
  const issueFor = (key: string) =>
    edited ? issues.find((issue) => issue.key === key)?.message : undefined;

  const patch = (values: Partial<ContributionDraft>) => {
    setEdited(true);
    setDraft((current) => ({ ...current, ...values }));
  };

  const liveAmountError = amountFieldError(draft.amount);

  const onSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await updateContributionApi(editing.id, draft);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["super-contributions"] }),
          queryClient.invalidateQueries({
            queryKey: ["super-contribution-matrix"],
          }),
          // `refetchType: "none"` — this form is still mounted, so a normal
          // invalidate would refetch it immediately and fire a GET for a
          // page we're about to leave. Marking it stale without refetching
          // means editing this same contribution again still gets a fresh
          // fetch rather than the pre-save cache.
          queryClient.invalidateQueries({
            queryKey: ["super-contribution", editing.id],
            refetchType: "none",
          }),
        ]);
        toast.success("Contribution saved", {
          description: contributionSummaryLine(draft),
        });
      } else {
        await createContributionApi(draft);
        // The create endpoint doesn't hand back the new record, so the list
        // and the cards refetch from scratch instead of being updated locally.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["super-contributions"] }),
          queryClient.invalidateQueries({
            queryKey: ["super-contribution-matrix"],
          }),
        ]);
        toast.success("Contribution recorded", {
          description: contributionSummaryLine(draft),
        });
      }
      router.push(SUPER_ROOT);
    } catch (error) {
      toast.error(
        apiErrorMessage(
          error,
          editing
            ? "Couldn't save that contribution. Try again."
            : "Couldn't record that contribution. Try again.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  if (
    (contributionId && detailQuery.isLoading) ||
    (copyOfId && copyOfQuery.isLoading)
  ) {
    return (
      <div className="mx-auto max-w-3xl space-y-6" aria-hidden>
        <Shimmer className="h-8 w-48 rounded-md" />
        <Shimmer className="h-96 w-full rounded-lg border border-border" />
      </div>
    );
  }

  // A URL pointing at a contribution that no longer exists (or failed to load).
  if (contributionId && (detailQuery.isError || !editing)) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={SUPER_ROOT}>
            <ArrowLeft />
            Super contributions
          </Link>
        </Button>
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          That contribution doesn&apos;t exist. It may have been deleted.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={SUPER_ROOT}>
            <ArrowLeft />
            Super contributions
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {editing
              ? "Edit contribution"
              : copyOf
                ? "Record another contribution"
                : "New contribution"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {copyOf ? (
              <>Copied from {copyOf.fundName} — review the details, then save.</>
            ) : (
              <>
                Fields marked with <span className="text-destructive">*</span>{" "}
                are required.
              </>
            )}
          </p>
        </div>
      </div>

      <FormSection
        icon={PiggyBank}
        title="Contribution details"
        description="Which fund it went to, when, and how much."
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <FundCombobox
            fundId={draft.fundId}
            fundName={draft.fundName}
            onSelect={({ fundId, fundName }) => patch({ fundId, fundName })}
            error={issueFor("fund")}
          />
        </div>

        <Field label="Date" required error={issueFor("date")}>
          <DatePicker
            label="Contribution date"
            value={draft.date}
            onChange={(iso) => patch({ date: iso })}
          />
        </Field>

        <Field
          label={`Amount (${activeCurrencySymbol()})`}
          htmlFor="contribution-amount"
          required
          error={liveAmountError ?? issueFor("amount")}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {activeCurrencySymbol()}
            </span>
            <Input
              id="contribution-amount"
              value={draft.amount}
              inputMode="decimal"
              onChange={(event) => patch({ amount: event.target.value })}
              placeholder="0.00"
              aria-invalid={!!(liveAmountError ?? issueFor("amount"))}
              className={cn(
                "pl-7 tabular",
                (liveAmountError ?? issueFor("amount")) &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </div>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Notes" htmlFor="contribution-notes">
            <Textarea
              id="contribution-notes"
              rows={3}
              value={draft.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              placeholder="Which quarter this covers, or anything your accountant should see…"
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
            <Switch
              checked={draft.taxDeduction}
              onCheckedChange={(next) => patch({ taxDeduction: next })}
              aria-label="Tax deduction contribution"
              className="mt-0.5"
            />
            <span className="min-w-0 flex-1 space-y-0.5">
              <span className="block text-sm font-medium">
                Tax deduction contribution
              </span>
              <span className="block text-xs text-muted-foreground">
                A personal contribution you intend to claim as a deduction. Your
                fund needs a notice of intent before you lodge.
              </span>
            </span>
          </label>
        </div>
      </FormSection>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button variant="outline" asChild>
          <Link href={SUPER_ROOT}>Cancel</Link>
        </Button>
        {/* Disabled until valid; the hint says what's still outstanding. */}
        {issues.length > 0 && (
          <p className="self-center text-xs text-muted-foreground">
            {issues.length === 1
              ? issues[0].message
              : `${issues.length} fields need attention`}
          </p>
        )}
        <Button onClick={onSave} disabled={issues.length > 0 || saving}>
          {saving && <Loader2 className="animate-spin" />}
          {editing ? "Save changes" : "Save contribution"}
        </Button>
      </div>
    </div>
  );
}
