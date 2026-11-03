"use client";

import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/ui/shimmer";
import { useAccountDetailQuery } from "@/hooks/use-account-detail-query";
import { apiErrorMessage } from "@/lib/api-error";
import { reportTableMoney } from "@/lib/report-table";
import { cn } from "@/lib/utils";

/**
 * How an account's derived GST treatment reads.
 *
 * "Mixed" is the one worth colouring: an account posted both ways is usually a
 * coding mistake somewhere in its history, and it's the reason to open this
 * panel at all.
 */
function treatmentVariant(label: string): "success" | "warning" | "secondary" | "outline" {
  if (label === "GST") return "success";
  if (label.startsWith("Mixed")) return "warning";
  if (label === "No transactions") return "secondary";
  return "outline";
}

/** "15/08/2026" from whatever the endpoint sends; an em dash for nothing. */
function detailDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-AU");
}

/**
 * The drill-down behind a Chart of Accounts row.
 *
 * There is no per-account GST setting in the schema — Sole records GST on each
 * transaction — so this reports the treatment the account has actually been
 * posted with, never a configured default. The note saying so is load-bearing:
 * without it the badge reads as a setting someone chose, and it would be
 * trusted for data entry it cannot support.
 */
export function AccountDetailPanel({
  subcategoryId,
  code,
  name,
  section,
  onClose,
}: {
  subcategoryId: string;
  code: string;
  name: string;
  section: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useAccountDetailQuery(subcategoryId);

  const gst = data?.gst_treatment;
  const activity = data?.activity;
  const label = gst?.label ?? "";

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm print:hidden">
      <div className="flex items-start justify-between gap-4 border-b border-border p-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{code}</span>
            <h3 className="text-base font-semibold">{name}</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{section}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close account detail"
          onClick={onClose}
          className="btn-soft-close size-7 print:hidden"
        >
          <X />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4 sm:px-5" aria-hidden>
          <Shimmer className="h-5 w-full rounded" />
          <Shimmer className="h-5 w-3/5 rounded" />
        </div>
      ) : isError ? (
        <p className="p-4 text-sm text-destructive sm:px-5">
          {apiErrorMessage(error, "Could not load this account.")}
        </p>
      ) : (
        <div className="grid gap-6 p-4 sm:px-5 md:grid-cols-2">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              GST treatment
            </h4>
            <div className="mt-2">
              <Badge variant={treatmentVariant(label)}>{label || "—"}</Badge>
            </div>

            {gst && gst.entries > 0 && (
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Posted with GST</dt>
                  <dd className="font-medium tabular">
                    {gst.with_gst} of {gst.entries} transactions
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">GST free / excluded</dt>
                  <dd className="font-medium tabular">
                    {gst.without_gst} of {gst.entries} transactions
                  </dd>
                </div>
              </dl>
            )}

            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Derived from transactions already posted to this account, not a
              per-account setting. Sole records GST on each transaction, so an
              account has no default GST treatment of its own.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Activity
            </h4>
            <dl className="mt-2 space-y-1 text-sm">
              <DetailRow label="Transactions" value={String(gst?.entries ?? 0)} />
              <DetailRow
                label="Net amount"
                value={reportTableMoney(activity?.net_amount ?? 0)}
              />
              <DetailRow label="First posted" value={detailDate(activity?.first_posted)} />
              <DetailRow label="Last posted" value={detailDate(activity?.last_posted)} />
            </dl>
          </div>
        </div>
      )}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("flex justify-between gap-4")}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular">{value}</dd>
    </div>
  );
}
