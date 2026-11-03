"use client";

import * as React from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useStageCountryMutation } from "@/hooks/use-admin-countries-query";
import { registryErrorMessage, type CountryConfig } from "@/lib/admin/countries";

/**
 * The country-specific products a business here can use.
 *
 * These are the flags `requireCountryFeature` reads on the backend: turning
 * `ndis` off doesn't hide a menu, it 404s the route. So they are listed with
 * what each one actually gates rather than as bare keys.
 *
 * Flipping one stages it. Nothing changes for a business until the country is
 * published — which is why the switch shows "staged" rather than claiming the
 * change is live.
 */
const FEATURE_COPY: Record<string, { label: string; description: string }> = {
  ndis: {
    label: "NDIS",
    description: "NDIS participant and plan-manager fields, NDIS invoice templates and the service catalogue.",
  },
  super_contributions: {
    label: "Superannuation",
    description: "Super contributions, funds and the contribution matrix.",
  },
  income_tax_estimator: {
    label: "Income tax estimator",
    description: "Tax brackets, Medicare levy and offsets. Australian rules, so it needs its own engine elsewhere.",
  },
  investment_property: {
    label: "Investment property",
    description: "Property summaries and capital gains tabs.",
  },
  km_statutory_rate: {
    label: "Statutory km rate",
    description: "The cents-per-kilometre method. The kilometre tracker stays either way.",
  },
  payto: { label: "PayTo", description: "PayTo mandates — the Australian real-time payment scheme." },
  worldpay: { label: "Worldpay", description: "Worldpay card acquiring and merchant onboarding." },
  bank_feeds: { label: "Bank feeds", description: "Automatic bank transaction import for this country's provider." },
};

export function FeaturesTab({
  iso2,
  config,
  effective,
}: {
  iso2: string;
  config: CountryConfig;
  effective: CountryConfig;
}) {
  const stage = useStageCountryMutation(iso2);
  const [pending, setPending] = React.useState<string | null>(null);

  const features = effective.features ?? {};
  const keys = Object.keys({ ...FEATURE_COPY, ...features }).sort();

  const toggle = (key: string, next: boolean) => {
    setPending(key);
    stage.mutate(
      { features: { ...features, [key]: next } },
      {
        onSuccess: () =>
          toast.success(`${FEATURE_COPY[key]?.label ?? key} ${next ? "enabled" : "disabled"}`, {
            description: "Staged — publish the country to make it real.",
          }),
        onError: (error) => toast.error(registryErrorMessage(error, "The change couldn't be staged.")),
        onSettled: () => setPending(null),
      },
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A feature that&apos;s off here isn&apos;t hidden in the app — its routes refuse the request,
        with a message naming the country. Changes are staged until the country is published.
      </p>

      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {keys.map((key) => {
          const copy = FEATURE_COPY[key];
          const on = features[key] === true;
          const staged = (config.features?.[key] ?? false) !== on;

          return (
            <div key={key} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <Label htmlFor={`feature-${key}`} className="flex items-center gap-2 font-medium">
                  {copy?.label ?? key}
                  {staged ? (
                    <span className="rounded-full bg-warning/10 px-1.5 py-px text-[11px] font-medium text-warning">
                      staged
                    </span>
                  ) : null}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {copy?.description ?? (
                    <span className="font-mono text-xs">{key}</span>
                  )}
                </p>
              </div>
              <Switch
                id={`feature-${key}`}
                checked={on}
                disabled={pending !== null}
                onCheckedChange={(next) => toggle(key, next)}
                aria-label={`${copy?.label ?? key} in this country`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
