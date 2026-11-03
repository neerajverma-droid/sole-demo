"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import {
  Copy,
  Eye,
  FileText,
  Map as MapIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SearchX,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { MenuAction } from "@/components/ui/menu-action";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatePicker } from "@/components/documents/date-picker";
import { Highlight } from "@/components/contacts/highlight";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useKmFormat,
  useKmTripsQuery,
  type KmFormat,
} from "@/hooks/use-km-tracker-query";
import { kmFiltersAtom, kmPageAtom } from "@/lib/atoms";
import {
  DEFAULT_KM_FILTERS,
  KM_DATE_PRESETS,
  KM_PAGE_SIZE,
  KM_REASON_FILTERS,
  KM_TRIP_TYPES,
  activeKmFilterCount,
  canSelectKmTrip,
  formatKmDate,
  formatKmDuration,
  formatKmTime,
  isKmTripInvoiceable,
  kmDisplayedAmount,
  kmDisplayedDistance,
  kmReasonLabel,
  kmTripTypeLabel,
  type KmDatePreset,
  type KmTrip,
  type KmTripFilters,
  type KmTripType,
} from "@/lib/km-tracker";
import type { PageInfo } from "@/lib/products";
import { cn } from "@/lib/utils";

const ALL = "all";

/**
 * The trip log: filters, the table, and the selection that turns billable
 * trips into an invoice. Filters apply as they change rather than behind an
 * Apply button — sole-webapp needed one because it pushed every filter into
 * the URL; here a change is just a refetch.
 */
