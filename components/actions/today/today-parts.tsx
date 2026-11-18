"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock,
  CreditCard,
  Banknote,
  Flame,
  FolderKanban,
  Landmark,
  Layers,
  Map as MapIcon,
  Newspaper,
  Plus,
  TrendingUp,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardBalanceQuery } from "@/hooks/use-dashboard-query";
import { useActiveTimerQuery } from "@/hooks/use-project-timer";
import { useUniboxQuery } from "@/hooks/use-unibox-query";
import type { LayoutKey } from "@/lib/quick-actions-today";
import { isReconciled, toNumber } from "@/lib/unibox";
import {
  getPaidSets,
  isUnmatchedBankLine,
  totalBooked,
  totalKm,
  uniboxMoney,
  workComingUpRows,
} from "@/lib/unibox-rules";
import { cn } from "@/lib/utils";

/** The translucent surface the design gives the pill, tiles and bar. */
export const GLASS =
  "border border-white/85 bg-card/70 shadow-[0_1px_2px_rgb(17_24_39/0.04),0_8px_24px_-12px_hsl(var(--primary)/0.18)] backdrop-blur-xl backdrop-saturate-150 dark:border-border";

/* ------------------------------------------------------------------ *
 * Health pill
 * ------------------------------------------------------------------ */

export function HealthPill({
  score,
  status,
  allClear,
  toAction,
  streak,
  loading,
  onStreak,
}: {
  score: number;
  status: string;
  allClear: boolean;
  toAction: number;
  streak: number;
  loading: boolean;
  onStreak: () => void;
}) {
  return (
    <div
      className={cn("mx-auto mb-6 flex w-fit items-center justify-center gap-3 rounded-xl px-3 py-2 text-xs sm:gap-4 sm:px-4", GLASS)}
      data-usertour="quick-actions-status"
    >
      <span
        className={cn(
          "grid size-7 place-items-center rounded-full border-2 text-xs font-semibold tabular",
          allClear ? "border-success" : "border-orange-500",
        )}
        aria-label={`Business health ${score}`}
      >
        {loading ? "–" : score}
      </span>
      <div className="border-r border-border pr-3 leading-tight sm:pr-4">
        <strong className={cn("block font-semibold", allClear ? "text-success" : "text-orange-600")}>
          {allClear ? "All clear" : status || "Needs attention"}
        </strong>
        <span className="hidden text-[11px] text-muted-foreground sm:block">Business health</span>
      </div>
      <div className="border-r border-border pr-3 leading-tight sm:pr-4">
        <strong className="block font-semibold tabular">{toAction} to action</strong>
        <span className="hidden text-[11px] text-muted-foreground sm:block">items awaiting</span>
      </div>
      <button
        type="button"
        onClick={onStreak}
        aria-label="How the streak works"
        className="rounded-sm text-left leading-tight hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-usertour="quick-actions-streak"
      >
        <strong className="inline-flex items-center gap-1 font-semibold">
          <Flame className="size-3.5 fill-warning text-warning" aria-hidden />
          {streak}-day streak
        </strong>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tiles — the app's other cards as live numbers
 * ------------------------------------------------------------------ */

export type TileSpec = {
  key: LayoutKey;
  label: string;
  icon: LucideIcon;
  /** Has an add action inside its sheet — shown as a plus. */
  addable: boolean;
};

export const TILE_SPECS: Record<string, TileSpec> = {
  getpaid: { key: "getpaid", label: "Get paid", icon: Newspaper, addable: true },
  bank: { key: "bank", label: "Bank feed", icon: Landmark, addable: false },
  expenses: { key: "expenses", label: "Expenses", icon: CircleDollarSign, addable: true },
  time: { key: "time", label: "Time tracker", icon: Clock, addable: true },
  assets: { key: "assets", label: "Assets", icon: Layers, addable: true },
  progress: { key: "progress", label: "Your progress", icon: TrendingUp, addable: false },
  projects: { key: "projects", label: "Projects", icon: FolderKanban, addable: true },
  work: { key: "work", label: "Work coming up", icon: CalendarDays, addable: false },
  km: { key: "km", label: "KM tracker", icon: MapIcon, addable: true },
  liabilities: { key: "liabilities", label: "Liabilities", icon: CreditCard, addable: true },
  equity: { key: "equity", label: "Equity", icon: Banknote, addable: true },
};

type TileValue = { value: string; sub: string; loading: boolean };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Each tile's figure, from the same data its card shows. */
function useTileValue(key: LayoutKey): TileValue {
  const invoices = useUniboxQuery("invoices");
  const quotes = useUniboxQuery("quotes");
  const bank = useUniboxQuery("bankTransactions");
  const expenses = useUniboxQuery("expenses");
  const assets = useUniboxQuery("assets");
  const progress = useUniboxQuery("progress");
  const projects = useUniboxQuery("projects");
  const work = useUniboxQuery("workComingUp");
  const km = useUniboxQuery("kmTracker");
  const liabilities = useUniboxQuery("liabilities");
  const equity = useUniboxQuery("equity");
  const balance = useDashboardBalanceQuery();
  const timer = useActiveTimerQuery();

  const sumUnmatched = (rows: { price?: unknown; is_reconciled?: unknown }[] | undefined) =>
    (rows ?? []).filter((row) => !isReconciled(row)).reduce((sum, row) => sum + toNumber(row.price), 0);
  const countUnmatched = (rows: { is_reconciled?: unknown }[] | undefined) =>
    (rows ?? []).filter((row) => !isReconciled(row)).length;

  switch (key) {
    case "getpaid": {
      const sets = getPaidSets(invoices.data ?? [], quotes.data ?? [], Date.now());
      const owed = [...sets.invoices.Overdue, ...sets.invoices["Due soon"]].reduce(
        (sum, row) => sum + toNumber(row.total),
        0,
      );
      return { value: uniboxMoney(owed), sub: "owed to you", loading: invoices.isLoading };
    }
    case "bank": {
      const n = (bank.data ?? []).filter(isUnmatchedBankLine).length;
      return {
        value: `${n} to match`,
        sub: balance.data ? `Balance ${uniboxMoney(balance.data.currentBalance)}` : "in your bank feed",
        loading: bank.isLoading,
      };
    }
    case "expenses":
      return { value: uniboxMoney(sumUnmatched(expenses.data)), sub: "to match", loading: expenses.isLoading };
    case "time":
      return {
        value: timer.data ? "Running" : "Not running",
        sub: timer.data ? "tap to stop" : "tap to start",
        loading: timer.isLoading,
      };
    case "assets":
      return { value: uniboxMoney(sumUnmatched(assets.data)), sub: "to match", loading: assets.isLoading };
    case "progress": {
      const n = progress.data?.activity?.total_this_week ?? 0;
      return { value: `${n} cleared`, sub: "this week", loading: progress.isLoading };
    }
    case "projects": {
      const n = (projects.data ?? []).length;
      return { value: `${n} ${plural(n, "project", "projects")}`, sub: "on the go", loading: projects.isLoading };
    }
    case "work":
      return {
        value: uniboxMoney(totalBooked(workComingUpRows(work.data ?? []))),
        sub: "booked ahead",
        loading: work.isLoading,
      };
    case "km":
      return { value: `${totalKm(km.data ?? []).toFixed(1)} km`, sub: "logged", loading: km.isLoading };
    case "liabilities":
      return { value: `${countUnmatched(liabilities.data)} to match`, sub: "liabilities", loading: liabilities.isLoading };
    case "equity":
    default:
      return { value: `${countUnmatched(equity.data)} to match`, sub: "equity", loading: equity.isLoading };
  }
}

function Tile({ spec, onOpen }: { spec: TileSpec; onOpen: () => void }) {
  const { value, sub, loading } = useTileValue(spec.key);
  const Icon = spec.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-usertour={`quick-actions-tile-${spec.key}`}
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-xl px-2.5 py-2 text-left transition-[box-shadow,transform,background-color] hover:bg-card/90 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:rounded-2xl sm:px-3.5 sm:py-3",
        GLASS,
      )}
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{spec.label}</span>
        {spec.addable ? <Plus className="ml-auto size-3.5 shrink-0 text-primary" aria-label="Can add" /> : null}
      </span>
      {loading ? (
        <Skeleton className="my-1 h-5 w-20" />
      ) : (
        <span className="truncate text-base font-bold leading-tight tabular sm:text-lg">{value}</span>
      )}
      <span className="hidden truncate text-[11px] text-muted-foreground sm:block">{sub}</span>
    </button>
  );
}

