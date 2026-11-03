"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Landmark, ReceiptText } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { ClientCombobox } from "@/components/documents/client-combobox";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import { documentTax } from "@/lib/country-context";
import { invoiceAmount, invoiceMoney, toIsoDate } from "@/lib/invoices";
import {
  REFUND_REASONS,
  REFUND_TYPES,
  autoGst,
  draftFromRefund,
  duplicateRefundDraft,
  emptyRefundDraft,
  generateClientRefundNumberApi,
  nextRefundReference,
  prefillFromInvoice,
  refundAmount,
  refundAmountError,
  refundGst,
  refundGstError,
  refundBankRules,
  refundIssues,
  type RefundBankInfo,
  type RefundDraft,
  type RefundReason,
  type RefundType,
} from "@/lib/refunds";
import { cn } from "@/lib/utils";
import { refundNumbering } from "@/lib/sales-settings";
import { useSalesSettings } from "@/lib/use-sales-settings";
import { useCountryContext } from "@/hooks/use-country-context";
import {
  useClientRefundsUserId,
  useCreateClientRefundMutation,
  useUpdateClientRefundMutation,
} from "@/hooks/use-client-refunds-query";
import { useInvoicesStore } from "@/stores/invoices";
import { useRefundsStore } from "@/stores/refunds";
import { activeCurrencySymbol } from "@/lib/country-context";

const NO_INVOICE = "none";

