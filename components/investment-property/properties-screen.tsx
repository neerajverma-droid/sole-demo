"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  Eye,
  Home,
  Landmark,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SearchX,
  Tag,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FilterPills } from "@/components/ui/filter-pills";
import { Input } from "@/components/ui/input";
import { MenuAction } from "@/components/ui/menu-action";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { Shimmer } from "@/components/ui/shimmer";
import { StatCards, type StatCard } from "@/components/ui/stat-cards";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Highlight } from "@/components/contacts/highlight";
import {
  DeletePropertyDialog,
  DisposePropertyDialog,
  type PropertyTarget,
} from "@/components/investment-property/property-dialogs";
import { PropertyFormDialog } from "@/components/investment-property/property-form-dialog";
import { PropertyStatusBadge, usePropertyMoney } from "@/components/investment-property/module-shared";
import { InvestmentNav, PROPERTIES_ROOT } from "@/components/investment-property/investment-nav";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  usePortfolioSummaryQuery,
  usePropertiesQuery,
} from "@/hooks/use-investment-property-query";
import {
  formatPropertyDate,
  type PropertyListItem,
  type PropertyStatusFilter,
} from "@/lib/investment-property";
import type { PageInfo } from "@/lib/products";
import { cn } from "@/lib/utils";

const TAB_LABELS = ["All", "Active", "Disposed"] as const;
type TabLabel = (typeof TAB_LABELS)[number];

const TAB_STATUS: Record<TabLabel, PropertyStatusFilter> = {
  All: "all",
  Active: "active",
  Disposed: "disposed",
};

const STATUS_TAB: Record<PropertyStatusFilter, TabLabel> = {
  all: "All",
  active: "Active",
  disposed: "Disposed",
};

const READ_ONLY_REASON = "Sold properties are read-only.";

