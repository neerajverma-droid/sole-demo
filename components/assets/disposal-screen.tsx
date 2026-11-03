"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Info, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { assetMoney, assetValue, type AssetInsurance } from "@/lib/assets";
import { toIsoDate } from "@/lib/invoices";
import { useAssetDisposalQuery, useRecordAssetDisposalMutation } from "@/hooks/use-asset-disposal-query";
import { useAssetInsuranceQuery } from "@/hooks/use-asset-insurance-query";
import { useAssetsQuery } from "@/hooks/use-assets-query";
import { useAssetsStore } from "@/stores/assets";

const ASSETS_ROOT = "/assets";

/**
 * What the insurer says the asset is worth, if anyone has said.
 *
 * The first policy's coverage: a second policy on the same asset covers
 * something narrower — tools in transit, say — so the first is the one that
 * stands for the whole thing. A suggestion either way, and the field stays
 * editable.
 */
function suggestedSaleValue(insurance: AssetInsurance[]): string {
  return insurance[0]?.coverageAmount ?? "";
}

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
  // Hydrates the register on a direct/refreshed visit to this route.
  useAssetsQuery();
  const assets = useAssetsStore((state) => state.assets);
  const { data: disposal } = useAssetDisposalQuery(assetId);
  const { data: insurance = [] } = useAssetInsuranceQuery(assetId);
  const recordDisposal = useRecordAssetDisposalMutation(assetId);

  const asset = assets.find((entry) => entry.id === assetId);
  const assetHref = `${ASSETS_ROOT}/${assetId}`;
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
    setSaleValue(disposal?.saleValue || suggestedSaleValue(insurance));
  }, [disposal, insurance, today]);

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

  const record = async () => {
    try {
      await recordDisposal.mutateAsync({ disposedDate, saleValue });

      /*
       * Here, not in `updateAssetApi`, which is where a disposal is actually
       * written. That call cannot tell a disposal from any later edit of an
       * already-disposed asset, so firing there would count the same disposal
       * again every time somebody corrected a typo on the record.
       *
       * `value` is the asset's cost so it lines up with `asset_added`; the
       * sale price rides alongside, which is what makes gain-or-loss on
       * disposal answerable without joining back to the ledger.
       */
      track(EVENTS.ASSET_DISPOSED, {
        value: assetValue(asset),
        sale_value: Number(String(saleValue).replace(/,/g, "")) || 0,
      });

      toast.success(`${asset.name} recorded as disposed`);
      router.push(assetHref);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't record disposal",
      );
    }
  };

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
            {asset.name} — record disposal
          </h1>
          <p className="text-sm text-muted-foreground">
            {asset.category} · {assetMoney(assetValue(asset))}
            {!!disposal && " · already recorded as disposed"}
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
        description="When it left the business, and what you got for it."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              Date disposed
              <Required />
            </Label>
            <DatePicker
              label="Date disposed"
              value={disposedDate}
              onChange={setDisposedDate}
            />
          </div>

          <Field
            label="Sale value"
            htmlFor="disposal-sale-value"
            hint={
              insurance.length > 0
                ? "Suggested from this asset's insurance coverage — change it to what it actually sold for."
                : "Leave blank if it was scrapped or given away."
            }
          >
            <MoneyInput
              id="disposal-sale-value"
              label="Sale value"
              value={saleValue}
              onChange={setSaleValue}
            />
          </Field>
        </div>
      </FormSection>

      {/* Stuck to the foot of the viewport, matching the depreciation flow. */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button variant="outline" asChild>
          <Link href={assetHref}>Cancel</Link>
        </Button>
        <Button
          disabled={!disposedDate || recordDisposal.isPending}
          onClick={record}
        >
          {recordDisposal.isPending && (
            <Loader2 className="size-4 animate-spin" />
          )}
          {recordDisposal.isPending ? "Saving…" : "Record disposal"}
        </Button>
      </div>
    </div>
  );
}
