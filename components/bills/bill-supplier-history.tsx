"use client";

import Link from "next/link";
import { History, TrendingDown, TrendingUp } from "lucide-react";

import { FormSection } from "@/components/ui/form-section";
import { Shimmer } from "@/components/ui/shimmer";
import { BillStatusBadge } from "@/components/bills/bill-status";
import { useBillsListQuery } from "@/hooks/use-bills-query";
import { formatInvoiceDate, invoiceMoney } from "@/lib/invoices";
import { cn } from "@/lib/utils";

const HISTORY_SIZE = 5;

/**
 * The supplier's last few bills beside this one, and how this bill's total
 * compares with the most recent — so a power bill that jumped 40% is noticed
 * before it's converted. Nothing shows until a supplier is picked.
 */
export function BillSupplierHistory({
  supplierId,
  supplierName,
  billId,
  total,
}: {
  supplierId: string | null;
  supplierName: string;
  /** Left out of the history: the bill being looked at. */
  billId?: string;
  /** This bill's total as it stands, to compare with the last one. */
  total: number;
}) {
  const query = useBillsListQuery(
    1,
    HISTORY_SIZE,
    { status: "All", search: "", supplierId: supplierId ?? undefined, excludeId: billId },
    { enabled: !!supplierId },
  );

  if (!supplierId) return null;
  const bills = query.data?.bills ?? [];
  if (!query.isLoading && bills.length === 0) return null;

  const last = bills[0];
  const change = last && last.total > 0 && total > 0 ? Math.round(((total - last.total) / last.total) * 100) : null;

  return (
    <FormSection
      icon={History}
      title={`Previous bills from ${supplierName || "this supplier"}`}
      description="The most recent first."
      tourId="bill-supplier-history"
    >
      {query.isLoading ? (
        <div className="space-y-2" aria-hidden>
          {Array.from({ length: 3 }).map((_, index) => (
            <Shimmer key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {change !== null && change !== 0 && (
            <p
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm",
                change > 0 ? "bg-warning/10 text-warning" : "bg-success/10 text-success",
              )}
            >
              {change > 0 ? <TrendingUp className="size-4" aria-hidden /> : <TrendingDown className="size-4" aria-hidden />}
              {change > 0 ? "Up" : "Down"} {Math.abs(change)}% on the last bill ({invoiceMoney(last.total)}
              {last.billDate ? ` on ${formatInvoiceDate(last.billDate)}` : ""}).
            </p>
          )}
          <ul className="divide-y divide-border rounded-lg border border-border">
            {bills.map((bill) => (
              <li key={bill.id}>
                <Link href={`/expenses/bills/${bill.id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                  <span className="min-w-0 truncate">
                    <span className="font-medium tabular">{bill.billDate ? formatInvoiceDate(bill.billDate) : "No date"}</span>
                    {bill.billNo && <span className="ml-2 text-xs text-muted-foreground">{bill.billNo}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-medium tabular">{invoiceMoney(bill.total)}</span>
                    <BillStatusBadge bill={bill} className="px-1.5 py-0 text-[10px]" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </FormSection>
  );
}
