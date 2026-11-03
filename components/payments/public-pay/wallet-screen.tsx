"use client";

/**
 * SolePay wallet payment -- Apple Pay / Google Pay, ported from spm's own
 * `/worldpay/wallet` screen. Carried over as-is from spm, not completed
 * further here: Apple Pay there is a "coming soon" placeholder (no
 * ApplePaySession/merchant-validation flow exists anywhere in either
 * codebase), and Google Pay's `gateway`/`gatewayMerchantId` are spm's own
 * placeholder values -- neither app has a real Worldpay/IntegraPay Google Pay
 * gateway id wired up yet. Swap those two fields for the real values once
 * SolePay's Worldpay account has them, and the token this produces already
 * flows straight through to `submitWalletPayment` (the same
 * `/client-billing/pay/token` endpoint the card screen uses).
 */
import * as React from "react";
import Script from "next/script";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";

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
  submitWalletPayment,
} from "@/lib/invoice-payment";

declare global {
  interface Window {
    google?: {
      payments: {
        api: {
          PaymentsClient: new (config: { environment: string }) => GooglePaymentsClient;
        };
      };
    };
  }
}

type GooglePaymentsClient = {
  isReadyToPay: (request: unknown) => Promise<{ result: boolean }>;
  loadPaymentData: (request: unknown) => Promise<{
    paymentMethodData: { tokenizationData: { token: string } };
  }>;
};

export function WalletScreen({ token }: { token: string }) {
  const sessionQuery = useQuery({
    queryKey: ["invoice-payment-session", "wallet", token],
    queryFn: () => fetchInvoicePaymentSession(token),
    enabled: Boolean(token),
    retry: false,
  });

  const [selected, setSelected] = React.useState<"apple" | "google" | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [paid, setPaid] = React.useState(false);
  const [googlePayReady, setGooglePayReady] = React.useState(false);
  const paymentsClient = React.useRef<GooglePaymentsClient | null>(null);
  const session = sessionQuery.data;

  const initGooglePay = React.useCallback(() => {
    if (!window.google || paymentsClient.current) return;
    const client = new window.google.payments.api.PaymentsClient({
      environment: "TEST",
    });
    paymentsClient.current = client;
    client
      .isReadyToPay({
        apiVersion: 2,
        apiVersionMinor: 0,
        allowedPaymentMethods: [
          {
            type: "CARD",
            parameters: {
              allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
              allowedCardNetworks: ["AMEX", "VISA", "MASTERCARD"],
            },
          },
        ],
      })
      .then((response) => setGooglePayReady(Boolean(response.result)))
      .catch(() => setGooglePayReady(false));
  }, []);

  const handleWallet = async (wallet: "apple" | "google") => {
    if (!session) return;

    if (wallet === "apple") {
      toast.info("Apple Pay is coming soon.");
      return;
    }
    if (!paymentsClient.current) {
      toast.error("Google Pay hasn't finished loading. Please try again.");
      return;
    }

    setSelected(wallet);
    setIsProcessing(true);
    try {
      const paymentData = await paymentsClient.current.loadPaymentData({
        apiVersion: 2,
        apiVersionMinor: 0,
        allowedPaymentMethods: [
          {
            type: "CARD",
            parameters: {
              allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
              allowedCardNetworks: ["AMEX", "VISA", "MASTERCARD"],
            },
            // TODO: placeholder gateway values carried over from spm's own
            // screen -- replace once SolePay has a real Worldpay/IntegraPay
            // Google Pay gateway id.
            tokenizationSpecification: {
              type: "PAYMENT_GATEWAY",
              parameters: {
                gateway: "example",
                gatewayMerchantId: "exampleGatewayMerchantId",
              },
            },
          },
        ],
        merchantInfo: { merchantName: "SolePay" },
        transactionInfo: {
          totalPriceStatus: "FINAL",
          totalPrice: session.amount.toFixed(2),
          currencyCode: "AUD",
          countryCode: "AU",
        },
      });

      const googlePayToken = paymentData.paymentMethodData.tokenizationData.token;
      const userIP = await fetchClientIp();
      const outcome = await submitWalletPayment({
        invoiceId: session.invoiceId,
        amount: session.amount,
        userIP,
        googlePayToken,
      });

      if (outcome.success) {
        setPaid(true);
      } else {
        toast.error(outcome.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment failed.");
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
      <Script
        src="https://pay.google.com/gp/p/js/pay.js"
        strategy="afterInteractive"
        onLoad={initGooglePay}
      />

      <PayPageHeader eyebrow="Wallet Payment" />
      <PaymentInformationCard
        invoiceId={session.invoiceId}
        amount={session.amount}
        description="SolePay wallet payment"
      />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="space-y-4 pt-6">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Smartphone className="size-5 text-primary" aria-hidden />
            Choose a wallet
          </h2>

          <Button
            type="button"
            onClick={() => handleWallet("apple")}
            disabled={isProcessing}
            className="h-14 w-full justify-center bg-black text-white hover:bg-neutral-900"
          >
            {isProcessing && selected === "apple" ? "Processing…" : "Pay with Apple Pay"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => handleWallet("google")}
            disabled={isProcessing || !googlePayReady}
            className="h-14 w-full justify-center"
          >
            {isProcessing && selected === "google" ? "Processing…" : "Pay with Google Pay"}
          </Button>

          <p className="pt-2 text-xs text-muted-foreground">
            Wallet payments are securely tokenized and processed through SolePay. Apple
            Pay and Google Pay use encrypted wallet tokens instead of raw card details.
          </p>
        </CardContent>
      </Card>

      <PayPageFooter />
    </PayPageShell>
  );
}
