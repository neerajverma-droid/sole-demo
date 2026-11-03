"use client";

import { useCountryContext } from "@/hooks/use-country-context";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  Copy,
  CreditCard,
  Download,
  Eye,
  FileText,
  History,
  Link2,
  MailX,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Receipt,
  Repeat,
  Search,
  SearchX,
  Send,
  Star,
  Trash2,
  Undo2,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";

import { AiMatchButton } from "@/components/ui/ai-match-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyActions,
  EmptyCue,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MenuAction } from "@/components/ui/menu-action";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { Shimmer } from "@/components/ui/shimmer";
import { Highlight } from "@/components/contacts/highlight";
import { SendSurveyDialog } from "@/components/reputation/send-survey-dialog";
import {
  EMPTY_INVOICE_FILTERS,
  InvoicesFiltersPopover,
  activeFilterCount,
  resolveInvoiceFilters,
  type InvoiceFilterDraft,
} from "@/components/invoices/invoices-filters";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useCompletedNpsReferencesQuery,
  useInvalidateReputation,
  useReputationSurveysQuery,
} from "@/hooks/use-reputation-query";
import { contactDisplayName } from "@/lib/contacts";
import { isReferenceNpsCompleted } from "@/lib/reputation";
import {
  attachInvoiceIdAtom,
  cashPaymentInvoiceIdAtom,
  deleteInvoiceIdsAtom,
  historyInvoiceIdAtom,
  invoicesPageSizeAtom,
  invoicesQueryAtom,
  invoicesTabAtom,
  matchInvoiceIdAtom,
  stopRecurringInvoiceIdAtom,
  unmatchInvoiceIdAtom,
  viewInvoiceIdAtom,
} from "@/lib/atoms";
import type { PageInfo } from "@/lib/products";
import {
  INVOICE_TABS,
  OUTSTANDING_STATUSES,
  dueDateClass,
  fetchInvoicePdfBlob,
  fetchInvoiceStatusCounts,
  fetchInvoicesPage,
  formatDocumentMoney,
  formatInvoiceDate,
  invoiceAmount,
  invoiceDepositAmount,
  invoiceDocumentAmount,
  invoiceDocumentOutstanding,
  invoiceOutstanding,
  isForeignCurrency,
  markInvoiceSentApi,
  savePdfBlob,
  sendInvoicePaidReceiptApi,
  sendInvoiceReminderApi,
  statusVariant,
  undoInvoicePaidWithCashApi,
  type Invoice,
  type InvoiceListFilters,
  type InvoiceTab,
} from "@/lib/invoices";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { linkedTransaction, type Transaction } from "@/lib/transactions";
import { creditNoteFor, formatRefundAmount, type Refund } from "@/lib/refunds";
import {
  AreaFilterChip,
  useAreaFilter,
} from "@/components/documents/area-filter";
import { areaPredicate } from "@/lib/customer-areas";
import { cn } from "@/lib/utils";
import { useContactsStore } from "@/stores/contacts";
import { useRefundsStore } from "@/stores/refunds";
import { useTransactionsStore } from "@/stores/transactions";

