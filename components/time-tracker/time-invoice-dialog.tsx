"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DraftInvoicesDialog } from "@/components/shared/draft-invoices-dialog";
import { useProjectMoney } from "@/components/projects/project-shared";
import { draftInvoicesQueryKey, fetchDraftInvoices } from "@/lib/invoice-drafts";
import { saveTimeInvoiceHandoff, timeInvoiceHref, timeInvoiceStep } from "@/lib/time-invoice-handoff";
import { formatHoursMinutes, type TimeInvoice } from "@/lib/time-tracker";

/**
 * Selected time onto an invoice — sole-webapp's TimeEntryInvoiceFlow. The
 * client's draft invoices are checked first; with any, the person picks one to
 * add the time to or starts a new invoice. Either way the invoice itself opens
 * on its own page — the full editor, pre-filled with one line per task and the
 * timesheet PDF (see TimeInvoiceEditor) — rather than in a modal.
 */
export function TimeInvoiceDialog({
  invoice,
  onClose,
}: {
  /** What's being invoiced, or null when closed. */
  invoice: TimeInvoice | null;
  onClose: () => void;
}) {
  // Mounted only while open: closed, there are no drafts to fetch and nowhere
  // to navigate — and hosts that keep it in their tree (the Quick Actions
  // card) don't need a router just to render it shut.
  return invoice ? <TimeInvoiceFlow invoice={invoice} onClose={onClose} /> : null;
}

function TimeInvoiceFlow({ invoice, onClose }: { invoice: TimeInvoice; onClose: () => void }) {
  const router = useRouter();
  const money = useProjectMoney();

  const open = true;
  const clientId = invoice.seed.clientId ?? null;

  const draftsQuery = useQuery({
    queryKey: draftInvoicesQueryKey(clientId),
    queryFn: () => fetchDraftInvoices(clientId),
    // Without a client there's no "this client's drafts" to offer — straight
    // to a new invoice, where the client gets picked.
    enabled: open && clientId !== null,
    staleTime: 0,
  });

  const step = timeInvoiceStep({
    open,
    clientId,
    draftsLoading: draftsQuery.isLoading,
    draftCount: draftsQuery.data?.length ?? 0,
  });
  const checking = step === "checking";
  const choosing = step === "choosing";

  // Hand the time to the invoice page and go there — once per opening; this
  // component mounts afresh for each.
  const opened = React.useRef(false);
  const openInvoicePage = React.useCallback(
    (draftId?: string) => {
      if (opened.current) return;
      opened.current = true;
      router.push(timeInvoiceHref(saveTimeInvoiceHandoff(invoice), draftId));
      onClose();
    },
    [invoice, onClose, router],
  );

  // No drafts to choose from (or no client): straight to a new invoice.
  React.useEffect(() => {
    if (step === "open-new") openInvoicePage();
  }, [step, openInvoicePage]);

  const count = invoice.logIds.length;
  const summary = `${count} ${count === 1 ? "session" : "sessions"} · ${formatHoursMinutes(invoice.hours)} · ${money(invoice.amount)}${invoice.seed.clientName ? ` · ${invoice.seed.clientName}` : ""}`;

  return (
    <>
      <Dialog open={checking} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create invoice</DialogTitle>
            <DialogDescription>{summary}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            <p className="text-sm">Checking for draft invoices…</p>
          </div>
        </DialogContent>
      </Dialog>

      <DraftInvoicesDialog
        open={choosing}
        onOpenChange={(next) => !next && onClose()}
        clientId={clientId}
        clientName={invoice.seed.clientName}
        onUseInvoice={(draft) => openInvoicePage(draft.id)}
        onCreateNew={() => openInvoicePage()}
      />
    </>
  );
}
