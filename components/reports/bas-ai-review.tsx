"use client";

import * as React from "react";
import {
  Check,
  ChevronDown,
  Pencil,
  RotateCw,
  Save,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { aiGradientClassName } from "@/components/ui/ai-match-button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Shimmer } from "@/components/ui/shimmer";
import { STAT_TONES } from "@/components/ui/stat-cards";
import {
  HUG_COLUMN,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BasSavedReports } from "@/components/reports/bas-saved-reports";
import { CELL, HEAD_TINT, RULE } from "@/components/reports/report-table-tokens";
import {
  useBasReviewMutation,
  useSaveBasReviewReport,
} from "@/hooks/use-bas-review-mutation";
import { useFiscalYearStart } from "@/hooks/use-fiscal-year-start";
import { apiErrorMessage } from "@/lib/api-error";
import { basDate } from "@/lib/bas-report";
import {
  ACTION_LABEL,
  SEVERITY_LABEL,
  groupFindings,
  readiness,
  reviewHeadline,
  sourceHref,
  type BasReview,
  type Decision,
  type Decisions,
  type FindingSeverity,
  type ReviewFinding,
} from "@/lib/bas-review";
import { reportMoney } from "@/lib/report-periods";
import { cn } from "@/lib/utils";

const SEVERITY_BADGE: Record<FindingSeverity, "danger" | "warning" | "outline"> = {
  high: "danger",
  medium: "warning",
  low: "outline",
};

/**
 * "Review before you lodge" — the AI check that sits above the BAS report.
 *
 * Built from the same pieces as the report's own sections (a bordered card with
 * a ruled header strip, the shared table tokens, the app's warning tone and AI
 * treatment) so it reads as part of the page rather than a bolt-on.
 *
 * Opt-in: each run is an AI call, so nothing happens until the user asks, and a
 * change of period clears the result (it was a review of different numbers).
 * The AI only advises, the way MYOB's AI BAS raises a warning: it never edits
 * the books. Each finding names the transactions, says what to check and, for
 * an expense, suggests the change; "Edit" opens the transaction to make it.
 *
 * Kept out of the print frame: it's a working aid, not part of the report.
 */
export function BasAiReview({ range }: { range: { from: string; to: string } }) {
  const review = useBasReviewMutation();
  const { mutate, reset } = review;
  const [decisions, setDecisions] = React.useState<Decisions>({});

  // A review describes one period's numbers. Another period starts blank.
  React.useEffect(() => {
    reset();
    setDecisions({});
  }, [range.from, range.to, reset]);

  const run = () => {
    setDecisions({});
    mutate(range);
  };

  const decide = (id: string, decision: Decision) =>
    setDecisions((current) => ({ ...current, [id]: decision }));

  const result = review.data;
  const subtitle = result
    ? `${basDate(result.period.from)} – ${basDate(result.period.to)} · ${result.coverage.reviewed.toLocaleString("en-AU")} transactions reviewed`
    : "AI checks this period before the numbers go to the tax office";

  return (
    <section
      aria-label="Review before you lodge"
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm print:hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* The AI tile, as on the Transactions suggestions banner. */}
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg text-primary",
              "bg-[radial-gradient(circle_at_35%_30%,hsl(var(--primary)/0.28),hsl(var(--primary)/0.10))]",
            )}
            aria-hidden
          >
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Review before you lodge</h2>
            <p className="text-xs text-muted-foreground tabular">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BasSavedReports />
          {result && (
            <Button size="sm" variant="outline" onClick={run}>
              <RotateCw />
              Run again
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {review.isPending ? (
          <Running />
        ) : review.isError ? (
          <Failed
            message={apiErrorMessage(review.error, "Couldn't review the BAS. Try again.")}
            onRetry={run}
          />
        ) : result ? (
          <Result
            review={result}
            decisions={decisions}
            onDecide={decide}
          />
        ) : (
          <Intro onRun={run} />
        )}
      </div>
    </section>
  );
}

function Intro({ onRun }: { onRun: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Checks this period&apos;s transactions for duplicates, GST that
        doesn&apos;t add up, missing tax invoices, missing categories and items
        that look miscoded.
      </p>
      <Button onClick={onRun} className={aiGradientClassName}>
        <Sparkles />
        Review with AI
      </Button>
    </div>
  );
}

function Running() {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <Shimmer className="h-4 w-2/3 rounded" />
      <Shimmer className="h-24 w-full rounded-lg" />
      <Shimmer className="h-24 w-full rounded-lg" />
      <span className="sr-only">Reviewing your transactions. This can take up to a minute.</span>
    </div>
  );
}

function Failed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Empty>
      <EmptyMedia>
        <TriangleAlert aria-hidden />
      </EmptyMedia>
      <div className="space-y-1">
        <EmptyTitle>Couldn&apos;t review the BAS</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </div>
      <EmptyActions>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </EmptyActions>
    </Empty>
  );
}

