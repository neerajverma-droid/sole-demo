"use client";

import * as React from "react";
import { useAtomValue } from "jotai";
import { Check, SlidersHorizontal } from "lucide-react";

import { BankMatchHost } from "@/components/actions/unibox/bank-feed-card";
import { BreakdownSheet } from "@/components/actions/today/breakdown-sheet";
import { DeckControls, SwipeDeck, type DeckHandle } from "@/components/actions/today/swipe-deck";
import {
  CoachMark,
  GLASS,
  HealthPill,
  TileGrid,
  UndoBar,
  UpdatesBar,
  UpdatesBell,
  useCoachMark,
} from "@/components/actions/today/today-parts";
import { CustomiseSheet, StreakSheet, TileSheet, UpdatesSheet } from "@/components/actions/today/today-sheets";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarkAllNotificationsReadMutation, useNotificationsQuery } from "@/hooks/use-notifications-query";
import { useTodayDeck } from "@/hooks/use-today-deck";
import { useTodayLayout } from "@/hooks/use-today-layout";
import { useUniboxQuery } from "@/hooks/use-unibox-query";
import { authNameAtom } from "@/lib/atoms";
import { titleCaseName } from "@/lib/onboarding";
import { cardText, deckFirst, visibleTiles, type DeckCard, type LayoutKey } from "@/lib/quick-actions-today";
import { cn } from "@/lib/utils";

/** "Good morning" after mount, so the server and the browser agree on the first paint. */
function useGreeting() {
  const [greeting, setGreeting] = React.useState("Hello");
  React.useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  }, []);
  return greeting;
}

type Sheet =
  | { kind: "breakdown"; cardId: string }
  | { kind: "tile"; key: LayoutKey }
  | { kind: "updates" }
  | { kind: "streak" }
  | { kind: "customise" }
  | null;

/**
 * Quick Actions — "Today".
 *
 * One card at a time: the most important thing to do, prepared from the
 * business's own data. Swipe right (or press Approve, or →) to do it, left
 * (Later, ←) to put it off until tomorrow; tap it for the full breakdown. The
 * app's other modules sit above it as live tiles. Nothing navigates away:
 * every detail is a sheet, and every action is the app's existing one.
 */
