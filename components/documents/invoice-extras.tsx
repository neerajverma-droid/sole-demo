"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Banknote,
  Check,
  CreditCard,
  FileText,
  HandCoins,
  Landmark,
  Loader2,
  Pencil,
  Paperclip,
  PiggyBank,
  RefreshCw,
  Upload,
  X,
  Zap,
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
import { PrefixInput } from "@/components/ui/prefix-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InfoTip } from "@/components/ui/info-tip";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { GATEWAYS, SOLE_PAY_LOGO_SRC } from "@/lib/payments";
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

/**
 * Reminders and repeating invoices. Always expanded — it used to fold behind a
 * toggle, but these are settings people go looking for, so they stay in view
 * under a plain heading.
 */
export function AdvancedOptions({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-[15px]">
      <div className="flex flex-col px-1 text-sm font-semibold text-primary-heading">
        Advanced options
        <span className="text-xs font-normal text-muted-foreground">
          Reminders and repeating invoices
        </span>
      </div>
      {children}
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
 * see. Edit opens the same country-aware dialog as the first-invoice gate,
 * which saves to the business profile: an invoice can't carry its own
 * one-off account.
 */
export function PaymentDetailsCard({
  bank,
  showOnInvoice,
  onShowOnInvoiceChange,
  onEdit,
  saving = false,
}: {
  bank: InvoiceBankDetails;
  showOnInvoice: boolean;
  onShowOnInvoiceChange: (value: boolean) => void;
  /** Opens the in-place bank details dialog, so editing never leaves the invoice. */
  onEdit: () => void;
  /** The switch is being saved: shows a spinner and blocks another toggle. */
  saving?: boolean;
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

  // With details on file the card is its header alone: the switch and an Edit
  // button. The account itself is not repeated here — Edit opens it.
  const collapsed = hasBankDetails;

  return (
    <ExtrasCard
      icon={Banknote}
      title="Show payment details in invoice"
      tip="The bank account your client pays into. It prints on the invoice. Use Edit to change it for your business."
      bare={collapsed}
      action={
        hasBankDetails ? (
          <div className="flex items-center gap-2">
            {/* Nothing to edit while the details are hidden from the invoice. */}
            {showOnInvoice && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={onEdit}
                    aria-label="Edit your bank details"
                  >
                    <Pencil />
                    Edit
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit your bank details</TooltipContent>
              </Tooltip>
            )}
            {saving && (
              <Loader2
                className="size-4 animate-spin text-muted-foreground"
                aria-hidden
              />
            )}
            <Switch
              checked={showOnInvoice}
              onCheckedChange={onShowOnInvoiceChange}
              disabled={saving}
              aria-busy={saving}
              aria-label="Show bank details on this invoice"
            />
          </div>
        ) : undefined
      }
    >
      {/* A bare card renders its children unpadded, so collapsed means none. */}
      {!collapsed && (
        <>
          <p className="text-xs text-muted-foreground">
            Add these and your clients can pay by bank transfer. They're
            required before an invoice can be raised.
          </p>

          <Button variant="outline" size="sm" asChild>
            <Link href="/settings?section=business">
              <Landmark />
              Add bank details
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
        </>
      )}
    </ExtrasCard>
  );
}

/** One icon per SolePay payment method, keyed by the method's value. */
const PAYMENT_TYPE_ICONS: Record<
  (typeof SOLEPAY_PAYMENT_TYPES)[number]["value"],
  LucideIcon
> = {
  credit_card: CreditCard,
  payto: Zap,
  bank_transfer: Landmark,
  direct_payment: HandCoins,
};

/**
 * One way to get paid, as a card in the connect dialog. The summary and key
 * features come from the gateway's own entry, so they read the same as on the
 * Payments page.
 */
function ConnectOption({
  gatewayId,
  name,
  tag,
  recommended = false,
  logo,
  onSelect,
}: {
  gatewayId: string;
  name: string;
  tag?: string;
  recommended?: boolean;
  logo: React.ReactNode;
  onSelect: () => void;
}) {
  const gateway = GATEWAYS.find((entry) => entry.id === gatewayId);

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm",
        recommended ? "border-primary/50 ring-1 ring-primary/15" : "border-border",
      )}
    >
      <div className="grid h-20 place-items-center rounded-lg bg-muted/40">
        {logo}
      </div>

      <div className="flex-1 space-y-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium">{name}</h4>
            {tag && (
              <Badge className="text-[10px] uppercase tracking-wide">
                {tag}
              </Badge>
            )}
          </div>
          {gateway && (
            <p className="text-xs text-muted-foreground">{gateway.summary}</p>
          )}
        </div>

        {gateway && (
          <ul className="space-y-1.5">
            {gateway.features.slice(0, 3).map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-2 text-xs text-foreground/80"
              >
                <Check
                  className="mt-0.5 size-3.5 shrink-0 text-primary"
                  aria-hidden
                />
                {feature}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        variant={recommended ? "default" : "outline"}
        className="w-full"
        onClick={onSelect}
      >
        Connect {name}
        <ArrowRight />
      </Button>
    </div>
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
  loading = false,
  onConnect,
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
  /** The connection lookup hasn't answered yet — holds the card rather than flashing "not connected". */
  loading?: boolean;
  /**
   * Where a connect choice goes. The editor passes its unsaved-changes guard,
   * so a half-filled invoice is asked about instead of silently dropped;
   * without it the choice just navigates.
   */
  onConnect?: (href: string) => void;
}) {
  const router = useRouter();
  const [connectOpen, setConnectOpen] = React.useState(false);
  const solePayLinks = solePayEnabled && paymentType !== "direct_payment";
  const bothOn = solePayLinks && rails.stripeConnected && stripeEnabled;
  const noneConnected = !rails.payrixConnected && !rails.stripeConnected;

  const goConnect = (href: string) => {
    setConnectOpen(false);
    if (onConnect) onConnect(href);
    else router.push(href);
  };

  if (loading) {
    return (
      <ExtrasCard
        icon={CreditCard}
        title="Payment Method"
        tip="Let clients pay online. Funds settle to your nominated account and fees may apply."
      >
        <Skeleton className="h-[72px] w-full rounded-lg" aria-hidden />
      </ExtrasCard>
    );
  }

  /*
   * Neither rail is connected, so two "Not connected" cards would only be two
   * dead ends. One roomy prompt does the job; the choice between them is made
   * in the dialog its button opens. As soon as either rail is connected the full card below
   * takes over, with its switches.
   */
  if (noneConnected) {
    return (
      <ExtrasCard
        icon={CreditCard}
        title="Payment Method"
        tip="Let clients pay online. Funds settle to your nominated account and fees may apply."
      >
        {/*
         * The border is a 1px frame with a slow highlight sweeping round it —
         * a conic gradient turning behind a solid inner panel, so only the edge
         * ever shows it. Still for anyone who prefers reduced motion.
         */}
        <div className="relative overflow-hidden rounded-lg bg-primary/20 p-px">
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-[200%] animate-[spin_7s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,hsl(var(--primary))_90deg,transparent_180deg)] motion-reduce:animate-none"
          />
          <div className="relative flex flex-col items-center gap-3 rounded-[calc(var(--radius)-1px)] bg-card px-5 py-5 text-center">
            <span
              className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"
              aria-hidden
            >
              <HandCoins className="size-5" />
            </span>

            <div className="max-w-sm space-y-1">
              <h4 className="text-sm font-semibold text-primary-heading">
                Get paid faster with online payments
              </h4>
              <p className="text-[13px] font-medium text-muted-foreground">
                Connect a payment method and Sole will match each payment to
                your invoice automatically.
              </p>
            </div>

            <Button onClick={() => setConnectOpen(true)}>
              Connect payment method
              <ArrowRight />
            </Button>
          </div>
        </div>

        <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add your payment details</DialogTitle>
              <DialogDescription>
                Choose how you want to get paid. We&apos;ll take you to Payments
                to finish connecting.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <ConnectOption
                gatewayId="sole-pay"
                name="SolePay"
                tag="Recommended"
                recommended
                logo={
                  <Image
                    src={SOLE_PAY_LOGO_SRC}
                    alt=""
                    width={203}
                    height={66}
                    unoptimized
                    aria-hidden
                    className="h-10 w-auto object-contain"
                  />
                }
                onSelect={() => goConnect("/transactions/payments")}
              />
              <ConnectOption
                gatewayId="stripe"
                name="Stripe"
                logo={
                  // No Stripe mark in the repo, so a plain wordmark in their
                  // purple stands in — swap in the official asset if one's added.
                  <span
                    className="text-[26px] font-semibold leading-none tracking-[-0.03em] text-[#635BFF]"
                    aria-hidden
                  >
                    stripe
                  </span>
                }
                onSelect={() => goConnect("/payments")}
              />
            </div>
          </DialogContent>
        </Dialog>
      </ExtrasCard>
    );
  }

  return (
    <ExtrasCard
      icon={CreditCard}
      title="Payment Method"
      tip="Let clients pay online. Funds settle to your nominated account and fees may apply."
    >
      {/* SolePay (Payrix / Worldpay) */}
      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Image
              src={SOLE_PAY_LOGO_SRC}
              alt="SolePay"
              width={203}
              height={66}
              unoptimized
              className="h-7 w-auto object-contain object-left"
            />
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
            <div className="space-y-2">
              {/* Tiles rather than a list of radios: the icon and name are
                  enough to choose by, and the selected one explains itself
                  below, so four hints don't all compete for attention. */}
              <RadioGroup
                value={paymentType}
                onValueChange={onPaymentTypeChange}
                disabled={savingPaymentType}
                aria-label="SolePay payment method"
                className={cn(
                  "grid-cols-2 gap-2 transition-opacity",
                  savingPaymentType && "opacity-60",
                )}
              >
                {SOLEPAY_PAYMENT_TYPES.map((option) => {
                  const Icon = PAYMENT_TYPE_ICONS[option.value];
                  const selected = paymentType === option.value;
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        "relative flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        selected
                          ? "border-primary bg-primary/5 text-primary-heading"
                          : "border-border hover:bg-muted/40",
                        savingPaymentType && "cursor-not-allowed",
                      )}
                    >
                      <RadioGroupItem
                        value={option.value}
                        className="absolute left-0 top-0 size-px border-0 opacity-0 shadow-none"
                      />
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4",
                          selected
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                        aria-hidden
                      >
                        <Icon />
                      </span>
                      <span className="min-w-0 flex-1 leading-tight">
                        {option.label}
                      </span>
                      {selected && (
                        <Check
                          className="size-4 shrink-0 text-primary"
                          aria-hidden
                        />
                      )}
                    </label>
                  );
                })}
              </RadioGroup>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {savingPaymentType && (
                  <Loader2
                    className="size-3 shrink-0 animate-spin"
                    aria-hidden
                  />
                )}
                {
                  SOLEPAY_PAYMENT_TYPES.find(
                    (option) => option.value === paymentType,
                  )?.hint
                }
              </p>
            </div>
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

      {/* Stripe — only once it's connected; there's nothing to choose before. */}
      {rails.stripeConnected && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Stripe</p>
              <p className="text-xs text-muted-foreground">
                Card payments through your Stripe account
              </p>
            </div>
            <Switch
              checked={stripeEnabled}
              onCheckedChange={onStripeChange}
              aria-label="Enable Stripe on this invoice"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {stripeEnabled
              ? "Clients can pay this invoice online by card using Stripe."
              : "Stripe is connected. Switch it on to enable Stripe for this invoice."}
          </p>
        </div>
      )}

      {bothOn && (
        <p className="text-xs text-muted-foreground">
          With both on, the invoice&apos;s Pay now link uses Stripe.
        </p>
      )}
    </ExtrasCard>
  );
}

