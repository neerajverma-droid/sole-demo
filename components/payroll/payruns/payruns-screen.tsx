"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Calculator,
  CheckCheck,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  GitCompareArrows,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  SearchX,
  Trash2,
  TriangleAlert,
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
  SkeletonActionCell,
  SkeletonBadgeCell,
  SkeletonCheckboxCell,
  SkeletonRows,
  SkeletonTextCell,
} from "@/components/ui/table-skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageHeader } from "@/components/layout/page-header";
import { Highlight } from "@/components/contacts/highlight";
import { PayrollSeatsNotice } from "@/components/payroll/payroll-banners";
import { PayrunCompareDialog } from "@/components/payroll/payruns/payrun-compare-dialog";
import { PayrunDeleteDialog } from "@/components/payroll/payruns/payrun-delete-dialog";
import { PayrunPayslipsDrawer } from "@/components/payroll/payruns/payrun-payslips-drawer";
import { PayrunsFiltersPopover } from "@/components/payroll/payruns/payruns-filters-popover";
import { usePayrunActions } from "@/components/payroll/payruns/use-payrun-actions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePayrollSeatsQuery } from "@/hooks/use-payroll-query";
import {
  usePayrunStatusCountsQuery,
  usePayrunsQuery,
} from "@/hooks/use-payroll-payruns-query";
import {
  payPeriodLabel,
  payrollDate,
  payrollDateRange,
  payrollEnabled,
  payrollMoney,
  payrunStatusLabel,
  payrunStatusVariant,
} from "@/lib/payroll";
import {
  EMPTY_PAYRUN_FILTERS,
  PAYRUNS_ROOT,
  PAYRUN_TABS,
  activePayrunFilterCount,
  canComparePayruns,
  payrunActionBlock,
  payrunHref,
  payrunListParams,
  type PayrunFilters,
  type PayrunRow,
  type PayrunTab,
} from "@/lib/payroll-payruns";
import type { PageInfo } from "@/lib/products";

const DEFAULT_PAGE_SIZE = 10;

const COLUMNS = [
  { label: "Run ID" },
  { label: "Year", className: "text-center" },
  { label: "Period", className: "text-center" },
  { label: "Pay dates" },
  { label: "Payment", className: "text-right" },
  { label: "Expenses", className: "text-right" },
  { label: "Deductions", className: "text-right" },
  { label: "Staff", className: "text-center" },
  { label: "Status", className: "text-center" },
  { label: "Actions", className: "text-right" },
] as const;

