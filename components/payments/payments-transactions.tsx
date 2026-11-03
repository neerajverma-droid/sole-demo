"use client";

import * as React from "react";
import Link from "next/link";
import { CreditCard, Loader2, Percent, Receipt, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { STAT_TONES, type StatTone } from "@/components/ui/stat-cards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateLabel, invoiceMoney } from "@/lib/invoices";
import type { PageInfo } from "@/lib/products";
import {
  feeRate,
  formatPaymentDate,
  formatPaymentMoney,
  netAmount,
  paymentStatusVariant,
  paymentStats,
  type GatewayPagination,
  type NexxtapSummary,
  type Payment,
  type StripeStats,
} from "@/lib/payments";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * Convert the gateway's pagination envelope into the `PageInfo` shape that
 * `NumberedPagination` and the range label expect — same approach as
 * `SuperScreen` builds its own `pageInfo` from the contributions query.
 */
function toPageInfo(
  pagination: GatewayPagination,
  rowCount: number,
): PageInfo {
  const { current_page: page, total_pages: pageCount, total } = pagination;
  return {
    page,
    pageCount,
    total,
    from: total === 0 ? 0 : (page - 1) * pagination.per_page + 1,
    to: Math.min(page * pagination.per_page, total),
  };
}

/* ------------------------------------------------------------------ *
 * Shared skeleton / empty / table primitives
 * ------------------------------------------------------------------ */

function TransactionsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div
            key={key}
            className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-32" />
          </div>
        ))}
      </div>
      <div className="space-y-2 rounded-lg border border-border bg-card p-4 shadow-sm">
        {[0, 1, 2, 3, 4].map((key) => (
          <Skeleton key={key} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

/**
 * Stat cards for SolePay — always derived from the current page rows.
 * SolePay has no stats endpoint, so frontend totals are the best we have.
 */
function StatsGrid({ payments }: { payments: Payment[] }) {
  const stats = paymentStats(payments);
  return (
    <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        icon={<Wallet aria-hidden />}
        tone="primary"
        label="Total payments"
        value={stats.total}
        format={invoiceMoney}
        meta="Settled and processing"
      />
      <Stat
        icon={<Percent aria-hidden />}
        tone="warning"
        label="Processing fees"
        value={stats.fees}
        format={invoiceMoney}
        meta={feeRate(stats)}
      />
      <Stat
        icon={<Receipt aria-hidden />}
        tone="accent"
        label="Transactions"
        value={stats.count}
        meta={stats.count === 1 ? "Payment taken" : "Payments taken"}
      />
      <Stat
        icon={<CreditCard aria-hidden />}
        tone="success"
        label="Net amount"
        value={stats.net}
        format={invoiceMoney}
        meta="What reaches your bank"
      />
    </dl>
  );
}

/**
 * Stat cards for Stripe — prefers backend totals from the stats API when
 * available, falling back to current-page totals.
 *
 * Backend fields (sole-webapp PaymentTransactionTable.js reference):
 *  - `total_credits` → Total payments
 *  - `processing_fees` → Processing fees
 *  - `transactions_count` → Transaction count
 *  - `net_amount` → Net amount
 */
function StripeStatsGrid({
  payments,
  stats,
}: {
  payments: Payment[];
  stats: StripeStats | null;
}) {
  const local = paymentStats(payments);

  const total =
    stats?.total_credits != null ? Number(stats.total_credits) : local.total;
  const fees =
    stats?.processing_fees != null
      ? Number(stats.processing_fees)
      : local.fees;
  const count =
    stats?.transactions_count != null
      ? Number(stats.transactions_count)
      : local.count;
  const net =
    stats?.net_amount != null ? Number(stats.net_amount) : local.net;

  // Recompute fee rate from the backend figures when available
  const feeRateMeta =
    total > 0 ? `${((fees / total) * 100).toFixed(2)}% of total` : "0.00% of total";

  return (
    <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        icon={<Wallet aria-hidden />}
        tone="primary"
        label="Total payments"
        value={total}
        format={invoiceMoney}
        meta="All transactions, all pages"
      />
      <Stat
        icon={<Percent aria-hidden />}
        tone="warning"
        label="Processing fees"
        value={fees}
        format={invoiceMoney}
        meta={feeRateMeta}
      />
      <Stat
        icon={<Receipt aria-hidden />}
        tone="accent"
        label="Transactions"
        value={count}
        meta={count === 1 ? "Payment taken" : "Payments taken"}
      />
      <Stat
        icon={<CreditCard aria-hidden />}
        tone="success"
        label="Net amount"
        value={net}
        format={invoiceMoney}
        meta="What reaches your bank"
      />
    </dl>
  );
}

/**
 * Stat cards for NextTap — sole-ocr returns all-pages totals with the list,
 * so these only fall back to the current page if that summary is missing.
 *
 * Declined taps are left out of the money figures (same as the backend). The
 * fee card is the cardholder's surcharge, not a cost to the merchant, so it's
 * labelled as such rather than as a processing fee.
 */
function NexxtapStatsGrid({
  payments,
  summary,
  totalCount,
}: {
  payments: Payment[];
  summary: NexxtapSummary | null;
  totalCount: number;
}) {
  const approved = payments.filter((p) => p.categoryType !== "expense");
  const localTotal = approved.reduce((sum, p) => sum + p.amount, 0);
  const localFees = approved.reduce((sum, p) => sum + p.processingFee, 0);

  const total =
    summary?.total_credits != null ? Number(summary.total_credits) : localTotal;
  const surcharges =
    summary?.processing_fees != null
      ? Number(summary.processing_fees)
      : localFees;
  const net =
    summary?.net_amount != null ? Number(summary.net_amount) : total - surcharges;
  const count = summary?.count != null ? Number(summary.count) : totalCount;
  const approvedCount =
    summary?.settled_count != null
      ? Number(summary.settled_count)
      : approved.length;

  return (
    <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        icon={<Wallet aria-hidden />}
        tone="primary"
        label="Total payments"
        value={total}
        format={invoiceMoney}
        meta="Approved taps, all pages"
      />
      <Stat
        icon={<Percent aria-hidden />}
        tone="warning"
        label="Surcharges"
        value={surcharges}
        format={invoiceMoney}
        meta="Paid by the cardholder"
      />
      <Stat
        icon={<Receipt aria-hidden />}
        tone="accent"
        label="Transactions"
        value={count}
        meta={`${approvedCount} approved`}
      />
      <Stat
        icon={<CreditCard aria-hidden />}
        tone="success"
        label="Net amount"
        value={net}
        format={invoiceMoney}
        meta="Total less surcharges"
      />
    </dl>
  );
}

/**
 * The shared transaction table. Columns are identical to the original
 * `PaymentsTransactions` table — Date, Category, Invoice, Description, Type,
 * Amount, Processing fee, Net amount, Status.
 */
function TransactionsTable({
  payments,
  loading = false,
  emptyTitle,
  emptyDescription,
  emptyAction,
  feeLabel = "Processing fee",
}: {
  payments: Payment[];
  loading?: boolean;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
  /** NextTap's fee column is the cardholder's surcharge, not a fee. */
  feeLabel?: string;
}) {
  if (!loading && payments.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <Receipt aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </div>
        {emptyAction && <EmptyActions>{emptyAction}</EmptyActions>}
      </Empty>
    );
  }

  return (
    <Table
      data-tour="payment-table"
      containerClassName="rounded-lg border border-border bg-card shadow-sm"
    >
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Invoice</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-center">Type</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">{feeLabel}</TableHead>
          <TableHead className="text-right">Net amount</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={9} className="h-64 text-center">
              <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-muted-foreground">
                <Loader2 className="size-8 animate-spin text-primary" />
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-foreground">
                    Loading Transactions
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Please wait while we fetch your payment data…
                  </p>
                </div>
              </div>
            </TableCell>
          </TableRow>
        ) : (
          payments.map((payment) => (
            <TableRow key={payment.id}>
              <TableCell className="whitespace-nowrap text-sm text-foreground tabular">
                {formatPaymentDate(payment.date)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border",
                    payment.categoryType === "expense"
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200",
                  )}
                >
                  {payment.category}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm font-semibold text-foreground tabular">
                {payment.invoiceNo || payment.invoiceNumber || "N/A"}
              </TableCell>
              <TableCell className="max-w-[18rem] truncate text-sm text-muted-foreground">
                {payment.description}
              </TableCell>
              <TableCell className="whitespace-nowrap text-center">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-sm font-medium",
                    payment.type?.toLowerCase() === "credit"
                      ? "text-emerald-600"
                      : "text-rose-600",
                  )}
                >
                  {payment.type?.toLowerCase() === "credit" ? "← Credit" : "→ Debit"}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular">
                <span
                  className={cn(
                    "text-sm font-semibold",
                    payment.type?.toLowerCase() === "credit"
                      ? "text-emerald-600"
                      : "text-rose-600",
                  )}
                >
                  {formatPaymentMoney(payment.amount, payment.currency)}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground tabular">
                {formatPaymentMoney(payment.processingFee ?? payment.fee ?? 0, payment.currency)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right text-sm font-medium text-foreground tabular">
                {formatPaymentMoney(payment.netAmount, payment.currency)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {payment.status}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

/* ------------------------------------------------------------------ *
 * SolePay (Worldpay / Payrix) transactions
 * ------------------------------------------------------------------ */

/**
 * The SolePay Payments tab content.
 *
 * Mirrors sole-webapp's `SolePayPayments` → `PaymentTransactionTable` stack,
 * but uses this project's own stat cards, table and `NumberedPagination`
 * instead of the MUI / custom components in the old app.
 */
export function SolePayTransactions({
  payments,
  loading,
  empty = false,
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  payments: Payment[];
  loading: boolean;
  /** Loaded, and this gateway has never taken a payment. */
  empty?: boolean;
  pagination: GatewayPagination;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const [pageSize, setPageSize] = React.useState(pagination.per_page);

  const handlePageSizeChange = (next: number) => {
    setPageSize(next);
    onPageSizeChange(next);
  };

  // Only show the full skeleton if we have NO payments at all and are on initial load
  if (loading && payments.length === 0 && pagination.total === 0) {
    return <TransactionsSkeleton />;
  }

  const pageInfo = toPageInfo(pagination, payments.length);

  return (
    <div className="space-y-4">
      {/* Four zeroes say nothing the empty state below doesn't. */}
      {!empty && <StatsGrid payments={payments} />}

      <TransactionsTable
        payments={payments}
        loading={loading}
        emptyTitle="No SolePay payments yet"
        emptyDescription="Payments taken through SolePay will appear here with the fee and net amount."
        emptyAction={
          <Button variant="outline" asChild>
            <Link href="/invoices/new">Create an invoice</Link>
          </Button>
        }
      />

      {(payments.length > 0 || pagination.total > 0) && (
        <NumberedPagination
          page={pageInfo}
          pageSize={pageSize}
          pageSizes={[10, 15, 25, 50, 100]}
          disabled={loading}
          onPageChange={onPageChange}
          onPageSizeChange={handlePageSizeChange}
          itemLabel="transaction"
          navLabel="SolePay payments pages"
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Stripe transactions
 * ------------------------------------------------------------------ */

/**
 * The Stripe Payments tab content.
 *
 * Mirrors sole-webapp's `StripePayments` → `PaymentTransactionTable` stack,
 * using this project's stat cards, table and `NumberedPagination`.
 */
export function StripeTransactions({
  payments,
  stats,
  loading,
  empty = false,
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  payments: Payment[];
  stats: StripeStats | null;
  loading: boolean;
  /** Loaded, and this gateway has never taken a payment. */
  empty?: boolean;
  pagination: GatewayPagination;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const [pageSize, setPageSize] = React.useState(pagination.per_page);

  const handlePageSizeChange = (next: number) => {
    setPageSize(next);
    onPageSizeChange(next);
  };

  // Only show the full skeleton if we have NO payments at all and are on initial load
  if (loading && payments.length === 0 && pagination.total === 0) {
    return <TransactionsSkeleton />;
  }

  const pageInfo = toPageInfo(pagination, payments.length);

  return (
    <div className="space-y-4">
      {/* Backend stats when available, frontend fallback otherwise — and
          none at all before the first payment, where they'd only be zeroes. */}
      {!empty && <StripeStatsGrid payments={payments} stats={stats} />}

      <TransactionsTable
        payments={payments}
        loading={loading}
        emptyTitle="No Stripe payments yet"
        emptyDescription="Payments taken through Stripe will appear here with the processing fee and net amount."
        emptyAction={
          <Button variant="outline" asChild>
            <Link href="/invoices/new">Create an invoice</Link>
          </Button>
        }
      />

      {(payments.length > 0 || pagination.total > 0) && (
        <NumberedPagination
          page={pageInfo}
          pageSize={pageSize}
          pageSizes={[10, 15, 25, 50, 100]}
          disabled={loading}
          onPageChange={onPageChange}
          onPageSizeChange={handlePageSizeChange}
          itemLabel="transaction"
          navLabel="Stripe payments pages"
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * NextTap transactions
 * ------------------------------------------------------------------ */

/**
 * The NextTap Payments tab content.
 *
 * Mirrors sole-webapp's `NexxtapPayments` → `PaymentTransactionTable` stack.
 * Rows are the captures the terminal took, mirrored into sole-ocr by the
 * payments service when the NextTap webhook fires. There's no merchant portal
 * to link out to, so the linked Merchant ID is shown instead.
 */
export function NexxtapTransactions({
  payments,
  summary,
  merchantId,
  loading,
  empty = false,
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  payments: Payment[];
  summary: NexxtapSummary | null;
  merchantId: string | null;
  loading: boolean;
  /** Loaded, and this gateway has never taken a payment. */
  empty?: boolean;
  pagination: GatewayPagination;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const [pageSize, setPageSize] = React.useState(pagination.per_page);

  const handlePageSizeChange = (next: number) => {
    setPageSize(next);
    onPageSizeChange(next);
  };

  // Only show the full skeleton if we have NO payments at all and are on initial load
  if (loading && payments.length === 0 && pagination.total === 0) {
    return <TransactionsSkeleton />;
  }

  const pageInfo = toPageInfo(pagination, payments.length);

  return (
    <div className="space-y-4">
      {merchantId && (
        <p className="text-sm text-muted-foreground">
          Merchant ID{" "}
          <span className="font-medium text-foreground tabular">
            {merchantId}
          </span>
        </p>
      )}

      {!empty && (
        <NexxtapStatsGrid
          payments={payments}
          summary={summary}
          totalCount={pagination.total}
        />
      )}

      <TransactionsTable
        payments={payments}
        loading={loading}
        feeLabel="Surcharge"
        emptyTitle="No NextTap payments yet"
        emptyDescription="Tap-to-pay payments taken on your NextTap terminal will appear here with the surcharge and net amount."
        emptyAction={
          <Button variant="outline" asChild>
            <Link href="/invoices/new">Create an invoice</Link>
          </Button>
        }
      />

      {(payments.length > 0 || pagination.total > 0) && (
        <NumberedPagination
          page={pageInfo}
          pageSize={pageSize}
          pageSizes={[10, 15, 25, 50, 100]}
          disabled={loading}
          onPageChange={onPageChange}
          onPageSizeChange={handlePageSizeChange}
          itemLabel="transaction"
          navLabel="NextTap payments pages"
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Legacy export kept for any other import sites
 * ------------------------------------------------------------------ */

/**
 * The original combined `PaymentsTransactions` view.
 *
 * Kept so any other file that imports it doesn't break while the gateway-
 * specific views are being wired up. The gateway tabs in `PaymentsScreen`
 * now use `SolePayTransactions` / `StripeTransactions` directly.
 *
 * @deprecated Use `SolePayTransactions` or `StripeTransactions` instead.
 */
export function PaymentsTransactions({
  payments,
  loading,
  onBrowseGateways,
}: {
  payments: Payment[];
  loading: boolean;
  onBrowseGateways: () => void;
}) {
  const stats = paymentStats(payments);

  if (loading) return <TransactionsSkeleton />;

  return (
    <div className="space-y-4">
      <StatsGrid payments={payments} />
      <TransactionsTable
        payments={payments}
        emptyTitle="No payments yet"
        emptyDescription="Connect a gateway and the payments it takes will appear here, with the fee and what landed in your bank."
        emptyAction={<Button onClick={onBrowseGateways}>Browse gateways</Button>}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Stat card (unchanged from original)
 * ------------------------------------------------------------------ */

function Stat({
  icon,
  tone = "primary",
  label,
  value,
  format,
  meta,
}: {
  icon: React.ReactNode;
  tone?: StatTone;
  label: string;
  value: number;
  format?: (value: number) => string;
  meta: string;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4 shadow-sm">
      <span
        className={cn(
          "grid size-9 place-items-center rounded-lg [&_svg]:size-4",
          STAT_TONES[tone],
        )}
        aria-hidden
      >
        {icon}
      </span>
      <div className="space-y-0.5">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-xl font-semibold tracking-tight tabular">
          <CountUp value={value} format={format} />
        </dd>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
    </div>
  );
}
