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
import { ArrowLeft, Landmark, Loader2, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/documents/date-picker";
import { Required } from "@/components/documents/field";
import { MoneyInput } from "@/components/planner/money-input";
import { formatAssetDate, newAssetInsurance, type AssetInsurance } from "@/lib/assets";
import {
  useAssetInsuranceQuery,
  useCreateAssetInsuranceMutation,
  useDeleteAssetInsuranceMutation,
  useUpdateAssetInsuranceMutation,
} from "@/hooks/use-asset-insurance-query";
import { useAssetsQuery } from "@/hooks/use-assets-query";
import { useAssetsStore } from "@/stores/assets";

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
  // Hydrates the register on a direct/refreshed visit to this route.
  useAssetsQuery();
  const assets = useAssetsStore((state) => state.assets);
  const { data: records = [] } = useAssetInsuranceQuery(assetId);
  const createInsurance = useCreateAssetInsuranceMutation(assetId);
  const updateInsurance = useUpdateAssetInsuranceMutation(assetId);
  const deleteInsurance = useDeleteAssetInsuranceMutation(assetId);

  const asset = assets.find((entry) => entry.id === assetId);
  const assetHref = `${ASSETS_ROOT}/${assetId}`;

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
  const [saving, setSaving] = React.useState(false);
  const [confirmingRemoveId, setConfirmingRemoveId] = React.useState<string | null>(null);

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
  const startAdding = () => setDraft(newAssetInsurance());

  const commit = async () => {
    if (!draft) return;
    const exists = records.some((record) => record.id === draft.id);
    setSaving(true);
    try {
      if (exists) await updateInsurance.mutateAsync(draft);
      else await createInsurance.mutateAsync(draft);
      setDraft(null);
      toast.success(exists ? "Insurance updated" : "Insurance added");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't save that policy",
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!confirmingRemoveId) return;
    try {
      await deleteInsurance.mutateAsync(confirmingRemoveId);
      if (draft?.id === confirmingRemoveId) setDraft(null);
      toast.success("Insurance removed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't remove that policy",
      );
    } finally {
      setConfirmingRemoveId(null);
    }
  };

  // Only the insurer is required — everything else is something you may not
  // have to hand when you're recording the policy.
  const canSave = !!draft && draft.insurerName.trim().length > 0;

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
            {asset.name}
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

      <section className="space-y-4">
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
                    onEdit={() => setDraft({ ...record })}
                    onRemove={() => setConfirmingRemoveId(record.id)}
                    removing={deleteInsurance.isPending && confirmingRemoveId === record.id}
                  />
                </li>
              ))}
            </ul>
          )
        )}

        {draft && (
          <div className="space-y-4 rounded-[14px] border border-border bg-card p-5 shadow-sm">
            <div className="space-y-2">
              <Label
                htmlFor="insurance-insurer"
                className="flex items-center gap-1.5"
              >
                Insurer name
                <Required />
                <InfoTip text={INSURER_HELP} />
              </Label>
              <Input
                id="insurance-insurer"
                value={draft.insurerName}
                onChange={(event) => patch({ insurerName: event.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="insurance-policy">Policy number</Label>
                <Input
                  id="insurance-policy"
                  value={draft.policyNumber}
                  onChange={(event) =>
                    patch({ policyNumber: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="insurance-email">Insurer email contact</Label>
                <Input
                  id="insurance-email"
                  type="email"
                  value={draft.insurerEmail}
                  onChange={(event) =>
                    patch({ insurerEmail: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="insurance-broker">Broker&apos;s name</Label>
                <Input
                  id="insurance-broker"
                  value={draft.brokerName}
                  onChange={(event) =>
                    patch({ brokerName: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="insurance-broker-phone">
                  Broker&apos;s phone number
                </Label>
                <Input
                  id="insurance-broker-phone"
                  inputMode="tel"
                  value={draft.brokerPhone}
                  onChange={(event) =>
                    patch({ brokerPhone: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="insurance-coverage">Coverage amount</Label>
                <MoneyInput
                  id="insurance-coverage"
                  label="Coverage amount"
                  value={draft.coverageAmount}
                  onChange={(coverageAmount) => patch({ coverageAmount })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="insurance-premium">Premium amount</Label>
                <MoneyInput
                  id="insurance-premium"
                  label="Premium amount"
                  value={draft.premiumAmount}
                  onChange={(premiumAmount) => patch({ premiumAmount })}
                />
              </div>

              <div className="space-y-2">
                <Label>Start date</Label>
                <DatePicker
                  label="Start date"
                  value={draft.startDate}
                  onChange={(startDate) => patch({ startDate })}
                />
              </div>

              <div className="space-y-2">
                <Label>End date</Label>
                <DatePicker
                  label="End date"
                  value={draft.endDate}
                  onChange={(endDate) => patch({ endDate })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="insurance-notes">Notes</Label>
              <Textarea
                id="insurance-notes"
                rows={3}
                value={draft.notes}
                onChange={(event) => patch({ notes: event.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!canSave || saving} onClick={commit}>
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
          <Link href={assetHref}>Back to asset</Link>
        </Button>
      </div>

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
}: {
  record: AssetInsurance;
  onEdit: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
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
      </div>

      <div className="flex shrink-0 items-center gap-1">
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
