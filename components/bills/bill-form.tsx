"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CircleAlert,
  ExternalLink,
  FileText,
  ListOrdered,
  Loader2,
  Link2,
  Paperclip,
  Repeat,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Shimmer } from "@/components/ui/shimmer";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { BusinessContactSelect } from "@/components/documents/business-contact-select";
import { ExpenseCategorySelect } from "@/components/expenses/expense-category-select";
import { BillLineItems } from "@/components/bills/bill-line-items";
import { BillMatchDialog } from "@/components/bills/bill-match-dialog";
import { BillRepeatFields } from "@/components/bills/bill-repeat-fields";
import { BillScheduleSheet } from "@/components/bills/bill-schedule-sheet";
import { BillStatusBadge, RepeatBadge } from "@/components/bills/bill-status";
import { BillSupplierHistory } from "@/components/bills/bill-supplier-history";
import {
  MultiAttachmentUpload,
  type MultiAttachmentRow,
} from "@/components/shared/multi-attachment-upload";
import { useUnsavedChanges } from "@/components/ui/unsaved-changes";
import {
  useBillQuery,
  useCreateBillMutation,
  useUnapproveBillMutation,
  useUpdateBillMutation,
} from "@/hooks/use-bills-query";
import { useCountryContext } from "@/hooks/use-country-context";
import { apiErrorMessage } from "@/lib/api-error";
import {
  billIssues,
  billTotals,
  deleteBillAttachment,
  draftFromBill,
  emptyBillDraft,
  approveIssues,
  isBillOwed,
  newBillLine,
  saveIssues,
  scheduleEndLabel,
  uploadBillAttachment,
  withBillDate,
  withRepeatChange,
  type Bill,
  type BillDraft,
  type BillRepeatDraft,
} from "@/lib/bills";
import { fetchBusinessContacts } from "@/lib/clients";
import { countryCurrencySymbol, documentTax } from "@/lib/country-context";
import { fetchExpenseCategories } from "@/lib/expenses";
import { formatInvoiceDate, invoiceMoney, toIsoDate } from "@/lib/invoices";
import { useCaptureStore } from "@/stores/capture";

const BILLS_HREF = "/expenses/bills";

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
 * New bill, a saved bill, or a converted one.
 *
 * Saving needs a supplier and a category and nothing more: the bill is only
 * recorded, and turning it into an expense is a separate step on the Bills
 * list ("Convert to expense"). A converted bill is read-only — its expense is
 * what gets matched and edited from here on, and "Undo conversion" (while that
 * expense is still unmatched) is the way back.
 */
