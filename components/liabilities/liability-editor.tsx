"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Paperclip,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { BusinessContactSelect } from "@/components/documents/business-contact-select";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { AttachmentUpload } from "@/components/shared/attachment-upload";
import { MoneyInput } from "@/components/planner/money-input";
import { useCountryContext } from "@/hooks/use-country-context";
import {
  useCreateLiabilityMutation,
  useDeleteLiabilityAttachmentMutation,
  useUpdateLiabilityMutation,
} from "@/hooks/use-liabilities-query";
import { apiErrorMessage } from "@/lib/api-error";
import { fetchBusinessContacts } from "@/lib/clients";
import { toIsoDate } from "@/lib/invoices";
import {
  LIABILITY_CATEGORIES,
  LIABILITY_CATEGORY_HINTS,
  MAX_LIABILITY_BYTES,
  emptyLiabilityDraft,
  fetchLiabilityDetail,
  fetchLiabilitySubcategories,
  liabilityIssues,
  liabilitySummaryLine,
  type LiabilityDraft,
} from "@/lib/liabilities";
import { documentTax, formatCountryMoney } from "@/lib/country-context";
import { cn } from "@/lib/utils";

export const LIABILITIES_ROOT = "/liabilities";

/** Every category explained in one tip, since the field takes one icon —
 *  sole-webapp's own tooltip is static copy, independent of what's fetched. */
const CATEGORY_TIP = LIABILITY_CATEGORIES.map(
  (category) => `${category}: ${LIABILITY_CATEGORY_HINTS[category]}`,
).join("\n\n");

/**
 * Create or edit a liability, on a page of its own.
 *
 * Same shell as the invoice editor — back link, title, sectioned form, actions
 * on a footer rule — so a create flow reads the same wherever you enter it.
 * The document goes in its own section at the top: a liability usually starts
 * as a loan agreement or a payroll summary sitting in front of you, and the
 * fields below are what you read off it.
 */
