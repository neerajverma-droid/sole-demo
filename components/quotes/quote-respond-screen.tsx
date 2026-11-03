"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CircleAlert, Globe, Mail, Phone, X } from "lucide-react";

import { SoleLogo } from "@/components/layout/sole-logo";
import { useCelebrationConfetti } from "@/components/onboarding/use-celebration-confetti";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  OTHER_REASON,
  QUOTE_RESPOND_MESSAGES,
  acceptPublicQuote,
  fetchPublicQuote,
  formatQtyTypeLabel,
  formatQuoteDate,
  formatQuoteMoney,
  getDepositRequestedAmount,
  getDisplayCurrencyCode,
  getQuoteDisplayTotal,
  isDepositQuote,
  normalizeQuoteItems,
  quoteTaxLabel,
  quoteRespondQueryKey,
  rejectPublicQuote,
  resolveViewState,
  validateRejection,
  type PublicQuote,
  type QuoteRespondViewState,
} from "@/lib/quote-respond";
import { cn } from "@/lib/utils";

const STATE_META: Record<
  QuoteRespondViewState,
  { label: string; variant: "outline" | "success" | "danger" | "warning"; className?: string }
> = {
  pending: {
    label: "Awaiting Response",
    variant: "outline",
    className: "border-primary/20 bg-primary/10 text-primary",
  },
  accepted: { label: "Quote Accepted", variant: "success" },
  rejected: { label: "Quote Rejected", variant: "danger" },
  expired: { label: "Quote Expired", variant: "warning" },
};

/**
 * What a client sees when they open the accept/reject link on an emailed
 * quote. Ported from sole-webapp/pages/quotes/respond.js — same states, same
 * copy, same money maths — onto this app's own surfaces.
 *
 * No account, no app shell: the token in the URL is the only credential. The
 * routes behind it are rate-limited per IP, so the quote is fetched once and
 * re-fetched only after a response lands — never on focus, never on retry.
 */
export function QuoteRespondScreen({ token: rawToken }: { token?: string }) {
  const token = (rawToken ?? "").trim();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: quoteRespondQueryKey(token),
    queryFn: () => fetchPublicQuote(token),
    enabled: Boolean(token),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    staleTime: Infinity,
  });

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [isRejectOpen, setIsRejectOpen] = React.useState(false);
  const [reasonCategory, setReasonCategory] = React.useState("");
  const [reasonText, setReasonText] = React.useState("");
  /** Bumped on each accept so the confetti plays once per acceptance, not on load. */
  const [celebration, setCelebration] = React.useState(0);

  if (!token) {
    return <FatalState message={QUOTE_RESPOND_MESSAGES.invalidLink} />;
  }

  if (query.isPending) {
    return <LoadingState />;
  }

  const quote = query.data;
  if (!quote) {
    return (
      <FatalState
        message={query.error?.message || QUOTE_RESPOND_MESSAGES.loadFailed}
      />
    );
  }

  /**
   * The quote as the server now has it — the page never assumes what a
   * response did to it. A failed refresh leaves the last copy in place and
   * says so, as respond.js does.
   */
  const reloadQuote = async () => {
    const fresh = await fetchPublicQuote(token, QUOTE_RESPOND_MESSAGES.refreshFailed);
    queryClient.setQueryData(quoteRespondQueryKey(token), fresh);
    setIsRejectOpen(false);
  };

  const handleAccept = async () => {
    try {
      setSubmitting(true);
      setError("");
      await acceptPublicQuote(token);
      setCelebration((count) => count + 1);
      toast.success("Quote accepted");
      await reloadQuote();
    } catch (submitError) {
      setError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : QUOTE_RESPOND_MESSAGES.acceptFailed,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    const validationError = validateRejection(reasonCategory, reasonText);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      setSubmitting(true);
      setError("");
      await rejectPublicQuote({ token, reasonCategory, reasonText });
      toast.success("Response recorded");
      await reloadQuote();
    } catch (submitError) {
      setError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : QUOTE_RESPOND_MESSAGES.rejectFailed,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const viewState = resolveViewState(quote);

  return (
    <PageFrame>
      {celebration > 0 && <AcceptConfetti key={celebration} />}

      <Card className="overflow-hidden">
        <QuoteHeader quote={quote} viewState={viewState} />

        <div className="space-y-5 p-5 sm:p-8">
          {error && <ErrorAlert message={error} />}

          <QuoteBody quote={quote} />

          <Separator />

          {viewState === "pending" ? (
            <section aria-labelledby="quote-respond-actions">
              <h2 id="quote-respond-actions" className="text-base font-semibold">
                Choose your response
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Accept this quote or let us know why you&apos;re declining it.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button type="button" onClick={handleAccept} disabled={submitting}>
                  {submitting ? (
                    "Please wait..."
                  ) : (
                    <>
                      <Check aria-hidden />
                      Accept Quote
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    setError("");
                    setIsRejectOpen((open) => !open);
                  }}
                  disabled={submitting}
                  aria-expanded={isRejectOpen}
                  aria-controls="quote-reject-form"
                >
                  <X aria-hidden />
                  {isRejectOpen ? "Cancel Reject" : "Reject Quote"}
                </Button>
              </div>

              {isRejectOpen && (
                <RejectForm
                  options={quote.rejection_reason_options ?? []}
                  reasonCategory={reasonCategory}
                  reasonText={reasonText}
                  submitting={submitting}
                  onReasonCategoryChange={setReasonCategory}
                  onReasonTextChange={setReasonText}
                  onSubmit={handleReject}
                />
              )}
            </section>
          ) : (
            <ReadOnlyOutcome quote={quote} viewState={viewState} />
          )}
        </div>
      </Card>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        This page is secured and personalized for your quote response.
      </p>
    </PageFrame>
  );
}

/* ------------------------------------------------------------------ *
 * Frame and fallback states                                            *
 * ------------------------------------------------------------------ */

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-muted/30 px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex justify-center sm:justify-start">
          <SoleLogo className="h-7" />
        </div>
        {children}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <PageFrame>
      <Card className="overflow-hidden" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your quote...</span>
        <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:justify-between sm:p-8">
          <div className="space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-36 rounded-full" />
          </div>
          <Skeleton className="h-28 w-full rounded-lg sm:w-72" />
        </div>
        <div className="space-y-5 p-5 sm:p-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-[68px] rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-40 w-full rounded-lg" />
          <div className="flex gap-3">
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-36" />
          </div>
        </div>
      </Card>
    </PageFrame>
  );
}

