"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";

import { deleteSourceDocument } from "@/lib/file-upload";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CONTROL_SURFACE_TRIGGER } from "@/components/ui/control-surface";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Shimmer } from "@/components/ui/shimmer";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { AttachmentUpload } from "@/components/shared/attachment-upload";
import { MoneyInput } from "@/components/planner/money-input";
import {
  useCreateEquityMutation,
  useUpdateEquityMutation,
} from "@/hooks/use-equity-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  EQUITY_CATEGORIES,
  EQUITY_CATEGORY_HINTS,
  MAX_EQUITY_BYTES,
  emptyEquityDraft,
  equityIssues,
  equitySummaryLine,
  fetchEquityDetail,
  fetchEquitySubcategories,
  type EquityDraft,
  type EquitySubcategory,
} from "@/lib/equity";
import { toIsoDate } from "@/lib/invoices";
import { cn } from "@/lib/utils";

export const EQUITY_ROOT = "/equity";

/** Every category explained in one tip, since the field takes one icon —
 *  sole-webapp's own tooltip is static copy, independent of what's fetched. */
const CATEGORY_TIP = EQUITY_CATEGORIES.map(
  (category) => `${category}: ${EQUITY_CATEGORY_HINTS[category]}`,
).join("\n\n");

/**
 * Create or edit an equity entry, on a page of its own.
 *
 * The same shell as the liability editor, which is the same shell as the
 * invoice editor — back link, title, sectioned form, actions on a footer rule.
 * The document goes at the top for the same reason it does there: a capital
 * contribution usually starts as a transfer receipt sitting in front of you,
 * and the fields below are what you read off it.
 */
