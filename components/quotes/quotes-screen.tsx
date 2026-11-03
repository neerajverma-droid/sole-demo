"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAtom, useAtomValue } from "jotai";
import { FileCheck2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { DeleteQuoteDialog } from "@/components/quotes/delete-quote-dialog";
import { QuotePreviewDialog } from "@/components/quotes/quote-preview-dialog";
import { QuoteHistoryDialog } from "@/components/quotes/quote-history-dialog";
import { InvoiceQuickEditDialog } from "@/components/invoices/invoice-quick-edit-dialog";
import { QuotesSummary } from "@/components/quotes/quotes-summary";
import { QuotesTable } from "@/components/quotes/quotes-table";
import { useQuotesQuery } from "@/hooks/use-quotes-query";
import { quotesFilterAtom, quotesQueryAtom } from "@/lib/atoms";
import { useAreaFilter } from "@/components/documents/area-filter";
import { QUOTE_STATUSES } from "@/lib/quotes";
import { useCreateIntent } from "@/lib/use-create-intent";
import { useQuotesStore } from "@/stores/quotes";

export function QuotesScreen() {
  const router = useRouter();
  const query = useQuotesQuery();
  const quotes = useQuotesStore((state) => state.quotes);
  const hydrated = useQuotesStore((state) => state.hydrated);
  const createIntent = useCreateIntent();
  const [filter, setFilter] = useAtom(quotesFilterAtom);
  const search = useAtomValue(quotesQueryAtom);
  const area = useAreaFilter();

  // Deep link from Geographic insights' "Follow up quotes", which asks for the
  // open ones. Mirrors the same param on Invoices.
  const statusParam = useSearchParams()?.get("status");
  React.useEffect(() => {
    if (!statusParam) return;
    const match = QUOTE_STATUSES.find(
      (status) => status.toLowerCase() === statusParam.toLowerCase(),
    );
    if (match) setFilter(match);
  }, [statusParam, setFilter]);

  const loading = !hydrated && query.isLoading;
  /*
   * The account genuinely has no quotes — loaded, not errored, and not
   * narrowed by a tab, search or area link — so the summary goes and the
   * table is left showing only its own empty state.
   */
  const hasNoQuotes =
    query.isSuccess &&
    query.data.length === 0 &&
    filter === "All" &&
    !search.trim() &&
    !area;

  // Deep-linked from a "New quote" entry point: go straight to the chooser,
  // matching the reference, which sets view: 'picker' on ?new=1.
  React.useEffect(() => {
    if (createIntent) router.replace("/quotes/new");
  }, [createIntent, router]);

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={FileCheck2}
        title="Quotes"
        description="Track every quote from draft to accepted."
      >
        <Button asChild data-usertour="quote-new-button">
          <Link href="/quotes/new">
            <Plus />
            New quote
          </Link>
        </Button>
      </PageHeader>

      {/* Zeros are worth reading once there's something to count; with no
          quotes at all, the table's own empty state and its nudge towards
          New quote are all there is to say. */}
      {!hasNoQuotes && <QuotesSummary quotes={quotes} loading={loading} />}
      <QuotesTable />

      {/* View opens the real PDF, as it does in the reference — the document
          the client actually receives, not a rebuild of it from local data. */}
      <QuotePreviewDialog />
      <QuoteHistoryDialog />
      {/* Opened by the linked-invoice badge on a converted quote. */}
      <InvoiceQuickEditDialog />
      <DeleteQuoteDialog />
    </div>
  );
}
