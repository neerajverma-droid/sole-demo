"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAtom } from "jotai";
import { FileCheck2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { DeleteQuoteDialog } from "@/components/quotes/delete-quote-dialog";
import { QuotePreviewDialog } from "@/components/quotes/quote-preview-dialog";
import { QuoteHistoryDialog } from "@/components/quotes/quote-history-dialog";
import { InvoiceQuickEditDialog } from "@/components/invoices/invoice-quick-edit-dialog";
import { QuotesSummary } from "@/components/quotes/quotes-summary";
import { QuotesTable } from "@/components/quotes/quotes-table";
import { useQuoteSummaryStatsQuery } from "@/hooks/use-quote-summary-stats-query";
import { useQuotesQuery } from "@/hooks/use-quotes-query";
import { quotesFilterAtom } from "@/lib/atoms";
import { QUOTE_STATUSES } from "@/lib/quotes";
import { useCreateIntent } from "@/lib/use-create-intent";

export function QuotesScreen() {
  const router = useRouter();
  // Still loaded here for the screens that read the shared quote store (the
  // sidebar's Quick actions count, the invoice editor's source quote). The
  // summary card no longer reads it — its figures come from the server's stats.
  useQuotesQuery();
  const statsQuery = useQuoteSummaryStatsQuery();
  const createIntent = useCreateIntent();
  const [, setFilter] = useAtom(quotesFilterAtom);

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

  const loading = statsQuery.isLoading;

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

      {/* Stays for an account with no quotes yet too, as on Invoices: the
          same screen it will have later, zeroes and all. */}
      <QuotesSummary stats={statsQuery.data} loading={loading} />
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
