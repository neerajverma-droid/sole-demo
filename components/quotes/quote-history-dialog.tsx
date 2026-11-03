"use client";

import { useAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Clock,
  FileText,
  History,
  X,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { historyQuoteIdAtom } from "@/lib/atoms";
import { contactDisplayName } from "@/lib/contacts";
import { formatInvoiceDate, invoiceMoney } from "@/lib/invoices";
import {
  fetchQuoteHistory,
  formatQuoteEventTime,
  quoteAmount,
  type QuoteEvent,
  type QuoteEventKind,
} from "@/lib/quotes";
import { cn } from "@/lib/utils";
import { useBusinessTimeZone } from "@/hooks/use-active-business";
import { useContactsStore } from "@/stores/contacts";
import { useKnownQuotes } from "@/hooks/use-quotes-query";

/**
 * What has happened to a quote, in the order it happened.
 *
 * The header answers "which quote" — reference, what it's worth, when it was
 * raised and when it lapses, and who it went to. The timeline below answers
 * "and then what", which is the question the status badge on the list can only
 * ever give the last word on.
 */
export function QuoteHistoryDialog() {
  const [historyId, setHistoryId] = useAtom(historyQuoteIdAtom);
  const quotes = useKnownQuotes();
  const contacts = useContactsStore((state) => state.contacts);
  const quote = quotes.find((entry) => entry.id === historyId);

  // The name and address come from Contacts while the contact exists; the
  // quote's own snapshot is the fallback once it's deleted.
  const contact = contacts.find((entry) => entry.id === quote?.clientId);
  const client = contact
    ? contactDisplayName(contact)
    : (quote?.clientName ?? "");
  const email = contact?.email ?? "";

  /**
   * The server's own record of what happened, rather than a sequence inferred
   * from the quote's dates — the reference frontend loads exactly this when
   * the History action is used.
   */
  const historyQuery = useQuery({
    queryKey: ["quote-history", historyId],
    queryFn: () => fetchQuoteHistory(historyId as string),
    enabled: historyId !== null,
  });
  const events = historyQuery.data ?? [];
  const loadingHistory = historyQuery.isLoading;

  return (
    <Dialog
      open={historyId !== null}
      onOpenChange={(open) => !open && setHistoryId(null)}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quote history</DialogTitle>
          <DialogDescription>
            Everything that has happened to this quote since it was raised.
          </DialogDescription>
        </DialogHeader>

        {quote && (
          <div className="space-y-5">
            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium tabular">{quote.number}</p>
                    <Badge variant="secondary">Quote</Badge>
                  </div>
                  <p className="text-2xl font-semibold tracking-tight tabular">
                    {invoiceMoney(quoteAmount(quote))}
                  </p>
                </div>
                {/* The two dates that bound everything in the timeline. */}
                <dl className="space-y-1 text-sm sm:text-right">
                  <div className="flex gap-2 sm:justify-end">
                    <dt className="text-muted-foreground">Quote date</dt>
                    <dd className="tabular">
                      {formatInvoiceDate(quote.issued)}
                    </dd>
                  </div>
                  <div className="flex gap-2 sm:justify-end">
                    <dt className="text-muted-foreground">Expires</dt>
                    <dd className="tabular">
                      {formatInvoiceDate(quote.expiry)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-sm font-medium">{client || "—"}</p>
                {email && (
                  <p className="text-sm text-muted-foreground">{email}</p>
                )}
              </div>
            </div>

            {loadingHistory ? (
              <div className="space-y-3" aria-hidden>
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
                <span
                  className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary"
                  aria-hidden
                >
                  <History className="size-5" />
                </span>
                <p className="text-sm font-medium">Nothing has happened yet</p>
                <p className="max-w-[38ch] text-sm text-muted-foreground">
                  This quote is still a draft. Send it to the client and its
                  history starts here — when it went out, when they opened it,
                  and what they decided.
                </p>
              </div>
            ) : (
              <ol className="space-y-0">
                {events.map((event, index) => (
                  <TimelineEvent
                    key={`${event.kind}-${index}`}
                    event={event}
                    last={index === events.length - 1}
                  />
                ))}
              </ol>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * One event: the marker, and what it means.
 *
 * The connector is drawn by the row rather than the list, so it can stop at the
 * last event instead of trailing off under it — a line that continues past the
 * final marker reads as a step still to come.
 */
function TimelineEvent({ event, last }: { event: QuoteEvent; last: boolean }) {
  const { icon: Icon, tone } = EVENT_MARKER[event.kind];
  const done = event.status === "completed";
  const timeZone = useBusinessTimeZone();

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-full",
            // Filled once it's happened; a step still ahead is outlined, so
            // the timeline reads as a progress bar rather than a log of
            // things that all took place.
            done ? tone : "border-2 border-border bg-background",
          )}
          aria-hidden
        >
          {done && <Icon className="size-3.5" strokeWidth={2.5} />}
        </span>
        {!last && <span className="w-px flex-1 bg-border" aria-hidden />}
      </div>

      <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-5")}>
        <p
          className={cn(
            "text-sm leading-6",
            done ? "font-medium" : "text-muted-foreground",
          )}
        >
          {event.label}
        </p>
        <p className="text-xs text-muted-foreground tabular">
          {event.at
            ? formatQuoteEventTime(event.at, timeZone)
            : done
              ? "—"
              : event.status === "pending"
                ? "Pending"
                : "Upcoming"}
        </p>
        {event.detail && (
          <p className="mt-1 text-sm text-muted-foreground">{event.detail}</p>
        )}
      </div>
    </li>
  );
}

/**
 * Every event that has happened gets a filled marker — it's done, and a hollow
 * one would read as pending. The icon carries what kind of done it was, because
 * a green tick against "Declined" says the wrong thing.
 */
const EVENT_MARKER: Record<QuoteEventKind, { icon: LucideIcon; tone: string }> =
  {
    created: { icon: Check, tone: "bg-primary text-primary-foreground" },
    sent: { icon: Check, tone: "bg-primary text-primary-foreground" },
    viewed: { icon: Check, tone: "bg-primary text-primary-foreground" },
    accepted: { icon: Check, tone: "bg-success text-success-foreground" },
    converted: { icon: FileText, tone: "bg-success text-success-foreground" },
    rejected: {
      icon: X,
      tone: "bg-destructive text-destructive-foreground",
    },
    expired: { icon: Clock, tone: "bg-warning text-warning-foreground" },
  };
