"use client";

import * as React from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { CircleAlert, CreditCard, ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/ui/filter-pills";
import { PageHeader } from "@/components/layout/page-header";
import { PaymentGateways } from "@/components/payments/payment-gateways";
import {
  NexxtapTransactions,
  SolePayTransactions,
  StripeTransactions,
} from "@/components/payments/payments-transactions";
import {
  checkingGatewayConnectionAtom,
  connectedGatewaysAtom,
  gatewayTransactionTabAtom,
  loadPaymentsAtom,
  nexxtapConnectedAtom,
  stripeConnectedAtom,
  worldpayConnectedAtom,
} from "@/lib/atoms";
import {
  checkNexxtapConnection,
  checkStripeConnection,
  checkWorldpayConnection,
  manageableGateways,
} from "@/lib/payments";
import {
  useWorldpayTransactionsQuery,
  useStripeTransactionsQuery,
  useStripeStatsQuery,
  useNexxtapTransactionsQuery,
} from "@/hooks/use-payment-transactions-query";
import { getUserIdFromToken } from "@/utils/authSession";

/** The tabs on the Payments screen. */
type GatewayTab =
  | "Gateways"
  | "SolePay Payments"
  | "Stripe Payments"
  | "NextTap Payments";

const DEFAULT_PAGE_SIZE = 15;

/**
 * Payments screen: gateway management and per-gateway transaction views.
 *
 * Tab logic mirrors sole-webapp's Payments/index.js:
 *  - "Gateways" is always present.
 *  - "SolePay Payments" and "Stripe Payments" are always shown.
 *  - "NextTap Payments" only once the business has a NextTap Merchant ID.
 *  - Default tab: first connected gateway's transaction tab, or "Gateways" if none.
 *
 * Data is fetched via React Query so paging never re-triggers a full skeleton —
 * the previous page stays visible while the next one arrives (keepPreviousData),
 * same as super-contributions.
 */
export function PaymentsScreen() {
  const [connected, setConnectedGateways] = useAtom(connectedGatewaysAtom);
  const load = useSetAtom(loadPaymentsAtom);

  // Gateway connection flags — written once on mount
  const [checkingConnection, setCheckingConnection] = useAtom(
    checkingGatewayConnectionAtom,
  );
  const [worldpayConnected, setWorldpayConnected] = useAtom(
    worldpayConnectedAtom,
  );
  const [stripeConnected, setStripeConnected] = useAtom(stripeConnectedAtom);
  const [nexxtapConnected, setNexxtapConnected] = useAtom(
    nexxtapConnectedAtom,
  );
  const [nexxtapMerchantId, setNexxtapMerchantId] = React.useState<
    string | null
  >(null);

  // Active gateway transaction tab (null = auto-select)
  const [chosenGatewayTab, setChosenGatewayTab] = useAtom(
    gatewayTransactionTabAtom,
  );

  // Pagination state — each tab keeps its own page/size, reset to 1 on tab switch
  const [worldpayPage, setWorldpayPage] = React.useState(1);
  const [worldpayPageSize, setWorldpayPageSize] =
    React.useState(DEFAULT_PAGE_SIZE);
  const [stripePage, setStripePage] = React.useState(1);
  const [stripePageSize, setStripePageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [nexxtapPage, setNexxtapPage] = React.useState(1);
  const [nexxtapPageSize, setNexxtapPageSize] =
    React.useState(DEFAULT_PAGE_SIZE);

  // ── Connection check on mount (mirrors sole-webapp's Promise.allSettled) ──
  React.useEffect(() => {
    const checkConnections = async () => {
      setCheckingConnection(true);
      try {
        const [wpOk, strOk, ntOk] = await Promise.allSettled([
          checkWorldpayConnection(getUserIdFromToken()),
          checkStripeConnection(),
          checkNexxtapConnection(),
        ]);

        const isWp = wpOk.status === "fulfilled" ? wpOk.value : false;
        const isStr = strOk.status === "fulfilled" ? strOk.value : false;
        const nexxtap =
          ntOk.status === "fulfilled"
            ? ntOk.value
            : { connected: false, merchantId: null };

        setWorldpayConnected(isWp);
        setStripeConnected(isStr);
        setNexxtapConnected(nexxtap.connected);
        setNexxtapMerchantId(nexxtap.merchantId);

        const connectedList: string[] = [];
        if (isWp) connectedList.push("sole-pay");
        if (isStr) connectedList.push("stripe");
        setConnectedGateways(connectedList);
      } catch {
        setWorldpayConnected(false);
        setStripeConnected(false);
        setNexxtapConnected(false);
        setNexxtapMerchantId(null);
        setConnectedGateways([]);
      } finally {
        setCheckingConnection(false);
      }
    };

    void checkConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── React Query: fetch whichever tab's data is needed ───────────────────
  /**
   * Active tab derivation.
   *
   * An explicit choice ALWAYS wins — including "gateways", which a null value
   * couldn't express before (it just fell through to the connected-gateway
   * fallback, making the Gateways tab un-clickable once connected).
   *
   * Null means "not chosen yet" and auto-selects the first connected gateway.
   */
  const activeTab: GatewayTab = (() => {
    if (chosenGatewayTab === "gateways") return "Gateways";
    if (chosenGatewayTab === "solepay-payments") return "SolePay Payments";
    if (chosenGatewayTab === "stripe-payments") return "Stripe Payments";
    if (chosenGatewayTab === "nexttap-payments" && nexxtapConnected)
      return "NextTap Payments";
    // Auto-select: first connected gateway, otherwise Gateways
    if (worldpayConnected) return "SolePay Payments";
    if (stripeConnected) return "Stripe Payments";
    if (nexxtapConnected) return "NextTap Payments";
    return "Gateways";
  })();

  // Queries are gated by active tab — matches sole-webapp's
  // `activeTabHref === "worldpay-payments"` / `"stripe-payments"` guard.
  // Neither query fires until the user actually selects that tab.
  const isSolePayTab = activeTab === "SolePay Payments";
  const isStripeTab = activeTab === "Stripe Payments";
  const isNexxtapTab = activeTab === "NextTap Payments";

  const worldpayQuery = useWorldpayTransactionsQuery(
    worldpayPage,
    worldpayPageSize,
    isSolePayTab, // only fetch when SolePay tab is active
  );

  const stripeQuery = useStripeTransactionsQuery(
    stripePage,
    stripePageSize,
    isStripeTab, // only fetch when Stripe tab is active
  );

  // Stripe account-level stats — fired alongside the list when Stripe tab
  // is active, same as sole-webapp calling fetchStripeStats() in the same
  // useEffect as fetchStripeTransactions().
  const stripeStatsQuery = useStripeStatsQuery(isStripeTab);

  const nexxtapQuery = useNexxtapTransactionsQuery(
    nexxtapPage,
    nexxtapPageSize,
    isNexxtapTab, // only fetch when NextTap tab is active
  );

  // Also seed the atom-based gateways view
  React.useEffect(() => {
    void load();
  }, [load]);

  // ── Tab handlers ─────────────────────────────────────────────────────────
  const handleTabChange = (tab: GatewayTab) => {
    if (tab === "SolePay Payments") setChosenGatewayTab("solepay-payments");
    else if (tab === "Stripe Payments") setChosenGatewayTab("stripe-payments");
    else if (tab === "NextTap Payments") setChosenGatewayTab("nexttap-payments");
    else setChosenGatewayTab("gateways"); // explicit — not null
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (checkingConnection) {
    return (
      <div className="space-y-[15px]">
        <PageHeader
          icon={CreditCard}
          title="Payments"
          description="Take card and bank payments on your invoices, and see what each one cost."
        />
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Checking payment connections…
          </p>
        </div>
      </div>
    );
  }

  // Derive SolePay transaction data from query
  const worldpayPayments = worldpayQuery.data?.payments ?? [];
  const worldpayPagination = worldpayQuery.data?.pagination ?? {
    current_page: worldpayPage,
    total_pages: 1,
    per_page: worldpayPageSize,
    total: 0,
  };

  // Derive Stripe transaction data from query
  const stripePayments = stripeQuery.data?.payments ?? [];
  const stripePagination = stripeQuery.data?.pagination ?? {
    current_page: stripePage,
    total_pages: 1,
    per_page: stripePageSize,
    total: 0,
  };

  // Derive NextTap transaction data from query
  const nexxtapPayments = nexxtapQuery.data?.payments ?? [];
  const nexxtapPagination = nexxtapQuery.data?.pagination ?? {
    current_page: nexxtapPage,
    total_pages: 1,
    per_page: nexxtapPageSize,
    total: 0,
  };

  /*
   * A gateway that has never taken a payment shows its empty state alone, not
   * under four zeroed stat cards. Only a settled, successful answer counts — a
   * failed load or one still in flight isn't "none". The pills stay either
   * way: they're how the Gateways tab (where a provider is connected) and the
   * other provider's payments are reached, so an empty SolePay can't hide
   * Stripe's.
   */
  const worldpayEmpty =
    worldpayQuery.isSuccess &&
    !worldpayQuery.isFetching &&
    worldpayPayments.length === 0 &&
    worldpayPagination.total === 0;
  const stripeEmpty =
    stripeQuery.isSuccess &&
    !stripeQuery.isFetching &&
    stripePayments.length === 0 &&
    stripePagination.total === 0;
  const nexxtapEmpty =
    nexxtapQuery.isSuccess &&
    !nexxtapQuery.isFetching &&
    nexxtapPayments.length === 0 &&
    nexxtapPagination.total === 0;

  // NextTap only once a Merchant ID is linked — same as sole-webapp, where
  // the tab is spread in behind `nexxtapConnected`.
  const visibleTabs: GatewayTab[] = [
    "Gateways",
    "SolePay Payments",
    "Stripe Payments",
    ...(nexxtapConnected ? (["NextTap Payments"] as const) : []),
  ];

  return (
    <div className="space-y-[15px]">
      <PageHeader
        icon={CreditCard}
        title="Payments"
        description="Take card and bank payments on your invoices, and see what each one cost."
      >
        <ManageGateways connectedIds={connected} />
      </PageHeader>

      <FilterPills
        tourId="payment-tabs"
        label="Show gateways or payment transactions"
        options={visibleTabs}
        value={activeTab}
        onChange={handleTabChange}
      />

      {activeTab === "Gateways" ? (
        <PaymentGateways status="ready" />
      ) : activeTab === "SolePay Payments" ? (
        <SolePayTransactions
          payments={worldpayPayments}
          loading={worldpayQuery.isLoading || worldpayQuery.isFetching}
          empty={worldpayEmpty}
          pagination={worldpayPagination}
          onPageChange={(page) => setWorldpayPage(page)}
          onPageSizeChange={(size) => {
            setWorldpayPageSize(size);
            setWorldpayPage(1);
          }}
        />
      ) : activeTab === "NextTap Payments" ? (
        <NexxtapTransactions
          payments={nexxtapPayments}
          summary={nexxtapQuery.data?.summary ?? null}
          merchantId={nexxtapMerchantId}
          loading={nexxtapQuery.isLoading || nexxtapQuery.isFetching}
          empty={nexxtapEmpty}
          pagination={nexxtapPagination}
          onPageChange={(page) => setNexxtapPage(page)}
          onPageSizeChange={(size) => {
            setNexxtapPageSize(size);
            setNexxtapPage(1);
          }}
        />
      ) : (
        <StripeTransactions
          payments={stripePayments}
          stats={stripeStatsQuery.data ?? null}
          loading={stripeQuery.isLoading || stripeQuery.isFetching}
          empty={stripeEmpty}
          pagination={stripePagination}
          onPageChange={(page) => setStripePage(page)}
          onPageSizeChange={(size) => {
            setStripePageSize(size);
            setStripePage(1);
          }}
        />
      )}
    </div>
  );
}

/**
 * Links to each connected provider's own dashboard.
 */
function ManageGateways({ connectedIds }: { connectedIds: string[] }) {
  const gateways = manageableGateways(connectedIds);
  if (gateways.length === 0) return null;

  return (
    <>
      {gateways.map((gateway) => (
        <Button key={gateway.id} variant="outline" size="sm" asChild>
          <a
            href={gateway.dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Manage {gateway.name}
            <ExternalLink />
          </a>
        </Button>
      ))}
    </>
  );
}

/**
 * The provider didn't answer.
 */
function ErrorState({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-destructive/30 bg-destructive/[0.04] px-6 py-12 text-center">
      <span
        className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive"
        aria-hidden
      >
        <CircleAlert className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {message ?? "Something went wrong."}
        </p>
        <p className="mx-auto max-w-[42ch] text-sm text-muted-foreground">
          Your payments couldn&apos;t be loaded, so nothing is shown rather than
          a total that might be wrong. Your gateways are unaffected.
        </p>
      </div>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
