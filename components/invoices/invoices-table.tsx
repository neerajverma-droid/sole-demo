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
  DollarSign,
  Download,
  FileText,
  History,
  Link2,
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
  Loader2,
  Undo2,
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
import { useAccess } from "@/hooks/use-access";
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
import {
  ROW_ICON_CLASS,
  RowIconAction,
  SentMark,
  openRowOnClick,
} from "@/components/documents/row-actions";
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
  listedInvoicesAtom,
  matchInvoiceIdAtom,
  stopRecurringInvoiceIdAtom,
  unmatchInvoiceAtom,
  viewInvoiceIdAtom,
} from "@/lib/atoms";
import type { PageInfo } from "@/lib/products";
import {
  INVOICE_TABS,
  invoiceAwaitingPayment,
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
  invoiceEditBlock,
  invoiceOutstanding,
  invoiceUndoAction,
  isForeignCurrency,
  formatRecipientList,
  savePdfBlob,
  sendInvoiceToClientApi,
  sendInvoicePaidReceiptApi,
  sendInvoiceReminderApi,
  statusVariant,
  undoInvoicePaidWithCashApi,
  type Invoice,
  type InvoiceListFilters,
  type InvoiceTab,
} from "@/lib/invoices";
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
  const router = useRouter();
  const contacts = useContactsStore((state) => state.contacts);
  const area = useAreaFilter();
  const [tab, setTab] = useAtom(invoicesTabAtom);
  const [query, setQuery] = useAtom(invoicesQueryAtom);
  const setDeleteIds = useSetAtom(deleteInvoiceIdsAtom);
  const setMatchId = useSetAtom(matchInvoiceIdAtom);
  const setUnmatchInvoice = useSetAtom(unmatchInvoiceAtom);
  const refunds = useRefundsStore((state) => state.refunds);
  const transactions = useTransactionsStore((state) => state.transactions);
  const queryClient = useQueryClient();

  const refreshInvoices = () =>
    queryClient.invalidateQueries({ queryKey: ["invoices"] });

  /** The invoice whose cash payment is being undone, so its row can say so. */
  const [undoingId, setUndoingId] = React.useState<string | null>(null);

  const undoPaidWithCash = async (invoice: Invoice) => {
    if (undoingId) return;
    setUndoingId(invoice.id);
    try {
      await undoInvoicePaidWithCashApi(invoice.id);
      // Held until the list has been fetched again, so the row's spinner stops
      // when the row itself changes rather than when the request returns.
      await refreshInvoices();
      toast.success(`${invoice.number} marked as unpaid`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Couldn't undo the payment on ${invoice.number}.`,
      );
    } finally {
      setUndoingId(null);
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

  /** The invoice being emailed to its client, so a second click can't send it twice. */
  const [sendingId, setSendingId] = React.useState<string | null>(null);

  /*
   * Emails the invoice — most often one finalised with Save & print and never
   * sent — and names every address it went to, so the user knows exactly who
   * has it rather than reading a bare "sent".
   */
  const sendToClient = (invoice: Invoice) => {
    if (sendingId) return;
    setSendingId(invoice.id);
    toast.promise(
      sendInvoiceToClientApi(invoice.id)
        .then(async (recipients) => {
          await refreshInvoices();
          return recipients;
        })
        .finally(() => setSendingId(null)),
      {
        loading: `Sending ${invoice.number}…`,
        success: (recipients) =>
          recipients.length > 0
            ? `${invoice.number} sent to ${formatRecipientList(recipients)}`
            : `${invoice.number} sent to ${clientName(invoice)}`,
        error: (error) =>
          error instanceof Error
            ? error.message
            : `Couldn't send ${invoice.number}.`,
      },
    );
  };

  /*
   * Ephemeral, and only ever acted on where it overlaps the rows on screen: a
   * tab or a search that hides a selected invoice shouldn't leave it queued for
   * an action nobody can see.
   */
  const [selected, setSelected] = React.useState<string[]>([]);
  const setViewId = useSetAtom(viewInvoiceIdAtom);
  const setListedInvoices = useSetAtom(listedInvoicesAtom);
  const setAttachId = useSetAtom(attachInvoiceIdAtom);
  const setHistoryId = useSetAtom(historyInvoiceIdAtom);
  const setCashPaymentId = useSetAtom(cashPaymentInvoiceIdAtom);
  const setStopRecurringId = useSetAtom(stopRecurringInvoiceIdAtom);
  // A login-as session is limited to what its grant names, and bank matching is
  // a plan feature — the old list hid or blocked both before the click.
  const access = useAccess();
  const canEdit = access.can("invoice", "edit");
  const canDelete = access.can("invoice", "delete");
  const matchingIncluded = access.hasFeature("transactions");

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
  // Only when the contact is actually loaded and has no address — a contact
  // that isn't in the store yet (or was deleted) is left to the server to judge.
  const missingClientEmail = (invoice: Invoice) => {
    const contact = invoice.clientId ? contactsById.get(invoice.clientId) : undefined;
    return !!contact && !contact.email?.trim();
  };

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

  // The row dialogs look invoices up here — see listedInvoicesAtom.
  React.useEffect(() => {
    setListedInvoices(pageQuery.data?.invoices ?? []);
  }, [pageQuery.data, setListedInvoices]);

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
  /*
   * Also true while the same page is fetched again — after an undo, a payment,
   * an edit. The rows used to stay on screen through that with nothing to say
   * the list was working, so a refetch now gets the same shimmer as any other
   * load. Nothing refetches on its own (window focus is off app-wide), so this
   * only shows when something actually changed.
   */
  const rowsLoading =
    pageQuery.isLoading || pageQuery.isPlaceholderData || pageQuery.isFetching;

  /*
   * Keep the reader at the pager. They are at the bottom of the list when they
   * press Next or Previous, and the new page is a different height — the
   * skeleton, then the rows — so a scroll position left alone ends up at the
   * top of the list whenever the next page is taller than the last. After a
   * page change the pager is brought back to the bottom of the screen, once
   * for the skeleton and once more when the rows have landed.
   */
  const pagerRef = React.useRef<HTMLDivElement>(null);
  const stayAtPager = React.useRef(false);
  const changePage = (next: number) => {
    stayAtPager.current = true;
    setPage(next);
  };
  React.useLayoutEffect(() => {
    if (!stayAtPager.current) return;
    pagerRef.current?.scrollIntoView({ block: "end" });
    if (!rowsLoading) stayAtPager.current = false;
  }, [page, pageSize, rowsLoading]);

  /*
   * As many shimmer rows as the page will have, not a fixed handful: the
   * skeleton stands in for the rows, so a shorter stand-in shortens the page
   * under a reader who has scrolled down to the pager, and the scroll position
   * is clamped to it. The last page is shorter than the rest, so it says so.
   */
  const skeletonRows =
    total > 0
      ? Math.max(1, Math.min(pageSize, total - (page - 1) * pageSize))
      : pageSize;

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
   * No invoices at all keeps the tabs and search above it: the empty state
   * takes the table's place below rather than the whole section's, so a new
   * account sees the same screen it will once it has invoices — zero counts
   * and all — with "No invoices yet" where the rows will go.
   */

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
        {/* `data-usertour-loading` lets the list tour start the moment the
            first page lands, rather than waiting on the summary's slower
            full-book fetch. While it's set the account may still turn out
            to be empty, and this strip with it. */}
        <Tabs
          data-usertour="invoice-status-tabs"
          data-usertour-loading={rowsLoading || undefined}
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
        <InvoicesTableSkeleton rows={skeletonRows} />
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
                      is right-aligned over its icons, and everything between reads as
                      a centered column of its own. */}
                  <TableHead className="w-[15rem]">Invoice</TableHead>
                  <TableHead className={"whitespace-nowrap text-center"}>
                    Due
                  </TableHead>
                  <TableHead className={"whitespace-nowrap text-center"}>
                    Deposit
                  </TableHead>
                  <TableHead className="text-center">Amount</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className={"whitespace-nowrap text-center"}>
                    Sent
                  </TableHead>
                  <TableHead
                    className={"whitespace-nowrap text-center"}
                    data-usertour="invoice-match-header"
                  >
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
                    onUnmatch={() => setUnmatchInvoice(invoice)}
                    onMarkPaid={() => setCashPaymentId(invoice.id)}
                    onUndoPaid={() => undoPaidWithCash(invoice)}
                    onSendToClient={() => sendToClient(invoice)}
                    sending={sendingId === invoice.id}
                    missingClientEmail={missingClientEmail(invoice)}
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
                    canEdit={canEdit}
                    canDelete={canDelete}
                    matchingIncluded={matchingIncluded}
                    undoing={undoingId === invoice.id}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <div ref={pagerRef}>
            <NumberedPagination
              page={pageInfo}
              pageSize={pageSize}
              onPageChange={changePage}
              onPageSizeChange={(next) => {
                setPageSize(next as typeof pageSize);
                changePage(1);
              }}
              itemLabel="invoice"
              navLabel="Invoices pages"
              keepScrollPosition
            />
          </div>
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
 * The row's Undo, on a paid or partially paid invoice.
 *
 * Offered even where it can't act — a payment settled online, say, has no
 * record here to take back — but disabled with the reason, the same rule the
 * action menu follows, so the row doesn't change shape between invoices.
 */
function UndoPaymentButton({
  action,
  onUndo,
  loading,
}: {
  action: "cash" | "match" | null;
  onUndo: () => void;
  /** An undo is in flight — the button says so and can't be pressed again. */
  loading: boolean;
}) {
  const label = loading
    ? "Undoing…"
    : action === "match"
      ? "Undo bank match"
      : "Undo paid with cash";
  const button = (
    <Button
      variant="ghost"
      size="icon"
      className={ROW_ICON_CLASS}
      disabled={!action || loading}
      onClick={onUndo}
      aria-label={label}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 />}
    </Button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The wrapper takes the hover: a disabled button fires no events. */}
        {action ? button : <span>{button}</span>}
      </TooltipTrigger>
      <TooltipContent className="max-w-56">
        {action
          ? label
          : "This payment wasn't recorded by a cash entry or a bank match, so there is nothing to undo here."}
      </TooltipContent>
    </Tooltip>
  );
}