export function EquityEditor({
  equityId,
}: {
  /** Undefined when creating; an id when editing. */
  equityId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const createEquity = useCreateEquityMutation();
  const updateEquity = useUpdateEquityMutation();

  const detailQuery = useQuery({
    queryKey: ["equity-detail", equityId],
    queryFn: () => fetchEquityDetail(equityId as string),
    enabled: !!equityId,
    // Never seed the form from a cached copy of an earlier visit.
    refetchOnMount: "always",
  });
  const editing = detailQuery.data;
  // Only a fresh response seeds the form — never a cached earlier visit.
  const seedSource = detailQuery.isFetching ? undefined : detailQuery.data;

  const subcategoriesQuery = useQuery({
    queryKey: ["equity-subcategories"],
    queryFn: fetchEquitySubcategories,
  });
  const subcategories = subcategoriesQuery.data ?? [];

  const [draft, setDraft] = React.useState<EquityDraft>(() =>
    emptyEquityDraft(toIsoDate(new Date())),
  );
  /** The documents already on this entry, so a removal or a replacement
   *  detaches them for real. Equity has no attachment endpoint of its own, so
   *  this uses the generic `DELETE /documents/:id`. */
  const [existingDocumentIds, setExistingDocumentIds] = React.useState<
    string[]
  >([]);
  /** The new file behind a pick, if any — `draft.attachment` only carries a
   *  preview, never bytes the server can use. */
  const [attachmentFile, setAttachmentFile] = React.useState<File | null>(
    null,
  );

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
   * choosing the category shouldn't light up the name, amount and date
   * errors too. Saving still reveals everything outstanding at once, the
   * same as sole-webapp's own submit-time validation.
   */
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const hasTouched = Object.keys(touched).length > 0;

  const patch = (key: string, values: Partial<EquityDraft>) => {
    setTouched((current) => ({ ...current, [key]: true }));
    setDraft((current) => ({ ...current, ...values }));
  };

  const detachExisting = () => {
    // Synchronous guard: state only updates on the next render, so two
    // calls in the same tick would otherwise both delete the same document
    // and the second one 404s.
    const documentIds = existingDocumentIds.filter(
      (id) => !deletingIdsRef.current.has(id),
    );
    if (documentIds.length === 0) return;
    documentIds.forEach((id) => deletingIdsRef.current.add(id));
    const previous = draft.attachment;
    setExistingDocumentIds([]);
    setRemoving(true);
    Promise.all(documentIds.map((id) => deleteSourceDocument(id)))
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ["equity-detail"] }),
          queryClient.invalidateQueries({ queryKey: ["equity"] }),
        ]),
      )
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

  const issues = equityIssues(draft);
  const issueFor = (key: string) =>
    touched[key] ? issues.find((issue) => issue.key === key)?.message : undefined;

  const saving = createEquity.isPending || updateEquity.isPending;

  const onSave = () => {
    setTouched({ category: true, name: true, amount: true, date: true });
    if (issues.length > 0 || saving) return;

    if (editing && equityId) {
      updateEquity.mutate(
        { id: equityId, draft, file: attachmentFile },
        {
          onSuccess: () => {
            toast.success("Equity saved", {
              description: equitySummaryLine(draft),
            });
            router.push(EQUITY_ROOT);
          },
          onError: (error) =>
            toast.error(apiErrorMessage(error, "Failed to save equity entry.")),
        },
      );
    } else {
      createEquity.mutate(
        { draft, file: attachmentFile },
        {
          onSuccess: () => {
            toast.success("Equity created", {
              description: equitySummaryLine(draft),
            });
            router.push(EQUITY_ROOT);
          },
          onError: (error) =>
            toast.error(
              apiErrorMessage(error, "Failed to create equity entry."),
            ),
        },
      );
    }
  };

  if (equityId && detailQuery.isLoading) {
    return (
      <div className="space-y-6" aria-hidden>
        <Shimmer className="h-8 w-48 rounded-md" />
        <Shimmer className="h-64 w-full rounded-lg border border-border" />
        <Shimmer className="h-48 w-full rounded-lg border border-border" />
      </div>
    );
  }

  // A URL that points at an entry which no longer exists.
  if (equityId && detailQuery.isError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={EQUITY_ROOT}>
            <ArrowLeft />
            Equity
          </Link>
        </Button>
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">That entry no longer exists</p>
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
      description="The transfer receipt, deposit slip or letter behind it. Optional."
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
        maxBytes={MAX_EQUITY_BYTES}
        noun="document"
      />
    </FormSection>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={EQUITY_ROOT}>
            <ArrowLeft />
            Equity
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {editing ? `Edit ${editing.name}` : "New equity"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Record your own money moving in or out of the business — capital you
            put in, or drawings you take back out. Fields marked with{" "}
            <span className="text-destructive">*</span> are required.
          </p>
        </div>
      </div>

      {!equityId && documentSection}

      <FormSection
        icon={FileText}
        title="Equity details"
        description="Which way the money went, what it's worth, and when."
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Category" required error={issueFor("category")} labelTip={CATEGORY_TIP}>
          <CategoryCombobox
            value={draft.categoryId}
            categories={subcategories}
            loading={subcategoriesQuery.isLoading}
            onSelect={(categoryId) => patch("category", { categoryId })}
            error={issueFor("category")}
          />
        </Field>

        <Field label="Date" required error={issueFor("date")}>
          <DatePicker
            value={draft.date}
            onChange={(iso) => patch("date", { date: iso })}
            label="Date"
          />
        </Field>

        <Field
          label="Equity name"
          htmlFor="equity-name"
          required
          error={issueFor("name")}
        >
          <Input
            id="equity-name"
            value={draft.name}
            onChange={(event) => patch("name", { name: event.target.value })}
            placeholder="Owner top-up — winter cashflow"
            aria-invalid={!!issueFor("name")}
            className={cn(
              issueFor("name") &&
                "border-destructive focus-visible:ring-destructive",
            )}
          />
        </Field>

        <Field label="Total" required error={issueFor("amount")}>
          <MoneyInput
            value={draft.amount ? String(draft.amount) : ""}
            onChange={(value) => patch("amount", { amount: Number(value) || 0 })}
            label="Total"
            invalid={!!issueFor("amount")}
          />
        </Field>

        {/* Same row the asset form uses for this field, so "Paid with cash"
            looks and reads the same wherever it appears. */}
        <div className="flex items-center justify-between gap-4 rounded-md border p-3 sm:col-span-2">
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor="equity-cash" className="text-sm font-medium">
              Paid with cash
            </Label>
            <p className="text-xs text-muted-foreground">
              Records it as settled from cash on hand rather than a bank
              account, so there&apos;s no transaction to match.
            </p>
          </div>
          <Switch
            id="equity-cash"
            checked={draft.paidWithCash}
            onCheckedChange={(paidWithCash) => patch("paidWithCash", { paidWithCash })}
          />
        </div>
      </FormSection>

      {equityId && documentSection}

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button variant="ghost" asChild>
          <Link href={EQUITY_ROOT}>Cancel</Link>
        </Button>
        {/* Disabled until valid; the hint says what's still outstanding. */}
        {hasTouched && issues.length > 0 && (
          <p className="self-center text-xs text-muted-foreground">
            {issues.length === 1
              ? issues[0].message
              : `${issues.length} fields need attention`}
          </p>
        )}
        <Button onClick={onSave} disabled={(hasTouched && issues.length > 0) || saving}>
          {saving && <Loader2 className="animate-spin" />}
          {editing ? "Save changes" : "Save equity"}
        </Button>
      </div>
    </div>
  );
}

/**
 * The category picker, searchable — the same Popover + Command pattern as the
 * client and industry comboboxes rather than a plain Select, because the old
 * platform puts a search box at the top of this list and the chart of accounts
 * behind it grows.
 */
function CategoryCombobox({
  value,
  categories,
  loading,
  onSelect,
  error,
}: {
  value: string;
  categories: EquitySubcategory[];
  loading: boolean;
  onSelect: (categoryId: string) => void;
  error?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = categories.find((category) => category.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id="equity-category"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Category"
          aria-invalid={!!error}
          className={cn(
            "w-full justify-between font-normal",
            CONTROL_SURFACE_TRIGGER,
            !selected && "text-muted-foreground",
            error && "border-destructive focus-visible:ring-destructive",
          )}
        >
          {selected?.name ?? (loading ? "Loading categories…" : "Select a category")}
          {loading ? (
            <Loader2 className="size-4 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search categories…" />
          <CommandList>
            <CommandEmpty>No category matches that.</CommandEmpty>
            <CommandGroup>
              {categories.map((category) => (
                <CommandItem
                  key={category.id}
                  value={category.name}
                  onSelect={() => {
                    onSelect(category.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      value === category.id ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  {category.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