export function PayrunsScreen() {
  const seatsQuery = usePayrollSeatsQuery();
  const actions = usePayrunActions();
  const canCreate = !!seatsQuery.data && payrollEnabled(seatsQuery.data);

  const [tab, setTab] = React.useState<PayrunTab>("all");
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebouncedValue(query, 350);
  const [filters, setFilters] = React.useState<PayrunFilters>(EMPTY_PAYRUN_FILTERS);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [drawerRun, setDrawerRun] = React.useState<PayrunRow | null>(null);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<{ runs: PayrunRow[]; skipped: number }>({
    runs: [],
    skipped: 0,
  });

  const params = payrunListParams({
    page,
    limit: pageSize,
    tab,
    search: debouncedQuery,
    filters,
  });
  const listQuery = usePayrunsQuery(params);
  const countsQuery = usePayrunStatusCountsQuery();
  const counts = countsQuery.data;

  // Back to page one, with nothing selected, whenever what the list is
  // filtered by changes — a selection the new filter hides shouldn't stay
  // queued for a bulk action nobody can see.
  const filterKey = JSON.stringify([tab, debouncedQuery, filters]);
  const previousFilterKey = React.useRef(filterKey);
  React.useEffect(() => {
    if (previousFilterKey.current === filterKey) return;
    previousFilterKey.current = filterKey;
    setPage(1);
    setSelected([]);
  }, [filterKey]);

  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageInfo: PageInfo = {
    page: currentPage,
    pageCount,
    total,
    from: total === 0 ? 0 : (currentPage - 1) * pageSize + 1,
    to: Math.min(currentPage * pageSize, total),
  };

  // Not `isFetching`: a background refresh of the page on screen shouldn't
  // swap the table for a shimmer.
  const rowsLoading = query !== debouncedQuery || listQuery.isPlaceholderData;

  const selectedRows = rows.filter((run) => selected.includes(run.id));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const completable = selectedRows.filter((run) => !payrunActionBlock(run.status, "complete"));
  const emailable = selectedRows.filter((run) => !payrunActionBlock(run.status, "email"));
  const deletable = selectedRows.filter((run) => !payrunActionBlock(run.status, "delete"));
  const compareReady = canComparePayruns(selectedRows.length);

  const searching = !!query.trim();
  const filtered = tab !== "all" || activePayrunFilterCount(filters) > 0;

  /*
   * No pay runs at all — loaded, unnarrowed and empty, not a search or filter
   * that matched nothing, and never a failed fetch. Tabs counting zeros and a
   * search over nothing are just noise then, so only the header (seats notice
   * included) and "No pay runs yet" remain.
   */
  const noPayruns =
    listQuery.isSuccess && !rowsLoading && !searching && !filtered && total === 0;

  const header = (
    <>
      <PageHeader
        icon={Calculator}
        title="Pay runs"
        description="Create pay runs in Microkeeper, review payslips and compare runs."
      >
        <Tooltip>
          <TooltipTrigger asChild>
            {/* The wrapper takes the hover: a disabled button fires no events. */}
            <span
              tabIndex={compareReady ? undefined : 0}
              data-usertour="payroll-payruns-compare-button"
            >
              <Button
                variant="outline"
                disabled={!compareReady}
                onClick={() => setCompareOpen(true)}
              >
                <GitCompareArrows />
                Compare
              </Button>
            </span>
          </TooltipTrigger>
          {!compareReady && (
            <TooltipContent>Select two to five runs to compare</TooltipContent>
          )}
        </Tooltip>
        {canCreate ? (
          <Button asChild data-usertour="payroll-payruns-new-button">
            <Link href={`${PAYRUNS_ROOT}/new`}>
              <Plus />
              New pay run
            </Link>
          </Button>
        ) : (
          <Button disabled data-usertour="payroll-payruns-new-button">
            <Plus />
            New pay run
          </Button>
        )}
      </PageHeader>
      {seatsQuery.data && <PayrollSeatsNotice seats={seatsQuery.data} />}
    </>
  );

  if (listQuery.isLoading) {
    return (
      <div className="space-y-[15px]">
        {header}
        <div className="space-y-4" aria-hidden>
          <Shimmer className="h-9 w-full max-w-xl rounded-md" />
          <Shimmer className="h-96 w-full rounded-lg border border-border" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-[15px]">
      {header}

      <div className="space-y-4">
        {!noPayruns && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              className="max-w-full overflow-x-auto"
              value={tab}
              onValueChange={(value) => setTab(value as PayrunTab)}
            >
              <TabsList aria-label="Pay run status" data-usertour="payroll-payruns-status-tabs">
                {PAYRUN_TABS.map((option) => (
                  <TabsTrigger key={option.value} value={option.value} className="gap-1.5 font-normal">
                    {option.label}
                    {counts ? (
                      <span className="text-xs text-muted-foreground tabular">
                        {counts[option.countKey]}
                      </span>
                    ) : (
                      <Shimmer className="h-3.5 w-4" aria-hidden />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div
              className="flex flex-wrap items-center gap-2"
              data-usertour="payroll-payruns-search-filters"
            >
              <div className="relative w-full sm:w-72">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search run ID, period or status"
                  aria-label="Search pay runs"
                  className="pl-9"
                />
              </div>
              <PayrunsFiltersPopover value={filters} onChange={setFilters} />
            </div>
          </div>
        )}

        {selectedRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <p className="text-sm">
              <span className="font-medium tabular">{selectedRows.length}</span>{" "}
              {selectedRows.length === 1 ? "pay run" : "pay runs"} selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                Clear
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={completable.length === 0 || actions.busy}
                title={completable.length === 0 ? "Every selected run is already completed or failed" : undefined}
                onClick={async () => {
                  if (await actions.complete(completable)) setSelected([]);
                }}
              >
                <CheckCheck />
                Mark as processed
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={emailable.length === 0 || actions.busy}
                title={emailable.length === 0 ? "Payslips are ready once a run is completed" : undefined}
                onClick={async () => {
                  if (await actions.email(emailable)) setSelected([]);
                }}
              >
                <Mail />
                Email payslips
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={deletable.length === 0}
                title={deletable.length === 0 ? "Completed runs can't be deleted" : undefined}
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() =>
                  setToDelete({
                    runs: deletable,
                    skipped: selectedRows.length - deletable.length,
                  })
                }
              >
                <Trash2 />
                Delete
              </Button>
            </div>
          </div>
        )}

        {listQuery.isError && rows.length === 0 ? (
          <Empty>
            <EmptyMedia>
              <TriangleAlert aria-hidden />
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>Couldn&apos;t load pay runs</EmptyTitle>
              <EmptyDescription>
                Something went wrong reaching the server. Try again.
              </EmptyDescription>
            </div>
            <EmptyActions>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void listQuery.refetch();
                  void countsQuery.refetch();
                }}
              >
                Try again
              </Button>
            </EmptyActions>
          </Empty>
        ) : rowsLoading ? (
          <PayrunsTableSkeleton />
        ) : rows.length === 0 ? (
          <Empty>
            <EmptyMedia>
              {searching ? <SearchX aria-hidden /> : <Calculator aria-hidden />}
            </EmptyMedia>
            <div className="space-y-1">
              <EmptyTitle>
                {searching
                  ? "No pay runs match your search"
                  : filtered
                    ? "No pay runs match these filters"
                    : "No pay runs yet"}
              </EmptyTitle>
              <EmptyDescription>
                {searching
                  ? "Try a different run ID or period, or clear the search."
                  : filtered
                    ? "Try a different status or filter."
                    : "Create your first pay run to pay your synced employees through Microkeeper."}
              </EmptyDescription>
            </div>
            {!searching && !filtered && canCreate && <EmptyCue label="Start here" />}
            <EmptyActions>
              {searching || filtered ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setTab("all");
                    setFilters(EMPTY_PAYRUN_FILTERS);
                  }}
                >
                  Clear filters
                </Button>
              ) : canCreate ? (
                <Button size="sm" asChild>
                  <Link href={`${PAYRUNS_ROOT}/new`}>New pay run</Link>
                </Button>
              ) : null}
            </EmptyActions>
          </Empty>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
              <Table className="min-w-[1120px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[44px]">
                      <Checkbox
                        checked={allSelected ? true : selectedRows.length > 0 ? "indeterminate" : false}
                        onCheckedChange={() =>
                          setSelected(allSelected ? [] : rows.map((run) => run.id))
                        }
                        aria-label={allSelected ? "Clear selection" : "Select all pay runs on this page"}
                      />
                    </TableHead>
                    {COLUMNS.map((column) => (
                      <TableHead key={column.label} className={"className" in column ? column.className : undefined}>
                        {column.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((run) => (
                    <PayrunTableRow
                      key={run.id}
                      run={run}
                      query={query}
                      selected={selected.includes(run.id)}
                      onSelect={() =>
                        setSelected((current) =>
                          current.includes(run.id)
                            ? current.filter((entry) => entry !== run.id)
                            : [...current, run.id],
                        )
                      }
                      onOpen={() => setDrawerRun(run)}
                      actions={actions}
                      onDelete={() => setToDelete({ runs: [run], skipped: 0 })}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            <NumberedPagination
              page={pageInfo}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
              itemLabel="pay run"
              navLabel="Pay runs pages"
            />
          </>
        )}
      </div>

      <PayrunPayslipsDrawer run={drawerRun} onClose={() => setDrawerRun(null)} />
      <PayrunCompareDialog
        runs={selectedRows}
        open={compareOpen && compareReady}
        onOpenChange={setCompareOpen}
      />
      <PayrunDeleteDialog
        runs={toDelete.runs}
        skipped={toDelete.skipped}
        onClose={() => setToDelete({ runs: [], skipped: 0 })}
        onDeleted={() => setSelected([])}
      />
    </div>
  );
}

function PayrunTableRow({
  run,
  query,
  selected,
  onSelect,
  onOpen,
  actions,
  onDelete,
}: {
  run: PayrunRow;
  query: string;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  actions: ReturnType<typeof usePayrunActions>;
  onDelete: () => void;
}) {
  const payslipsBlock = payrunActionBlock(run.status, "payslips");

  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          aria-label={`Select run ${run.mkRunId}`}
        />
      </TableCell>
      <TableCell>
        <button
          type="button"
          onClick={onOpen}
          className="rounded-sm font-medium tabular text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Run <Highlight text={run.mkRunId} query={query} />
        </button>
      </TableCell>
      <TableCell className="text-center tabular text-muted-foreground">{run.mkYear}</TableCell>
      <TableCell className="text-center">
        <Highlight text={payPeriodLabel(String(run.period))} query={query} />
      </TableCell>
      <TableCell className="whitespace-nowrap tabular">
        <p>{payrollDateRange(run.startDate, run.endDate)}</p>
        <p className="text-xs text-muted-foreground">Paid {payrollDate(run.paymentDate)}</p>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right font-medium tabular">
        {payrollMoney(run.paymentTotal)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right tabular text-muted-foreground">
        {payrollMoney(run.expenseTotal)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right tabular text-muted-foreground">
        {payrollMoney(run.deductionTotal)}
      </TableCell>
      <TableCell className="text-center tabular">{run.employeeCount}</TableCell>
      <TableCell className="text-center">
        <Badge variant={payrunStatusVariant(run.status)}>{payrunStatusLabel(run.status)}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            disabled={!!payslipsBlock}
            title={payslipsBlock}
            onClick={onOpen}
          >
            <Eye />
            Payslips
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for run ${run.mkYear}/${run.mkRunId}`}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <MenuAction
                icon={<Eye />}
                label="View payslips"
                onSelect={onOpen}
                disabledReason={payslipsBlock}
              />
              <MenuAction icon={<ArrowUpRight />} label="Open full detail" href={payrunHref(run)} />
              <MenuAction
                icon={<Download />}
                label="Download payslips"
                onSelect={() => actions.downloadPayslips(run)}
                disabledReason={payrunActionBlock(run.status, "download")}
              />
              <DropdownMenuSeparator />
              <MenuAction
                icon={<Copy />}
                label="Duplicate"
                onSelect={() => void actions.duplicate(run)}
              />
              <MenuAction
                icon={<FileSpreadsheet />}
                label="Export CSV"
                onSelect={() => actions.exportCsv(run)}
              />
              <MenuAction
                icon={<CheckCheck />}
                label="Mark completed"
                onSelect={() => void actions.complete([run])}
                disabledReason={payrunActionBlock(run.status, "complete")}
              />
              <DropdownMenuSeparator />
              <MenuAction
                icon={<Trash2 />}
                label="Delete"
                onSelect={onDelete}
                destructive
                disabledReason={payrunActionBlock(run.status, "delete")}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Same header and alignment as the real table, so nothing shifts when rows land. */
function PayrunsTableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm" aria-hidden>
      <Table className="min-w-[1120px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[44px]" />
            {COLUMNS.map((column) => (
              <TableHead key={column.label} className={"className" in column ? column.className : undefined}>
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <SkeletonRows
            count={6}
            render={() => (
              <>
                <SkeletonCheckboxCell />
                <SkeletonTextCell width="w-14" />
                <SkeletonTextCell width="w-10" />
                <SkeletonTextCell width="w-20" />
                <SkeletonTextCell width="w-40" />
                <SkeletonTextCell width="w-20" align="right" />
                <SkeletonTextCell width="w-14" align="right" />
                <SkeletonTextCell width="w-14" align="right" />
                <SkeletonTextCell width="w-6" />
                <SkeletonBadgeCell width="w-20" />
                <SkeletonActionCell />
              </>
            )}
          />
        </TableBody>
      </Table>
    </div>
  );
}

