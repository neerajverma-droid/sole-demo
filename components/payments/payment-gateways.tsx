"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Link2,
  Loader2,
  PlusCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  connectedGatewaysAtom,
  disconnectGatewayAtom,
  worldpayConnectedAtom,
  stripeConnectedAtom,
} from "@/lib/atoms";
import {
  EMPTY_NEXXTAP_META,
  fetchNexxtapStatus,
  nexxtapCardState,
  statusLabel,
} from "@/lib/nexxtap";
import {
  GATEWAYS,
  NEXTTAP_ONBOARDING_HREF,
  SOLE_PAY_LINK_HREF,
  SOLE_PAY_ONBOARDING_HREF,
  type Gateway,
  type GatewayStatus,
  type LoadStatus,
} from "@/lib/payments";
import api from "@/utils/axiosInstance";
import { getUserIdFromToken } from "@/utils/authSession";
import apiRoutes from "@/config/api-routes";
import { cn } from "@/lib/utils";

/** Every action on these cards, so the row of them shares one radius. */
const CARD_ACTION = "w-full rounded-[9px]";

/* ------------------------------------------------------------------ *
 * Status badge (unchanged)
 * ------------------------------------------------------------------ */

function StatusBadge({
  status,
  pendingLabel = "Pending review",
  pendingSent = false,
}: {
  status: GatewayStatus;
  /** For a gateway that reports which stage of review it's at ("Submitted", "Under review"). */
  pendingLabel?: string;
  /**
   * The application has gone in and there's nothing left for the user to do —
   * green with a tick, as a finished step, rather than amber "waiting".
   */
  pendingSent?: boolean;
}) {
  if (status === "connected") {
    return (
      <Badge variant="success" className="gap-1">
        <Check className="size-3" aria-hidden />
        Connected
      </Badge>
    );
  }
  if (status === "onboarding") {
    return (
      <Badge variant="warning" className="gap-1">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Onboarding
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant={pendingSent ? "success" : "warning"} className="gap-1">
        {pendingSent ? (
          <Check className="size-3" aria-hidden />
        ) : (
          <Clock className="size-3" aria-hidden />
        )}
        {pendingLabel}
      </Badge>
    );
  }
  if (status === "coming-soon") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="size-3" aria-hidden />
        Coming soon
      </Badge>
    );
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Onboarding progress bar — shared between Stripe and SolePay
 * ------------------------------------------------------------------ */

