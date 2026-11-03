"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Download,
  Eye,
  FileCheck2,
  FileText,
  History,
  FilePlus2,
  MoreHorizontal,
  Pencil,
  Search,
  SearchX,
  Send,
  Trash2,
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
import { useCountryContext } from "@/hooks/use-country-context";
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
import { RowIconButton } from "@/components/ui/row-icon-button";
import { Shimmer } from "@/components/ui/shimmer";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  activeQuoteFilterCount,
  EMPTY_QUOTE_FILTERS,
  QuotesFiltersPopover,
  resolveQuoteFilters,
  type QuoteFilterDraft,
} from "@/components/quotes/quotes-filters";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  deleteQuoteIdsAtom,
  historyQuoteIdAtom,
  listedQuotesAtom,
  quickEditInvoiceIdAtom,
  quotesFilterAtom,
  quotesPageSizeAtom,
  quotesQueryAtom,
  viewQuoteIdAtom,
} from "@/lib/atoms";
import { contactDisplayName } from "@/lib/contacts";
import {
  formatDocumentMoney,
  formatInvoiceDate,
  invoiceAmount,
  invoiceMoney,
  statusVariant,
  type Invoice,
} from "@/lib/invoices";
import {
  convertQuoteToInvoiceApi,
  downloadQuotesApi,
  fetchQuoteStatusCounts,
  fetchQuotesPage,
  isForeignQuote,
  sendQuoteApi,
  QUOTE_FILTERS,
  quoteAmount,
  quoteAmountAud,
  quoteDepositAmount,
  quoteDisplayStatus,
  quoteStatusVariant,
  type Quote,
  type QuoteDisplayStatus,
  type QuoteListFilters,
  type QuoteStatusCounts,
} from "@/lib/quotes";
import {
  AreaFilterChip,
  useAreaFilter,
} from "@/components/documents/area-filter";
import { areaPredicate } from "@/lib/customer-areas";
import { cn } from "@/lib/utils";
import { useContactsStore } from "@/stores/contacts";
import { useInvoicesStore } from "@/stores/invoices";

/** What every tab reads when an area matches no clients, so nothing can be in it. */
const NO_QUOTES = Object.fromEntries(
  QUOTE_FILTERS.map((option) => [option, 0]),
) as QuoteStatusCounts;

/**
 * The list, a page at a time from the server — tab, search, filters and page
 * all go in the request, the same way the Invoices list fetches its rows.
 */