/** A notice inside the panel, in the app's own tones: warning for what's wrong, the AI tint for what's next. */
function Note({
  tone,
  children,
  action,
}: {
  tone: "warning" | "info";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-sm text-foreground",
        tone === "warning"
          ? "border-warning/40 bg-warning/10"
          : "border-primary/15 bg-gradient-to-br from-primary/[0.08] via-primary/[0.06] to-violet-500/[0.05]",
      )}
    >
      <p className="flex min-w-0 items-start gap-2">
        {tone === "warning" ? (
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        ) : (
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        )}
        <span>{children}</span>
      </p>
      {action}
    </div>
  );
}

function Result({
  review,
  decisions,
  onDecide,
}: {
  review: BasReview;
  decisions: Decisions;
  onDecide: (id: string, decision: Decision) => void;
}) {
  const groups = groupFindings(review.findings);
  const clean = review.findings.length === 0;
  const ready = readiness(review.findings, decisions);
  const save = useSaveBasReviewReport();
  const [savedId, setSavedId] = React.useState<number | null>(null);

  // Any decision changes what a saved report would say.
  React.useEffect(() => setSavedId(null), [decisions]);

  const saveReport = () =>
    save.mutate(
      { review, decisions },
      {
        onSuccess: ({ id }) => {
          setSavedId(id);
          toast.success("Report saved");
        },
        onError: (error) =>
          toast.error(apiErrorMessage(error, "Couldn't save the report. Try again.")),
      },
    );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-4",
            clean ? STAT_TONES.success : STAT_TONES.warning,
          )}
          aria-hidden
        >
          {clean ? <ShieldCheck /> : <TriangleAlert />}
        </span>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{reviewHeadline(review.counts)}</h3>
          <p className="max-w-2xl text-sm text-muted-foreground">{review.summary}</p>
        </div>
      </div>

      {!clean && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Ready to lodge</span>
            <span className="tabular">{ready}%</span>
          </div>
          <Progress value={ready} aria-label="Review progress" />
        </div>
      )}

      {!review.linking.sourceIds ? (
        <Note tone="warning">
          Couldn&apos;t match these transactions to their records this time, so
          Edit opens a search instead of the exact record. Run the review again.
        </Note>
      ) : review.linking.lookupFailed ? (
        <Note tone="warning">
          Couldn&apos;t look up your expenses this time, so some Edit links open
          a search instead of the exact expense.
        </Note>
      ) : null}

      {review.ai.note && <Note tone="warning">{review.ai.note}</Note>}

      {groups.map((group) => (
        <div key={group.severity} className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            {SEVERITY_LABEL[group.severity]}
            <Badge variant="secondary" className="px-1.5 py-0 tabular">
              {group.findings.length}
            </Badge>
          </h3>
          <ul className="space-y-3">
            {group.findings.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                decision={decisions[finding.id] ?? "pending"}
                onDecide={(decision) => onDecide(finding.id, decision)}
              />
            ))}
          </ul>
        </div>
      ))}

      <div className="-mx-4 -mb-4 flex flex-wrap items-center justify-between gap-3 border-t border-border p-3 sm:-mx-5 sm:-mb-5 sm:px-5">
        <p className="max-w-2xl text-xs text-muted-foreground">
          {review.coverage.total > review.coverage.reviewed
            ? `Reviewed ${review.coverage.reviewed.toLocaleString("en-AU")} of ${review.coverage.total.toLocaleString("en-AU")} transactions. `
            : ""}
          {review.coverage.truncated && "The largest were prioritised. "}A review
          points things out; it doesn&apos;t replace your accountant. Confirm
          anything you&apos;re unsure of before lodging.
        </p>
        <Button
          size="sm"
          onClick={saveReport}
          disabled={save.isPending || savedId !== null}
        >
          {savedId !== null ? <Check /> : <Save />}
          {savedId !== null ? "Saved" : "Save report"}
        </Button>
      </div>
    </div>
  );
}