export function LiabilityEditor({
  liabilityId,
}: {
  /** Undefined when creating; an id when editing. */
  liabilityId?: string;
}) {
  const router = useRouter();
  const createLiability = useCreateLiabilityMutation();
  const updateLiability = useUpdateLiabilityMutation();
  const deleteAttachment = useDeleteLiabilityAttachmentMutation();

  const detailQuery = useQuery({
    queryKey: ["liability-detail", liabilityId],
    queryFn: () => fetchLiabilityDetail(liabilityId as string),
    enabled: !!liabilityId,
    // Never seed the form from a cached copy of an earlier visit.
    refetchOnMount: "always",
  });
  const editing = detailQuery.data;
  // Only a fresh response seeds the form — never a cached earlier visit.
  const seedSource = detailQuery.isFetching ? undefined : detailQuery.data;

  const subcategoriesQuery = useQuery({
    queryKey: ["liability-subcategories"],
    queryFn: fetchLiabilitySubcategories,
  });
  const subcategories = subcategoriesQuery.data ?? [];

  const suppliersQuery = useQuery({
    queryKey: ["liability-suppliers"],
    queryFn: () => fetchBusinessContacts("Supplier"),
  });
  const suppliers = suppliersQuery.data ?? [];

  const [draft, setDraft] = React.useState<LiabilityDraft>(() =>
    emptyLiabilityDraft(toIsoDate(new Date())),
  );

  // Tax in the business's own word and rate, as on an expense: the rate a
  // saved liability was recorded at, else today's (custom, or the country's).
  const { country } = useCountryContext();
  const liabilityTax = documentTax(country);
  const taxWord = liabilityTax.word;
  const taxRate =
    draft.gstPercent != null && draft.gstPercent > 0
      ? draft.gstPercent
      : liabilityTax.rate;
  // A business that has said it isn't registered can't claim tax, so it isn't
  // offered — the server drops it too.
  const taxOffered = country.effectiveTax.registered;
  // The tax goes on top of the amount, worked through on what was typed.
  const money = (value: number) => formatCountryMoney(country, value);
  const rateShown = `${Math.round(taxRate * 100) / 100}%`;
  const taxOnTop = Math.round(draft.amount * taxRate) / 100;
  const taxHint =
    draft.gst && draft.amount > 0
      ? `${money(draft.amount)} + ${money(taxOnTop)} ${taxWord} at ${rateShown} = ${money(draft.amount + taxOnTop)}.`
      : `On adds ${taxWord} at ${rateShown} on top of the amount above.`;
  /** The document already on this liability, so a new pick or a removal
   *  knows to detach it rather than leaving an orphaned attachment behind. */
  const [existingDocumentIds, setExistingDocumentIds] = React.useState<
    string[]
  >([]);
  /** The new file behind a pick, if any — `draft.attachment` only carries a
   *  preview, never bytes the server can use (see `AttachmentUpload`). */
  const [attachmentFile, setAttachmentFile] = React.useState<File | null>(null);

  /** True while the old document is being removed, for the loader. */
  const [removing, setRemoving] = React.useState(false);
  /** Document ids whose DELETE has already been sent, so it's sent once. */
  const deletingIdsRef = React.useRef<Set<string>>(new Set());

  // The detail fetch lands after the form's first render (editing only) —
  // seed the draft once, so it doesn't clobber anything already typed.
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (!seedSource || seededRef.current) return;
    seededRef.current = true;
    setDraft(seedSource);
    setExistingDocumentIds(seedSource.documents.map((doc) => doc.id));
  }, [seedSource]);

  /**
   * Errors surface per field, once that field has actually been touched —
   * choosing the supplier shouldn't light up the category, name and amount
   * errors too. Saving still reveals everything outstanding at once, the
   * same as sole-webapp's own submit-time validation.
   */
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const hasTouched = Object.keys(touched).length > 0;

  const patch = (key: string, values: Partial<LiabilityDraft>) => {
    setTouched((current) => ({ ...current, [key]: true }));
    setDraft((current) => ({ ...current, ...values }));
  };

  const issues = liabilityIssues(draft);
  const issueFor = (key: string) =>
    touched[key]
      ? issues.find((issue) => issue.key === key)?.message
      : undefined;

  /** A pick or a removal both retire whatever document is already attached —
   *  the single-file dropzone can only ever show one at a time. */
  const detachExisting = () => {
    // Synchronous guard: state only updates on the next render, so two
    // calls in the same tick would otherwise both delete the same document
    // and the second one 404s ("Document not found or already deleted").
    const documentIds = existingDocumentIds.filter(
      (id) => !deletingIdsRef.current.has(id),
    );
    if (documentIds.length === 0) return;
    documentIds.forEach((id) => deletingIdsRef.current.add(id));
    const previous = draft.attachment;
    setExistingDocumentIds([]);
    setRemoving(true);
    // Every document on the liability goes, not just the one the dropzone
    // shows — the detail endpoint can return several (the list's "Add
    // attachment" appends), and a leftover one would reappear on reload.
    Promise.all(documentIds.map((id) => deleteAttachment.mutateAsync(id)))
      .catch((error) => {
        // Put the document back so the form doesn't claim it's gone.
        documentIds.forEach((id) => deletingIdsRef.current.delete(id));
        setExistingDocumentIds(documentIds);
        setAttachmentFile(null);
        setDraft((current) => ({ ...current, attachment: previous }));
        toast.error(apiErrorMessage(error, "Couldn't remove that document."));
      })
      .finally(() => setRemoving(false));
  };

  const saving = createLiability.isPending || updateLiability.isPending;

  const onSave = () => {
    setTouched({ supplier: true, category: true, name: true, amount: true });
    if (issues.length > 0 || saving) return;

    if (editing && liabilityId) {
      updateLiability.mutate(
        { id: liabilityId, draft, file: attachmentFile },
        {
          onSuccess: () => {
            toast.success("Liability saved", {
              description: liabilitySummaryLine(draft),
            });
            router.push(LIABILITIES_ROOT);
          },
          onError: (error) =>
            toast.error(apiErrorMessage(error, "Failed to save liability.")),
        },
      );
    } else {
      createLiability.mutate(
        { draft, file: attachmentFile },
        {
          onSuccess: () => {
            toast.success("Liability created", {
              description: liabilitySummaryLine(draft),
            });
            router.push(LIABILITIES_ROOT);
          },
          onError: (error) =>
            toast.error(apiErrorMessage(error, "Failed to create liability.")),
        },
      );
    }
  };

  if (liabilityId && detailQuery.isLoading) {
    return (
      <div className="space-y-6" aria-hidden>
        <Shimmer className="h-8 w-48 rounded-md" />
        <Shimmer className="h-64 w-full rounded-lg border border-border" />
        <Shimmer className="h-48 w-full rounded-lg border border-border" />
      </div>
    );
  }

  // A URL that points at a liability which no longer exists.
  if (liabilityId && detailQuery.isError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={LIABILITIES_ROOT}>
            <ArrowLeft />
            Liabilities
          </Link>
        </Button>
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">That liability no longer exists</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been deleted since this link was made.
          </p>
        </div>
      </div>
    );
  }

  /** Create: the document leads, as it always has. Edit: it follows the
   *  details, so the fields being changed come first. */
  const documentSection = (
    <FormSection
      icon={Paperclip}
      title="Supporting document"
      description="The loan agreement, payroll summary or letter behind it. Optional."
    >
      <AttachmentUpload
        receipt={draft.attachment}
        status={
          // A replacement reads as one "Uploading…" step — the old file
          // going first is an implementation detail. Only a bare Remove,
          // with nothing coming in, says "Removing…".
          (saving || removing) && attachmentFile
            ? "uploading"
            : removing
              ? "deleting"
              : "idle"
        }
        pendingName={attachmentFile?.name}
        onChange={(attachment) => {
          patch("attachment", { attachment });
          if (!attachment) {
            setAttachmentFile(null);
            detachExisting();
          }
        }}
        onFileSelected={(file) => {
          setAttachmentFile(file);
          detachExisting();
        }}
        maxBytes={MAX_LIABILITY_BYTES}
        noun="document"
      />
    </FormSection>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={LIABILITIES_ROOT}>
            <ArrowLeft />
            Liabilities
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {editing ? `Edit ${editing.name}` : "New liability"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Record something the business owes outside your bills — accrued
            wages, a loan, a bond you&apos;re holding. Fields marked with{" "}
            <span className="text-destructive">*</span> are required.
          </p>
        </div>
      </div>

      {!liabilityId && documentSection}

      <FormSection
        icon={UserRound}
        title="Who it's owed to"
        description="The supplier, lender or payee this liability sits against."
      >
        <BusinessContactSelect
          type="Supplier"
          contacts={suppliers}
          loading={suppliersQuery.isLoading}
          contactId={draft.supplierId}
          contactName={draft.supplierName}
          onSelect={({ contactId, contactName }) => {
            const contact = suppliers.find((entry) => entry.id === contactId);
            patch("supplier", {
              supplierId: contactId,
              supplierName: contactName,
              supplierEmail: contact?.email ?? "",
            });
          }}
          onContactsChanged={() => suppliersQuery.refetch()}
          error={issueFor("supplier")}
        />
      </FormSection>

      <FormSection
        icon={FileText}
        title="Liability details"
        description="What it is, what it's worth, and how it's taxed."
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field
          label="Category"
          required
          error={issueFor("category")}
          labelTip={CATEGORY_TIP}
        >
          <Select
            value={draft.categoryId}
            onValueChange={(value) => patch("category", { categoryId: value })}
          >
            <SelectTrigger
              aria-label="Category"
              aria-invalid={!!issueFor("category")}
              className={cn(
                issueFor("category") &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            >
              <SelectValue
                placeholder={
                  subcategoriesQuery.isLoading
                    ? "Loading categories…"
                    : "Select a category"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {subcategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Date">
          <DatePicker
            value={draft.date}
            onChange={(iso) => patch("date", { date: iso })}
            label="Date"
          />
        </Field>

        <Field label="Liability name" required error={issueFor("name")}>
          <Input
            value={draft.name}
            onChange={(event) => patch("name", { name: event.target.value })}
            placeholder="Equipment finance — van"
            aria-invalid={!!issueFor("name")}
            className={cn(
              issueFor("name") &&
                "border-destructive focus-visible:ring-destructive",
            )}
          />
        </Field>

        <Field label="Amount" required error={issueFor("amount")}>
          <MoneyInput
            value={draft.amount ? String(draft.amount) : ""}
            onChange={(value) =>
              patch("amount", { amount: Number(value) || 0 })
            }
            label="Amount"
            invalid={!!issueFor("amount")}
          />
        </Field>

        {taxOffered && (
          <div className="flex items-center justify-between gap-4 rounded-md border p-3 sm:col-span-2">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Add {taxWord}</p>
              <p className="text-xs text-muted-foreground">{taxHint}</p>
            </div>
            <Switch
              checked={draft.gst}
              onCheckedChange={(checked) => patch("gst", { gst: checked })}
              aria-label={`Add ${taxWord}`}
            />
          </div>
        )}
      </FormSection>

      {liabilityId && documentSection}

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button variant="ghost" asChild>
          <Link href={LIABILITIES_ROOT}>Cancel</Link>
        </Button>
        {/* Disabled until valid; the hint says what's still outstanding. */}
        {hasTouched && issues.length > 0 && (
          <p className="self-center text-xs text-muted-foreground">
            {issues.length === 1
              ? issues[0].message
              : `${issues.length} fields need attention`}
          </p>
        )}
        <Button
          onClick={onSave}
          disabled={(hasTouched && issues.length > 0) || saving}
        >
          {saving && <Loader2 className="animate-spin" />}
          {editing ? "Save changes" : "Save liability"}
        </Button>
      </div>
    </div>
  );
}