export function BillForm({ billId }: { billId?: string }) {
  const router = useRouter();
  const billQuery = useBillQuery(billId);
  const bill = billQuery.data;
  const readOnly = !!bill && bill.status !== "draft";

  const createBill = useCreateBillMutation();
  const updateBill = useUpdateBillMutation();
  const unapproveBill = useUnapproveBillMutation();

  const [draft, setDraft] = React.useState<BillDraft>(() =>
    emptyBillDraft(toIsoDate(new Date())),
  );
  const [edited, setEdited] = React.useState(false);
  const { guardNavigate, dialog: unsavedDialog } = useUnsavedChanges(edited && !readOnly);
  const patch = (values: Partial<BillDraft>) => {
    setEdited(true);
    setDraft((current) => ({ ...current, ...values }));
  };

  /*
   * The due date and a new repeat's next bill date follow the bill date (and
   * the frequency) until each is picked by hand — see withBillDate and
   * withRepeatChange in lib/bills.
   */
  const nextDatePicked = React.useRef(false);
  const dueDatePicked = React.useRef(false);
  const patchRepeat = (values: Partial<BillRepeatDraft>) => {
    if ("nextDate" in values) nextDatePicked.current = true;
    patch({ repeat: withRepeatChange(draft, values, nextDatePicked.current, toIsoDate(new Date())) });
  };
  const patchBillDate = (billDate: string) => {
    patch(
      withBillDate(draft, billDate, { duePicked: dueDatePicked.current, nextPicked: nextDatePicked.current }, toIsoDate(new Date())),
    );
  };

  // New bill: files ride on the create. Existing draft: each upload/delete is live.
  const [pendingFiles, setPendingFiles] = React.useState<PendingFile[]>([]);
  const [attachmentRows, setAttachmentRows] = React.useState<MultiAttachmentRow[]>([]);

  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current || !bill) return;
    seeded.current = true;
    setDraft(draftFromBill(bill));
    setAttachmentRows(
      bill.attachments.map((attachment) => ({
        key: attachment.documentId,
        name: attachment.name,
        url: attachment.url,
        status: "idle" as const,
      })),
    );
  }, [bill]);

  const { country } = useCountryContext();
  const tax = documentTax(country, draft.billDate || null);
  // The draft's recorded rate while its date hasn't moved, as the expense form
  // does; otherwise the business's rate on the bill date (10% AU, 15% NZ, custom).
  const taxRate = bill?.gstPercent != null && draft.billDate === bill.billDate ? bill.gstPercent : tax.rate;
  // Not registered: no line can carry tax, so the column isn't offered.
  const taxWord = country.effectiveTax.registered ? tax.word : null;
  const currencyMark = countryCurrencySymbol(country);

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

  /*
   * A bill read by Add bill → Scan bill. Taken once, only for a new bill: its
   * lines, dates and number fill the form, and the document rides along as the
   * attachment. The supplier is the one the server matched, or an exact name
   * match once the supplier list lands.
   */
  const captureTaken = React.useRef(false);
  const [capturedSupplier, setCapturedSupplier] = React.useState<{ id: string | null; name: string } | null>(null);
  const [foreignCurrency, setForeignCurrency] = React.useState<{ currency: string; businessCurrency: string } | null>(null);
  React.useEffect(() => {
    if (captureTaken.current || billId) return;
    captureTaken.current = true;
    const taken = useCaptureStore.getState().takeBill();
    if (!taken) return;

    const { fields, confidence, file } = taken;
    const lines = fields.lines.length
      ? fields.lines.map((line) => newBillLine(line))
      : [newBillLine({ description: "Bill total", price: fields.total })];
    setDraft((current) => ({
      ...current,
      billNo: fields.billNo,
      billDate: fields.billDate || current.billDate,
      // A bill read without a due date falls due on its bill date, as a typed one does.
      dueDate: fields.dueDate || fields.billDate || current.dueDate,
      notes: fields.notes,
      lines,
      source: "ocr",
      confidence: Math.round(confidence * 100),
    }));
    setCapturedSupplier({ id: fields.supplierId, name: fields.supplierName });
    setForeignCurrency(fields.foreignCurrency);
    void readAsDataUrl(file).then((previewUrl) =>
      setPendingFiles((current) => [...current, { key: `pending_${Date.now()}`, file, previewUrl }]),
    );
    setEdited(true);
    toast.success(`Bill read with ${Math.round(confidence * 100)}% confidence`, {
      description: "Check the supplier, dates and lines before you save.",
    });
  }, [billId]);

  React.useEffect(() => {
    if (!capturedSupplier || !suppliersQuery.isSuccess) return;
    setCapturedSupplier(null);
    const list = suppliersQuery.data ?? [];
    const needle = capturedSupplier.name.trim().toLowerCase();
    const supplier =
      list.find((entry) => capturedSupplier.id && entry.id === capturedSupplier.id) ??
      (needle ? list.find((entry) => entry.name.trim().toLowerCase() === needle) : undefined);
    if (supplier) {
      setDraft((current) => (current.supplierId ? current : { ...current, supplierId: supplier.id, supplierName: supplier.name }));
    } else if (needle) {
      toast.info(`"${capturedSupplier.name}" isn't one of your suppliers yet`, {
        description: "Pick or add the supplier before you save the bill.",
      });
    }
  }, [capturedSupplier, suppliersQuery.isSuccess, suppliersQuery.data]);

  // A bill already in a series is changed through its schedule, not here.
  const startsRepeat = !bill?.schedule;
  const totals = billTotals(draft.lines, taxWord ? taxRate : 0);
  const issues = billIssues(draft);
  const blockers = saveIssues(draft, startsRepeat);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [triedSave, setTriedSave] = React.useState(false);
  const issueFor = (key: string) =>
    (edited ? issues : []).concat(triedSave ? blockers : []).find((issue) => issue.key === key)?.message;

  const savingAttachment = attachmentRows.some((row) => row.status !== "idle");
  const busy = createBill.isPending || updateBill.isPending;

  const handleAddFiles = async (files: File[]) => {
    const previews = await Promise.all(files.map(readAsDataUrl));
    if (!bill) {
      setPendingFiles((current) => [
        ...current,
        ...files.map((file, index) => ({ key: `pending_${Date.now()}_${index}`, file, previewUrl: previews[index] })),
      ]);
      return;
    }
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const placeholder: MultiAttachmentRow = {
        key: `uploading_${Date.now()}_${index}`,
        name: file.name,
        size: file.size,
        url: previews[index],
        status: "uploading",
      };
      setAttachmentRows((current) => [...current, placeholder]);
      try {
        const documentId = await uploadBillAttachment(bill.id, file);
        setAttachmentRows((current) =>
          current.map((row) => (row.key === placeholder.key ? { ...row, key: documentId ?? row.key, status: "idle" } : row)),
        );
      } catch (error) {
        toast.error(apiErrorMessage(error, `Couldn't attach "${file.name}". Try again.`));
        setAttachmentRows((current) => current.filter((row) => row.key !== placeholder.key));
      }
    }
  };

  const handleRemoveRow = async (key: string) => {
    if (!bill) {
      setPendingFiles((current) => current.filter((item) => item.key !== key));
      return;
    }
    setAttachmentRows((current) => current.map((row) => (row.key === key ? { ...row, status: "deleting" } : row)));
    try {
      await deleteBillAttachment(bill.id, key);
      setAttachmentRows((current) => current.filter((row) => row.key !== key));
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't remove that attachment. Try again."));
      setAttachmentRows((current) => current.map((row) => (row.key === key ? { ...row, status: "idle" } : row)));
    }
  };

  /** Saves the draft; resolves to its id, or null when the save failed (already toasted). */
  const saveDraft = async (): Promise<string | null> => {
    try {
      const result = bill
        ? await updateBill.mutateAsync({ id: bill.id, draft, startsRepeat })
        : await createBill.mutateAsync({ draft, files: pendingFiles.map((item) => item.file) });
      if (result.duplicateOf) {
        toast.warning("You already have a bill with this number from this supplier", {
          description: "Check it isn't the same bill entered twice.",
        });
      }
      setEdited(false);
      return result.id;
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to save bill."));
      return null;
    }
  };

  const onSave = async () => {
    setTriedSave(true);
    if (issues.length > 0 || blockers.length > 0) return;
    const id = await saveDraft();
    if (!id) return;
    toast.success("Bill saved", {
      description:
        startsRepeat && draft.repeat.enabled
          ? "The next bill will be made on the date you chose."
          : "Match it to the payment from the Bills list once it leaves your bank.",
    });
    router.push(BILLS_HREF);
  };

  /*
   * Pay from the bank feed. A saved bill needs what an expense needs first, and
   * unsaved edits are saved before the match dialog opens, so what's matched is
   * what's on screen.
   */
  const [matching, setMatching] = React.useState<Bill | null>(null);
  const [preparingMatch, setPreparingMatch] = React.useState(false);
  const onMatch = async () => {
    if (!bill) return;
    if (bill.status === "draft") {
      setTriedSave(true);
      const missing = [...issues, ...blockers, ...approveIssues(draft, totals.total)];
      if (missing.length > 0) {
        toast.info(`${missing[0].message} to match this bill`);
        return;
      }
    }
    if (!edited) {
      setMatching(bill);
      return;
    }
    setPreparingMatch(true);
    const id = await saveDraft();
    const fresh = id ? (await billQuery.refetch()).data : undefined;
    setPreparingMatch(false);
    if (fresh) setMatching(fresh);
  };

  const [confirmUnapprove, setConfirmUnapprove] = React.useState(false);
  const onUnapprove = async () => {
    if (!bill) return;
    try {
      await unapproveBill.mutateAsync(bill.id);
      setConfirmUnapprove(false);
      toast.success("Bill moved back to saved", { description: "Its expense has been removed." });
      seeded.current = false;
      void billQuery.refetch();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't unapprove this bill."));
    }
  };

  if (billId && billQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6" aria-hidden>
        <Shimmer className="h-8 w-48 rounded-md" />
        <Shimmer className="h-96 w-full rounded-lg border border-border" />
      </div>
    );
  }

  if (billId && billQuery.isError) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={BILLS_HREF}>
            <ArrowLeft />
            Bills
          </Link>
        </Button>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="font-medium">Couldn&apos;t load this bill</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {billQuery.error?.message || "Something went wrong loading this bill. Try again."}
          </p>
        </div>
      </div>
    );
  }

  const paid = bill?.paymentStatus === "paid";
  const partPaid = bill?.paymentStatus === "part_paid";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={guardNavigate(BILLS_HREF)}>
          <ArrowLeft />
          Bills
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* The edit-draft tour anchors here; the approved bill's is on its banner. */}
          <div
            className="space-y-1"
            data-usertour={bill && !readOnly ? "bill-edit-header" : undefined}
          >
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {bill ? `Bill ${bill.billNo || ""}`.trim() : "New bill"}
              {bill && <BillStatusBadge bill={bill} />}
            </h1>
            <p className="text-sm text-muted-foreground">
              {readOnly
                ? "Converted bills can't be edited. Their expense is what gets matched and changed from here."
                : "Save the bill now, and match it to the payment once it leaves your bank."}
            </p>
          </div>
        </div>
      </div>

      {readOnly && bill && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/[0.03] px-4 py-3"
          data-usertour="bill-approved-banner"
        >
          <p className="text-sm">
            {paid
              ? "Paid — its expense is matched to a bank transaction."
              : partPaid
                ? `Part paid — ${invoiceMoney(bill.amountPaid)} of ${invoiceMoney(bill.total)} matched, ${invoiceMoney(bill.amountDue)} still to pay${bill.dueDate ? ` by ${formatInvoiceDate(bill.dueDate)}` : ""}.`
                : `Converted to an expense${bill.dueDate ? `, due ${formatInvoiceDate(bill.dueDate)}` : ""}. Match its expense to the payment once it leaves your bank.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {isBillOwed(bill) && (
              <Button size="sm" onClick={() => void onMatch()}>
                <Link2 />
                Match
              </Button>
            )}
            {bill.expenseId && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/expenses/${bill.expenseId}`}>
                  <ExternalLink />
                  View expense
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={paid || partPaid}
              title={paid || partPaid ? "Unmatch the expense first to undo the conversion." : undefined}
              onClick={() => setConfirmUnapprove(true)}
            >
              <Undo2 />
              Undo conversion
            </Button>
          </div>
        </div>
      )}

      {foreignCurrency && !readOnly && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            This bill is in <span className="font-medium">{foreignCurrency.currency}</span>. Bills are recorded in{" "}
            <span className="font-medium">{foreignCurrency.businessCurrency}</span>, so convert the line amounts before
            you save it.
          </p>
        </div>
      )}

      {bill?.duplicateOf && !readOnly && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            Another bill from this supplier has the same number.{" "}
            <Link href={`/expenses/bills/${bill.duplicateOf}`} className="font-medium underline underline-offset-2">
              Open it
            </Link>{" "}
            to check this isn&apos;t entered twice.
          </p>
        </div>
      )}

      {bill?.schedule && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
          data-usertour="bill-series-banner"
        >
          <div className="space-y-1">
            <RepeatBadge schedule={bill.schedule} occurrenceNo={bill.occurrenceNo} onManage={() => setScheduleOpen(true)} />
            <p className="text-xs text-muted-foreground">
              {[
                bill.schedule.status === "active" && bill.schedule.nextDate
                  ? `Next bill on ${formatInvoiceDate(bill.schedule.nextDate)}`
                  : bill.schedule.status === "stopped"
                    ? "This repeat was stopped"
                    : bill.schedule.status === "ended"
                      ? "This repeat has finished"
                      : null,
                scheduleEndLabel(bill.schedule),
              ]
                .filter(Boolean)
                .join(" · ")}
              . Editing this bill changes only this bill.
            </p>
          </div>
          {/* Above the disabled fieldset: managing the repeat works on a converted bill too. */}
          <Button type="button" variant="outline" size="sm" onClick={() => setScheduleOpen(true)}>
            <Repeat />
            Manage repeat
          </Button>
        </div>
      )}

      {/* Disabled as a whole once approved: the pickers have no disabled prop
          of their own, and a disabled fieldset reaches every control inside. */}
      <fieldset disabled={readOnly} className="min-w-0 space-y-6">
      <FormSection
        icon={FileText}
        title="Bill details"
        description="Who sent it, their reference, and when it's due."
        tourId="bill-details"
        className="grid gap-4 sm:grid-cols-2"
      >
        <BusinessContactSelect
          type="Supplier"
          label="Supplier"
          contacts={suppliers}
          loading={suppliersQuery.isLoading}
          contactId={draft.supplierId}
          contactName={draft.supplierName}
          onSelect={({ contactId, contactName }) => patch({ supplierId: contactId, supplierName: contactName })}
          onContactsChanged={() => suppliersQuery.refetch()}
          error={issueFor("supplier")}
        />
        <Field label="Bill number" htmlFor="bill-no" hint="The supplier's own reference">
          <Input
            id="bill-no"
            value={draft.billNo}
            onChange={(event) => patch({ billNo: event.target.value })}
            placeholder="BILL-1042"
            disabled={readOnly}
          />
        </Field>
        <Field label="Bill date" required error={issueFor("billDate")}>
          <DatePicker label="Bill date" value={draft.billDate} onChange={patchBillDate} />
        </Field>
        <Field label="Due date" required error={issueFor("dueDate")}>
          <DatePicker
            label="Due date"
            value={draft.dueDate}
            onChange={(iso) => {
              dueDatePicked.current = true;
              patch({ dueDate: iso });
            }}
            invalid={!!issueFor("dueDate")}
          />
        </Field>
        <div className="sm:col-span-2">
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

        {/* A bill already in a series changes its repeat from the banner above. */}
        {!bill?.schedule && !readOnly && (
          <div className="space-y-3 sm:col-span-2" data-usertour="bill-repeat">
            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox
                className="mt-0.5"
                checked={draft.repeat.enabled}
                onCheckedChange={(checked) => patchRepeat({ enabled: checked === true })}
                aria-label="Repeat this bill"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">Repeat this bill</span>
                <span className="block text-xs text-muted-foreground">
                  For rent, subscriptions, loan repayments and anything else that comes round again. A new saved copy is
                  made on each date; you convert it to an expense when it arrives.
                </span>
              </span>
            </label>
            {draft.repeat.enabled && (
              // Appears when "Repeat this bill" is ticked — the repeat tour starts on it.
              <div className="pl-6" data-usertour="bill-repeat-fields">
                <BillRepeatFields
                  idPrefix="bill-repeat"
                  value={draft.repeat}
                  onChange={patchRepeat}
                  errorFor={issueFor}
                  countHint="Including this bill."
                />
              </div>
            )}
          </div>
        )}
      </FormSection>

      <FormSection
        icon={ListOrdered}
        title="Line items"
        description={taxWord ? `Enter amounts excluding ${taxWord}; tick the lines it applies to.` : "What the bill is for, line by line."}
        tourId="bill-lines"
      >
        <BillLineItems
          lines={draft.lines}
          onChange={(lines) => patch({ lines })}
          rate={taxRate}
          taxWord={taxWord}
          currencyMark={currencyMark}
          readOnly={readOnly}
          errorFor={(key) => issueFor(key)}
        />
        {issueFor("total") && <p className="mt-2 text-xs text-destructive">{issueFor("total")}</p>}
      </FormSection>
      </fieldset>

      <BillSupplierHistory supplierId={draft.supplierId} supplierName={draft.supplierName} billId={bill?.id} total={totals.total} />

      <FormSection icon={Paperclip} title="Bill & notes" description="Keep the supplier's bill with it, and anything worth remembering." tourId="bill-attachments">
        <div className="space-y-4">
          <MultiAttachmentUpload
            noun="bill"
            disabled={readOnly}
            rows={
              bill
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
          <Field label="Notes" htmlFor="bill-notes">
            <Textarea
              id="bill-notes"
              rows={3}
              value={draft.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              disabled={readOnly}
            />
          </Field>
        </div>
      </FormSection>

      {!readOnly && (
        <div
          className="flex flex-wrap items-center justify-end gap-2 border-t pt-4"
          data-usertour="bill-save-actions"
        >
          {triedSave && blockers.length > 0 && (
            <p className="mr-auto text-xs text-destructive">
              {blockers.length === 1 ? blockers[0].message : `${blockers.length} things to fix before saving`}
            </p>
          )}
          <span className="mr-2 text-sm text-muted-foreground">
            Total <span className="font-semibold tabular text-foreground">{invoiceMoney(totals.total)}</span>
          </span>
          <Button variant="outline" onClick={guardNavigate(BILLS_HREF)}>
            Cancel
          </Button>
          {bill && (
            <Button
              variant="outline"
              onClick={() => void onMatch()}
              disabled={issues.length > 0 || busy || savingAttachment || preparingMatch}
              title={edited ? "Saves your changes, then finds the payment" : undefined}
            >
              {preparingMatch ? <Loader2 className="animate-spin" /> : <Link2 />}
              {edited ? "Save & match" : "Match"}
            </Button>
          )}
          <Button onClick={() => void onSave()} disabled={issues.length > 0 || busy || savingAttachment}>
            {busy && !preparingMatch && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </div>
      )}

      <AlertDialog open={confirmUnapprove} onOpenChange={(open) => !open && !unapproveBill.isPending && setConfirmUnapprove(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this conversion?</AlertDialogTitle>
            <AlertDialogDescription>
              Its expense is removed and the bill goes back to saved, so you can edit it. The attached bill moves back with it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unapproveBill.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={unapproveBill.isPending}
              onClick={(event) => {
                event.preventDefault();
                void onUnapprove();
              }}
            >
              {unapproveBill.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Undo conversion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BillMatchDialog bill={matching} onClose={() => setMatching(null)} />

      {bill?.schedule && (
        <BillScheduleSheet scheduleId={scheduleOpen ? bill.schedule.id : null} onClose={() => setScheduleOpen(false)} />
      )}

      {unsavedDialog}
    </div>
  );
}