export function InvoicesTable() {
  const { country } = useCountryContext();
  const router = useRouter();
  const contacts = useContactsStore((state) => state.contacts);
  const area = useAreaFilter();
  const [tab, setTab] = useAtom(invoicesTabAtom);
  const [query, setQuery] = useAtom(invoicesQueryAtom);
  const setDeleteIds = useSetAtom(deleteInvoiceIdsAtom);
  const setMatchId = useSetAtom(matchInvoiceIdAtom);
  const setUnmatchId = useSetAtom(unmatchInvoiceIdAtom);
  const refunds = useRefundsStore((state) => state.refunds);
  const transactions = useTransactionsStore((state) => state.transactions);
  const queryClient = useQueryClient();

  const refreshInvoices = () =>
    queryClient.invalidateQueries({ queryKey: ["invoices"] });

  const undoPaidWithCash = async (invoice: Invoice) => {
    try {
      await undoInvoicePaidWithCashApi(invoice.id);
      await refreshInvoices();
      toast.success(`${invoice.number} marked as unpaid`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Couldn't undo the payment on ${invoice.number}.`,
      );
    }
  };

  const sendPaidReceipt = async (invoice: Invoice) => {
    try {
      await sendInvoicePaidReceiptApi(invoice.id);
      toast.success(`Paid receipt sent for ${invoice.number}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't send the paid receipt.",
      );
    }
  };

  /** Straight to disk — no preview step, the real PDF fetched and saved directly. */
  const downloadPdf = (invoice: Invoice) => {
    toast.promise(
      fetchInvoicePdfBlob(invoice, invoice.status === "Paid").then((blob) =>
        savePdfBlob(blob, `${invoice.number || "invoice"}.pdf`),
      ),
      {
        loading: `Preparing ${invoice.number}…`,
        success: `${invoice.number} downloaded`,
        error: (error) =>
          error instanceof Error
            ? error.message
            : "Couldn't download that PDF.",
      },
    );
  };

  const markSent = async (invoice: Invoice) => {
    try {
      await markInvoiceSentApi(invoice.id);
      // The other way an invoice becomes sent — the editor's "send" mode is
      // the first. Both carry the value, so the two routes add up rather than
      // being two different numbers.
      track(EVENTS.INVOICE_SENT, {
        amount: invoiceAmount(invoice),
        // `amount` is in the books' currency, so that is the currency to report it in.
        currency: invoice.baseCurrency ?? country.currency,
        source: "list_action",
      });
      await refreshInvoices();
      toast.success(`${invoice.number} marked as sent`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Couldn't mark ${invoice.number} as sent.`,
      );
    }
  };

  /*
   * Ephemeral, and only ever acted on where it overlaps the rows on screen: a
   * tab or a search that hides a selected invoice shouldn't leave it queued for
   * an action nobody can see.
   */
  const [selected, setSelected] = React.useState<string[]>([]);
  const setViewId = useSetAtom(viewInvoiceIdAtom);
  const setAttachId = useSetAtom(attachInvoiceIdAtom);
  const setHistoryId = useSetAtom(historyInvoiceIdAtom);
  const setCashPaymentId = useSetAtom(cashPaymentInvoiceIdAtom);
  const setStopRecurringId = useSetAtom(stopRecurringInvoiceIdAtom);

  const [npsInvoice, setNpsInvoice] = React.useState<Invoice | null>(null);
  const surveysQuery = useReputationSurveysQuery(!!npsInvoice);
  const completedNpsQuery = useCompletedNpsReferencesQuery();
  const invalidateReputation = useInvalidateReputation();

  const contactsById = React.useMemo(
    () => new Map(contacts.map((entry) => [entry.id, entry])),
    [contacts],
  );

  // The name comes from Contacts while the contact exists; the invoice's own
  // snapshot is the fallback once it's deleted.
  const clientName = (invoice: Invoice) => {
    const contact = invoice.clientId ? contactsById.get(invoice.clientId) : undefined;
    return contact ? contactDisplayName(contact) : invoice.clientName;
  };
  const clientEmail = (invoice: Invoice) =>
    (invoice.clientId ? contactsById.get(invoice.clientId)?.email : undefined) ?? "";

  /*
   * The row search box types faster than anyone wants a request fired, so the
   * server only ever sees it once typing has settled. Highlighting the match
   * still reads the live value — there's nothing stale about drawing a
   * yellow box around text that's already on screen.
   */
  const debouncedQuery = useDebouncedValue(query, 350);

  const [advanced, setAdvanced] = React.useState<InvoiceFilterDraft>(
    EMPTY_INVOICE_FILTERS,
  );
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = useAtom(invoicesPageSizeAtom);

  /*
   * The area deep-link and the advanced filter's own client picker are the
   * same underlying idea — narrow to a set of clients — so they resolve to
   * one `clientIds` list rather than being two mechanisms the query has to
   * reconcile. The area wins when both are somehow active, since it's the
   * one that arrived by link and names itself on screen.
   */
  const inArea = areaPredicate(area, contacts);
  const areaClientIds = area
    ? contacts.filter((contact) => inArea(contact.id)).map((contact) => contact.id)
    : null;
  const effectiveClientIds =
    areaClientIds ?? (advanced.clientIds.length > 0 ? advanced.clientIds : undefined);

  const listFilters: InvoiceListFilters = {
    status: tab,
    search: debouncedQuery,
    clientIds: effectiveClientIds,
    ...resolveInvoiceFilters(advanced),
  };
  // Every value the query result actually depends on — the object itself is
  // rebuilt each render, so its *content* is what has to drive the cache key
  // and the page-1 reset below, not its identity.
  const filterKey = JSON.stringify(listFilters);

  const pageQuery = useQuery({
    queryKey: ["invoices", "list", page, pageSize, filterKey],
    queryFn: () => fetchInvoicesPage(page, pageSize, listFilters),
    placeholderData: keepPreviousData,
  });

  const rows = pageQuery.data?.invoices ?? [];
  const total = pageQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageInfo: PageInfo = {
    page: currentPage,
    pageCount,
    total,
    from: total === 0 ? 0 : (currentPage - 1) * pageSize + 1,
    to: Math.min(currentPage * pageSize, total),
  };

  /*
   * True on the very first load, and for as long as a tab, search, filter or
   * page change is still in flight. `keepPreviousData` leaves the previous
   * page's rows sitting in `pageQuery.data` while the new request is out —
   * without this, that stale page would flash on screen under the filter
   * that just replaced it instead of a shimmer saying a fresh page is coming.
   */
  const rowsLoading = pageQuery.isLoading || pageQuery.isPlaceholderData;

  const previousFilterKey = React.useRef(filterKey);
  React.useEffect(() => {
    if (previousFilterKey.current === filterKey) return;
    previousFilterKey.current = filterKey;
    setPage(1);
    setSelected([]);
  }, [filterKey]);

  /*
   * A real server-side aggregate, across the whole account rather than
   * whatever page (or the 200-row cap `fetchInvoices` itself carries)
   * happens to be cached client-side — a tab has to say how many invoices
   * are in it regardless of which page or filter the list is showing.
   * Scoped to the same client ids an area deep-link narrows the rows to, so
   * a tab count next to an area-scoped list still describes that scope.
   */
  const countsQuery = useQuery({
    queryKey: ["invoices", "status-counts", areaClientIds?.join(",") ?? null],
    queryFn: () => fetchInvoiceStatusCounts(areaClientIds ?? undefined),
  });
  const counts = countsQuery.data;

  const selectedRows = rows.filter((invoice) => selected.includes(invoice.id));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const unpaidSelected = selectedRows.filter(
    (invoice) => invoiceOutstanding(invoice) > 0,
  );
  const filtered =
    tab !== "All" || activeFilterCount(advanced) > 0 || !!area;
  const clearFilters = () => {
    setQuery("");
    setAdvanced(EMPTY_INVOICE_FILTERS);
  };

  /*
   * No invoices at all — rather than a tab, search or filter that matched
   * nothing — so the tabs, search and pager have nothing to act on: just the
   * empty state, same as the rules table. Both search values count, so a
   * search still settling never collapses the toolbar mid-keystroke, and an
   * errored fetch never lands here.
   */
  const searching = !!query.trim() || !!debouncedQuery.trim();
  if (
    !rowsLoading &&
    !pageQuery.isError &&
    !filtered &&
    !searching &&
    total === 0
  ) {
    return (
      <EmptyState
        searching={false}
        filtered={false}
        tab={tab}
        onClear={clearFilters}
      />
    );
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
        {/* Six tabs with counts run to about 600px. On a phone they scroll
            sideways inside the row rather than pushing past the screen edge,
            which also kept the tour's spotlight half off-screen. */}
        <Tabs
          data-usertour="invoice-status-tabs"
          className="max-w-full overflow-x-auto"
          value={tab}
          onValueChange={(value) => setTab(value as InvoiceTab)}
        >
          <TabsList>
            {INVOICE_TABS.map((option) => (
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

        <div
          className="flex flex-wrap items-center gap-2"
          data-usertour="invoice-search-filters"
        >
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search invoices"
              aria-label="Search invoices"
              className="pl-9"
            />
          </div>
          <InvoicesFiltersPopover
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
            {selectedRows.length === 1 ? "invoice" : "invoices"} selected
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear
            </Button>
            {/*
              The cash-paid endpoint only takes one invoice at a time — until
              there's a real bulk endpoint, this stays honest rather than
              faking a multi-invoice settle locally.
            */}
            <Button
              variant="outline"
              size="sm"
              disabled={unpaidSelected.length === 0}
              onClick={() =>
                toast(
                  "Marking several invoices as paid at once is coming soon",
                  {
                    description:
                      "For now, mark each one as paid from its own row.",
                  },
                )
              }
            >
              <CreditCard />
              Mark as paid
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteIds(selectedRows.map((i) => i.id))}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        </div>
      )}

      {rowsLoading ? (
        <InvoicesTableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          searching={!!query.trim()}
          filtered={filtered}
          tab={tab}
          onClear={clearFilters}
        />
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
                      onCheckedChange={() =>
                        setSelected(
                          allSelected ? [] : rows.map((invoice) => invoice.id),
                        )
                      }
                      aria-label={
                        allSelected
                          ? "Clear selection"
                          : "Select all invoices on this page"
                      }
                    />
                  </TableHead>
                  {/* Invoice stays left (it's what's being scanned for), Actions
                      stays right (it's reached for), and everything between
                      reads as a centered column of its own. */}
                  <TableHead>Invoice</TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-center")}>
                    Due
                  </TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-center")}>
                    Deposit
                  </TableHead>
                  <TableHead className="text-center">Amount</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-center")}>
                    Match
                  </TableHead>
                  <TableHead className={cn(HUG_COLUMN, "text-right")}>
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((invoice) => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
                    client={clientName(invoice)}
                    query={query}
                    selected={selected.includes(invoice.id)}
                    onSelect={() =>
                      setSelected((current) =>
                        current.includes(invoice.id)
                          ? current.filter((entry) => entry !== invoice.id)
                          : [...current, invoice.id],
                      )
                    }
                    matched={linkedTransaction(invoice, transactions)}
                    suggestions={invoice.possibleMatch}
                    creditNote={creditNoteFor(invoice.id, refunds)}
                    onMatch={() => setMatchId(invoice.id)}
                    onUnmatch={() => setUnmatchId(invoice.id)}
                    onMarkPaid={() => setCashPaymentId(invoice.id)}
                    onUndoPaid={() => undoPaidWithCash(invoice)}
                    onMarkSent={() => markSent(invoice)}
                    onView={() => setViewId(invoice.id)}
                    onHistory={() => setHistoryId(invoice.id)}
                    onPrint={() => downloadPdf(invoice)}
                    onAttach={() => setAttachId(invoice.id)}
                    onSendPaidReceipt={() => sendPaidReceipt(invoice)}
                    onStopRecurring={() =>
                      setStopRecurringId({
                        id: invoice.id,
                        number: invoice.number,
                      })
                    }
                    // Opens a fresh invoice prefilled from this one. The
                    // editor loads the real record and works out on its own
                    // whether the copy is an NDIS claim, so one route serves
                    // both kinds.
                    onDuplicate={() =>
                      router.push(
                        `/invoices/new/general?duplicate=${invoice.id}`,
                      )
                    }
                    onDelete={() => setDeleteIds([invoice.id])}
                    onSendNps={() => setNpsInvoice(invoice)}
                    npsCompleted={isReferenceNpsCompleted(completedNpsQuery.data, invoice.id, invoice.number)}
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
              setPageSize(next as typeof pageSize);
              setPage(1);
            }}
            itemLabel="invoice"
            navLabel="Invoices pages"
          />
        </>
      )}

      <SendSurveyDialog
        open={!!npsInvoice}
        onOpenChange={(open) => !open && setNpsInvoice(null)}
        surveys={surveysQuery.data ?? []}
        surveysLoading={surveysQuery.isPending}
        onSent={() => {
          void invalidateReputation("feedbacks");
          void completedNpsQuery.refetch();
        }}
        initialClient={
          npsInvoice
            ? {
                clientId: npsInvoice.clientId ?? "",
                contactId: null,
                name: clientName(npsInvoice),
                email: clientEmail(npsInvoice),
              }
            : null
        }
        referenceId={npsInvoice?.id ?? null}
        referenceName={npsInvoice?.number}
      />
    </div>
  );
}

