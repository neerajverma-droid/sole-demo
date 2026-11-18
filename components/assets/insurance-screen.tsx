"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Landmark, Loader2, Plus, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { MoneyInput } from "@/components/planner/money-input";
import {
  insuranceErrors,
  stripNonPhoneChars,
  type InsuranceField,
} from "@/lib/asset-validation";
import { apiErrorMessage } from "@/lib/api-error";
import { formatAssetDate, newAssetInsurance, type AssetInsurance } from "@/lib/assets";
import { parseIsoDate } from "@/lib/invoices";
import {
  useAssetInsuranceQuery,
  useCreateAssetInsuranceMutation,
  useDeleteAssetInsuranceMutation,
  useSendAssetInsuranceReportMutation,
  useUpdateAssetInsuranceMutation,
} from "@/hooks/use-asset-insurance-query";
import { useRegisterAsset } from "@/hooks/use-asset-query";

const ASSETS_ROOT = "/assets";

/**
 * What "insurer name" is asking for.
 *
 * The distinction is worth drawing because people reach for the broker's name
 * here — it's who they actually spoke to — and a claim goes to the underwriter.
 */
const INSURER_HELP =
  "The company underwriting the policy, not the broker you bought it through — it's the name that appears on the policy schedule.";

/**
 * Cover held against one asset.
 *
 * A page rather than the dialog this used to be. It's a list that grows, each
 * entry has eleven fields, and adding one revealed a form inside a modal that
 * was already scrolling its own body — the room is the point.
 *
 * The list itself lives in the store, not here: every Save and Remove writes
 * through `setInsurance` immediately, so there is no page-level draft to lose
 * and no Save at the bottom that would imply the records above it aren't
 * committed yet. Only the record being edited is local — see `draft`.
 */
