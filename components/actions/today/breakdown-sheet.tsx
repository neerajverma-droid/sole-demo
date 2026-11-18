"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSetAtom } from "jotai";
import { Check, Eye, Loader2, MoreHorizontal, Paperclip, Send, X as XIcon } from "lucide-react";
import { toast } from "sonner";

import { useOpenBankMatch } from "@/components/actions/unibox/bank-feed-card";
import { TodaySheet } from "@/components/actions/today/today-sheet";
import { AttachReceiptDialog } from "@/components/expenses/expense-dialogs";
import { MatchTransactionDialog, type MatchableEntity } from "@/components/shared/match-transaction-dialog";
import { ReviewSuggestionsDialog } from "@/components/transactions/review-suggestions-dialog";
import { AiMatchButton } from "@/components/ui/ai-match-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApproveTransaction, useRejectSuggestions } from "@/hooks/use-bank-transactions-query";
import { uniboxKey, useRefreshUnibox } from "@/hooks/use-unibox-query";
import { apiErrorMessage } from "@/lib/api-error";
import { attachExpenseAtom } from "@/lib/atoms";
import type { Expense } from "@/lib/expenses";
import { markInvoicePaidWithCashApi } from "@/lib/invoices";
import { cardText, tickedItems, type DeckCard, type DeckItem } from "@/lib/quick-actions-today";
import { toNumber } from "@/lib/unibox";
import { runGetPaidAction } from "@/lib/unibox-actions";
import { showSampleNotice } from "@/lib/unibox-demo";
import { GET_PAID_SUCCESS, quoteIdOf, remainingOf, uniboxMoney, type GetPaidActionKey } from "@/lib/unibox-rules";
import { cn } from "@/lib/utils";

/**
 * A card's breakdown: every item behind it, with the app's existing actions
 * for each — the same ones its module offers anywhere else — and, on a batch
 * card, the ticks and the one button that acts on them together.
 */
export function BreakdownSheet({
  card,
  unticked,
  onOpenChange,
  onToggle,
  onToggleAll,
  onApprove,
}: {
  /** The card shown, or null when closed. */
  card: DeckCard | null;
  unticked: ReadonlySet<string>;
  onOpenChange: (open: boolean) => void;
  onToggle: (item: DeckItem) => void;
  onToggleAll: (ticked: boolean) => void;
  /** The footer's approve — the same as swiping right. */
  onApprove: () => void;
}) {
  const router = useRouter();
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const open = card !== null;

  if (!card) {
    return (
      <>
        <TodaySheet open={false} onOpenChange={onOpenChange} title="">
          {null}
        </TodaySheet>
        <ReviewSuggestionsDialog open={reviewOpen} onOpenChange={setReviewOpen} />
      </>
    );
  }

  const text = cardText(card, unticked);
  const selected = tickedItems(card, unticked);
  const all = card.items.length;

  const footer = card.single ? (
    <Button onClick={() => router.push(card.single!.href)}>{card.single.yes}</Button>
  ) : card.batch ? (
    <>
      <Button disabled={selected.length === 0} onClick={onApprove}>
        {text.yes}
      </Button>
      {card.kind === "approve-categories" ? (
        <Button variant="outline" onClick={() => setReviewOpen(true)}>
          Review in detail
        </Button>
      ) : null}
    </>
  ) : undefined;

  return (
    <>
      <TodaySheet
        open={open}
        onOpenChange={onOpenChange}
        title={text.title}
        description={
          card.single
            ? card.single.text
            : card.batch
              ? "Prepared by Sole. Untick anything to leave out."
              : "Each one needs its own decision — match them one at a time."
        }
        footer={footer}
      >
        {card.single ? null : (
          <div className="space-y-3">
            <div>
              {card.batch ? (
                <label className="flex cursor-pointer items-center gap-3 py-2.5 text-sm font-semibold">
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer accent-primary"
                    checked={selected.length === all}
                    onChange={(event) => onToggleAll(event.target.checked)}
                  />
                  Select all ({selected.length} of {all})
                </label>
              ) : null}
              <ul>
                {card.items.map((item) => (
                  <BreakdownRow
                    key={item.id}
                    card={card}
                    item={item}
                    ticked={!unticked.has(item.id)}
                    onToggle={() => onToggle(item)}
                  />
                ))}
              </ul>
            </div>
            {text.summary ? (
              <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground tabular">{text.summary}</p>
            ) : null}
            {card.note ? <p className="text-xs text-muted-foreground">{card.note}</p> : null}
          </div>
        )}
      </TodaySheet>
      <ReviewSuggestionsDialog open={reviewOpen} onOpenChange={setReviewOpen} />
      {/* Once per sheet: every row's "Add receipt" opens this one dialog. */}
      {card.kind === "match-expenses" ? <AttachReceiptDialog /> : null}
    </>
  );
}

