"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpDown,
  Copy,
  Download,
  Eye,
  FilePlus2,
  FileText,
  Link2,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Receipt,
  Search,
  SearchX,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Highlight } from "@/components/contacts/highlight";
import {
  EMPTY_EXPENSE_FILTERS,
  ExpensesFiltersPopover,
  activeFilterCount,
  type ExpenseFilterDraft,
} from "@/components/expenses/expenses-filters";
import {
  attachExpenseAtom,
  convertExpenseAtom,
  deleteExpenseAtom,
  expenseSelectionAtom,
  expenseSortAtom,
  expensesQueryAtom,
  matchExpenseAtom,
  unmatchExpenseAtom,
  matchExpenseIdAtom,
  unmatchExpenseIdAtom,
  viewExpenseIdAtom,
  viewInvoiceIdAtom,
} from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import { contactDisplayName } from "@/lib/contacts";
import {
  EXPENSE_SORTS,
  bulkDeleteExpensesApi,
  expenseInvoiceableAmount,
  fetchExpenseAttachmentsZip,
  filterExpenses,
  isExpenseInvoiced,
  formatExpenseAmount,
  formatExpenseDate,
  formatExpenseRemaining,
  sortExpenses,
  type Expense,
  type ExpenseSort,
} from "@/lib/expenses";
import { useCountryContext } from "@/hooks/use-country-context";
import { taxWord } from "@/lib/country-context";
import {
  formatInvoiceDate,
  invoiceAmount,
  invoiceMoney,
  statusVariant,
  type Invoice,
} from "@/lib/invoices";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useExpensesListQuery,
  useExpensesQuery,
} from "@/hooks/use-expenses-query";
import { useContactsStore } from "@/stores/contacts";
import { useExpensesStore } from "@/stores/expenses";
import { useInvoicesStore } from "@/stores/invoices";

export const DEFAULT_PAGE_SIZE = 25;

/** Saves a real file the browser already has bytes for — no server round trip. */
function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** A base64 string decoded straight to bytes — for the zip the download endpoint returns. */
function blobFromBase64(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type });
}