export function QuotesTable() {
  const baseCurrency = useCountryContext().country.currency;
  const contacts = useContactsStore((state) => state.contacts);
  const area = useAreaFilter();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = React.useState(false);

  /**
   * The selected quotes as one file. The server renders and names it; this
   * only hands the bytes to the browser.
   */
  const downloadSelected = async (ids: string[]) => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { blob, filename } = await downloadQuotesApi(ids);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't download those quotes.",
      );
    } finally {
      setDownloading(false);
    }
  };

  /**
   * A quote awaiting confirmation before it's billed — one the client hasn't
   * accepted yet. Accepted quotes convert straight away.
   */
  const [confirmConvert, setConfirmConvert] = React.useState<Quote | null>(
    null,
  );
  const [convertingId, setConvertingId] = React.useState<string | null>(null);

  /** Bills the quote. The server raises the invoice and links the two. */
  const convertQuote = async (quote: Quote) => {
    if (convertingId) return;
    setConvertingId(quote.id);
    const toastId = toast.loading(`Converting ${quote.number}…`);
    try {
      await convertQuoteToInvoiceApi(quote, baseCurrency);
      // The quote is now Converted and there's a new invoice, so both lists
      // and the stat cards above them are out of date.
      await queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(`${quote.number} converted to an invoice`, { id: toastId });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't convert that quote.",
        { id: toastId },
      );
    } finally {
      setConvertingId(null);
    }
  };

  /**
   * Billing a quote the client hasn't accepted is allowed, but not silently —
   * the reference asks first, and so does this.
   */
  const startConvert = (quote: Quote) => {
    if (quote.status === "Accepted") {
      convertQuote(quote);
      return;
    }
    setConfirmConvert(quote);
  };

  /** Emails one saved quote to its client, then refreshes what the list shows. */
  const sendQuote = async (quote: Quote) => {
    const toastId = toast.loading(`Sending ${quote.number}…`);
    try {
      await sendQuoteApi(quote.id);
      await queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast.success(`${quote.number} sent`, { id: toastId });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't send that quote.",
        { id: toastId },
      );
    }
  };

  const [filter, setFilter] = useAtom(quotesFilterAtom);
  const [query, setQuery] = useAtom(quotesQueryAtom);
  const [pageSize, setPageSize] = useAtom(quotesPageSizeAtom);
  const setListedQuotes = useSetAtom(listedQuotesAtom);
  const invoices = useInvoicesStore((state) => state.invoices);
  const setDeleteIds = useSetAtom(deleteQuoteIdsAtom);
  const setViewId = useSetAtom(viewQuoteIdAtom);
  const setHistoryId = useSetAtom(historyQuoteIdAtom);
  const setQuickEditId = useSetAtom(quickEditInvoiceIdAtom);

  /*
   * Ephemeral, and only ever acted on where it overlaps the rows on screen:
   * a filter or a search that hides a selected quote shouldn't leave it queued
   * for a delete nobody can see.
   */
  const [selected, setSelected] = React.useState<string[]>([]);

  // The name comes from Contacts while the contact exists; the quote's own
  // snapshot is the fallback once it's deleted.
  const resolveClient = (quote: Quote) => {
    const contact = contacts.find((entry) => entry.id === quote.clientId);
    return {
      name: contact ? contactDisplayName(contact) : quote.clientName,
      email: contact?.email ?? "",
    };
  };

  /*
   * The server only sees the search once typing has settled. Highlighting
   * still reads the live value, since that text is already on screen.
   */
  const debouncedQuery = useDebouncedValue(query, 350);
  const needle = query.trim().toLowerCase();

  const [advanced, setAdvanced] =
    React.useState<QuoteFilterDraft>(EMPTY_QUOTE_FILTERS);
  const advancedCount = activeQuoteFilterCount(advanced);
  const [page, setPage] = React.useState(1);

  /*
   * The area deep-link and the client picker both narrow to a set of clients,
   * so they resolve to one `clientIds` list. The area wins when both are
   * active, since it's the one that names itself on screen.
   *
   * An area no client sits in has nothing to show, rather than sending no
   * client filter at all and showing every quote.
   */
  const inArea = areaPredicate(area, contacts);
  const areaClientIds = area
    ? contacts.filter((contact) => inArea(contact.id)).map((contact) => contact.id)
    : null;
  const areaEmpty = areaClientIds?.length === 0;
  const effectiveClientIds =
    areaClientIds ??
    (advanced.clientIds.length > 0 ? advanced.clientIds : undefined);

  const listFilters: QuoteListFilters = {
    status: filter,
    search: debouncedQuery,
    clientIds: effectiveClientIds,
    ...resolveQuoteFilters(advanced),
  };
  // Rebuilt every render, so its content is what drives the cache key and the
  // page-one reset, not its identity.
  const filterKey = JSON.stringify(listFilters);

  /*
   * Back to page one, and an empty selection, whenever the list underneath
   * changes shape. Compared during render rather than in an effect, so the
   * old page number is never requested under the new filters.
   */
  const lastFilterKey = React.useRef(filterKey);
  if (lastFilterKey.current !== filterKey) {
    lastFilterKey.current = filterKey;
    if (page !== 1) setPage(1);
    if (selected.length > 0) setSelected([]);
  }

  const pageQuery = useQuery({
    queryKey: ["quotes", "list", page, pageSize, filterKey],
    queryFn: () => fetchQuotesPage(page, pageSize, listFilters),
    placeholderData: keepPreviousData,
    enabled: !areaEmpty,
  });

  // The row dialogs look quotes up here too — see listedQuotesAtom.
  React.useEffect(() => {
    setListedQuotes(pageQuery.data?.quotes ?? []);
  }, [pageQuery.data, setListedQuotes]);

  const rows = areaEmpty ? [] : (pageQuery.data?.quotes ?? []);
  const total = areaEmpty ? 0 : (pageQuery.data?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;

  // Deleting the last quote on the last page leaves that page empty; step
  // back to the one that still has rows instead of showing an empty state.
  React.useEffect(() => {
    if (pageQuery.data && page > pageCount) setPage(pageCount);
  }, [pageQuery.data, page, pageCount]);

  /*
   * The first load, and any tab, search, filter or page change still in
   * flight. `keepPreviousData` leaves the last page in `data` meanwhile, and
   * showing it under the filter that just replaced it would be wrong.
   */
  const rowsLoading =
    !areaEmpty && (pageQuery.isLoading || pageQuery.isPlaceholderData);

  /*
   * Per-tab counts across the whole account, from the server rather than a
   * count of whichever page is loaded. Scoped to the same clients an area
   * deep-link narrows the rows to.
   */
  const countsQuery = useQuery({
    queryKey: ["quotes", "status-counts", areaClientIds?.join(",") ?? null],
    queryFn: () => fetchQuoteStatusCounts(areaClientIds ?? undefined),
    enabled: !areaEmpty,
  });
  const counts = areaEmpty ? NO_QUOTES : countsQuery.data;

  const clearFilters = () => {
    setQuery("");
    setAdvanced(EMPTY_QUOTE_FILTERS);
  };

  /*
   * A draft can't be selected. Both things the selection does to a batch —
   * delete them, download them — are wrong for a document that was never
   * issued: there is no rendered quote to put in the file, and a draft is
   * deleted from its own row. The reference draws the same line.
   *
   * Scoped to this page, same as the checkbox's own label says: a select-all
   * that reached across pages would tick rows nobody on screen chose.
   */
  const selectableRows = rows.filter((quote) => quote.status !== "Draft");
  const selectedRows = rows.filter((quote) => selected.includes(quote.id));
  const allSelected =
    selectableRows.length > 0 &&
    selectableRows.every((quote) => selected.includes(quote.id));
  const toggleAll = () =>
    setSelected((current) =>
      allSelected
        ? current.filter(
            (id) => !selectableRows.some((quote) => quote.id === id),
          )
        : [
            ...current,
            ...selectableRows
              .map((quote) => quote.id)
              .filter((id) => !current.includes(id)),
          ],
    );
  const toggleOne = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );

  const emptyState = (
    <Empty>
      <EmptyMedia>
        {needle ? <SearchX aria-hidden /> : <FileCheck2 aria-hidden />}
      </EmptyMedia>
      <div className="space-y-1">
        <EmptyTitle>
          {needle
            ? "No quotes match your search"
            : advancedCount > 0
              ? "No quotes match these filters"
              : filter !== "All"
                ? `No ${filter.toLowerCase()} quotes`
                : "No quotes yet"}
        </EmptyTitle>
        <EmptyDescription>
          {needle
            ? "Try a different quote number or client, or clear the search."
            : advancedCount > 0
              ? "Try widening the filters, or clear them to see every quote."
              : filter !== "All"
                ? "Nothing here right now. Try a different filter or create a new quote."
                : "Create your first quote to start tracking work you've proposed."}
        </EmptyDescription>
      </div>
      {!needle && advancedCount === 0 && <EmptyCue label="Start here" />}
      <EmptyActions>
        {needle || advancedCount > 0 ? (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            {needle ? "Clear search" : "Clear filters"}
          </Button>
        ) : (
          <Button size="sm" asChild>
            <Link href="/quotes/new">New quote</Link>
          </Button>
        )}
      </EmptyActions>
    </Empty>
  );

  /*
   * No quotes at all — rather than a tab, search, filter or area that matched
   * nothing — so the tabs, search and pager have nothing to act on: just the
   * empty state, same as the rules table. Both search values count, so a
   * search still settling never collapses the toolbar mid-keystroke, and an
   * errored fetch never lands here.
   */
  if (
    !rowsLoading &&
    !pageQuery.isError &&
    !area &&
    filter === "All" &&
    advancedCount === 0 &&
    !query.trim() &&
    !debouncedQuery.trim() &&
    total === 0
  ) {
    return emptyState;
  }

  return (
    <div className="space-y-[15px]">
      {area && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Showing</span>
          <AreaFilterChip area={area} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The same tab strip as the Invoices list. Eight tabs with counts
            run wider than a phone, so they scroll sideways inside the row
            rather than pushing past the screen edge. */}
        <Tabs
          data-usertour="quote-filters"
          className="max-w-full overflow-x-auto"
          value={filter}
          onValueChange={(value) => setFilter(value as typeof filter)}
        >
          <TabsList aria-label="Filter quotes by status">
            {QUOTE_FILTERS.map((option) => (
              <TabsTrigger
                key={option}
                value={option}
                className="gap-1.5 font-normal"
              >
                {option}
                {counts ? (
                  <span className="text-xs text-muted-foreground tabular">
                    {counts[option]}
                  </span>
                ) : (
                  <Shimmer className="h-3.5 w-4" aria-hidden />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72" data-usertour="quote-search">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search quotes"
              aria-label="Search quotes"
              className="pl-9"
            />
          </div>
          <QuotesFiltersPopover
            value={advanced}
            onChange={setAdvanced}
            clients={contacts.filter((contact) => contact.type === "Client")}
          />
        </div>
      </div>

      {selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <p className="text-sm">
            <span className="font-medium tabular">{selectedRows.length}</span>{" "}
            {selectedRows.length === 1 ? "quote" : "quotes"} selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={downloading}
              onClick={() => downloadSelected(selectedRows.map((q) => q.id))}
            >
              <Download />
              {downloading ? "Preparing…" : "Download"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteIds(selectedRows.map((q) => q.id))}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        </div>
      )}

      {rowsLoading ? (
        <QuotesTableSkeleton />
      ) : rows.length === 0 ? (
        emptyState
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[44px]">
                    <Checkbox
                      checked={
                        allSelected
                          ? true
                          : selectedRows.length > 0
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={toggleAll}
                      disabled={selectableRows.length === 0}
                      aria-label={
                        allSelected
                          ? "Clear selection"
                          : "Select all quotes on this page"
                      }
                    />
                  </TableHead>
                  {/*
                    Every column sizes to its content. Nothing here is given a
                    width, a proportion, or the job of soaking up what's left
                    over — that was the bug, twice over.

                    An `auto` table at `width: 100%` hands its surplus width to
                    whichever columns have no width specified, in proportion to
                    how wide their content *could* run. Leave one or two columns
                    unsized and they take the entire surplus, and because their
                    text is shorter than the column becomes, it shows up as a
                    band of nothing at the column's edge. Moving which columns
                    were unsized only moved where that band appeared.

                    With every column clamped to its content the surplus is
                    spread across all of them instead of pooling in two, which
                    is what an even rhythm actually requires. The text columns
                    cap their own content in `ch` so they can't run away — the
                    same thing the Invoices row does to its client line.
                  */}
                  {/* Quote # stays left (it's what's being scanned for),
                      Actions stays right (it's reached for), and everything
                      between reads as a centered column of its own. */}
                  <TableHead className={HUG_COLUMN}>Quote #</TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-center")}>
                    Client
                  </TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-center")}>
                    Quote date
                  </TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-center")}>
                    Expiry
                  </TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-center")}>
                    Deposit
                  </TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-center")}>
                    Status
                  </TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-center")}>
                    Amount
                  </TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-right")}>
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((quote) => {
                  const client = resolveClient(quote);
                  return (
                    <QuoteRow
                      key={quote.id}
                      quote={quote}
                      client={client.name}
                      clientEmail={client.email}
                      query={query}
                      selected={selected.includes(quote.id)}
                      onSelect={() => toggleOne(quote.id)}
                      onEditInvoice={setQuickEditId}
                      linkedInvoice={
                        quote.convertedInvoice
                          ? (invoices.find(
                              (invoice) =>
                                invoice.number === quote.convertedInvoice,
                            ) ?? null)
                          : null
                      }
                      onConvert={() => startConvert(quote)}
                      converting={convertingId === quote.id}
                      onSend={() => sendQuote(quote)}
                      onView={() => setViewId(quote.id)}
                      onHistory={() => setHistoryId(quote.id)}
                      onDuplicate={() =>
                        // An NDIS quote has to reopen in the NDIS editor, or
                        // its support numbers and claim types have nowhere to
                        // land.
                        router.push(
                          `/quotes/new/${quote.ndis ? "ndis" : "manual"}?duplicate=${quote.id}`,
                        )
                      }
                      onDelete={() => setDeleteIds([quote.id])}
                    />
                  );
                })}
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
              setPageSize(next as typeof pageSize);
              setPage(1);
            }}
            itemLabel="quote"
            navLabel="Quotes pages"
          />
        </>
      )}

      {/*
        Billing a quote the client hasn't accepted is allowed — it just isn't
        done silently. Same question the reference asks, in the same words.
      */}
      <AlertDialog
        open={confirmConvert !== null}
        onOpenChange={(open) => !open && setConfirmConvert(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Convert {confirmConvert?.number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This quote has not been accepted by the client. Converting it
              raises an invoice for the full quoted amount.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                const quote = confirmConvert;
                setConfirmConvert(null);
                if (quote) convertQuote(quote);
              }}
            >
              Convert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function QuoteRow({
  quote,
  client,
  clientEmail,
  query,
  selected,
  onSelect,
  linkedInvoice,
  converting,
  onConvert,
  onEditInvoice,
  onSend,
  onView,
  onHistory,
  onDuplicate,
  onDelete,
}: {
  quote: Quote;
  client: string;
  clientEmail: string;
  query: string;
  selected: boolean;
  onSelect: () => void;
  /** The invoice this quote became, where it's still on the books. */
  linkedInvoice: Invoice | null;
  onEditInvoice: (invoiceId: string) => void;
  /** Bills the quote outright — the server raises the invoice and links it. */
  onConvert: () => void;
  /** True while this row's conversion is in flight. */
  converting: boolean;
  onSend: () => void;
  onView: () => void;
  onHistory: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  // The books' currency, which `quoteAmountAud` converts into.
  const baseCurrency = useCountryContext().country.currency;
  const deposit = quoteDepositAmount(quote);
  const status = quoteDisplayStatus(quote);
  /**
   * Sending is for a quote the client hasn't answered yet. Once they've accepted
   * or declined, sending it again isn't a follow-up — it's confusing.
   */
  const sendReason = quote.convertedInvoice
    ? `Already invoiced as ${quote.convertedInvoice}`
    : quote.status === "Accepted"
      ? "The client has already accepted this quote"
      : quote.status === "Declined"
        ? "This quote was declined — duplicate it to re-quote"
        : undefined;

  /**
   * Converting is blocked on only two things, which is what the reference
   * blocks it on: a quote that has already been billed (a second invoice off
   * it is a double-bill) and one the client declined.
   *
   * Everything else can be converted, a draft included — a quote often gets
   * accepted over the phone and billed before anyone updates its status, and
   * refusing to bill until the status is right made the list dictate the order
   * of work. A quote that isn't accepted yet asks for confirmation first
   * rather than being refused.
   */
  const convertReason = quote.convertedInvoice
    ? `Already converted to ${quote.convertedInvoice}`
    : quote.status === "Declined"
      ? "This quote was declined"
      : undefined;

  /**
   * A quote that has already been billed is finished as a document — the
   * invoice is the live record from then on, and editing the quote behind it
   * would leave the two saying different things about the same work.
   */
  const editReason = quote.convertedInvoice
    ? `Converted to ${quote.convertedInvoice} — edit the invoice instead`
    : undefined;

  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell>
        {/* A draft was never issued, so there is nothing to download and
            nothing a batch should do to it — it's deleted from its own row. */}
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          disabled={quote.status === "Draft"}
          aria-label={
            quote.status === "Draft"
              ? `${quote.number} is a draft and can't be selected`
              : `Select ${quote.number}`
          }
        />
      </TableCell>
      <TableCell className={HUG_COLUMN}>
        <p className="font-medium tabular">
          <Highlight text={quote.number} query={query} />
        </p>
        {quote.description && (
          <p className="max-w-[22ch] truncate text-xs text-muted-foreground">
            {quote.description}
          </p>
        )}
        {quote.convertedInvoice && (
          <LinkedInvoice
            number={quote.convertedInvoice}
            invoice={linkedInvoice}
            onEdit={onEditInvoice}
          />
        )}
      </TableCell>
      {/*
        The caps are what let this column hug. `truncate` alone can't shorten
        anything without a width to truncate against, so on a content-sized
        column it just reports the longest name in the list as the width it
        needs — and the longest email is wider still. In `ch` rather than pixels
        so it tracks the type, as the description above and the Invoices row's
        client line both do.
      */}
      <TableCell className={cn(HUG_COLUMN, "text-center")}>
        <p className="mx-auto max-w-[24ch] truncate">
          <Highlight text={client} query={query} />
        </p>
        {clientEmail && (
          <p className="mx-auto max-w-[24ch] truncate text-xs text-muted-foreground">
            {clientEmail}
          </p>
        )}
      </TableCell>
      <TableCell
        className={cn(
          HUG_COLUMN,
          "text-center text-muted-foreground tabular",
        )}
      >
        {formatInvoiceDate(quote.issued)}
      </TableCell>
      {/* Expiry stays neutral — the design reserves colour for the status. */}
      <TableCell
        className={cn(
          HUG_COLUMN,
          "text-center text-muted-foreground tabular",
        )}
      >
        {formatInvoiceDate(quote.expiry)}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center tabular")}>
        {deposit === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            {formatDocumentMoney(deposit, quote.currency)}
            {/* The terms, not just the figure: 30% of a revised quote is a
                different number, and the row should say which it was. */}
            {quote.deposit?.mode === "percent" && (
              <span className="block text-xs text-muted-foreground">
                {quote.deposit.value}% up front
              </span>
            )}
          </>
        )}
      </TableCell>
      {/* HUG_COLUMN goes on the header and every cell in the column — a column
          is as wide as its widest member, so one cell left off undoes it. */}
      <TableCell className={cn(HUG_COLUMN, "text-center")}>
        <QuoteStatusCell quote={quote} status={status} />
      </TableCell>
      <TableCell
        className={cn(HUG_COLUMN, "text-center font-medium tabular")}
      >
        {formatDocumentMoney(quoteAmount(quote), quote.currency)}
        {/* The books are in AUD, so a foreign quote says what it's worth here
            as well as what the client was quoted. */}
        {isForeignQuote(quote) && (
          <span className="block text-xs font-normal text-muted-foreground">
            {formatDocumentMoney(quoteAmountAud(quote), baseCurrency)} {baseCurrency}
          </span>
        )}
      </TableCell>
      <TableCell className={HUG_COLUMN}>
        {/*
          The two actions a quote row is most often opened for, in front of the
          menu that still holds the rest. `gap-0.5` because they're one cluster:
          spaced any wider they read as three unrelated controls.

          Sending is out here rather than converting. Converting only applies to
          an accepted quote that isn't already an invoice, which is a minority of
          any list — an icon that's greyed out on most rows costs a column of
          attention and gives nothing back, so it went to the menu where a
          disabled row is cheap. Sending is live on anything still with the
          client, which is most of what a list is.
        */}
        <div className="flex items-center justify-end gap-0.5">
          <RowIconButton
            icon={<Pencil />}
            label={`Edit ${quote.number}`}
            href={editReason ? undefined : `/quotes/${quote.id}`}
            disabledReason={editReason}
          />
          <RowIconButton
            icon={<Send />}
            // The same wording the menu used: "again" is only true of a quote
            // that has actually gone out once.
            label={
              quote.status === "Sent"
                ? `Send ${quote.number} again`
                : `Send ${quote.number} to ${client}`
            }
            onClick={onSend}
            disabledReason={sendReason}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for ${quote.number}`}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            {/*
              View actions, then the ones that make something new, then Delete on
              its own. Edit and Send aren't here: they're the row's inline buttons
              now, and keeping them in both places would be two ways to reach the
              same thing with no way to tell which one someone had used.
            */}
            <DropdownMenuContent align="end" className="w-52">
              <MenuAction icon={<Eye />} label="View" onSelect={onView} />
              <MenuAction
                icon={<History />}
                label="History"
                onSelect={onHistory}
              />
              <DropdownMenuSeparator />
              <MenuAction
                icon={<FilePlus2 />}
                label={converting ? "Converting…" : "Convert to invoice"}
                onSelect={onConvert}
                disabledReason={converting ? "Converting…" : convertReason}
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
 * Stands in for the real table while the list's fetch is still out — same
 * header, same column alignment, so nothing shifts when the rows land.
 */
/**
 * The status, with when it was sent or saved in the tooltip. A quote finalised
 * with "Save" and never emailed reads "Saved" — see `quoteDisplayStatus`.
 */
function QuoteStatusCell({
  quote,
  status,
}: {
  quote: Quote;
  status: QuoteDisplayStatus;
}) {
  const draft = quote.status === "Draft";
  const sent = quote.sentAt
    ? `Sent ${formatInvoiceDate(quote.sentAt)}`
    : draft
      ? "Not sent yet"
      : quote.savedAt
        ? `Saved ${formatInvoiceDate(quote.savedAt)}, not sent to the client`
        : "Saved, not sent to the client";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A div rather than a span: Badge renders a div, and Radix needs a
              ref on the trigger, which Badge doesn't forward. */}
          <div className="mx-auto w-fit">
            <Badge variant={quoteStatusVariant(status)}>
              {status}
              <span className="sr-only">, {sent}</span>
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-[16rem]">
          <p className="tabular">{sent}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function QuotesTableSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      aria-hidden
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[44px]" />
            <TableHead className={HUG_COLUMN}>Quote #</TableHead>
            <TableHead className={cn(HUG_COLUMN, "text-center")}>
              Client
            </TableHead>
            <TableHead className={cn(HUG_COLUMN, "text-center")}>
              Quote date
            </TableHead>
            <TableHead className={cn(HUG_COLUMN, "text-center")}>
              Expiry
            </TableHead>
            <TableHead className={cn(HUG_COLUMN, "text-center")}>
              Deposit
            </TableHead>
            <TableHead className={cn(HUG_COLUMN, "text-center")}>
              Status
            </TableHead>
            <TableHead className={cn(HUG_COLUMN, "text-center")}>
              Amount
            </TableHead>
            <TableHead className={cn(HUG_COLUMN, "text-right")}>
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, index) => (
            <TableRow key={`skeleton-${index}`}>
              <TableCell>
                <Shimmer className="size-4 rounded-sm" />
              </TableCell>
              <TableCell>
                <Shimmer className="h-4 w-20" />
                <Shimmer className="mt-1.5 h-3 w-28" />
              </TableCell>
              <TableCell className="text-center">
                <Shimmer className="mx-auto h-4 w-24" />
                <Shimmer className="mx-auto mt-1.5 h-3 w-28" />
              </TableCell>
              <TableCell className="text-center">
                <Shimmer className="mx-auto h-4 w-20" />
              </TableCell>
              <TableCell className="text-center">
                <Shimmer className="mx-auto h-4 w-20" />
              </TableCell>
              <TableCell className="text-center">
                <Shimmer className="mx-auto h-4 w-16" />
              </TableCell>
              <TableCell className="text-center">
                <Shimmer className="mx-auto h-5 w-20 rounded-full" />
              </TableCell>
              <TableCell className="text-center">
                <Shimmer className="mx-auto h-4 w-20" />
              </TableCell>
              <TableCell>
                <Shimmer className="ml-auto h-8 w-20 rounded-md" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The invoice a converted quote became.
 *
 * A badge under the reference rather than a column of its own: it belongs to
 * the quote's identity, and only some quotes have one — a column would be
 * mostly dashes. The tooltip carries what you'd otherwise have to leave the
 * page to find out, and the badge itself goes there.
 */
function LinkedInvoice({
  number,
  invoice,
  onEdit,
}: {
  number: string;
  invoice: Invoice | null;
  onEdit: (invoiceId: string) => void;
}) {
  const badge = (
    <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-xs font-medium tabular">
      <FileText className="size-3 text-muted-foreground" aria-hidden />
      {number}
    </span>
  );

  // Deleted, or never on this book: the reference is still the truth about the
  // quote, so it stays — but it can't pretend to lead anywhere.
  if (!invoice) {
    return <span className="block text-muted-foreground">{badge}</span>;
  }

  const total = invoiceAmount(invoice);
  const paid = invoice.paidAmount;
  const payment =
    paid <= 0
      ? "Unpaid"
      : paid >= total - 0.005
        ? "Paid in full"
        : `${invoiceMoney(paid)} of ${invoiceMoney(total)} paid`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Opens the invoice in place. The full editor is a click away
              inside it, for the parts the modal doesn't carry. */}
          <button
            type="button"
            onClick={() => onEdit(invoice.id)}
            className="block w-fit rounded-md outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Edit invoice ${number}`}
          >
            {badge}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[16rem] space-y-1">
          <p className="font-medium tabular">{invoice.number}</p>
          <p className="tabular">
            {formatInvoiceDate(invoice.issued)} · {invoiceMoney(total)}
          </p>
          {/* A div, not a p: Badge renders a div, and nesting one inside a
              paragraph is invalid markup React will refuse to hydrate. */}
          <div>
            <Badge variant={statusVariant(invoice.status)}>
              {invoice.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">{payment}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
