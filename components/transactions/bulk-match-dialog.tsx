"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field, Required } from "@/components/documents/field";
import { FundCombobox } from "@/components/super/fund-combobox";
import { CategorySearchSelect } from "@/components/transactions/category-search-select";
import { ContactPersonSelect } from "@/components/transactions/contact-person-select";
import {
  bulkMatchIssue,
  bulkMatchSkipsContact,
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
import { useBulkMatch } from "@/hooks/use-bank-transactions-query";
import { useCountryContext } from "@/hooks/use-country-context";

const HEADER_GRADIENT =
  "bg-[linear-gradient(110deg,hsl(var(--primary)),#8B7CFF,hsl(var(--primary)))]";

/** Investment Property Income needs a property per line — not a bulk choice. */
const NOT_IN_BULK = ["185"];

/**
 * "Bulk Match Transactions" — sole-webapp's Match modal in BULK_MATCH mode,
 * whose only tab is its bulk "Create Transactions" form.
 *
 * Every selected line (all money in, or all money out) is matched against
 * one account and one counterparty; the server creates the invoice, expense
 * or asset behind each. Capital and drawings accounts take no
 * client/supplier, and a super contribution takes a fund instead.
 */
export function BulkMatchDialog({
  rows,
  open,
  onOpenChange,
  onMatched,
}: {
  rows: Transaction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After a successful match — the caller clears its selection. */
  onMatched: () => void;
}) {
  const direction: "Credit" | "Debit" =
    rows[0]?.type === "Credit" ? "Credit" : "Debit";
  const moneyIn = direction === "Credit";
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  // The business's tax word and rate (GST 10% AU, GST 15% NZ, VAT 15% ZA, or custom).
  const { country } = useCountryContext();
  const tax = documentTax(country);

  const accountsQuery = useQuery({
    queryKey: ["manual-transaction-accounts"],
    queryFn: fetchManualAccounts,
  });
  const groups = React.useMemo<CategoryGroup[]>(
    () =>
      matchCategoryGroups(accountsQuery.data ?? [], direction)
        .map((group) => ({
          ...group,
          options: group.options.filter((option) => !NOT_IN_BULK.includes(option.id)),
        }))
        .filter((group) => group.options.length > 0),
    [accountsQuery.data, direction],
  );

  const [category, setCategory] = React.useState<{ id: string; name: string } | null>(null);
  const [contact, setContact] = React.useState<{ id: string; personId: string; name: string }>({
    id: "",
    personId: "",
    name: "",
  });
  const [gst, setGst] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [showRows, setShowRows] = React.useState(true);
  const [tried, setTried] = React.useState(false);

  // Each opening starts clean, on sole-webapp's default account: Sales
  // Income for money in, the first account for money out.
  React.useEffect(() => {
    if (!open) return;
    setContact({ id: "", personId: "", name: "" });
    setGst(false);
    setNotes("");
    setTried(false);
    setShowRows(true);
  }, [open]);

  React.useEffect(() => {
    if (!open || groups.length === 0) return;
    const all = groups.flatMap((group) => group.options);
    if (category && all.some((option) => option.id === category.id)) return;
    const fallback =
      (moneyIn && all.find((option) => option.id === "51" || option.name.toLowerCase() === "sales income")) ||
      all[0];
    setCategory(fallback ? { id: fallback.id, name: fallback.name } : null);
  }, [open, groups, moneyIn, category]);

  const superFund = !moneyIn && category?.id === "140";
  const skipContact = bulkMatchSkipsContact(direction, category);

  const input = {
    direction,
    transactionIds: rows.map((row) => row.id),
    categoryId: category?.id ?? "",
    categoryName: category?.name ?? "",
    contactId: contact.id,
    gstIncluded: gst,
    notes,
  };
  const issue = bulkMatchIssue(input);

  const match = useBulkMatch();

  const submit = () => {
    setTried(true);
    if (issue) return;
    match.mutate(input, {
      onSuccess: () => {
        onMatched();
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !match.isPending && onOpenChange(next)}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl",
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
              <DialogTitle className="text-base text-white">
                Bulk Match Transactions
              </DialogTitle>
              <DialogDescription className="text-white/80">
                Fields marked with * are mandatory
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* The lines being matched, as sole-webapp's open-by-default list. */}
          <div className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setShowRows((current) => !current)}
              aria-expanded={showRows}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>
                {rows.length} Transactions
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {moneyIn ? "Money In" : "Money Out"}
                </span>
              </span>
              <span className="flex items-center gap-2 text-muted-foreground tabular">
                {invoiceMoney(total)}
                <ChevronDown
                  className={cn("size-4 motion-safe:transition-transform", showRows && "rotate-180")}
                  aria-hidden
                />
              </span>
            </button>
            {showRows && (
              <ul className="max-h-48 divide-y divide-border overflow-y-auto border-t border-border">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{row.description}</span>
                      <span className="block text-xs text-muted-foreground tabular">
                        {formatTransactionDate(row.date)}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium tabular">{invoiceMoney(row.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
            <p className="font-medium">What happens when you save</p>
            <p className="mt-0.5 text-muted-foreground">
              {moneyIn
                ? "If you match these transactions with the Sales Income subcategory, an invoice is created automatically for each."
                : "If you match these debit transactions, an expense or asset is created automatically for each, based on the category you select."}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="block">
                {moneyIn ? "Choose Account" : "Category"}
                <Required />
              </Label>
              <CategorySearchSelect
                groups={groups}
                loading={accountsQuery.isLoading}
                value={category?.id ?? ""}
                label={category?.name ?? ""}
                placeholder="Select category"
                ariaLabel={moneyIn ? "Choose Account" : "Category"}
                className="h-10 px-3 text-sm"
                onSelect={(picked) => {
                  setCategory(picked);
                  setContact({ id: "", personId: "", name: "" });
                }}
              />
              {tried && !category && (
                <p className="text-xs text-destructive">Please select a category.</p>
              )}
            </div>

            {superFund ? (
              <FundCombobox
                fundId={contact.id}
                fundName={contact.name}
                onSelect={({ fundId, fundName }) =>
                  setContact({ id: fundId, personId: "", name: fundName })
                }
                error={tried && !contact.id ? "Fund Name is required" : undefined}
              />
            ) : (
              !skipContact && (
                <ContactPersonSelect
                  type={moneyIn ? "Client" : "Supplier"}
                  contactId={contact.personId}
                  name={contact.name}
                  onSelect={(pick) =>
                    setContact({ id: pick.clientId, personId: pick.contactId, name: pick.name })
                  }
                  error={
                    tried && !contact.id
                      ? moneyIn
                        ? "Client is required"
                        : "Supplier is required"
                      : undefined
                  }
                />
              )
            )}
          </div>

          <Field label="Notes" htmlFor="bulk-match-notes">
            <Textarea
              id="bulk-match-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Add a note for these transactions"
            />
          </Field>

          {!superFund && (
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <p className="text-sm font-medium">
                {moneyIn ? `Include ${tax.word}` : `Include ${tax.rateLabel}`}
              </p>
              <Switch checked={gst} onCheckedChange={setGst} aria-label={`Include ${tax.word}`} />
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border p-4">
          {tried && issue && (
            <p className="mr-auto self-center text-xs text-destructive">{issue}</p>
          )}
          <Button variant="outline" disabled={match.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={match.isPending} onClick={submit}>
            {match.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {match.isPending ? "Please wait..." : "Save & Match"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
