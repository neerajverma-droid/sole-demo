"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CategorySearchSelect } from "@/components/transactions/category-search-select";
import {
  ContactPersonSelect,
  type ContactPick,
} from "@/components/transactions/contact-person-select";
import {
  approvalIssue,
  bulkApprovalIssue,
  type ApprovalRow,
} from "@/lib/bank-transactions";
import { documentTax } from "@/lib/country-context";
import { invoiceMoney } from "@/lib/invoices";
import {
  fetchManualAccounts,
  matchCategoryGroups,
  type CategoryGroup,
} from "@/lib/manual-transaction";
import { formatTransactionDate, type Transaction } from "@/lib/transactions";
import { cn } from "@/lib/utils";
import {
  useApproveAll,
  useApproveTransaction,
  useRejectSuggestions,
  useSuggestions,
} from "@/hooks/use-bank-transactions-query";
import { useCountryContext } from "@/hooks/use-country-context";

/** The AI treatment's ramp, shared with the banner and the match dialogs. */
const HEADER_GRADIENT =
  "bg-[linear-gradient(110deg,hsl(var(--primary)),#8B7CFF,hsl(var(--primary)))]";

/** How close to the bottom (px) the list asks for its next 25. */
const LOAD_MORE_THRESHOLD = 150;

type Category = { id: string; name: string };

/**
 * sole-webapp's "Expense classification" review, over every unmatched line —
 * money in as well as out, where sole-webapp only reviewed debits.
 *
 * Each row has the unmatched table's own controls: the client (money in) or
 * supplier (money out) picker, and the category picker with the AI's
 * suggestions and confidence. GST is per row, with sole-webapp's "Enable GST
 * for All". Approve one row, Approve All, or Reject All — each validated as
 * sole-webapp validates it, and none touching the server until it passes.
 *
 * Rows load 25 at a time as the list scrolls, as there.
 */