/**
 * A switch row whose settings are asked for in a dialog rather than unfolded
 * under it. Turning it on opens the dialog and nothing is switched on until
 * Save — so Cancel leaves the row exactly as it was. Once on, the row shows a
 * one-line summary and Edit reopens the dialog; turning it off needs no dialog.
 */
function ToggleRowDialog({
  label,
  description,
  tip,
  enabled,
  onTurnOff,
  summary,
  title,
  dialogDescription,
  canSave,
  onOpen,
  onSave,
  children,
}: {
  label: string;
  description: string;
  tip: string;
  enabled: boolean;
  onTurnOff: () => void;
  /** What's currently set, in a line, shown while the row is on. */
  summary: string;
  title: string;
  dialogDescription: string;
  canSave: boolean;
  /** Called as the dialog opens, to start its fields from what's saved. */
  onOpen: () => void;
  onSave: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const openDialog = () => {
    onOpen();
    setOpen(true);
  };

  return (
    <>
      <ToggleRow
        label={label}
        description={description}
        tip={tip}
        checked={enabled}
        onChange={(next) => (next ? openDialog() : onTurnOff())}
      >
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p className="min-w-0 text-xs text-muted-foreground">{summary}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0"
            onClick={openDialog}
          >
            Edit
          </Button>
        </div>
      </ToggleRow>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">{children}</div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!canSave}
              onClick={() => {
                onSave();
                setOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The follow-up reminder, with the two things the schedule actually needs:
 * when it fires and what it says. The toggle alone would save a reminder with
 * no date and no message, which is why they're asked for in a dialog the moment
 * it's switched on.
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
  // What's typed in the dialog, held apart so Cancel has nothing to undo.
  const [draftDays, setDraftDays] = React.useState(days);
  const [draftNote, setDraftNote] = React.useState(note);
  const [draftNotify, setDraftNotify] = React.useState(notifyClient);

  const parsed = Number(draftDays);
  const daysIssue =
    draftDays.trim() && (!Number.isInteger(parsed) || parsed < 1)
      ? "Enter a whole number of days, 1 or more."
      : undefined;
  const fires =
    !daysIssue && parsed >= 1 && dueDate
      ? formatDateLabel(addDays(dueDate, -parsed))
      : null;

  const savedDays = Number(days);
  const summary = [
    savedDays >= 1
      ? `${savedDays} ${savedDays === 1 ? "day" : "days"} before the due date`
      : "Reminder on",
    savedDays >= 1 && dueDate
      ? `fires ${formatDateLabel(addDays(dueDate, -savedDays))}`
      : null,
    notifyClient ? "client emailed too" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ToggleRowDialog
      label="Follow up work reminder"
      description="Useful for jobs that may need a check-in later."
      tip="Be notified and/or send your client a follow up email for follow up work (e.g. if maintenance may be required)."
      enabled={enabled}
      onTurnOff={() => onEnabledChange(false)}
      summary={summary}
      title="Follow up work reminder"
      dialogDescription="Choose when to be reminded, and what about."
      canSave={draftDays.trim() !== "" && !daysIssue}
      onOpen={() => {
        setDraftDays(days);
        setDraftNote(note);
        setDraftNotify(notifyClient);
      }}
      onSave={() => {
        onDaysChange(draftDays.trim());
        onNoteChange(draftNote);
        onNotifyClientChange(draftNotify);
        onEnabledChange(true);
      }}
    >
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
          value={draftDays}
          onChange={(event) => setDraftDays(event.target.value)}
          placeholder="7"
          aria-invalid={!!daysIssue}
        />
      </Field>

      <Field label="What needs following up">
        <Textarea
          rows={2}
          value={draftNote}
          onChange={(event) => setDraftNote(event.target.value)}
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
          checked={draftNotify}
          onCheckedChange={setDraftNotify}
          aria-label="Email the client too"
        />
      </div>
    </ToggleRowDialog>
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
  // What's chosen in the dialog, held apart so Cancel has nothing to undo.
  const [draftFrequency, setDraftFrequency] = React.useState(frequency);
  const [draftStart, setDraftStart] = React.useState(startDate);
  const [draftOccurrences, setDraftOccurrences] = React.useState(occurrences);
  const [draftTagLine, setDraftTagLine] = React.useState(tagLine);
  const [draftReview, setDraftReview] = React.useState(reviewBeforeSending);

  const parsed = Number(draftOccurrences);
  const occurrencesIssue =
    draftOccurrences.trim() && (!Number.isInteger(parsed) || parsed < 1)
      ? "Enter a whole number of copies, 1 or more."
      : undefined;

  // "Once off" raises exactly one copy on the start date, so asking how many
  // times to repeat it would be a contradiction.
  const onceOff = draftFrequency === "Once off";

  const summary = [
    frequency,
    startDate
      ? `${frequency === "Once off" ? "raised" : "first copy"} ${formatDateLabel(startDate)}`
      : null,
    frequency !== "Once off" && occurrences.trim()
      ? `${occurrences.trim()} copies`
      : null,
    reviewBeforeSending ? "held for review" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ToggleRowDialog
      label="Repeating invoice"
      description="Set it once and Sole raises it again on schedule."
      tip="This invoice will repeat automatically (automatically or review prior to sending)."
      enabled={enabled}
      onTurnOff={() => onEnabledChange(false)}
      summary={summary}
      title="Repeating invoice"
      dialogDescription="Choose how often this invoice is raised again."
      canSave={!occurrencesIssue}
      onOpen={() => {
        setDraftFrequency(frequency);
        setDraftStart(startDate);
        setDraftOccurrences(occurrences);
        setDraftTagLine(tagLine);
        setDraftReview(reviewBeforeSending);
      }}
      onSave={() => {
        onFrequencyChange(draftFrequency);
        onStartDateChange(draftStart);
        onOccurrencesChange(draftFrequency === "Once off" ? "" : draftOccurrences.trim());
        onTagLineChange(draftTagLine);
        onReviewChange(draftReview);
        onEnabledChange(true);
      }}
    >
      <Field label="Frequency">
        <Select
          value={draftFrequency}
          onValueChange={(next) => setDraftFrequency(next as RepeatFrequency)}
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
          value={draftStart}
          onChange={setDraftStart}
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
            value={draftOccurrences}
            onChange={(event) => setDraftOccurrences(event.target.value)}
            placeholder="e.g. 12"
            aria-invalid={!!occurrencesIssue}
          />
        </Field>
      )}

      {/* Label — hidden for now. State and save wiring stay, so putting it back
          is just uncommenting this.
      <Field
        label="Label"
        hint="Carried onto each copy, so the series is recognisable in your list."
      >
        <Input
          value={draftTagLine}
          onChange={(event) => setDraftTagLine(event.target.value)}
          placeholder="e.g. Monthly retainer"
        />
      </Field>
      */}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">Review before sending</p>
          <p className="text-xs text-muted-foreground">
            Hold each copy as a draft instead of sending it straight out.
          </p>
        </div>
        <Switch
          checked={draftReview}
          onCheckedChange={setDraftReview}
          aria-label="Review before sending"
        />
      </div>
    </ToggleRowDialog>
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
  // A "deposit" for the whole invoice is just the invoice, so every mode stops
  // short of it: 99% at most, an amount below the total, and at least one line
  // left out. None of them can be nothing either.
  const MAX_PERCENT = 99;
  // Ticking every line is the whole invoice; one line alone can never qualify.
  const coversEveryLine =
    selectable.length > 0 && selected.length >= selectable.length;
  const itemsDepositOk =
    selected.length > 0 &&
    !coversEveryLine &&
    !(total > 0 && draftAmount >= total);
  const invalid =
    mode === "items"
      ? !itemsDepositOk
      : !value.trim() ||
        numeric <= 0 ||
        (mode === "percent" && numeric > MAX_PERCENT) ||
        (mode === "amount" && numeric >= total);
  // With a single line, picking it would be the whole invoice.
  const itemsUnavailable = selectable.length < 2;
  // One tick away from covering every line: the last box is locked.
  const lastLineLocked = selectable.length > 0 && selected.length >= selectable.length - 1;

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
            <Field
              label="Ask for"
              hint={
                itemsUnavailable
                  ? "Line items needs at least two lines on the document."
                  : undefined
              }
            >
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
                  <SelectItem value="percent">Percentage</SelectItem>
                  <SelectItem value="amount">Fixed amount</SelectItem>
                  <SelectItem
                    value="items"
                    disabled={itemsUnavailable && mode !== "items"}
                  >
                    Line items
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {mode === "items" ? (
              <Field
                label="Which lines are due upfront"
                required
                error={
                  invalid && selectable.length > 0
                    ? selected.length === 0
                      ? "Choose at least one line."
                      : "Leave at least one line out — a deposit can't cover the whole invoice."
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
                            disabled={
                              lastLineLocked && !selected.includes(entry.index)
                            }
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
                      ? `Enter a percentage above 0 and up to ${MAX_PERCENT}.`
                      : `Enter an amount below ${money(total)}.`
                    : undefined
                }
              >
                <PrefixInput
                  prefix={mode === "percent" ? "%" : currencySymbol(documentCurrency)}
                  value={value}
                  inputMode="decimal"
                  onChange={(event) => setValue(event.target.value)}
                  className="tabular"
                  aria-label={mode === "percent" ? "Percentage" : "Amount"}
                />
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
  tip,
}: {
  notes: string;
  onNotesChange: (value: string) => void;
  /** Explains the card from an info icon beside its title. */
  tip?: string;
}) {
  return (
    <ExtrasCard icon={FileText} title="Notes" tip={tip}>
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
 * Matches the per-file cap multer enforces on the invoice and quote save
 * routes (sole-ocr `upload2` in routes/invoice.js, `upload` in
 * routes/v2/quote.js). Keep them in step: a file between the two would pass
 * this check and then be rejected by the server — failing the whole save with
 * a message about the request rather than about the file.
 */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

export function AttachmentsCard({
  files,
  onChange,
  onFilesSelected,
  onRemoveFile,
  onReplaceFile,
  pickedFiles,
  disabled,
  tip,
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
  /**
   * Swaps one attachment for a newly picked file. Offering it adds a Replace
   * button to every row; the caller decides what replacing means (the listing's
   * dialog deletes the stored file, then uploads the new one).
   */
  onReplaceFile?: (file: InvoiceAttachment, replacement: File) => void;
  /**
   * Browser files the caller already holds for rows with no `url` — a file
   * the form was seeded with, say, which never passed through this card.
   * Files picked here are remembered by the card itself.
   */
  pickedFiles?: { id: string; file: File }[];
  /** Disables adding/removing while an upload or delete is in flight. */
  disabled?: boolean;
  /** Explains the card from an info icon beside its title. */
  tip?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const replaceInputRef = React.useRef<HTMLInputElement>(null);
  /** The row whose Replace button opened the file picker. */
  const replacingRef = React.useRef<InvoiceAttachment | null>(null);
  const [dragging, setDragging] = React.useState(false);
  /** Files picked in this card, by attachment id — what a not-yet-uploaded row opens. */
  const localFilesRef = React.useRef(new Map<string, File>());
  /** One object URL per previewed file, released when the card goes away. */
  const previewUrlsRef = React.useRef(new Map<string, string>());
  React.useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const localFileFor = (id: string): File | undefined =>
    localFilesRef.current.get(id) ??
    pickedFiles?.find((entry) => entry.id === id)?.file;

  /** Opens a not-yet-uploaded file in a new tab, where the browser previews PDFs and images. */
  const previewLocal = (id: string) => {
    const file = localFileFor(id);
    if (!file) return;
    let url = previewUrlsRef.current.get(id);
    if (!url) {
      url = URL.createObjectURL(file);
      previewUrlsRef.current.set(id, url);
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const accept = (incoming: FileList) => {
    const next: InvoiceAttachment[] = [];
    const accepted: { id: string; file: File }[] = [];
    let overLimit = false;
    for (const file of Array.from(incoming)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name} is over 20 MB`);
        continue;
      }
      if (files.length + next.length >= MAX_ATTACHMENTS) {
        overLimit = true;
        continue;
      }
      const id = newAttachmentId();
      next.push({ id, name: file.name, size: file.size });
      accepted.push({ id, file });
      localFilesRef.current.set(id, file);
    }
    if (overLimit) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} files`);
    }
    if (next.length) onChange([...files, ...next]);
    if (accepted.length) onFilesSelected?.(accepted);
  };

  return (
    <ExtrasCard icon={Paperclip} title="Attachments" tip={tip}>
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
          Max {MAX_ATTACHMENTS} files · 20MB each · Allowed: Images, PDF
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
                {/* A file already on the server opens from its address; one
                    picked a moment ago opens from the browser's own copy. */}
                {file.url ? (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {file.name}
                  </a>
                ) : localFileFor(file.id) ? (
                  <button
                    type="button"
                    onClick={() => previewLocal(file.id)}
                    className="block max-w-full truncate text-left text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {file.name}
                  </button>
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
              {onReplaceFile && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 px-2 text-muted-foreground"
                  disabled={disabled}
                  onClick={() => {
                    replacingRef.current = file;
                    replaceInputRef.current?.click();
                  }}
                  aria-label={`Replace ${file.name}`}
                >
                  <RefreshCw className="size-3.5" aria-hidden />
                  Replace
                </Button>
              )}
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

      {onReplaceFile && (
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            const replacement = event.target.files?.[0];
            const target = replacingRef.current;
            event.target.value = "";
            replacingRef.current = null;
            if (!replacement || !target) return;
            if (replacement.size > MAX_ATTACHMENT_BYTES) {
              toast.error(`${replacement.name} is over 20 MB`);
              return;
            }
            onReplaceFile(target, replacement);
          }}
        />
      )}
    </ExtrasCard>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
