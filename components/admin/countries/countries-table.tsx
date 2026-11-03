"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Shimmer } from "@/components/ui/shimmer";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusPill } from "@/components/admin/shared/status-pill";
import { formatCount } from "@/lib/admin/format";
import { countryStatusPill, type CountrySummary } from "@/lib/admin/countries";

/**
 * Every country the registry knows, with its status, its published version and
 * how many businesses keep their books under it.
 *
 * The business count is the whole reason to be careful on the next screen, so
 * it's on the list rather than only inside the country — "47 businesses" next
 * to Australia is what makes it obvious that a rate change there is not a test.
 */
export function CountriesTable({
  countries,
  loading,
}: {
  countries: CountrySummary[];
  loading: boolean;
}) {
  return (
    <Table>
      <TableHeader className="surface-subtle">
        <TableRow>
          <TableHead className="pl-4">Country</TableHead>
          <TableHead className={HUG_COLUMN}>Status</TableHead>
          <TableHead className={HUG_COLUMN}>Tax</TableHead>
          <TableHead className={HUG_COLUMN}>Currency</TableHead>
          <TableHead className={HUG_COLUMN}>Businesses</TableHead>
          <TableHead className={HUG_COLUMN}>Version</TableHead>
          <TableHead className={`${HUG_COLUMN} pr-4`}>
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading
          ? Array.from({ length: 4 }, (_, index) => <SkeletonRow key={index} />)
          : countries.map((country) => <CountryRow key={country.iso2} country={country} />)}
      </TableBody>
    </Table>
  );
}

function CountryRow({ country }: { country: CountrySummary }) {
  const status = countryStatusPill(country.status);
  const href = `/admin/countries/${country.iso2}`;

  return (
    <TableRow className="group">
      <TableCell className="pl-4">
        <Link href={href} className="block outline-none focus-visible:underline">
          <span className="flex items-center gap-2 font-medium">
            {country.name}
            <span className="rounded bg-muted px-1.5 py-px text-[11px] font-semibold tracking-wider text-muted-foreground">
              {country.iso2}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            {country.taxAuthority}
            {country.timezone ? ` · ${country.timezone}` : ""}
          </span>
        </Link>
      </TableCell>
      <TableCell className={HUG_COLUMN}>
        <div className="flex items-center gap-2">
          <StatusPill label={status.label} tone={status.tone} />
          {country.hasDraft ? (
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
              Unpublished changes
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className={HUG_COLUMN}>{country.taxType || "–"}</TableCell>
      <TableCell className={HUG_COLUMN}>{country.currency || "–"}</TableCell>
      <TableCell className={`${HUG_COLUMN} tabular`}>{formatCount(country.businesses)}</TableCell>
      <TableCell className={`${HUG_COLUMN} tabular text-muted-foreground`}>
        {country.version > 0 ? `v${country.version}` : "Never published"}
      </TableCell>
      <TableCell className={`${HUG_COLUMN} pr-4`}>
        <Link
          href={href}
          aria-label={`Open ${country.name}`}
          className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </TableCell>
    </TableRow>
  );
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell className="pl-4">
        <Shimmer className="h-4 w-40" />
      </TableCell>
      {Array.from({ length: 5 }, (_, index) => (
        <TableCell key={index} className={HUG_COLUMN}>
          <Shimmer className="h-4 w-16" />
        </TableCell>
      ))}
      <TableCell className={`${HUG_COLUMN} pr-4`}>
        <Shimmer className="size-8 rounded-md" />
      </TableCell>
    </TableRow>
  );
}