export function FindingCard({
  finding,
  decision,
  onDecide,
}: {
  finding: ReviewFinding;
  decision: Decision;
  onDecide: (decision: Decision) => void;
}) {
  // A handful of rows are what the user came to see; a long list stays folded.
  const [open, setOpen] = React.useState(finding.rows.length <= 3);
  const hasRows = finding.rows.length > 0;
  const hasSuggestions = finding.suggestions.length > 0;
  const handled = decision !== "pending";
  // Links into Transactions name the year by the business's own financial year.
  const fiscalYearStart = useFiscalYearStart();
  const rowName = (rowId: string) =>
    finding.rows.find((row) => row.id === rowId)?.name || "Transaction";

  return (
    <li
      className={cn(
        "rounded-lg border border-border bg-background transition-opacity",
        handled && "opacity-70",
      )}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={SEVERITY_BADGE[finding.severity]}>
              {ACTION_LABEL[finding.action]}
            </Badge>
            {finding.source === "ai" && (
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="size-3" aria-hidden />
                AI
              </Badge>
            )}
            {finding.impactAmount !== null && finding.impactAmount !== 0 && (
              <span className="text-xs text-muted-foreground tabular">
                about {reportMoney(Math.abs(finding.impactAmount))} of GST
              </span>
            )}
            {handled && (
              <Badge variant={decision === "accepted" ? "success" : "outline"}>
                {decision === "accepted" ? "Done" : "Ignored"}
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium">{finding.title}</p>
          <p className="text-sm text-muted-foreground">{finding.detail}</p>

          {hasSuggestions && (
            <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">
                Suggested change
              </p>
              <ul className="space-y-0.5">
                {finding.suggestions.slice(0, 5).map((suggestion) => (
                  <li key={`${suggestion.rowId}-${suggestion.kind}`} className="tabular">
                    <span className="font-medium">{rowName(suggestion.rowId)}</span>
                    {": "}
                    <span className="text-muted-foreground">{suggestion.current}</span>
                    {" → "}
                    {suggestion.proposed}
                  </li>
                ))}
              </ul>
              {finding.suggestions.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  and {finding.suggestions.length - 5} more
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {handled ? (
              <Button size="sm" variant="ghost" onClick={() => onDecide("pending")}>
                <Undo2 />
                Undo
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => onDecide("accepted")}>
                  <Check />
                  Mark as done
                </Button>
                <Button size="sm" variant="outline" onClick={() => onDecide("rejected")}>
                  Ignore
                </Button>
              </>
            )}
            {hasRows && (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="ml-auto h-8 px-2 text-xs">
                  {open ? "Hide" : "Show"}{" "}
                  {finding.rowCount === 1
                    ? "the transaction"
                    : `${finding.rowCount} transactions`}
                  <ChevronDown
                    className={cn("transition-transform", open && "rotate-180")}
                    aria-hidden
                  />
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </div>
        {hasRows && (
          <CollapsibleContent>
            <div className="border-t border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={cn(HEAD_TINT, HUG_COLUMN, "px-4")}>Date</TableHead>
                    <TableHead className={cn(HEAD_TINT, RULE, "px-4")}>Transaction</TableHead>
                    <TableHead className={cn(HEAD_TINT, RULE, "px-4")}>
                      Client / Supplier
                    </TableHead>
                    <TableHead className={cn(HEAD_TINT, RULE, HUG_COLUMN, "px-4")}>BAS</TableHead>
                    <TableHead className={cn(HEAD_TINT, RULE, "px-4 text-right")}>GST</TableHead>
                    <TableHead className={cn(HEAD_TINT, RULE, "px-4 text-right")}>
                      Inc GST
                    </TableHead>
                    {/* Pinned to the right edge: on a narrow screen the table scrolls
                        sideways, and Edit is the one column that must stay in reach. */}
                    <TableHead className={cn(HEAD_TINT, RULE, HUG_COLUMN, "sticky right-0 z-10 px-4")}>
                      <span className="sr-only">Edit</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {finding.rows.map((row) => {
                    const link = sourceHref(row.source, row, fiscalYearStart);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className={cn(CELL, HUG_COLUMN, "tabular")}>
                          {basDate(row.date)}
                        </TableCell>
                        <TableCell className={cn(CELL, RULE, "min-w-48")}>
                          <p className="font-medium">{row.name || "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.type}
                            {row.category && ` · ${row.category}`}
                          </p>
                        </TableCell>
                        <TableCell className={cn(CELL, RULE)}>{row.party || "—"}</TableCell>
                        <TableCell className={cn(CELL, RULE, HUG_COLUMN)}>
                          <Badge
                            variant={row.code === "Other" ? "secondary" : "outline"}
                            className="font-mono"
                          >
                            {row.code}
                          </Badge>
                        </TableCell>
                        <TableCell className={cn(CELL, RULE, "text-right tabular")}>
                          {reportMoney(row.gst)}
                        </TableCell>
                        <TableCell className={cn(CELL, RULE, "text-right font-medium tabular")}>
                          {reportMoney(row.incGst)}
                        </TableCell>
                        <TableCell
                          className={cn(CELL, RULE, HUG_COLUMN, "sticky right-0 z-10 bg-background")}
                        >
                          <Button asChild variant="outline" size="sm">
                            <Link
                              href={link.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${link.label}: ${row.name || "transaction"}`}
                            >
                              <Pencil />
                              Edit
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {finding.rowCount > finding.rows.length && (
                <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                  Showing {finding.rows.length} of {finding.rowCount}.
                </p>
              )}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </li>
  );
}
