"use client";

import { useAtom } from "jotai";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { invoiceMoney } from "@/lib/invoices";
import { transactionsFilterAtom, transactionsQueryAtom } from "@/lib/atoms";
import { cn } from "@/lib/utils";

/**
 * The reconciling strip: which pile you're working through, and a search.
 *
 * One row, not a row of cards. These figures are context for the table, not the
 * point of the screen — three large tiles plus a second card for the toggle
 * pushed the first transaction off a laptop screen, and the rows are what
 * people came here for. Each figure is one line of text inside the platform's
 * filter pill, so the whole strip costs a single control's height and the table
 * starts above the fold. The pill shape is what separates them — the same row
 * of pills Quotes and Invoices filter with, so a pill means the same thing here.
 *
 * Pills rather than a filter dropdown, because unmatched-versus-matched isn't
 * one filter among many — it's the two states of the job, and the count and
 * total on each is the progress bar. There's no combined view: the screen
 * opens on Unmatched, as sole-webapp's two tabs do.
 *
 * Selecting a pill filters the table below; the same atom drives the toolbar's
 * Filter by, so the two can't disagree about what's showing. Its Personal and
 * Transfer options have no pill here — picking one leaves the row with nothing
 * selected, which is the truth: what's on screen isn't either pile.
 */
export type PileTotals = {
  unmatched: { count: number | null; total: number | null };
  matched: { count: number | null; total: number | null };
};

/**
 * `totals` come from the server — each pile's row count and its money for the
 * financial year — rather than from the rows on screen, which are one page.
 * A null is still loading.
 */
export function TransactionsMetrics({ totals }: { totals: PileTotals }) {
  const [filter, setFilter] = useAtom(transactionsFilterAtom);
  const [query, setQuery] = useAtom(transactionsQueryAtom);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-lg border border-border bg-card px-2 py-2 shadow-sm">
      <div
        role="tablist"
        aria-label="Transactions by match status"
        className="flex min-w-0 flex-wrap items-center gap-2"
      >
        <Segment
          label="Unmatched Transactions"
          count={totals.unmatched.count}
          total={totals.unmatched.total}
          active={filter === "Review"}
          onSelect={() => setFilter("Review")}
        />
        <Segment
          label="Matched Transactions"
          count={totals.matched.count}
          total={totals.matched.total}
          active={filter === "Matched"}
          onSelect={() => setFilter("Matched")}
        />
      </div>

      <div className="relative ml-auto w-full sm:w-[20rem]">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search description, amount or TXN ID"
          aria-label="Search transactions by description, amount or ID"
          className="h-8 pl-8"
        />
      </div>
    </div>
  );
}

/**
 * One pile's tab — sole-webapp's: the name, then that pile's money for the
 * year in small muted text. A rounded rectangle rather than a pill; the
 * selected one is outlined in the primary colour on a light tint, in bold.
 */
function Segment({
  label,
  count,
  total,
  active,
  onSelect,
}: {
  label: string;
  count: number | null;
  total: number | null;
  active: boolean;
  onSelect: () => void;
}) {
  const money = total === null ? "…" : invoiceMoney(total);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      // The count is only known for the open tab — it's the list's own total.
      aria-label={
        count === null
          ? `${label}, ${money}`
          : `${label}, ${count} ${count === 1 ? "transaction" : "transactions"}, ${money}`
      }
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border-2 px-3 py-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:px-4 sm:text-sm",
        active
          ? "border-primary bg-primary/10 font-bold text-foreground shadow shadow-primary/10"
          : "border-transparent font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {label}
      <span className="text-[10px] font-normal text-muted-foreground tabular sm:text-xs">
        {money}
      </span>
    </button>
  );
}
