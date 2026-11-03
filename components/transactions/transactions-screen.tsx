"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAtomValue, useSetAtom } from "jotai";
import { ChevronDown, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/layout/page-header";
import { UnmatchTransactionDialog } from "@/components/transactions/unmatch-transaction-dialog";
import { DeleteTransactionDialog } from "@/components/transactions/delete-transaction-dialog";
import { MarkTransferDialog } from "@/components/transactions/mark-transfer-dialog";
import { TransactionDetailsDialog } from "@/components/transactions/transaction-details-dialog";
import {
  EditTransactionDialog,
  MatchTransactionDialog,
  RecategoriseDialog,
  SplitTransactionDialog,
} from "@/components/transactions/transaction-dialogs";
import { BankAccounts } from "@/components/transactions/bank-accounts";
import { AiSuggestionsBanner } from "@/components/transactions/ai-suggestions-banner";
import { TransactionsIntro } from "@/components/transactions/transactions-intro";
import { TransactionsMetrics } from "@/components/transactions/transactions-metrics";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { MatchedTransactionsTable } from "@/components/transactions/matched-transactions-table";
import {
  connectBankIntroOpenAtom,
  transactionsFilterAtom,
  transactionsFiltersAtom,
  transactionsPeriodAtom,
  unmatchTransactionIdAtom,
  transactionsQueryAtom,
} from "@/lib/atoms";
import { resolveTransactionFilters } from "@/lib/transaction-filters";
import {
  currentFinancialYearLabel,
  tabForFilter,
} from "@/lib/bank-transactions";
import type { PageInfo } from "@/lib/products";
import { TRANSACTION_FILTERS } from "@/lib/transactions";
import { useRulesStore } from "@/stores/rules";
import { useSessionStore } from "@/stores/session";
import { useCountryContext } from "@/hooks/use-country-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import {
  useBankTransactionBalances,
  useBankTransactionsPage,
} from "@/hooks/use-bank-transactions-query";

/** sole-webapp's default page size. */
const DEFAULT_PAGE_SIZE = 50;

function pageInfo(page: number, pageSize: number, total: number): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  return {
    page: current,
    pageCount,
    total,
    from: total === 0 ? 0 : (current - 1) * pageSize + 1,
    to: Math.min(current * pageSize, total),
  };
}