const signedMoney = (card: DeckCard, item: DeckItem) => {
  const signed = card.kind === "match-bank" || card.kind === "approve-categories";
  return `${item.amount < 0 ? "-" : signed ? "+" : ""}${uniboxMoney(Math.abs(item.amount))}`;
};

/** One item: its tick (on a batch card), what it is, and its existing actions. */
function BreakdownRow({
  card,
  item,
  ticked,
  onToggle,
}: {
  card: DeckCard;
  item: DeckItem;
  ticked: boolean;
  onToggle: () => void;
}) {
  const body = (
    <span className="min-w-0 flex-1">
      <span className="block truncate">{item.label}</span>
      <small className="block truncate text-xs text-muted-foreground">{item.sub}</small>
    </span>
  );
  const amount = (
    <b className={cn("shrink-0 font-semibold tabular", card.batch && !ticked && "text-muted-foreground line-through")}>
      {signedMoney(card, item)}
    </b>
  );

  return (
    <li className="flex items-center gap-3 border-t border-border py-2.5 text-sm">
      {card.batch ? (
        <label className={cn("flex min-w-0 flex-1 cursor-pointer items-center gap-3", !ticked && "text-muted-foreground")}>
          <input
            type="checkbox"
            className="size-4 shrink-0 cursor-pointer accent-primary"
            checked={ticked}
            onChange={onToggle}
          />
          {body}
          {amount}
        </label>
      ) : (
        <>
          {body}
          {amount}
        </>
      )}
      <RowActions card={card} item={item} />
    </li>
  );
}

/** The existing actions for one item, by what it is. */
function RowActions({ card, item }: { card: DeckCard; item: DeckItem }) {
  const source = item.source;
  if (source.kind === "invoice" || source.kind === "quote") return <DocumentActions card={card} item={item} />;
  if (source.kind === "suggestion") return <SuggestionActions item={item} />;
  if (source.kind === "bank") return <BankActions item={item} />;
  return <ExpenseActions item={item} />;
}

