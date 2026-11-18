"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCheck, FileText, List, ListTodo, Loader2, Search, SearchX, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillAttachmentsDialog } from "@/components/bills/bill-attachments-dialog";
import { BillMatchDialog } from "@/components/bills/bill-match-dialog";
import { BillScheduleSheet } from "@/components/bills/bill-schedule-sheet";
import { BillsCalendar } from "@/components/bills/bills-calendar";
import { BillsList, BillsListSkeleton, type BillRowActions } from "@/components/bills/bills-list";
import { BillsSummary } from "@/components/bills/bills-summary";
import { BillsUpcoming } from "@/components/bills/bills-upcoming";
import {
  useApproveBillMutation,
  useBillSummaryQuery,
  useBillsListQuery,
  useDeleteBillsMutation,
  useInvalidateBills,
  useUnapproveBillMutation,
} from "@/hooks/use-bills-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiErrorMessage } from "@/lib/api-error";
import { BILL_FILTERS, approveBillApi, approveIssues, draftFromBill, type Bill, type BillFilter } from "@/lib/bills";
import { toIsoDate } from "@/lib/invoices";

const PAGE_SIZE = 25;

const VIEWS = [
  { value: "list", label: "List", icon: List },
  { value: "upcoming", label: "Upcoming", icon: ListTodo },
  { value: "calendar", label: "Calendar", icon: CalendarDays },
] as const;
type BillsView = (typeof VIEWS)[number]["value"];

/** Each viewer's last view — a convenience only, so a blocked store just means List. */
const VIEW_STORAGE_KEY = "sole.bills.view";

function readStoredView(): BillsView | null {
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return VIEWS.some((view) => view.value === stored) ? (stored as BillsView) : null;
  } catch {
    return null;
  }
}

function storeView(view: BillsView) {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Private window or blocked storage: the view just isn't remembered.
  }
}

/** Next month, this month and the eleven before it, as `YYYY-MM`, newest first. */
function monthOptions(today: string) {
  const [year, month] = today.split("-").map(Number);
  return Array.from({ length: 13 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - index, 1));
    return {
      value: date.toISOString().slice(0, 7),
      label: date.toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" }),
    };
  });
}

function monthRange(month: string) {
  if (!month) return {};
  const [year, monthNo] = month.split("-").map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(year, monthNo, 0)).toISOString().slice(0, 10) };
}

/**
 * The Bills page: a forward-looking hero, then the bills three ways — the
 * full list (search, status and month filters, bulk convert and delete), what's
 * coming grouped by when it's due, and a month calendar. A saved bill gets
 * "Convert to expense" here; that is the only place a bill becomes an expense.
 */