export function RefundForm({
  refundId,
  copyOfId,
}: {
  /** Editing an existing refund. */
  refundId?: string;
  /** Issuing another like this one: its values seed a new refund. */
  copyOfId?: string;
} = {}) {
  const router = useRouter();
  const refunds = useRefundsStore((state) => state.refunds);
  const invoices = useInvoicesStore((state) => state.invoices);
  // Prefix and starting number come from Sales settings, not a hardcoded "CRN".
  const { settings: sales } = useSalesSettings();
  const userId = useClientRefundsUserId();
  const createMutation = useCreateClientRefundMutation();
  const updateMutation = useUpdateClientRefundMutation();

  const editing = refunds.find((refund) => refund.id === refundId);
  const copyOf = refunds.find((refund) => refund.id === copyOfId);

  // Seeded once: re-deriving would discard edits on every store change. A
  // locally-derived reference fills the field immediately; the real
  // server-issued one (below) replaces it once it lands, same fallback
  // relationship as the reference's own "keep typing if it fails" behaviour.
  const [draft, setDraft] = React.useState<RefundDraft>(() => {
    const today = toIsoDate(new Date());
    const reference = nextRefundReference(refunds, refundNumbering(sales));
    if (editing) return draftFromRefund(editing);
    if (copyOf) return duplicateRefundDraft(copyOf, reference, today);
    return emptyRefundDraft(reference, today);
  });

  // Every new document — a fresh issue or a duplicate — needs its own
  // server-issued reference, the same call sole-webapp's own create modal
  // makes when it opens. Silently keeps the local fallback already in the
  // draft if this fails, rather than blocking the form.
  React.useEffect(() => {
    if (editing || userId === undefined) return;
    let cancelled = false;
    generateClientRefundNumberApi(userId)
      .then((reference) => {
        if (!cancelled) setDraft((current) => ({ ...current, reference }));
      })
      .catch(() => {
        // Keep the locally-generated fallback already seeded above.
      });
    return () => {
      cancelled = true;
    };
    // Only ever run once per visit to the form — a fresh number shouldn't be
    // fetched again just because the draft itself changed.
     
  }, [editing, userId]);

  /**
   * Errors surface once the form has been edited — with submit disabled until
   * valid, a submit-time reveal could never fire.
   */
  const [edited, setEdited] = React.useState(false);

  const fieldRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const register = (key: string) => (node: HTMLElement | null) => {
    fieldRefs.current[key] = node;
  };

  /*
   * GST in the business's own terms: its word (GST, VAT) and the rate on the
   * refund date — its custom rate, else 10% AU / 15% NZ / 15% ZA.
   */
  const { country } = useCountryContext();
  const refundTax = documentTax(country, draft.date);
  // How the auto figure is worked out, in words: "amount ÷ 11" at 10%.
  const inclusiveFormula =
    refundTax.rate === 10
      ? "amount ÷ 11"
      : `amount × ${refundTax.rate} ÷ ${Math.round((100 + refundTax.rate) * 10000) / 10000}`;

  // BSB + account number in Australia; one long account number in New Zealand.
  const bankRules = refundBankRules(country);
  const issues = refundIssues(draft, refundTax.word, bankRules);
  const issueFor = (key: string) =>
    edited ? issues.find((issue) => issue.key === key)?.message : undefined;

  const patch = (values: Partial<RefundDraft>) => {
    setEdited(true);
    setDraft((current) => ({ ...current, ...values }));
  };

  const patchBank = (values: Partial<RefundBankInfo>) => {
    setEdited(true);
    setDraft((current) => ({
      ...current,
      bank: { ...(current.bank ?? { accountName: "", bsb: "", accountNumber: "" }), ...values },
    }));
  };

  /** Only this client's invoices can be refunded against. */
  const clientInvoices = draft.clientId
    ? invoices.filter((invoice) => invoice.clientId === draft.clientId)
    : [];
  const linked = invoices.find((invoice) => invoice.id === draft.invoiceId);

  const isRefund = draft.type === "Client refund";
  const liveAmountError = refundAmountError(draft.amount);
  const liveGstError = refundGstError(draft.gstAmount, refundTax.word);

  /** Amount edits carry the GST figure along until it's been typed over. */
  const onAmountChange = (value: string) =>
    patch({
      amount: value,
      ...(draft.gstManual ? {} : { gstAmount: autoGst(value, refundTax.rate) }),
    });

  const onSelectInvoice = (value: string) => {
    if (value === NO_INVOICE) {
      patch({ invoiceId: null });
      return;
    }
    const invoice = invoices.find((entry) => entry.id === value);
    if (!invoice) return;

    const prefill = prefillFromInvoice(invoice);
    patch({
      ...prefill,
      ...(draft.gstManual
        ? {}
        : { gstAmount: autoGst(prefill.amount, refundTax.rate) }),
    });
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  const onSave = () => {
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, draft, status: editing.status },
        {
          onSuccess: () => {
            toast.success(`${draft.reference.trim()} updated`);
            router.push("/sales/client-refunds");
          },
          onError: (error: Error) =>
            toast.error(error.message || "Failed to update refund."),
        },
      );
    } else {
      createMutation.mutate(draft, {
        onSuccess: () => {
          toast.success(`${draft.reference.trim()} issued`);
          router.push("/sales/client-refunds");
        },
        onError: (error: Error) =>
          toast.error(error.message || "Failed to issue refund."),
      });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/sales/client-refunds">
            <ArrowLeft />
            Client refunds
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {editing
              ? `Edit ${editing.reference}`
              : copyOf
                ? "Issue another refund"
                : "Issue client refund"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {copyOf ? (
              <>Copied from {copyOf.reference}, dated today with a new reference.</>
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
        title="Refund details"
        description="Who it's going to, what it's against, and how much."
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          {/* Still backed by the mock contacts store (stores/contacts.ts),
              not the real, API-backed contact picker used elsewhere
              (lib/clients.ts). Harmless either way, since the server never
              actually reads this id — it always derives the client from the
              linked invoice below instead (see lib/refunds.ts). Swapping the
              picker for the real one is a cross-cutting change outside this
              module, and not required for refunds to save correctly. */}
          <ClientCombobox
            clientId={draft.clientId}
            clientName={draft.clientName}
            onSelect={({ clientId, clientName }) =>
              // Changing client drops the invoice link — one client's invoice
              // can't be refunded to another.
              patch({ clientId, clientName, invoiceId: null })
            }
            error={issueFor("client")}
            register={register("client")}
          />
        </div>

        <div className="sm:col-span-2">
          <Field
            label="Link to an invoice"
            hint={
              draft.clientId
                ? clientInvoices.length > 0
                  ? "Optional. Choosing one fills in the amount and reference."
                  : "This client has no invoices on file."
                : "Select a client first to see their invoices."
            }
          >
            <Select
              value={draft.invoiceId ?? NO_INVOICE}
              onValueChange={onSelectInvoice}
              disabled={clientInvoices.length === 0}
            >
              <SelectTrigger aria-label="Link to an invoice">
                <SelectValue placeholder="No invoice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_INVOICE}>No invoice</SelectItem>
                {clientInvoices.map((invoice) => (
                  <SelectItem key={invoice.id} value={invoice.id}>
                    {invoice.number} · {invoiceMoney(invoiceAmount(invoice))} ·{" "}
                    {invoice.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Type" required>
          <Select
            value={draft.type}
            onValueChange={(value) => patch({ type: value as RefundType })}
          >
            <SelectTrigger aria-label="Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFUND_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Refund date" required error={issueFor("date")}>
          <DatePicker
            label="Refund date"
            value={draft.date}
            onChange={(iso) => patch({ date: iso })}
          />
        </Field>

        <Field
          label="Reference no"
          required
          error={issueFor("reference")}
          hint={linked ? `Borrowed from ${linked.number}.` : "Auto-generated — edit if you use your own numbering."}
        >
          <Input
            ref={register("reference")}
            value={draft.reference}
            onChange={(event) => patch({ reference: event.target.value })}
            aria-invalid={!!issueFor("reference")}
            className={cn(
              "tabular",
              issueFor("reference") &&
                "border-destructive focus-visible:ring-destructive",
            )}
          />
        </Field>

        <Field
          label={`Amount (${activeCurrencySymbol()})`}
          required
          error={liveAmountError ?? issueFor("amount")}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {activeCurrencySymbol()}
            </span>
            <Input
              ref={register("amount")}
              value={draft.amount}
              inputMode="decimal"
              onChange={(event) => onAmountChange(event.target.value)}
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

        <Field
          label={`${refundTax.word} included in this amount (${activeCurrencySymbol()})`}
          error={liveGstError ?? issueFor("gstAmount")}
          hint={
            draft.gstManual
              ? "Entered manually."
              : `The ${refundTax.word} already inside the refund (${inclusiveFormula}) — type over it to override.`
          }
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {activeCurrencySymbol()}
              </span>
              <Input
                ref={register("gstAmount")}
                value={draft.gstAmount}
                inputMode="decimal"
                onChange={(event) =>
                  patch({ gstAmount: event.target.value, gstManual: true })
                }
                placeholder="0.00"
                aria-invalid={!!(liveGstError ?? issueFor("gstAmount"))}
                className={cn(
                  "pl-7 tabular",
                  (liveGstError ?? issueFor("gstAmount")) &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
            </div>
            {draft.gstManual && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground"
                onClick={() =>
                  patch({
                    gstManual: false,
                    gstAmount: autoGst(draft.amount, refundTax.rate),
                  })
                }
              >
                Recalculate
              </Button>
            )}
          </div>
        </Field>

        <Field label="Reason" required>
          <Select
            value={draft.reason}
            onValueChange={(value) => patch({ reason: value as RefundReason })}
          >
            <SelectTrigger aria-label="Reason">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFUND_REASONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* Only "Other" needs saying in words. */}
        {draft.reason === "Other" && (
          <Field
            label="Describe the reason"
            required
            error={issueFor("reasonOther")}
          >
            <Input
              ref={register("reasonOther")}
              value={draft.reasonOther}
              onChange={(event) => patch({ reasonOther: event.target.value })}
              placeholder="Goodwill credit after a delayed delivery"
              aria-invalid={!!issueFor("reasonOther")}
              className={cn(
                issueFor("reasonOther") &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </Field>
        )}

        <div className="sm:col-span-2">
          <Field label="Notes">
            <Textarea
              rows={3}
              value={draft.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              placeholder="Anything the client should see alongside this refund…"
            />
          </Field>
        </div>

        {refundAmount(draft) > 0 && (
          <div className="sm:col-span-2">
            {/* The amount is the whole of it — its GST sits inside, so the two
                are never added together. */}
            <div className="flex items-center justify-between gap-4 rounded-md bg-muted/40 p-3 text-sm">
              <span className="text-muted-foreground">
                {isRefund ? "Total refunded" : "Total credited"}
              </span>
              <span className="font-semibold tabular">
                {invoiceMoney(refundAmount(draft))}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  incl. {invoiceMoney(refundGst(draft))} {refundTax.word}
                </span>
              </span>
            </div>
          </div>
        )}
      </FormSection>

      {/* Where it's paid — a credit note isn't paid out, so it has no account. */}
      {isRefund && (
        <FormSection
          icon={Landmark}
          title="Bank info"
          description="The account this refund is being paid into."
          tone="warm"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field
                label="Account name"
                required
                error={issueFor("accountName")}
              >
                <Input
                  ref={register("accountName")}
                  value={draft.bank?.accountName ?? ""}
                  onChange={(event) =>
                    patchBank({ accountName: event.target.value })
                  }
                  placeholder="As it appears on the client's account"
                  aria-invalid={!!issueFor("accountName")}
                  className={cn(
                    issueFor("accountName") &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                />
              </Field>
            </div>

            {bankRules.branch && (
              <Field
                label={bankRules.branch.label}
                required
                error={issueFor("bsb")}
                hint={bankRules.branch.hint}
              >
                <Input
                  ref={register("bsb")}
                  value={draft.bank?.bsb ?? ""}
                  inputMode="numeric"
                  onChange={(event) => patchBank({ bsb: event.target.value })}
                  placeholder={bankRules.branch.placeholder}
                  aria-invalid={!!issueFor("bsb")}
                  className={cn(
                    "tabular",
                    issueFor("bsb") &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                />
              </Field>
            )}

            <div className={bankRules.branch ? undefined : "sm:col-span-2"}>
              <Field
                label={bankRules.account.label}
                required
                error={issueFor("accountNumber")}
                hint={bankRules.account.hint}
              >
                <Input
                  ref={register("accountNumber")}
                  value={draft.bank?.accountNumber ?? ""}
                  inputMode="numeric"
                  onChange={(event) =>
                    patchBank({ accountNumber: event.target.value })
                  }
                  placeholder={bankRules.account.placeholder}
                  aria-invalid={!!issueFor("accountNumber")}
                  className={cn(
                    "tabular",
                    issueFor("accountNumber") &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                />
              </Field>
            </div>
          </div>
        </FormSection>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button variant="outline" asChild>
          <Link href="/sales/client-refunds">Cancel</Link>
        </Button>
        {/* Disabled until valid; the hint says what's still outstanding. */}
        {issues.length > 0 && (
          <p className="self-center text-xs text-muted-foreground">
            {issues.length === 1
              ? issues[0].message
              : `${issues.length} fields need attention`}
          </p>
        )}
        <Button onClick={onSave} disabled={issues.length > 0 || saving}>
          {saving
            ? "Saving…"
            : editing
              ? "Save changes"
              : "Issue refund"}
        </Button>
      </div>
    </div>
  );
}
