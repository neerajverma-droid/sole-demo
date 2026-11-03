"use client";

import * as React from "react";
import {
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import { apiErrorMessage } from "@/lib/api-error";
import { contactDefaultCurrency, documentTax } from "@/lib/country-context";
import { useCountryContext } from "@/hooks/use-country-context";
import { contactDisplayName, contactFormDefaults } from "@/lib/contacts";
import { emptyAssetDraft, type AssetCategory } from "@/lib/assets";
import { emptyExpenseDraft, taxInsideAmount } from "@/lib/expenses";
import {
  formatDocumentMoney,
  invoiceMoney,
  toIsoDate,
} from "@/lib/invoices";
import {
  TRANSACTION_CATEGORY_TREE,
  categoryType,
  formatTransactionDate,
  type Transaction,
  type TransactionCategoryType,
} from "@/lib/transactions";
import {
  canSelectCandidate,
  fetchRefundRecords,
  matchRefundApi,
  matchToMultipleApi,
  type MatchCandidate,
  type MatchDirection,
  type RefundRecord,
} from "@/lib/transaction-match";
import { cn } from "@/lib/utils";
import { BANK_TRANSACTIONS_KEY } from "@/hooks/use-bank-transactions-query";
import { useSaveAssetMutation } from "@/hooks/use-asset-query";
import { useCreateContactMutation } from "@/hooks/use-contacts-query";
import { useCreateExpenseMutation } from "@/hooks/use-expenses-query";
import { useAssetsStore } from "@/stores/assets";
import { useContactsStore } from "@/stores/contacts";
import { useExpensesStore } from "@/stores/expenses";
import { useTransactionsStore } from "@/stores/transactions";

/**
 * The three bodies of the Match Transaction dialog.
 *
 * Lifted out of `transaction-dialogs.tsx` so the shell there stays readable —
 * that file holds four dialogs, and three tab bodies with their own tables,
 * comboboxes and validation would have been most of it.
 *
 * All three answer the same question from different directions: what was this
 * bank line? Either nothing on file accounts for it and a record has to be made
 * (Create), or several records between them do (Assign to Multiple), or it's
 * money going back the other way against an invoice already settled (Refund).
 */

/* ------------------------------------------------------------------ *
 * Shared
 * ------------------------------------------------------------------ */

/**
 * One thing this transaction could be matched against.
 *
 * Expenses and assets in one list, because the question "which of my records is
 * this payment?" doesn't care which table the answer lives in. The `kind` is
 * what the Type badge reports and what the id is namespaced by — two tables
 * with their own id sequences would otherwise collide in a single selection
 * set.
 */
export type MatchItem = {
  /** `expense:x` or `asset:x` — unique across both tables. */
  key: string;
  kind: "Expense" | "Asset";
  description: string;
  category: string;
  supplierName: string;
  supplierEmail: string;
  amount: number;
};

/**
 * Every unmatched expense and asset, as one list.
 *
 * Exported because the dialog builds it: the summary strip above the tabs
 * reports the running total of what's ticked, so the amounts have to be
 * resolvable outside the tab that ticks them.
 */
export function useMatchItems(): MatchItem[] {
  const expenses = useExpensesStore((state) => state.expenses);
  const assets = useAssetsStore((state) => state.assets);
  const contacts = useContactsStore((state) => state.contacts);

  return React.useMemo(() => {
    const emailFor = (id: string | null, name: string) => {
      const contact =
        (id && contacts.find((entry) => entry.id === id)) ||
        contacts.find((entry) => contactDisplayName(entry) === name);
      return contact?.email ?? "";
    };

    const fromExpenses: MatchItem[] = expenses
      // Anything already reconciled is not on offer — matching it twice would
      // be the one mistake this dialog can make that nothing downstream catches.
      .filter((expense) => !expense.transactionRef)
      .map((expense) => ({
        key: `expense:${expense.id}`,
        kind: "Expense" as const,
        description: expense.description,
        category: expense.category,
        supplierName: expense.supplierName,
        supplierEmail: emailFor(expense.supplierId, expense.supplierName),
        amount: expense.amount,
      }));

    const fromAssets: MatchItem[] = assets
      // Assets carry no `transactionRef` — matching is real reconciliation
      // state, tracked server-side and mirrored here as `isReconciled`.
      .filter((asset) => !asset.isReconciled)
      .map((asset) => ({
        key: `asset:${asset.id}`,
        kind: "Asset" as const,
        description: asset.name,
        category: asset.category,
        supplierName: asset.supplierName,
        supplierEmail: emailFor(asset.supplierId, asset.supplierName),
        amount: Number(asset.costPrice.replace(/,/g, "")) || 0,
      }));

    return [...fromExpenses, ...fromAssets];
  }, [expenses, assets, contacts]);
}

/* ------------------------------------------------------------------ *
 * Create Transactions
 * ------------------------------------------------------------------ */

/**
 * Which transaction-tree groups a direction can sensibly post to.
 *
 * Money out becomes a cost or a thing you now own; money in is income. Offering
 * the other side's groups would let someone file a payment received under Rent,
 * which no amount of validation further down can make true.
 */
const GROUPS_FOR_DEBIT: TransactionCategoryType[] = ["Expense", "Asset"];
const GROUPS_FOR_CREDIT: TransactionCategoryType[] = ["Income"];

/**
 * The transaction tree's asset categories, in the asset register's own words.
 *
 * Two vocabularies because they're two catalogues — the tree codes a bank line,
 * the register describes a thing you own — and the day they diverge further is
 * the day an unmapped category should fall to "Other" rather than crash.
 */
const ASSET_CATEGORY_MAP: Record<string, AssetCategory> = {
  Equipment: "Equipment",
  "Motor vehicles": "Vehicle",
  Inventory: "Inventory",
};

/**
 * Record what this line was, where nothing on file accounts for it.
 *
 * The one tab that writes a new record rather than pointing at an existing one,
 * which is why the amber note is the first thing on it: everything else in this
 * dialog links two things that already exist, and creating something is the one
 * outcome someone might not be expecting from a button called Match.
 */
export function CreateTransactionsTab({
  transaction,
  onDone,
}: {
  transaction: Transaction;
  onDone: () => void;
}) {
  const contacts = useContactsStore((state) => state.contacts);
  const { country } = useCountryContext();
  const createContact = useCreateContactMutation();
  const createExpense = useCreateExpenseMutation();
  const saveAsset = useSaveAssetMutation();
  const reconcile = useTransactionsStore((state) => state.reconcile);
  const approveCoding = useTransactionsStore((state) => state.approveCoding);
  const toggleGst = useTransactionsStore((state) => state.toggleGst);

  const moneyIn = transaction.type === "Credit";
  const groups = moneyIn ? GROUPS_FOR_CREDIT : GROUPS_FOR_DEBIT;

  const [category, setCategory] = React.useState("");
  const [supplier, setSupplier] = React.useState(transaction.supplier);
  const [notes, setNotes] = React.useState("");
  const [gst, setGst] = React.useState(transaction.gst);
  const [saving, setSaving] = React.useState(false);

  /*
   * The business's tax on the statement date: GST 10% in Australia, GST 15% in
   * New Zealand, VAT 15% in South Africa, or its own custom rate. Display only —
   * the server works the amount out at the same rate.
   */
  const tax = documentTax(country, transaction.date);

  /** What the chosen category will actually produce. Drives the amber note. */
  const creates = categoryType(category);

  /*
   * Both are required, and the button is disabled rather than the form
   * validated on submit: there are two fields, the requirement is marked on
   * both, and an error message under a two-field form is a slower way of saying
   * what a greyed-out button already says.
   */
  const ready = !!category && !!supplier.trim();

  const save = async () => {
    if (!ready || saving) return;
    setSaving(true);

    try {
      /*
       * Find or create, in that order.
       *
       * A supplier typed into this box is far more often one already in
       * Contacts than a new one, so an exact display-name match reuses the
       * record instead of quietly building a second contact with the same
       * name — which is how a contact list ends up with three of everybody.
       */
      const name = supplier.trim();
      const existing = contacts.find(
        (contact) => contactDisplayName(contact).toLowerCase() === name.toLowerCase(),
      );
      const contact =
        existing ??
        (await createContact.mutateAsync({
          ...contactFormDefaults,
          currency: contactDefaultCurrency(country),
          type: moneyIn ? "Client" : "Supplier",
          businessName: name,
        }));

      const today = toIsoDate(new Date());

      if (creates === "Asset") {
        await saveAsset({
          ...emptyAssetDraft(today),
          name: transaction.description,
          category: ASSET_CATEGORY_MAP[category] ?? "Other",
          supplierId: contact.id,
          supplierName: contactDisplayName(contact),
          costPrice: String(transaction.amount),
          purchaseDate: transaction.date,
          gst,
        });
      } else if (creates === "Expense") {
        await createExpense.mutateAsync({
          draft: {
            ...emptyExpenseDraft(today),
            date: transaction.date,
            description: transaction.description,
            supplierId: contact.id,
            supplierName: contactDisplayName(contact),
            category,
            amount: transaction.amount,
            gst,
            // Reconciled against a line that has already cleared the bank, so
            // it is paid by definition — a "pending" expense created from a
            // settled payment would be asking to be paid twice.
            paidAmount: transaction.amount,
            vendorNote: notes.trim(),
          },
        });
      }
      /*
       * Income creates no second record. The money is already on the
       * statement and the transaction itself carries the category —
       * inventing an "income" row to point at would be a duplicate of the
       * line being coded.
       */

      /*
       * One write for the coding, per the store's own note: setting the
       * category and then the supplier would leave the row briefly
       * half-approved. GST is a separate toggle and only fired when the
       * answer actually changed — calling it unconditionally would flip a
       * row that was already right.
       */
      approveCoding(transaction.id, {
        category,
        supplier: contactDisplayName(contact),
      });
      if (gst !== transaction.gst) toggleGst(transaction.id);
      reconcile(transaction.id);

      toast.success(
        creates === "Income"
          ? "Recorded as income"
          : `${creates === "Asset" ? "Asset" : "Expense"} created and matched`,
        {
          description: `${transaction.description} · ${invoiceMoney(transaction.amount)}`,
        },
      );
      onDone();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't save that. Try again."));
    } finally {
      setSaving(false);
    }
  };

  // A component of the figure on the statement, never added on top.
  const gstAmount = gst ? taxInsideAmount(transaction.amount, tax.rate) : 0;

  return (
    <div className="space-y-5">
      {/*
        What saving will do, before the fields that decide it.

        Amber rather than the usual muted hint: this is the one control in the
        dialog that brings a record into existence, and the wording changes with
        the direction because "an expense will be created" is simply false for
        money coming in.
      */}
      <div className="flex items-start gap-3 rounded-[14px] border border-warning/30 bg-warning/10 p-4">
        <TriangleAlert
          className="mt-0.5 size-4 shrink-0 text-warning"
          aria-hidden
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">What happens when you save</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {moneyIn ? (
              <>
                This line is recorded as income against the category you choose,
                and marked off your review queue. No new expense or asset is
                created — the money is already in the account.
              </>
            ) : (
              <>
                {creates === "Asset"
                  ? "An asset is created"
                  : creates === "Expense"
                    ? "An expense is created"
                    : "An expense or an asset is created"}{" "}
                from the category you choose, dated{" "}
                {formatTransactionDate(transaction.date)} for{" "}
                {invoiceMoney(transaction.amount)}, and matched to this line.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="match-category" required>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="match-category" className="h-10">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {TRANSACTION_CATEGORY_TREE.filter((group) =>
                groups.includes(group.type),
              ).map((group) => (
                <SelectGroup key={group.type}>
                  <SelectLabel>{group.type}</SelectLabel>
                  {group.categories.map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {entry}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label={moneyIn ? "Client" : "Supplier"}
          htmlFor="match-supplier"
          required
        >
          <ContactCombobox
            id="match-supplier"
            value={supplier}
            onChange={setSupplier}
            contacts={contacts.map(contactDisplayName)}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="match-notes" hint="Optional.">
        <Textarea
          id="match-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Anything worth remembering about this one"
          rows={3}
        />
      </Field>

      {/*
        Tax as a component of the amount, not an addition to it. The figure on
        the statement is what was paid, so the switch reports what's inside it —
        which is why the number moves as it's flipped rather than the total.
      */}
      <div className="flex items-center justify-between gap-4 rounded-[14px] border border-border p-4">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">Include {tax.rateLabel}</p>
          <p className="text-xs text-muted-foreground tabular">
            {gst
              ? `${invoiceMoney(gstAmount)} of ${invoiceMoney(transaction.amount)}`
              : `No ${tax.word} on this one`}
          </p>
        </div>
        <Switch
          checked={gst}
          onCheckedChange={setGst}
          aria-label={`Include ${tax.word} at ${tax.rate}%`}
        />
      </div>

      <div className="flex justify-end border-t border-border pt-4">
        <Button disabled={!ready || saving} onClick={save}>
          <Check />
          Save &amp; Match
        </Button>
      </div>
    </div>
  );
}

/**
 * Find or create, in one control.
 *
 * A Popover over a Command, matching the industry picker and the client picker
 * — so the one box in this dialog that can invent a record behaves like every
 * other searchable field in the product. The create row only appears once
 * something has been typed that doesn't already exist, because "Create" with an
 * empty query is a row that can't do anything.
 */
function ContactCombobox({
  id,
  value,
  onChange,
  contacts,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  contacts: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const typed = query.trim();
  const exists = contacts.some(
    (name) => name.toLowerCase() === typed.toLowerCase(),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-10 w-full justify-between px-3 font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate">
            {value || "Find or create a contact"}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder="Search contacts…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No contact matches that.</CommandEmpty>
            <CommandGroup>
              {contacts.map((name) => (
                <CommandItem
                  key={name}
                  value={name}
                  onSelect={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      value === name ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  {name}
                </CommandItem>
              ))}
            </CommandGroup>
            {typed && !exists && (
              <CommandGroup className="border-t">
                <CommandItem
                  value={typed}
                  onSelect={() => {
                    onChange(typed);
                    setOpen(false);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Create &ldquo;{typed}&rdquo;
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ *
 * Assign to Multiple
 * ------------------------------------------------------------------ */

const KINDS = ["All", "Expense", "Asset"] as const;
type KindFilter = (typeof KINDS)[number];

/** sole-webapp's status pills: overdue red, due amber, partially paid green. */
const STATUS_TONE: Record<string, string> = {
  overdue: "bg-destructive/10 text-destructive",
  due: "bg-warning/10 text-warning",
  partially_paid: "bg-success/10 text-success",
};

/**
 * Spread one line across several records — sole-webapp's `MatchList`.
 *
 * Money out lists unmatched expenses and assets priced up to the line's
 * amount; money in lists open invoices (due, overdue, partially paid), where
 * one foreign-currency invoice can't be mixed with others. Nothing checks the
 * total against the line — the server takes partial matches, as there.
 */
export function AssignToMultipleTab({
  transaction,
  candidates,
  loading,
  error,
  selected,
  onToggle,
  onClear,
  onDone,
}: {
  transaction: Transaction;
  candidates: MatchCandidate[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  onToggle: (key: string) => void;
  onClear: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  // An invoice's `total` is in the business's own currency, whichever country that is.
  const baseCurrency = useCountryContext().country.currency;
  const direction: MatchDirection =
    transaction.type === "Credit" ? "Credit" : "Debit";
  const invoices = direction === "Credit";
  const noun = invoices ? "Invoices" : "Items";

  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState<KindFilter>("All");

  const term = query.trim().toLowerCase();
  const rows = candidates.filter((item) => {
    if (!invoices && kind !== "All" && item.kind !== kind) return false;
    if (!term) return true;
    return (
      item.title.toLowerCase().includes(term) ||
      item.subtitle.toLowerCase().includes(term) ||
      item.contactName.toLowerCase().includes(term) ||
      String(item.amount).includes(term)
    );
  });

  const chosen = candidates.filter((item) => selected.has(item.key));
  const chosenTotal = chosen.reduce((sum, item) => sum + item.amount, 0);

  const match = useMutation({
    mutationFn: () => matchToMultipleApi(transaction.id, direction, chosen),
    onSuccess: (message) => {
      toast.success(message || "Transaction matched successfully!");
      onClear();
      void queryClient.invalidateQueries({ queryKey: BANK_TRANSACTIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["match-candidates"] });
      onDone();
    },
    onError: (failure) =>
      toast.error(
        apiErrorMessage(failure, failure.message || "Failed to match transaction."),
      ),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              invoices
                ? "Search by invoice, client, description or amount…"
                : "Search by description, supplier, category or amount…"
            }
            aria-label="Search records to match"
            className="pl-9"
          />
        </div>
        {!invoices && (
          <Select
            value={kind}
            onValueChange={(next) => setKind(next as KindFilter)}
          >
            <SelectTrigger className="w-36" aria-label="Filter by type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {entry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title="Couldn't load records" body={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            term || kind !== "All"
              ? "Nothing matches that"
              : invoices
                ? "No Invoices Available"
                : "No Expenses or Assets Available"
          }
          body={
            invoices
              ? "Only due, overdue and partially paid invoices that aren't already matched appear here."
              : `Only unmatched expenses and assets up to ${invoiceMoney(transaction.amount)} appear here.`
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>{invoices ? "Invoice #" : "Description"}</TableHead>
                <TableHead>{invoices ? "Client" : "Supplier"}</TableHead>
                {invoices && <TableHead>Due date</TableHead>}
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>{invoices ? "Status" : "Type"}</TableHead>
                <TableHead className="w-24 text-right">Select</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => {
                const checked = selected.has(item.key);
                const allowed = canSelectCandidate(item, chosen);
                return (
                  <TableRow
                    key={item.key}
                    data-state={checked ? "selected" : undefined}
                    className={cn(!allowed && "opacity-50")}
                  >
                    <TableCell>
                      <Checkbox
                        checked={checked}
                        disabled={!allowed}
                        onCheckedChange={() => onToggle(item.key)}
                        aria-label={`Select ${item.title}`}
                      />
                    </TableCell>
                    <TableCell className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      {item.subtitle && (
                        <p className="truncate text-xs text-muted-foreground">
                          {item.subtitle}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="min-w-0">
                      <p className="truncate text-sm">{item.contactName || "—"}</p>
                      {item.contactEmail && (
                        <p className="truncate text-xs text-muted-foreground">
                          {item.contactEmail}
                        </p>
                      )}
                    </TableCell>
                    {invoices && (
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular">
                        {item.date ? formatTransactionDate(item.date) : "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-right text-sm font-medium tabular">
                      {formatDocumentMoney(item.amount, baseCurrency)}
                      {item.fxAmount && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {item.currency} {item.fxAmount}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full border-transparent px-2 py-0 text-[11px] font-medium capitalize",
                          invoices
                            ? (STATUS_TONE[item.status] ?? "bg-muted text-muted-foreground")
                            : item.kind === "Asset"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {invoices ? item.status.replace(/_/g, " ") : item.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={checked ? "secondary" : "outline"}
                        size="sm"
                        disabled={!allowed}
                        onClick={() => onToggle(item.key)}
                      >
                        {checked ? "Selected" : "Select"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {invoices && chosen.some((item) => item.fxAmount) && (
        <p className="text-xs text-muted-foreground">
          A foreign-currency invoice is matched on its own — clear it to pick
          {baseCurrency} invoices instead.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground tabular">
          <span className="font-medium text-foreground">{chosen.length}</span>{" "}
          {noun} selected · Matching Amount{" "}
          <span className="font-medium text-foreground">
            {formatDocumentMoney(chosenTotal, baseCurrency)}
          </span>
        </p>
        <Button
          disabled={chosen.length === 0 || match.isPending}
          onClick={() => match.mutate()}
        >
          {match.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Check />
          )}
          {match.isPending ? "Matching..." : `Match ${chosen.length} ${noun}`}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Refund
 * ------------------------------------------------------------------ */

/**
 * Money going back against a record already matched — sole-webapp's
 * `MatchCreditNote`.
 *
 * Money in is a Vendor Refund: a supplier returning money against one of
 * your matched expenses. Money out is a Client Refund: you returning money
 * against one of your matched invoices. One record at a time; matching
 * writes a credit note for it and settles this line against that note.
 */
export function RefundTab({
  transaction,
  onDone,
}: {
  transaction: Transaction;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const direction: MatchDirection =
    transaction.type === "Credit" ? "Credit" : "Debit";
  const vendor = direction === "Credit";
  const label = vendor ? "Vendor Refund" : "Client Refund";
  const noun = vendor ? "expense" : "invoice";

  const [page, setPage] = React.useState(1);
  const [chosen, setChosen] = React.useState<RefundRecord | null>(null);

  const recordsQuery = useQuery({
    queryKey: ["refund-records", direction, page],
    queryFn: () => fetchRefundRecords(direction, page),
    placeholderData: (previous) => previous,
  });
  const records = recordsQuery.data?.records ?? [];
  const totalPages = recordsQuery.data?.totalPages ?? 1;

  const match = useMutation({
    mutationFn: () => {
      if (!chosen) throw new Error(`Please select a matched ${noun}.`);
      return matchRefundApi(transaction.id, direction, chosen);
    },
    onSuccess: (message) => {
      toast.success(message);
      void queryClient.invalidateQueries({ queryKey: BANK_TRANSACTIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["refund-records"] });
      onDone();
    },
    onError: (failure) =>
      toast.error(
        apiErrorMessage(
          failure,
          failure.message || "Failed to match credit note. Please try again.",
        ),
      ),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {vendor ? "Matched Expenses" : "Matched Invoices"}
        </h3>
        <p className="text-xs text-muted-foreground tabular">
          {recordsQuery.data?.total ?? 0} total
        </p>
      </div>

      {recordsQuery.isPending ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : recordsQuery.isError ? (
        <EmptyState
          title="Couldn't load records"
          body={apiErrorMessage(recordsQuery.error, "Try again in a moment.")}
        />
      ) : records.length === 0 ? (
        <EmptyState
          title={vendor ? "No matched expenses found." : "No matched invoices found."}
          body={`A refund goes back against a matched ${noun}. Once one is matched it'll appear here.`}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{vendor ? "Expense" : "Invoice"}</TableHead>
                  <TableHead>{vendor ? "Supplier" : "Client"}</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  {!vendor && <TableHead>Status</TableHead>}
                  <TableHead className="w-24 text-right">Select</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => {
                  const checked = chosen?.id === record.id;
                  return (
                    <TableRow
                      key={record.id}
                      data-state={checked ? "selected" : undefined}
                    >
                      <TableCell className="text-sm font-medium tabular">
                        {record.title}
                      </TableCell>
                      <TableCell className="min-w-0">
                        <span className="block truncate text-sm">
                          {record.contactName || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular">
                        {record.date ? formatTransactionDate(record.date) : "-"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular">
                        {invoiceMoney(record.amount)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular">
                        {invoiceMoney(record.remaining)}
                      </TableCell>
                      {!vendor && (
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full border-transparent px-2 py-0 text-[11px] font-medium capitalize",
                              record.status === "paid"
                                ? "bg-success/10 text-success"
                                : "bg-warning/10 text-warning",
                            )}
                          >
                            {record.status ? record.status.replace(/_/g, " ") : "-"}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        {/* One record, not several: choosing another replaces. */}
                        <Button
                          variant={checked ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => setChosen(checked ? null : record)}
                        >
                          {checked ? "Selected" : "Select"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground tabular">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || recordsQuery.isFetching}
                  onClick={() => setPage(page - 1)}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || recordsQuery.isFetching}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          {chosen ? `1 ${noun} selected` : `No ${noun} selected`}
        </p>
        <Button
          disabled={!chosen || match.isPending}
          onClick={() => match.mutate()}
        >
          {match.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Check />
          )}
          {match.isPending ? "Matching..." : `Match ${label}`}
        </Button>
      </div>
    </div>
  );
}

/** Nothing to show, and which of the two reasons it is. */
function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <Search className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-[44ch] text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
