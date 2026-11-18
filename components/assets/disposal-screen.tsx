"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Info, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FormSection } from "@/components/ui/form-section";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/documents/date-picker";
import { Field, Required } from "@/components/documents/field";
import { MoneyInput } from "@/components/planner/money-input";
import {
  assetMoney,
  assetValue,
  hasDisposal,
  suggestedDisposalSaleValue,
} from "@/lib/assets";
import { apiErrorMessage } from "@/lib/api-error";
import { disposalDateError, saleValueError } from "@/lib/asset-validation";
import { parseIsoDate, toIsoDate } from "@/lib/invoices";
import {
  useAssetDisposalQuery,
  useDeleteAssetDisposalMutation,
  useRecordAssetDisposalMutation,
} from "@/hooks/use-asset-disposal-query";
import { useAssetInsuranceQuery } from "@/hooks/use-asset-insurance-query";
import { useRegisterAsset } from "@/hooks/use-asset-query";

const ASSETS_ROOT = "/assets";

/**
 * Record disposal.
 *
 * Two fields, and one consequence worth saying out loud before either of them:
 * this is what stops the asset depreciating. That's the callout at the top —
 * it's the part nobody would guess from a date field and a sale price, and
 * finding out later that a deduction quietly ended is worse than being told.
 *
 * A page rather than a dialog, for the same reason the depreciation flow is
 * one: it's a record of something that happened, reachable by URL, and it
 * changes what the asset is rather than editing a setting on it.
 */
export function DisposalScreen({ assetId }: { assetId: string }) {
  const router = useRouter();
  // The register's copy, or the asset fetched on its own on a direct visit.
  const { asset, loading } = useRegisterAsset(assetId);
  const { data: disposal } = useAssetDisposalQuery(assetId);
  const { data: insurance = [] } = useAssetInsuranceQuery(assetId);
  const recordDisposal = useRecordAssetDisposalMutation(assetId);
  const deleteDisposal = useDeleteAssetDisposalMutation(assetId);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);
  const disposed = hasDisposal(disposal);

  // Back, Cancel and "done" return to the register — `/assets/:id` is the edit
  // form (it shows "Loading asset…" and isn't where these screens were opened
  // from).
  const assetHref = ASSETS_ROOT;
  const today = toIsoDate(new Date());

  /**
   * The disposal being recorded.
   *
   * Seeded from the fetched record where one already exists, so opening this
   * page on a disposed asset shows what was entered rather than a blank form
   * that would overwrite it with nothing.
   */
  const [disposedDate, setDisposedDate] = React.useState(today);
  const [saleValue, setSaleValue] = React.useState("");
  /**
   * Errors show once a field is left or Save is tried — not on first paint,
   * where a seeded form would otherwise open already complaining.
   */
  const [touched, setTouched] = React.useState({ date: false, sale: false });
  const [attempted, setAttempted] = React.useState(false);

  /*
   * Reseeded once the disposal record and insurance list have both loaded —
   * both arrive a beat after the first render, and a form seeded from nothing
   * would suggest no sale value on an insured asset.
   */
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current || disposal === undefined) return;
    seeded.current = true;
    setDisposedDate(disposal?.disposedDate || today);
    setSaleValue(
      (hasDisposal(disposal) && disposal?.saleValue) ||
        suggestedDisposalSaleValue(disposal, insurance),
    );
  }, [disposal, insurance, today]);

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

  const removeDisposal = async () => {
    try {
      await deleteDisposal.mutateAsync();
      toast.success(`Disposal removed — ${asset.name} is back on the register`);
      setConfirmingRemove(false);
      router.push(assetHref);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't remove the disposal"));
    }
  };

  const dateError = disposalDateError(disposedDate, today, asset.purchaseDate);
  const saleError = saleValueError(saleValue);
  const invalid = !!dateError || !!saleError;
  const shownDateError = attempted || touched.date ? dateError : null;
  const shownSaleError = attempted || touched.sale ? saleError : null;

  const record = async () => {
    setAttempted(true);
    if (invalid) return;
    try {
      await recordDisposal.mutateAsync({ disposedDate, saleValue });

      toast.success(`${asset.name} recorded as disposed`);
      router.push(assetHref);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't record disposal"));
    }
  };

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
            {asset.name} — record disposal
          </h1>
          <p className="text-sm text-muted-foreground">
            {asset.category} · {assetMoney(assetValue(asset))}
            {disposed && " · already recorded as disposed"}
          </p>
        </div>
      </div>

      {/*
        The consequence, before the fields that cause it.

        The brand's own blue rather than a raw palette colour, so it's the same
        informational tone the rest of the platform uses — and it reads as
        information rather than as a warning, which is right: disposing of an
        asset isn't a mistake, it just has an effect worth knowing about.
      */}
      <div className="flex items-start gap-3 rounded-[14px] border border-primary/20 bg-primary/5 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Recording a disposal will stop all depreciation for this asset. If you
          have insurance, the coverage amount will be suggested as the sale
          value.
        </p>
      </div>

      <FormSection
        icon={Landmark}
        title="Disposal details"
        tourId="asset-disposal-details"
        description="When it left the business, and what you got for it."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              Date disposed
              <Required />
            </Label>
            {/* Capped at today: a disposal is something that has happened. */}
            <DatePicker
              label="Date disposed"
              value={disposedDate}
              onChange={setDisposedDate}
              onClose={() => setTouched((t) => ({ ...t, date: true }))}
              toDate={parseIsoDate(today)}
              invalid={!!shownDateError}
            />
            {shownDateError && (
              <p className="text-xs text-destructive">{shownDateError}</p>
            )}
          </div>

          <Field
            label="Sale value"
            htmlFor="disposal-sale-value"
            error={shownSaleError ?? undefined}
            hint={
              suggestedDisposalSaleValue(disposal, insurance)
                ? "Suggested from this asset's insurance coverage — change it to what it actually sold for."
                : "Leave blank if it was scrapped or given away."
            }
          >
            <MoneyInput
              id="disposal-sale-value"
              placeholder="0.00"
              label="Sale value"
              value={saleValue}
              onChange={setSaleValue}
              onBlur={() => setTouched((t) => ({ ...t, sale: true }))}
              invalid={!!shownSaleError}
            />
          </Field>
        </div>
      </FormSection>

      {/* Stuck to the foot of the viewport, matching the depreciation flow. */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {disposed && (
          <Button
            variant="outline"
            className="mr-auto text-destructive hover:text-destructive"
            onClick={() => setConfirmingRemove(true)}
          >
            Remove disposal
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link href={assetHref}>Cancel</Link>
        </Button>
        <Button
          // Clickable until tried, so the first click can say what's wrong;
          // after that it stays off until the errors are fixed.
          disabled={(attempted && invalid) || recordDisposal.isPending}
          onClick={record}
        >
          {recordDisposal.isPending && (
            <Loader2 className="size-4 animate-spin" />
          )}
          {recordDisposal.isPending
            ? "Saving…"
            : disposed
              ? "Save changes"
              : "Record disposal"}
        </Button>
      </div>

      <AlertDialog open={confirmingRemove} onOpenChange={setConfirmingRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this disposal?</AlertDialogTitle>
            <AlertDialogDescription>
              {asset.name} goes back to being held by the business, the disposal
              date and sale value are cleared, and its depreciation picks up
              again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDisposal.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteDisposal.isPending}
              onClick={(event) => {
                // Stays open, reading "Removing…", until the server answers.
                event.preventDefault();
                void removeDisposal();
              }}
            >
              {deleteDisposal.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {deleteDisposal.isPending ? "Removing…" : "Remove disposal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
