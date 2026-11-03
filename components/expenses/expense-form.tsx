"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Loader2,
  Paperclip,
  Percent,
  ReceiptText,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shimmer } from "@/components/ui/shimmer";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { ItemLookupInput } from "@/components/documents/item-lookup-input";
import { BusinessContactSelect } from "@/components/documents/business-contact-select";
import { ExpenseCategorySelect } from "@/components/expenses/expense-category-select";
import {
  MultiAttachmentUpload,
  type MultiAttachmentRow,
} from "@/components/shared/multi-attachment-upload";
import { useUnsavedChanges } from "@/components/ui/unsaved-changes";
import {
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
} from "@/hooks/use-expenses-query";
import { apiErrorMessage } from "@/lib/api-error";
import { fetchBusinessContacts } from "@/lib/clients";
import { deleteSourceDocument, uploadSourceDocument } from "@/lib/file-upload";
import { searchExpenseDescriptions } from "@/lib/invoice-item-search";
import { toIsoDate } from "@/lib/invoices";
import {
  amountError,
  draftFromExpense,
  duplicateExpenseDraft,
  emptyExpenseDraft,
  expenseIssues,
  fetchExpenseCategories,
  fetchExpenseDetail,
  type ExpenseDraft,
  isAmountLocked,
} from "@/lib/expenses";
import { invoiceMoney } from "@/lib/invoices";
import { countryCurrencySymbol, documentTax, inclusiveTaxHint, inclusiveTaxSplitHint } from "@/lib/country-context";
import { useCountryContext } from "@/hooks/use-country-context";
import { cn } from "@/lib/utils";
import { useCaptureStore } from "@/stores/capture";

/** How the Business amount field is entered — a dollar figure, or a percent of the price. */
type SplitMode = "$" | "%";