function FatalState({ message }: { message: string }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/30 p-6">
      <SoleLogo className="h-8" />
      <Empty className="w-full max-w-lg">
        <EmptyMedia className="bg-destructive/10 text-destructive">
          <CircleAlert aria-hidden />
        </EmptyMedia>
        <EmptyTitle>Quote Response</EmptyTitle>
        <EmptyDescription className="text-destructive" role="alert">
          {message}
        </EmptyDescription>
      </Empty>
    </div>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="bg-destructive/5">
      <CircleAlert aria-hidden className="size-4" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** Mounted once per acceptance; the hook fires on mount and cleans up after. */
function AcceptConfetti() {
  useCelebrationConfetti();
  return null;
}

/* ------------------------------------------------------------------ *
 * Quote                                                                *
 * ------------------------------------------------------------------ */

function QuoteHeader({
  quote,
  viewState,
}: {
  quote: PublicQuote;
  viewState: QuoteRespondViewState;
}) {
  const stateMeta = STATE_META[viewState];
  const provider = quote.provider;
  const hasProvider = Boolean(provider?.business_name || provider?.name || provider?.email);

  return (
    <div className="flex flex-col gap-5 border-b border-border bg-primary/[0.04] p-5 sm:flex-row sm:items-start sm:justify-between sm:p-8">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Quote Response
        </p>
        <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
          {quote.quote_no || "Quote"}
        </h1>
        {quote.client?.name && (
          <p className="mt-1 text-sm text-muted-foreground">{quote.client.name}</p>
        )}
        <Badge
          variant={stateMeta.variant}
          className={cn("mt-4 gap-2 rounded-full px-3 py-1", stateMeta.className)}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
          {stateMeta.label}
        </Badge>
      </div>

      {hasProvider && (
        <div className="w-full rounded-lg border border-border bg-card p-4 shadow-sm sm:w-auto sm:min-w-64 sm:max-w-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            From
          </p>
          {provider?.business_name && (
            <p className="mt-2 break-words text-base font-semibold">{provider.business_name}</p>
          )}
          {provider?.name && (
            <p className="mt-0.5 break-words text-sm text-muted-foreground">{provider.name}</p>
          )}
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            {provider?.email && (
              <ContactLine icon={<Mail aria-hidden />} value={provider.email} />
            )}
            {provider?.phone && (
              <ContactLine icon={<Phone aria-hidden />} value={provider.phone} />
            )}
            {provider?.website && (
              <ContactLine icon={<Globe aria-hidden />} value={provider.website} />
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function ContactLine({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <li className="flex min-w-0 items-center gap-2 [&_svg]:size-3.5 [&_svg]:shrink-0">
      {icon}
      <span className="truncate" title={value}>
        {value}
      </span>
    </li>
  );
}

function QuoteBody({ quote }: { quote: PublicQuote }) {
  const currency = getDisplayCurrencyCode(quote);
  const items = normalizeQuoteItems(quote);

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCell label="Quote Date" value={formatQuoteDate(quote.quote_date)} />
        <SummaryCell label="Valid Till" value={formatQuoteDate(quote.valid_till)} />
        <SummaryCell
          label="Total"
          value={formatQuoteMoney(currency, getQuoteDisplayTotal(quote))}
          highlight
          className="col-span-2 sm:col-span-1"
        />
      </dl>

      {quote.description && (
        <div className="rounded-lg border border-border bg-muted/40 px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Description
          </p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6">{quote.description}</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Items</TableHead>
                <TableHead className={cn(HUG_COLUMN, "text-right")}>Qty</TableHead>
                <TableHead className={cn(HUG_COLUMN, "text-right")}>Rate</TableHead>
                <TableHead className={HUG_COLUMN}>Qty Type</TableHead>
                <TableHead className={cn(HUG_COLUMN, "text-right")}>{quoteTaxLabel(quote)}</TableHead>
                <TableHead className={cn(HUG_COLUMN, "text-right")}>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="min-w-48 font-medium">{item.name}</TableCell>
                  <TableCell className={cn(HUG_COLUMN, "text-right tabular-nums")}>
                    {item.qty || "—"}
                  </TableCell>
                  <TableCell className={cn(HUG_COLUMN, "text-right tabular-nums")}>
                    {formatQuoteMoney(currency, item.rate)}
                  </TableCell>
                  <TableCell className={HUG_COLUMN}>{formatQtyTypeLabel(item.qtyType)}</TableCell>
                  <TableCell className={cn(HUG_COLUMN, "text-right tabular-nums")}>
                    {formatQuoteMoney(currency, item.gst)}
                  </TableCell>
                  <TableCell className={cn(HUG_COLUMN, "text-right font-medium tabular-nums")}>
                    {formatQuoteMoney(currency, item.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {isDepositQuote(quote) && (
        <div className="rounded-lg border border-primary/20 border-l-4 border-l-primary bg-primary/5 px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">
            Deposit Request
          </p>
          <p className="mt-2 text-lg font-semibold tabular-nums text-primary">
            {formatQuoteMoney(currency, getDepositRequestedAmount(quote))} requested
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Due: {formatQuoteDate(quote.deposit_due_date)}
          </p>
        </div>
      )}
    </>
  );
}

function SummaryCell({
  label,
  value,
  highlight = false,
  className,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3.5",
        highlight ? "border-primary/20 bg-primary/5" : "border-border bg-muted/40",
        className,
      )}
    >
      <dt
        className={cn(
          "text-xs font-medium uppercase tracking-[0.13em]",
          highlight ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1.5 text-sm font-semibold tabular-nums",
          highlight && "text-primary",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Responding                                                           *
 * ------------------------------------------------------------------ */

function RejectForm({
  options,
  reasonCategory,
  reasonText,
  submitting,
  onReasonCategoryChange,
  onReasonTextChange,
  onSubmit,
}: {
  options: string[];
  reasonCategory: string;
  reasonText: string;
  submitting: boolean;
  onReasonCategoryChange: (value: string) => void;
  onReasonTextChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const noteRequired = reasonCategory === OTHER_REASON;

  return (
    <div
      id="quote-reject-form"
      className="mt-4 rounded-lg border border-destructive/25 bg-destructive/[0.03] p-5"
    >
      <p className="text-sm font-semibold">Decline this quote</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Please share a reason so we can improve our offer.
      </p>

      <div className="mt-4 space-y-2">
        <Label htmlFor="quote-reject-reason">Reason</Label>
        <Select
          value={reasonCategory}
          onValueChange={onReasonCategoryChange}
          disabled={submitting}
        >
          <SelectTrigger id="quote-reject-reason" className="w-full sm:max-w-sm">
            <SelectValue placeholder="Select a reason" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="quote-reject-note">
          Additional note
          {noteRequired && <span className="text-destructive"> *</span>}
        </Label>
        <Textarea
          id="quote-reject-note"
          rows={3}
          value={reasonText}
          onChange={(event) => onReasonTextChange(event.target.value)}
          placeholder="Add more details if you'd like..."
          disabled={submitting}
          aria-required={noteRequired}
          className="resize-none"
        />
      </div>

      <Button
        type="button"
        variant="destructive"
        className="mt-4"
        onClick={onSubmit}
        disabled={submitting}
      >
        {submitting ? (
          "Please wait..."
        ) : (
          <>
            <X aria-hidden />
            Decline Quote
          </>
        )}
      </Button>
    </div>
  );
}

function ReadOnlyOutcome({
  quote,
  viewState,
}: {
  quote: PublicQuote;
  viewState: QuoteRespondViewState;
}) {
  const accepted = viewState === "accepted";

  return (
    <div
      className={cn(
        "rounded-lg border p-6",
        accepted ? "border-success/20 bg-success/5" : "border-border bg-muted/40",
      )}
      role="status"
    >
      <p className="text-base font-semibold">
        {accepted ? "Quote accepted — thank you!" : "Response recorded"}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {accepted
          ? "We'll be in touch soon to get things moving."
          : "This page is now read-only as the quote has already been responded to or has expired."}
      </p>
      {quote.response_reason_category && (
        <div className="mt-4">
          <Badge variant="outline" className="rounded-full bg-card px-3 py-1 font-medium">
            {quote.response_reason_category}
          </Badge>
          {quote.response_reason_text && (
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
              {quote.response_reason_text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
