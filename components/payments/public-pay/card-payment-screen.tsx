"use client";

/**
 * SolePay card payment -- the public, anonymous "pay this invoice" screen a
 * client lands on from the pay link in their invoice email.
 *
 * Tokenization follows spm's own working pattern exactly (same gateway, same
 * approach -- see `apps/biz-client/.../worldpay/card/page.tsx`): Worldpay's
 * IntegraPay widget (`public/js/worldpay-tokenize.js`, loaded by the layout
 * above this page) finds the `data-integrapay="..."` fields by querying the
 * real DOM, tokenizes the card directly against Worldpay/IntegraPay's hosted
 * tokenize-card endpoint, and writes the resulting token into the hidden
 * `CardToken` input -- which is why those fields are plain native
 * `<input>`/`<select>` elements rather than the app's own styled form
 * components: the script's jQuery selectors need the literal tag.
 *
 * Unlike spm's screens, nothing here reads the invoice id or amount from the
 * query string -- both come back from the signed session token
 * (`fetchInvoicePaymentSession`), so a client can't edit the amount by
 * editing the URL.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  submitCardPayment,
} from "@/lib/invoice-payment";

declare global {
  interface Window {
    IntegraPayProcessPayment?: () => void;
  }
}

const EXPIRY_MONTHS = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);
const EXPIRY_YEARS = Array.from({ length: 10 }, (_, i) =>
  String(new Date().getFullYear() + i),
);

export function CardPaymentScreen({ token }: { token: string }) {
  const sessionQuery = useQuery({
    queryKey: ["invoice-payment-session", "card", token],
    queryFn: () => fetchInvoicePaymentSession(token),
    enabled: Boolean(token),
    retry: false,
  });

  const [cardName, setCardName] = React.useState("");
  const [cardNumber, setCardNumber] = React.useState("");
  const [paid, setPaid] = React.useState(false);
  const [isLocked, setIsLocked] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  const paymentLock = React.useRef(false);
  const apiCallLock = React.useRef(false);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const session = sessionQuery.data;

  const handleSubmit = React.useCallback(
    async (button: HTMLButtonElement) => {
      if (paymentLock.current || apiCallLock.current || button.disabled || !session) {
        return;
      }

      paymentLock.current = true;
      setIsLocked(true);
      button.disabled = true;

      const tokenInput = document.querySelector(
        '[data-integrapay="CardToken"]',
      ) as HTMLInputElement | null;
      const cardNumberInput = document.querySelector(
        '[data-integrapay="CardNumber"]',
      ) as HTMLInputElement | null;
      const errorsDiv = document.querySelector(
        '[data-integrapay="Errors"]',
      ) as HTMLElement | null;

      if (cardNumberInput) {
        cardNumberInput.value = cardNumberInput.value.replace(/\D/g, "");
      }
      if (tokenInput) tokenInput.value = "";
      if (errorsDiv) errorsDiv.textContent = "";

      const tokenize = window.IntegraPayProcessPayment;
      if (typeof tokenize !== "function") {
        paymentLock.current = false;
        setIsLocked(false);
        button.disabled = false;
        toast.error("Payment system isn't ready yet. Please try again.");
        return;
      }

      const observer = errorsDiv
        ? new MutationObserver(() => {
            const message = errorsDiv.textContent?.trim();
            const cardToken = tokenInput?.value;
            if (message && !(cardToken && cardToken.length > 0)) {
              observer?.disconnect();
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
              paymentLock.current = false;
              apiCallLock.current = false;
              setIsLocked(false);
              setIsProcessing(false);
              button.disabled = false;
              toast.error(message);
            }
          })
        : null;
      observer?.observe(errorsDiv as Node, {
        childList: true,
        characterData: true,
        subtree: true,
      });

      tokenize();

      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts += 1;
        const cardToken = tokenInput?.value;

        if (cardToken && cardToken.length > 0) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          observer?.disconnect();
          if (apiCallLock.current) return;
          apiCallLock.current = true;
          setIsProcessing(true);

          try {
            const userIP = await fetchClientIp();
            const outcome = await submitCardPayment({
              invoiceId: session.invoiceId,
              amount: session.amount,
              cardToken,
              userIP,
            });

            if (outcome.success) {
              setPaid(true);
            } else {
              toast.error(outcome.message);
              paymentLock.current = false;
              apiCallLock.current = false;
              setIsLocked(false);
              setIsProcessing(false);
              button.disabled = false;
            }
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Payment processing failed.",
            );
            paymentLock.current = false;
            apiCallLock.current = false;
            setIsLocked(false);
            setIsProcessing(false);
            button.disabled = false;
          }
          return;
        }

        if (attempts > 20) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          observer?.disconnect();
          paymentLock.current = false;
          apiCallLock.current = false;
          setIsLocked(false);
          setIsProcessing(false);
          button.disabled = false;
          if (errorsDiv) errorsDiv.textContent = "Payment processing timed out. Please try again.";
        }
      }, 500);
    },
    [session],
  );

  React.useEffect(() => {
    const onClick = (event: Event) => {
      const target = event.target as HTMLElement;
      const button = target.closest(
        '[data-integrapay="SubmitButton"]',
      ) as HTMLButtonElement | null;
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void handleSubmit(button);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [handleSubmit]);

  React.useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      paymentLock.current = false;
      apiCallLock.current = false;
    };
  }, []);

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
      {isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-xl bg-background px-8 py-6 shadow-xl">
            <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm font-medium">Processing your payment…</p>
            <p className="text-xs text-muted-foreground">
              Please don&apos;t refresh or close this page.
            </p>
          </div>
        </div>
      )}

      <PayPageHeader eyebrow="Secure Hosted Payment" />
      <PaymentInformationCard
        invoiceId={session.invoiceId}
        amount={session.amount}
        description="SolePay credit card payment"
      />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="space-y-6 pt-6">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <span className="h-6 w-1 rounded-full bg-primary" aria-hidden />
            Payment method
          </h2>

          <form data-integrapay="PaymentForm" className="space-y-6">
            <input
              data-integrapay="BusinessKey"
              type="hidden"
              value={session.businessKey ?? ""}
              readOnly
            />
            <input data-integrapay="CardToken" name="CardToken" type="hidden" readOnly />

            <div>
              <label className="mb-2 block text-sm font-medium">
                Name on card <span className="text-destructive">*</span>
              </label>
              <input
                data-integrapay="CardName"
                name="CardName"
                type="text"
                autoComplete="off"
                value={cardName}
                onChange={(event) => setCardName(event.target.value)}
                placeholder="Jane Smith"
                required
                className="w-full rounded-xl border px-4 py-3 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Card number <span className="text-destructive">*</span>
              </label>
              <input
                data-integrapay="CardNumber"
                name="CardNumber"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={cardNumber}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "").slice(0, 16);
                  setCardNumber(digits.replace(/(\d{4})(?=\d)/g, "$1 "));
                }}
                placeholder="1234 5678 9012 3456"
                maxLength={19}
                required
                className="w-full rounded-xl border px-4 py-3 font-mono tracking-[0.15em] outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Expiry month <span className="text-destructive">*</span>
                </label>
                <select
                  data-integrapay="CardExpiryMonth"
                  name="CardExpiryMonth"
                  defaultValue={EXPIRY_MONTHS[0]}
                  required
                  className="w-full rounded-xl border bg-background px-3 py-3 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {EXPIRY_MONTHS.map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Expiry year <span className="text-destructive">*</span>
                </label>
                <select
                  data-integrapay="CardExpiryYear"
                  name="CardExpiryYear"
                  defaultValue={EXPIRY_YEARS[0]}
                  required
                  className="w-full rounded-xl border bg-background px-3 py-3 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {EXPIRY_YEARS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  CVC <span className="text-destructive">*</span>
                </label>
                <input
                  data-integrapay="CardCcv"
                  type="text"
                  autoComplete="off"
                  placeholder="123"
                  maxLength={4}
                  required
                  className="w-full rounded-xl border px-4 py-3 font-mono outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div
              data-integrapay="Errors"
              className="min-h-[18px] px-1 text-sm text-destructive"
            />
            <div data-integrapay="Processing" className="w-px text-transparent" />

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
                data-integrapay="SubmitButton"
                type="button"
                disabled={isLocked}
                className="flex-1"
              >
                {isProcessing ? "Processing…" : `Pay $${session.amount.toFixed(2)}`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <PayPageFooter />
    </PayPageShell>
  );
}
