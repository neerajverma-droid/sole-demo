"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Layers, Loader2, Puzzle, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Shimmer } from "@/components/ui/shimmer";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AddonRow, Price } from "@/components/pricing/addon-row";
import { pricingMoney, pricingPeriodLabel } from "@/lib/pricing";
import {
  INCLUDED_ADDON_COUNT,
  defaultIncludedAddons,
  fetchSubscriptionCatalogue,
  plansForInterval,
  selectionMonthlyTotal,
  type BillingInterval,
  type SubscriptionPlan,
} from "@/lib/subscription";
import { cn } from "@/lib/utils";

export type PricingSelection = {
  planSlug: string;
  /** Add-on slugs, in the order they were switched on — see `INCLUDED_ADDON_COUNT`. */
  addons: string[];
  billing: BillingInterval;
  /** Per average month, with any discount already applied. */
  monthlyTotal: number;
};

/**
 * The plan picker for paying for a business.
 *
 * Built on the live `/subscription/plans` catalogue — the same packages and
 * add-ons sole-ocr's `create-session` prices against — rather than the
 * hard-coded tiers it used to show, whose ids (`invexp`, `compliance`,
 * `advassets`) matched nothing the server sells and so could never have been
 * checked out.
 *
 * `discount` is a standing multiplier on every figure — 0.5 where an
 * additional business is half price. Shown rather than quietly applied: each
 * price keeps its full figure struck through beside the discounted one.
 * Stripe applies the real discount at checkout; this is what it will be.
 */