/** Invoices and quotes: do it now, mark paid, or open it — as the Get paid card does. */
function DocumentActions({ card, item }: { card: DeckCard; item: DeckItem }) {
  const refresh = useRefreshUnibox();
  const [busy, setBusy] = React.useState(false);
  const source = item.source;
  if (source.kind !== "invoice" && source.kind !== "quote") return null;
  const isQuote = source.kind === "quote";

  const nowKey: GetPaidActionKey | null =
    card.kind === "remind"
      ? "follow_up"
      : card.kind === "send-invoices"
        ? "send_invoice"
        : card.kind === "send-quotes"
          ? "send_quote"
          : card.kind === "convert-quotes"
            ? "convert_quote"
            : null;
  const nowLabel = { follow_up: "Follow up now", send_invoice: "Send now", send_quote: "Send now", send_quote_again: "Send now", convert_quote: "Convert to invoice" };

  const run = async (action: () => Promise<string>, fallback: string) => {
    if (item.demo) {
      showSampleNotice();
      return;
    }
    setBusy(true);
    try {
      toast.success((await action()) || fallback);
      await refresh("invoices", "quotes", "priorities", "progress");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Unable to complete this action."));
    } finally {
      setBusy(false);
    }
  };

  const href = isQuote ? `/quotes/${quoteIdOf(source.row)}` : `/invoices/${source.row.id}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" aria-label={`Actions for ${item.label}`} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {nowKey ? (
          <DropdownMenuItem onSelect={() => void run(() => runGetPaidAction(nowKey, source.row), GET_PAID_SUCCESS[nowKey])}>
            <Send className="text-muted-foreground" />
            {nowLabel[nowKey]}
          </DropdownMenuItem>
        ) : null}
        {!isQuote && card.kind === "remind" ? (
          <DropdownMenuItem
            onSelect={() =>
              void run(async () => {
                await markInvoicePaidWithCashApi(String(source.row.id));
                return "";
              }, "Invoice marked as paid with cash successfully!")
            }
          >
            <Check className="text-muted-foreground" />
            Mark as paid with cash
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={href}>
            <Eye className="text-muted-foreground" />
            {isQuote ? "Open the quote" : "Open the invoice"}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** An AI-categorised bank line: approve or reject just this one, as the review does. */
function SuggestionActions({ item }: { item: DeckItem }) {
  const approve = useApproveTransaction();
  const reject = useRejectSuggestions();
  const refresh = useRefreshUnibox();
  if (item.source.kind !== "suggestion") return null;
  const { approval, row } = item.source;
  const busy = approve.isPending || reject.isPending;
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-success hover:bg-success/10 hover:text-success"
        aria-label={`Approve ${item.label}`}
        disabled={busy}
        onClick={() => approve.mutate(approval, { onSettled: () => void refresh("bankTransactions", "priorities") })}
      >
        {approve.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Reject the suggestion for ${item.label}`}
        disabled={busy}
        onClick={() => reject.mutate([row.id])}
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  );
}

/** An unmatched bank line: the bank feed's own match dialog. */
function BankActions({ item }: { item: DeckItem }) {
  const openMatch = useOpenBankMatch();
  if (item.source.kind !== "bank") return null;
  const row = item.source.row;
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 shrink-0 rounded-md bg-primary/10 px-2.5 text-xs text-primary hover:bg-primary/15 hover:text-primary"
      onClick={() => (item.demo ? showSampleNotice() : openMatch(row))}
    >
      Match
    </Button>
  );
}

/** An unmatched expense: AI Match / Match, and Add receipt — as the Expenses card has. */
function ExpenseActions({ item }: { item: DeckItem }) {
  const setAttach = useSetAtom(attachExpenseAtom);
  const [matching, setMatching] = React.useState<MatchableEntity | null>(null);
  if (item.source.kind !== "expense") return null;
  const row = item.source.row;
  const suggestions = toNumber(row.possible_match);

  const openMatch = () => {
    if (item.demo) {
      showSampleNotice();
      return;
    }
    setMatching({
      id: item.id,
      title: item.label,
      subtitle: item.sub,
      amount: toNumber(row.price),
      remainingAmount: remainingOf(row),
    });
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      {suggestions > 0 ? (
        <AiMatchButton suggestions={suggestions} onOpen={openMatch} />
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 rounded-md bg-primary/10 px-2.5 text-xs text-primary hover:bg-primary/15 hover:text-primary"
          onClick={openMatch}
        >
          Match
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`More for ${item.label}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onSelect={() =>
              item.demo
                ? showSampleNotice()
                : // The attach dialog reads only the id and the label.
                  setAttach({ id: item.id, description: item.label } as Expense)
            }
          >
            <Paperclip className="text-muted-foreground" />
            Add receipt
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/expenses">
              <Eye className="text-muted-foreground" />
              Open expenses
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MatchTransactionDialog
        type="expense"
        noun="expense"
        open={matching !== null}
        entity={matching}
        onClose={() => setMatching(null)}
        invalidateQueryKeys={[uniboxKey("expenses"), uniboxKey("priorities"), uniboxKey("progress"), ["expenses"]]}
      />
    </div>
  );
}