export function BillsPanel() {
  const router = useRouter();
  const today = toIsoDate(new Date());

  const [view, setView] = React.useState<BillsView>("list");
  React.useEffect(() => {
    const stored = readStoredView();
    if (stored) setView(stored);
  }, []);
  const changeView = (next: BillsView) => {
    setView(next);
    storeView(next);
  };

  const [filter, setFilter] = React.useState<BillFilter>("All");
  const [query, setQuery] = React.useState("");
  const [month, setMonth] = React.useState("");
  const debouncedQuery = useDebouncedValue(query, 500);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(PAGE_SIZE);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // A new filter starts from page one with nothing ticked.
  const narrowing = `${filter}|${debouncedQuery}|${month}`;
  const lastNarrowing = React.useRef(narrowing);
  if (lastNarrowing.current !== narrowing) {
    lastNarrowing.current = narrowing;
    if (page !== 1) setPage(1);
    if (selected.size > 0) setSelected(new Set());
  }

  const summaryQuery = useBillSummaryQuery();
  const listQuery = useBillsListQuery(
    page,
    pageSize,
    { status: filter, search: debouncedQuery, ...monthRange(month) },
    { enabled: view === "list" },
  );
  const bills = React.useMemo(() => listQuery.data?.bills ?? [], [listQuery.data]);
  const total = listQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const filtered = filter !== "All" || !!query.trim() || !!month;

  const approve = useApproveBillMutation();
  const unapprove = useUnapproveBillMutation();
  const remove = useDeleteBillsMutation();
  const invalidateBills = useInvalidateBills();
  const [deleting, setDeleting] = React.useState<Bill[] | null>(null);
  const [stopRepeats, setStopRepeats] = React.useState(false);
  const [unapproving, setUnapproving] = React.useState<Bill | null>(null);
  const [attaching, setAttaching] = React.useState<Bill | null>(null);
  const [scheduleId, setScheduleId] = React.useState<string | null>(null);
  const [matching, setMatching] = React.useState<Bill | null>(null);
  const [bulkConverting, setBulkConverting] = React.useState(false);

  const selectedBills = bills.filter((bill) => selected.has(bill.id) && bill.status === "draft");

  /**
   * A saved bill becomes an expense on the way to being converted or matched,
   * so both need what an expense needs. Missing something: open the bill so it
   * can be filled in. Returns whether the bill is ready.
   */
  const readyForExpense = (bill: Bill, verb: string) => {
    if (bill.status !== "draft") return true;
    const missing = approveIssues(draftFromBill(bill), bill.total);
    if (missing.length === 0) return true;
    toast.info(`${missing[0].message} to ${verb} this bill`, {
      description: `Open it, fill that in and save, then ${verb} it.`,
    });
    router.push(`/expenses/bills/${bill.id}`);
    return false;
  };

  const onMatch = (bill: Bill) => {
    if (readyForExpense(bill, "match")) setMatching(bill);
  };

  const onConvert = (bill: Bill) => {
    if (!readyForExpense(bill, "convert")) return;
    approve.mutate(bill.id, {
      onSuccess: () =>
        toast.success("Bill converted to an expense", {
          description: "Match it to the payment when it leaves your bank.",
        }),
      onError: (error) => toast.error(apiErrorMessage(error, "Couldn't convert this bill.")),
    });
  };

  /**
   * One at a time, so each conversion is checked against the expense plan limit
   * on its own and a failure part-way leaves the rest of the picture clear.
   * Bills missing a supplier, category, date or amount are left for later.
   */
  const onBulkConvert = async () => {
    const ready = selectedBills.filter((bill) => approveIssues(draftFromBill(bill), bill.total).length === 0);
    const notReady = selectedBills.length - ready.length;
    setBulkConverting(true);
    let converted = 0;
    let failure: string | null = null;
    for (const bill of ready) {
      try {
        await approveBillApi(bill.id);
        converted += 1;
      } catch (error) {
        failure = apiErrorMessage(error, "Couldn't convert a bill.");
        break;
      }
    }
    setBulkConverting(false);
    invalidateBills({ expenses: converted > 0 });
    setSelected(new Set());
    if (converted > 0) {
      toast.success(`${converted} ${converted === 1 ? "bill" : "bills"} converted to expenses`, {
        description: notReady > 0 ? `${notReady} still need details before they can be converted.` : undefined,
      });
    } else if (notReady > 0 && !failure) {
      toast.info("None of these bills are ready to convert", {
        description: "Each needs a supplier, category, bill date and an amount.",
      });
    }
    if (failure) toast.error(failure);
  };

  const onConfirmDelete = () => {
    if (!deleting) return;
    remove.mutate(
      { ids: deleting.map((bill) => bill.id), stopSchedule: stopRepeats },
      {
        onSuccess: () => {
          toast.success(deleting.length === 1 ? "Bill deleted" : `${deleting.length} bills deleted`);
          setSelected((current) => {
            const next = new Set(current);
            for (const bill of deleting) next.delete(bill.id);
            return next;
          });
          setDeleting(null);
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Couldn't delete.")),
      },
    );
  };

  const onConfirmUnapprove = () => {
    if (!unapproving) return;
    unapprove.mutate(unapproving.id, {
      onSuccess: () => {
        toast.success("Bill moved back to saved", { description: "Its expense has been removed." });
        setUnapproving(null);
      },
      onError: (error) => toast.error(apiErrorMessage(error, "Couldn't undo this conversion.")),
    });
  };

  const rowActions: BillRowActions = {
    onMatch,
    onConvert,
    onUnapprove: setUnapproving,
    onDelete: (bill) => {
      setStopRepeats(false);
      setDeleting([bill]);
    },
    onAttach: setAttaching,
    onManageRepeat: setScheduleId,
  };

  const deletingInRepeat = (deleting ?? []).some((bill) => bill.schedule?.status === "active");
  const months = React.useMemo(() => monthOptions(today), [today]);

  const emptyState = (
    <Empty>
      <EmptyMedia>{filtered ? <SearchX aria-hidden /> : <FileText aria-hidden />}</EmptyMedia>
      <div className="space-y-1">
        <EmptyTitle>{filtered ? "No bills match" : "No bills yet"}</EmptyTitle>
        <EmptyDescription>
          {filtered
            ? "Try a different search, or clear the filters to see every bill."
            : "Record bills from your suppliers as they arrive, match them to payments from your bank, and see what's owed and when."}
        </EmptyDescription>
      </div>
      <EmptyActions>
        {filtered ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setQuery("");
              setFilter("All");
              setMonth("");
            }}
          >
            Clear filters
          </Button>
        ) : (
          <Button size="sm" asChild>
            <Link href="/expenses/bills/new">Add bill</Link>
          </Button>
        )}
      </EmptyActions>
    </Empty>
  );

  return (
    <div className="space-y-[15px]">
      {/* `data-usertour-loading` holds the bills tours until the figures are in,
          so a step never lands on the skeleton and then jumps. */}
      <div data-usertour="bill-stats" data-usertour-loading={summaryQuery.isLoading || undefined}>
        <BillsSummary summary={summaryQuery.data} loading={summaryQuery.isLoading} />
      </div>

      <div className="flex flex-wrap items-center gap-2" data-usertour="bill-toolbar">
        <Tabs value={view} onValueChange={(next) => changeView(next as BillsView)}>
          <TabsList aria-label="Bills view" data-usertour="bill-view-switch">
            {VIEWS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-1.5">
                <Icon className="size-3.5" aria-hidden />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {view === "list" && (
          // Search and the filters share one wrapper so the bills tour can highlight them together.
          <div
            className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto"
            data-usertour="bill-search-filters"
            data-usertour-loading={listQuery.isLoading || undefined}
          >
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search bill number or supplier"
                aria-label="Search bills"
                className="pl-9 pr-8"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Select value={month || "all"} onValueChange={(value) => setMonth(value === "all" ? "" : value)}>
              <SelectTrigger className="w-[140px]" aria-label="Filter bills by bill date">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All dates</SelectItem>
                {months.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filter} onValueChange={(value) => setFilter(value as BillFilter)}>
              <SelectTrigger className="w-[150px]" aria-label="Filter bills by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BILL_FILTERS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "All" ? "All bills" : option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {view === "upcoming" && <BillsUpcoming today={today} onManageRepeat={setScheduleId} />}
      {view === "calendar" && <BillsCalendar today={today} onManageRepeat={setScheduleId} />}

      {view === "list" &&
        (listQuery.isLoading ? (
          <BillsListSkeleton />
        ) : listQuery.isError ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="font-medium">Couldn&apos;t load bills</p>
            <p className="mt-1 text-sm text-muted-foreground">{listQuery.error?.message}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void listQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : total === 0 ? (
          emptyState
        ) : (
          <>
            {selectedBills.length > 0 && (
              <div
                className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-card px-4 py-2 shadow-sm"
                role="region"
                aria-label="Selected bills"
              >
                <span className="text-sm font-medium">
                  {selectedBills.length} saved {selectedBills.length === 1 ? "bill" : "bills"} selected
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => void onBulkConvert()} disabled={bulkConverting}>
                    {bulkConverting ? <Loader2 className="animate-spin" /> : <CheckCheck />}
                    Convert to expenses
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={bulkConverting}
                    onClick={() => {
                      setStopRepeats(false);
                      setDeleting(selectedBills);
                    }}
                  >
                    <Trash2 />
                    Delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={bulkConverting}>
                    Clear
                  </Button>
                </div>
              </div>
            )}
            <BillsList
              bills={bills}
              today={today}
              selected={selected}
              onSelectedChange={setSelected}
              convertingId={approve.isPending ? (approve.variables ?? null) : null}
              actions={rowActions}
            />
            <NumberedPagination
              page={{
                page: currentPage,
                pageCount,
                total,
                from: total === 0 ? 0 : pageStart + 1,
                to: Math.min(pageStart + pageSize, total),
              }}
              pageSize={pageSize}
              onPageChange={(next) => {
                setPage(next);
                setSelected(new Set());
              }}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
                setSelected(new Set());
              }}
              itemLabel="bill"
              navLabel="Bills pages"
            />
          </>
        ))}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && !remove.isPending && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleting && deleting.length > 1 ? `Delete ${deleting.length} bills?` : "Delete this bill?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && deleting.length > 1 ? "The bills and their attachments are removed." : "The bill and its attachments are removed."}{" "}
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletingInRepeat && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-3 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={stopRepeats}
                onCheckedChange={(checked) => setStopRepeats(checked === true)}
                aria-label="Also stop the repeat"
              />
              <span>
                <span className="block font-medium">Also stop the repeat</span>
                <span className="block text-xs text-muted-foreground">
                  {deleting && deleting.length > 1 ? "Some of these bills repeat." : "This bill is part of a repeat."} Leave this unticked to
                  keep the next bills coming.
                </span>
              </span>
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                onConfirmDelete();
              }}
            >
              {remove.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!unapproving} onOpenChange={(open) => !open && !unapprove.isPending && setUnapproving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this conversion?</AlertDialogTitle>
            <AlertDialogDescription>
              Its expense is removed and the bill goes back to saved, so you can edit it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unapprove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={unapprove.isPending}
              onClick={(event) => {
                event.preventDefault();
                onConfirmUnapprove();
              }}
            >
              {unapprove.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Undo conversion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BillAttachmentsDialog bill={attaching} onClose={() => setAttaching(null)} />
      <BillScheduleSheet scheduleId={scheduleId} onClose={() => setScheduleId(null)} />
      <BillMatchDialog bill={matching} onClose={() => setMatching(null)} />
    </div>
  );
}