export function TodayScreen() {
  const greeting = useGreeting();
  const name = titleCaseName((useAtomValue(authNameAtom) || "").trim().split(/\s+/)[0] ?? "");

  const deck = useTodayDeck();
  const layout = useTodayLayout();
  const progress = useUniboxQuery("progress");
  const notifications = useNotificationsQuery();
  const markSeen = useMarkAllNotificationsReadMutation();
  const coach = useCoachMark();
  const deckRef = React.useRef<DeckHandle>(null);

  const [sheet, setSheet] = React.useState<Sheet>(null);
  const close = (open: boolean) => {
    if (!open) setSheet(null);
  };

  const updates = (notifications.data?.items ?? []).filter((item) => !item.read);
  const showUpdates = layout.layout.on.away;
  const tiles = visibleTiles(layout.layout);
  const tilesFirst = !deckFirst(layout.layout);

  const cards = deck.cards;
  const top = cards[0];
  const next = cards[1];
  const breakdownCard =
    sheet?.kind === "breakdown" ? (cards.find((card) => card.id === sheet.cardId) ?? null) : null;
  const toAction = cards.reduce((sum, card) => sum + (card.single ? 1 : card.items.length), 0);
  const total = deck.done + cards.length;

  const openBreakdown = (card: DeckCard) => setSheet({ kind: "breakdown", cardId: card.id });

  /** Swipe right's outcome — whether the card left the deck. */
  const approve = (card: DeckCard) => {
    const outcome = deck.approve(card);
    if (outcome === "open-breakdown") openBreakdown(card);
    return outcome === "acted";
  };

  // A breakdown whose card has gone (all approved, or put off) closes itself.
  React.useEffect(() => {
    if (sheet?.kind === "breakdown" && !breakdownCard) setSheet(null);
  }, [sheet, breakdownCard]);

  // ← later, → approve — when no sheet is open and nobody is typing.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (sheet) return;
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (event.key === "ArrowRight") deckRef.current?.decide(1);
      if (event.key === "ArrowLeft") deckRef.current?.decide(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet]);

  const ready = layout.layout.on.ready ? (
    <section aria-label="Ready for you" data-usertour="quick-actions-priorities" className={cn(tilesFirst ? "order-2" : "order-1")}>
      <div className="mb-2 flex items-baseline justify-between">
        <strong className="text-base">Ready for you</strong>
        {cards.length ? (
          <span className="text-xs text-muted-foreground tabular">
            {deck.done} of {total} done
          </span>
        ) : null}
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={deck.done}
        aria-label="Cleared today"
      >
        <span
          className="block h-full origin-left rounded-full bg-success transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${total ? deck.done / total : 1})` }}
        />
      </div>

      {deck.loading ? (
        <Skeleton className="mx-auto mt-6 h-80 w-full max-w-[26rem] rounded-[1.25rem]" />
      ) : top ? (
        <>
          <SwipeDeck
            ref={deckRef}
            cards={cards}
            untickedFor={deck.untickedFor}
            onToggle={deck.toggleItem}
            onApprove={approve}
            onLater={deck.putOff}
            onOpen={openBreakdown}
            onFirstDecision={coach.dismiss}
          />
          {coach.show ? <CoachMark onDismiss={coach.dismiss} /> : null}
          <DeckControls
            yesLabel={cardText(top, deck.untickedFor(top)).yes}
            onLater={() => deckRef.current?.decide(-1)}
            onApprove={() => deckRef.current?.decide(1)}
          />
          {next ? (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Next: {cardText(next, deck.untickedFor(next)).title}
            </p>
          ) : null}
          <p className="mt-1.5 hidden text-center text-xs text-muted-foreground sm:block">
            <kbd className="mx-1 rounded border border-border bg-card px-1.5 py-px font-sans text-[11px]">←</kbd> Later
            <kbd className="mx-1 ml-3 rounded border border-border bg-card px-1.5 py-px font-sans text-[11px]">→</kbd> Approve
            <kbd className="mx-1 ml-3 rounded border border-border bg-card px-1.5 py-px font-sans text-[11px]">Enter</kbd> Details
          </p>
        </>
      ) : (
        <div className="pb-4 pt-10 text-center">
          <span className="mx-auto mb-2.5 grid size-12 place-items-center rounded-full bg-success/15 text-success animate-in zoom-in-50 fade-in motion-reduce:animate-none">
            <Check className="size-6" aria-hidden />
          </span>
          <strong className="block text-lg">You&apos;re all clear</strong>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing needs you right now{deck.later ? `, ${deck.later} saved for later` : ""}.
          </p>
        </div>
      )}

      {deck.undo ? <UndoBar message={deck.undo.message} onUndo={deck.undo.undo} /> : null}
    </section>
  ) : null;

  return (
    <div className="relative rounded-2xl bg-[radial-gradient(52rem_20rem_at_50%_-3rem,hsl(var(--primary)/0.08),transparent_72%)] pb-10">
      <BankMatchHost />

      <div className="absolute right-0 top-0 flex items-center gap-1.5">
        {showUpdates && updates.length ? (
          <UpdatesBell count={updates.length} onOpen={() => setSheet({ kind: "updates" })} />
        ) : null}
        <Button
          variant="outline"
          className={cn("h-9 gap-2 px-2.5 sm:px-3", GLASS)}
          onClick={() => setSheet({ kind: "customise" })}
          data-usertour="quick-actions-customise"
          aria-label="Customise"
        >
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">Customise</span>
        </Button>
      </div>

      <h1 className="mb-3.5 mt-4 pt-10 text-center text-2xl font-bold tracking-tight sm:pt-2 sm:text-3xl">
        {greeting}
        {name ? `, ${name}` : ""}
      </h1>

      <HealthPill
        score={progress.data?.health?.score ?? 0}
        status={progress.data?.health?.status ?? ""}
        allClear={!deck.loading && cards.length === 0}
        toAction={toAction}
        streak={progress.data?.streak?.current ?? 0}
        loading={progress.isLoading}
        onStreak={() => setSheet({ kind: "streak" })}
      />

      {/* One column that may shrink below its content, so on a phone the tiles
          and the deck fit the screen instead of pushing past its edge. */}
      <div className="mx-auto grid max-w-[40rem] grid-cols-[minmax(0,1fr)] gap-4">
        {showUpdates && updates.length ? (
          <UpdatesBar count={updates.length} onOpen={() => setSheet({ kind: "updates" })} />
        ) : null}
        <div className="flex min-w-0 flex-col gap-4">
          {tiles.length ? (
            <div className={cn(tilesFirst ? "order-1" : "order-2")}>
              <TileGrid keys={tiles} onOpen={(key) => setSheet({ kind: "tile", key })} />
            </div>
          ) : null}
          {ready}
        </div>
      </div>

      <BreakdownSheet
        card={breakdownCard}
        unticked={breakdownCard ? deck.untickedFor(breakdownCard) : new Set()}
        onOpenChange={close}
        onToggle={(item) => breakdownCard && deck.toggleItem(breakdownCard, item)}
        onToggleAll={(ticked) => breakdownCard && deck.setAllTicked(breakdownCard, ticked)}
        onApprove={() => {
          if (!breakdownCard) return;
          if (approve(breakdownCard)) setSheet(null);
        }}
      />
      <TileSheet tile={sheet?.kind === "tile" ? sheet.key : null} onOpenChange={close} />
      <UpdatesSheet
        open={sheet?.kind === "updates"}
        onOpenChange={close}
        updates={updates}
        marking={markSeen.isPending}
        onMarkAllSeen={() => markSeen.mutate(undefined, { onSuccess: () => setSheet(null) })}
      />
      <StreakSheet open={sheet?.kind === "streak"} onOpenChange={close} progress={progress.data} />
      <CustomiseSheet open={sheet?.kind === "customise"} onOpenChange={close} layout={layout} />
    </div>
  );
}
