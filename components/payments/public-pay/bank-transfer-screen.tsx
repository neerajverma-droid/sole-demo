"use client";

/**
 * SolePay direct debit request -- the public, anonymous bank-transfer pay
 * screen. Same fields and flow as spm's own `/worldpay/bank-transfer` screen
 * (BSB + account number, entered twice, plus the Payrix DDR terms), styled
 * with sole-webapp's own components. The amount and invoice id come from the
 * signed session token, not the query string.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PayPageFooter,
  PayPageHeader,
  PayPageLoading,
  PayPageProblem,
  PayPageShell,
  PayPageSuccess,
  PaymentInformationCard,
} from "@/components/payments/public-pay/pay-page-chrome";
import {
  fetchClientIp,
  fetchInvoicePaymentSession,
  submitBankAccountPayment,
} from "@/lib/invoice-payment";

type FormState = {
  accountName: string;
  accountBranch: string;
  accountNumber: string;
  confirmAccountNumber: string;
  agreeTerms: boolean;
};

const EMPTY_FORM: FormState = {
  accountName: "",
  accountBranch: "",
  accountNumber: "",
  confirmAccountNumber: "",
  agreeTerms: false,
};

function formatBsb(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  return digits.length <= 3 ? digits : `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export function BankTransferScreen({ token }: { token: string }) {
  const sessionQuery = useQuery({
    queryKey: ["invoice-payment-session", "bank-transfer", token],
    queryFn: () => fetchInvoicePaymentSession(token),
    enabled: Boolean(token),
    retry: false,
  });

  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [error, setError] = React.useState("");
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [paid, setPaid] = React.useState(false);
  const session = sessionQuery.data;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session) return;

    if (!form.accountName.trim()) return setError("Account name is required.");
    const bsb = form.accountBranch.replace(/\D/g, "");
    if (!/^\d{6}$/.test(bsb)) return setError("BSB must be 6 digits.");
    if (!/^\d{6,10}$/.test(form.accountNumber)) {
      return setError("Account number must be 6-10 digits.");
    }
    if (form.accountNumber !== form.confirmAccountNumber) {
      return setError("Account numbers don't match.");
    }

    setError("");
    setIsProcessing(true);
    try {
      const userIP = await fetchClientIp();
      const outcome = await submitBankAccountPayment({
        invoiceId: session.invoiceId,
        amount: session.amount,
        accountName: form.accountName,
        accountBranch: bsb,
        accountNumber: form.accountNumber,
        userIP,
      });
      if (outcome.success) {
        setPaid(true);
      } else {
        toast.error(outcome.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't set up the direct debit.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!token) {
    return (
      <PayPageProblem
        title="This payment link is missing some information"
        description="Please use the Pay Now link from your invoice email."
      />
    );
  }
  if (sessionQuery.isLoading) return <PayPageLoading />;
  if (sessionQuery.isError || !session) {
    return (
      <PayPageProblem
        title="This payment link is invalid or has expired"
        description={
          sessionQuery.error instanceof Error
            ? sessionQuery.error.message
            : "Please ask the business for a fresh invoice link."
        }
      />
    );
  }
  if (paid || session.alreadyPaid) {
    return <PayPageSuccess amount={session.amount} />;
  }

  return (
    <PayPageShell>
      <PayPageHeader eyebrow="Direct Debit Request" />
      <PaymentInformationCard
        invoiceId={session.invoiceId}
        amount={session.amount}
        description="SolePay direct debit request"
      />

      <form onSubmit={handleSubmit}>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="space-y-6 pt-6">
            <div className="rounded-xl border bg-primary/5 p-5">
              <h2 className="mb-2 text-lg font-semibold">Payment terms</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                I/We authorise and request Payrix Australia Pty. Ltd. ABN 63 135 196 397 to
                debit payments from my/our account as specified below, at intervals and
                amounts as directed by the business, as per the terms and conditions of my
                agreement with the business and in accordance with this direct debit request
                and the Payrix DDR Service Agreement.
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <span className="h-6 w-1 rounded-full bg-primary" aria-hidden />
                Bank account
              </h2>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Account name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={form.accountName}
                  onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                  placeholder="Jane Smith"
                  required
                  className="w-full rounded-xl border px-4 py-3 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  BSB <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={form.accountBranch}
                  onChange={(e) =>
                    setForm({ ...form, accountBranch: formatBsb(e.target.value) })
                  }
                  placeholder="123-456"
                  maxLength={7}
                  required
                  className="w-full rounded-xl border px-4 py-3 font-mono outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Account number <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={form.accountNumber}
                  onChange={(e) =>
                    setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, "") })
                  }
                  placeholder="12345678"
                  maxLength={10}
                  required
                  className="w-full rounded-xl border px-4 py-3 font-mono outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Re-enter account number <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={form.confirmAccountNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      confirmAccountNumber: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  placeholder="12345678"
                  maxLength={10}
                  required
                  className="w-full rounded-xl border px-4 py-3 font-mono outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={form.agreeTerms}
                onCheckedChange={(checked) =>
                  setForm({ ...form, agreeTerms: checked === true })
                }
                className="mt-0.5"
              />
              <span className="text-sm">
                I agree to the terms and conditions, including that this authorises
                ongoing payments where applicable.
              </span>
            </label>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => window.history.back()}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!form.agreeTerms || isProcessing}
                className="flex-1"
              >
                {isProcessing ? "Processing…" : "Continue and confirm"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <PayPageFooter />
    </PayPageShell>
  );
}
