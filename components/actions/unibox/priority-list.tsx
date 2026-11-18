"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Eye,
  FileText,
  Landmark,
  Loader2,
  MoreHorizontal,
  ReceiptText,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { AnimatedRows, type AnimatedRow } from "@/components/actions/unibox/animated-rows";
import { useOpenBankMatch } from "@/components/actions/unibox/bank-feed-card";
import {
  MatchTransactionDialog,
  type MatchableEntity,
} from "@/components/shared/match-transaction-dialog";
import { ReviewSuggestionsDialog } from "@/components/transactions/review-suggestions-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { uniboxKey, useRefreshUnibox } from "@/hooks/use-unibox-query";
import { apiErrorMessage } from "@/lib/api-error";
import { markInvoicePaidWithCashApi, sendInvoiceReminderApi } from "@/lib/invoices";
import {
  toNumber,
  type PriorityAction,
  type PriorityItem,
  type QuickStartKey,
  type UniboxMatchable,
} from "@/lib/unibox";
import { isDemoRow, showSampleNotice } from "@/lib/unibox-demo";
import {
  PRIORITY_ERRORS,
  PRIORITY_SUCCESS,
  TOP_N,
  describePriority,
  matchableSub,
  matchableTitle,
  priorityActions,
  priorityRoute,
  remainingOf,
} from "@/lib/unibox-rules";
import { cn } from "@/lib/utils";

export { TOP_N };

const QUICK_START_ICON: Record<QuickStartKey, LucideIcon> = {
  first_contact: UserPlus,
  first_invoice: ReceiptText,
  customise_sales_documents: FileText,
};

/** The shape every row in the five shares, whatever produced it. */
function Row({
  icon: Icon,
  iconTone,
  title,
  chip,
  chipTone,
  status,
  statusTone,
  amount,
  amountTone,
  action,
  menu,
}: {
  icon: LucideIcon;
  iconTone: string;
  title: string;
  chip: string;
  chipTone?: string;
  status: string;
  statusTone?: string;
  amount?: string | null;
  amountTone?: string;
  action: React.ReactNode;
  menu?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className={cn("grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4", iconTone)}
        aria-hidden
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate text-[13px] font-medium">{title}</p>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold",
              chipTone ?? "bg-muted text-muted-foreground",
            )}
          >
            {chip}
          </span>
        </div>
        <p className={cn("truncate text-[11.5px] text-muted-foreground", statusTone)}>{status}</p>
      </div>
      {amount ? (
        <span className={cn("hidden shrink-0 whitespace-nowrap text-[13px] font-semibold tabular sm:inline", amountTone)}>
          {amount}
        </span>
      ) : null}
      {action}
      {menu ?? <span className="hidden size-7 shrink-0 sm:block" aria-hidden />}
    </div>
  );
}

