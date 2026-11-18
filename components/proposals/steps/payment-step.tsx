"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/documents/field";
import { StepFooter, StepHeader, ToggleCard } from "@/components/proposals/steps/step-parts";
import { fetchInvoicePaymentRails } from "@/lib/invoice-context";
import { sessionUserId, useSessionStore } from "@/stores/session";
import {
  DEFAULT_PAYMENT_METHOD,
  PAYMENT_METHODS,
  fetchStripeConnected,
  type PaymentData,
  type PreviewBusiness,
} from "@/lib/proposals";

export function PaymentStep({
  payment,
  bank,
  onChange,
  onSave,
  saving,
}: {
  payment: PaymentData;
  bank: PreviewBusiness["bank"];
  onChange: (payment: PaymentData) => void;
  onSave: () => void;
  saving: boolean;
}) {
  // Stripe is only offered once Connect onboarding is finished — but a
  // proposal that already has it saved keeps the option while this checks.
  const stripeQuery = useQuery({
    queryKey: ["stripe-connected"],
    queryFn: fetchStripeConnected,
  });
  // SolePay as the invoice editor reads it (shared cache): set up, and not "bank details only".
  const userId = useSessionStore((state) => sessionUserId(state.user));
  const railsQuery = useQuery({
    queryKey: ["invoice-payment-rails", userId],
    queryFn: () => fetchInvoicePaymentRails(userId),
  });
  const solePayReady = Boolean(railsQuery.data?.payrixConnected && railsQuery.data.paymentType !== "direct_payment");
  const checking = stripeQuery.isLoading || railsQuery.isLoading;
  const methods = PAYMENT_METHODS.filter(
    (method) =>
      payment.pay_method === method.value ||
      ((!method.requiresStripe || stripeQuery.data) && (!method.requiresSolePay || solePayReady)),
  );

  return (
    <section className="space-y-4">
      <StepHeader
        title="Payments"
        description="Choose whether payment details are required before the client accepts."
      />

      <ToggleCard
        id="payment_required"
        label="Payment required"
        description="When enabled, the client must provide payment details to accept the proposal."
        checked={payment.payment_required}
        onCheckedChange={(checked) =>
          onChange({
            payment_required: checked,
            pay_method: checked ? payment.pay_method || DEFAULT_PAYMENT_METHOD : DEFAULT_PAYMENT_METHOD,
          })
        }
      />

      {payment.payment_required && (
        <div className="space-y-3">
          <Field label="Payment method">
            <div className="space-y-1">
              <Select
                value={payment.pay_method}
                disabled={checking}
                onValueChange={(value) => onChange({ ...payment, pay_method: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {checking && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  Checking payment connections...
                </p>
              )}
            </div>
          </Field>

          {payment.pay_method === "manual" && (
            <div className="rounded-lg border border-border p-4">
              <p className="text-sm font-semibold">Payment details</p>
              <dl className="mt-2 space-y-1.5 text-sm">
                <BankRow label="Acc Name" value={bank?.account_holder} />
                <BankRow label="BSB" value={bank?.bsb} />
                <BankRow label="Acc No" value={bank?.account_number} />
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">
                This is what the client will see on the proposal. Update it from
                your business&apos;s bank account settings.
              </p>
            </div>
          )}

          {payment.pay_method === "solepay" && (
            <div className="rounded-lg border border-border p-4 text-sm">
              <p className="font-semibold">How SolePay works here</p>
              <p className="mt-1 text-muted-foreground">
                When your client accepts, an invoice for this proposal&apos;s services is created and they pay it with
                SolePay from the proposal link. The invoice appears in your Invoices list and the proposal shows as
                paid once it&apos;s paid. SolePay takes AUD only.
              </p>
            </div>
          )}
        </div>
      )}

      <StepFooter saving={saving} nextLabel="Terms & Sign" onSave={onSave} />
    </section>
  );
}

function BankRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-1">
      <dt className="font-medium">{label}:</dt>
      <dd className="text-muted-foreground">{value || "Not provided"}</dd>
    </div>
  );
}
