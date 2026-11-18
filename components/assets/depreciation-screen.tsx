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
import { apiErrorMessage } from "@/lib/api-error";
import { depreciationErrors, type DepreciationField } from "@/lib/asset-validation";
import { documentTax } from "@/lib/country-context";
import { toIsoDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";
import {
  useAssetDepreciationQuery,
  useDeleteAssetDepreciationMutation,
  useSaveAssetDepreciationMutation,
} from "@/hooks/use-asset-depreciation-query";
import { useRegisterAsset } from "@/hooks/use-asset-query";
import { useCountryContext } from "@/hooks/use-country-context";

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

/**
 * The tax authority's depreciation rules this screen points at. New Zealand
 * depreciates under IRD's rules (published rates by asset class, IR265); every
 * other country keeps the Australian wording it has always had.
 */
const DEPRECIATION_RULES_COPY = {
  AU: {
    authority: "ATO",
    url: ATO_DEPRECIATION_URL,
    lifeHint: "Based on ATO effective life determinations or your own reasonable estimate",
    rateHint: "Leave blank to use the ATO's default 200% of the straight-line rate",
    costLimitHint: "ATO cost limit for cars and specified assets",
  },
  NZ: {
    authority: "IRD",
    url: "https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-expenses/depreciation/claiming-depreciation",
    lifeHint: "IRD's estimated useful life for this asset class (IR265 or IRD's rate finder)",
    rateHint: "Leave blank to use IRD's published rate for this useful life",
    costLimitHint: "Optional cap on the cost that is depreciated",
  },
} as const;

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
  // The register's copy, or the asset fetched on its own on a direct visit.
  const { asset, loading } = useRegisterAsset(assetId);
  const saveDepreciation = useSaveAssetDepreciationMutation(assetId);
  const deleteDepreciation = useDeleteAssetDepreciationMutation(assetId);
  // The list-embedded `asset.depreciation` has no record id — needed here so
  // "Remove depreciation" knows which record to delete.
  const { data: depreciationRecord } = useAssetDepreciationQuery(assetId);
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);
  const { country } = useCountryContext();

  // Back, Cancel and "done" return to the register — `/assets/:id` is the edit
  // form (it shows "Loading asset…" and isn't where these screens were opened
  // from).
  const assetHref = ASSETS_ROOT;
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
   *
   * And again whenever that record changes on the server while nothing has
   * been typed here: a cached copy paints first and the refetch behind it
   * (say, after the asset form changed the life) must replace it.
   */
  const edited = React.useRef(false);
  const source = asset && depreciationRecord !== undefined
    ? (depreciationRecord ?? asset.depreciation)
    : null;
  const sourceKey = source ? JSON.stringify(source) : null;
  React.useEffect(() => {
    if (!source || edited.current) return;
    setDraft({
      ...EMPTY_DEPRECIATION,
      ...source,
      startDate: source.startDate || today,
    });
    // `sourceKey` stands for `source`: a new object with the same values
    // shouldn't reseed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, today]);

  const set = (values: Partial<AssetDepreciation>) => {
    edited.current = true;
    setDraft((current) => ({ ...current, ...values }));
  };

  /**
   * Errors show once a field is left or Save is tried — never on first paint,
   * where a seeded record would otherwise open already complaining.
   */
  const [touched, setTouched] = React.useState<Set<DepreciationField>>(
    new Set(),
  );
  const [attempted, setAttempted] = React.useState(false);
  const touch = (field: DepreciationField) =>
    setTouched((current) =>
      current.has(field) ? current : new Set(current).add(field),
    );

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

  // The business's word and rate on the purchase date — its custom rate, else
  // 10% AU / 15% NZ / 15% ZA — so the GST taken out is the GST that was paid.
  const assetTax = documentTax(country, asset.purchaseDate);
  const preview = depreciationPreview(asset, draft, assetTax.rate, country.iso2);
  const rulesCopy = country.iso2 === "NZ" ? DEPRECIATION_RULES_COPY.NZ : DEPRECIATION_RULES_COPY.AU;
  /** The price with GST taken out — said in the subtitle and in the callout. */
  const exGstAmount = assetMoney(assetExGstValue(asset, assetTax.rate));
  // A full write-off is the whole cost in year one — no effective life to ask for.
  const fullWriteOff = draft.method === "Full depreciation on purchase";
  /*
   * Residual and cost limit cap at the figure depreciation is worked out on —
   * the ex-GST cost where the price carried GST, the same base the preview
   * uses. The override rate is only checked where its field is editable.
   */
  const errors = depreciationErrors(draft, {
    assetValue: assetExGstValue(asset, assetTax.rate),
    fullWriteOff,
    overrideRateApplies: draft.method === "Diminishing value",
  });
  const errorFor = (field: DepreciationField) =>
    attempted || touched.has(field) ? errors[field] : undefined;
  const canSave = Object.keys(errors).length === 0 && !!draft.startDate;

  const create = async () => {
    setAttempted(true);
    if (!canSave) return;
    try {
      await saveDepreciation.mutateAsync({ ...draft, enabled: true });
      toast.success("Depreciation set up");
      router.push(assetHref);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't save depreciation"));
    }
  };

  const removeDepreciation = async () => {
    if (!depreciationRecord) return;
    try {
      // By asset id: the endpoint finds the asset's active record itself.
      await deleteDepreciation.mutateAsync();
      toast.success("Depreciation removed");
      setConfirmingRemove(false);
      router.push(assetHref);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't remove depreciation"));
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={assetHref}>
            <ArrowLeft />
            Assets
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
            tourId="asset-depreciation-method"
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
                required={!fullWriteOff}
                hint={
                  fullWriteOff
                    ? "Not needed — a full write-off claims the whole cost in the first year"
                    : rulesCopy.lifeHint
                }
                error={errorFor("effectiveLife")}
              >
                <Input
                  id="dep-life"
                  placeholder="e.g. 5"
                  inputMode="decimal"
                  className="tabular"
                  disabled={fullWriteOff}
                  value={fullWriteOff ? "" : draft.effectiveLife}
                  onChange={(event) =>
                    set({ effectiveLife: event.target.value })
                  }
                  onBlur={() => touch("effectiveLife")}
                  aria-invalid={!!errorFor("effectiveLife")}
                />
              </Field>

              <Field
                label="Override rate (%)"
                htmlFor="dep-rate"
                hint={
                  draft.method === "Diminishing value"
                    ? rulesCopy.rateHint
                    : `Only used for diminishing value — ${draft.method.toLowerCase()} has a fixed rate this can't change`
                }
                error={errorFor("overrideRate")}
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
                  onBlur={() => touch("overrideRate")}
                  aria-invalid={!!errorFor("overrideRate")}
                />
              </Field>

              <Field
                label="Residual (salvage) value"
                htmlFor="dep-residual"
                labelTip={RESIDUAL_TIP}
                error={errorFor("residualValue")}
              >
                <MoneyInput
                  id="dep-residual"
                  placeholder="0.00"
                  label="Residual (salvage) value"
                  value={draft.residualValue}
                  onChange={(residualValue) => set({ residualValue })}
                  onBlur={() => touch("residualValue")}
                  invalid={!!errorFor("residualValue")}
                />
              </Field>

              <Field
                label="Cost limit"
                htmlFor="dep-limit"
                hint={rulesCopy.costLimitHint}
                error={errorFor("costLimit")}
              >
                <MoneyInput
                  id="dep-limit"
                  placeholder="No limit"
                  label="Cost limit"
                  value={draft.costLimit}
                  onChange={(costLimit) => set({ costLimit })}
                  onBlur={() => touch("costLimit")}
                  invalid={!!errorFor("costLimit")}
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
        <aside
          className="lg:sticky lg:top-20 lg:self-start"
          data-usertour="asset-depreciation-preview"
        >
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
                  {assetTax.word} ({exGstAmount}), per {rulesCopy.authority} rules.{" "}
                  <a
                    href={rulesCopy.url}
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
          // Clickable until tried, so the first click can say what's wrong;
          // after that it stays off until the errors are fixed.
          disabled={(attempted && !canSave) || saveDepreciation.isPending}
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
