"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowLeftRight,
  FileText,
  Link2,
  Loader2,
  Paperclip,
  Percent,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
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
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { RuleCategorySelect } from "@/components/rules/rule-category-select";
import { ContactPersonSelect } from "@/components/transactions/contact-person-select";
import { FundCombobox } from "@/components/super/fund-combobox";
import { apiErrorMessage } from "@/lib/api-error";
import { fetchCompanyContacts } from "@/lib/company-contacts";
import { documentTax } from "@/lib/country-context";
import { formatDateLabel, invoiceMoney, parseIsoDate, toIsoDate } from "@/lib/invoices";
import {
  AMOUNT_INPUT_PATTERN,
  ASSET,
  EXPENSE,
  MANUAL_TRANSACTION_TYPES,
  accountsForType,
  autofillFromMatches,
  canSelectMatch,
  contactIdForClient,
  contactTypeFor,
  sendsContactPair,
  createManualTransaction,
  defaultAccountFor,
  earliestTransactionDate,
  emptyManualTransactionDraft,
  fetchInvestmentProperties,
  fetchManualAccounts,
  fetchPossibleMatches,
  isCapitalLike,
  isMatching,
  isPropertyIncome,
  isSuperContribution,
  manualTransactionIssues,
  matchKindFor,
  toggleMatch,
  type ManualField,
  type ManualTransactionDraft,
  type ManualTransactionTypeId,
  type PossibleMatch,
} from "@/lib/manual-transaction";
import { cn } from "@/lib/utils";
import { useCountryContext } from "@/hooks/use-country-context";
import { activeCurrencySymbol } from "@/lib/country-context";

/** sole-webapp's attachment limits: five files, images or PDF, 20MB each. */
const MAX_FILES = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_FILES = "image/*,application/pdf";

const ALL_FIELDS: ManualField[] = [
  "type",
  "account",
  "amount",
  "date",
  "contact",
  "property",
  "name",
  "description",
  "match",
];

/**
 * Manual entry — sole-webapp's `ManualTransaction` form, in this app's layout:
 * a full view rather than a modal. Its fields, labels and rules are
 * sole-webapp's; the account list narrows to the chosen transaction type.
 *
 * Not here yet: the Client/Vendor Refund accounts, which open sole-webapp's
 * separate credit-note refund flow, and editing an existing transaction.
 */
