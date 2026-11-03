"use client";

import { TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Shimmer } from "@/components/ui/shimmer";
import { useKmFormat, type KmFormat } from "@/hooks/use-km-tracker-query";
import {
  KM_BUSINESS_USE_BASES,
  kmVehicleTypeLabel,
  type KmRules,
  type KmStats,
  type KmTierSummary,
} from "@/lib/km-tracker";
import { cn } from "@/lib/utils";

/** How many vehicles get a bar before the rest are summarised. */
const VISIBLE_VEHICLES = 3;

/**
 * Where each method's claim stands — the two groups sole-webapp's
 * `StatsSection` shows, laid out as the design's split band: logbook on the
 * left, cents per km on the right with its claim value as the one accented
 * card, since that's the figure someone opening this page is looking for.
 *
 * The right-hand group follows the country: Australia's cents per km with
 * each vehicle's remaining cap, New Zealand's kilometre rate with each
 * vehicle's year against the tier boundary, or nothing where there's no
 * statutory rate.
 */
export function KmStatsBand({
  stats,
  loading,
  error,
  onRetry,
}: {
  stats: KmStats | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (error && !stats) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-3 text-sm">
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <TriangleAlert className="size-4 text-warning" aria-hidden />
          Couldn&apos;t load your claim totals.
        </span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  return <KmStatsGroups stats={stats} loading={loading} />;
}

function KmStatsGroups({ stats, loading }: { stats: KmStats | undefined; loading: boolean }) {
  const format = useKmFormat();
  const { rules } = format;
  const logbook = stats?.logbook;
  const cents = stats?.cents;
  const vehicles = cents?.vehicleClaims ?? [];
  const hidden = Math.max(0, vehicles.length - VISIBLE_VEHICLES);
  // Decided by what the server summarised where it can be, so a New Zealand
  // band never shows Australia's layout while the rules are on their way.
  const tiered = !!stats?.kilometreRate || rules.statutoryMethod === "kilometre_rate";
  const statutory = tiered || rules.statutoryMethod !== null;
  const logbookLabel = format.method("logbook");

  return (
    <section
      aria-label="Claim totals"
      data-usertour="km-stats-band"
      className={cn(
        "grid gap-6 rounded-lg border border-border bg-muted/30 p-4 md:p-5",
        statutory && "xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:divide-x xl:divide-border",
      )}
    >
      <div className="min-w-0 space-y-3">
        <GroupLabel dot="bg-primary">{logbookLabel} method</GroupLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            label="Business logbook KM"
            loading={loading}
            value={logbook ? format.km(logbook.businessKm) : ""}
            unit="KM"
            footnote={
              logbook ? `Personal distance ${format.km(logbook.personalKm)} KM` : ""
            }
          />
          <StatCard
            label="Business use % in logbook"
            loading={loading}
            value={logbook ? format.percent(logbook.businessUsePercentage) : ""}
            footnote={
              logbook
                ? `Personal use ${format.percent(Math.max(0, 100 - logbook.businessUsePercentage))}`
                : ""
            }
          />
        </div>
      </div>

      {tiered ? (
        <KmTierGroup
          summary={stats?.kilometreRate ?? null}
          loading={loading}
          rules={rules}
          format={format}
        />
      ) : statutory ? (
        <div className="min-w-0 space-y-3 xl:pl-6">
          <GroupLabel dot="bg-success">Cents per KM method</GroupLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
            <StatCard
              label="Claimed this financial year"
              loading={loading}
              value={cents ? format.km(cents.claimedBusinessKm) : ""}
              unit="KM"
              footnote={
                cents?.incomeYearLabel ? `Financial year ${cents.incomeYearLabel}` : ""
              }
            />

            <div className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                Remaining claimable KM
                {rules.copy.capTip && <InfoTip text={rules.copy.capTip} />}
              </div>
              {loading && !cents ? (
                <div className="mt-4 space-y-3">
                  <Shimmer className="h-3 w-full" />
                  <Shimmer className="h-3 w-4/5" />
                </div>
              ) : vehicles.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  No cents-per-km trips this financial year yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {vehicles.slice(0, VISIBLE_VEHICLES).map((claim) => {
                    const limit = cents?.limit ?? 0;
                    const used =
                      limit > 0
                        ? Math.min(100, (claim.claimedBusinessKm / limit) * 100)
                        : 0;
                    return (
                      <li key={claim.vehicle} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3 text-xs">
                          <span className="truncate font-medium text-foreground">
                            {claim.vehicle}
                          </span>
                          <span className="shrink-0 tabular text-muted-foreground">
                            {format.km(claim.remainingClaimableKm)} KM left
                          </span>
                        </div>
                        <div
                          className="h-1.5 overflow-hidden rounded-full bg-muted"
                          role="meter"
                          aria-label={`${claim.vehicle}: ${format.km(claim.claimedBusinessKm)} of ${format.km(limit)} KM claimed`}
                          aria-valuemin={0}
                          aria-valuemax={limit}
                          aria-valuenow={claim.claimedBusinessKm}
                        >
                          <div
                            className={cn(
                              "h-full rounded-full",
                              used >= 96 ? "bg-destructive" : "bg-primary/70",
                            )}
                            style={{ width: `${used}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                  {hidden > 0 && (
                    <li className="text-xs text-muted-foreground">
                      +{hidden} more {hidden === 1 ? "vehicle" : "vehicles"}
                    </li>
                  )}
                </ul>
              )}
            </div>

            <div className="flex min-w-0 flex-col rounded-lg border border-primary/35 bg-primary/[0.06] p-4 shadow-[inset_0_3px_0_hsl(var(--primary))] sm:col-span-2 lg:col-span-1">
              <p className="text-sm font-semibold text-primary">Total claim value</p>
              {loading && !cents ? (
                <Shimmer className="mt-3 h-8 w-28" />
              ) : (
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular">
                  {format.money(cents?.totalClaim ?? 0)}
                </p>
              )}
              <dl className="mt-auto space-y-1.5 border-t border-primary/20 pt-3 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Toll + parking</dt>
                  <dd className="font-medium tabular">
                    {format.money(cents?.tollAndParking ?? 0)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">KM claim</dt>
                  <dd className="font-semibold tabular">
                    {format.money(cents?.claimAmount ?? 0)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * New Zealand's kilometre rate: per vehicle, its whole year against the tier
 * boundary (a bar), the business share and where it came from, the tier
 * split and the claim — then the year's total. Provisional until Inland
 * Revenue publishes the year's rates, and the server's warnings (a missing
 * 31 March reading, a missing vehicle type) shown as it wrote them.
 */
function KmTierGroup({
  summary,
  loading,
  rules,
  format,
}: {
  summary: KmTierSummary | null;
  loading: boolean;
  rules: KmRules;
  format: KmFormat;
}) {
  const vehicles = summary?.vehicleClaims ?? [];
  const hidden = Math.max(0, vehicles.length - VISIBLE_VEHICLES);
  const boundary = summary?.tier1MaxKm || rules.rates.tier1MaxKm || 0;
  const provisional = summary?.provisional ?? rules.rates.provisional;
  const yearLabel = summary?.incomeYearLabel || rules.incomeYear?.label || "";
  const vehicleWarnings = new Set(
    vehicles.flatMap((claim) => claim.warnings.map((warning) => warning.message)),
  );
  const warnings = (summary?.warnings ?? []).filter(
    (warning) =>
      !vehicleWarnings.has(warning.message) &&
      // The provisional note already says this one.
      !(warning.code === "provisional_rates" && rules.copy.provisionalNote),
  );

  return (
    <div className="min-w-0 space-y-3 xl:pl-6">
      <div className="flex flex-wrap items-center gap-2">
        <GroupLabel dot="bg-success">{format.method("kilometre_rate")} method</GroupLabel>
        {provisional && (
          <Badge variant="warning" className="px-1.5 py-0 text-[11px] font-medium">
            Provisional
          </Badge>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        <StatCard
          label="Claimed this income year"
          loading={loading}
          value={summary ? format.km(summary.claimedBusinessKm) : ""}
          unit="KM"
          footnote={yearLabel ? `Income year ${yearLabel}` : ""}
        />

        <div className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Each vehicle&apos;s year
            {rules.copy.capTip && <InfoTip text={rules.copy.capTip} />}
          </div>
          {loading && !summary ? (
            <div className="mt-4 space-y-3">
              <Shimmer className="h-3 w-full" />
              <Shimmer className="h-3 w-4/5" />
            </div>
          ) : vehicles.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No kilometre-rate trips this income year yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-4">
              {vehicles.slice(0, VISIBLE_VEHICLES).map((claim) => (
                <li key={claim.vehicle} className="space-y-1.5 text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium text-foreground">
                      {claim.vehicle}
                      {claim.vehicleType && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {kmVehicleTypeLabel(rules, claim.vehicleType)}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-semibold tabular">
                      {format.money(claim.claimAmount)}
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="meter"
                    aria-label={`${claim.vehicle}: ${format.km(claim.totalKm)} of ${format.km(boundary)} KM in tier 1`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={claim.tier1UsagePercentage}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full",
                        claim.tier1UsagePercentage >= 100 ? "bg-warning" : "bg-primary/70",
                      )}
                      style={{ width: `${claim.tier1UsagePercentage}%` }}
                    />
                  </div>
                  <p className="text-muted-foreground tabular">
                    {format.km(claim.totalKm)} of {format.km(boundary)} KM
                    {claim.totalKmSource === "trips" ? " (from your trips)" : " (odometer)"} ·{" "}
                    {format.percent(claim.businessUsePercentage)} business,{" "}
                    {KM_BUSINESS_USE_BASES[claim.businessUseBasis].toLowerCase()}
                  </p>
                  <p className="text-muted-foreground tabular">
                    Tier 1: {format.km(claim.tier1Km)} KM × {format.money(claim.tier1Rate)}
                    {claim.tier2Km > 0 &&
                      ` · Tier 2: ${format.km(claim.tier2Km)} KM × ${format.money(claim.tier2Rate)}`}
                  </p>
                  {claim.warnings.map((warning) => (
                    <p key={`${warning.code}-${warning.message}`} className="flex gap-1.5 text-warning">
                      <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden />
                      {warning.message}
                    </p>
                  ))}
                </li>
              ))}
              {hidden > 0 && (
                <li className="text-xs text-muted-foreground">
                  +{hidden} more {hidden === 1 ? "vehicle" : "vehicles"}
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="flex min-w-0 flex-col rounded-lg border border-primary/35 bg-primary/[0.06] p-4 shadow-[inset_0_3px_0_hsl(var(--primary))] sm:col-span-2 lg:col-span-1">
          <p className="text-sm font-semibold text-primary">Total claim value</p>
          {loading && !summary ? (
            <Shimmer className="mt-3 h-8 w-28" />
          ) : (
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular">
              {format.money(summary?.totalClaim ?? 0)}
            </p>
          )}
          <dl className="mt-auto space-y-1.5 border-t border-primary/20 pt-3 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Toll + parking</dt>
              <dd className="font-medium tabular">{format.money(summary?.tollAndParking ?? 0)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">KM claim</dt>
              <dd className="font-semibold tabular">{format.money(summary?.claimAmount ?? 0)}</dd>
            </div>
          </dl>
        </div>
      </div>
      {provisional && rules.copy.provisionalNote && (
        <p className="text-xs text-muted-foreground">{rules.copy.provisionalNote}</p>
      )}
      {warnings.map((warning) => (
        <p key={`${warning.code}-${warning.message}`} className="flex gap-1.5 text-xs text-warning">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {warning.message}
        </p>
      ))}
    </div>
  );
}

function GroupLabel({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <span className={cn("size-2 rounded-full", dot)} aria-hidden />
      {children}
    </p>
  );
}

function StatCard({
  label,
  value,
  unit,
  footnote,
  loading,
}: {
  label: string;
  value: string;
  unit?: string;
  footnote?: string;
  loading: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      {loading && !value ? (
        <Shimmer className="mt-3 h-8 w-24" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular">
          {value}
          {unit && (
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {unit}
            </span>
          )}
        </p>
      )}
      {footnote && (
        <p className="mt-auto pt-3 text-xs text-muted-foreground">{footnote}</p>
      )}
    </div>
  );
}