export function PropertiesScreen() {
  const money = usePropertyMoney();
  const [status, setStatus] = React.useState<PropertyStatusFilter>("all");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const debouncedSearch = useDebouncedValue(search);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<PropertyTarget | null>(null);
  const [disposeTarget, setDisposeTarget] = React.useState<PropertyTarget | null>(null);

  const listQuery = usePropertiesQuery({
    page,
    limit: pageSize,
    name: debouncedSearch,
    status,
  });
  const summaryQuery = usePortfolioSummaryQuery({
    financialYearStart: null,
    status,
    name: debouncedSearch,
  });

  const rows = listQuery.data?.properties ?? [];
  const total = listQuery.data?.total ?? 0;
  const meta = listQuery.data?.meta;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  React.useEffect(() => {
    if (!listQuery.isPlaceholderData && page > pageCount) setPage(pageCount);
  }, [listQuery.isPlaceholderData, page, pageCount]);

  const currentPage = Math.min(page, pageCount);
  const pageInfo: PageInfo = {
    page: currentPage,
    pageCount,
    total,
    from: total === 0 ? 0 : (currentPage - 1) * pageSize + 1,
    to: Math.min(currentPage * pageSize, total),
  };

  const summary = summaryQuery.data;
  const stats: StatCard[] = [
    {
      key: "properties",
      label: "Properties",
      value: String(summary?.totalProperties ?? 0),
      meta: "Current list scope",
      icon: Building2,
    },
    {
      key: "value",
      label: "Total portfolio value",
      value: money(summary?.totalValue ?? 0),
      icon: Home,
      tone: "success",
    },
    {
      key: "loan",
      label: "Total loan balance",
      value: money(summary?.totalLoan ?? 0),
      icon: Landmark,
      tone: "warning",
    },
    {
      key: "equity",
      label: "Estimated equity",
      value: money(summary?.totalEquity ?? 0),
      icon: Layers,
    },
  ];

  const settling = search !== debouncedSearch || listQuery.isPlaceholderData;
  // Nothing at all yet: the header, the module's own nav and one empty card —
  // no stats, filters or search. The counts cover every status but follow the
  // search, so a search with no hits (or a search's leftovers still standing in
  // while it clears) never counts.
  const noProperties =
    !listQuery.isLoading &&
    !listQuery.isError &&
    !listQuery.isPlaceholderData &&
    !search.trim() &&
    !debouncedSearch.trim() &&
    total === 0 &&
    (meta?.all ?? 0) === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Building2}
        title="Investment property"
        description="Track property holdings, equity position and acquisition costs from one portfolio view."
      >
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          Create property
        </Button>
      </PageHeader>

      <InvestmentNav />

      {noProperties ? (
        <Empty>
          <EmptyMedia>
            <Building2 aria-hidden />
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>No properties yet</EmptyTitle>
            <EmptyDescription>
              Add your first investment property to start tracking its value, loan, rent and
              expenses.
            </EmptyDescription>
          </div>
          <EmptyActions>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus />
              Create property
            </Button>
          </EmptyActions>
        </Empty>
      ) : (
        <>
          <StatCards stats={stats} loading={summaryQuery.isLoading} />

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FilterPills
                label="Property status"
                options={TAB_LABELS}
                value={STATUS_TAB[status]}
                onChange={(next) => {
                  setStatus(TAB_STATUS[next]);
                  setPage(1);
                }}
                counts={
                  meta
                    ? { All: meta.all, Active: meta.active, Disposed: meta.disposed }
                    : undefined
                }
              />
              <div className="relative w-full sm:w-80">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by property name or address"
                  aria-label="Search properties"
                  className="pl-9"
                />
              </div>
            </div>

            {listQuery.isLoading ? (
              <Shimmer className="h-80 w-full rounded-lg border border-border" />
            ) : listQuery.isError && rows.length === 0 ? (
              <Empty>
                <EmptyMedia>
                  <TriangleAlert aria-hidden />
                </EmptyMedia>
                <div className="space-y-1">
                  <EmptyTitle>Couldn&apos;t load properties</EmptyTitle>
                  <EmptyDescription>
                    Something went wrong reaching the server. Try again.
                  </EmptyDescription>
                </div>
                <EmptyActions>
                  <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
                    Try again
                  </Button>
                </EmptyActions>
              </Empty>
            ) : total === 0 && !settling ? (
              <Empty>
                <EmptyMedia>
                  <SearchX aria-hidden />
                </EmptyMedia>
                <div className="space-y-1">
                  <EmptyTitle>No properties match this view</EmptyTitle>
                  <EmptyDescription>
                    Try a different name or address, or switch the status filter.
                  </EmptyDescription>
                </div>
                <EmptyActions>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setStatus("all");
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                </EmptyActions>
              </Empty>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property name</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead className={cn(HUG_COLUMN, "text-right")}>Purchase price</TableHead>
                      <TableHead className={HUG_COLUMN}>Purchase date</TableHead>
                      <TableHead className={cn(HUG_COLUMN, "text-right")}>Current value</TableHead>
                      <TableHead className={cn(HUG_COLUMN, "text-right")}>Loan amount</TableHead>
                      <TableHead className={cn(HUG_COLUMN, "text-right")}>Equity</TableHead>
                      <TableHead className={HUG_COLUMN}>Status</TableHead>
                      <TableHead className={cn(HUG_COLUMN, "text-right")}>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className={cn(settling && "opacity-60 transition-opacity")}>
                    {rows.map((property) => (
                      <PropertyRow
                        key={property.id}
                        property={property}
                        query={search}
                        onEdit={() => setEditId(property.id)}
                        onDispose={() => setDisposeTarget(toTarget(property))}
                        onDelete={() => setDeleteTarget(toTarget(property))}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {total > 0 && (
              <NumberedPagination
                page={pageInfo}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(next) => {
                  setPageSize(next);
                  setPage(1);
                }}
                itemLabel="property"
                itemLabelPlural="properties"
                navLabel="Properties pages"
                disabled={settling}
              />
            )}
          </section>
        </>
      )}

      <PropertyFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <PropertyFormDialog
        open={editId !== null}
        propertyId={editId ?? undefined}
        onOpenChange={(open) => !open && setEditId(null)}
      />
      <DisposePropertyDialog
        property={disposeTarget}
        onOpenChange={(open) => !open && setDisposeTarget(null)}
      />
      <DeletePropertyDialog
        property={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </div>
  );
}

function toTarget(property: PropertyListItem): PropertyTarget {
  return { id: property.id, name: property.name, purchaseDate: property.purchaseDate };
}

function PropertyRow({
  property,
  query,
  onEdit,
  onDispose,
  onDelete,
}: {
  property: PropertyListItem;
  query: string;
  onEdit: () => void;
  onDispose: () => void;
  onDelete: () => void;
}) {
  const money = usePropertyMoney();
  const disposed = property.status === "disposed";
  const href = `${PROPERTIES_ROOT}/${property.id}`;

  return (
    <TableRow>
      <TableCell className="max-w-[220px]">
        <Link
          href={href}
          className="block truncate font-medium outline-none hover:text-primary hover:underline focus-visible:underline"
        >
          <Highlight text={property.name} query={query} />
        </Link>
      </TableCell>
      <TableCell className="max-w-[260px] text-muted-foreground">
        <span className="block truncate">
          {property.address ? <Highlight text={property.address} query={query} /> : "—"}
        </span>
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-right tabular")}>
        {money(property.purchasePrice)}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "tabular text-muted-foreground")}>
        {formatPropertyDate(property.purchaseDate)}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-right tabular")}>
        {property.hasCurrentValue ? money(property.currentValue) : "—"}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-right tabular")}>
        {money(property.loanBalance)}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-right font-medium tabular")}>
        {property.hasCurrentValue ? money(property.equity) : "—"}
      </TableCell>
      <TableCell className={HUG_COLUMN}>
        <PropertyStatusBadge status={property.status} />
      </TableCell>
      <TableCell className={HUG_COLUMN}>
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for ${property.name}`}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <MenuAction icon={<Eye />} label="View details" href={href} />
              <MenuAction
                icon={<Pencil />}
                label="Edit"
                onSelect={onEdit}
                disabledReason={disposed ? READ_ONLY_REASON : undefined}
              />
              <MenuAction
                icon={<Tag />}
                label="Record sale"
                onSelect={onDispose}
                disabledReason={disposed ? "This property has already been sold." : undefined}
              />
              <DropdownMenuSeparator />
              <MenuAction
                icon={<Trash2 />}
                label="Delete"
                onSelect={onDelete}
                destructive
                disabledReason={disposed ? READ_ONLY_REASON : undefined}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