function ProgressBar({
  progress,
  label,
  color = "primary",
}: {
  progress: number;
  label: string;
  color?: "primary" | "success" | "warning";
}) {
  const barColor =
    color === "success"
      ? "bg-success"
      : color === "warning"
        ? "bg-warning"
        : "bg-primary";

  return (
    <div className="space-y-1.5 border-t border-border pt-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span
          className={cn(
            "font-semibold tabular",
            color === "success"
              ? "text-success"
              : color === "warning"
                ? "text-warning"
                : "text-primary",
          )}
        >
          {progress}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            barColor,
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * PaymentGateways shell (unchanged API — still takes LoadStatus)
 * ------------------------------------------------------------------ */

/** The promo banner's own headline — kept separate from `gateway.summary`,
 * which is the shorter line shown on the card itself. */
const SOLE_PAY_PROMO_HEADLINE =
  "Get Paid Faster with SolePay's fully integrated payments";

/** The promo banner's longer feature list (distinct from `gateway.features`,
 * which is the shorter list shown on the card itself). */
const SOLE_PAY_PROMO_FEATURES = [
  "Accept payments through a complete suite of payment methods including Cards, Direct Debit, Apple Pay, Google Pay and PayTo.",
  "Send one-off or recurring invoices.",
  "Access real-time payment insights and reporting.",
  "PCI DSS Level 1 compliant, helping keep your business and customer data secure.",
];

export function PaymentGateways({ status }: { status: LoadStatus }) {
  if (status === "loading") {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GATEWAYS.map((gateway) => (
          <Card key={gateway.id}>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const solePayGateway = GATEWAYS.find((gateway) => gateway.id === "sole-pay");
  const otherGateways = GATEWAYS.filter((gateway) => gateway.id !== "sole-pay");

  return (
    <div className="space-y-6" data-tour="payment-gateways">
      {/* Elevated SolePay section — the preferred, fully integrated payments
          solution gets its own top billing rather than sharing equal weight
          with the other gateways below. */}
      {solePayGateway ? (
        <div className="rounded-2xl border-2 border-primary bg-gradient-to-br from-primary/[0.06] to-card p-5 md:p-8">
          <div className="grid gap-8 md:grid-cols-[1fr_380px] md:items-center">
            <div>
              <Badge className="mb-3 uppercase tracking-wide">
                Recommended
              </Badge>
              <h3 className="text-xl font-bold leading-snug md:text-2xl">
                {SOLE_PAY_PROMO_HEADLINE}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {SOLE_PAY_PROMO_FEATURES.map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2.5 text-sm text-muted-foreground md:text-[0.95rem]"
                  >
                    <CheckCircle2
                      className="mt-0.5 size-[17px] shrink-0 text-primary"
                      aria-hidden
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mx-auto w-full max-w-[380px] md:mx-0">
              <SolePayGatewayCard gateway={solePayGateway} />
            </div>
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Other payment gateways
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {otherGateways.map((gateway) =>
            gateway.id === "stripe" ? (
              <StripeGatewayCard key={gateway.id} gateway={gateway} />
            ) : gateway.id === "nexttap" ? (
              <NexxtapGatewayCard key={gateway.id} gateway={gateway} />
            ) : (
              <GenericGatewayCard key={gateway.id} gateway={gateway} />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Stripe gateway card — fetches real account status from API
 * ------------------------------------------------------------------ */

export type StripeAccount = {
  stripe_account_id?: string | null;
  onboarding_complete?: boolean;
  details_submitted?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
};

export function calcStripeProgress(account: StripeAccount | null): number {
  if (!account?.stripe_account_id) return 0;
  if (account?.onboarding_complete) return 100;
  const done = [
    Boolean(account?.details_submitted),
    Boolean(account?.charges_enabled),
    Boolean(account?.payouts_enabled),
  ];
  return Math.round((done.filter(Boolean).length / done.length) * 100);
}

function StripeGatewayCard({ gateway }: { gateway: Gateway }) {
  const router = useRouter();
  const stripeConnected = useAtomValue(stripeConnectedAtom);

  const [account, setAccount] = React.useState<StripeAccount | null>(null);
  const [accountLoading, setAccountLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  // Fetch real Stripe account status from API
  React.useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await api.get<{
          success?: boolean;
          data?: { account?: StripeAccount };
        }>(apiRoutes.stripeConnect.account);
        if (res.data?.success) {
          setAccount(res.data?.data?.account ?? null);
        }
      } catch {
        // silently fall through — card degrades to "not started"
      } finally {
        setAccountLoading(false);
      }
    };
    void fetchStatus();
  }, []);

  const progress = calcStripeProgress(account);
  const isComplete = stripeConnected || progress === 100;
  const hasStarted = Boolean(account?.stripe_account_id);

  const status: GatewayStatus = isComplete
    ? "connected"
    : hasStarted
      ? "onboarding"
      : gateway.status;

  const progressLabel = isComplete
    ? "Onboarding complete"
    : hasStarted
      ? "Onboarding in progress"
      : "Not started";

  const features = isComplete
    ? [
        "Card payments on every invoice",
        "Visa, Mastercard, Amex and Apple Pay",
        "Payouts to your bank in two days",
      ]
    : gateway.features;

  const handleStripeAction = async () => {
    // Already onboarded — open Stripe dashboard
    if (isComplete) {
      window.open(
        "https://dashboard.stripe.com/login",
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    setSubmitting(true);
    try {
      const returnUrl = new URL(
        "/transactions/payments",
        window.location.origin,
      );
      const refreshUrl = new URL(
        "/transactions/payments",
        window.location.origin,
      );
      returnUrl.searchParams.set("stripe", "return");
      refreshUrl.searchParams.set("stripe", "refresh");

      const response = await api.post<{
        success?: boolean;
        data?: { onboarding_url?: string; account?: StripeAccount };
      }>(apiRoutes.stripeConnect.onboardingLink, {
        return_url: returnUrl.toString(),
        refresh_url: refreshUrl.toString(),
      });

      if (response.data?.success) {
        if (response.data?.data?.onboarding_url) {
          window.location.href = response.data.data.onboarding_url;
          return;
        }
        if (response.data?.data?.account) {
          setAccount(response.data.data.account);
        }
      } else {
        toast.error("Could not connect Stripe account. Please try again.");
      }
    } catch {
      toast.error("Could not connect Stripe account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const buttonLabel = submitting
    ? "Redirecting…"
    : isComplete
      ? "Manage Stripe"
      : hasStarted
        ? "Continue onboarding"
        : "Start onboarding";
  const ButtonIcon = isComplete ? ExternalLink : hasStarted ? ArrowRight : Zap;

  return (
    <Card className="flex flex-col rounded-[14px]">
      <CardContent className="flex flex-1 flex-col gap-4 pt-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <gateway.icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{gateway.name}</h3>
              <StatusBadge status={status} />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {gateway.summary}
            </p>
          </div>
        </div>

        {/* Features */}
        <ul className="space-y-1.5">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <CheckCircle2
                className={cn(
                  "mt-0.5 size-3.5 shrink-0",
                  isComplete ? "text-success" : "text-primary",
                )}
                aria-hidden
              />
              <span className="leading-snug text-muted-foreground">
                {feature}
              </span>
            </li>
          ))}
        </ul>

        {/* Progress bar — always shown once account exists */}
        <div className="mt-auto space-y-3">
          {accountLoading ? (
            <Skeleton className="h-5 w-full" />
          ) : (
            <ProgressBar
              progress={isComplete ? 100 : progress}
              label={progressLabel}
              color={isComplete ? "success" : "primary"}
            />
          )}

          <Button
            className={CARD_ACTION}
            variant={isComplete ? "outline" : "default"}
            disabled={submitting || accountLoading}
            onClick={handleStripeAction}
          >
            <ButtonIcon className="size-4" aria-hidden />
            {buttonLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * SolePay gateway card — fetches real merchant status from API
 * ------------------------------------------------------------------ */

export type SolePayMerchant = {
  merchant_status?: string;
  application_status?: string;
  merchant_id?: string;
  merchant_app_id?: string;
  is_complete?: boolean;
  action?: string;
};

/** How the card should read, given what the service says — same shape as `nexxtapCardState`. */
export type SolePayCardState = {
  status: "not-started" | "onboarding" | "pending" | "connected";
  action: string;
  completion: number;
  /** The raw Worldpay status, set once there's something to show about a submitted application. */
  statusNote?: string;
};

export function normaliseSolePayStatus(
  merchant: SolePayMerchant | null,
): SolePayCardState {
  if (!merchant) {
    return { status: "not-started", action: "Create New Account", completion: 0 };
  }

  const raw = String(
    merchant.merchant_status || merchant.application_status || "",
  ).trim();
  const lower = raw.toLowerCase();
  const approved =
    lower === "completed" ||
    lower === "complete" ||
    lower === "approved" ||
    lower === "active";

  if (approved) {
    return { status: "connected", action: "Manage application", completion: 100 };
  }

  const submitted = merchant.is_complete === true || merchant.action === "complete";

  if (submitted) {
    // Worldpay's Underwriting team asked for something — the one state where
    // there's an action to take rather than a wait.
    const needsAttention =
      lower.includes("data required") ||
      lower.includes("requir") ||
      lower.includes("action");

    if (needsAttention) {
      return {
        status: "onboarding",
        action: "Update application",
        completion: 90,
        statusNote: raw || "Data required",
      };
    }

    return {
      status: "pending",
      action: "View application",
      completion: 100,
      statusNote: raw || "Pending review",
    };
  }

  return { status: "onboarding", action: "Continue Application", completion: 30 };
}

function SolePayGatewayCard({ gateway }: { gateway: Gateway }) {
  const router = useRouter();
  const worldpayConnected = useAtomValue(worldpayConnectedAtom);

  const [merchant, setMerchant] = React.useState<SolePayMerchant | null>(null);
  const [merchantLoading, setMerchantLoading] = React.useState(true);

  const fetchMerchantStatus = async () => {
    try {
      // POST only — sole-ocr's payrixCompat.js registers no GET route for
      // this endpoint at all (`router.post('/getMerchantAccount', ...)`
      // only), so a GET here 404s every time and always falls back to
      // "not started". Same shape as `checkWorldpayConnection` in
      // `lib/payments.ts`.
      const res = await api.post<{
        success?: boolean;
        data?: SolePayMerchant;
      }>(apiRoutes.payrix.getMerchantAccount, {
        user_id: getUserIdFromToken(),
      });
      if (res.data?.success) {
        setMerchant(res.data?.data ?? null);
      }
    } catch {
      // silently fall through
    } finally {
      setMerchantLoading(false);
    }
  };

  React.useEffect(() => {
    void fetchMerchantStatus();
  }, []);

  if (merchantLoading) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  const card = normaliseSolePayStatus(merchant);

  // A real connection recorded for this session wins over what the service
  // last said — same precedence every other card on this screen uses.
  const status: GatewayStatus = worldpayConnected ? "connected" : card.status;
  const isComplete = status === "connected";
  const isPending = status === "pending";
  const isDraft = status === "onboarding";

  let features: string[];
  if (isComplete) {
    features = [
      merchant?.merchant_id || merchant?.merchant_app_id
        ? `Merchant App ID: ${merchant?.merchant_id || merchant?.merchant_app_id}`
        : "SolePay application approved",
      "Status: Active",
    ];
  } else if (!merchant) {
    features = gateway.features;
  } else if (isPending) {
    features = [
      merchant?.merchant_app_id
        ? `Application ID: ${merchant.merchant_app_id}`
        : "SolePay application submitted",
      `Status: ${card.statusNote}`,
      "Verification usually takes 48–72 hours",
    ];
  } else if (card.statusNote) {
    // Submitted, but Worldpay sent it back for more information.
    features = [
      merchant?.merchant_app_id
        ? `Application ID: ${merchant.merchant_app_id}`
        : "SolePay application submitted",
      `Status: ${card.statusNote}`,
      "Worldpay needs more information — open the application to see what's missing",
    ];
  } else {
    features = [
      "You have a saved application in progress",
      "It hasn't been submitted yet",
      "Continue to finish and submit it",
    ];
  }

  const ButtonIcon = isComplete
    ? Check
    : isPending
      ? Clock
      : isDraft
        ? ArrowRight
        : Zap;

  const progressLabel = isComplete
    ? "Onboarding complete"
    : isPending
      ? "Submitted for review"
      : isDraft && card.statusNote
        ? `Action needed — ${card.statusNote}`
        : isDraft
          ? "Onboarding in progress"
          : "Not Started";

  return (
    <Card className="flex flex-col rounded-[14px]">
      <CardContent className="flex flex-1 flex-col gap-4 pt-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          {gateway.logoSrc ? (
            <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-card">
              <Image
                src={gateway.logoSrc}
                alt=""
                width={56}
                height={56}
                unoptimized
                aria-hidden
                className="size-10 object-contain"
              />
            </span>
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <gateway.icon className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{gateway.name}</h3>
              {/* The real status Worldpay returned, not a flattened "Pending
                  review" — an application in Data Required reads as
                  "onboarding" (there's something to do), not a calming amber
                  "pending". */}
              <StatusBadge
                status={status}
                pendingLabel={card.statusNote ?? "Pending review"}
                pendingSent={isPending}
              />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {gateway.summary}
            </p>
          </div>
        </div>

        {/* Features */}
        <ul className="space-y-1.5">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <CheckCircle2
                className={cn(
                  "mt-0.5 size-3.5 shrink-0",
                  isComplete
                    ? "text-success"
                    : isDraft || isPending
                      ? "text-warning"
                      : "text-primary",
                )}
                aria-hidden
              />
              <span className="leading-snug text-muted-foreground">
                {feature}
              </span>
            </li>
          ))}
        </ul>

        {/* Progress bar */}
        <div className="mt-auto space-y-3">
          {merchantLoading ? (
            <Skeleton className="h-5 w-full" />
          ) : (
            <ProgressBar
              progress={isComplete ? 100 : card.completion}
              label={progressLabel}
              color={isComplete ? "success" : isDraft || isPending ? "warning" : "primary"}
            />
          )}

          {/* Actions */}
          {isComplete ? (
            // One account is already linked — only allow replacing it.
            // (sole-webapp: no "Link another account" when one exists)
            <Button
              className={CARD_ACTION}
              onClick={() => router.push(SOLE_PAY_LINK_HREF)}
            >
              <PlusCircle className="size-4" aria-hidden />
              Replace
            </Button>
          ) : merchant ? (
            <div className="space-y-2">
              <Button
                className={CARD_ACTION}
                onClick={() => router.push(SOLE_PAY_ONBOARDING_HREF)}
              >
                <ButtonIcon className="size-4" aria-hidden />
                {card.action}
              </Button>
              {isDraft && !card.statusNote ? (
                <Button
                  className={CARD_ACTION}
                  variant="outline"
                  onClick={() => router.push(SOLE_PAY_LINK_HREF)}
                >
                  <Link2 className="size-4" aria-hidden />
                  Link Existing Account Instead
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                className={CARD_ACTION}
                variant="outline"
                onClick={() => router.push(SOLE_PAY_LINK_HREF)}
              >
                <Link2 className="size-4" aria-hidden />
                Link Existing Account
              </Button>
              <Button
                className={CARD_ACTION}
                onClick={() => router.push(SOLE_PAY_ONBOARDING_HREF)}
              >
                <PlusCircle className="size-4" aria-hidden />
                Create New Account
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * NextTap gateway card — fetches real application status from the
 * Nexxtap service (its own query, so a service that's down degrades
 * this card alone rather than the whole screen)
 * ------------------------------------------------------------------ */

function NexxtapGatewayCard({ gateway }: { gateway: Gateway }) {
  const router = useRouter();
  const connected = useAtomValue(connectedGatewaysAtom).includes(gateway.id);

  const query = useQuery({
    queryKey: ["nexxtap-card-status"],
    queryFn: fetchNexxtapStatus,
    staleTime: 60_000,
    // An application that hasn't been started yet is the honest fallback for
    // a service that didn't answer — not an error state on the card.
    retry: false,
  });

  const meta = query.data ?? EMPTY_NEXXTAP_META;
  const card = nexxtapCardState(meta);

  // The session's connection wins over what the service last said, the same
  // way it does on every other card here.
  const status: GatewayStatus = connected ? "connected" : card.status;
  const isComplete = status === "connected";
  const isPending = status === "pending";
  const isDraft = status === "onboarding";

  const progress = isComplete || isPending ? 100 : card.completion;
  const progressLabel = isComplete
    ? "Onboarding complete"
    : isPending
      ? "Submitted for review"
      : isDraft
        ? "Onboarding in progress"
        : "Not started";
  const progressColor = isComplete
    ? "success"
    : isDraft || isPending
      ? "warning"
      : "primary";

  // Once there's an application to talk about, the card says what the service
  // says about it rather than repeating the sales pitch.
  const features =
    status === "not-started"
      ? gateway.features
      : [
          meta.applicationId
            ? `Application ID: ${meta.applicationId}`
            : "Draft application saved",
          `Status: ${statusLabel(meta.status)}`,
          isDraft
            ? `${card.completion}% of the application complete`
            : gateway.features[0],
        ];

  const ButtonIcon = isComplete
    ? Check
    : isPending
      ? Clock
      : isDraft
        ? ArrowRight
        : Zap;

  return (
    <Card className="flex flex-col rounded-[14px]">
      <CardContent className="flex flex-1 flex-col gap-4 pt-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          {gateway.logoSrc ? (
            <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-card">
              <Image
                src={gateway.logoSrc}
                alt=""
                width={56}
                height={56}
                unoptimized
                aria-hidden
                className="size-10 object-contain"
              />
            </span>
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <gateway.icon className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{gateway.name}</h3>
              {/* The service says whether it's just been submitted or is
                  being reviewed — the badge says the same, as the old card
                  did, rather than flattening both to "Pending review". */}
              <StatusBadge
                status={status}
                pendingLabel={statusLabel(meta.status)}
                pendingSent={meta.status === "submitted"}
              />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {gateway.summary}
            </p>
          </div>
        </div>

        {/* Features */}
        <ul className="space-y-1.5">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <CheckCircle2
                className={cn(
                  "mt-0.5 size-3.5 shrink-0",
                  isComplete
                    ? "text-success"
                    : isDraft || isPending
                      ? "text-warning"
                      : "text-primary",
                )}
                aria-hidden
              />
              <span className="leading-snug text-muted-foreground">
                {feature}
              </span>
            </li>
          ))}
        </ul>

        {/* Progress bar */}
        <div className="mt-auto space-y-3">
          {query.isLoading ? (
            <Skeleton className="h-5 w-full" />
          ) : (
            <ProgressBar
              progress={progress}
              label={progressLabel}
              color={progressColor}
            />
          )}

          {/*
            NextTap's onboarding is a page in this app, so one button covers
            every state — only its wording changes, because starting,
            continuing and looking at a submitted application all end up on
            the same overview.
          */}
          <Button
            className={CARD_ACTION}
            variant={isComplete ? "outline" : "default"}
            disabled={query.isLoading}
            onClick={() => router.push(NEXTTAP_ONBOARDING_HREF)}
          >
            <ButtonIcon className="size-4" aria-hidden />
            {card.action}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Generic gateway card (any remaining / coming-soon provider)
 * ------------------------------------------------------------------ */

function GenericGatewayCard({ gateway }: { gateway: Gateway }) {
  const connected = useAtomValue(connectedGatewaysAtom).includes(gateway.id);
  const disconnect = useSetAtom(disconnectGatewayAtom);
  const router = useRouter();

  const status: GatewayStatus = connected ? "connected" : gateway.status;
  const comingSoon = status === "coming-soon";
  const Icon = gateway.icon;

  return (
    <Card
      className={cn("flex flex-col rounded-[14px]", comingSoon && "opacity-75")}
    >
      <CardContent className="flex flex-1 flex-col gap-4 pt-6">
        <div className="flex items-start gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{gateway.name}</h3>
              <StatusBadge status={status} />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {gateway.summary}
            </p>
          </div>
        </div>

        <ul className="space-y-1.5">
          {gateway.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <Check
                className="mt-0.5 size-3.5 shrink-0 text-success"
                aria-hidden
              />
              <span className="leading-snug text-muted-foreground">
                {feature}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-3 border-t border-border pt-4">
          {comingSoon ? (
            <Button disabled className={CARD_ACTION}>
              Coming soon
            </Button>
          ) : status === "connected" ? (
            <Button
              variant="outline"
              className={CARD_ACTION}
              onClick={() => {
                disconnect(gateway.id);
                toast(`${gateway.name} disconnected`, {
                  description: "Payments already taken stay on your records.",
                });
              }}
            >
              Disconnect
            </Button>
          ) : gateway.actionHref ? (
            <Button
              className={CARD_ACTION}
              onClick={() =>
                window.open(gateway.actionHref, "_blank", "noopener,noreferrer")
              }
            >
              Continue onboarding
            </Button>
          ) : (
            <Button disabled className={CARD_ACTION}>
              Not available
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