export function ExpenseForm({
  expenseId,
  copyOfId,
}: {
  expenseId?: string;
  /** An expense being duplicated: its values seed a new record, not an edit. */
  copyOfId?: string;
}) {
  const router = useRouter();
  const createExpense = useCreateExpenseMutation();
  const updateExpense = useUpdateExpenseMutation();

  // Fetched directly rather than read off the list store — a direct link to
  // `/expenses/:id` (or a duplicate of it) can load before the list has.
  const editingQuery = useQuery({
    queryKey: ["expense", expenseId],
    queryFn: () => fetchExpenseDetail(expenseId as string),
    enabled: !!expenseId,
  });
  const editing = editingQuery.data;
  // Matched: the Expenses list takes Edit away from it, so a direct link keeps the amount fixed.
  const amountLocked = editing ? isAmountLocked(editing) : false;

  const copyOfQuery = useQuery({
    queryKey: ["expense", copyOfId],
    queryFn: () => fetchExpenseDetail(copyOfId as string),
    enabled: !!copyOfId,
  });
  const copyOf = copyOfQuery.data;

  const [draft, setDraft] = React.useState<ExpenseDraft>(() =>
    emptyExpenseDraft(toIsoDate(new Date())),
  );
  /** Kept as typed text so an invalid amount can be shown, not swallowed. */
  const [amountInput, setAmountInput] = React.useState("");

  /*
   * GST in the business's own terms, from /country-context: the word (GST, VAT),
   * the currency symbol, and the inclusive split worked through at the rate — the
   * expense's recorded rate when it has one, else the business's on the expense
   * date (its custom rate, or 10% AU / 15% NZ).
   */
  const { country } = useCountryContext();
  const expenseForm = country.forms.expense;
  const taxField = expenseForm?.fields.find((field) => field.key === "gst") ?? null;
  const priceField = expenseForm?.fields.find((field) => field.key === "price") ?? null;
  const expenseTax = documentTax(country, draft.date);
  const taxRate = editing?.gstPercent != null && editing.gstPercent > 0 ? editing.gstPercent : expenseTax.rate;
  const taxLabel = taxField?.label ?? `Include ${expenseTax.word}`;
  // Before a price is typed, a worked example at the rate; once one is, see `taxHint` below.
  const taxHintExample =
    taxField?.hint && taxField.rate === taxRate ? taxField.hint : inclusiveTaxHint(country, taxRate, expenseTax.word);
  const currencyMark = priceField?.symbol ?? countryCurrencySymbol(country);
  // A business that has said it isn't registered can't claim tax, so it isn't offered
  // (the server would drop it anyway). Switched off in Settings is not the same:
  // its expenses have always been able to carry GST, and still can.
  const taxOffered = country.effectiveTax.registered;
  /** Errors surface once the form has been edited, as Save is disabled. */
  const [edited, setEdited] = React.useState(false);
  // `edited` doubles as the dirty flag: it's set by the same patch calls.
  const { guardNavigate, dialog: unsavedDialog } = useUnsavedChanges(edited);

  /**
   * Up to 5 freshly-picked files on a brand-new expense: there's no id yet
   * for any of them to attach to, so they all ride embedded in the create
   * request itself (`createExpenseApi(draft, files)`) rather than a separate
   * call each — sole-webapp does the same in its own create mode (FilePond's
   * `process` hands back a client-only `temp-<id>` with no API call, for
   * every file in the queue, until the form's own Save).
   */
  const [pendingFiles, setPendingFiles] = React.useState<
    { key: string; file: File; previewUrl: string }[]
  >([]);
  /**
   * Editing an expense that already exists is the opposite: sole-webapp
   * uploads/deletes each file against the generic documents endpoint the
   * instant it's picked or removed (`components/Common/UploadMultiple.js`),
   * live, never deferred to this form's own Save — same as the business logo
   * editor already does (`EditBusinessScreen`). Seeded once from the real
   * `attachments[]` the detail fetch carries, then kept in step locally by
   * every add/remove so Save never needs to touch it.
   */
  const [attachmentRows, setAttachmentRows] = React.useState<MultiAttachmentRow[]>([]);

  /** Which unit the Business amount field reads/writes — a view, not stored data. */
  const [splitMode, setSplitMode] = React.useState<SplitMode>("$");
  /**
   * What's actually typed into Business amount, kept as its own free-typed
   * text — same reason `amountInput` is separate from `amount`. Deriving the
   * field's displayed value straight from a rounded computation (as this
   * used to) meant it re-formatted itself after every keystroke, which is
   * what made it look like the field couldn't be typed into at all in "%"
   * mode (dividing by a still-empty Price rounds straight back to nothing).
   */
  const [businessInput, setBusinessInput] = React.useState("");

  // The detail fetch lands after the form's first render — seed the draft
  // (and the amount text) once, so it doesn't clobber anything already typed.
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (seededRef.current) return;
    const today = toIsoDate(new Date());
    if (editing) {
      seededRef.current = true;
      setDraft(draftFromExpense(editing));
      setAmountInput(String(editing.totalAmount));
      setBusinessInput(editing.isSplit ? String(editing.amount) : "");
      setAttachmentRows(
        editing.attachments.map((attachment) => ({
          key: attachment.documentId,
          name: attachment.name,
          url: attachment.url,
          status: "idle" as const,
        })),
      );
    } else if (copyOf) {
      seededRef.current = true;
      setDraft(duplicateExpenseDraft(copyOf, today));
      setAmountInput(String(copyOf.totalAmount));
      setBusinessInput(copyOf.isSplit ? String(copyOf.amount) : "");
    }
  }, [editing, copyOf]);

  React.useEffect(() => {
    if (copyOfId && copyOfQuery.isError) {
      toast.error(
        "Couldn't load that expense to copy — starting blank instead.",
      );
    }
  }, [copyOfId, copyOfQuery.isError]);

  /*
   * A receipt read by Create expense → Upload receipt. The chooser leaves the
   * reading in a store (it's a different route); it's taken exactly once, only
   * for a brand-new expense, and fills what sole-webapp's own capture does —
   * description, price and date — plus the supplier and category when they
   * match something the business already has (below). The receipt itself rides
   * along as the attachment, so it isn't lost when the page changes.
   */
  const captureTaken = React.useRef(false);
  const [captured, setCaptured] = React.useState<{
    supplierName: string;
    category: string;
  } | null>(null);
  React.useEffect(() => {
    if (captureTaken.current) return;
    captureTaken.current = true;
    if (expenseId || copyOfId) return;
    const taken = useCaptureStore.getState().takeExpense();
    if (!taken) return;

    const { fields, confidence, file } = taken;
    setDraft((current) => ({
      ...current,
      description: fields.description || current.description,
      date: fields.date || current.date,
      amount: Number(fields.amount) || current.amount,
    }));
    if (fields.amount) setAmountInput(fields.amount);
    setCaptured({
      supplierName: fields.supplierName,
      category: fields.category,
    });
    const reader = new FileReader();
    reader.onload = () => {
      const previewUrl = String(reader.result);
      setPendingFiles((current) => [
        ...current,
        { key: `pending_${Date.now()}`, file, previewUrl },
      ]);
    };
    reader.readAsDataURL(file);
    // Marked edited so the amount's own validation shows if it wasn't read.
    setEdited(true);
    toast.success(
      `Receipt data extracted with ${Math.round(confidence * 100)}% confidence`,
      { description: "Review the pre-filled details before you save." },
    );
  }, [expenseId, copyOfId]);

  const categoriesQuery = useQuery({
    queryKey: ["expense-categories"],
    queryFn: fetchExpenseCategories,
  });
  const categories = categoriesQuery.data ?? [];

  const suppliersQuery = useQuery({
    queryKey: ["expense-suppliers"],
    queryFn: () => fetchBusinessContacts("Supplier"),
  });
  const suppliers = suppliersQuery.data ?? [];

  // The read supplier and category, matched by name once their lists land.
  // Left alone when nothing matches — a made-up pick would be worse than a
  // blank the user fills in.
  React.useEffect(() => {
    if (!captured || !suppliersQuery.isSuccess || !categoriesQuery.isSuccess) {
      return;
    }
    setCaptured(null);
    const supplierNeedle = captured.supplierName.trim().toLowerCase();
    const supplier = supplierNeedle
      ? suppliersQuery.data?.find(
          (entry) => entry.name.trim().toLowerCase() === supplierNeedle,
        )
      : undefined;
    const categoryNeedle = captured.category.trim().toLowerCase();
    const category = categoryNeedle
      ? categoriesQuery.data?.find(
          (entry) => entry.name.trim().toLowerCase() === categoryNeedle,
        )
      : undefined;
    setDraft((current) => ({
      ...current,
      ...(supplier && !current.supplierId
        ? {
            supplierId: supplier.id,
            supplierName: supplier.name,
            contactId: supplier.primaryContactId ?? null,
            contactName: supplier.name,
          }
        : {}),
      ...(category && !current.categoryId
        ? { categoryId: category.id, category: category.name }
        : {}),
    }));
    if (!supplier && supplierNeedle) {
      toast.info(`"${captured.supplierName}" isn't one of your suppliers yet`, {
        description: "Pick or add the supplier to continue.",
      });
    }
  }, [
    captured,
    suppliersQuery.isSuccess,
    suppliersQuery.data,
    categoriesQuery.isSuccess,
    categoriesQuery.data,
  ]);

  const patch = (values: Partial<ExpenseDraft>) => {
    setEdited(true);
    setDraft((current) => ({ ...current, ...values }));
  };

  const liveAmountError = amountError(amountInput);
  const issues = expenseIssues(draft, amountInput);
  const issueFor = (key: string) =>
    edited ? issues.find((issue) => issue.key === key)?.message : undefined;

  const amount = Number(amountInput) || 0;
  // The split worked through on the price as typed, so the hint shows the GST this
  // expense will actually carry ($100 at 15% → $13.04 GST, $86.96 excl).
  const taxHint = amount > 0 ? inclusiveTaxSplitHint(country, amount, taxRate, expenseTax.word) : taxHintExample;

  /**
   * Keeps `draft.businessAmount` (always a dollar figure — what's actually
   * sent to the API) in step with whatever's typed, in whichever unit is
   * currently selected. Re-running this off `amount` too means a percent
   * typed before the Price is filled in keeps making sense once it is,
   * rather than being stuck at the $0 it would have converted to at the
   * time it was typed.
   */
  React.useEffect(() => {
    if (!draft.splitEnabled) return;
    const parsed = Number(businessInput);
    const typed = Number.isFinite(parsed) ? parsed : 0;
    const nextBusinessAmount =
      splitMode === "$"
        ? typed
        : Math.round(((amount * typed) / 100) * 100) / 100;
    if (nextBusinessAmount === draft.businessAmount) return;
    setEdited(true);
    setDraft((current) => ({ ...current, businessAmount: nextBusinessAmount }));
  }, [
    businessInput,
    splitMode,
    amount,
    draft.splitEnabled,
    draft.businessAmount,
  ]);

  const saving = createExpense.isPending || updateExpense.isPending;
  // Derived, not its own state: a row's own status is already the one source
  // of truth for whether anything's mid-flight, so there's nothing for a
  // second flag to get out of step with.
  const savingAttachment = attachmentRows.some((row) => row.status !== "idle");

  /** Resolves in the same order given, so a row and its own preview line up. */
  function readFilesAsDataUrls(files: File[]): Promise<string[]> {
    return Promise.all(
      files.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => resolve("");
            reader.readAsDataURL(file);
          }),
      ),
    );
  }

  /**
   * Create: staged locally, nothing uploaded until the form's own Save.
   * Editing: each file is uploaded right away, one at a time — sole-webapp's
   * own FilePond queue processes a multi-file pick the same way, not as one
   * bulk call the backend doesn't offer.
   */
  const handleAddFiles = async (files: File[]) => {
    const previewUrls = await readFilesAsDataUrls(files);

    if (!editing) {
      setPendingFiles((current) => [
        ...current,
        ...files.map((file, index) => ({
          key: `pending_${Date.now()}_${index}`,
          file,
          previewUrl: previewUrls[index],
        })),
      ]);
      return;
    }

    const placeholders: MultiAttachmentRow[] = files.map((file, index) => ({
      key: `uploading_${Date.now()}_${index}`,
      name: file.name,
      size: file.size,
      url: previewUrls[index],
      status: "uploading",
    }));
    setAttachmentRows((current) => [...current, ...placeholders]);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const placeholder = placeholders[index];
      try {
        const newDocumentId = await uploadSourceDocument(
          "expense",
          editing.id,
          file,
        );
        setAttachmentRows((current) =>
          current.map((row) =>
            row.key === placeholder.key
              ? { ...row, key: newDocumentId ?? row.key, status: "idle" }
              : row,
          ),
        );
      } catch (error) {
        toast.error(
          apiErrorMessage(error, `Couldn't attach "${file.name}". Try again.`),
        );
        setAttachmentRows((current) =>
          current.filter((row) => row.key !== placeholder.key),
        );
      }
    }
  };

  /** Editing only: delete a real attachment right away, not on Save. */
  const handleRemoveRow = async (key: string) => {
    if (!editing) {
      setPendingFiles((current) => current.filter((item) => item.key !== key));
      return;
    }

    setAttachmentRows((current) =>
      current.map((row) =>
        row.key === key ? { ...row, status: "deleting" } : row,
      ),
    );
    try {
      await deleteSourceDocument(key);
      setAttachmentRows((current) => current.filter((row) => row.key !== key));
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Couldn't remove that attachment. Try again."),
      );
      setAttachmentRows((current) =>
        current.map((row) =>
          row.key === key ? { ...row, status: "idle" } : row,
        ),
      );
    }
  };

  const onSave = () => {
    const values: ExpenseDraft = { ...draft, amount };
    if (editing) {
      updateExpense.mutate(
        { id: editing.id, draft: values },
        {
          onSuccess: () => {
            toast.success("Expense updated");
            router.push("/expenses");
          },
          onError: (error: Error) =>
            toast.error(error.message || "Failed to update expense."),
        },
      );
    } else {
      // Same single request as sole-webapp's own create — every picked file
      // rides along on the encrypted multipart body, not a separate call each.
      createExpense.mutate(
        { draft: values, files: pendingFiles.map((item) => item.file) },
        {
          onSuccess: () => {
            toast.success("Expense saved");
            router.push("/expenses");
          },
          onError: (error: Error) =>
            toast.error(error.message || "Failed to save expense."),
        },
      );
    }
  };

  if (expenseId && editingQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6" aria-hidden>
        <Shimmer className="h-8 w-48 rounded-md" />
        <Shimmer className="h-96 w-full rounded-lg border border-border" />
      </div>
    );
  }

  // A URL pointing at an expense that no longer exists, or that failed to
  // load — falling through to a blank "New expense" form would let Save
  // create a duplicate instead of ever explaining what went wrong.
  if (expenseId && editingQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={guardNavigate("/expenses")}
        >
          <ArrowLeft />
          Expenses
        </Button>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="font-medium">Couldn&apos;t load this expense</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {editingQuery.error?.message ||
              "Something went wrong loading this expense. Try again."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={guardNavigate("/expenses")}
        >
          <ArrowLeft />
          Expenses
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {editing
              ? "Edit expense"
              : copyOfId
                ? "Duplicate expense"
                : "New expense"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {copyOf ? (
              <>
                Copied from {copyOf.description}, dated today with the receipt
                cleared.
              </>
            ) : (
              <>
                Fields marked with <span className="text-destructive">*</span>{" "}
                are required.
              </>
            )}
          </p>
        </div>
      </div>

      <FormSection
        icon={ReceiptText}
        title="Expense details"
        description="What you bought, when, and which category it belongs to."
        tourId="expense-details"
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <Field
            label="Expense description"
            required
            error={issueFor("description")}
          >
            <ItemLookupInput
              label="Expense description"
              value={draft.description}
              onChange={(value) => patch({ description: value })}
              search={searchExpenseDescriptions}
              queryKey="expense"
              onSelect={(suggestion) => {
                patch({
                  description: suggestion.name,
                  ...(suggestion.gst !== undefined
                    ? { gst: suggestion.gst }
                    : {}),
                });
                if (suggestion.price) setAmountInput(suggestion.price);
              }}
              placeholder="Quarterly BAS prep"
              invalid={!!issueFor("description")}
            />
          </Field>
        </div>

        <Field
          label={`Price (${currencyMark})`}
          required
          error={liveAmountError ?? issueFor("amount")}
          hint={
            amountLocked
              ? "This expense is matched, so the amount can't be changed — unmatch it first to change it."
              : undefined
          }
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {currencyMark}
            </span>
            <Input
              value={amountInput}
              inputMode="decimal"
              disabled={amountLocked}
              onChange={(event) => {
                setEdited(true);
                setAmountInput(event.target.value);
              }}
              placeholder="0.00"
              aria-invalid={!!(liveAmountError ?? issueFor("amount"))}
              className={cn(
                "pl-7 tabular",
                (liveAmountError ?? issueFor("amount")) &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </div>
        </Field>

        <Field label="Date" required error={issueFor("date")}>
          <DatePicker
            label="Date"
            value={draft.date}
            onChange={(iso) => patch({ date: iso })}
          />
        </Field>

        {/*
          The same client/supplier picker matching rules use — so a default
          supplier (Amazon, Google, …) is selectable here too — restricted to
          Supplier only. `contactId` here is `BusinessContactSelect`'s name
          for the *client's* own id; the expense's real per-person
          `contact_id` comes from the client's `primaryContactId` instead,
          which is null for a client with no primary contact set (the same
          state sole-webapp's own inline-created-supplier path already
          tolerates).
        */}
        <BusinessContactSelect
          type="Supplier"
          label="Supplier"
          contacts={suppliers}
          loading={suppliersQuery.isLoading}
          contactId={draft.supplierId}
          contactName={draft.supplierName}
          onSelect={({ contactId, contactName, primaryContactId }) =>
            patch({
              supplierId: contactId,
              supplierName: contactName,
              contactId: primaryContactId ?? null,
              contactName,
            })
          }
          onContactsChanged={() => suppliersQuery.refetch()}
          error={issueFor("supplier")}
        />

        <ExpenseCategorySelect
          categories={categories}
          loading={categoriesQuery.isLoading}
          categoryId={draft.categoryId}
          onSelect={(categoryId) => {
            const option = categories.find((entry) => entry.id === categoryId);
            patch({ categoryId, category: option?.name ?? "" });
          }}
          error={issueFor("category")}
        />
      </FormSection>

      <FormSection
        icon={Percent}
        title={`${expenseTax.word} & payment`}
        description="Tax treatment, and how this one was paid."
        tourId="expense-gst-payment"
        className="space-y-3"
      >
        <ToggleRow
          label="Split amount"
          hint={`Split this expense into personal and business use — only the business portion counts for ${expenseTax.word} and matching.`}
          checked={draft.splitEnabled}
          onChange={(checked) => {
            const nextBusinessAmount = checked
              ? draft.businessAmount || amount
              : amount;
            patch({
              splitEnabled: checked,
              businessAmount: nextBusinessAmount,
            });
            setSplitMode("$");
            setBusinessInput(
              checked && nextBusinessAmount ? String(nextBusinessAmount) : "",
            );
          }}
        />

        {draft.splitEnabled && (
          <Field label="Business amount" error={issueFor("businessAmount")}>
            <div className="flex gap-2">
              <Select
                value={splitMode}
                onValueChange={(value) => {
                  const mode = value as SplitMode;
                  setSplitMode(mode);
                  // Reformat the visible figure into the newly-chosen unit —
                  // the only time this field's text is rewritten out from
                  // under whatever was typed.
                  setBusinessInput(
                    mode === "$"
                      ? draft.businessAmount
                        ? String(draft.businessAmount)
                        : ""
                      : amount > 0 && draft.businessAmount
                        ? String(
                            Math.round(
                              (draft.businessAmount / amount) * 10000,
                            ) / 100,
                          )
                        : "",
                  );
                }}
              >
                <SelectTrigger className="w-16 shrink-0" aria-label="Split by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="$">{currencyMark}</SelectItem>
                  <SelectItem value="%">%</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {splitMode}
                </span>
                <Input
                  value={businessInput}
                  inputMode="decimal"
                  onChange={(event) => setBusinessInput(event.target.value)}
                  placeholder="0.00"
                  aria-invalid={!!issueFor("businessAmount")}
                  className={cn(
                    "pl-7 tabular",
                    issueFor("businessAmount") &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                />
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                Business ·{" "}
                <span className="font-medium tabular text-foreground">
                  {invoiceMoney(draft.businessAmount)}
                </span>
              </span>
              <span className="text-muted-foreground">
                Personal ·{" "}
                <span className="font-medium tabular text-foreground">
                  {invoiceMoney(Math.max(0, amount - draft.businessAmount))}
                </span>
              </span>
            </div>
          </Field>
        )}

        {taxOffered && (
          <ToggleRow
            label={taxLabel}
            hint={taxHint}
            checked={draft.gst}
            onChange={(checked) => patch({ gst: checked })}
          />
        )}

        <div className="space-y-2">
          <Label>Payment</Label>
          <div className="flex items-center gap-2">
            {/* How it was paid is part of what the match was made against, so
                it is held with the amount while the expense is matched. */}
            <Checkbox
              id="paid-with-cash"
              checked={draft.paymentMethod === "Cash"}
              disabled={amountLocked}
              onCheckedChange={(checked) =>
                patch({ paymentMethod: checked ? "Cash" : "Card" })
              }
            />
            <Label htmlFor="paid-with-cash" className="text-sm font-normal">
              Paid with cash?
            </Label>
          </div>
          {amountLocked && (
            <p className="text-xs text-muted-foreground">
              This expense is matched, so how it was paid can&apos;t be changed —
              unmatch it first to change it.
            </p>
          )}
        </div>
      </FormSection>

      <FormSection
        icon={Paperclip}
        title="Receipts"
        description="Attach the receipt now and the figures below can be read off it."
        tourId="expense-receipt"
      >
        <MultiAttachmentUpload
          rows={
            editing
              ? attachmentRows
              : pendingFiles.map((item) => ({
                  key: item.key,
                  name: item.file.name,
                  size: item.file.size,
                  url: item.previewUrl,
                  status: "idle" as const,
                }))
          }
          onAdd={(files) => void handleAddFiles(files)}
          onRemove={(key) => void handleRemoveRow(key)}
          onOpen={(row) => window.open(row.url, "_blank", "noopener")}
        />
      </FormSection>

      <div
        className="flex flex-wrap justify-end gap-2 border-t pt-4"
        data-usertour="expense-save-actions"
      >
        <Button variant="outline" onClick={guardNavigate("/expenses")}>
          Cancel
        </Button>
        {/* Disabled until valid; the hint says what's still outstanding. */}
        {issues.length > 0 && (
          <p className="self-center text-xs text-muted-foreground">
            {issues.length === 1
              ? issues[0].message
              : `${issues.length} fields need attention`}
          </p>
        )}
        <Button
          onClick={onSave}
          disabled={issues.length > 0 || saving || savingAttachment}
        >
          {(saving || savingAttachment) && <Loader2 className="animate-spin" />}
          {editing ? "Save changes" : "Save expense"}
        </Button>
      </div>

      {unsavedDialog}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-3">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
