"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ClientCombobox } from "@/components/documents/client-combobox";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { DocumentLineItems } from "@/components/documents/line-items";
import { TotalsPanel } from "@/components/documents/totals-panel";
import { quickEditInvoiceIdAtom } from "@/lib/atoms";
import {
  documentIssues,
  draftFromInvoice,
  fetchInvoiceDetail,
  newLineItem,
  type InvoiceDraft,
  type InvoiceLineItem,
} from "@/lib/invoices";
import { useSalesSettings } from "@/lib/use-sales-settings";
import { useCountryContext } from "@/hooks/use-country-context";
import { documentTax } from "@/lib/country-context";
import { cn } from "@/lib/utils";
import { useInvoicesStore } from "@/stores/invoices";

/**
 * Editing an invoice without leaving the list you found it from.
 *
 * Built out of the same parts the full editor is — the client combobox, the
 * date pickers, the line-item table, the totals panel — rather than a second
 * form that looks like them. A field that changes in one changes in both,
 * because there's only one of each.
 *
 * It covers what a linked invoice usually needs correcting: who it's to, its
 * number and dates, what's on it. Everything else the document can carry —
 * deposits, attachments, reminders, repeats, a claim header — stays with the
 * full editor, and the link in the footer goes there.
 */
export function InvoiceQuickEditDialog() {
  const router = useRouter();
  const [invoiceId, setInvoiceId] = useAtom(quickEditInvoiceIdAtom);
  const invoices = useInvoicesStore((state) => state.invoices);
  const updateInvoice = useInvoicesStore((state) => state.updateInvoice);
  const { settings: sales } = useSalesSettings();

  const invoice = invoices.find((entry) => entry.id === invoiceId);

  const [draft, setDraft] = React.useState<InvoiceDraft | null>(null);
  const [edited, setEdited] = React.useState(false);
  /**
   * What the person was trying to do when the confirmation interrupted them —
   * closing, or opening the full editor. Held rather than dropped so Save and
   * Discard both continue on to it, as they do on Transactions: being asked a
   * question shouldn't cost you the click that prompted it.
   */
  const [pending, setPending] = React.useState<(() => void) | null>(null);

  /* Seeded per invoice, so opening a different one doesn't inherit its edits. */
  React.useEffect(() => {
    setDraft(invoice ? draftFromInvoice(invoice) : null);
    setEdited(false);
    setPending(null);
  }, [invoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The list's own copy has only a placeholder line item — replaced with the
  // real breakdown once it arrives, as long as nothing has been typed yet.
  const detailQuery = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => fetchInvoiceDetail(invoiceId as string),
    enabled: invoiceId !== null,
  });
  React.useEffect(() => {
    if (detailQuery.data && detailQuery.data.id === invoiceId && !edited) {
      setDraft(draftFromInvoice(detailQuery.data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailQuery.data]);

  // The business's rate on the issue date (custom, or its country's) — not a fixed 10%.
  const { country } = useCountryContext();
  const docTax = documentTax(country, draft?.issued);
  const showGst = docTax.offered && sales.invoiceFields.gst;
  const issues = draft ? documentIssues(draft) : [];
  const issueFor = (key: string) =>
    edited ? issues.find((issue) => issue.key === key)?.message : undefined;

  const fieldRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const register = (key: string) => (node: HTMLElement | null) => {
    fieldRefs.current[key] = node;
  };

  const patch = (values: Partial<InvoiceDraft>) => {
    setEdited(true);
    setDraft((current) => (current ? { ...current, ...values } : current));
  };

  const patchItem = (id: string, values: Partial<InvoiceLineItem>) => {
    setEdited(true);
    setDraft((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === id ? { ...item, ...values } : item,
            ),
          }
        : current,
    );
  };

  const removeItem = (id: string) => {
    setEdited(true);
    setDraft((current) =>
      current
        ? { ...current, items: current.items.filter((item) => item.id !== id) }
        : current,
    );
  };

  const addItem = () => {
    setEdited(true);
    setDraft((current) =>
      current
        ? { ...current, items: [...current.items, newLineItem()] }
        : current,
    );
  };

  /*
   * Compared whole rather than field by field: the draft is plain data, and a
   * hand-written comparison is one field behind the day someone adds another.
   */
  const dirty =
    !!invoice &&
    !!draft &&
    JSON.stringify(draft) !== JSON.stringify(draftFromInvoice(invoice));

  const close = () => setInvoiceId(null);

  /** Anything that would leave the form asks first, if there's anything to lose. */
  const leave = (action: () => void) => {
    if (dirty) {
      setPending(() => action);
      return;
    }
    action();
  };

  const save = () => {
    if (!invoice || !draft || issues.length > 0) return false;
    updateInvoice(invoice.id, draft);
    toast.success(`${draft.number} updated`);
    return true;
  };

  /** Save or discard, then carry on to whatever was interrupted. */
  const resolve = (keep: boolean) => {
    if (keep && !save()) {
      // Still invalid, so there's nothing to save and nowhere to go yet.
      setPending(null);
      return;
    }
    const next = pending;
    setPending(null);
    next?.();
  };

  const openFullEditor = () =>
    leave(() => {
      close();
      if (invoice) router.push(`/invoices/${invoice.id}`);
    });

  return (
    <>
      <Dialog
        open={invoiceId !== null}
        onOpenChange={(open) => !open && leave(close)}
      >
        {/*
          Wide enough that the line-item table fits at its natural 820px and the
          totals card sits fully inside the panel. The base content is already
          `w-[calc(100%-2rem)]` and centred on both axes, so this only raises the
          ceiling — on a narrow viewport it still shrinks to the window.
        */}
        <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-[1100px]">
          <DialogHeader>
            <DialogTitle>
              {invoice ? `Edit ${invoice.number}` : "Edit invoice"}
            </DialogTitle>
            <DialogDescription>
              The parts of this invoice you&apos;re most likely to correct.
              Deposits, attachments, reminders and repeats live in the full
              editor.
            </DialogDescription>
          </DialogHeader>

          {draft && (
            /*
              min-w-0 because the content is a grid item, and a grid item's
              default `min-width: auto` refuses to shrink below its widest
              child. The line-item table is 820px at its narrowest, so without
              this the whole panel is dragged out to that width and clipped
              instead of the table scrolling inside its own frame.
            */
            <div className="min-w-0 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <ClientCombobox
                    clientId={draft.clientId}
                    clientName={draft.clientName}
                    onSelect={patch}
                    error={issueFor("client")}
                    register={register("client")}
                    showAddress={sales.invoiceFields.customerAddress}
                    showAbn={sales.invoiceFields.customerAbn}
                  />
                </div>

                <Field
                  label="Invoice number"
                  required
                  error={issueFor("number")}
                >
                  <Input
                    ref={register("number")}
                    value={draft.number}
                    onChange={(event) => patch({ number: event.target.value })}
                    aria-invalid={!!issueFor("number")}
                    className={cn(
                      "tabular",
                      issueFor("number") &&
                        "border-destructive focus-visible:ring-destructive",
                    )}
                  />
                </Field>

                <Field label="Description">
                  <Input
                    value={draft.description}
                    onChange={(event) =>
                      patch({ description: event.target.value })
                    }
                  />
                </Field>

                <Field label="Invoice date" required>
                  <DatePicker
                    label="Invoice date"
                    value={draft.issued}
                    onChange={(iso) => patch({ issued: iso })}
                  />
                </Field>

                <Field label="Due date" required error={issueFor("due")}>
                  <DatePicker
                    label="Due date"
                    value={draft.due}
                    onChange={(iso) => patch({ due: iso })}
                  />
                </Field>
              </div>

              <DocumentLineItems
                items={draft.items}
                onPatch={patchItem}
                onRemove={removeItem}
                onAdd={addItem}
                register={register}
                showGst={showGst}
                gstPercent={docTax.rate}
                perLineDiscountType
              />

              <TotalsPanel
                items={draft.items}
                extraDiscount={draft.extraDiscount}
                onExtraDiscountChange={(value) =>
                  patch({ extraDiscount: value })
                }
                showGst={showGst}
                gstPercent={docTax.rate}
              />

              <Field label="Notes">
                <Textarea
                  rows={2}
                  value={draft.notes}
                  onChange={(event) => patch({ notes: event.target.value })}
                />
              </Field>
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            {/* Not a Link's own navigation: unsaved edits get a question first,
                and the answer decides whether the page opens with them. */}
            <Button variant="ghost" onClick={openFullEditor}>
              Open full editor
              <ArrowUpRight />
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => leave(close)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (save()) close();
                }}
                disabled={issues.length > 0}
              >
                Save changes
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Same question the Transactions table asks when you leave a cell
          mid-edit: not a silent save, and not a silent loss. */}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Do you want to save your changes?</DialogTitle>
            <DialogDescription>
              {invoice
                ? `${invoice.number} has edits you haven't saved.`
                : "This invoice has edits you haven't saved."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => resolve(false)}>
              Discard
            </Button>
            <Button onClick={() => resolve(true)} disabled={issues.length > 0}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
