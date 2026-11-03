"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shimmer } from "@/components/ui/shimmer";
import { Switch } from "@/components/ui/switch";
import { BusinessContactSelect } from "@/components/documents/business-contact-select";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { ItemLookupInput } from "@/components/documents/item-lookup-input";
import { ExpenseCategorySelect } from "@/components/expenses/expense-category-select";
import {
  MultiAttachmentUpload,
  type MultiAttachmentRow,
} from "@/components/shared/multi-attachment-upload";
import {
  useCreateProjectExpenseMutation,
  useUpdateProjectExpenseMutation,
} from "@/hooks/use-project-expenses-query";
import { apiErrorMessage } from "@/lib/api-error";
import { fetchBusinessContacts } from "@/lib/clients";
import {
  amountError,
  draftFromExpense,
  emptyExpenseDraft,
  expenseIssues,
  fetchExpenseCategories,
  fetchExpenseDetail,
  isAmountLocked,
  type ExpenseDraft,
} from "@/lib/expenses";
import { deleteSourceDocument, uploadSourceDocument } from "@/lib/file-upload";
import { searchExpenseDescriptions } from "@/lib/invoice-item-search";
import { invoiceMoney, toIsoDate } from "@/lib/invoices";
import { PROJECT_HIDDEN_CATEGORY_ID } from "@/lib/project-expenses";
import { cn } from "@/lib/utils";
import { activeCurrencySymbol } from "@/lib/country-context";

type PendingFile = { key: string; file: File; previewUrl: string };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

/**
 * The expense form for a project — sole-webapp's tab renders its own
 * `AddExpenses` with the project (and, on create, the chosen job) attached,
 * rather than sending you to the Expenses screen. The fields and rules are the
 * main `ExpenseForm`'s; only the save differs, carrying the project link that
 * form has no way to send (see `lib/project-expenses.ts`).
 */