export function InsuranceScreen({ assetId }: { assetId: string }) {
  // The register's copy, or the asset fetched on its own on a direct visit.
  const { asset, loading } = useRegisterAsset(assetId);
  const { data: records = [] } = useAssetInsuranceQuery(assetId);
  const createInsurance = useCreateAssetInsuranceMutation(assetId);
  const updateInsurance = useUpdateAssetInsuranceMutation(assetId);
  const deleteInsurance = useDeleteAssetInsuranceMutation(assetId);
  const sendReport = useSendAssetInsuranceReportMutation();

  // Back, Cancel and "done" return to the register — `/assets/:id` is the edit
  // form (it shows "Loading asset…" and isn't where these screens were opened
  // from).
  const assetHref = ASSETS_ROOT;

  /**
   * The record being edited, or null when the form is closed.
   *
   * One at a time, and held apart from the asset's list so Cancel is a discard
   * rather than an undo. A new record is the same state as an edited one —
   * `newAssetInsurance()` has already given it a local id; whether that id is
   * already in `records` (the fetched list) is what tells `commit` a create
   * from an update.
   */
  const [draft, setDraft] = React.useState<AssetInsurance | null>(null);
  /**
   * Which fields have been left, and whether Save has been tried, for the
   * record being edited. Errors show on those only — a fresh form doesn't open
   * already complaining — and both reset whenever a different record opens.
   */
  const [touched, setTouched] = React.useState<Set<InsuranceField>>(new Set());
  const [attempted, setAttempted] = React.useState(false);
  const openDraft = (record: AssetInsurance | null) => {
    setDraft(record);
    setTouched(new Set());
    setAttempted(false);
  };
  const touch = (field: InsuranceField) =>
    setTouched((current) =>
      current.has(field) ? current : new Set(current).add(field),
    );
  const [saving, setSaving] = React.useState(false);
  const [confirmingRemoveId, setConfirmingRemoveId] = React.useState<string | null>(null);
  const [confirmingSendId, setConfirmingSendId] = React.useState<string | null>(null);
  const sendingRecord = records.find((record) => record.id === confirmingSendId);

  const patch = (values: Partial<AssetInsurance>) =>
    setDraft((current) => (current ? { ...current, ...values } : current));

  /**
   * Opens the inline form on a new, empty policy.
   *
   * The one handler behind both entry points, so the header button and the
   * empty state can't drift into doing different things. Replacing the draft
   * outright is also what clears an edit in progress — there is a single form,
   * and this is it starting over on a blank record.
   */
  const startAdding = () => openDraft(newAssetInsurance());

  /*
   * The backend's own rules (`validateInsurance`: insurer, policy, coverage,
   * start and end required; end on or after start) plus the stable app's
   * format checks on email, phone and the amounts — caught here so they show
   * under the field rather than as a toast from the server.
   */
  const errors = draft ? insuranceErrors(draft) : {};
  const errorFor = (field: InsuranceField) =>
    attempted || touched.has(field) ? errors[field] : undefined;
  const canSave = !!draft && Object.keys(errors).length === 0;

  const commit = async () => {
    if (!draft) return;
    setAttempted(true);
    if (!canSave) return;
    const exists = records.some((record) => record.id === draft.id);
    setSaving(true);
    try {
      if (exists) await updateInsurance.mutateAsync(draft);
      else await createInsurance.mutateAsync(draft);
      openDraft(null);
      toast.success(exists ? "Insurance updated" : "Insurance added");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't save that policy"));
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!confirmingRemoveId) return;
    try {
      await deleteInsurance.mutateAsync(confirmingRemoveId);
      if (draft?.id === confirmingRemoveId) openDraft(null);
      toast.success("Insurance removed");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't remove that policy"));
    } finally {
      setConfirmingRemoveId(null);
    }
  };

  const confirmSend = async () => {
    if (!sendingRecord) return;
    try {
      await sendReport.mutateAsync(sendingRecord.id);
      toast.success(`Insurance report sent to ${sendingRecord.insurerEmail}`);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't send the report"));
    } finally {
      setConfirmingSendId(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-sm text-muted-foreground">
        Loading asset…
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="mx-auto max-w-3xl">
        <Empty>
          <EmptyMedia>
            <Landmark aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>Asset not found</EmptyTitle>
            <EmptyDescription>
              It may have been deleted from the register.
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button variant="outline" size="sm" asChild>
              <Link href={ASSETS_ROOT}>Back to assets</Link>
            </Button>
          </EmptyActions>
        </Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={assetHref}>
            <ArrowLeft />
            Assets
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {asset.name} — insurance
          </h1>
          <p className="text-sm text-muted-foreground">
            Policies held against this asset, and who to contact on a claim.
          </p>
        </div>
      </div>

      <section className="space-y-4" data-usertour="asset-insurance">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Insurance details</h2>
          {/*
            Only once there's a list to add to.

            With nothing on file the empty state below carries the same action,
            and two buttons a few centimetres apart offering one thing is a
            choice nobody has to make. It's also the honest fix for the header
            button reading as dead: on an empty asset both buttons opened the
            same form, so the one you didn't press looked like the one that
            worked.
          */}
          {records.length > 0 && (
            <Button variant="outline" size="sm" onClick={startAdding}>
              <Plus />
              Add insurance
            </Button>
          )}
        </div>

        {records.length === 0 && !draft ? (
          <Empty className="py-12">
            <EmptyMedia className="bg-muted text-muted-foreground">
              <ShieldCheck aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>No insurance records yet</EmptyTitle>
              <EmptyDescription>
                Keep the policy, the cover and who to call with the asset, so a
                claim doesn&apos;t start with a search.
              </EmptyDescription>
            </div>
            <EmptyActions>
              <Button size="sm" onClick={startAdding}>
                Add insurance details
              </Button>
            </EmptyActions>
          </Empty>
        ) : (
          records.length > 0 && (
            <ul className="space-y-2">
              {records.map((record) => (
                <li key={record.id}>
                  <InsuranceRecord
                    record={record}
                    onEdit={() => openDraft({ ...record })}
                    onRemove={() => setConfirmingRemoveId(record.id)}
                    removing={deleteInsurance.isPending && confirmingRemoveId === record.id}
                    onSend={() => setConfirmingSendId(record.id)}
                    sending={sendReport.isPending && confirmingSendId === record.id}
                  />
                </li>
              ))}
            </ul>
          )
        )}

        {draft && (
          <div className="space-y-4 rounded-[14px] border border-border bg-card p-5 shadow-sm">
            <Field
              label="Insurer name"
              htmlFor="insurance-insurer"
              required
              labelTip={INSURER_HELP}
              error={errorFor("insurerName")}
            >
              <Input
                id="insurance-insurer"
                placeholder="e.g. Allianz, NRMA, QBE"
                value={draft.insurerName}
                onChange={(event) => patch({ insurerName: event.target.value })}
                onBlur={() => touch("insurerName")}
                aria-invalid={!!errorFor("insurerName")}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Policy number"
                htmlFor="insurance-policy"
                required
                error={errorFor("policyNumber")}
              >
                <Input
                  id="insurance-policy"
                  placeholder="e.g. POL-1234567"
                  value={draft.policyNumber}
                  onChange={(event) =>
                    patch({ policyNumber: event.target.value })
                  }
                  onBlur={() => touch("policyNumber")}
                  aria-invalid={!!errorFor("policyNumber")}
                />
              </Field>

              <Field
                label="Insurer email contact"
                htmlFor="insurance-email"
                error={errorFor("insurerEmail")}
              >
                <Input
                  id="insurance-email"
                  placeholder="e.g. claims@insurer.com.au"
                  type="email"
                  value={draft.insurerEmail}
                  onChange={(event) =>
                    patch({ insurerEmail: event.target.value })
                  }
                  onBlur={() => touch("insurerEmail")}
                  aria-invalid={!!errorFor("insurerEmail")}
                />
              </Field>

              <Field label="Broker's name" htmlFor="insurance-broker">
                <Input
                  id="insurance-broker"
                  placeholder="e.g. Jane Smith"
                  value={draft.brokerName}
                  onChange={(event) =>
                    patch({ brokerName: event.target.value })
                  }
                />
              </Field>

              <Field
                label="Broker's phone number"
                htmlFor="insurance-broker-phone"
                error={errorFor("brokerPhone")}
              >
                {/* Letters and symbols a number can't hold are dropped as
                    they're typed, as in the stable app. */}
                <Input
                  id="insurance-broker-phone"
                  placeholder="e.g. 0412 345 678"
                  type="tel"
                  inputMode="tel"
                  value={draft.brokerPhone}
                  onChange={(event) =>
                    patch({ brokerPhone: stripNonPhoneChars(event.target.value) })
                  }
                  onBlur={() => touch("brokerPhone")}
                  aria-invalid={!!errorFor("brokerPhone")}
                />
              </Field>

              <Field
                label="Coverage amount"
                htmlFor="insurance-coverage"
                required
                error={errorFor("coverageAmount")}
              >
                <MoneyInput
                  id="insurance-coverage"
                  placeholder="0.00"
                  label="Coverage amount"
                  value={draft.coverageAmount}
                  onChange={(coverageAmount) => patch({ coverageAmount })}
                  onBlur={() => touch("coverageAmount")}
                  invalid={!!errorFor("coverageAmount")}
                />
              </Field>

              <Field
                label="Premium amount"
                htmlFor="insurance-premium"
                error={errorFor("premiumAmount")}
              >
                <MoneyInput
                  id="insurance-premium"
                  placeholder="0.00"
                  label="Premium amount"
                  value={draft.premiumAmount}
                  onChange={(premiumAmount) => patch({ premiumAmount })}
                  onBlur={() => touch("premiumAmount")}
                  invalid={!!errorFor("premiumAmount")}
                />
              </Field>

              <Field label="Start date" required error={errorFor("startDate")}>
                <DatePicker
                  label="Start date"
                  value={draft.startDate}
                  onChange={(startDate) => patch({ startDate })}
                  onClose={() => touch("startDate")}
                  invalid={!!errorFor("startDate")}
                />
              </Field>

              <Field label="End date" required error={errorFor("endDate")}>
                {/* Can't be picked before the start; a typed-in or older
                    record is still caught by the rule. */}
                <DatePicker
                  label="End date"
                  value={draft.endDate}
                  onChange={(endDate) => patch({ endDate })}
                  onClose={() => touch("endDate")}
                  fromDate={parseIsoDate(draft.startDate)}
                  invalid={!!errorFor("endDate")}
                />
              </Field>
            </div>

            <div className="space-y-2">
              <Label htmlFor="insurance-notes">Notes</Label>
              <Textarea
                id="insurance-notes"
                placeholder="Anything worth noting about this policy…"
                rows={3}
                value={draft.notes}
                onChange={(event) => patch({ notes: event.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => openDraft(null)}>
                Cancel
              </Button>
              {/* Clickable until tried, so the first click can say what's
                  wrong; after that it stays off until the errors are fixed. */}
              <Button
                size="sm"
                disabled={(attempted && !canSave) || saving}
                onClick={commit}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Stuck to the foot of the viewport, matching the other asset flows.
          One way out and no Save: each record was written when it was saved, so
          a page-level Save would be a button with nothing left to do. */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button variant="outline" asChild>
          <Link href={assetHref}>Back to assets</Link>
        </Button>
      </div>

      <AlertDialog
        open={confirmingSendId !== null}
        onOpenChange={(open) => {
          if (!open && !sendReport.isPending) setConfirmingSendId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send insurance report?</AlertDialogTitle>
            <AlertDialogDescription>
              A report on {asset.name} under{" "}
              {sendingRecord?.insurerName || "this policy"}
              {sendingRecord?.policyNumber
                ? ` (policy ${sendingRecord.policyNumber})`
                : ""}{" "}
              will be emailed to {sendingRecord?.insurerEmail || "the insurer"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendReport.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={sendReport.isPending}
              onClick={(event) => {
                // Stays open, reading "Sending…", until the server answers.
                event.preventDefault();
                void confirmSend();
              }}
            >
              {sendReport.isPending && <Loader2 className="size-4 animate-spin" />}
              {sendReport.isPending ? "Sending…" : "Send report"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmingRemoveId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmingRemoveId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove insurance policy?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the policy details from this asset. This can&apos;t
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteInsurance.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteInsurance.isPending}
              onClick={confirmRemove}
            >
              {deleteInsurance.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {deleteInsurance.isPending ? "Removing…" : "Remove policy"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** One policy on file, summarised. */
function InsuranceRecord({
  record,
  onEdit,
  onRemove,
  removing,
  onSend,
  sending,
}: {
  record: AssetInsurance;
  onEdit: () => void;
  onRemove: () => void;
  removing: boolean;
  onSend: () => void;
  sending: boolean;
}) {
  const hasEmail = record.insurerEmail.trim().length > 0;
  const sendButton = (
    <Button
      variant="outline"
      size="sm"
      disabled={!hasEmail || removing || sending}
      onClick={onSend}
    >
      {sending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Send className="size-3.5" />
      )}
      {sending ? "Sending…" : "Send to insurer"}
    </Button>
  );

  const cover = [
    record.coverageAmount && `${record.coverageAmount} cover`,
    record.premiumAmount && `${record.premiumAmount} premium`,
  ].filter(Boolean);

  const dates =
    record.startDate || record.endDate
      ? `${record.startDate ? formatAssetDate(record.startDate) : "—"} – ${
          record.endDate ? formatAssetDate(record.endDate) : "—"
        }`
      : null;

  return (
    <div className="flex items-start justify-between gap-3 rounded-[14px] border border-border bg-card p-4 shadow-sm">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-medium">
          {record.insurerName || "Unnamed insurer"}
        </p>
        {record.policyNumber && (
          <p className="truncate text-xs text-muted-foreground tabular">
            Policy {record.policyNumber}
          </p>
        )}
        {cover.length > 0 && (
          <p className="truncate text-xs text-muted-foreground tabular">
            {cover.join(" · ")}
          </p>
        )}
        {dates && (
          <p className="truncate text-xs text-muted-foreground tabular">
            {dates}
          </p>
        )}
        {hasEmail ? (
          <p className="truncate text-xs text-muted-foreground">
            Report goes to {record.insurerEmail}
          </p>
        ) : (
          // Said on the card, not only in a hover tooltip: a greyed-out Send
          // with no visible reason read as "there is no send option".
          <p className="text-xs text-warning">
            Add the insurer&apos;s email to send them a report.{" "}
            <button
              type="button"
              onClick={onEdit}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Add email
            </button>
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {hasEmail ? (
          sendButton
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* The wrapper takes the hover: a disabled button fires no events. */}
              <span tabIndex={0}>{sendButton}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-56">
              Add the insurer&apos;s email to this policy to send them a report.
            </TooltipContent>
          </Tooltip>
        )}
        <Button variant="ghost" size="sm" disabled={removing} onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={removing}
          onClick={onRemove}
          className="text-destructive hover:text-destructive"
        >
          {removing && <Loader2 className="size-3.5 animate-spin" />}
          {removing ? "Removing…" : "Remove"}
        </Button>
      </div>
    </div>
  );
}
