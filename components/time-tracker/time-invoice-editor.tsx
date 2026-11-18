"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";
import { useProjectMoney } from "@/components/projects/project-shared";
import { useMarkLogsInvoicedMutation } from "@/hooks/use-time-tracker-query";
import { apiErrorMessage } from "@/lib/api-error";
import { draftInvoicesQueryKey } from "@/lib/invoice-drafts";
import {
  clearTimeInvoiceHandoff,
  readTimeInvoiceHandoff,
} from "@/lib/time-invoice-handoff";
import {
  TIME_TRACKER_ROOT,
  fetchTimesheetPdf,
  formatHoursMinutes,
  type TimeInvoice,
} from "@/lib/time-tracker";

/**
 * The invoice page opened from Time Tracker's "Create invoice": the full
 * invoice editor — a new invoice, or the chosen draft (`invoiceId`) with the
 * time appended — pre-filled with the lines built from the selected sessions,
 * and the timesheet PDF attached as sole-webapp attached it. Once it saves,
 * those sessions are marked invoiced and the person is back on their time.
 */
export function TimeInvoiceEditor({
  handoffKey,
  invoiceId,
}: {
  /** `?time=` — where the selected sessions were left for this page. */
  handoffKey: string;
  /** A draft being added to, or nothing for a new invoice. */
  invoiceId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const money = useProjectMoney();
  const markInvoiced = useMarkLogsInvoicedMutation();

  // Read after mount: the handoff lives in sessionStorage, which the server
  // render can't see. `undefined` = not read yet, `null` = not there.
  const [invoice, setInvoice] = React.useState<TimeInvoice | null | undefined>(undefined);
  React.useEffect(() => {
    setInvoice(readTimeInvoiceHandoff(handoffKey));
  }, [handoffKey]);

  // The editor seeds its attachments once, on mount — so it waits for this.
  const timesheetQuery = useQuery({
    queryKey: ["time-tracker", "timesheet-pdf", handoffKey],
    queryFn: () => fetchTimesheetPdf(invoice as TimeInvoice),
    enabled: !!invoice,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  const seed = React.useMemo(
    () =>
      invoice
        ? { ...invoice.seed, files: timesheetQuery.data ? [timesheetQuery.data] : [] }
        : null,
    [invoice, timesheetQuery.data],
  );

  const handleSaved = async (saved: { id: string; number: string }) => {
    if (!invoice) return;
    const count = invoice.logIds.length;
    try {
      await markInvoiced.mutateAsync({ logIds: invoice.logIds, invoice: saved });
      toast.success(`${count === 1 ? "The session is" : `All ${count} sessions are`} now on ${saved.number}`);
    } catch (error) {
      toast.error(
        apiErrorMessage(error, `${saved.number} was saved, but the time couldn't be marked invoiced.`),
      );
    }
    clearTimeInvoiceHandoff(handoffKey);
    queryClient.invalidateQueries({ queryKey: draftInvoicesQueryKey(invoice.seed.clientId) });
    router.push(TIME_TRACKER_ROOT);
  };

  if (invoice === undefined || (invoice && timesheetQuery.isLoading)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground" aria-busy="true">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <p className="text-sm">Preparing the invoice from your time…</p>
      </div>
    );
  }

  if (!invoice || !seed) {
    return (
      <Empty>
        <EmptyMedia>
          <TriangleAlert aria-hidden />
        </EmptyMedia>
        <div className="space-y-1">
          <EmptyTitle>This invoice&apos;s time isn&apos;t available any more</EmptyTitle>
          <EmptyDescription>
            It was set up in another tab or session. Select the sessions again in Time Tracker and choose
            Create invoice.
          </EmptyDescription>
        </div>
        <EmptyActions>
          <Button size="sm" asChild>
            <Link href={TIME_TRACKER_ROOT}>Back to Time Tracker</Link>
          </Button>
        </EmptyActions>
      </Empty>
    );
  }

  const count = invoice.logIds.length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-primary/30 bg-primary/[0.05] px-4 py-2.5 text-sm">
        <Clock className="size-4 shrink-0 text-primary" aria-hidden />
        <span>
          <span className="font-medium">From Time Tracker:</span> {count} {count === 1 ? "session" : "sessions"} ·{" "}
          {formatHoursMinutes(invoice.hours)} · {money(invoice.amount)}
          {invoice.seed.clientName ? ` · ${invoice.seed.clientName}` : ""}
          {invoiceId ? " — added as new lines on this draft." : ""}
        </span>
        {timesheetQuery.isFetched && !timesheetQuery.data && (
          <span className="text-warning">The timesheet PDF couldn&apos;t be made, so it isn&apos;t attached.</span>
        )}
      </div>
      <InvoiceEditor
        key={`${handoffKey}:${invoiceId ?? "new"}`}
        seed={seed}
        invoiceId={invoiceId}
        returnTo={TIME_TRACKER_ROOT}
        onSaved={handleSaved}
      />
    </div>
  );
}