export function PricingPlans({
  discount = 1,
  ctaLabel,
  onSubmit,
  busy = false,
  secondaryAction,
}: {
  discount?: number;
  ctaLabel: string;
  onSubmit: (selection: PricingSelection) => void;
  /** Checkout is being started — the CTA spins and the picker locks. */
  busy?: boolean;
  /** Bottom-left of the action row — a Back button, where there's one to offer. */
  secondaryAction?: React.ReactNode;
}) {
  const catalogueQuery = useQuery({
    queryKey: ["subscription", "catalogue"],
    queryFn: fetchSubscriptionCatalogue,
  });

  const [billing, setBilling] = React.useState<BillingInterval>("monthly");
  const [planSlug, setPlanSlug] = React.useState<string | null>(null);
  const [addonSlugs, setAddonSlugs] = React.useState<string[]>([]);

  // The free plan can't be checked out — paying for a business means a paid one.
  const packages = React.useMemo(
    () =>
      plansForInterval(catalogueQuery.data?.packages ?? [], billing).filter(
        (plan) => plan.slug !== "free" && plan.price > 0,
      ),
    [catalogueQuery.data, billing],
  );
  const addons = React.useMemo(
    () => plansForInterval(catalogueQuery.data?.addons ?? [], billing),
    [catalogueQuery.data, billing],
  );

  const selectedPlan =
    packages.find((plan) => plan.slug === planSlug) ??
    packages.find((plan) => !plan.comingSoon) ??
    null;
  const selectedAddons = addonSlugs
    .map((slug) => addons.find((addon) => addon.slug === slug))
    .filter((addon): addon is SubscriptionPlan => Boolean(addon));
  const included = selectedPlan
    ? (INCLUDED_ADDON_COUNT[selectedPlan.slug] ?? 0)
    : 0;

  /*
   * The package's free slots arrive filled.
   *
   * An effect rather than a click handler, unlike the Settings picker: nothing
   * is selected here to begin with, `selectedPlan` falls back to the first
   * package that isn't coming soon, and a panel whose default package shows
   * "includes 3" over three empty checkboxes reads as broken. Nobody is
   * charged for a slot the package covers, so filling them costs nothing and
   * shows the offer as made.
   *
   * Keyed on the package and the interval, because switching to annual
   * replaces every row with its annual twin — same slugs, different objects —
   * and the top-up has to be re-run against the list actually on screen.
   */
  const lastDefaulted = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!selectedPlan || addons.length === 0) return;
    const key = `${selectedPlan.slug}:${billing}`;
    if (lastDefaulted.current === key) return;
    lastDefaulted.current = key;
    setAddonSlugs((current) =>
      defaultIncludedAddons(selectedPlan.slug, addons, current),
    );
  }, [selectedPlan, addons, billing]);

  const discounted = discount < 1;
  const total = selectionMonthlyTotal(selectedPlan, selectedAddons) * discount;

  const toggleAddon = (slug: string) =>
    setAddonSlugs((current) =>
      current.includes(slug)
        ? current.filter((entry) => entry !== slug)
        : [...current, slug],
    );

  if (catalogueQuery.isPending) {
    return (
      <div className="space-y-3" aria-hidden>
        <Shimmer className="h-10 w-72 rounded-md" />
        <Shimmer className="h-80 w-full rounded-lg border border-border" />
      </div>
    );
  }

  if (catalogueQuery.isError || packages.length === 0) {
    return (
      <div className="space-y-3 rounded-lg border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load the plans just now.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {secondaryAction}
          <Button
            variant="outline"
            onClick={() => void catalogueQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">
            Simple pricing, built for you.
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose your package and add the features you need. Every plan starts
            with a free trial.
          </p>
        </div>

        {/*
          A two-value toggle rather than a switch: both options are named, and
          the saving hangs off the one it applies to. Radix clears a
          single-select toggle when the active item is pressed again, and
          there's no "no cycle" to bill on — so the current one stands.
        */}
        <ToggleGroup
          type="single"
          value={billing}
          onValueChange={(next) => next && setBilling(next as BillingInterval)}
          aria-label="Billing cycle"
          disabled={busy}
          className="gap-1 rounded-full border border-border p-0.5"
        >
          <ToggleGroupItem
            value="monthly"
            className="h-7 rounded-full px-3 text-xs font-normal data-[state=on]:bg-primary data-[state=on]:font-medium data-[state=on]:text-primary-foreground"
          >
            Monthly
          </ToggleGroupItem>
          <ToggleGroupItem
            value="annual"
            className="h-7 gap-1.5 rounded-full px-3 text-xs font-normal data-[state=on]:bg-primary data-[state=on]:font-medium data-[state=on]:text-primary-foreground"
          >
            Annual
            <Badge
              variant="outline"
              className="rounded-full border-transparent bg-success/15 px-1.5 py-0 text-[10px] font-semibold text-success"
            >
              SAVE 20%
            </Badge>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <FormSection
          icon={Layers}
          title="1. Select package"
          description="One package, and only one — add-ons are how you extend it."
        >
          <RadioGroup
            value={selectedPlan?.slug ?? ""}
            onValueChange={setPlanSlug}
            disabled={busy}
            className="gap-2.5"
          >
            {packages.map((plan) => (
              <PackageCard
                key={plan.slug}
                plan={plan}
                selected={plan.slug === selectedPlan?.slug}
                discount={discount}
              />
            ))}
          </RadioGroup>
        </FormSection>

        <FormSection
          icon={Puzzle}
          title="2. Add-ons"
          description={
            included === Number.POSITIVE_INFINITY
              ? `Every add-on is included with ${selectedPlan?.name}.`
              : included > 0
                ? `${selectedPlan?.name} includes ${included} add-ons — anything past that is extra.`
                : "Switch on what this business needs."
          }
          className="space-y-2"
        >
          {addons.map((addon) => {
            const position = addonSlugs.indexOf(addon.slug);
            return (
              <AddonRow
                key={addon.slug}
                addon={addon}
                checked={position !== -1}
                includedInPlan={position !== -1 && position < included}
                onToggle={() => toggleAddon(addon.slug)}
                discount={discount}
                disabled={busy}
              />
            );
          })}
        </FormSection>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight tabular">
              {pricingMoney(total)}
            </span>
            <span className="text-xs text-muted-foreground">
              {pricingPeriodLabel(billing)}
            </span>
          </p>
          {discounted && (
            <p className="mt-1 text-xs font-medium text-success">
              {Math.round((1 - discount) * 100)}% off applied at checkout —
              additional businesses are half price.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {secondaryAction}
            <p className="text-xs text-muted-foreground">
              Secure payment by Stripe · cancel anytime
            </p>
          </div>
          <Button
            disabled={busy || !selectedPlan}
            onClick={() =>
              selectedPlan &&
              onSubmit({
                planSlug: selectedPlan.slug,
                addons: addonSlugs,
                billing,
                monthlyTotal: total,
              })
            }
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {busy ? "Opening checkout…" : ctaLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * One package.
 *
 * The whole card is the label, so clicking anywhere on it selects — a radio you
 * have to hit exactly is a radio in a list of five that people miss.
 */
function PackageCard({
  plan,
  selected,
  discount,
}: {
  plan: SubscriptionPlan;
  selected: boolean;
  discount: number;
}) {
  return (
    <Label
      htmlFor={`package-${plan.slug}`}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal",
        "motion-safe:transition-colors",
        selected
          ? "border-primary/40 bg-primary/[0.04]"
          : "border-border hover:bg-accent/40",
        plan.comingSoon && "cursor-not-allowed opacity-60",
      )}
    >
      <RadioGroupItem
        id={`package-${plan.slug}`}
        value={plan.slug}
        disabled={plan.comingSoon}
        className="mt-1"
      />
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{plan.name}</span>
          {plan.badge && (
            <Badge
              variant="outline"
              className="rounded-full border-transparent bg-muted px-2 py-0 text-[10px] font-semibold text-muted-foreground"
            >
              {plan.badge}
            </Badge>
          )}
          {plan.comingSoon && (
            <Badge
              variant="outline"
              className="rounded-full px-2 py-0 text-[10px]"
            >
              Coming soon
            </Badge>
          )}
        </span>

        <span className="block space-y-0.5">
          {plan.includes.map((feature) => (
            <span
              key={feature}
              className="flex items-start gap-1.5 text-xs text-muted-foreground"
            >
              <Check
                className="mt-0.5 size-3 shrink-0 text-success"
                aria-hidden
              />
              {feature}
            </span>
          ))}
          {plan.excludes.map((feature) => (
            <span
              key={feature}
              className="flex items-start gap-1.5 text-xs text-muted-foreground/70"
            >
              <X className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span className="line-through">{feature}</span>
            </span>
          ))}
        </span>
      </span>

      <Price full={plan.monthlyPrice} discount={discount} />
    </Label>
  );
}
