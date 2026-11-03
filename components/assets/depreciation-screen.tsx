"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Landmark, Loader2, TrendingDown, TriangleAlert } from "lucide-react";
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
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DatePicker } from "@/components/documents/date-picker";
import { Field, Required } from "@/components/documents/field";
import { MoneyInput } from "@/components/planner/money-input";
import {
  EMPTY_DEPRECIATION,
  assetExGstValue,
  assetMoney,
  assetValue,
  depreciationPreview,
  type AssetDepreciation,
  type DepreciationMethod,
} from "@/lib/assets";
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
import { documentTax } from "@/lib/country-context";
import { toIsoDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";
import {
  useAssetDepreciationQuery,
  useDeleteAssetDepreciationMutation,
  useSaveAssetDepreciationMutation,
} from "@/hooks/use-asset-depreciation-query";
import { useAssetsQuery } from "@/hooks/use-assets-query";
import { useCountryContext } from "@/hooks/use-country-context";
import { useAssetsStore } from "@/stores/assets";

const ASSETS_ROOT = "/assets";

/**
 * The methods, each with the line that tells them apart.
 *
 * Cards rather than a bare radio list, because the choice is between three
 * behaviours and not three words — "diminishing value" means nothing until you
 * read that it front-loads the deduction. A list of labels would put that
 * explanation in a tooltip nobody opens before choosing.
 */
const METHODS: { value: DepreciationMethod; hint: string }[] = [
  {
    value: "Straight line",
    hint: "Equal amounts over the asset's effective life",
  },
  {
    value: "Diminishing value",
    hint: "Higher depreciation initially, decreasing over time (20% rate)",
  },
  {
    value: "Full depreciation on purchase",
    hint: "Immediate write-off of the full asset value",
  },
];

const METHOD_TIP =
  "Straight line spreads the cost evenly; diminishing value claims more in the early years, when the asset loses value fastest. Full write-off is for assets that qualify for an immediate deduction.";

const RESIDUAL_TIP =
  "What you expect the asset to still be worth at the end of its effective life. Only the fall from cost to that figure is depreciated, so leaving it blank claims the whole cost.";

/**
 * Where "per ATO rules" points.
 *
 * The only external link in the app so far, so it's named here rather than
 * inlined — if the platform grows a resources page covering this, one constant
 * moves rather than a link buried in a callout.
 */
const ATO_DEPRECIATION_URL =
  "https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/depreciation-and-capital-expenses-and-allowances";

/** A fraction as a percentage, or the panel's stand-in when there isn't one. */
function rateLabel(rate: number | null): string {
  return rate === null ? "N/A" : `${(rate * 100).toFixed(2)}%`;
}

/**
 * Set up depreciation.
 *
 * A page rather than the modal this used to be. The flow has six fields, three
 * of which need a line of explanation, and a live preview of what they add up
 * to — which is more than a dialog can hold without scrolling its own body, and
 * the preview is the reason to give it the room: seeing the annual figure move
 * as you type is what tells you the effective life you guessed at is sensible.
 *
 * Two columns on a wide screen, form and preview, with the preview stuck to the
 * top of its column so it stays visible while the form is worked through. One
 * column below that, preview last — on a phone the figures are a summary of
 * what you've entered, so they belong after it.
 */
export function DepreciationScreen({ assetId }: { assetId: string }) {
  const router = useRouter();
  // Hydrates the register on a direct/refreshed visit to this route.
  useAssetsQuery();
  const assets = useAssetsStore((state) => state.assets);
  const saveDepreciation = useSaveAssetDepreciationMutation(assetId);
  const deleteDepreciation = useDeleteAssetDepreciationMutation(assetId);
  // The list-embedded `asset.depreciation` has no record id — needed here so
  // "Remove depreciation" knows which record to delete.
  const { data: depreciationRecord } = useAssetDepreciationQuery(assetId);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);
  const { country } = useCountryContext();

  const asset = assets.find((entry) => entry.id === assetId);
  const assetHref = `${ASSETS_ROOT}/${assetId}`;
  const today = toIsoDate(new Date());

  /**
   * The settings being edited, seeded from the asset.
   *
   * Local until Save, so leaving the page changes nothing — the same contract
   * the dialog had. The start date falls back to today rather than staying
   * blank: it's required, and a date picker opened on nothing is a field that
   * looks broken.
   */
  const [draft, setDraft] = React.useState<AssetDepreciation>(() => ({
    ...EMPTY_DEPRECIATION,
    ...asset?.depreciation,
    startDate: asset?.depreciation.startDate || today,
  }));

  /*
   * Reseeded once both the asset and its dedicated depreciation record have
   * loaded — the dedicated fetch is the authoritative one (it's what carries
   * the record id "Remove depreciation" needs), so this waits for it rather
   * than trusting the list-embedded summary a moment earlier.
   */
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current || !asset || depreciationRecord === undefined) return;
    seeded.current = true;
    setDraft({
      ...EMPTY_DEPRECIATION,
      ...(depreciationRecord ?? asset.depreciation),
      startDate:
        (depreciationRecord ?? asset.depreciation).startDate || today,
    });
  }, [asset, depreciationRecord, today]);

  const set = (values: Partial<AssetDepreciation>) =>
    setDraft((current) => ({ ...current, ...values }));

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

  // The business's word and rate on the purchase date — its custom rate, else
  // 10% AU / 15% NZ / 15% ZA — so the GST taken out is the GST that was paid.
  const assetTax = documentTax(country, asset.purchaseDate);
  const preview = depreciationPreview(asset, draft, assetTax.rate);
  /** The price with GST taken out — said in the subtitle and in the callout. */
  const exGstAmount = assetMoney(assetExGstValue(asset, assetTax.rate));
  const canSave = Number(draft.effectiveLife) > 0 && !!draft.startDate;

  const create = async () => {
    try {
      await saveDepreciation.mutateAsync({ ...draft, enabled: true });
      toast.success("Depreciation set up");
      router.push(assetHref);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't save depreciation",
      );
    }
  };

  const removeDepreciation = async () => {
    if (!depreciationRecord) return;
    try {
      await deleteDepreciation.mutateAsync(depreciationRecord.id);
      toast.success("Depreciation removed");
      setConfirmingRemove(false);
      router.push(assetHref);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't remove depreciation",
      );
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={assetHref}>
            <ArrowLeft />
            {asset.name}
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {depreciationRecord ? "Depreciation settings" : "Set up depreciation"}
          </h1>
          {/* The price as it was paid, and — where that price carried GST —
              what depreciation will actually be worked out on. Warned rather
              than stated quietly: the figure in the panel is lower than the
              number on the invoice, and that's better explained here than
              discovered there. */}
          <p className="text-sm text-muted-foreground">
            {asset.name} — {assetMoney(assetValue(asset))}
            {preview.exGst && (
              <span className="text-warning">
                {" "}
                ({assetTax.word} incl. — depreciation on ex-{assetTax.word}{" "}
                {exGstAmount})
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <FormSection
            icon={TrendingDown}
            title="Depreciation method"
            description="How the asset's value is written down over the years you use it."
          >
            <fieldset>
              <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                Method
                <InfoTip text={METHOD_TIP} />
              </legend>
              <RadioGroup
                value={draft.method}
                onValueChange={(method) =>
                  set({ method: method as DepreciationMethod })
                }
                className="grid gap-3"
              >
                {METHODS.map((method) => {
                  const chosen = draft.method === method.value;
                  return (
                    <Label
                      key={method.value}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-[14px] border p-4 font-normal leading-normal transition-colors",
                        chosen
                          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                          : "border-border hover:border-primary/40 hover:bg-muted/40",
                      )}
                    >
                      <RadioGroupItem value={method.value} className="mt-0.5" />
                      <span className="min-w-0 space-y-1">
                        <span className="block text-sm font-medium">
                          {method.value}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {method.hint}
                        </span>
                      </span>
                    </Label>
                  );
                })}
              </RadioGroup>
            </fieldset>
          </FormSection>

          <FormSection
            icon={TrendingDown}
            title="Depreciation details"
            description="The figures the yearly deduction is worked out from."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Effective life (years)"
                htmlFor="dep-life"
                required
                hint="Based on ATO effective life determinations or your own reasonable estimate"
              >
                <Input
                  id="dep-life"
                  inputMode="decimal"
                  className="tabular"
                  value={draft.effectiveLife}
                  onChange={(event) =>
                    set({ effectiveLife: event.target.value })
                  }
                />
              </Field>

              <Field
                label="Override rate (%)"
                htmlFor="dep-rate"
                hint={
                  draft.method === "Diminishing value"
                    ? "Leave blank to use the ATO's default 200% of the straight-line rate"
                    : `Only used for diminishing value — ${draft.method.toLowerCase()} has a fixed rate this can't change`
                }
              >
                <Input
                  id="dep-rate"
                  inputMode="decimal"
                  className="tabular"
                  placeholder="Auto-calculated"
                  disabled={draft.method !== "Diminishing value"}
                  value={draft.overrideRate}
                  onChange={(event) =>
                    set({ overrideRate: event.target.value })
                  }
                />
              </Field>

              <Field
                label="Residual (salvage) value"
                htmlFor="dep-residual"
                labelTip={RESIDUAL_TIP}
              >
                <MoneyInput
                  id="dep-residual"
                  label="Residual (salvage) value"
                  value={draft.residualValue}
                  onChange={(residualValue) => set({ residualValue })}
                />
              </Field>

              <Field
                label="Cost limit"
                htmlFor="dep-limit"
                hint="ATO cost limit for cars and specified assets"
              >
                <MoneyInput
                  id="dep-limit"
                  label="Cost limit"
                  value={draft.costLimit}
                  onChange={(costLimit) => set({ costLimit })}
                />
              </Field>

              <div className="sm:col-span-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    Depreciation start date
                    <Required />
                  </Label>
                  <DatePicker
                    label="Depreciation start date"
                    value={draft.startDate}
                    onChange={(startDate) => set({ startDate })}
                  />
                </div>
              </div>
            </div>
          </FormSection>
        </div>

        {/*
          The figures, beside the fields that move them.

          A plain card, not a tinted one. It carried the indigo wash the form
          sections use, which put a faint indigo behind an amber callout and
          turned both muddy — two tints an inch apart, neither of them winning.
          Neutral here means the only colour in the panel is the callout's, so
          the callout is the thing that stands out.

          Stuck to the top of its column on a wide screen so it's still on
          screen at the last field.
        */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="space-y-4 rounded-[14px] border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Depreciation preview</h2>

            {/*
              Why the depreciable cost is lower than the price paid, said where
              the two figures sit next to each other.

              The warning tone in full — amber fill, amber border, amber ink —
              rather than a tinted box relying on the surface behind it. The
              icon and the link both inherit that ink rather than bringing a
              third colour into a box this small; the link stays an underline,
              which is what marks it as one.

              Paired for dark mode: amber-50 behind amber-800 is a light-mode
              recipe, and unpaired it would be the one unreadable thing on a
              dark card.
            */}
            {preview.exGst && (
              <div className="flex items-start gap-2 rounded-[10px] border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p className="text-xs leading-relaxed">
                  Asset cost used for depreciation = purchase price excluding{" "}
                  {assetTax.word} ({exGstAmount}), per ATO rules.{" "}
                  <a
                    href={ATO_DEPRECIATION_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Learn more
                  </a>
                </p>
              </div>
            )}

            <dl className="space-y-3">
              <PreviewLine
                label="Depreciable cost"
                value={assetMoney(preview.depreciableCost)}
              />
              <PreviewLine
                label="Opening book value"
                value={assetMoney(preview.openingBookValue)}
              />
              <PreviewLine label="Rate" value={rateLabel(preview.rate)} />
              <PreviewLine
                label="Annual depreciation"
                value={assetMoney(preview.annualDepreciation)}
                strong
              />
            </dl>
          </div>
        </aside>
      </div>

      {/* Stuck to the foot of the viewport: the form is long enough that the
          buttons would otherwise be somewhere you have to go looking for. */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {depreciationRecord && (
          <Button
            variant="outline"
            className="mr-auto text-destructive hover:text-destructive"
            onClick={() => setConfirmingRemove(true)}
          >
            Remove depreciation
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link href={assetHref}>Cancel</Link>
        </Button>
        <Button
          disabled={!canSave || saveDepreciation.isPending}
          onClick={create}
        >
          {saveDepreciation.isPending && <Loader2 className="size-4 animate-spin" />}
          {saveDepreciation.isPending
            ? "Saving…"
            : depreciationRecord
              ? "Save changes"
              : "Create depreciation"}
        </Button>
      </div>

      <AlertDialog open={confirmingRemove} onOpenChange={setConfirmingRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove depreciation?</AlertDialogTitle>
            <AlertDialogDescription>
              {asset.name} stops depreciating. This can&apos;t be undone —
              you&apos;d need to set it up again from scratch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteDepreciation.isPending}
              onClick={removeDepreciation}
            >
              {deleteDepreciation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {deleteDepreciation.isPending ? "Removing…" : "Remove depreciation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * One figure in the preview.
 *
 * The value takes the design system's ink and nothing else — these are four
 * plain numbers, and a tint on any of them would read as a status none of them
 * has. Paired with the token in dark mode, where a near-black figure on a dark
 * card would be the one unreadable line in the panel.
 */
function PreviewLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "shrink-0 text-sm tabular text-[#0F1117] dark:text-foreground",
          strong ? "font-semibold" : "font-medium",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
