"use client";

import * as React from "react";
import { Globe2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PageHeader } from "@/components/layout/page-header";
import { CountriesTable } from "@/components/admin/countries/countries-table";
import { useAdminCountriesQuery } from "@/hooks/use-admin-countries-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCount } from "@/lib/admin/format";

/**
 * The Country Registry: every jurisdiction Sole keeps books in.
 *
 * Deliberately not searchable or paged — there are three countries, and a
 * search box over three rows is furniture. What matters on this screen is which
 * countries are open for sign-up, which have changes waiting to be published,
 * and how many businesses each change would reach.
 */
export function CountriesScreen() {
  const query = useAdminCountriesQuery();
  const countries = query.data ?? [];

  const live = countries.filter((country) => country.status === "live").length;
  const pending = countries.filter((country) => country.hasDraft);
  const businesses = countries.reduce((total, country) => total + country.businesses, 0);

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Globe2}
        title="Countries"
        description="Tax rates, thresholds, filing rules and labels for every country Sole operates in. A government change is a data change here, not a release."
      />

      {pending.length > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-sm">
            <span className="font-medium">
              {pending.length === 1
                ? `${pending[0].name} has unpublished changes.`
                : `${pending.length} countries have unpublished changes.`}
            </span>{" "}
            <span className="text-muted-foreground">
              Staged changes are invisible to businesses until they&apos;re published.
            </span>
          </p>
        </div>
      ) : null}

      {query.isError ? (
        <Empty>
          <EmptyMedia>
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Couldn&apos;t load countries</EmptyTitle>
          <EmptyDescription>
            {apiErrorMessage(query.error, "The countries request didn't complete.")}
          </EmptyDescription>
          <EmptyActions>
            <Button onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? "Trying again…" : "Try again"}
            </Button>
          </EmptyActions>
        </Empty>
      ) : !query.isLoading && countries.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <Globe2 />
          </EmptyMedia>
          <EmptyTitle>The registry is empty</EmptyTitle>
          <EmptyDescription>
            No country has been seeded yet. Until one is, every business falls back to the
            Australian rules bundled with the backend.
          </EmptyDescription>
        </Empty>
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <CountriesTable countries={countries} loading={query.isLoading} />
          </div>
          {!query.isLoading ? (
            <p className="text-xs text-muted-foreground">
              {formatCount(countries.length)} {countries.length === 1 ? "country" : "countries"} ·{" "}
              {live} open for sign-up · {formatCount(businesses)}{" "}
              {businesses === 1 ? "business" : "businesses"} in total
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
