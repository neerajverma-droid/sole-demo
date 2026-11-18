"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Banknote, CircleDollarSign, CreditCard, Layers, Paperclip } from "lucide-react";
import { useSetAtom } from "jotai";

import {
  CardAddButton,
  CardRow,
  CardRows,
  RowAction,
  RowMenu,
  UniboxCard,
} from "@/components/actions/unibox/unibox-ui";
import { AttachReceiptDialog } from "@/components/expenses/expense-dialogs";
import {
  MatchTransactionDialog,
  type MatchableEntity,
} from "@/components/shared/match-transaction-dialog";
import { AiMatchButton } from "@/components/ui/ai-match-button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { uniboxKey, useUniboxQuery, type UniboxSection } from "@/hooks/use-unibox-query";
import { attachExpenseAtom } from "@/lib/atoms";
import type { BankMatchType } from "@/lib/bank-match";
import type { Expense } from "@/lib/expenses";
import { toNumber, type UniboxMatchable } from "@/lib/unibox";
import { isDemoRow, showSampleNotice } from "@/lib/unibox-demo";
import {
  matchableId,
  matchableRows,
  matchableSub,
  matchableTitle,
  optionalMoney,
  remainingOf,
} from "@/lib/unibox-rules";

/*
 * Expenses, Assets, Liabilities and Equity — four cards that are one card.
 *
 * Each lists up to five records not yet reconciled against the bank feed and
 * offers to match them: "AI Match" when the feed has already found candidates
 * (`possible_match`), plain "Match" otherwise. Both open the shared possible-
 * match dialog — sole-webapp's `PossibleMatchTransactionNew` — on that
 * record's own endpoints. The header's add action goes to the module's own
 * create form, which in this app is a page rather than a modal.
 */

type Kind = {
  section: Extract<UniboxSection, "expenses" | "assets" | "liabilities" | "equity">;
  type: Extract<BankMatchType, "expense" | "asset" | "liability" | "equity">;
  noun: string;
  title: string;
  icon: LucideIcon;
  iconTone?: string;
  add: { label: string; href: string };
  empty: string;
  /** The module's own list query, refetched alongside the card after a match. */
  moduleKey: string;
  rowTitle: (row: UniboxMatchable) => string;
  rowSub: (row: UniboxMatchable) => string;
  /** The id the match endpoints take. */
  entityId: (row: UniboxMatchable) => string;
};

const KINDS: Record<Kind["type"], Kind> = {
  expense: {
    section: "expenses",
    type: "expense",
    noun: "expense",
    title: "Expenses",
    icon: CircleDollarSign,
    add: { label: "Log expense", href: "/expenses/new" },
    empty: "No expenses to action",
    moduleKey: "expenses",
    rowTitle: (row) => matchableTitle("expense", row),
    rowSub: (row) => matchableSub("expense", row),
    entityId: (row) => matchableId("expense", row),
  },
  asset: {
    section: "assets",
    type: "asset",
    noun: "asset",
    title: "Assets",
    icon: Layers,
    add: { label: "Log asset", href: "/assets/new/manual" },
    empty: "No assets to review",
    moduleKey: "assets",
    rowTitle: (row) => matchableTitle("asset", row),
    rowSub: (row) => matchableSub("asset", row),
    entityId: (row) => matchableId("asset", row),
  },
  liability: {
    section: "liabilities",
    type: "liability",
    noun: "liability",
    title: "Liabilities",
    icon: CreditCard,
    iconTone: "bg-warm text-warm-foreground",
    add: { label: "Add liability", href: "/liabilities/new" },
    empty: "No liabilities to review",
    moduleKey: "liabilities",
    rowTitle: (row) => matchableTitle("liability", row),
    rowSub: (row) => matchableSub("liability", row),
    entityId: (row) => matchableId("liability", row),
  },
  equity: {
    section: "equity",
    type: "equity",
    noun: "equity",
    title: "Equity",
    icon: Banknote,
    iconTone: "bg-success/10 text-success",
    add: { label: "Add equity", href: "/equity/new" },
    empty: "No equity to review",
    moduleKey: "equity",
    rowTitle: (row) => matchableTitle("equity", row),
    rowSub: (row) => matchableSub("equity", row),
    entityId: (row) => matchableId("equity", row),
  },
};

function MatchableCard({ kind }: { kind: Kind }) {
  const query = useUniboxQuery(kind.section);
  const setAttachExpense = useSetAtom(attachExpenseAtom);
  const [matching, setMatching] = React.useState<MatchableEntity | null>(null);

  const rows = matchableRows(query.data ?? []);

  const openMatch = (row: UniboxMatchable) => {
    if (isDemoRow(row)) {
      showSampleNotice();
      return;
    }
    setMatching({
      id: kind.entityId(row),
      title: kind.rowTitle(row),
      subtitle: kind.rowSub(row),
      amount: toNumber(row.price),
      remainingAmount: remainingOf(row),
    });
  };

  return (
    <UniboxCard
      icon={kind.icon}
      title={kind.title}
      tourId={`quick-actions-${kind.type}`}
      sample={query.isDemo}
      count={rows.length}
      loading={query.isLoading}
      action={<CardAddButton label={kind.add.label} href={kind.add.href} />}
    >
      <CardRows loading={query.isLoading} empty={rows.length === 0} emptyText={kind.empty}>
        {rows.map((row) => {
          const suggestions = toNumber(row.possible_match);
          return (
            <CardRow
              key={`${kind.type}-${kind.entityId(row)}`}
              icon={kind.icon}
              iconTone={kind.iconTone}
              title={kind.rowTitle(row)}
              sub={kind.rowSub(row)}
              amount={optionalMoney(row.price)}
              action={
                suggestions > 0 ? (
                  <AiMatchButton suggestions={suggestions} onOpen={() => openMatch(row)} />
                ) : (
                  <RowAction label="Match" onClick={() => openMatch(row)} />
                )
              }
              menu={
                kind.type === "expense" ? (
                  <RowMenu label={`More options for ${kind.rowTitle(row)}`}>
                    <DropdownMenuItem
                      onSelect={() => {
                        if (isDemoRow(row)) {
                          showSampleNotice();
                          return;
                        }
                        // The attach dialog reads only the id and the label;
                        // the unibox row is not a full `Expense`.
                        setAttachExpense({
                          id: kind.entityId(row),
                          description: kind.rowTitle(row),
                        } as Expense);
                      }}
                    >
                      <Paperclip className="text-muted-foreground" />
                      Add receipt
                    </DropdownMenuItem>
                  </RowMenu>
                ) : undefined
              }
            />
          );
        })}
      </CardRows>

      <MatchTransactionDialog
        type={kind.type}
        noun={kind.noun}
        open={matching !== null}
        entity={matching}
        onClose={() => setMatching(null)}
        invalidateQueryKeys={[
          uniboxKey(kind.section),
          uniboxKey("priorities"),
          uniboxKey("progress"),
          [kind.moduleKey],
        ]}
      />
      {kind.type === "expense" ? <AttachReceiptDialog /> : null}
    </UniboxCard>
  );
}

export const ExpensesCard = () => <MatchableCard kind={KINDS.expense} />;
export const AssetsCard = () => <MatchableCard kind={KINDS.asset} />;
export const LiabilitiesCard = () => <MatchableCard kind={KINDS.liability} />;
export const EquityCard = () => <MatchableCard kind={KINDS.equity} />;