export function ProjectExpenseForm({
  projectId,
  expenseId,
  projectJobId = null,
  onDone,
  onCancel,
}: {
  projectId: string;
  /** Editing this expense; absent for a new one. */
  expenseId?: string;
  /** Create only — the job picked above the form. */
  projectJobId?: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const createExpense = useCreateProjectExpenseMutation(projectId);
  const updateExpense = useUpdateProjectExpenseMutation(projectId);

  const editingQuery = useQuery({
    queryKey: ["expense", expenseId],
    queryFn: () => fetchExpenseDetail(expenseId as string),
    enabled: !!expenseId,
  });
  const editing = editingQuery.data;
  const amountLocked = editing ? isAmountLocked(editing) : false;

  const [draft, setDraft] = React.useState<ExpenseDraft>(() =>
    emptyExpenseDraft(toIsoDate(new Date())),
  );
  const [amountInput, setAmountInput] = React.useState("");
  const [businessInput, setBusinessInput] = React.useState("");
  const [edited, setEdited] = React.useState(false);
  /** Create: staged and sent with the save. Edit: uploaded/removed as you go, as the main form does. */
  const [pendingFiles, setPendingFiles] = React.useState<PendingFile[]>([]);
  const [attachmentRows, setAttachmentRows] = React.useState<MultiAttachmentRow[]>([]);

  // Seed once from the detail fetch, so a refetch can't overwrite what's typed.
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (seededRef.current || !editing) return;
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
  }, [editing]);

  const categoriesQuery = useQuery({
    queryKey: ["expense-categories"],
    queryFn: fetchExpenseCategories,
  });
  const categories = React.useMemo(
    () => (categoriesQuery.data ?? []).filter((entry) => entry.id !== PROJECT_HIDDEN_CATEGORY_ID),
    [categoriesQuery.data],
  );

  const suppliersQuery = useQuery({
    queryKey: ["expense-suppliers"],
    queryFn: () => fetchBusinessContacts("Supplier"),
  });

  const patch = (values: Partial<ExpenseDraft>) => {
    setEdited(true);
    setDraft((current) => ({ ...current, ...values }));
  };

  const amount = Number(amountInput) || 0;
  const liveAmountError = amountError(amountInput);
  const issues = expenseIssues(draft, amountInput);
  const issueFor = (key: string) =>
    edited ? issues.find((issue) => issue.key === key)?.message : undefined;

  const saving = createExpense.isPending || updateExpense.isPending;
  const savingAttachment = attachmentRows.some((row) => row.status !== "idle");

  const handleAddFiles = async (files: File[]) => {
    const previews = await Promise.all(files.map(readAsDataUrl));
    if (!editing) {
      setPendingFiles((current) => [
        ...current,
        ...files.map((file, index) => ({
          key: `pending_${Date.now()}_${index}`,
          file,
          previewUrl: previews[index],
        })),
      ]);
      return;
    }

    const placeholders: MultiAttachmentRow[] = files.map((file, index) => ({
      key: `uploading_${Date.now()}_${index}`,
      name: file.name,
      size: file.size,
      url: previews[index],
      status: "uploading",
    }));
    setAttachmentRows((current) => [...current, ...placeholders]);
    for (let index = 0; index < files.length; index += 1) {
      const placeholder = placeholders[index];
      try {
        const documentId = await uploadSourceDocument("expense", editing.id, files[index]);
        setAttachmentRows((current) =>
          current.map((row) =>
            row.key === placeholder.key
              ? { ...row, key: documentId ?? row.key, status: "idle" }
              : row,
          ),
        );
      } catch (error) {
        toast.error(apiErrorMessage(error, `Couldn't attach "${files[index].name}". Try again.`));
        setAttachmentRows((current) => current.filter((row) => row.key !== placeholder.key));
      }
    }
  };

  const handleRemove = async (key: string) => {
    if (!editing) {
      setPendingFiles((current) => current.filter((item) => item.key !== key));
      return;
    }
    setAttachmentRows((current) =>
      current.map((row) => (row.key === key ? { ...row, status: "deleting" } : row)),
    );
    try {
      await deleteSourceDocument(key);
      setAttachmentRows((current) => current.filter((row) => row.key !== key));
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't remove that attachment. Try again."));
      setAttachmentRows((current) =>
        current.map((row) => (row.key === key ? { ...row, status: "idle" } : row)),
      );
    }
  };

  const onSave = () => {
    const values: ExpenseDraft = {
      ...draft,
      amount,
      businessAmount: draft.splitEnabled ? Number(businessInput) || 0 : amount,
    };
    if (editing) {
      updateExpense.mutate(
        { id: editing.id, draft: values },
        {
          onSuccess: () => {
            toast.success("Expense updated");
            onDone();
          },
          onError: (error) => toast.error(apiErrorMessage(error, "Failed to update expense.")),
        },
      );
      return;
    }
    createExpense.mutate(
      { draft: values, files: pendingFiles.map((item) => item.file), projectJobId },
      {
        onSuccess: () => {
          toast.success("Expense saved");
          onDone();
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Failed to save expense.")),
      },
    );
  };

  if (expenseId && editingQuery.isLoading) {
    return (
      <div className="space-y-3" aria-hidden>
        <Shimmer className="h-10 w-full rounded-md" />
        <Shimmer className="h-64 w-full rounded-md" />
      </div>
    );
  }

  if (expenseId && editingQuery.isError) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {apiErrorMessage(editingQuery.error, "Couldn't load this expense. Try again.")}
      </p>
    );
  }

  const businessError =
    issueFor("businessAmount") ??
    (draft.splitEnabled && Number(businessInput) > amount
      ? "Business amount can't exceed the price."
      : undefined);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Expense description" required error={issueFor("description")}>
            <ItemLookupInput
              label="Expense description"
              value={draft.description}
              onChange={(value) => patch({ description: value })}
              search={searchExpenseDescriptions}
              queryKey="expense"
              onSelect={(suggestion) => {
                patch({
                  description: suggestion.name,
                  ...(suggestion.gst !== undefined ? { gst: suggestion.gst } : {}),
                });
                if (suggestion.price) setAmountInput(suggestion.price);
              }}
              placeholder="Materials for site visit"
              invalid={!!issueFor("description")}
            />
          </Field>
        </div>

        <Field
          label={`Price (${activeCurrencySymbol()})`}
          required
          error={liveAmountError ?? issueFor("amount")}
          hint={
            amountLocked
              ? "This expense is matched, so the amount can't be changed — unmatch it first."
              : undefined
          }
        >
          <MoneyInput
            value={amountInput}
            disabled={amountLocked}
            invalid={!!(liveAmountError ?? issueFor("amount"))}
            onChange={(value) => {
              setEdited(true);
              setAmountInput(value);
            }}
          />
        </Field>

        <Field label="Date" required error={issueFor("date")}>
          <DatePicker label="Date" value={draft.date} onChange={(iso) => patch({ date: iso })} />
        </Field>

        <BusinessContactSelect
          type="Supplier"
          label="Supplier"
          contacts={suppliersQuery.data ?? []}
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
      </div>

      <div className="space-y-3">
        <ToggleRow
          label="Split amount"
          hint="Only the business portion counts for GST, matching and what's billed on to the client."
          checked={draft.splitEnabled}
          onChange={(checked) => {
            const next = checked ? draft.businessAmount || amount : amount;
            patch({ splitEnabled: checked, businessAmount: next });
            setBusinessInput(checked && next ? String(next) : "");
          }}
        />

        {draft.splitEnabled && (
          <Field label={`Business amount (${activeCurrencySymbol()})`} error={businessError}>
            <MoneyInput
              value={businessInput}
              invalid={!!businessError}
              onChange={(value) => {
                setBusinessInput(value);
                patch({ businessAmount: Number(value) || 0 });
              }}
            />
            <div className="mt-2 flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>
                Business ·{" "}
                <span className="font-medium tabular text-foreground">
                  {invoiceMoney(Number(businessInput) || 0)}
                </span>
              </span>
              <span>
                Personal ·{" "}
                <span className="font-medium tabular text-foreground">
                  {invoiceMoney(Math.max(0, amount - (Number(businessInput) || 0)))}
                </span>
              </span>
            </div>
          </Field>
        )}

        <ToggleRow
          label="Include GST"
          hint="On means the price already includes GST — $110 contains $10 of it."
          checked={draft.gst}
          onChange={(checked) => patch({ gst: checked })}
        />

        <div className="flex items-center gap-2">
          <Checkbox
            id="project-expense-cash"
            checked={draft.paymentMethod === "Cash"}
            disabled={amountLocked}
            onCheckedChange={(checked) => patch({ paymentMethod: checked ? "Cash" : "Card" })}
          />
          <Label htmlFor="project-expense-cash" className="text-sm font-normal">
            Paid with cash?
          </Label>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Receipts</Label>
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
          onRemove={(key) => void handleRemove(key)}
          onOpen={(row) => window.open(row.url, "_blank", "noopener")}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        {issues.length > 0 && (
          <p className="mr-auto text-xs text-muted-foreground">
            {issues.length === 1 ? issues[0].message : `${issues.length} fields need attention`}
          </p>
        )}
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={onSave}
          disabled={issues.length > 0 || !!businessError || saving || savingAttachment}
        >
          {(saving || savingAttachment) && <Loader2 className="animate-spin" />}
          {editing ? "Save changes" : "Save expense"}
        </Button>
      </div>
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {activeCurrencySymbol()}
      </span>
      <Input
        value={value}
        inputMode="decimal"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0.00"
        aria-invalid={invalid}
        className={cn("pl-7 tabular", invalid && "border-destructive focus-visible:ring-destructive")}
      />
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
