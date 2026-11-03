"use client";

import { Check, Play, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addonPrice, type Addon } from "@/lib/addons";
import { cn } from "@/lib/utils";

/**
 * The overview panel: one add-on, explained.
 *
 * Four headings in the order the questions get asked — what am I looking at,
 * what does it do, why would I bother, what happens when I switch it on. Each
 * answers something the others don't, which is the only justification for
 * having four.
 */
export function AddonOverview({
  addon,
  added,
  selected,
  onToggleSelect,
  onRemove,
}: {
  addon: Addon;
  added: boolean;
  /** In the cart: chosen, not yet paid for. Meaningless once `added`. */
  selected: boolean;
  onToggleSelect: () => void;
  onRemove: () => void;
}) {
  const Icon = addon.icon;

  return (
    /*
     * A fixed header over a scrolling body, rather than one long scroller: the
     * price and Add to sidebar are the two things someone comes back to after
     * reading, and having to scroll up to reach them is the reason this panel
     * needed fixing in the first place.
     *
     * Keyed by the caller, so switching add-ons replays the entrance rather
     * than swapping text under the reader.
     */
    <div className="motion-safe:animate-fade-rise flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b p-5 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-xl font-semibold tracking-tight">
              {addon.name} add-on
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-medium tabular">
                {addonPrice(addon)}
              </Badge>
              {added && (
                <Badge variant="success" className="gap-1">
                  <Check className="size-3" aria-hidden />
                  Added
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {added ? (
            <>
              <Button variant="outline" disabled className="min-w-[9rem]">
                <Check aria-hidden />
                Added
              </Button>
              {/* Quiet, and below: removing is rare and shouldn't sit at the
                  same weight as the thing most people came to do. */}
              <button
                type="button"
                onClick={onRemove}
                className="rounded text-xs font-medium text-muted-foreground underline-offset-4 outline-none hover:text-destructive hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                Remove from plan
              </button>
            </>
          ) : (
            /*
              Selecting, not adding. A paid add-on joins a cart and activates
              when it's paid for — so this button says what pressing it does,
              and the cart bar at the foot of the catalogue says what it will
              cost. Solid when it's the next thing to do, outline once it's in
              the cart, because at that point the next thing to do is down
              there.
            */
            <Button
              variant={selected ? "outline" : "default"}
              className="min-w-[9rem]"
              onClick={onToggleSelect}
            >
              {selected ? (
                <>
                  <Check aria-hidden />
                  Selected · remove
                </>
              ) : (
                "Select"
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Everything below the header scrolls, and only this. */}
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
        <VideoPoster subject={addon.video} />

        <div className="grid gap-3 sm:grid-cols-3">
          {addon.benefits.map((benefit) => (
            <div
              key={benefit}
              className="flex items-start gap-2 rounded-lg border border-border surface-subtle p-3"
            >
              <Check
                className="mt-0.5 size-3.5 shrink-0 text-success"
                aria-hidden
              />
              <p className="text-xs leading-relaxed">{benefit}</p>
            </div>
          ))}
        </div>

        <div className="space-y-5">
          <Section title="Overview" body={addon.overview} />
          <Section title="What it does" body={addon.whatItDoes} />
          <Section title="Why it helps" body={addon.whyItHelps} />
          <Section title="How it works" body={addon.howItWorks} />
        </div>

        <div className="space-y-3 rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold">What&apos;s included</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {addon.included.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <Check
                  className="mt-0.5 size-3.5 shrink-0 text-primary"
                  aria-hidden
                />
                <span className="leading-relaxed text-muted-foreground">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </section>
  );
}

/**
 * The video that isn't there yet.
 *
 * A gradient poster and a play glyph rather than an embed: it's honest about
 * being a placeholder while still holding the space the real thing will take,
 * so the panel doesn't reflow the day a video lands. Not a button — there's
 * nothing to press — so it isn't in the tab order pretending otherwise.
 */
function VideoPoster({ subject }: { subject: string }) {
  return (
    <div
      className={cn(
        "relative flex aspect-video w-full items-end overflow-hidden rounded-xl",
        "bg-gradient-to-br from-primary via-primary to-[#3730A3]",
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.22),transparent_60%)]"
        aria-hidden
      />
      <span
        className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-primary shadow-lg"
        aria-hidden
      >
        <Play className="size-6 translate-x-0.5 fill-current" />
      </span>
      <p className="relative z-10 flex items-center gap-2 p-4 text-sm font-medium text-white">
        <Sparkles className="size-4 shrink-0" aria-hidden />
        Watch: {subject} in 90 seconds
      </p>
    </div>
  );
}
