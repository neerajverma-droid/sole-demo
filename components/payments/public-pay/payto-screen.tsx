"use client";

/**
 * SolePay PayTo -- the public, anonymous PayTo pay screen. Same PayID
 * type/value fields and explanatory steps as spm's own `/worldpay/payto`
 * screen, but PayTo is inherently two network calls here (sole-ocr splits
 * it as `/payto/agreement` then `/payto/payment`, where spm's own backend
 * combines them into one): create the agreement, wait for the client to
 * approve it in their banking app, then submit the payment. The in-between
 * "waiting for approval" state has no equivalent in spm's screen because its
 * backend hides that wait on its own side.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  createPayToAgreement,
  fetchClientIp,
  fetchInvoicePaymentSession,
  fetchPayToAgreementStatus,
  isPayToAgreementActive,
  isPayToAgreementFailed,
  submitPayToPayment,
} from "@/lib/invoice-payment";

const PAY_ID_TYPES = [
  { value: "EMAL", label: "Email address", placeholder: "name@example.com" },
  { value: "TELI", label: "Telephone number", placeholder: "+61-417123456" },
  { value: "AUBN", label: "Australian Business Number", placeholder: "123456789" },
  { value: "BBAN", label: "Bank account number", placeholder: "062000123456" },
] as const;

const PAY_ID_PATTERNS: Record<string, RegExp> = {
  EMAL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  TELI: /^\+[0-9]{1,3}-[1-9][0-9]{1,29}$/,
  AUBN: /^(\d{9}|\d{11})$/,
  BBAN: /^\d{10,16}$/,
};

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;

type Stage = "form" | "waiting" | "submitting";

export function PayToScreen({ token }: { token: string }) {
  const sessionQuery = useQuery({
    queryKey: ["invoice-payment-session", "payto", token],
    queryFn: () => fetchInvoicePaymentSession(token),
    enabled: Boolean(token),
    retry: false,
  });

  const [payIdType, setPayIdType] = React.useState<string>("");
  const [payId, setPayId] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState("");
  const [stage, setStage] = React.useState<Stage>("form");
  const [paid, setPaid] = React.useState(false);
  const pollTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadline = React.useRef(0);
  const session = sessionQuery.data;

  const isValidPayId = () =>
    Boolean(payIdType) && Boolean(PAY_ID_PATTERNS[payIdType]?.test(payId));

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  React.useEffect(() => stopPolling, []);

  const finishWithPayment = async (agreementReference: string) => {
    if (!session) return;
    stopPolling();
    setStage("submitting");
    try {
      const userIP = await fetchClientIp();
      const outcome = await submitPayToPayment({
        invoiceId: session.invoiceId,
        amount: session.amount,
        agreementReference,
        userIP,
      });
      if (outcome.success) {
        setPaid(true);
      } else {
        toast.error(outcome.message);
        setStage("form");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PayTo payment failed.");
      setStage("form");
    }
  };

  const handleSubmit = async () => {
    setErrorMessage("");
    if (!isValidPayId()) {
      setErrorMessage("Please enter a valid PayID for the selected type.");
      return;
    }
    if (!session) return;

    setStage("waiting");
    try {
      const userIP = await fetchClientIp();
      const agreement = await createPayToAgreement({
        invoiceId: session.invoiceId,
        amount: session.amount,
        payId,
        payIdType,
        userIP,
      });

      if (isPayToAgreementActive(agreement.status)) {
        await finishWithPayment(agreement.agreementReference);
        return;
      }
      if (isPayToAgreementFailed(agreement.status)) {
        toast.error("The PayTo agreement wasn't approved.");
        setStage("form");
        return;
      }

      pollDeadline.current = Date.now() + POLL_TIMEOUT_MS;
      pollTimer.current = setInterval(async () => {
        if (Date.now() > pollDeadline.current) {
          stopPolling();
          toast.error("We didn't see an approval in time. Please try again.");
          setStage("form");
          return;
        }
        try {
          const status = await fetchPayToAgreementStatus(agreement.agreementReference);
          if (isPayToAgreementActive(status)) {
            await finishWithPayment(agreement.agreementReference);
          } else if (isPayToAgreementFailed(status)) {
            stopPolling();
            toast.error("The PayTo agreement wasn't approved.");
            setStage("form");
          }
        } catch {
          // A single failed poll isn't fatal -- keep trying until the timeout.
        }
      }, POLL_INTERVAL_MS);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't create the PayTo agreement.",
      );
      setStage("form");
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

  const placeholder =
    PAY_ID_TYPES.find((t) => t.value === payIdType)?.placeholder ?? "Enter your PayID";

  return (
    <PayPageShell>
      <PayPageHeader eyebrow="Secure Hosted Payment" />
      <PaymentInformationCard
        invoiceId={session.invoiceId}
        amount={session.amount}
        description="SolePay PayID payment"
      />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="space-y-6 pt-6">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <span className="h-6 w-1 rounded-full bg-primary" aria-hidden />
            Payment method
          </h2>

          {stage === "waiting" ? (
            <div className="space-y-3 rounded-xl border bg-primary/5 p-6 text-center">
              <div className="mx-auto size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="font-medium">Waiting for your approval</p>
              <p className="text-sm text-muted-foreground">
                Open your banking app and approve the PayTo agreement for this payment.
                This page will continue automatically once it's approved.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3 rounded-xl border bg-primary/5 p-5 text-sm text-muted-foreground">
                <p>
                  Paying by PayTo requires a PayID you've already registered with one of
                  the supporting banks.
                </p>
                <p>
                  If you continue, we'll register a PayTo agreement for this payment,
                  which you'll need to approve through your banking app.
                </p>
                <p>
                  Once approved, the payment is processed immediately and the money is
                  transferred straight away.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  PayID type <span className="text-destructive">*</span>
                </label>
                <Select
                  value={payIdType}
                  onValueChange={(value) => {
                    setPayIdType(value);
                    setPayId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select PayID type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAY_ID_TYPES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  PayID <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={payId}
                  onChange={(e) => setPayId(e.target.value)}
                  placeholder={placeholder}
                  required
                  className="w-full rounded-xl border px-4 py-3 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {errorMessage && (
                <div className="rounded-xl bg-destructive/5 p-3 text-sm text-destructive">
                  {errorMessage}
                </div>
              )}

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
                  type="button"
                  onClick={handleSubmit}
                  disabled={(stage as Stage) === "submitting"}
                  className="flex-1"
                >
                  {(stage as Stage) === "submitting"
                    ? "Processing…"
                    : `Pay $${session.amount.toFixed(2)}`}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <PayPageFooter />
    </PayPageShell>
  );
}