export function ManualEntryForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const today = React.useMemo(() => toIsoDate(new Date()), []);
  const minDate = React.useMemo(
    () => parseIsoDate(earliestTransactionDate(today)),
    [today],
  );
  const maxDate = React.useMemo(() => parseIsoDate(today), [today]);

  const [draft, setDraft] = React.useState<ManualTransactionDraft>(() =>
    emptyManualTransactionDraft(today),
  );
  const [files, setFiles] = React.useState<File[]>([]);
  const [touched, setTouched] = React.useState<
    Partial<Record<ManualField, boolean>>
  >({});
  const [duplicateMessage, setDuplicateMessage] = React.useState<
    string | null
  >(null);

  const patch = (next: Partial<ManualTransactionDraft>) =>
    setDraft((current) => ({ ...current, ...next }));
  const touch = (...fields: ManualField[]) =>
    setTouched((current) => {
      const next = { ...current };
      fields.forEach((field) => (next[field] = true));
      return next;
    });

  /* ---------------- data ---------------- */

  const accountsQuery = useQuery({
    queryKey: ["manual-transaction-accounts"],
    queryFn: fetchManualAccounts,
  });
  const accounts = React.useMemo(
    () => accountsForType(accountsQuery.data ?? [], draft.type),
    [accountsQuery.data, draft.type],
  );
  const accountOptions = React.useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        name: account.name,
        parentName: account.parentName,
      })),
    [accounts],
  );

  // Land on the type's default account whenever the current one isn't in the
  // list — first load, and every type change. The name is left alone: as in
  // sole-webapp, only picking an account by hand fills it in.
  React.useEffect(() => {
    if (accounts.length === 0) return;
    if (accounts.some((account) => account.id === draft.accountId)) return;
    const fallback = defaultAccountFor(accounts, draft.type);
    if (fallback) {
      setDraft((current) => ({ ...current, accountId: fallback.id }));
    }
  }, [accounts, draft.accountId, draft.type]);

  const contactType = contactTypeFor(draft.type);
  const propertyIncome = isPropertyIncome(draft.type, draft.accountId);
  const superContribution = isSuperContribution(draft.type, draft.accountId);
  const capitalLike = isCapitalLike(draft.type);
  const matching = isMatching(draft);
  // "GST" in AU and NZ, "VAT" in ZA, or the business's own name for it.
  const { country } = useCountryContext();
  const taxName = documentTax(country, draft.date).word;

  const propertiesQuery = useQuery({
    queryKey: ["investment-properties", "options"],
    queryFn: fetchInvestmentProperties,
    enabled: propertyIncome,
  });

  const matchKind = matchKindFor(draft.type, draft.accountId);
  const matchesQuery = useQuery({
    queryKey: ["manual-possible-matches", draft.type, matchKind, draft.propertyId],
    queryFn: () =>
      fetchPossibleMatches(draft.type, draft.accountId, draft.propertyId),
    enabled:
      draft.match &&
      !capitalLike &&
      (matchKind !== "property-income" || !!draft.propertyId),
  });
  const matches = React.useMemo(
    () => matchesQuery.data ?? [],
    [matchesQuery.data],
  );

  React.useEffect(() => {
    if (matchesQuery.isError) {
      toast.error(
        apiErrorMessage(matchesQuery.error, "Couldn't load possible matches."),
      );
    }
  }, [matchesQuery.isError, matchesQuery.error]);

  /* ---------------- validation ---------------- */

  const issues = manualTransactionIssues(draft, today, matches);
  const issueFor = (field: ManualField) =>
    touched[field] ? issues[field] : undefined;

  /* ---------------- handlers ---------------- */

  const changeType = (type: ManualTransactionTypeId) => {
    setDraft((current) => ({
      ...emptyManualTransactionDraft(today),
      type,
      // Kept across a type change: they don't depend on the type.
      amount: current.amount,
      date: current.date,
      description: current.description,
    }));
    setFiles([]);
  };

  const changeAccount = (accountId: string) => {
    const account = accounts.find((entry) => entry.id === accountId);
    const nowPropertyIncome = isPropertyIncome(draft.type, accountId);
    patch({
      accountId,
      // Choosing an account names the expense/asset after it, as sole-webapp does.
      name: account?.name ?? draft.name,
      matchIds: [],
      // Property income has no contact; any other account has no property.
      ...(nowPropertyIncome
        ? { contactId: "", contactName: "", primaryContactId: "" }
        : { propertyId: "" }),
      // A fund and a supplier are different id spaces: switching either way
      // drops whichever was picked.
      ...(isSuperContribution(draft.type, accountId) !== superContribution
        ? { contactId: "", contactName: "", primaryContactId: "" }
        : {}),
    });
  };

  const applyMatchSelection = (matchIds: string[]) => {
    const fill = autofillFromMatches(matches, matchIds);
    if (!fill) {
      patch({
        matchIds,
        amount: "",
        description: "",
        contactId: "",
        contactName: "",
        primaryContactId: "",
      });
      return;
    }
    const syncedAccount = accounts.find((entry) => entry.id === fill.accountId);
    patch({
      matchIds,
      amount: fill.amount,
      description: fill.description,
      date: fill.date || draft.date,
      contactId: fill.clientId,
      contactName: "",
      primaryContactId: "",
      ...(syncedAccount ? { accountId: syncedAccount.id } : {}),
    });
  };

  const toggleMatching = (on: boolean) => {
    // Unticking drops the selection too, so the save can't quietly stay on
    // the match path with the table hidden — and the contact those rows
    // filled in, since the field comes back empty-handed otherwise.
    patch(
      on || draft.matchIds.length === 0
        ? { match: on, matchIds: [] }
        : {
            match: on,
            matchIds: [],
            contactId: "",
            contactName: "",
            primaryContactId: "",
          },
    );
  };

  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...files];
    for (const file of Array.from(picked)) {
      if (next.length >= MAX_FILES) {
        toast.error(`You can attach up to ${MAX_FILES} files.`);
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} is larger than 20MB.`);
        continue;
      }
      if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
        toast.error(`${file.name} isn't an image or PDF.`);
        continue;
      }
      next.push(file);
    }
    setFiles(next);
  };

  const save = useMutation({
    mutationFn: async () => {
      let toSave = draft;
      if (sendsContactPair(draft) && !draft.primaryContactId) {
        const type = contactTypeFor(draft.type);
        // A failed lookup costs only the contact link, not the save.
        const contacts = await queryClient
          .fetchQuery({
            queryKey: ["company-contacts", type],
            queryFn: () => fetchCompanyContacts(type),
          })
          .catch(() => []);
        toSave = {
          ...draft,
          primaryContactId: contactIdForClient(
            draft.contactId,
            draft.contactName,
            contacts,
          ),
        };
      }
      return createManualTransaction(toSave, files);
    },
    onSuccess: (result) => {
      if (result.duplicate) {
        setDuplicateMessage(result.message);
        return;
      }
      toast.success("Transaction added");
      void queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      router.push("/transactions");
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, error.message || "Couldn't save the transaction."));
    },
  });

  const onSave = () => {
    touch(...ALL_FIELDS);
    const first = Object.values(issues)[0];
    if (first) {
      toast.error(first);
      return;
    }
    save.mutate();
  };

  /* ---------------- render ---------------- */

  const showContact = !capitalLike || draft.type === 5;
  // Hidden as soon as Match is ticked, rows picked or not — as in sole-webapp.
  const contactVisible = showContact && !propertyIncome && !draft.match;
  const showName = (draft.type === EXPENSE || draft.type === ASSET) && !matching;
  const issueCount = Object.keys(issues).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/transactions">
            <ArrowLeft />
            Transactions
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Add Transaction
          </h1>
          <p className="text-sm text-muted-foreground">
            Record a transaction your bank feed hasn&apos;t imported. Fields
            marked with <span className="text-destructive">*</span> are
            required.
          </p>
        </div>
      </div>

      <FormSection
        icon={ArrowLeftRight}
        title="Transaction details"
        description="What moved, against which account, and when."
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Transaction Type" required>
          <Select
            value={String(draft.type)}
            onValueChange={(value) =>
              changeType(Number(value) as ManualTransactionTypeId)
            }
          >
            <SelectTrigger aria-label="Transaction Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MANUAL_TRANSACTION_TYPES.map((option) => (
                <SelectItem key={option.id} value={String(option.id)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <RuleCategorySelect
          label="Choose Account"
          placeholder="Select an account"
          searchPlaceholder="Search accounts..."
          showParent={false}
          categories={accountOptions}
          // Loading until there's something to pick: the first fetch, a
          // retry or refetch with nothing loaded yet, and the moment before
          // the type's default account is set.
          loading={
            !accountsQuery.isError &&
            (accountsQuery.isPending ||
              (accountsQuery.isFetching && accounts.length === 0) ||
              (accounts.length > 0 && !draft.accountId))
          }
          categoryId={draft.accountId}
          onSelect={(accountId) => {
            touch("account");
            changeAccount(accountId);
          }}
          error={
            accountsQuery.isError
              ? apiErrorMessage(accountsQuery.error, "Couldn't load accounts.")
              : issueFor("account")
          }
        />

        <Field
          label={`Amount (${activeCurrencySymbol()})`}
          htmlFor="manual-amount"
          required
          error={issueFor("amount")}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {activeCurrencySymbol()}
            </span>
            <Input
              id="manual-amount"
              value={draft.amount}
              inputMode="decimal"
              placeholder="Enter amount"
              onChange={(event) => {
                const value = event.target.value;
                // Same keystroke filter as sole-webapp: digits, two decimals.
                if (!AMOUNT_INPUT_PATTERN.test(value)) return;
                patch({ amount: value });
              }}
              onBlur={() => touch("amount")}
              aria-invalid={!!issueFor("amount")}
              className={cn(
                "pl-7 tabular",
                issueFor("amount") &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </div>
        </Field>

        <Field label="Transaction Date" required error={issueFor("date")}>
          <DatePicker
            label="Transaction Date"
            value={draft.date}
            fromDate={minDate}
            toDate={maxDate}
            onChange={(date) => {
              touch("date");
              patch({ date });
            }}
          />
        </Field>

        {propertyIncome && (
          <div className="sm:col-span-2">
            <Field label="Property" required error={issueFor("property")}>
              {propertiesQuery.isLoading ? (
                <Shimmer className="h-10 w-full rounded-md" />
              ) : (
                <Select
                  value={draft.propertyId}
                  onValueChange={(propertyId) => {
                    touch("property");
                    patch({ propertyId, matchIds: [] });
                  }}
                >
                  <SelectTrigger aria-label="Property">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {(propertiesQuery.data ?? []).length === 0 ? (
                      <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                        No investment properties found
                      </p>
                    ) : (
                      (propertiesQuery.data ?? []).map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>
        )}

        {contactVisible &&
          (superContribution ? (
            <FundCombobox
              fundId={draft.contactId}
              fundName={draft.contactName}
              onSelect={({ fundId, fundName }) => {
                touch("contact");
                patch({ contactId: fundId, contactName: fundName });
              }}
              error={issueFor("contact")}
            />
          ) : (
            <ContactPersonSelect
              type={contactType}
              contactId={draft.primaryContactId}
              name={draft.contactName}
              onSelect={(pick) => {
                touch("contact");
                patch({
                  contactId: pick.clientId,
                  primaryContactId: pick.contactId,
                  contactName: pick.name,
                });
              }}
              error={issueFor("contact")}
            />
          ))}

        {showName && (
          <Field
            label={draft.type === EXPENSE ? "Name of Expense" : "Name of Asset"}
            htmlFor="manual-name"
            required
            error={issueFor("name")}
          >
            <Input
              id="manual-name"
              value={draft.name}
              placeholder={
                draft.type === EXPENSE ? "Enter expense name" : "Enter asset name"
              }
              onChange={(event) => patch({ name: event.target.value })}
              onBlur={() => touch("name")}
              aria-invalid={!!issueFor("name")}
              className={cn(
                issueFor("name") &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </Field>
        )}

        <div className="sm:col-span-2">
          <Field
            label="Description"
            htmlFor="manual-description"
            required
            error={issueFor("description")}
          >
            <Textarea
              id="manual-description"
              rows={2}
              value={draft.description}
              placeholder="Enter description"
              onChange={(event) => patch({ description: event.target.value })}
              onBlur={() => touch("description")}
              aria-invalid={!!issueFor("description")}
              className={cn(
                issueFor("description") &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </Field>
        </div>
      </FormSection>

      {!capitalLike && (
        <FormSection
          icon={Percent}
          title={`${taxName} & matching`}
          description="Tax treatment, receipts, and any record this settles."
          className="space-y-3"
        >
          {!matching && !propertyIncome && (
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <p className="text-sm font-medium">
                {superContribution ? "Tax Deduction Contribution" : `Include ${taxName}`}
              </p>
              <Switch
                checked={superContribution ? draft.taxable : draft.gstIncluded}
                onCheckedChange={(checked) =>
                  patch(
                    superContribution
                      ? { taxable: checked }
                      : { gstIncluded: checked },
                  )
                }
                aria-label={
                  superContribution ? "Tax Deduction Contribution" : `Include ${taxName}`
                }
              />
            </div>
          )}

          {(draft.type === EXPENSE || draft.type === ASSET) && !matching && (
            <Attachments
              files={files}
              onAdd={addFiles}
              onRemove={(index) =>
                setFiles((current) => current.filter((_, i) => i !== index))
              }
            />
          )}

          <div
            className={cn(
              "space-y-3 rounded-md border p-3 transition-colors",
              draft.match && "border-primary bg-primary/5",
            )}
          >
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={draft.match}
                onCheckedChange={(checked) => toggleMatching(checked === true)}
                className="mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">
                  Match this manual transaction
                </span>
                <span className="block text-xs text-muted-foreground">
                  When enabled, you can match this entry to existing invoices,
                  property incomes, expenses or assets. Selecting rows below
                  will auto-fill amount, date and description for you.
                </span>
              </span>
            </label>

            {draft.match && (
              <MatchTable
                rows={matches}
                loading={matchesQuery.isFetching}
                needsProperty={matchKind === "property-income" && !draft.propertyId}
                selectedIds={draft.matchIds}
                onToggle={(row) => {
                  touch("match");
                  applyMatchSelection(toggleMatch(row, draft.matchIds));
                }}
                onClear={() => applyMatchSelection([])}
                error={issueFor("match")}
              />
            )}
          </div>
        </FormSection>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        {issueCount > 0 && Object.keys(touched).length > 0 && (
          <p className="self-center text-xs text-muted-foreground">
            {issueCount === 1
              ? Object.values(issues)[0]
              : `${issueCount} fields need attention`}
          </p>
        )}
        <Button variant="outline" asChild>
          <Link href="/transactions">Cancel</Link>
        </Button>
        <Button onClick={onSave} disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          {save.isPending ? "Please wait..." : "Create & Match"}
        </Button>
      </div>

      <AlertDialog
        open={duplicateMessage !== null}
        onOpenChange={(open) => !open && setDuplicateMessage(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate Transaction</AlertDialogTitle>
            <AlertDialogDescription>{duplicateMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Up to five receipts, sent with the transaction as `files[]`. */
function Attachments({
  files,
  onAdd,
  onRemove,
}: {
  files: File[];
  onAdd: (files: FileList | null) => void;
  onRemove: (index: number) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Attachments</p>
          <p className="text-xs text-muted-foreground">
            Images or PDF, up to {MAX_FILES} files of 20MB each.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={files.length >= MAX_FILES}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip />
          Add files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILES}
          className="hidden"
          onChange={(event) => {
            onAdd(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={`Remove ${file.name}`}
                onClick={() => onRemove(index)}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  due: "bg-warning/10 text-warning",
  overdue: "bg-destructive/10 text-destructive",
  paid: "bg-success/10 text-success",
  sent: "bg-success/10 text-success",
  partially_paid: "bg-warning/10 text-warning",
};

/** sole-webapp's `ManualTransactionList`: the records this entry could settle. */
function MatchTable({
  rows,
  loading,
  needsProperty,
  selectedIds,
  onToggle,
  onClear,
  error,
}: {
  rows: PossibleMatch[];
  loading: boolean;
  needsProperty: boolean;
  selectedIds: string[];
  onToggle: (row: PossibleMatch) => void;
  onClear: () => void;
  error?: string;
}) {
  const selected = rows.filter((row) => selectedIds.includes(row.id));
  const total = selected.reduce((sum, row) => sum + row.amount, 0);
  const kind = rows[0]?.kind;

  if (needsProperty) {
    return (
      <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        Select a property to see its income records.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Link2 className="size-3.5" />
          Selected <span className="font-medium text-foreground">{selected.length}</span>
          <span aria-hidden>·</span>
          Total{" "}
          <span className="font-medium text-foreground tabular">
            {invoiceMoney(total)}
          </span>
        </span>
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>

      <div className="max-h-80 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>
                {kind === "property-income"
                  ? "Property"
                  : kind === "invoice"
                    ? "Invoice No"
                    : "Description"}
              </TableHead>
              {kind !== "property-income" && (
                <TableHead>{kind === "invoice" ? "Client" : "Supplier"}</TableHead>
              )}
              {kind === "invoice" && <TableHead>Status</TableHead>}
              {kind !== "asset" && <TableHead className="text-right">Remaining</TableHead>}
              <TableHead>{kind === "invoice" ? "Due Date" : "Date"}</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [0, 1, 2].map((key) => (
                <TableRow key={key}>
                  <TableCell colSpan={7}>
                    <Shimmer className="h-5 w-full rounded" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  No records found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const checked = selectedIds.includes(row.id);
                const selectable = canSelectMatch(row, rows, selectedIds);
                return (
                  <TableRow
                    key={row.id}
                    data-state={checked ? "selected" : undefined}
                    className={cn(!selectable && "opacity-50")}
                  >
                    <TableCell>
                      <Checkbox
                        checked={checked}
                        disabled={!selectable}
                        onCheckedChange={() => onToggle(row)}
                        aria-label={`Select ${row.title}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-[16rem]">
                      <p className="truncate font-medium">{row.title}</p>
                      {row.subtitle && (
                        <p className="truncate text-xs text-muted-foreground">
                          {row.subtitle}
                        </p>
                      )}
                    </TableCell>
                    {row.kind !== "property-income" && (
                      <TableCell className="truncate">{row.contactName}</TableCell>
                    )}
                    {row.kind === "invoice" && (
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "capitalize",
                            STATUS_TONE[row.status] ?? "bg-muted text-muted-foreground",
                          )}
                        >
                          {row.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                    )}
                    {row.kind !== "asset" && (
                      <TableCell className="text-right tabular">
                        {invoiceMoney(row.remaining ?? 0)}
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap tabular">
                      {row.date ? formatDateLabel(row.date) : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {invoiceMoney(row.amount)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
