"use client";

import * as React from "react";
import Link from "next/link";
import {
  Banknote,
  CreditCard,
  FileText,
  Landmark,
  Paperclip,
  PiggyBank,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InfoTip } from "@/components/ui/info-tip";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/documents/date-picker";
import { Field } from "@/components/documents/field";
import {
  GST_PERCENT,
  addDays,
  depositAmount,
  currencySymbol,
  formatDateLabel,
  formatDocumentMoney,
  lineTotals,
  newAttachmentId,
  parseIsoDate,
  REPEAT_FREQUENCIES,
} from "@/lib/invoices";
import type {
  InvoiceAttachment,
  InvoiceDeposit,
  InvoiceLineItem,
  RepeatFrequency,
} from "@/lib/invoices";
import {
  SOLEPAY_PAYMENT_TYPES,
  type InvoicePaymentRails,
} from "@/lib/invoice-context";
import { useCountryContext } from "@/hooks/use-country-context";
import {
  bankAccountField,
  bankBranchField,
  hasCompleteBankDetails,
} from "@/lib/country-context";
import { cn } from "@/lib/utils";

/** Label, tooltip and description left; the switch right. */
export function ToggleRow({
  label,
  description,
  tip,
  checked,
  onChange,
  children,
}: {
  label: string;
  description: string;
  tip?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Options revealed while the toggle is on. */
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl bg-muted/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium">{label}</p>
            {tip && <InfoTip text={tip} />}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          aria-label={label}
        />
      </div>
      {checked && children}
    </div>
  );
}

/** A titled panel for the payment and attachment cards. */
function ExtrasCard({
  icon,
  title,
  tip,
  action,
  bare,
  children,
}: {
  icon: LucideIcon;
  title: string;
  tip?: string;
  bare?: boolean;
  /** A control the section owns, shown beside the tip. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <FormSection
      icon={icon}
      title={
        tip ? (
          <>
            {title}
            <InfoTip text={tip} />
          </>
        ) : (
          title
        )
      }
      action={action}
      className="space-y-3"
      bare={bare}
    >
      {children}
    </FormSection>
  );
}

export type InvoiceBankDetails = {
  accountName: string;
  bsb: string;
  accountNumber: string;
};

/**
 * The bank details that print on the invoice.
 *
 * These come from the business profile on the server — the same record the
 * PDF renderer reads — so what's shown here is what the client will actually
 * see. Editing them is therefore a trip to Business details rather than a
 * dialog here: an invoice can't carry its own one-off account.
 */
export function PaymentDetailsCard({
  bank,
  showOnInvoice,
  onShowOnInvoiceChange,
}: {
  bank: InvoiceBankDetails;
  showOnInvoice: boolean;
  onShowOnInvoiceChange: (value: boolean) => void;
}) {
  const { country } = useCountryContext();
  /*
   * The branch row is the country's: a BSB in Australia, a branch code in
   * South Africa, and nothing at all in New Zealand, whose account number
   * carries the bank and branch inside it. A hardcoded "BSB" row there would
   * print a label for a number the business was never asked for.
   */
  const branch = bankBranchField(country);
  const account = bankAccountField(country);

  const rows = [
    { label: "Acc name", value: bank.accountName.trim() },
    ...(branch ? [{ label: branch.label, value: bank.bsb.trim() }] : []),
    { label: account?.label ?? "Acc no", value: bank.accountNumber.trim() },
  ];
  // Keyed on the fields this country actually asks for — requiring a BSB in
  // New Zealand would leave a fully-filled account reading "Add".
  const hasBankDetails = hasCompleteBankDetails(country, {
    account_number: bank.accountNumber,
    ...(branch ? { [branch.key]: bank.bsb } : {}),
  });

  return (
    <ExtrasCard
      icon={Banknote}
      title="Payment Details"
      action={
        hasBankDetails ? (
          <Switch
            checked={showOnInvoice}
            onCheckedChange={onShowOnInvoiceChange}
            aria-label="Show bank details on this invoice"
          />
        ) : undefined
      }
    >
      <p className="text-xs text-muted-foreground">
        {hasBankDetails
          ? showOnInvoice
            ? "Your client needs these to pay by bank transfer, so they print on the invoice."
            : "Hidden on this invoice — the client will need another way to pay."
          : "Add these and your clients can pay by bank transfer. They're required before an invoice can be raised."}
      </p>

      <Button variant="outline" size="sm" asChild>
        <Link href="/settings?section=business">
          <Landmark />
          {hasBankDetails ? "Edit bank details" : "Add bank details"}
        </Link>
      </Button>

      <dl className="space-y-1.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="text-xs text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                "text-sm tabular",
                row.value ? "font-medium" : "text-muted-foreground",
              )}
            >
              {row.value || "Not provided"}
            </dd>
          </div>
        ))}
      </dl>
    </ExtrasCard>
  );
}

