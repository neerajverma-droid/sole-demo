"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { AuthLayout } from "@/components/auth/auth-layout";
import { useAuthEntry } from "@/components/auth/use-auth-entry";
import BrandSplashLoader from "@/components/layout/brand-splash-loader";
import { Button } from "@/components/ui/button";
import { DEMO_LOGIN_ENABLED, startDemo } from "@/lib/demo";
import {
  CATEGORY_LABELS,
  INDUSTRY_CATALOG,
  resolveIndustrySlug,
} from "@/lib/demo-seed/industries/catalog";
import { useCountryStore } from "@/stores/country";

type Country = "AU" | "NZ";

/**
 * The demo entry for a market: `/au?industry=plumbing`, `/nz?industry=cleaning`.
 *
 * A known industry in the link starts that demo straight away. Without one (or
 * with one we don't recognise) the visitor picks theirs from the same groups the
 * marketing site shows. Either way the demo opens in the market's own country
 * settings — GST rate, labels, currency, forms — and starts from clean data.
 */
export function DemoEntry({ country }: { country: Country }) {
  const params = useSearchParams();
  const { land } = useAuthEntry();
  const queryClient = useQueryClient();
  const resetCountry = useCountryStore((s) => s.reset);

  const requested = params?.get("industry") ?? "";
  const slug = resolveIndustrySlug(requested);

  const [starting, setStarting] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const started = React.useRef(false);

  const begin = React.useCallback(
    async (industry: string) => {
      setError(null);
      setStarting(industry);
      const result = await startDemo({ industry, country });
      if (!result.ok || !result.user) {
        setStarting(null);
        setError(result.ok ? "We couldn't start the demo. Please try again." : result.message);
        return;
      }
      // A new visit must not inherit the previous one's country or cached lists.
      resetCountry();
      queryClient.clear();
      await land(result.user);
    },
    [country, land, queryClient, resetCountry],
  );

  React.useEffect(() => {
    if (!DEMO_LOGIN_ENABLED || !slug || started.current) return;
    started.current = true;
    void begin(slug);
  }, [slug, begin]);

  if (slug && !error) return <BrandSplashLoader />;

  const marketName = country === "NZ" ? "New Zealand" : "Australia";
  const groups = Object.entries(CATEGORY_LABELS).map(([category, label]) => ({
    label,
    industries: INDUSTRY_CATALOG.filter((entry) => entry.category === category),
  }));

  return (
    <AuthLayout
      heading="Try Sole with your kind of business"
      subtext={`Pick your industry to explore a ready-made ${marketName} demo.`}
      promoHeadline="See Sole with books that look like yours"
      promoSupporting="Every demo is filled with sample clients, invoices and expenses for your industry. Nothing you do is saved beyond this visit."
    >
      {error ? (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {requested && !slug ? (
        <p className="mb-3 text-sm text-muted-foreground">
          We don&apos;t have a demo called &ldquo;{requested}&rdquo; — pick the closest below.
        </p>
      ) : null}
      <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto pr-1">
        {groups
          .filter((group) => group.industries.length > 0)
          .map((group) => (
            <section key={group.label}>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">{group.label}</h2>
              <div className="flex flex-wrap gap-2">
                {group.industries.map((entry) => (
                  <Button
                    key={entry.slug}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={starting !== null}
                    onClick={() => void begin(entry.slug)}
                  >
                    {starting === entry.slug ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                    {entry.label}
                  </Button>
                ))}
              </div>
            </section>
          ))}
      </div>
    </AuthLayout>
  );
}