/** Sent or not, with the reason on hover. */
function SentCell({ invoice }: { invoice: Invoice }) {
  /*
   * Only an invoice made in Sole is expected to have been sent from it. A
   * bulk-uploaded one is history brought in from elsewhere, so it gets no
   * nudge to send it.
   */
  const flagUnsent =
    !invoice.sentAt && invoice.status !== "Draft" && !invoice.bulkUpload;
  return (
    <SentMark
      sent={!!invoice.sentAt}
      summary={sentSummary(invoice)}
      hint={
        flagUnsent
          ? "Use Send to client in the row menu to email it."
          : undefined
      }
    />
  );
}

/** Why a row action is disabled for a login-as session whose grant lacks `edit`. */
const NO_EDIT_ACCESS = "Your access doesn't include editing invoices";

/**
 * One invoice, as few marks on the page as the row can be read with.
 *
 * The columns it used to have — issued date, client, balance due, match and
 * credit note, each with its own header — asked you to read thirteen cells to
 * learn six things. What's left is the essentials: which invoice and whose, when
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
  onSendToClient,
  sending,
  missingClientEmail,
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
  canEdit,
  canDelete,
  matchingIncluded,
  undoing,
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
  /** Emails the invoice to its client and marks it sent. */
  onSendToClient: () => void;
  /** True while this row's invoice is being emailed. */
  sending: boolean;
  /** True when the client's contact is on file with no email to send to. */
  missingClientEmail: boolean;
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
  /** Whether the session's grant allows editing / deleting invoices. */
  canEdit: boolean;
  canDelete: boolean;
  /** Whether the plan includes bank matching (the `transactions` feature). */
  matchingIncluded: boolean;
  /** True while this row's cash payment is being undone. */
  undoing: boolean;
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
  const description = (invoice.description ?? "").trim();
  /** Paid or part paid — where Undo replaces Mark as paid. */
  const settled =
    invoice.status === "Paid" || invoice.status === "Partially paid";
  /** What Undo would do on this row: undo a cash payment, undo a match, or nothing. */
  const undoAction = invoiceUndoAction(invoice);
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

  // Paid or part paid: the thing to do is take a payment back, not record
  // another — Undo stands where Mark as paid would be. Otherwise the same rule
  // as the Match column: not on a draft or a settled invoice. Saved but unsent
  // (Save & Print) still qualifies.
  const primaryAction = !canEdit ? null : settled ? (
    <UndoPaymentButton
      action={undoAction}
      loading={undoing}
      onUndo={undoAction === "cash" ? onUndoPaid : onUnmatch}
    />
  ) : !paid && invoiceAwaitingPayment(invoice, suggestions) ? (
    <RowIconAction
      icon={<DollarSign />}
      label="Mark this invoice as paid with cash"
      onClick={onMarkPaid}
    />
  ) : null;

  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      data-usertour="invoice-row"
      className="cursor-pointer"
      onClick={(event) => openRowOnClick(event, onView)}
    >
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          aria-label={`Select ${invoice.number}`}
        />
      </TableCell>
      {/* Number and client in one cell: they're one answer to "which invoice",
          and the search matches on both, so Highlight still lands. */}
      <TableCell data-usertour="invoice-number">
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
          {/* Hidden stand-in the onboarding tour switches on (globals.css) to
              show what the badge above looks like, on an invoice that isn't
              recurring. */}
          {!invoice.isRecurring && (
            <Badge
              variant="outline"
              className="tour-demo-recurring hidden gap-1 border-primary/30 bg-primary/[0.06] px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-primary"
              aria-hidden
            >
              <Repeat className="size-3" aria-hidden />
              Recurring
            </Badge>
          )}
        </p>
        {/* Client, then the description after a dash. The description is cut
            to what fits and the whole of it is on hover. */}
        <div className="flex max-w-[30ch] items-baseline text-xs text-muted-foreground">
          <span className="max-w-[16ch] shrink-0 truncate">
            <Highlight text={client} query={query} />
          </span>
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Focusable, so the full text is reachable without a mouse. */}
                <span
                  tabIndex={0}
                  className="flex min-w-0 items-baseline outline-none focus-visible:underline"
                >
                  <span className="shrink-0 px-1" aria-hidden>
                    -
                  </span>
                  <span className="min-w-0 truncate">{description}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[20rem] whitespace-pre-line break-words">
                {description}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      {/* The Due column keeps status colour; other dates stay muted. */}
      <TableCell
        className={cn(
          "whitespace-nowrap text-center tabular",
          dueDateClass(invoice.status),
        )}
      >
        {formatInvoiceDate(invoice.due)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-center tabular">
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
      <TableCell className="whitespace-nowrap text-center">
        <SentCell invoice={invoice} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-center">
        <MatchCell
          invoice={invoice}
          matched={matched}
          suggestions={suggestions}
          onMatch={onMatch}
          matchingIncluded={matchingIncluded}
        />
      </TableCell>
      <TableCell className={HUG_COLUMN}>
        <div className="flex items-center justify-end gap-1">
          {/* The one thing people come to this list to do, out of the menu and
              onto the row. An empty slot keeps the other icons in the same
              place on every row, so the Actions header can sit over them. */}
          {primaryAction ?? <span className="size-8" aria-hidden />}
          <RowIconAction
            icon={<Pencil />}
            label="Edit invoice"
            href={`/invoices/${invoice.id}`}
            disabledReason={
              !canEdit ? NO_EDIT_ACCESS : invoiceEditBlock(invoice)
            }
          />
          {/* Opens a fresh invoice prefilled from this one. */}
          <RowIconAction
            icon={<Copy />}
            label="Duplicate invoice"
            onClick={onDuplicate}
          />
          <RowIconAction
            icon={<History />}
            label="Invoice history"
            onClick={onHistory}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(ROW_ICON_CLASS, "data-[state=open]:text-primary")}
                aria-label={`Actions for ${invoice.number}`}
                data-usertour="invoice-actions"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {/* Hidden for now — View (re-add the Eye import to bring it back; clicking the row already opens the preview):
              <MenuAction icon={<Eye />} label="View" onSelect={onView} />
              */}
              {/* Invoice history, Edit and Duplicate now live on the row itself. */}
              {/* Unmatch and Undo paid with cash are the Undo button on the row
                  (UndoPaymentButton), not menu items. */}
              {/* Hidden for now — Match to transaction (the Match column covers it):
              {!matched && (
                <MenuAction
                  icon={<Link2 />}
                  label="Match to transaction"
                  onSelect={onMatch}
                  disabledReason={
                    !matchingIncluded
                      ? "Bank matching isn't part of your plan"
                      : draft
                        ? "Finalise the invoice before matching it"
                        : paid
                          ? "Already paid in full"
                          : undefined
                  }
                />
              )}
              */}
              <MenuAction
                icon={<Download />}
                label="Download PDF"
                onSelect={onPrint}
              />
              <DropdownMenuSeparator />
              <MenuAction
                icon={<Paperclip />}
                label="Add attachment"
                onSelect={onAttach}
                disabledReason={!canEdit ? NO_EDIT_ACCESS : undefined}
              />
              <MenuAction
                icon={sending ? <Loader2 className="animate-spin" /> : <Send />}
                label={sending ? "Sending…" : "Send to client"}
                onSelect={onSendToClient}
                disabledReason={
                  !canEdit
                    ? NO_EDIT_ACCESS
                    : draft
                      ? "Finalise the invoice before sending it"
                      : invoice.sentAt
                        ? `Sent on ${formatInvoiceDate(invoice.sentAt)}`
                        : missingClientEmail
                          ? `Add an email for ${client} before sending`
                          : sending
                            ? "Sending…"
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
                icon={<Star />}
                label="Send NPS"
                onSelect={onSendNps}
                disabledReason={
                  draft
                    ? "Finalise the invoice before sending an NPS survey"
                    : invoice.status === "Outstanding"
                      ? "An NPS survey can be sent once the invoice is paid or overdue"
                      : npsCompleted
                        ? "An NPS response is already in for this invoice"
                        : undefined
                }
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
                  !canDelete
                    ? "Your access doesn't include deleting invoices"
                    : paid
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
 * Sent is not the same question as status — an invoice can be finalised,
 * outstanding and counting towards what you're owed while the client has never
 * seen it — and it has its own column for that. The pill carries the status;
 * when the invoice is matched to a bank transaction, hovering it says which.
 */
function StatusCell({
  invoice,
  matched,
}: {
  invoice: Invoice;
  matched: Transaction | null;
}) {
  const badge = (
    <Badge variant={statusVariant(invoice.status)}>
      {invoice.status}
      <span className="sr-only">, {sentSummary(invoice)}</span>
    </Badge>
  );
  if (!matched) return <div className="mx-auto w-fit">{badge}</div>;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A div rather than a span: Badge renders a div, and Radix needs a
              ref on the trigger, which Badge doesn't forward. */}
          <div className="mx-auto w-fit">{badge}</div>
        </TooltipTrigger>
        <TooltipContent className="max-w-[16rem]">
          Matched to {matched.description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Where an invoice stands with the client, in words: when it went out, or why
 * it hasn't.
 */
function sentSummary(invoice: Invoice): string {
  if (invoice.sentAt) return `Sent ${formatInvoiceDate(invoice.sentAt)}`;
  if (invoice.status === "Draft") return "Not sent yet";
  if (invoice.bulkUpload) return "Imported by bulk upload";
  return invoice.savedAt
    ? `Saved ${formatInvoiceDate(invoice.savedAt)}, but not sent to the client`
    : "Finalised, but not sent to the client";
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
  matchingIncluded,
}: {
  invoice: Invoice;
  matched: Transaction | null;
  suggestions: number;
  onMatch: () => void;
  /** False when the plan has no bank matching — there is then nothing to offer. */
  matchingIncluded: boolean;
}) {
  if (matched) {
    return (
      <Badge variant="success" className="gap-1">
        <Check className="size-3" aria-hidden />
        Matched
      </Badge>
    );
  }

  if (!matchingIncluded || !invoiceAwaitingPayment(invoice, suggestions)) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  if (suggestions > 0) {
    return <AiMatchButton suggestions={suggestions} onOpen={onMatch} />;
  }

  return (
    <Button variant="outline" size="sm" onClick={onMatch}>
      <Link2 />
      Match
    </Button>
  );
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
function InvoicesTableSkeleton({ rows }: { rows: number }) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      aria-hidden
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[44px]" />
            <TableHead className="w-[15rem]">Invoice</TableHead>
            <TableHead className={"whitespace-nowrap text-center"}>
              Due
            </TableHead>
            <TableHead className={"whitespace-nowrap text-center"}>
              Deposit
            </TableHead>
            <TableHead className="text-center">Amount</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className={"whitespace-nowrap text-center"}>
              Sent
            </TableHead>
            <TableHead className={"whitespace-nowrap text-center"}>
              Match
            </TableHead>
            <TableHead className={cn(HUG_COLUMN, "text-right")}>
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, index) => (
            <TableRow key={`skeleton-${index}`}>
              <TableCell>
                <Shimmer className="size-4 rounded-sm" />
              </TableCell>
              <TableCell>
                <Shimmer className="h-4 w-24" />
                <Shimmer className="mt-1.5 h-3 w-32" />
              </TableCell>
              <TableCell>
                <Shimmer className="mx-auto h-4 w-16" />
              </TableCell>
              <TableCell>
                <Shimmer className="mx-auto h-4 w-14" />
              </TableCell>
              <TableCell>
                <Shimmer className="mx-auto h-4 w-20" />
              </TableCell>
              <TableCell>
                <Shimmer className="mx-auto h-5 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <Shimmer className="mx-auto size-4 rounded-full" />
              </TableCell>
              <TableCell>
                <Shimmer className="mx-auto h-5 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <Shimmer className="ml-auto h-8 w-40 rounded-full" />
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