/**
 * Online payment on this invoice — SolePay (Payrix/Worldpay) and Stripe, the
 * two rails sole-webapp's invoice editor offers, each with its own switch.
 *
 * A rail's switch only appears once that rail is actually connected. Offering
 * it to an account that never finished onboarding would put a pay link on the
 * invoice that takes the client to a dead end — so an unconnected rail gets
 * the path to connect it instead.
 *
 * SolePay's payment method is an account-wide setting (it decides where the
 * pay link routes), saved as it's changed, exactly as the old editor does.
 * Worldpay stays plain text — we have no licensed asset for the mark.
 */
export function PaymentMethodCard({
  rails,
  stripeEnabled,
  onStripeChange,
  solePayEnabled,
  onSolePayChange,
  paymentType,
  onPaymentTypeChange,
  savingPaymentType = false,
}: {
  rails: InvoicePaymentRails;
  stripeEnabled: boolean;
  onStripeChange: (value: boolean) => void;
  /** SolePay as this invoice resolves it (its own switch, else the account's). */
  solePayEnabled: boolean;
  onSolePayChange: (value: boolean) => void;
  paymentType: string;
  onPaymentTypeChange: (value: string) => void;
  savingPaymentType?: boolean;
}) {
  const solePayLinks = solePayEnabled && paymentType !== "direct_payment";
  const bothOn = solePayLinks && rails.stripeConnected && stripeEnabled;

  return (
    <ExtrasCard
      icon={CreditCard}
      title="Payment Method"
      tip="Let clients pay online. Funds settle to your nominated account and fees may apply."
    >
      {/* SolePay (Payrix / Worldpay) */}
      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">SolePay</p>
            <p className="text-xs text-muted-foreground">
              Card, PayTo and bank transfer via Worldpay
            </p>
          </div>
          {rails.payrixConnected ? (
            <Switch
              checked={solePayEnabled}
              onCheckedChange={onSolePayChange}
              aria-label="Automate payments with SolePay on this invoice"
            />
          ) : (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              Not connected
            </Badge>
          )}
        </div>

        {rails.payrixConnected ? (
          solePayEnabled ? (
            <RadioGroup
              value={paymentType}
              onValueChange={onPaymentTypeChange}
              disabled={savingPaymentType}
              aria-label="SolePay payment method"
              className="gap-1.5"
            >
              {SOLEPAY_PAYMENT_TYPES.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-2 text-sm"
                >
                  <RadioGroupItem value={option.value} className="mt-0.5" />
                  <span>
                    {option.label}
                    <span className="block text-xs text-muted-foreground">
                      {option.hint}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          ) : (
            <p className="text-xs text-muted-foreground">
              Switch this on to automate payments on this invoice through
              SolePay.
            </p>
          )
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href="/payments/solepay/onboarding">
              <CreditCard />
              Accept card payment via SolePay
            </Link>
          </Button>
        )}
      </div>

      {/* Stripe */}
      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Stripe</p>
            <p className="text-xs text-muted-foreground">
              Card payments through your Stripe account
            </p>
          </div>
          {rails.stripeConnected ? (
            <Switch
              checked={stripeEnabled}
              onCheckedChange={onStripeChange}
              aria-label="Enable Stripe on this invoice"
            />
          ) : (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              Not connected
            </Badge>
          )}
        </div>
        {rails.stripeConnected ? (
          <p className="text-xs text-muted-foreground">
            {stripeEnabled
              ? "Clients can pay this invoice online by card using Stripe."
              : "Stripe is connected. Switch it on to enable Stripe for this invoice."}
          </p>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href="/payments">
              <CreditCard />
              Connect Stripe
            </Link>
          </Button>
        )}
      </div>

      {bothOn && (
        <p className="text-xs text-muted-foreground">
          With both on, the invoice&apos;s Pay now link uses Stripe.
        </p>
      )}
    </ExtrasCard>
  );
}

/**
 * The follow-up reminder, with the two things the schedule actually needs:
 * when it fires and what it says. The toggle alone would save a reminder with
 * no date and no message, which is why these live inside it rather than being
 * inferred.
 */
export function FollowUpReminderRow({
  enabled,
  onEnabledChange,
  days,
  onDaysChange,
  note,
  onNoteChange,
  notifyClient,
  onNotifyClientChange,
  /** The reminder fires this many days *before* here, so it's shown for context. */
  dueDate,
}: {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  days: string;
  onDaysChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  notifyClient: boolean;
  onNotifyClientChange: (value: boolean) => void;
  dueDate: string;
}) {
  const parsed = Number(days);
  const daysIssue =
    days.trim() && (!Number.isInteger(parsed) || parsed < 1)
      ? "Enter a whole number of days, 1 or more."
      : undefined;

  const fires =
    !daysIssue && parsed >= 1 && dueDate
      ? formatDateLabel(addDays(dueDate, -parsed))
      : null;

  return (
    <ToggleRow
      label="Follow up work reminder"
      description="Useful for jobs that may need a check-in later."
      tip="Be notified and/or send your client a follow up email for follow up work (e.g. if maintenance may be required)."
      checked={enabled}
      onChange={onEnabledChange}
    >
      <div className="space-y-3 border-t border-border pt-3">
        <Field
          label="Days before due date"
          required
          error={daysIssue}
          hint={fires ? `Fires on ${fires}.` : undefined}
        >
          <Input
            className={cn(
              "tabular",
              daysIssue && "border-destructive focus-visible:ring-destructive",
            )}
            inputMode="numeric"
            value={days}
            onChange={(event) => onDaysChange(event.target.value)}
            placeholder="7"
            aria-invalid={!!daysIssue}
          />
        </Field>

        <Field label="What needs following up">
          <Textarea
            rows={2}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="e.g. Check whether the filter needs replacing"
          />
        </Field>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium">Email the client too</p>
            <p className="text-xs text-muted-foreground">
              Off means only you are reminded.
            </p>
          </div>
          <Switch
            checked={notifyClient}
            onCheckedChange={onNotifyClientChange}
            aria-label="Email the client too"
          />
        </div>
      </div>
    </ToggleRow>
  );
}

export function RepeatingInvoiceRow({
  enabled,
  onEnabledChange,
  frequency,
  onFrequencyChange,
  reviewBeforeSending,
  onReviewChange,
  startDate,
  onStartDateChange,
  occurrences,
  onOccurrencesChange,
  tagLine,
  onTagLineChange,
}: {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  frequency: RepeatFrequency;
  onFrequencyChange: (value: RepeatFrequency) => void;
  reviewBeforeSending: boolean;
  onReviewChange: (value: boolean) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  occurrences: string;
  onOccurrencesChange: (value: string) => void;
  tagLine: string;
  onTagLineChange: (value: string) => void;
}) {
  const parsed = Number(occurrences);
  const occurrencesIssue =
    occurrences.trim() && (!Number.isInteger(parsed) || parsed < 1)
      ? "Enter a whole number of copies, 1 or more."
      : undefined;

  // "Once off" raises exactly one copy on the start date, so asking how many
  // times to repeat it would be a contradiction.
  const onceOff = frequency === "Once off";

  return (
    <ToggleRow
      label="Repeating invoice"
      description="Set it once and Sole raises it again on schedule."
      tip="This invoice will repeat automatically (automatically or review prior to sending)."
      checked={enabled}
      onChange={onEnabledChange}
    >
      <div className="space-y-3 border-t border-border pt-3">
        <Field label="Frequency">
          <Select
            value={frequency}
            onValueChange={(next) => onFrequencyChange(next as RepeatFrequency)}
          >
            {/* No bg override: the control takes the shared surface, so it
                matches the fields around it on whatever it's sitting on. */}
            <SelectTrigger aria-label="Repeat frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPEAT_FREQUENCIES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label={onceOff ? "Raise it on" : "First copy on"}
          hint="The invoice you're writing now goes out today either way."
        >
          <DatePicker
            label={onceOff ? "Raise it on" : "First copy on"}
            value={startDate}
            onChange={onStartDateChange}
          />
        </Field>

        {!onceOff && (
          <Field
            label="Number of copies"
            error={occurrencesIssue}
            hint="Leave blank to keep repeating until you stop it."
          >
            <Input
              className={cn(
                "tabular",
                occurrencesIssue &&
                  "border-destructive focus-visible:ring-destructive",
              )}
              inputMode="numeric"
              value={occurrences}
              onChange={(event) => onOccurrencesChange(event.target.value)}
              placeholder="e.g. 12"
              aria-invalid={!!occurrencesIssue}
            />
          </Field>
        )}

        <Field
          label="Label"
          hint="Carried onto each copy, so the series is recognisable in your list."
        >
          <Input
            value={tagLine}
            onChange={(event) => onTagLineChange(event.target.value)}
            placeholder="e.g. Monthly retainer"
          />
        </Field>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium">Review before sending</p>
            <p className="text-xs text-muted-foreground">
              Hold each copy as a draft instead of sending it straight out.
            </p>
          </div>
          <Switch
            checked={reviewBeforeSending}
            onCheckedChange={onReviewChange}
            aria-label="Review before sending"
          />
        </div>
      </div>
    </ToggleRow>
  );
}

export function DepositCard({
  deposit,
  onChange,
  total,
  items,
  gstPercent = GST_PERCENT,
  issued,
  currency,
}: {
  deposit: InvoiceDeposit | null;
  onChange: (deposit: InvoiceDeposit | null) => void;
  total: number;
  /** Needed for the "chosen line items" mode, which sums them. */
  items: InvoiceLineItem[];
  gstPercent?: number;
  /** The invoice date — a deposit can't fall due before the invoice exists. */
  issued: string;
  /** The currency the document is written in; defaults to the business's own. */
  currency?: string;
}) {
  const { country } = useCountryContext();
  const documentCurrency = currency ?? country.currency;
  const money = (value: number) => formatDocumentMoney(value, documentCurrency);
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<InvoiceDeposit["mode"]>("percent");
  const [value, setValue] = React.useState("25");
  const [selected, setSelected] = React.useState<number[]>([]);
  const [dueDate, setDueDate] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    if (!deposit) {
      setMode("percent");
      setValue("25");
      setSelected([]);
      // Three days out, the same head start the reference product gives it.
      setDueDate(addDays(issued, 3));
      return;
    }
    setMode(deposit.mode);
    setValue(deposit.value);
    setSelected(deposit.selectedItems ?? []);
    setDueDate(deposit.dueDate || addDays(issued, 3));
  }, [open, deposit, issued]);

  /** Only lines with something on them can be picked for a deposit. */
  const selectable = items
    .map((item, index) => ({
      index,
      description: item.description.trim(),
      amount: lineTotals(item, gstPercent).amount,
    }))
    .filter((entry) => entry.description || entry.amount > 0);

  const draft: InvoiceDeposit = {
    mode,
    value,
    selectedItems: selected,
    dueDate,
  };
  const draftAmount = depositAmount(draft, total, items, gstPercent) ?? 0;

  const numeric = Number(value) || 0;
  const invalid =
    mode === "items"
      ? selected.length === 0
      : !value.trim() ||
        numeric <= 0 ||
        (mode === "percent" && numeric > 100) ||
        // A "deposit" for the whole invoice is just the invoice.
        (mode === "amount" && numeric >= total);

  const requested = depositAmount(deposit, total, items, gstPercent);

  return (
    <ExtrasCard
      icon={PiggyBank}
      title="Request a deposit"
      bare={!deposit}
      tip="Ask for part of the invoice upfront and collect the balance later."
      action={
        <Switch
          checked={!!deposit}
          onCheckedChange={(checked) => {
            if (checked) setOpen(true);
            else onChange(null);
          }}
          aria-label="Request a deposit"
        />
      }
    >

      {deposit && requested !== null ? (
        <dl className="space-y-1.5 rounded-lg bg-muted/40 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-muted-foreground">Deposit</dt>
            <dd className="text-sm font-medium tabular">
              {money(requested)}
              {deposit.mode === "percent" && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({deposit.value}%)
                </span>
              )}
              {deposit.mode === "items" && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({deposit.selectedItems?.length ?? 0} lines)
                </span>
              )}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-muted-foreground">Balance</dt>
            <dd className="text-sm tabular">
              {money(Math.max(0, total - requested))}
            </dd>
          </div>
          {deposit.dueDate && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">Deposit due</dt>
              <dd className="text-sm tabular">
                {formatDateLabel(deposit.dueDate)}
              </dd>
            </div>
          )}
        </dl>
      ) : null}

      {deposit && (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Edit deposit
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request a deposit</DialogTitle>
            <DialogDescription>
              Collect part upfront; the balance stays on the invoice.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Ask for">
              <Select
                value={mode}
                onValueChange={(next) =>
                  setMode(next as InvoiceDeposit["mode"])
                }
              >
                <SelectTrigger aria-label="Deposit type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">A percentage</SelectItem>
                  <SelectItem value="amount">A fixed amount</SelectItem>
                  <SelectItem value="items">Chosen line items</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {mode === "items" ? (
              <Field
                label="Which lines are due upfront"
                required
                error={
                  invalid && selectable.length > 0
                    ? "Choose at least one line."
                    : undefined
                }
              >
                {selectable.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Add a line item first — there&apos;s nothing to choose yet.
                  </p>
                ) : (
                  <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                    {selectable.map((entry) => (
                      <li key={entry.index}>
                        <label className="flex cursor-pointer items-center gap-2.5 rounded-md p-2 transition-colors hover:bg-accent">
                          <Checkbox
                            checked={selected.includes(entry.index)}
                            onCheckedChange={(checked) =>
                              setSelected((current) =>
                                checked
                                  ? [...current, entry.index]
                                  : current.filter(
                                      (index) => index !== entry.index,
                                    ),
                              )
                            }
                            aria-label={
                              entry.description || `Line ${entry.index + 1}`
                            }
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {entry.description || `Line ${entry.index + 1}`}
                          </span>
                          <span className="shrink-0 text-sm tabular text-muted-foreground">
                            {money(entry.amount)}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </Field>
            ) : (
              <Field
                label={mode === "percent" ? "Percentage" : "Amount"}
                required
                error={
                  invalid && value.trim()
                    ? mode === "percent"
                      ? "Enter a percentage between 1 and 100."
                      : `Enter an amount below ${money(total)}.`
                    : undefined
                }
              >
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {mode === "percent" ? "%" : currencySymbol(documentCurrency)}
                  </span>
                  <Input
                    value={value}
                    inputMode="decimal"
                    onChange={(event) => setValue(event.target.value)}
                    className="pl-7 tabular"
                    aria-label={mode === "percent" ? "Percentage" : "Amount"}
                  />
                </div>
              </Field>
            )}

            <Field
              label="Deposit due"
              hint="When the upfront part is payable — usually sooner than the invoice."
            >
              <DatePicker
                label="Deposit due"
                value={dueDate}
                onChange={setDueDate}
                fromDate={parseIsoDate(issued)}
              />
            </Field>

            {!invalid && (
              <p className="text-xs text-muted-foreground">
                Asking for {money(draftAmount)} now,{" "}
                {money(Math.max(0, total - draftAmount))} on completion.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={invalid}
              onClick={() => {
                onChange({
                  mode,
                  value,
                  selectedItems: mode === "items" ? selected : undefined,
                  dueDate: dueDate || undefined,
                });
                setOpen(false);
                toast.success("Deposit requested");
              }}
            >
              Request deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ExtrasCard>
  );
}

/**
 * What prints under the totals.
 *
 * One field: whatever the client should read on this document. It starts out
 * filled with the business's standing note from Branding, exactly as
 * sole-webapp seeds a new invoice's note from the same saved default — but
 * once it's open, it's a document field like any other, not a separate
 * "extra" tacked on beside it.
 */
export function InvoiceNotesCard({
  notes,
  onNotesChange,
}: {
  notes: string;
  onNotesChange: (value: string) => void;
}) {
  return (
    <ExtrasCard icon={FileText} title="Notes">
      <Field label="Invoice notes">
        <Textarea
          rows={4}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Enter your invoice note here…"
        />
      </Field>
    </ExtrasCard>
  );
}

/**
 * Matches the 10 MB per-file cap multer enforces on the invoice and quote
 * routes. It was 20 MB, so a file between the two passed this check and was
 * then rejected by the server — failing the whole save with a message about
 * the request rather than about the file.
 */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function AttachmentsCard({
  files,
  onChange,
  onFilesSelected,
  onRemoveFile,
  disabled,
}: {
  files: InvoiceAttachment[];
  onChange: (files: InvoiceAttachment[]) => void;
  /**
   * The raw browser files behind a selection, each paired with the attachment
   * id it was listed under — for a caller that needs to actually upload them
   * somewhere rather than only track their names locally. The id is what lets
   * a later removal find the right file when two share a name.
   */
  onFilesSelected?: (files: { id: string; file: File }[]) => void;
  /** Fired instead of `onChange` doing the filtering, for a caller that needs to delete the file server-side too. */
  onRemoveFile?: (file: InvoiceAttachment) => void;
  /** Disables adding/removing while an upload or delete is in flight. */
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const accept = (incoming: FileList) => {
    const next: InvoiceAttachment[] = [];
    const accepted: { id: string; file: File }[] = [];
    for (const file of Array.from(incoming)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name} is over 10 MB`);
        continue;
      }
      const id = newAttachmentId();
      next.push({ id, name: file.name, size: file.size });
      accepted.push({ id, file });
    }
    if (next.length) onChange([...files, ...next]);
    if (accepted.length) onFilesSelected?.(accepted);
  };

  return (
    <ExtrasCard icon={Paperclip} title="Attachments">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (disabled) return;
          if (event.dataTransfer.files?.length)
            accept(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
          disabled && "pointer-events-none opacity-60",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/30 hover:border-primary/40",
        )}
      >
        <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
          <Upload className="size-4" aria-hidden />
        </span>
        <p className="text-sm text-muted-foreground">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            Browse
          </Button>{" "}
          or drag &amp; drop files
        </p>
        <p className="text-xs text-muted-foreground">
          Max size: 20MB · Allowed: Images, PDF
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,application/pdf"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            if (event.target.files?.length) accept(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 rounded-md border border-border p-2.5"
            >
              <FileText
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                {/* A file already on the server can be opened; one picked a
                    moment ago has no address yet. */}
                {file.url ? (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {file.name}
                  </a>
                ) : (
                  <p className="truncate text-sm font-medium">{file.name}</p>
                )}
                {/* The record keeps no byte count, so a stored file says
                    nothing rather than claiming to be 0 B. */}
                {file.size > 0 && (
                  <p className="text-xs text-muted-foreground tabular">
                    {formatBytes(file.size)}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={disabled}
                onClick={() =>
                  onRemoveFile
                    ? onRemoveFile(file)
                    : onChange(files.filter((entry) => entry.id !== file.id))
                }
                aria-label={`Remove ${file.name}`}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </ExtrasCard>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