export function KmTripTable({
  empty = false,
  canCreate,
  onView,
  onDelete,
  onConvert,
  onPreviewInvoice,
}: {
  /** No trips logged at all, unfiltered: the empty state without the filters. */
  empty?: boolean;
  /** False until KM settings have a vehicle — the server refuses trips before. */
  canCreate: boolean;
  onView: (trip: KmTrip) => void;
  onDelete: (trip: KmTrip) => void;
  onConvert: (trips: KmTrip[]) => void;
  onPreviewInvoice: (trip: KmTrip) => void;
}) {
  const router = useRouter();
  const [filters, setFilters] = useAtom(kmFiltersAtom);
  const [page, setPage] = useAtom(kmPageAtom);
  const pageSize = KM_PAGE_SIZE;

  // Only the search box waits for typing to pause; the selects apply at once.
  const debouncedSearch = useDebouncedValue(filters.search);
  const appliedFilters = React.useMemo<KmTripFilters>(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  );

  const updateFilters = (values: Partial<KmTripFilters>) => {
    setFilters((current) => ({ ...current, ...values }));
    setPage(1);
  };
  const resetFilters = () => {
    setFilters(DEFAULT_KM_FILTERS);
    setPage(1);
  };

  const tripsQuery = useKmTripsQuery(appliedFilters, page, pageSize);
  const format = useKmFormat();
  const rows = React.useMemo(
    () => tripsQuery.data?.trips ?? [],
    [tripsQuery.data],
  );
  const total = tripsQuery.data?.total ?? 0;
  const filtered = activeKmFilterCount(filters) > 0;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageInfo: PageInfo = {
    page: currentPage,
    pageCount,
    total,
    from: total === 0 ? 0 : (currentPage - 1) * pageSize + 1,
    to: Math.min(currentPage * pageSize, total),
  };

  // A delete that empties the last page shouldn't strand the table past it.
  React.useEffect(() => {
    if (tripsQuery.data && page > pageCount) setPage(pageCount);
  }, [tripsQuery.data, page, pageCount, setPage]);

  /* Selection — only for the rows on screen, like sole-webapp's. */
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  React.useEffect(() => {
    setSelectedIds((current) => {
      const next = current.filter((id) =>
        rows.some((row) => row.id === id && isKmTripInvoiceable(row)),
      );
      return next.length === current.length ? current : next;
    });
  }, [rows]);
  const selected = rows.filter((row) => selectedIds.includes(row.id));
  const invoiceable = rows.filter(isKmTripInvoiceable);
  const selectable = invoiceable.filter((row) =>
    canSelectKmTrip(row, selected),
  );
  const allSelected =
    selectable.length > 0 &&
    selectable.every((row) => selectedIds.includes(row.id));

  const toggle = (trip: KmTrip, checked: boolean) => {
    setSelectedIds((current) =>
      checked
        ? current.includes(trip.id)
          ? current
          : [...current, trip.id]
        : current.filter((id) => id !== trip.id),
    );
  };
  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds([]);
      return;
    }
    // With nothing picked yet, "all" means all of the first row's client —
    // there's no single invoice for trips billed to two different people.
    const anchor = selected[0] ?? selectable[0];
    setSelectedIds(
      invoiceable
        .filter((row) => canSelectKmTrip(row, anchor ? [anchor] : []))
        .map((row) => row.id),
    );
  };

  /*
   * The first load, a search still settling, or a filter/page change in
   * flight — all shown as the table's own skeleton, as the invoices list does,
   * rather than leaving the previous page's rows under a filter that no
   * longer describes them.
   */
  const loading =
    tripsQuery.isLoading ||
    filters.search !== debouncedSearch ||
    tripsQuery.isPlaceholderData;
  const failed = tripsQuery.isError && !tripsQuery.data;

  const filterBar = (
    <FilterBar
      filters={filters}
      onChange={updateFilters}
      onReset={resetFilters}
      activeCount={activeKmFilterCount(filters)}
    />
  );

  if ((total === 0 || failed) && !loading) {
    return (
      <div className="space-y-4">
        {/* Nothing to narrow until there's a first trip. */}
        {!empty && filterBar}
        <Empty>
          <EmptyMedia>
            {failed ? (
              <TriangleAlert aria-hidden />
            ) : filtered ? (
              <SearchX aria-hidden />
            ) : (
              <MapIcon aria-hidden />
            )}
          </EmptyMedia>
          <div className="space-y-1">
            <EmptyTitle>
              {failed
                ? "Couldn't load trips"
                : filtered
                  ? "No trips match these filters"
                  : "No trips yet"}
            </EmptyTitle>
            <EmptyDescription>
              {failed
                ? "Something went wrong reaching the server. Try again."
                : filtered
                  ? "Try a wider date range or a different purpose, or reset the filters."
                  : canCreate
                    ? "Log a trip as you drive and your business kilometres and claim add up on their own."
                    : "Add a vehicle in KM Tracker settings, then log your first trip here."}
            </EmptyDescription>
          </div>
          {!failed && !filtered && canCreate && <EmptyCue label="Start here" />}
          <EmptyActions>
            {failed ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => tripsQuery.refetch()}
              >
                Try again
              </Button>
            ) : filtered ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Reset filters
              </Button>
            ) : canCreate ? (
              <Button size="sm" asChild>
                <Link href="/km-tracker/new">
                  <Plus />
                  New trip
                </Link>
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link href="/km-tracker/settings">Go to settings</Link>
              </Button>
            )}
          </EmptyActions>
        </Empty>
      </div>
    );
  }

  const selectionClient =
    selected.find((trip) => trip.clientName)?.clientName ?? "";

  return (
    <div className="space-y-4">
      {filterBar}

      {selected.length > 0 && (
        <div
          role="region"
          aria-label="Selected trips"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/[0.05] px-4 py-2.5"
        >
          <p className="text-sm">
            <span className="font-medium">
              {selected.length} {selected.length === 1 ? "trip" : "trips"}{" "}
              selected
            </span>
            {selectionClient && (
              <span className="text-muted-foreground">
                {" "}
                · {selectionClient}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds([])}
            >
              <X />
              Clear
            </Button>
            <Button size="sm" onClick={() => onConvert(selected)}>
              <FileText />
              Create invoice
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <KmTripTableSkeleton />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      disabled={selectable.length === 0}
                      onCheckedChange={(checked) => toggleAll(checked === true)}
                      aria-label="Select all billable trips on this page"
                    />
                  </TableHead>
                  <KmTripHeadings />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((trip) => (
                  <TripRow
                    key={trip.id}
                    trip={trip}
                    format={format}
                    search={debouncedSearch}
                    selected={selectedIds.includes(trip.id)}
                    selectableReason={selectReason(trip, selected)}
                    onToggle={(checked) => toggle(trip, checked)}
                    onView={() => onView(trip)}
                    onEdit={() => router.push(`/km-tracker/${trip.id}/edit`)}
                    onDuplicate={() =>
                      router.push(`/km-tracker/new?duplicate=${trip.id}`)
                    }
                    onDelete={() => onDelete(trip)}
                    onConvert={() => onConvert([trip])}
                    onPreviewInvoice={() => onPreviewInvoice(trip)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* No rows-per-page control: every request asks for KM_PAGE_SIZE. */}
      <NumberedPagination
        page={pageInfo}
        pageSize={pageSize}
        onPageChange={setPage}
        itemLabel="trip"
        navLabel="Trip pages"
        disabled={loading}
      />
    </div>
  );
}

/**
 * Every column but the checkbox. Route leads and reads left to right, like
 * the identity column other tables open with; the last keeps its natural
 * edge and everything between is centred, the rule the equity and invoices
 * tables follow.
 */
function KmTripHeadings() {
  return (
    <>
      <TableHead className="w-[260px] text-left">Route</TableHead>
      <TableHead className="text-center">Date &amp; job</TableHead>
      <TableHead className="text-center">Trip type</TableHead>
      <TableHead className="text-center">Reason</TableHead>
      <TableHead className="text-center">Method</TableHead>
      <TableHead className="text-center">Distance (KM)</TableHead>
      <TableHead className="text-center">Amount</TableHead>
      <TableHead className="text-center">Time</TableHead>
      <TableHead className="text-center">Invoice</TableHead>
      <TableHead className="w-[60px] text-right">
        <span className="sr-only">Actions</span>
      </TableHead>
    </>
  );
}

/** The table's shape while a page loads — the invoices list's skeleton, cell
 *  for cell against these columns. */
function KmTripTableSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      aria-hidden
    >
      <div className="overflow-x-auto">
        <Table className="min-w-[1080px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <KmTripHeadings />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, index) => (
              <TableRow key={`skeleton-${index}`}>
                <TableCell>
                  <Shimmer className="size-4 rounded-sm" />
                </TableCell>
                <TableCell>
                  <Shimmer className="h-4 w-48" />
                  <Shimmer className="mt-1.5 h-4 w-40" />
                </TableCell>
                <TableCell>
                  <Shimmer className="mx-auto h-4 w-20" />
                  <Shimmer className="mx-auto mt-1.5 h-3 w-16" />
                </TableCell>
                <TableCell>
                  <Shimmer className="mx-auto h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Shimmer className="mx-auto h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Shimmer className="mx-auto h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Shimmer className="mx-auto h-4 w-14" />
                </TableCell>
                <TableCell>
                  <Shimmer className="mx-auto h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Shimmer className="mx-auto h-4 w-10" />
                </TableCell>
                <TableCell>
                  <Shimmer className="mx-auto h-5 w-24 rounded-full" />
                </TableCell>
                <TableCell>
                  <Shimmer className="ml-auto size-8 rounded-full" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Why a row's checkbox is off, or null when it can be ticked. */
function selectReason(trip: KmTrip, selected: KmTrip[]): string | null {
  if (trip.isInvoiced) return "Already on an invoice";
  if (!trip.isBillable)
    return "Not billable — mark the trip billable to invoice it";
  if (!canSelectKmTrip(trip, selected)) {
    return "Only trips for the same client can go on one invoice";
  }
  return null;
}

/** Clicks on these never open the row's details. */
function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest(
      'button, a, input, label, [role="checkbox"], [role="menuitem"], [data-row-action]',
    )
  );
}

function TripRow({
  trip,
  format,
  search,
  selected,
  selectableReason,
  onToggle,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onConvert,
  onPreviewInvoice,
}: {
  trip: KmTrip;
  format: KmFormat;
  search: string;
  selected: boolean;
  selectableReason: string | null;
  onToggle: (checked: boolean) => void;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onConvert: () => void;
  onPreviewInvoice: () => void;
}) {
  const checkbox = (
    <Checkbox
      checked={selected}
      disabled={!!selectableReason && !selected}
      onCheckedChange={(checked) => onToggle(checked === true)}
      aria-label={`Select trip on ${formatKmDate(trip.startTime)}`}
    />
  );

  return (
    <TableRow
      className="cursor-pointer"
      onClick={(event) => {
        if (!isInteractive(event.target)) onView();
      }}
    >
      <TableCell>
        {selectableReason && !selected ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span data-row-action className="inline-flex">
                {checkbox}
              </span>
            </TooltipTrigger>
            <TooltipContent>{selectableReason}</TooltipContent>
          </Tooltip>
        ) : (
          checkbox
        )}
      </TableCell>
      <TableCell className="text-left">
        {/* A fixed width is what makes the ellipsis kick in — a table cell
            on its own just grows to fit the longest address. */}
        <div className="w-[240px] space-y-0.5">
          <RouteStop
            tone="start"
            label="From"
            time={formatKmTime(trip.startTime)}
            place={trip.startLocation}
            search={search}
          />
          <RouteStop
            tone="end"
            label="To"
            time={formatKmTime(trip.endTime)}
            place={trip.endLocation}
            search={search}
          />
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-center">
        <span className="block font-medium tabular">
          {formatKmDate(trip.startTime)}
        </span>
        <span className="mx-auto block max-w-[140px] truncate text-xs text-muted-foreground">
          {trip.jobName || trip.clientName || "No job"}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap text-center">
        <span className="block">{kmTripTypeLabel(trip.tripType)}</span>
        {trip.tripType === "split" && (
          <span className="block text-xs text-muted-foreground tabular">
            {format.percent(trip.businessPercentage)} business
          </span>
        )}
      </TableCell>
      <TableCell className="max-w-[150px] text-center">
        <span className="block truncate">
          <Highlight text={kmReasonLabel(trip.reason)} query={search} />
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap text-center text-muted-foreground">
        {format.method(trip.calculationMethod)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center font-medium tabular">
        {format.km(kmDisplayedDistance(trip))}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center tabular">
        {format.money(kmDisplayedAmount(trip))}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center text-muted-foreground tabular">
        {formatKmDuration(trip.durationMinutes, trip.startTime, trip.endTime)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center">
        <InvoiceCell trip={trip} onPreview={onPreviewInvoice} />
      </TableCell>
      <TableCell>
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for trip on ${formatKmDate(trip.startTime)}`}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <MenuAction
                icon={<Eye />}
                label="View details"
                onSelect={onView}
              />
              <MenuAction icon={<Pencil />} label="Edit" onSelect={onEdit} />
              <MenuAction
                icon={<Copy />}
                label="Duplicate"
                onSelect={onDuplicate}
              />
              <MenuAction
                icon={<FileText />}
                label="Convert to invoice"
                onSelect={onConvert}
                disabledReason={
                  trip.isInvoiced
                    ? "Already on an invoice"
                    : !trip.isBillable
                      ? "Mark the trip billable first"
                      : undefined
                }
              />
              {/* sole-webapp hides delete once a trip is invoiced — the
                  invoice line would point at nothing. */}
              {!trip.isInvoiced && (
                <>
                  <DropdownMenuSeparator />
                  <MenuAction
                    icon={<Trash2 />}
                    label="Delete"
                    onSelect={onDelete}
                    destructive
                  />
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

function RouteStop({
  tone,
  label,
  time,
  place,
  search,
}: {
  tone: "start" | "end";
  label: string;
  time: string;
  place: string;
  search: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm leading-6">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          tone === "start" ? "bg-success" : "bg-primary",
        )}
        aria-hidden
      />
      <span className="shrink-0 tabular text-muted-foreground">{time}</span>
      <TruncatedText label={label} text={place || "—"} search={search} />
    </span>
  );
}

/**
 * One line that ends in "…" when it doesn't fit, with the whole of it in a
 * tooltip on hover — only when it was actually cut short, so a short place
 * name doesn't sprout a tooltip repeating exactly what's already visible.
 */
function TruncatedText({
  label,
  text,
  search,
}: {
  label: string;
  text: string;
  search: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [open, setOpen] = React.useState(false);

  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        const node = ref.current;
        setOpen(next && !!node && node.scrollWidth > node.clientWidth);
      }}
    >
      <TooltipTrigger asChild>
        <span ref={ref} className="min-w-0 truncate">
          <Highlight text={text} query={search} />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm break-words">
        <span className="text-muted-foreground">{label}: </span>
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function InvoiceCell({
  trip,
  onPreview,
}: {
  trip: KmTrip;
  onPreview: () => void;
}) {
  if (trip.invoiceId && trip.invoiceNo) {
    const draft = trip.invoiceStatus === "draft";
    return draft ? (
      <span className="inline-flex flex-col items-center gap-0.5">
        <Link
          href={`/invoices/${trip.invoiceId}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {trip.invoiceNo}
        </Link>
        <span className="text-[11px] text-muted-foreground">Draft</span>
      </span>
    ) : (
      <span className="inline-flex flex-col items-center gap-0.5">
        <button
          type="button"
          onClick={onPreview}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {trip.invoiceNo}
        </button>
        <Badge variant="success" className="px-1.5 py-0 text-[10px]">
          Sent
        </Badge>
      </span>
    );
  }
  if (!trip.isBillable) {
    return <span className="text-xs text-muted-foreground">Not billable</span>;
  }
  return (
    <span className="text-xs text-muted-foreground">Ready to invoice</span>
  );
}

function FilterBar({
  filters,
  onChange,
  onReset,
  activeCount,
}: {
  filters: KmTripFilters;
  onChange: (values: Partial<KmTripFilters>) => void;
  onReset: () => void;
  activeCount: number;
}) {
  const customRangeInvalid =
    filters.datePreset === "custom" &&
    !!filters.customStart &&
    !!filters.customEnd &&
    filters.customEnd < filters.customStart;

  return (
    <div
      className="space-y-3 rounded-lg border border-border bg-card p-3 shadow-sm"
      data-usertour="km-trip-filters"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.datePreset}
          onValueChange={(value) =>
            onChange({ datePreset: value as KmDatePreset })
          }
        >
          <SelectTrigger className="w-full sm:w-40" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KM_DATE_PRESETS.map((preset) => (
              <SelectItem key={preset.value} value={preset.value}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.reason || ALL}
          onValueChange={(value) =>
            onChange({ reason: value === ALL ? "" : value })
          }
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Purpose">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All purposes</SelectItem>
            {KM_REASON_FILTERS.map((reason) => (
              <SelectItem key={reason.value} value={reason.value}>
                {reason.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.tripType || ALL}
          onValueChange={(value) =>
            onChange({ tripType: value === ALL ? "" : (value as KmTripType) })
          }
        >
          <SelectTrigger className="w-full sm:w-36" aria-label="Trip type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {KM_TRIP_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative w-full sm:ml-auto sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Search location, reason, notes"
            aria-label="Search trips"
            className="pl-9"
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={activeCount === 0}
          className="shrink-0"
        >
          <RotateCcw />
          Reset{activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
      </div>

      {filters.datePreset === "custom" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">From</p>
            <DatePicker
              value={filters.customStart}
              onChange={(iso) => onChange({ customStart: iso })}
              label="Start date"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">To</p>
            <DatePicker
              value={filters.customEnd}
              onChange={(iso) => onChange({ customEnd: iso })}
              label="End date"
            />
          </div>
          <p
            className={cn(
              "text-xs sm:col-span-2",
              customRangeInvalid ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {customRangeInvalid
              ? "The end date is before the start date — the range won't apply until it's fixed."
              : !filters.customStart || !filters.customEnd
                ? "Pick both dates to apply the range."
                : "Showing trips that started in this range."}
          </p>
        </div>
      )}
    </div>
  );
}