export function TransactionsScreen() {
  const router = useRouter();
  const setConnectOpen = useSetAtom(connectBankIntroOpenAtom);
  const setFilter = useSetAtom(transactionsFilterAtom);
  const filter = useAtomValue(transactionsFilterAtom);
  const period = useAtomValue(transactionsPeriodAtom);
  const setPeriod = useSetAtom(transactionsPeriodAtom);
  const filterDrafts = useAtomValue(transactionsFiltersAtom);
  const search = useDebouncedValue(useAtomValue(transactionsQueryAtom), 400);

  /*
   * The active pile, one page at a time, from the server — sole-webapp's two
   * tabs. Personal and Transfer are the matched list narrowed by the server.
   */
  const tab = tabForFilter(filter);
  // The open tab's Filters, as the request takes them.
  const filters = React.useMemo(
    () => resolveTransactionFilters(filterDrafts[tab], tab),
    [filterDrafts, tab],
  );
  const filtersKey = JSON.stringify(filters);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  // Any change to what's being asked for starts again from the first page.
  React.useEffect(
    () => setPage(1),
    [filter, period, search, pageSize, filtersKey],
  );

  const listQuery = useBankTransactionsPage({
    tab,
    page,
    pageSize,
    period,
    search,
    personal: filter === "Personal",
    transfer: filter === "Transfer",
    filters,
  });
  const transactions = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;

  const balances = useBankTransactionBalances(period);

  // Deep link from the dashboard's "N transactions need categorising", which
  // is only useful if it lands on the ones that do. Mirrors Invoices and Quotes.
  const rawParams = useSearchParams();
  const params = React.useMemo(
    () => new URLSearchParams(rawParams?.toString() ?? ""),
    [rawParams],
  );
  const statusParam = params.get("status");
  React.useEffect(() => {
    if (!statusParam) return;
    const match = TRANSACTION_FILTERS.find(
      (option) => option.toLowerCase() === statusParam.toLowerCase(),
    );
    if (match) setFilter(match);
  }, [statusParam, setFilter]);

  /*
   * Deep link from a rule chip on the Matching rules page.
   *
   * Resolved to the rule's own condition value in the search box rather than a
   * hidden rule-scoped filter: the search is visible, adjustable and clearable,
   * so the narrowing can be seen and undone. It's an approximation of the
   * rule — the condition may be an amount comparison, and the search only
   * reads text — which is why the box shows what it searched for.
   */
  const ruleParam = params.get("rule");
  const rules = useRulesStore((state) => state.rules);
  const setQuery = useSetAtom(transactionsQueryAtom);
  React.useEffect(() => {
    if (!ruleParam) return;
    const rule = rules.find((entry) => entry.id === ruleParam);
    const term = rule?.values.find((value) => value.trim());
    if (term) setQuery(term.trim());
  }, [ruleParam, rules, setQuery]);

  // Deep link from the BAS review: land on the list already searched for the
  // transaction a finding is about. Same visible, clearable search box as above.
  const searchParam = params.get("search");
  React.useEffect(() => {
    if (searchParam?.trim()) setQuery(searchParam.trim());
  }, [searchParam, setQuery]);

  // The same link names the financial year the transaction falls in ("FY 25/26"),
  // since the list only shows the current year until told otherwise. Only a
  // well-formed label is taken, so a stray value can't leave the list empty.
  const periodParam = params.get("period");
  React.useEffect(() => {
    if (periodParam && /^FY \d{2}\/\d{2}$/.test(periodParam)) setPeriod(periodParam);
  }, [periodParam, setPeriod]);

  /*
   * The period atom opens on the July year, because an atom can't know the
   * business. Once the country context has answered, a business whose year
   * starts elsewhere (1 April in New Zealand) is moved onto its own current
   * year — once per visit, only while the list is still on that July default,
   * and never over a year a link asked for. For an Australian business the two
   * are the same label, so nothing moves.
   */
  const { ready: countryReady } = useCountryContext();
  const fiscalYearStart = useFiscalYearStart();
  const movedToBusinessYear = React.useRef(false);
  React.useEffect(() => {
    if (!countryReady || movedToBusinessYear.current) return;
    movedToBusinessYear.current = true;
    if (periodParam) return;
    const julyDefault = currentFinancialYearLabel();
    const businessYear = currentFinancialYearLabel(new Date(), fiscalYearStart);
    if (period === julyDefault && businessYear !== julyDefault) {
      setPeriod(businessYear);
    }
  }, [countryReady, fiscalYearStart, period, periodParam, setPeriod]);

  /*
   * `?undo=1` goes one step further, for the BAS review's "Edit" on a bank
   * transaction. A matched transaction can't be edited, so the way to edit it
   * is to undo it first — this opens the Undo dialog for the one transaction
   * the link is about, worded for that. Confirming sends it back to the
   * Unmatched list (Review) with the search still on it, where it can be coded
   * again.
   *
   * The search is for one transaction's own id, so when the list it narrows to
   * is exactly one row, that is the row. Several (a description matched more
   * than one) are narrowed by the amount the link carries, and used only if
   * that leaves exactly one. It waits for the list the link asked for so a
   * half-loaded earlier list can't pick the wrong thing, and fires once per
   * link so cancelling the dialog doesn't bring it back.
   */
  const undoParam = params.get("undo");
  const amountRaw = params.get("amount");
  const amountParam =
    amountRaw !== null && /^\d+(\.\d{1,2})?$/.test(amountRaw) ? Number(amountRaw) : null;
  const setUnmatchId = useSetAtom(unmatchTransactionIdAtom);
  const unmatchId = useAtomValue(unmatchTransactionIdAtom);
  const [editFirst, setEditFirst] = React.useState(false);
  const openedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const term = searchParam?.trim();
    if (undoParam !== "1" || !term) return;
    if (filter !== "Matched" || search !== term) return;
    if (!listQuery.isSuccess || listQuery.isFetching) return;
    const found = listQuery.data?.rows ?? [];
    const key = `${term}|${period}`;
    if (openedRef.current === key) return;
    let target = found.length === 1 ? found[0] : null;
    if (!target && amountParam !== null) {
      const same = found.filter((row) => Math.abs(Math.abs(row.amount) - amountParam) < 0.005);
      if (same.length === 1) target = same[0];
    }
    if (!target) return;
    openedRef.current = key;
    setEditFirst(true);
    setUnmatchId(target.id);
  }, [undoParam, searchParam, amountParam, filter, search, period, listQuery.isSuccess, listQuery.isFetching, listQuery.data, setUnmatchId]);
  // The wording belongs to the one dialog that link opened, not the next.
  React.useEffect(() => {
    if (unmatchId === null) setEditFirst(false);
  }, [unmatchId]);

  /**
   * One expression drives both the hero and the header's actions, so they can't
   * disagree: the intro offers all three routes in already, and repeating them
   * up top just doubles them. The populated view has no hero, so the header is
   * the only place they live there.
   */
  /*
   * Whether this year has any transactions at all, from figures already on
   * hand — each pile's money (the balance call the tabs show) and the active
   * list's own total — rather than a request per pile just to count them.
   */
  const balancesLoaded = balances.isSuccess;
  const anyThisYear =
    total > 0 ||
    (balances.data?.unmatched ?? 0) !== 0 ||
    (balances.data?.matched ?? 0) !== 0;
  // sole-webapp asks the profile whether this business has ever had a
  // transaction; where the profile doesn't say, this year's counts do.
  const everHadTransactions = useSessionStore((state) => {
    const flag = state.user?.is_transaction_present;
    return flag === undefined || flag === null ? null : Boolean(flag);
  });
  /*
   * "Nothing at all", not "nothing here": a search, a filter or another year
   * that turns up empty keeps the list and its "no match" state, so it can be
   * cleared. The profile's flag is the reliable answer; this year's counts only
   * stand in for it on the business's own current year, unnarrowed. A failed
   * list never counts as empty, and rows on screen overrule a stale flag.
   */
  const unnarrowed =
    !search.trim() &&
    Object.keys(filters).length === 0 &&
    period === currentFinancialYearLabel(new Date(), fiscalYearStart);
  const isEmpty =
    !listQuery.isError &&
    !anyThisYear &&
    (everHadTransactions === false ||
      (everHadTransactions === null &&
        unnarrowed &&
        balancesLoaded &&
        listQuery.isSuccess));

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={Receipt}
        title="Transactions"
        description="Every payment in and out, matched to the right invoice or bill."
      >
        {!isEmpty && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  aria-label="More ways to add transactions"
                >
                  Add manually
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem asChild>
                  <Link href="/transactions/bulk">Manual bulk upload</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/transactions/new">Manual entry</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </PageHeader>

      {/* Accounts first: the feeds are where the rows come from, so the state
          of them is the first thing worth knowing on this screen. */}
      <BankAccounts />

      {/* With nothing to list, the intro is the whole of the empty state: it
          offers all three routes in, so the banner, the figures and the
          table's own "No transactions yet" would only be noise around it. */}
      {isEmpty ? (
        <TransactionsIntro
          onConnect={() => setConnectOpen(true)}
          onManualEntry={() => router.push("/transactions/new")}
          onBulkUpload={() => router.push("/transactions/bulk")}
        />
      ) : (
        <>
          {/* Between the feeds and the figures: it's about the rows below, but
              it's a thing to do rather than a thing to read, so it sits above
              the strip people scan. Renders nothing when there's nothing
              pending. */}
          <AiSuggestionsBanner />

          {/* One strip rather than a card row, so the table itself is on
              screen without scrolling. */}
          <TransactionsMetrics
            totals={{
              unmatched: {
                count: tab === "unmatched" ? total : null,
                total: balances.data?.unmatched ?? null,
              },
              matched: {
                count: tab === "matched" ? total : null,
                total: balances.data?.matched ?? null,
              },
            }}
          />
          {/* Two tables, as in sole-webapp: the unmatched one is for coding
              and matching, the matched one for what each line was reconciled
              against. */}
          {(() => {
            const tableProps = {
              transactions,
              // First load, and the refetch after an undo, delete, match or
              // approve — the rows on screen are stale then, so skeleton
              // them. (Focus refetching is off app-wide, so nothing else
              // refetches the same list.)
              loading:
                listQuery.isPending ||
                (listQuery.isFetching && !listQuery.isPlaceholderData),
              // A page/size change's own fetch, still in flight, while the
              // previous page's rows stay on screen rather than resetting to
              // a skeleton — `placeholderData` above is what keeps them.
              fetching: listQuery.isFetching && listQuery.isPlaceholderData,
              error:
                listQuery.isError && !listQuery.data
                  ? listQuery.error.message || "Something went wrong."
                  : null,
              onRetry: () => void listQuery.refetch(),
              anyTransactions: anyThisYear,
              paging: {
                page: pageInfo(page, pageSize, total),
                pageSize,
                onPageChange: setPage,
                onPageSizeChange: setPageSize,
                disabled: listQuery.isFetching,
              },
            };
            return tab === "matched" ? (
              <MatchedTransactionsTable {...tableProps} />
            ) : (
              <TransactionsTable {...tableProps} />
            );
          })()}
        </>
      )}

      <MarkTransferDialog />
      <TransactionDetailsDialog />
      <EditTransactionDialog />
      <RecategoriseDialog />
      <MatchTransactionDialog />
      <UnmatchTransactionDialog
        editFirst={editFirst}
        onUnmatched={() => editFirst && setFilter("Review")}
      />
      <SplitTransactionDialog />
      <DeleteTransactionDialog />
    </div>
  );
}
