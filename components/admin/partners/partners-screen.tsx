"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Handshake, Plus, Search, SearchX, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { FilterPills } from "@/components/ui/filter-pills";
import { Input } from "@/components/ui/input";
import { Shimmer } from "@/components/ui/shimmer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { StatusPill } from "@/components/admin/shared/status-pill";
import { useAdminPartnersQuery } from "@/hooks/use-admin-partners-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatAdminDate } from "@/lib/admin/format";
import {
  PARTNER_STATUS_COPY,
  PARTNER_STATUS_FILTERS,
  SOURCE_OPTIONS,
  partnerErrorMessage,
  type PartnerStatusFilter,
} from "@/lib/admin/partners";

const HUG = "w-px whitespace-nowrap";

/** Super admin › Partners: every integration partner, filterable by status. */
export function PartnersScreen() {
  const router = useRouter();
  const [status, setStatus] = React.useState<PartnerStatusFilter>("All");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 350);

  const query = useAdminPartnersQuery({ search: debouncedSearch, status });
  const partners = query.data ?? [];
  const loading = query.isLoading || query.isPlaceholderData;
  const filtered = status !== "All" || debouncedSearch.trim() !== "";

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Handshake}
        title="Partners"
        description="Integration partners that refer clients to Sole, what they may sell, and their API keys."
      >
        <Button asChild>
          <Link href="/admin/partners/new">
            <Plus />
            New partner
          </Link>
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills options={PARTNER_STATUS_FILTERS} value={status} onChange={setStatus} label="Filter partners by status" />
        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or slug"
            aria-label="Search partners"
            className="pl-9"
          />
        </div>
      </div>

      {query.isError ? (
        <Empty>
          <EmptyMedia>
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Couldn&apos;t load partners</EmptyTitle>
          <EmptyDescription>{partnerErrorMessage(query.error, "The partners request didn't complete.")}</EmptyDescription>
          <EmptyActions>
            <Button onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? "Trying again…" : "Try again"}
            </Button>
          </EmptyActions>
        </Empty>
      ) : loading ? (
        <Shimmer className="h-48 w-full" />
      ) : partners.length === 0 ? (
        <Empty>
          <EmptyMedia>{filtered ? <SearchX /> : <Handshake />}</EmptyMedia>
          <EmptyTitle>{filtered ? "No partners match" : "No partners yet"}</EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another status or search."
              : "Onboard the first integration partner. It starts in sandbox until you approve go-live."}
          </EmptyDescription>
          {!filtered && (
            <EmptyActions>
              <Button asChild>
                <Link href="/admin/partners/new">
                  <Plus />
                  New partner
                </Link>
              </Button>
            </EmptyActions>
          )}
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="surface-subtle">
              <TableRow>
                <TableHead className="pl-4">Partner</TableHead>
                <TableHead className={HUG}>Status</TableHead>
                <TableHead className={HUG}>Type</TableHead>
                <TableHead className={HUG}>Accountant pays</TableHead>
                <TableHead className={`${HUG} pr-4`}>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((partner) => {
                const pill = PARTNER_STATUS_COPY[partner.status];
                return (
                  <TableRow
                    key={partner.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/partners/${partner.id}`)}
                  >
                    <TableCell className="pl-4">
                      <Link href={`/admin/partners/${partner.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {partner.name}
                      </Link>
                      <p className="font-mono text-xs text-muted-foreground">{partner.slug}</p>
                    </TableCell>
                    <TableCell className={HUG}>
                      <StatusPill label={pill.label} tone={pill.tone} />
                    </TableCell>
                    <TableCell className={`${HUG} text-sm`}>
                      {SOURCE_OPTIONS.find((o) => o.value === partner.sourcePartner)?.label ?? partner.sourcePartner}
                    </TableCell>
                    <TableCell className={`${HUG} text-sm`}>{partner.billingEnabled ? "On" : "Off"}</TableCell>
                    <TableCell className={`${HUG} pr-4 text-sm text-muted-foreground`}>{formatAdminDate(partner.createdAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