export function TileGrid({ keys, onOpen }: { keys: LayoutKey[]; onOpen: (key: LayoutKey) => void }) {
  return (
    <section aria-label="Your business" className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
      {keys.map((key) => (
        <Tile key={key} spec={TILE_SPECS[key]} onOpen={() => onOpen(key)} />
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Updates — a bar on desktop, a bell on a phone, the same sheet behind both
 * ------------------------------------------------------------------ */

export function UpdatesBar({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={cn(
        "hidden w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex",
        GLASS,
      )}
    >
      <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-semibold">
          While you were away · {count} {plural(count, "update", "updates")}
        </strong>
        <span className="block truncate text-xs text-muted-foreground">Tap to see what changed</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />
    </button>
  );
}

export function UpdatesBell({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={count ? `${count} updates` : "Updates"}
      className={cn("relative grid size-9 place-items-center rounded-full sm:hidden", GLASS)}
    >
      <Bell className="size-[1.1rem]" />
      {count ? (
        <span className="absolute -right-1 -top-1 grid h-[1.1rem] min-w-[1.1rem] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
          {count}
        </span>
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Coach mark and undo
 * ------------------------------------------------------------------ */

const TIP_KEY = "sole-qa-tip";

/** "Swipe right to approve, left for later" — once, until dismissed or the first decision. */
export function useCoachMark() {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    try {
      setShow(!window.localStorage.getItem(TIP_KEY));
    } catch {
      setShow(true);
    }
  }, []);
  const dismiss = React.useCallback(() => {
    setShow(false);
    try {
      window.localStorage.setItem(TIP_KEY, "1");
    } catch {
      /* not remembered — it shows again next visit */
    }
  }, []);
  return { show, dismiss };
}

export function CoachMark({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="mx-auto mt-3 flex w-fit items-center gap-3 whitespace-nowrap rounded-full bg-foreground py-1.5 pl-3.5 pr-1.5 text-xs text-background shadow-md"
    >
      Swipe right to approve, left for later
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-full bg-background px-2.5 py-0.5 font-semibold text-foreground"
      >
        Got it
      </button>
    </div>
  );
}

export function UndoBar({ message, onUndo }: { message: string; onUndo: () => void }) {
  return (
    <div
      aria-live="polite"
      className="mx-auto mt-4 flex max-w-[25rem] items-center justify-between gap-3 rounded-lg bg-foreground px-3 py-2 text-xs text-background animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
    >
      <span className="truncate">{message}</span>
      <button type="button" onClick={onUndo} className="shrink-0 px-1 font-semibold underline">
        Undo
      </button>
    </div>
  );
}
