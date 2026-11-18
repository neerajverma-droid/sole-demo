"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  ArrowRightLeft,
  Check,
  FileCheck2,
  Landmark,
  List,
  Receipt,
  Send,
  Sparkles,
  Tags,
  UserPlus,
  X,
} from "lucide-react";

import { cardText, tickedItems, type DeckCard, type DeckItem } from "@/lib/quick-actions-today";
import { endGesture, moveGesture, startGesture, type Gesture } from "@/lib/swipe-gesture";
import {
  COMMIT_DISTANCE,
  NUDGE_DISTANCE,
  ROTATION_PER_PX,
  SPRINGS,
  springSettled,
  springStep,
  stampOpacity,
  type SpringState,
} from "@/lib/swipe-physics";
import { uniboxMoney } from "@/lib/unibox-rules";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Look
 * ------------------------------------------------------------------ */

/**
 * A tone's colours: the icon tile's tint and text, and the wash across the top
 * of the card — written as a gradient, fading out 8rem down, as the design's.
 */
export const TONE_CLASSES: Record<DeckCard["tone"], { tint: string; text: string; wash: string }> = {
  primary: { tint: "bg-primary/10", text: "text-primary", wash: "hsl(var(--primary) / 0.08)" },
  warning: { tint: "bg-warning/10", text: "text-warning", wash: "hsl(var(--warning) / 0.10)" },
  info: { tint: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400", wash: "rgb(14 165 233 / 0.08)" },
  success: { tint: "bg-success/10", text: "text-success", wash: "hsl(var(--success) / 0.08)" },
};

const CARD_ICON: Record<DeckCard["kind"], LucideIcon> = {
  remind: AlarmClock,
  "send-invoices": Send,
  "send-quotes": FileCheck2,
  "convert-quotes": ArrowRightLeft,
  "approve-categories": Tags,
  "match-bank": Landmark,
  "match-expenses": Receipt,
  start: UserPlus,
};

/** Two rows on short screens, three otherwise — so the card never scrolls. */
function useRowCap() {
  const [cap, setCap] = React.useState(3);
  React.useEffect(() => {
    const read = () =>
      setCap(window.matchMedia("(max-width: 640px)").matches || window.innerHeight < 860 ? 2 : 3);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return cap;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ *
 * One card
 * ------------------------------------------------------------------ */

function CardFace({
  card,
  unticked,
  depth,
  rowCap,
  onToggle,
  onOpen,
}: {
  card: DeckCard;
  unticked: ReadonlySet<string>;
  depth: number;
  rowCap: number;
  onToggle: (item: DeckItem) => void;
  onOpen: () => void;
}) {
  const text = cardText(card, unticked);
  const tone = TONE_CLASSES[card.tone];
  const Icon = CARD_ICON[card.kind];
  const shown = card.items.slice(0, rowCap);
  const more = card.items.length - shown.length;
  const interactive = depth === 0;

  return (
    <>
      <span
        data-stamp="yes"
        className="pointer-events-none absolute left-5 top-6 -rotate-[8deg] rounded-md border-[3px] border-success bg-card px-2.5 py-0.5 text-sm font-bold tracking-wider text-success opacity-0"
        aria-hidden
      >
        APPROVE
      </span>
      <span
        data-stamp="no"
        className="pointer-events-none absolute right-5 top-6 rotate-[8deg] rounded-md border-[3px] border-warning bg-card px-2.5 py-0.5 text-sm font-bold tracking-wider text-warning opacity-0"
        aria-hidden
      >
        LATER
      </span>

      <div className="flex items-center gap-2.5">
        <span
          className={cn("grid size-10 place-items-center rounded-xl bg-card/80 shadow-sm [&_svg]:size-5", tone.text)}
          aria-hidden
        >
          <Icon />
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {card.area}
        </span>
      </div>

      <h3 className="text-xl font-bold leading-tight tracking-[-0.015em]">{text.title}</h3>

      {card.batch || card.items.length ? (
        <p className="-mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          Prepared by Sole
        </p>
      ) : null}

      {text.figure ? (
        <p className="text-2xl font-bold leading-none tracking-[-0.02em] tabular">
          {text.figure}
          <small className="ml-1.5 text-xs font-normal text-muted-foreground">{text.figureLabel}</small>
        </p>
      ) : null}

      {card.single ? (
        <p className="rounded-lg border border-foreground/5 bg-card/70 px-3 py-2.5 text-sm leading-snug text-muted-foreground">
          {card.single.text}
        </p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)]">
          {shown.map((item) => {
            const off = unticked.has(item.id);
            const amount = (
              <b className={cn("shrink-0 font-semibold tabular", off && "line-through")}>
                {item.amount < 0 ? "-" : card.kind === "match-bank" || card.kind === "approve-categories" ? "+" : ""}
                {uniboxMoney(Math.abs(item.amount))}
              </b>
            );
            const body = (
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.label}</span>
                <small className="block truncate text-xs text-muted-foreground">{item.sub}</small>
              </span>
            );
            return card.batch ? (
              <label
                key={item.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 border-b border-foreground/[0.06] py-2 text-sm",
                  off && "text-muted-foreground/70",
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 cursor-pointer accent-primary"
                  checked={!off}
                  tabIndex={interactive ? 0 : -1}
                  onChange={() => onToggle(item)}
                />
                {body}
                {amount}
              </label>
            ) : (
              <div key={item.id} className="flex items-center gap-2.5 border-b border-foreground/[0.06] py-2 text-sm">
                {body}
                {amount}
              </div>
            );
          })}
          {more > 0 ? (
            <button
              type="button"
              tabIndex={interactive ? 0 : -1}
              onClick={onOpen}
              className="w-fit pt-1.5 text-left text-xs font-medium text-primary hover:underline"
            >
              + {more} more in the breakdown
            </button>
          ) : null}
        </div>
      )}

      <button
        type="button"
        tabIndex={interactive ? 0 : -1}
        onClick={onOpen}
        className="mt-auto flex w-fit items-center gap-1 pt-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <List className="size-3.5" aria-hidden />
        See details
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The stack, the gesture and the buttons
 * ------------------------------------------------------------------ */

export type DeckHandle = {
  /** Fly the top card off as though swiped: 1 approve, -1 later. */
  decide: (direction: 1 | -1) => void;
};

/**
 * The deck: the top card and two behind it, swipe right to approve, left for
 * later, tap for the breakdown. Every gesture has a button and a key.
 */
export const SwipeDeck = React.forwardRef<
  DeckHandle,
  {
    cards: DeckCard[];
    untickedFor: (card: DeckCard) => ReadonlySet<string>;
    onToggle: (card: DeckCard, item: DeckItem) => void;
    /** What swiping right asks for. Returns whether the card left the deck. */
    onApprove: (card: DeckCard) => boolean;
    onLater: (card: DeckCard) => void;
    onOpen: (card: DeckCard) => void;
    /** The first decision dismisses the coach mark. */
    onFirstDecision?: () => void;
  }
>(function SwipeDeck({ cards, untickedFor, onToggle, onApprove, onLater, onOpen, onFirstDecision }, ref) {
  const rowCap = useRowCap();
  const top = cards[0];
  const elements = React.useRef(new Map<string, HTMLDivElement>());
  const motion = React.useRef(new Map<string, SpringState & { raf: number }>());
  const busy = React.useRef(false);
  const drag = React.useRef<{ card: DeckCard; el: HTMLDivElement; gesture: Gesture } | null>(null);
  /** Removes the window listeners of the drag in progress. */
  const detach = React.useRef<(() => void) | null>(null);
  /** Set when a drag ends, so the click the browser fires after it doesn't tick or open anything. */
  const swallowClick = React.useRef(false);

  React.useEffect(() => () => detach.current?.(), []);

  const state = (id: string) => {
    let entry = motion.current.get(id);
    if (!entry) {
      entry = { x: 0, v: 0, raf: 0 };
      motion.current.set(id, entry);
    }
    return entry;
  };

  /** Draw the card at `x`: offset, tilt and the stamps. */
  const paint = (el: HTMLDivElement, x: number) => {
    // The spring and the finger own the transform while they move it; a CSS
    // transition here would fight them and stutter.
    el.style.transition = "none";
    el.style.transform = `translate3d(${x}px,0,0) rotate(${x * ROTATION_PER_PX}deg)`;
    const yes = el.querySelector<HTMLElement>('[data-stamp="yes"]');
    const no = el.querySelector<HTMLElement>('[data-stamp="no"]');
    if (yes) yes.style.opacity = x > 0 ? String(stampOpacity(x)) : "0";
    if (no) no.style.opacity = x < 0 ? String(stampOpacity(x)) : "0";
    const armed = Math.abs(x) >= COMMIT_DISTANCE ? (x > 0 ? "yes" : "no") : "";
    if (el.dataset.armed !== armed) {
      el.dataset.armed = armed;
      // A light tick when the commit point is crossed, where the device can.
      if (armed && "vibrate" in navigator) {
        try {
          navigator.vibrate(8);
        } catch {
          /* no haptics here */
        }
      }
    }
  };

  /** Spring the card to `target`, starting from its current position and velocity. */
  const springTo = (
    id: string,
    target: number,
    spring: { response: number; damping: number },
    options: { velocity?: number; until?: (x: number) => boolean } = {},
  ) =>
    new Promise<void>((resolve) => {
      const el = elements.current.get(id);
      const m = state(id);
      cancelAnimationFrame(m.raf);
      if (options.velocity !== undefined) m.v = options.velocity;
      if (!el) {
        resolve();
        return;
      }
      if (prefersReducedMotion()) {
        m.x = target;
        m.v = 0;
        paint(el, target);
        resolve();
        return;
      }
      let last = performance.now();
      const step = (now: number) => {
        const next = springStep(m, target, (now - last) / 1000, spring);
        last = now;
        m.x = next.x;
        m.v = next.v;
        paint(el, m.x);
        const finished = options.until ? options.until(m.x) : springSettled(m, target);
        if (finished) {
          if (!options.until) {
            m.x = target;
            paint(el, target);
          }
          resolve();
          return;
        }
        m.raf = requestAnimationFrame(step);
      };
      m.raf = requestAnimationFrame(step);
    });

  const reset = (id: string) => {
    const el = elements.current.get(id);
    const m = state(id);
    cancelAnimationFrame(m.raf);
    m.x = 0;
    m.v = 0;
    if (el) {
      el.style.transform = "";
      // Handed back to CSS, so a card moving up the stack glides there.
      el.style.transition = "";
      el.dataset.armed = "";
      el.querySelectorAll<HTMLElement>("[data-stamp]").forEach((stamp) => (stamp.style.opacity = "0"));
    }
  };

  /** Act on the top card: fly it off and hand the decision up, or snap back and open it. */
  const decide = async (card: DeckCard | undefined, direction: 1 | -1, velocity = 0) => {
    if (!card || busy.current) return;
    onFirstDecision?.();
    const el = elements.current.get(card.id);
    const needsMore =
      direction === 1 && !card.single && (!card.batch || tickedItems(card, untickedFor(card)).length === 0);
    if (needsMore) {
      // Nothing to act on in one go: back to rest, and the breakdown instead.
      void springTo(card.id, 0, SPRINGS.snapBack, { velocity }).then(() => reset(card.id));
      onOpen(card);
      return;
    }
    busy.current = true;
    const width = el?.offsetWidth ?? 400;
    await springTo(card.id, direction * (width + 80), SPRINGS.flyOff, {
      velocity: direction * Math.max(Math.abs(velocity), 1400),
      until: (x) => Math.abs(x) > width * 0.9,
    });
    const left = direction === 1 ? onApprove(card) : (onLater(card), true);
    if (!left) void springTo(card.id, 0, SPRINGS.snapBack);
    else reset(card.id);
    busy.current = false;
  };

  React.useImperativeHandle(ref, () => ({ decide: (direction) => void decide(top, direction) }));

  /* -------- the gesture -------- */
  // Move and release are heard on the window, not the card: a mouse let go
  // off the card (or outside the browser) still ends the drag, instead of
  // leaving the card stuck to the cursor.
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>, card: DeckCard) => {
    if (event.button > 0 || busy.current || drag.current) return;
    const m = state(card.id);
    cancelAnimationFrame(m.raf); // grab it wherever it is
    const el = event.currentTarget;
    el.dataset.pressed = "true";
    drag.current = {
      card,
      el,
      gesture: startGesture({
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        offset: m.x,
        fromControl: Boolean((event.target as HTMLElement).closest("button, a, label, input")),
      }),
    };
    const move = (e: PointerEvent) => onPointerMove(e);
    const end = (e: PointerEvent) => onPointerEnd(e);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    detach.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      detach.current = null;
    };
  };

  const onPointerMove = (event: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const wasEngaged = d.gesture.engaged;
    const result = moveGesture(d.gesture, {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      pointerType: event.pointerType,
      buttons: event.buttons,
    });
    // The button came up where we couldn't hear it: end the drag here.
    if (result.kind === "end") return onPointerEnd(event);
    if (result.kind !== "paint") return;
    if (!wasEngaged) window.getSelection()?.removeAllRanges();
    event.preventDefault();
    state(d.card.id).x = result.x;
    paint(d.el, result.x);
  };

  const onPointerEnd = (event: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const result = endGesture(d.gesture, {
      pointerId: event.pointerId,
      type: event.type as "pointerup" | "pointercancel" | "pointermove",
      time: performance.now(),
      onCard: event.target instanceof Node && d.el.contains(event.target),
    });
    if (result.kind === "ignore") return;
    drag.current = null;
    detach.current?.();
    delete d.el.dataset.pressed;
    const card = d.card;
    // A tap on the card opens the breakdown; a tap on a tick or a button is theirs.
    if (result.kind === "tap") onOpen(card);
    if (result.kind !== "release") return;
    // The click that follows a drag isn't a tap.
    swallowClick.current = true;
    window.setTimeout(() => (swallowClick.current = false), 0);
    if (result.decision === 0) {
      void springTo(card.id, 0, SPRINGS.snapBack, { velocity: result.velocity }).then(() => reset(card.id));
    } else {
      void decide(card, result.decision, result.velocity);
    }
  };

  /* -------- first run: show the gesture once per session -------- */
  React.useEffect(() => {
    if (!top || prefersReducedMotion()) return;
    try {
      if (window.sessionStorage.getItem("sole-qa-peeked")) return;
      window.sessionStorage.setItem("sole-qa-peeked", "1");
    } catch {
      return;
    }
    const id = top.id;
    const timer = window.setTimeout(async () => {
      if (drag.current) return;
      await springTo(id, NUDGE_DISTANCE, SPRINGS.nudge, { until: (x) => x > NUDGE_DISTANCE - 4 });
      if (!drag.current) {
        await springTo(id, 0, { response: 0.5, damping: 0.9 });
        reset(id);
      }
    }, 900);
    return () => window.clearTimeout(timer);
    // Once, on the first card shown — not every time the deck changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(top)]);

  return (
    <div
      className="relative mx-auto mt-6 grid w-full max-w-[26rem] grid-cols-[minmax(0,1fr)] pt-1"
      role="group"
      aria-label="Ready for you"
    >
      {cards.slice(0, 3).map((card, depth) => {
        const text = cardText(card, untickedFor(card));
        const tone = TONE_CLASSES[card.tone];
        return (
          <div
            key={card.id}
            ref={(el) => {
              if (el) elements.current.set(card.id, el);
              else elements.current.delete(card.id);
            }}
            data-depth={depth}
            tabIndex={depth === 0 ? 0 : -1}
            aria-hidden={depth === 0 ? undefined : true}
            aria-label={depth === 0 ? `${text.title}. Swipe right to approve, left for later.` : undefined}
            onPointerDown={depth === 0 ? (event) => onPointerDown(event, card) : undefined}
            onClickCapture={(event) => {
              if (!swallowClick.current) return;
              swallowClick.current = false;
              event.preventDefault();
              event.stopPropagation();
            }}
            onDragStart={(event) => event.preventDefault()}
            onKeyDown={
              depth === 0
                ? (event) => {
                    if (event.key === "Enter" && event.target === event.currentTarget) onOpen(card);
                  }
                : undefined
            }
            style={
              depth === 0 ? { backgroundImage: `linear-gradient(180deg, ${tone.wash} 0, transparent 8rem)` } : undefined
            }
            className={cn(
              "relative col-start-1 row-start-1 flex select-none flex-col gap-2.5 self-start rounded-[1.25rem] border border-white/90 bg-card p-5 pb-4 outline-none",
              "shadow-[0_1px_2px_rgb(17_24_39/0.05),0_28px_48px_-28px_rgb(17_24_39/0.28)] [will-change:transform]",
              "focus-visible:ring-2 focus-visible:ring-ring dark:border-border",
              // `scale` on its own property, so the drag's inline `transform`
              // can't cancel the press feedback.
              depth === 0 &&
                "z-30 cursor-grab touch-pan-y transition-[transform,scale] duration-300 ease-out data-[pressed=true]:cursor-grabbing data-[pressed=true]:[scale:0.985] motion-reduce:transition-none",
              // The two behind peek above it, smaller and quieter.
              depth === 1 &&
                "pointer-events-none z-20 -translate-y-3 scale-95 transition-transform duration-300 [&>*]:opacity-60",
              depth === 2 &&
                "pointer-events-none z-10 -translate-y-6 scale-90 transition-transform duration-300 [&>*]:invisible",
            )}
          >
            <CardFace
              card={card}
              unticked={untickedFor(card)}
              depth={depth}
              rowCap={rowCap}
              onToggle={(item) => onToggle(card, item)}
              onOpen={() => onOpen(card)}
            />
          </div>
        );
      })}
    </div>
  );
});

/** Later and Approve, under the deck — the same as a swipe. */
export function DeckControls({
  yesLabel,
  onLater,
  onApprove,
}: {
  yesLabel: string;
  onLater: () => void;
  onApprove: () => void;
}) {
  return (
    <div className="mt-5 flex items-start justify-center gap-10">
      <div className="flex max-w-32 flex-col items-center gap-1.5 text-center text-xs text-muted-foreground">
        <button
          type="button"
          onClick={onLater}
          aria-label="Later"
          className="grid size-14 place-items-center rounded-full border border-white/90 bg-card/85 text-muted-foreground shadow-[0_8px_20px_-10px_rgb(17_24_39/0.3)] backdrop-blur-md transition-[transform,background-color,color] hover:border-warning hover:bg-warning/10 hover:text-warning active:scale-[0.92] dark:border-border"
        >
          <X className="size-6" />
        </button>
        Later
      </div>
      <div className="flex max-w-32 flex-col items-center gap-1.5 text-center text-xs text-muted-foreground">
        <button
          type="button"
          onClick={onApprove}
          aria-label={`Approve: ${yesLabel}`}
          className="grid size-[4.25rem] place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_14px_28px_-10px_hsl(var(--primary)/0.55)] transition-[transform,filter] hover:brightness-110 active:scale-[0.92]"
        >
          <Check className="size-7" />
        </button>
        <b className="font-semibold text-foreground">{yesLabel}</b>
      </div>
    </div>
  );
}