export function PriorityList({
  loading,
  quickStart,
  aiCount,
  items,
  onActed,
  onFailed,
}: {
  loading: boolean;
  quickStart: { key: QuickStartKey; title: string; description: string; href: string }[];
  /** Bank lines with an AI category waiting for review. */
  aiCount: number;
  /** The server's priorities, already cut to the slots left after the rows above. */
  items: PriorityItem[];
  /** An action went through on this priority — the screen counts it once it leaves the list. */
  onActed: (id: string) => void;
  /** It didn't — a run of clears is broken. */
  onFailed: () => void;
}) {
  const router = useRouter();
  const refresh = useRefreshUnibox();
  const openBankMatch = useOpenBankMatch();
  const [pending, setPending] = React.useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [expenseMatch, setExpenseMatch] = React.useState<MatchableEntity | null>(null);
  /**
   * Done here, gone at once — the row starts leaving the moment the server
   * says yes, not when the refetch lands. Released after the refetch, so a
   * priority the server still holds (a reminder it wants chased again) comes
   * back rather than vanishing on a guess.
   */
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(() => new Set());

  const run = async (item: PriorityItem, action: PriorityAction) => {
    // A sample row has no record on the server to act on.
    if (isDemoRow(item)) {
      showSampleNotice();
      return;
    }
    const data = item.data ?? {};
    const route = priorityRoute(item, action);

    switch (route.kind) {
      case "bank-match":
        onActed(item.id);
        openBankMatch(data, item.entity_id);
        return;
      case "expense-match":
        // The old page sent every expense action to the expenses list; matching
        // has a dialog of its own here, so it opens over the list instead.
        onActed(item.id);
        setExpenseMatch({
          id: String(data.expense_id ?? item.entity_id ?? data.id),
          title: matchableTitle("expense", data as UniboxMatchable),
          subtitle: matchableSub("expense", data as UniboxMatchable),
          amount: toNumber(data.price),
          remainingAmount: remainingOf(data),
        });
        return;
      case "expense-open":
        router.push(route.href);
        return;
      case "none":
        return;
    }

    setPending(`${item.id}:${action.key}`);
    try {
      if (route.kind === "invoice-reminder") await sendInvoiceReminderApi(route.invoiceId);
      else await markInvoicePaidWithCashApi(route.invoiceId);
      toast.success(PRIORITY_SUCCESS[route.kind]);
      onActed(item.id);
      setHidden((current) => new Set(current).add(item.id));
    } catch (error) {
      onFailed();
      toast.error(apiErrorMessage(error, PRIORITY_ERRORS[route.kind]));
    } finally {
      // Refreshed either way, as the old page did — a failure can still mean
      // the server moved on.
      await refresh("priorities", "progress", "invoices");
      setPending(null);
      setHidden((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <ul className="divide-y divide-border" aria-busy>
        {Array.from({ length: TOP_N }, (_, row) => (
          <li key={row} className="flex items-center gap-3 py-2">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
            <Skeleton className="h-7 w-24 rounded-md" />
          </li>
        ))}
      </ul>
    );
  }

  /*
   * Tinted at rest, solid only while the button itself is hovered or keyboard-
   * focused. Not the row: lighting a button because the pointer is somewhere
   * on its line made several look pressed at once, and `focus-within` kept a
   * clicked one solid long after.
   */
  const tintedAction = cn(
    "h-7 min-w-[96px] shrink-0 gap-1 rounded-md border-0 px-2.5 text-xs shadow-none [&_svg]:size-3.5",
    "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground",
    "focus-visible:bg-primary focus-visible:text-primary-foreground",
  );

  const quickStartRows: AnimatedRow[] = quickStart.slice(0, TOP_N).map((suggestion) => ({
    key: `quick-start:${suggestion.key}`,
    node: (
      <Row
        icon={QUICK_START_ICON[suggestion.key]}
        iconTone="bg-primary/10 text-primary"
        title={suggestion.title}
        chip="Getting started"
        chipTone="bg-primary/10 text-primary"
        status={suggestion.description}
        action={
          <Button asChild size="sm" variant="ghost" className={tintedAction}>
            <Link href={suggestion.href}>
              Start
              <ArrowRight />
            </Link>
          </Button>
        }
      />
    ),
  }));

  const aiRows: AnimatedRow[] =
    aiCount > 0
      ? [
          {
            key: "ai-suggestions",
            node: (
              <Row
                icon={Sparkles}
                iconTone="bg-primary/10 text-primary"
                title={`${aiCount} AI category ${aiCount === 1 ? "suggestion" : "suggestions"} to review`}
                chip="Bank"
                status="Categories suggested for your bank feed — approve them in one go"
                action={
                  <Button size="sm" variant="ghost" className={tintedAction} onClick={() => setReviewOpen(true)}>
                    Review
                  </Button>
                }
              />
            ),
          },
        ]
      : [];

  const priorityRows: AnimatedRow[] = items
    .filter((item) => !hidden.has(item.id))
    .map((item) => {
      const info = describePriority(item, Date.now());
      const [primary, ...secondary] = priorityActions(item);
      const busy = pending?.startsWith(`${item.id}:`) ?? false;
      const primaryPending = primary && pending === `${item.id}:${primary.key}`;
      return {
        key: `priority:${item.id}`,
        node: (
          <Row
            icon={info.overdue ? AlertTriangle : info.bank ? Landmark : FileText}
            iconTone={info.overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}
            title={info.title}
            chip={info.chip}
            status={info.status}
            statusTone={info.overdue ? "text-destructive" : undefined}
            amount={info.amountText}
            amountTone={info.credit ? "text-success" : undefined}
            action={
              primary ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className={tintedAction}
                  disabled={busy}
                  onClick={() => run(item, primary)}
                >
                  {primaryPending ? <Loader2 className="animate-spin" /> : null}
                  {primaryPending ? "Please wait" : primary.label}
                </Button>
              ) : null
            }
            menu={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground"
                    aria-label={`More actions for ${info.title}`}
                    disabled={busy}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {secondary.map((action) => (
                    <DropdownMenuItem key={action.key} onSelect={() => run(item, action)}>
                      <Check className="text-muted-foreground" />
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                  {secondary.length > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem asChild>
                    <Link
                      href={info.href}
                      onClick={(event) => {
                        if (!isDemoRow(item)) return;
                        event.preventDefault();
                        showSampleNotice();
                      }}
                    >
                      <Eye className="text-muted-foreground" />
                      {info.openLabel}
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        ),
      };
    });

  return (
    <>
      <AnimatedRows rows={[...quickStartRows, ...aiRows, ...priorityRows]} />

      <ReviewSuggestionsDialog
        open={reviewOpen}
        onOpenChange={(open) => {
          setReviewOpen(open);
          if (!open) void refresh("priorities", "bankTransactions", "progress");
        }}
      />
      <MatchTransactionDialog
        type="expense"
        noun="expense"
        open={expenseMatch !== null}
        entity={expenseMatch}
        onClose={() => setExpenseMatch(null)}
        invalidateQueryKeys={[uniboxKey("priorities"), uniboxKey("expenses"), uniboxKey("progress"), ["expenses"]]}
      />
    </>
  );
}