/**
 * One invoice, as few marks on the page as the row can be read with.
 *
 * The columns it used to have — issued date, client, balance due, sent, match
 * and credit note, each with its own header — asked you to read thirteen cells
 * to learn six things. What's left is the six: which invoice and whose, when
 * it's due, what it's worth, where it stands, and what you can do about it.
 * Everything folded away is still on the row, attached to the figure it
 * qualifies rather than parked in a column of its own.
 */
function InvoiceRow({
  invoice,
  client,
  query,
  selected,
  onSelect,
  matched,
  suggestions,
  creditNote,
  onMatch,
  onUnmatch,
  onMarkPaid,
  onUndoPaid,
  onMarkSent,
  onView,
  onHistory,
  onPrint,
  onAttach,
  onDuplicate,
  onDelete,
  onSendPaidReceipt,
  onStopRecurring,
  onSendNps,
  npsCompleted,
}: {
  invoice: Invoice;
  client: string;
  query: string;
  selected: boolean;
  onSelect: () => void;
  /** The bank transaction it's reconciled against, once it is. */
  matched: Transaction | null;
  /** How many candidates the feed has for it, which decides the variant. */
  suggestions: number;
  creditNote: Refund | undefined;
  onMatch: () => void;
  onUnmatch: () => void;
  onMarkPaid: () => void;
  /** Reverses a cash payment — only ever offered on one settled that way. */
  onUndoPaid: () => void;
  onMarkSent: () => void;
  onView: () => void;
  onHistory: () => void;
  onPrint: () => void;
  onAttach: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSendPaidReceipt: () => void;
  onStopRecurring: () => void;
  onSendNps: () => void;
  /** Whether an NPS response is already in for this invoice. */
  npsCompleted: boolean;
}) {
  /**
   * Two totals, not one: the books' own figure in AUD, and what the client
   * was actually billed, in their own currency. For a plain AUD invoice
   * they're the same number — `invoiceDocumentAmount` falls back to
   * `invoiceAmount` whenever there's no separate `exchange_total` to read.
   */
  const amountAud = invoiceAmount(invoice);
  const documentAmount = invoiceDocumentAmount(invoice);
  const outstanding = invoiceOutstanding(invoice);
  const documentOutstanding = invoiceDocumentOutstanding(invoice);
  const paid = invoice.status === "Paid" || outstanding <= 0;
  const deposit = invoiceDepositAmount(invoice);
  // The books' currency this invoice was saved in. One from before it was recorded
  // was in the business's own currency — a business never changes country.
  const { country } = useCountryContext();
  const baseCurrency = invoice.baseCurrency ?? country.currency;
  const foreign = isForeignCurrency(invoice.currency, baseCurrency);
  const draft = invoice.status === "Draft";
  /**
   * The balance only earns a line where it says something the amount doesn't.
   * Unpaid, the two are the same number twice; settled, the Paid pill has
   * already said it. Part-paid is the one case worth a second figure.
   */
  const partPaid = outstanding > 0 && outstanding < amountAud;
  /**
   * A reminder is for an invoice the client has and hasn't paid. Nothing to
   * remind them of on a paid one, and a draft hasn't been sent to remind about.
   */
  const reminderReason = paid
    ? "This invoice is paid"
    : draft
      ? "Send the invoice before reminding the client"
      : undefined;

  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          aria-label={`Select ${invoice.number}`}
        />
      </TableCell>
      {/* Number and client in one cell: they're one answer to "which invoice",
          and the search matches on both, so Highlight still lands. */}
      <TableCell>
        <p className="flex items-center gap-1.5 font-medium tabular">
          <Highlight text={invoice.number} query={query} />
          {/* Same marker sole-webapp puts on the number: this one raises
              copies of itself on a schedule (stoppable from the menu). */}
          {invoice.isRecurring && (
            <Badge
              variant="outline"
              className="gap-1 border-primary/30 bg-primary/[0.06] px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-primary"
              title="Recurring invoice — raises new copies on a schedule"
            >
              <Repeat className="size-3" aria-hidden />
              Recurring
            </Badge>
          )}
        </p>
        <p className="max-w-[24ch] truncate text-xs text-muted-foreground">
          <Highlight text={client} query={query} />
        </p>
      </TableCell>
      {/* The Due column keeps status colour; other dates stay muted. */}
      <TableCell
        className={cn(
          HUG_COLUMN,
          "text-center tabular",
          dueDateClass(invoice.status),
        )}
      >
        {formatInvoiceDate(invoice.due)}
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center tabular")}>
        {deposit !== null ? (
          <>
            {formatDocumentMoney(deposit, invoice.currency)}
            {/* The terms, not just the figure: 30% of a revised invoice is a
                different number, and the row should say which it was. */}
            {invoice.deposit?.mode === "percent" && (
              <span className="block text-xs text-muted-foreground">
                {invoice.deposit.value}% up front
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      {/* One money cell. What the invoice is worth, and beneath it only the
          figures that qualify it: the base-currency equivalent where the client was
          billed in something else, and the balance where part of it has been
          paid. The books are in the business's own currency, so a foreign invoice says what it's worth
          here as well as what the client was billed. */}
      <TableCell className="text-center tabular">
        <div className="flex items-center justify-center gap-1.5">
          {creditNote && <CreditNoteChip note={creditNote} />}
          <span className="font-medium">
            {formatDocumentMoney(documentAmount, invoice.currency)}
          </span>
        </div>
        {foreign && (
          <span className="block text-xs text-muted-foreground">
            {formatDocumentMoney(amountAud, baseCurrency)} {baseCurrency}
          </span>
        )}
        {partPaid && (
          <span className="block text-xs text-muted-foreground">
            {formatDocumentMoney(documentOutstanding, invoice.currency)} due
          </span>
        )}
      </TableCell>
      <TableCell className="text-center">
        <StatusCell invoice={invoice} matched={matched} />
      </TableCell>
      <TableCell className={cn(HUG_COLUMN, "text-center")}>
        <MatchCell
          invoice={invoice}
          matched={matched}
          suggestions={suggestions}
          onMatch={onMatch}
        />
      </TableCell>
      <TableCell className={HUG_COLUMN}>
        <div className="flex items-center justify-end gap-1.5">
          {/* The one thing people come to this list to do, out of the menu and
              onto the row. */}
          {!paid && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={onMarkPaid}
            >
              <Check />
              Mark as paid
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for ${invoice.number}`}
              >
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            {/* View actions, then edit actions, then Delete on its own. */}
            <DropdownMenuContent align="end" className="w-52">
              <MenuAction icon={<Eye />} label="View" onSelect={onView} />
              <MenuAction
                icon={<History />}
                label="Invoice history"
                onSelect={onHistory}
              />
              {/* The match action in full, whichever way round it is. The row's
                  AI Match button is a shortcut past this, not the only route.
                  A draft or a settled invoice has nothing left to reconcile —
                  the same rule the Match column follows — so matching is
                  disabled on those, with the reason. */}
              {matched ? (
                <MenuAction
                  icon={<Unlink />}
                  label="Unmatch"
                  onSelect={onUnmatch}
                />
              ) : (
                <MenuAction
                  icon={<Link2 />}
                  label="Match to transaction"
                  onSelect={onMatch}
                  disabledReason={
                    draft
                      ? "Finalise the invoice before matching it"
                      : paid
                        ? "Already paid in full"
                        : undefined
                  }
                />
              )}
              <MenuAction
                icon={<Download />}
                label="Download PDF"
                onSelect={onPrint}
              />
              <DropdownMenuSeparator />
              <MenuAction
                icon={<Pencil />}
                label="Edit"
                href={`/invoices/${invoice.id}`}
              />
              <MenuAction
                icon={<Paperclip />}
                label="Add attachment"
                onSelect={onAttach}
              />
              <MenuAction
                icon={<Send />}
                label="Mark as sent"
                onSelect={onMarkSent}
                disabledReason={
                  invoice.sentAt
                    ? `Sent on ${formatInvoiceDate(invoice.sentAt)}`
                    : undefined
                }
              />
              <MenuAction
                icon={<Send />}
                label="Send reminder"
                onSelect={async () => {
                  try {
                    await sendInvoiceReminderApi(invoice.id);
                    toast.success(`Reminder sent to ${client}`);
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Couldn't send the reminder.",
                    );
                  }
                }}
                disabledReason={reminderReason}
              />
              {/* Only a cash settlement has anything to undo here — one paid
                  by a matched bank transaction is undone by unmatching it. */}
              {invoice.status === "Paid" && invoice.paidWithCash && (
                <MenuAction
                  icon={<Undo2 />}
                  label="Undo paid with cash"
                  onSelect={onUndoPaid}
                />
              )}
              {invoice.status === "Paid" && (
                <MenuAction
                  icon={<Receipt />}
                  label="Send paid receipt"
                  onSelect={onSendPaidReceipt}
                />
              )}
              {invoice.isRecurring && (
                <MenuAction
                  icon={<Ban />}
                  label="Stop recurring"
                  onSelect={onStopRecurring}
                />
              )}
              <MenuAction
                icon={<Copy />}
                label="Duplicate"
                onSelect={onDuplicate}
              />
              <MenuAction
                icon={<Star />}
                label="Send NPS"
                onSelect={onSendNps}
                disabledReason={npsCompleted ? "An NPS response is already in for this invoice" : undefined}
              />
              <DropdownMenuSeparator />
              {/* Money has been received against it, so deleting it would
                  leave that payment with nothing to belong to. */}
              <MenuAction
                icon={<Trash2 />}
                label="Delete"
                onSelect={onDelete}
                destructive
                disabledReason={
                  paid
                    ? "Paid invoices can't be deleted"
                    : partPaid || invoice.status === "Partially paid"
                      ? "Partially paid invoices can't be deleted"
                      : undefined
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Where an invoice stands, in one pill.
 *
 * Sent is not the same question as status, and the gap between them is the one
 * worth catching: an invoice can be finalised, outstanding and counting towards
 * what you're owed while the client has never seen it. That gap used to cost a
 * column on every row to report on the rows where there is no gap. Here the
 * pill carries the status, the tooltip carries the date it went out, and only a
 * finalised invoice that hasn't been sent picks up a mark — the one case where
 * the two disagree.
 *
 * The status word is the invoice's own status, not one re-derived from whether
 * it was sent. Draft is already a status here, and an unsent invoice is not
 * necessarily in it — relabelling an unsent Outstanding invoice as a draft
 * would hide the one row this is for, while the Outstanding tab went on
 * counting it and its money.
 */
function StatusCell({
  invoice,
  matched,
}: {
  invoice: Invoice;
  matched: Transaction | null;
}) {
  const draft = invoice.status === "Draft";
  const unsent = !invoice.sentAt;
  const sent = invoice.sentAt
    ? `Sent ${formatInvoiceDate(invoice.sentAt)}`
    : draft
      ? "Not sent yet"
      : invoice.savedAt
        ? `Saved ${formatInvoiceDate(invoice.savedAt)}, but not sent to the client`
        : "Finalised, but not sent to the client";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A div rather than a span: Badge renders a div, and Radix needs a
              ref on the trigger, which Badge doesn't forward. */}
          <div className="mx-auto w-fit">
            <Badge variant={statusVariant(invoice.status)} className="gap-1">
              {unsent && !draft && <MailX className="size-3" aria-hidden />}
              {invoice.status}
              <span className="sr-only">, {sent}</span>
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-[16rem] space-y-0.5">
          <p className="tabular">{sent}</p>
          {matched && (
            <p className="text-muted-foreground">
              Matched to {matched.description}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Where an invoice stands with the bank feed, in its own column — the same
 * three states sole-webapp's "Match Transaction" column shows, ported onto
 * this app's own reconciliation data rather than its `possible_match` count
 * and `status` string:
 *
 * - Already reconciled (`matched`) — a quiet "Matched" pill, nothing to do.
 * - Nothing to reconcile — a draft, or nothing left owing — a plain dash.
 * - The feed has a candidate (`suggestions > 0`) — the AI Match button.
 * - Otherwise, a sent and still-outstanding invoice — a plain Match button,
 *   same destination, no candidate to promise yet.
 */
function MatchCell({
  invoice,
  matched,
  suggestions,
  onMatch,
}: {
  invoice: Invoice;
  matched: Transaction | null;
  suggestions: number;
  onMatch: () => void;
}) {
  const draft = invoice.status === "Draft";
  const nothingOwing = invoiceOutstanding(invoice) <= 0;

  if (matched) {
    return (
      <Badge variant="success" className="gap-1">
        <Check className="size-3" aria-hidden />
        Matched
      </Badge>
    );
  }

  if (draft || nothingOwing) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  if (suggestions > 0) {
    return <AiMatchButton suggestions={suggestions} onOpen={onMatch} />;
  }

  if (invoice.sentAt && OUTSTANDING_STATUSES.includes(invoice.status)) {
    return (
      <Button variant="outline" size="sm" onClick={onMatch}>
        <Link2 />
        Match
      </Button>
    );
  }

  return <span className="text-sm text-muted-foreground">—</span>;
}

/**
 * The match button, for the rows the feed has a candidate for.
 *
 * Filled and carrying a dot, because there's something waiting that the person
 * can't otherwise see from here. Where the feed has nothing, there's no button
 * at all and Match sits in the menu — a quiet outline button on every unmatched
 * row was asking for work rather than offering it, one row at a time.
 */
/**
 * The credit note, beside the amount it was raised against.
 *
 * A refund is a fact about the money, so it belongs on the money rather than in
 * a column that was blank on all but a handful of rows. Reference only — the
 * figure is a click away on Client refunds, and in the link's spoken name.
 */
function CreditNoteChip({ note }: { note: Refund }) {
  return (
    <Link
      href="/sales/client-refunds"
      aria-label={`Credit note ${note.reference}, ${formatRefundAmount(note)}`}
      className="rounded border border-border bg-muted/60 px-1 py-px text-[10px] font-medium tabular text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {note.reference}
    </Link>
  );
}

/**
 * Stands in for the real table for as long as a page is out — same header,
 * same column alignment, so nothing shifts when the rows land. Shown on the
 * first load and again on every tab, search, filter or page switch, so the
 * table is never left blank while a request that already looks "done" in the
 * network tab is still on its way into `pageQuery`.
 */
function InvoicesTableSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      aria-hidden
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[44px]" />
            <TableHead>Invoice</TableHead>
            <TableHead className={cn(HUG_COLUMN, "text-center")}>
              Due
            </TableHead>
            <TableHead className={cn(HUG_COLUMN, "text-center")}>
              Deposit
            </TableHead>
            <TableHead className="text-center">Amount</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className={cn(HUG_COLUMN, "text-center")}>
              Match
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
                <Shimmer className="h-4 w-24" />
                <Shimmer className="mt-1.5 h-3 w-32" />
              </TableCell>
              <TableCell className={HUG_COLUMN}>
                <Shimmer className="mx-auto h-4 w-16" />
              </TableCell>
              <TableCell className={HUG_COLUMN}>
                <Shimmer className="mx-auto h-4 w-14" />
              </TableCell>
              <TableCell>
                <Shimmer className="mx-auto h-4 w-20" />
              </TableCell>
              <TableCell>
                <Shimmer className="mx-auto h-5 w-20 rounded-full" />
              </TableCell>
              <TableCell className={HUG_COLUMN}>
                <Shimmer className="mx-auto h-5 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <Shimmer className="ml-auto size-8 rounded-full" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyState({
  searching,
  filtered,
  tab,
  onClear,
}: {
  searching: boolean;
  filtered: boolean;
  tab: InvoiceTab;
  onClear: () => void;
}) {
  const title = searching
    ? "No invoices match your search"
    : filtered
      ? `No ${tab.toLowerCase()} invoices`
      : "No invoices yet";

  const body = searching
    ? "Try a different invoice number or client, or clear the search."
    : filtered
      ? "Nothing here right now. Try a different filter or create a new invoice."
      : "Create your first invoice to start tracking payments and due dates.";

  return (
    <Empty>
      <EmptyMedia>
        {searching ? <SearchX aria-hidden /> : <FileText aria-hidden />}
      </EmptyMedia>
      <div className="space-y-1">
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </div>
      {/* Only on the true empty state — a filter that matched nothing needs
          clearing, not encouragement. */}
      {!searching && !filtered && <EmptyCue label="Start here" />}
      <EmptyActions>
        {searching ? (
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear search
          </Button>
        ) : (
          <Button size="sm" asChild>
            <Link href="/invoices/new">New invoice</Link>
          </Button>
        )}
      </EmptyActions>
    </Empty>
  );
}