export function ReviewSuggestionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const suggestions = useSuggestions(open);
  const rows = React.useMemo(() => {
    const seen = new Set<string>();
    const all: Transaction[] = [];
    for (const page of suggestions.data?.pages ?? []) {
      for (const row of page.rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        all.push(row);
      }
    }
    return all;
  }, [suggestions.data]);
  const total = suggestions.data?.pages[0]?.total ?? 0;
  // "GST" in AU and NZ, "VAT" in ZA, or the business's own name for it.
  const { country } = useCountryContext();
  const taxName = documentTax(country).word;

  const accountsQuery = useQuery({
    queryKey: ["manual-transaction-accounts"],
    queryFn: fetchManualAccounts,
    enabled: open,
  });
  const groups = React.useMemo(
    () => ({
      Credit: matchCategoryGroups(accountsQuery.data ?? [], "Credit"),
      Debit: matchCategoryGroups(accountsQuery.data ?? [], "Debit"),
    }),
    [accountsQuery.data],
  );

  /* Per-row edits; what the server suggested fills anything left untouched. */
  const [categories, setCategories] = React.useState<Record<string, Category>>({});
  const [contacts, setContacts] = React.useState<Record<string, ContactPick>>({});
  const [gst, setGst] = React.useState<Record<string, boolean>>({});

  // Closing forgets the edits, as sole-webapp resets on close.
  React.useEffect(() => {
    if (open) return;
    setCategories({});
    setContacts({});
    setGst({});
  }, [open]);

  const categoryOf = (row: Transaction): Category | null => {
    const picked = categories[row.id];
    if (picked) return picked;
    if (row.suggestedCategoryId && row.suggestedCategory) {
      return { id: row.suggestedCategoryId, name: row.suggestedCategory.category };
    }
    return null;
  };
  const gstOf = (row: Transaction) => gst[row.id] ?? row.gst;

  const approvalRow = (row: Transaction): ApprovalRow => {
    const contact = contacts[row.id];
    return {
      transactionId: row.id,
      categoryId: categoryOf(row)?.id ?? "",
      clientId: contact?.clientId ?? "",
      gstIncluded: gstOf(row),
      contactPersonId: contact?.contactId ?? "",
      contactName: contact?.name ?? "",
    };
  };

  const allGst = rows.length > 0 && rows.every((row) => gstOf(row));
  const toggleAllGst = () =>
    setGst(Object.fromEntries(rows.map((row) => [row.id, !allGst])));

  const approveOne = useApproveTransaction();
  const approveAll = useApproveAll();
  const reject = useRejectSuggestions();
  const busy = approveOne.isPending || approveAll.isPending || reject.isPending;

  const approve = (row: Transaction) => {
    const input = approvalRow(row);
    const issue = approvalIssue(input);
    if (issue) {
      // sole-webapp's single-row wording.
      toast.error(
        issue.startsWith("Please select a suggested")
          ? "Please select a suggested category before approving."
          : issue,
      );
      return;
    }
    approveOne.mutate(input);
  };

  const approveEverything = () => {
    const input = rows.map(approvalRow);
    const issue = bulkApprovalIssue(input);
    if (issue) {
      toast.error(issue);
      return;
    }
    approveAll.mutate(input);
  };

  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const box = event.currentTarget;
    const nearBottom =
      box.scrollHeight - box.scrollTop - box.clientHeight < LOAD_MORE_THRESHOLD;
    if (nearBottom && suggestions.hasNextPage && !suggestions.isFetchingNextPage) {
      void suggestions.fetchNextPage();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl",
          "[&>button]:text-white [&>button]:opacity-80 [&>button:hover]:opacity-100",
        )}
      >
        <DialogHeader className={cn("shrink-0 space-y-0 p-5 pr-14 text-left", HEADER_GRADIENT)}>
          <div className="flex items-start gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15 text-white"
              aria-hidden
            >
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-base text-white">Review suggestions</DialogTitle>
              <DialogDescription className="text-white/80">
                Review and approve AI suggested sub-categories for your transactions
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* sole-webapp's toolbar: the hint, and GST for every loaded row. */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-2.5">
          <p className="text-xs text-muted-foreground">
            Review and customize suggestions before approving
          </p>
          {rows.length > 0 && (
            <Button
              size="sm"
              variant={allGst ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={toggleAllGst}
            >
              {allGst ? `Disable ${taxName} for All` : `Enable ${taxName} for All`}
            </Button>
          )}
        </div>

        <TooltipProvider delayDuration={200}>
          <div className="min-h-0 flex-1 overflow-y-auto p-5" onScroll={onScroll}>
            {suggestions.isPending ? (
              <div className="space-y-2" aria-hidden>
                {[0, 1, 2, 3, 4, 5].map((key) => (
                  <div key={key} className="h-11 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
                <Check className="size-5 text-success" aria-hidden />
                <p className="text-sm font-medium">No AI suggestions available.</p>
                <p className="max-w-[44ch] text-sm text-muted-foreground">
                  Every unmatched transaction has been approved or matched.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table className="[&_td]:px-2 [&_td]:text-xs [&_th]:px-2 [&_th]:text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Client / Supplier</TableHead>
                      <TableHead>Suggested category</TableHead>
                      <TableHead className="text-center">{taxName}</TableHead>
                      <TableHead className="text-right">Approve</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const category = categoryOf(row);
                      const approving =
                        approveOne.isPending &&
                        approveOne.variables?.transactionId === row.id;
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground tabular">
                            {formatTransactionDate(row.date)}
                          </TableCell>
                          <TableCell className="min-w-0 max-w-[220px]">
                            <p className="truncate font-medium" title={row.description}>
                              {row.description}
                            </p>
                          </TableCell>
                          <TableCell>
                            <TypePill row={row} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-medium tabular">
                            {invoiceMoney(row.amount)}
                          </TableCell>
                          <TableCell className="w-[200px] min-w-[200px]">
                            <ContactPersonSelect
                              compact
                              type={row.type === "Credit" ? "Client" : "Supplier"}
                              contactId={contacts[row.id]?.contactId ?? ""}
                              name={contacts[row.id]?.name ?? ""}
                              onSelect={(pick) =>
                                setContacts((current) => ({ ...current, [row.id]: pick }))
                              }
                            />
                          </TableCell>
                          <TableCell className="w-[230px] min-w-[230px]">
                            <CategorySearchSelect
                              groups={groups[row.type] as CategoryGroup[]}
                              loading={accountsQuery.isLoading}
                              value={category?.id ?? ""}
                              label={category?.name ?? ""}
                              ariaLabel={`Category for ${row.reference}`}
                              ai={row.aiSuggestions}
                              onSelect={(picked) =>
                                setCategories((current) => ({ ...current, [row.id]: picked }))
                              }
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={gstOf(row)}
                              onCheckedChange={(checked) =>
                                setGst((current) => ({ ...current, [row.id]: checked }))
                              }
                              aria-label={`${taxName} applies to ${row.reference}`}
                              className="scale-75"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              className="h-6 px-2 text-xs"
                              disabled={busy}
                              onClick={() => approve(row)}
                            >
                              {approving ? (
                                <>
                                  <Loader2 className="size-3 animate-spin" aria-hidden />
                                  Approving...
                                </>
                              ) : (
                                "Approve"
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {suggestions.isFetchingNextPage &&
                      [0, 1, 2].map((key) => (
                        <TableRow key={`more-${key}`} aria-hidden>
                          <TableCell colSpan={8}>
                            <div className="h-7 animate-pulse rounded bg-muted" />
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TooltipProvider>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border p-4">
          <p className="text-xs text-muted-foreground tabular">
            Showing {rows.length} of {total} suggestions
            {rows.length > 0 && (
              <span className="ml-1.5">
                ·{" "}
                {suggestions.isFetchingNextPage
                  ? "Loading more..."
                  : suggestions.hasNextPage
                    ? "Scroll down to load more"
                    : "All suggestions loaded"}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="hover:border-destructive/40 hover:text-destructive"
              disabled={busy || rows.length === 0}
              onClick={() => reject.mutate(rows.map((row) => row.id))}
            >
              {reject.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <X />}
              {reject.isPending ? "Please wait..." : "Reject All"}
            </Button>
            <Button disabled={busy || rows.length === 0} onClick={approveEverything}>
              {approveAll.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Check />}
              {approveAll.isPending ? "Please wait..." : "Approve All"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** CR/DR, green in and red out — the unmatched table's own pill. */
function TypePill({ row }: { row: Transaction }) {
  return (
    <Badge
      variant={row.type === "Credit" ? "success" : "danger"}
      className="gap-1 rounded-full px-2 py-0 text-xs font-medium"
    >
      {row.type === "Credit" ? (
        <ArrowDownLeft className="size-3" aria-hidden />
      ) : (
        <ArrowUpRight className="size-3" aria-hidden />
      )}
      <span aria-hidden title={row.type}>
        {row.type === "Credit" ? "CR" : "DR"}
      </span>
      <span className="sr-only">{row.type}</span>
    </Badge>
  );
}