export function ExpensesTable() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const invoices = useInvoicesStore((state) => state.invoices);
  const setViewInvoiceId = useSetAtom(viewInvoiceIdAtom);
  const setUnmatchExpense = useSetAtom(unmatchExpenseAtom);
  const setMatchExpense = useSetAtom(matchExpenseAtom);
  const contacts = useContactsStore((state) => state.contacts);
  const removeExpenses = useExpensesStore((state) => state.removeExpenses);
  const [query, setQuery] = useAtom(expensesQueryAtom);
  const [sort, setSort] = useAtom(expenseSortAtom);
  const [selected, setSelected] = useAtom(expenseSelectionAtom);
  const setDeleteExpense = useSetAtom(deleteExpenseAtom);
  const setConvertExpense = useSetAtom(convertExpenseAtom);
  const setViewId = useSetAtom(viewExpenseIdAtom);
  const setAttach = useSetAtom(attachExpenseAtom);

  /**
   * Match Status, Date Range, Price Range, Paid-with-cash, Category and
   * Supplier — one draft object, same as the invoice list's own
   * `advanced` filters, only ever committed to the query below on Apply.
   */
  const [advanced, setAdvanced] = React.useState<ExpenseFilterDraft>(
    EMPTY_EXPENSE_FILTERS,
  );

  /**
   * Opens the invoice editor over the list with this expense prefilled, the
   * same two checks sole-webapp's own "Convert to Invoice" makes first: an
   * expense already on an invoice can't go on a second one, and one with no
   * business portion has nothing to bill.
   */
  const convertToInvoice = (expense: Expense) => {
    if (isExpenseInvoiced(expense)) {
      toast.error("This expense has already been invoiced");
      return;
    }
    if (expenseInvoiceableAmount(expense) <= 0) {
      toast.error("This expense does not have a business amount to invoice");
      return;
    }
    setConvertExpense(expense);
  };

  // The name comes from Contacts while the contact exists; the expense's own
  // snapshot is the fallback.
  const supplierName = (expense: Expense) => {
    const contact = contacts.find((entry) => entry.id === expense.supplierId);
    return contact ? contactDisplayName(contact) : expense.supplierName;
  };

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(DEFAULT_PAGE_SIZE);

  /**
   * Only Category and Supplier (and an alphabetical supplier sort) can't be
   * pushed down to the server — `fetchExpensesPage`'s own doc comment has
   * why (a documented sole-ocr bug for a multi-value filter, and both
   * facets are matched by name rather than a real id in the first place).
   * Match Status, Date Range, Price Range and Paid-with-cash are all real,
   * single-value server params, so they never force this fallback.
   * Engaging either of the two that do falls back to a client-side pass
   * over the complete list, same as this table did before real pagination;
   * otherwise it's a real per-page fetch.
   */
  const clientSideMode =
    advanced.categories.length > 0 ||
    advanced.suppliers.length > 0 ||
    sort === "Supplier A–Z";

  // 700ms — sole-webapp's own search box debounce on this list
  // (`lodash.debounce` in `ExpensesList.js`'s `handleSearch`), not this
  // hook's 400ms default.
  const debouncedQuery = useDebouncedValue(query, 700);
  const minPrice = advanced.minPrice.trim()
    ? Number(advanced.minPrice)
    : undefined;
  const maxPrice = advanced.maxPrice.trim()
    ? Number(advanced.maxPrice)
    : undefined;
  const serverFilters = {
    search: debouncedQuery,
    status: advanced.status === "All" ? undefined : advanced.status,
    sort,
    dateFrom: advanced.dateFrom || undefined,
    dateTo: advanced.dateTo || undefined,
    minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
    paidWithCash: advanced.paidWithCashOnly || undefined,
  };
  const serverQuery = useExpensesListQuery(page, pageSize, serverFilters, {
    enabled: !clientSideMode,
  });
  /**
   * The complete list — only actually fetched while a category/supplier
   * filter or the alphabetical supplier sort is engaged (see
   * `clientSideMode`); the default view never pulls this at all, which is
   * the entire point of `fetchExpensesPage` existing above.
   */
  const fullListQuery = useExpensesQuery({ enabled: clientSideMode });
  const expenses = fullListQuery.data ?? [];

  /*
   * Back to page one whenever the list underneath changes shape. Compared
   * during render rather than in an effect — same as the assets table's own
   * pager — so a stale page number never paints before it's corrected.
   */
  const narrowing = `${debouncedQuery}|${sort}|${JSON.stringify(advanced)}`;
  const lastNarrowing = React.useRef(narrowing);
  if (lastNarrowing.current !== narrowing) {
    lastNarrowing.current = narrowing;
    if (page !== 1) setPage(1);
  }

  const filteredSorted = sortExpenses(
    filterExpenses(expenses, {
      filter: advanced.status,
      query,
      categories: advanced.categories,
      suppliers: advanced.suppliers,
      dateFrom: advanced.dateFrom || undefined,
      dateTo: advanced.dateTo || undefined,
      minPrice: serverFilters.minPrice,
      maxPrice: serverFilters.maxPrice,
      paidWithCash: advanced.paidWithCashOnly,
    }),
    sort,
  );

  const total = clientSideMode
    ? filteredSorted.length
    : (serverQuery.data?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  /** Clamped rather than corrected — deleting the last row of the last page
   *  drops the count under `page`, and clamping shows the new last page on
   *  the same render instead of a blank one first. */
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const paged = clientSideMode
    ? filteredSorted.slice(pageStart, pageStart + pageSize)
    : (serverQuery.data?.expenses ?? []);
  const loading = clientSideMode
    ? fullListQuery.isLoading
    : serverQuery.isLoading;

  // A server page requested past the end (the total shrank from something
  // that changed elsewhere, not from this table's own filters) corrects
  // itself once the response says so — narrowing's own reset above already
  // covers the far more common case of the filters themselves changing.
  React.useEffect(() => {
    if (clientSideMode || !serverQuery.data) return;
    const serverPageCount = Math.max(
      1,
      Math.ceil(serverQuery.data.total / pageSize),
    );
    if (page > serverPageCount) setPage(serverPageCount);
  }, [clientSideMode, serverQuery.data, pageSize, page]);

  const filtered = !!query.trim() || activeFilterCount(advanced) > 0;

  /**
   * Selection is scoped to what's visible. In client-side mode that's every
   * row the filters matched, same as before; in server mode there's only
   * ever one page of rows in hand, so it's just this page.
   */
  const visibleIds = (clientSideMode ? filteredSorted : paged).map(
    (row) => row.id,
  );
  const chosen = selected.filter((id) => visibleIds.includes(id));
  const allChosen = chosen.length > 0 && chosen.length === visibleIds.length;

  const invalidateExpenseQueries = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["expenses"] }),
      queryClient.invalidateQueries({ queryKey: ["expenses-page"] }),
      queryClient.invalidateQueries({ queryKey: ["expense-summary"] }),
    ]);

  const [bulkDownloading, setBulkDownloading] = React.useState(false);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] =
    React.useState(false);

  const handleBulkDownload = async () => {
    if (chosen.length === 0 || bulkDownloading) return;
    setBulkDownloading(true);
    try {
      const zip = await fetchExpenseAttachmentsZip(chosen);
      downloadBlob(
        "expense-receipts.zip",
        blobFromBase64(zip, "application/zip"),
      );
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "No receipts found for the selected expenses."),
      );
    } finally {
      setBulkDownloading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (chosen.length === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    try {
      const { message } = await bulkDeleteExpensesApi(chosen);
      // Optimistic — the store is still what a few other screens read
      // directly; the invalidation below is what corrects it to the real
      // outcome (a reconciled row the backend protected stays put).
      removeExpenses(chosen);
      await invalidateExpenseQueries();
      setSelected([]);
      setConfirmBulkDeleteOpen(false);
      toast.success(message);
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Couldn't delete those expenses. Try again."),
      );
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleAll = () => setSelected(allChosen ? [] : visibleIds);
  const toggleOne = (id: string) =>
    setSelected(
      selected.includes(id)
        ? selected.filter((entry) => entry !== id)
        : [...selected, id],
    );

  const clearFilters = () => {
    setQuery("");
    setAdvanced(EMPTY_EXPENSE_FILTERS);
  };

  const emptyState = (
    <Empty>
      <EmptyMedia>
        {filtered ? <SearchX aria-hidden /> : <Receipt aria-hidden />}
      </EmptyMedia>
      <div className="space-y-1">
        <EmptyTitle>
          {filtered
            ? "No expenses match your filters"
            : "No expenses recorded yet"}
        </EmptyTitle>
        <EmptyDescription>
          {filtered
            ? "Try a different search, or clear the filters to see everything."
            : "Record your business spending to track deductions, match it to your bank feed and stay ready for tax time."}
        </EmptyDescription>
      </div>
      {!filtered && <EmptyCue label="Start here" />}
      <EmptyActions>
        {filtered ? (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : (
          <Button size="sm" asChild>
            <Link href="/expenses/new">Add expense</Link>
          </Button>
        )}
      </EmptyActions>
    </Empty>
  );

  /*
   * Nothing recorded at all — not a search or filter that matched nothing —
   * so there's nothing for the toolbar, bulk bar or pager to act on: just the
   * empty state, same as the rules table. An errored fetch never lands here.
   */
  const queryError = clientSideMode
    ? fullListQuery.isError
    : serverQuery.isError;
  if (!loading && !queryError && !filtered && total === 0) return emptyState;

  return (
    <div className="space-y-[15px]">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div
          className="flex flex-1 flex-wrap items-center justify-end gap-2"
          data-usertour="expense-search-filters"
        >
          <div className="relative w-full sm:w-56">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by description"
              aria-label="Search by description"
              className="pl-9 pr-8"
            />
            {/* Same clear affordance as sole-webapp's own search box. */}
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

          {/* Match Status, Date Range, Price Range, Paid-with-cash, Category
              and Supplier all live in this one popover — the same layout as
              the invoice list's own advanced-filters popover, wired to
              sole-webapp's real expense `SmartFilter` fields. */}
          <ExpensesFiltersPopover value={advanced} onChange={setAdvanced} />

          <Select
            value={sort}
            onValueChange={(value) => setSort(value as ExpenseSort)}
          >
            <SelectTrigger className="w-[168px]" aria-label="Sort expenses">
              <ArrowUpDown className="size-4 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_SORTS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* The bulk bar only exists while something is selected — Download and
          Delete live here rather than always-on in the toolbar above, same
          as sole-webapp's own selected-rows bar (which shows nothing at all
          for either action until a row is ticked). */}
      {chosen.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/[0.03] px-4 py-2.5">
          <p className="text-sm font-medium tabular">
            {chosen.length} selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={bulkDownloading}
              onClick={handleBulkDownload}
            >
              {bulkDownloading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Download />
              )}
              Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmBulkDeleteOpen(true)}
            >
              <Trash2 />
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setSelected([])}
            >
              <X />
              Clear
            </Button>
          </div>
        </div>
      )}

      <AlertDialog
        open={confirmBulkDeleteOpen}
        onOpenChange={(open) =>
          !open && !bulkDeleting && setConfirmBulkDeleteOpen(false)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {chosen.length}{" "}
              {chosen.length === 1 ? "expense" : "expenses"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected expenses and any attached receipts. This
              action can&apos;t be undone. A reconciled expense is protected and
              skipped rather than deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                // Held open the same way the row's own Delete dialog is —
                // Radix would otherwise close it before the call resolves.
                event.preventDefault();
                void handleBulkDelete();
              }}
            >
              {bulkDeleting && <Loader2 className="animate-spin" aria-hidden />}
              {bulkDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {loading ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <Table className="min-w-[1360px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[44px]" />
                <TableHead className="text-center">Category</TableHead>
                <TableHead className="text-center">Description</TableHead>
                <TableHead className="text-center">Supplier</TableHead>
                <TableHead className={cn(HUG_COLUMN, "text-center")}>
                  Date
                </TableHead>
                <TableHead className={cn(HUG_COLUMN, "text-center")}>
                  Price
                </TableHead>
                <TableHead className={cn(HUG_COLUMN, "text-center")}>
                  Remaining
                </TableHead>
                <TableHead className={cn(HUG_COLUMN, "text-center")}>
                  Invoice
                </TableHead>
                <TableHead className={cn(HUG_COLUMN, "text-center")}>
                  Match transaction
                </TableHead>
                <TableHead className="text-center">Vendor note</TableHead>
                <TableHead className={cn(HUG_COLUMN, "text-right")}>
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody aria-hidden>
              {Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  <TableCell>
                    <Shimmer className="size-4" />
                  </TableCell>
                  {Array.from({ length: 9 }).map((__, cellIndex) => (
                    <TableCell key={cellIndex} className="text-center">
                      <Shimmer className="mx-auto h-4 w-20" />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Shimmer className="ml-auto size-8 rounded-full" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : total === 0 ? (
        emptyState
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <Table className="min-w-[1360px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[44px]">
                    <Checkbox
                      checked={allChosen}
                      onCheckedChange={toggleAll}
                      aria-label="Select all expenses"
                    />
                  </TableHead>
                  {/* The text columns — category, description, supplier and the
                      vendor note — take the spare width. Dates, figures, the
                      two link cells and the menu hug their content. */}
                  <TableHead className="text-center">Category</TableHead>
                  <TableHead className="text-center">Description</TableHead>
                  <TableHead className="text-center">Supplier</TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-center")}>
                    Date
                  </TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-center")}>
                    Price
                  </TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-center")}>
                    Remaining
                  </TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-center")}>
                    Invoice
                  </TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-center")}>
                    Match transaction
                  </TableHead>
                  <TableHead className="text-center">Vendor note</TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-right")}>
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((expense) => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    supplier={supplierName(expense)}
                    query={query}
                    selected={selected.includes(expense.id)}
                    onSelect={() => toggleOne(expense.id)}
                    invoice={
                      expense.invoiceId
                        ? (invoices.find(
                            (entry) => entry.id === expense.invoiceId,
                          ) ?? null)
                        : null
                    }
                    onViewInvoice={() => {
                      if (expense.invoiceId)
                        setViewInvoiceId(expense.invoiceId);
                    }}
                    onUnmatch={() => setUnmatchExpense(expense)}
                    onMatch={() => setMatchExpense(expense)}
                    onView={() => setViewId(expense.id)}
                    onAttach={() => setAttach(expense)}
                    onConvert={() => convertToInvoice(expense)}
                    onDuplicate={() =>
                      router.push(
                        `/expenses/new/manual?copy=${encodeURIComponent(expense.id)}`,
                      )
                    }
                    onDelete={() => setDeleteExpense(expense)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <NumberedPagination
            page={{
              page: currentPage,
              pageCount,
              total,
              from: total === 0 ? 0 : pageStart + 1,
              to: Math.min(pageStart + pageSize, total),
            }}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              // Row 30 is on a different page at 10 a page than at 50, so the
              // honest thing after a resize is the top of the list rather than
              // whichever page number happens to still be in range.
              setPage(1);
            }}
            itemLabel="expense"
            navLabel="Expenses pages"
          />
        </>
      )}
    </div>
  );
}

function ExpenseRow({
  expense,
  supplier,
  query,
  selected,
  onSelect,
  invoice,
  onViewInvoice,
  onMatch,
  onUnmatch,
  onView,
  onAttach,
  onConvert,
  onDuplicate,
  onDelete,
}: {
  expense: Expense;
  supplier: string;
  query: string;
  selected: boolean;
  onSelect: () => void;
  /** The invoice this was on-charged to, where it's still on the books. */
  invoice: Invoice | null;
  onViewInvoice: () => void;
  onMatch: () => void;
  onUnmatch: () => void;
  onView: () => void;
  onAttach: () => void;
  onConvert: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const matched = expense.status === "Matched";
  const { country } = useCountryContext();

  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          aria-label={`Select ${expense.description}`}
        />
      </TableCell>
      <TableCell className="max-w-[180px] text-center text-muted-foreground">
        <span className="block truncate">
          <Highlight text={expense.category || "—"} query={query} />
        </span>
      </TableCell>
      <TableCell className="max-w-[220px] text-center">
        <span className="block truncate font-medium">
          <Highlight text={expense.description} query={query} />
        </span>
        {/*
          What the bank called it, under what you called it. The statement line
          is how you'll find this again in a feed or a dispute, and it's no use
          replacing the description someone wrote for it.
        */}
        {(expense.bankDescription || expense.cardLast4) && (
          <span className="block truncate text-xs text-[#9CA3AF]">
            {[
              expense.bankDescription,
              expense.cardLast4 && `Card xx${expense.cardLast4}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </TableCell>
      <TableCell className="max-w-[160px] text-center">
        <span className="block truncate">
          <Highlight text={supplier || "—"} query={query} />
        </span>
      </TableCell>
      <TableCell
        className={cn(HUG_COLUMN, "text-center text-muted-foreground tabular")}
      >
        {formatExpenseDate(expense.date)}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center font-medium tabular")}>
        <span>
          {formatExpenseAmount(expense)}
          {expense.gst && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              inc {taxWord(country)}
            </span>
          )}
        </span>
        {/* The business/personal split — the price above is only the
            business portion, so the real original total shows alongside it,
            same as sole-webapp's own list. */}
        {expense.isSplit && (
          <span className="block text-xs font-normal text-muted-foreground">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-dotted underline-offset-2">
                    Split
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-56">
                  Split amount is used for matching. Total is the original
                  expense amount.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>{" "}
            · Total: {invoiceMoney(expense.totalAmount)}
          </span>
        )}
      </TableCell>
      <TableCell
        className={cn(HUG_COLUMN, "text-center tabular text-muted-foreground")}
      >
        {formatExpenseRemaining(expense)}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center")}>
        {expense.invoiceId ? (
          <LinkedInvoiceBadge
            invoice={invoice}
            onOpen={onViewInvoice}
            fallback={expense.invoiceNo ?? expense.invoiceId}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center")}>
        {/* Matched shows what it reconciled against, and the way back out of
            it — the pair sit together so match and unmatch are one place. */}
        {matched ? (
          <span className="inline-flex items-center gap-1">
            <span className="whitespace-nowrap tabular text-muted-foreground">
              {expense.transactionRef ?? "Matched"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={onUnmatch}
              aria-label={
                expense.transactionRef
                  ? `Unmatch ${expense.description} from ${expense.transactionRef}`
                  : `Unmatch ${expense.description}`
              }
            >
              <Undo2 className="size-3.5" />
            </Button>
          </span>
        ) : expense.possibleMatch > 0 ? (
          <AiMatchButton suggestions={expense.possibleMatch} onOpen={onMatch} />
        ) : (
          <Button variant="outline" size="sm" onClick={onMatch}>
            <Link2 />
            Match
          </Button>
        )}
      </TableCell>
      <TableCell className="max-w-[200px] text-center text-muted-foreground">
        {/* Real sole-webapp behaviour: this column shows the credit note
            (vendor refund) raised against the expense, not free text — there
            never was a note field to type one into. */}
        {expense.creditNoteNo ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-xs font-medium tabular">
            <FileText className="size-3 text-muted-foreground" aria-hidden />
            {expense.creditNoteNo}
          </span>
        ) : expense.vendorNote.trim() ? (
          <span className="block truncate">{expense.vendorNote}</span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className={HUG_COLUMN}>
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for ${expense.description}`}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            {/* View actions, then edit actions, then Delete on its own. */}
            <DropdownMenuContent align="end" className="w-52">
              <MenuAction icon={<Eye />} label="View" onSelect={onView} />
              <DropdownMenuSeparator />
              {/* Absent rather than disabled once matched: the price and
                  category it was matched against shouldn't move without an
                  unmatch first, same as sole-webapp's own reconciled rows. */}
              {!matched && (
                <MenuAction
                  icon={<Pencil />}
                  label="Edit"
                  href={`/expenses/${expense.id}`}
                />
              )}
              <MenuAction
                icon={<Paperclip />}
                label={
                  expense.receipt ? "Replace attachment" : "Add attachment"
                }
                onSelect={onAttach}
              />
              <MenuAction
                icon={<FilePlus2 />}
                label="Convert to invoice"
                onSelect={onConvert}
                disabledReason={
                  expense.invoiceId
                    ? "Already on-charged to an invoice"
                    : undefined
                }
              />
              <MenuAction
                icon={<Copy />}
                label="Duplicate"
                onSelect={onDuplicate}
              />
              <DropdownMenuSeparator />
              <MenuAction
                icon={<Trash2 />}
                label="Delete"
                onSelect={onDelete}
                destructive
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * The match button, for rows the feed already has a candidate for — same
 * treatment as the invoices and super-contributions lists' own AI Match
 * button, since it's the same signal (the backend's `possible_match` count)
 * driving the same idea: don't make someone hunt for a match that's already
 * sitting there.
 */
function AiMatchButton({
  suggestions,
  onOpen,
}: {
  suggestions: number;
  onOpen: () => void;
}) {
  return (
    <span className="group relative inline-flex">
      <span
        className="pointer-events-none absolute -inset-1 rounded-lg bg-primary/40 opacity-60 blur-md transition-colors motion-safe:animate-ai-glow group-hover:bg-primary/60"
        aria-hidden
      />
      <Button
        size="sm"
        onClick={onOpen}
        className="relative bg-[linear-gradient(110deg,hsl(var(--primary)),#8B7CFF,hsl(var(--primary)))] bg-[length:200%_100%] transition-[filter] motion-safe:animate-ai-shift group-hover:brightness-110 motion-safe:group-hover:[animation-duration:1.6s]"
      >
        <Sparkles className="motion-safe:animate-ai-twinkle motion-safe:group-hover:animate-ai-turn" />
        AI Match
      </Button>
      <span
        className="absolute -right-1 -top-1 z-10 size-2.5 rounded-full bg-success ring-2 ring-card"
        aria-hidden
      />
      <span className="sr-only">
        {suggestions === 1
          ? "1 suggested transaction"
          : `${suggestions} suggested transactions`}
      </span>
    </span>
  );
}

/**
 * The invoice this expense was on-charged to.
 *
 * The reference rather than the word "On-charged": which invoice it went onto
 * is the thing you'd want to know, and it's what you'd search for. The tooltip
 * carries what you'd otherwise leave the page to find out, and the badge opens
 * that invoice in place.
 */
function LinkedInvoiceBadge({
  invoice,
  onOpen,
  fallback,
}: {
  invoice: Invoice | null;
  onOpen: () => void;
  /** The stored id, for an invoice that's no longer on the books. */
  fallback: string;
}) {
  const badge = (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-xs font-medium tabular">
      <FileText className="size-3 text-muted-foreground" aria-hidden />
      {invoice?.number ?? fallback}
    </span>
  );

  // Deleted since: the reference is still the truth about the expense, so it
  // stays — but it can't pretend to lead anywhere.
  if (!invoice) return <span className="text-muted-foreground">{badge}</span>;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpen}
            className="block w-fit rounded-md outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Preview invoice ${invoice.number}`}
          >
            {badge}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="space-y-1">
          <p className="font-medium tabular">{invoice.number}</p>
          <p className="tabular">
            {formatInvoiceDate(invoice.issued)} ·{" "}
            {invoiceMoney(invoiceAmount(invoice))}
          </p>
          <div>
            <Badge variant={statusVariant(invoice.status)}>
              {invoice.status}
            </Badge>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
