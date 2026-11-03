"use client";

import Link from "next/link";
import { useAtom } from "jotai";
import { Check, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sidebarExtraIdsAtom, sidebarHiddenAtom } from "@/lib/atoms";
import { ADDITIONAL_NAV, type AdditionalNavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * More's second tab: the parts of the product that aren't in the rail.
 *
 * Free destinations, not paid upgrades, and drawn to say so. No price, no top
 * strip, no category wash, no lock — a plain bordered row on the card surface,
 * laid out sideways where an add-on card stacks. The visual distance is the
 * point: someone scanning the two tabs should be able to tell at a glance which
 * one costs money.
 */
export function AdditionalItems({ onNavigate }: { onNavigate: () => void }) {
  const [extras, setExtras] = useAtom(sidebarExtraIdsAtom);
  /*
   * The switched-off list, only so adding can clear an entry from it. Someone
   * who adds an item, hides it in Customise sidebar and then adds it again from
   * here has plainly asked for it in the rail, and a button that said "Add to
   * sidebar" and left it hidden would be the one control in More that appeared
   * to do nothing.
   */
  const [hidden, setHidden] = useAtom(sidebarHiddenAtom);

  const add = (item: AdditionalNavItem) => {
    setExtras((current) =>
      current.includes(item.id) ? current : [...current, item.id],
    );
    setHidden((current) => current.filter((id) => id !== item.id));
    toast.success(`${item.label} added to your sidebar`, {
      description:
        "It's under Main, below Expenses — drag it wherever you like.",
    });
  };

  const remove = (item: AdditionalNavItem) => {
    setExtras((current) => current.filter((id) => id !== item.id));
    toast(`${item.label} removed from your sidebar`, {
      description: "It's still here in More — add it back any time.",
    });
  };

  /**
   * Added *and* showing.
   *
   * An item switched off in Customise sidebar isn't in the rail, so saying it
   * is would be wrong — and the button beside it is what puts it back.
   */
  const isInSidebar = (item: AdditionalNavItem) =>
    extras.includes(item.id) && !hidden.includes(item.id);

  /*
   * Two groups rather than one list with mixed controls.
   *
   * A flat grid made "what have I got" and "what could I have" the same
   * question, answered only by reading each card's button — so the two are
   * split and headed, and a row moves between them as it's added or removed.
   * Partitioned rather than sorted: the order inside each group stays
   * `ADDITIONAL_NAV`'s, so nothing jumps about except the row that changed.
   */
  const inSidebar = ADDITIONAL_NAV.filter(isInSidebar);
  const available = ADDITIONAL_NAV.filter((item) => !isInSidebar(item));

  const rows = (items: AdditionalNavItem[]) => (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.id}>
          <AdditionalRow
            item={item}
            inSidebar={isInSidebar(item)}
            onAdd={() => add(item)}
            onRemove={() => remove(item)}
            onNavigate={onNavigate}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-5">
      {/* Hidden when empty, both of them: a heading over nothing is a heading
          that reports a group you don't have rather than one you do. */}
      {inSidebar.length > 0 && (
        <section className="space-y-2">
          <GroupHeading>In your sidebar</GroupHeading>
          {rows(inSidebar)}
        </section>
      )}

      {available.length > 0 && (
        <section className="space-y-2">
          <GroupHeading>Available to add</GroupHeading>
          {rows(available)}
        </section>
      )}
    </div>
  );
}

/** The small uppercase heading over each group, as the add-ons rail uses. */
function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

/**
 * Where an item's name goes when it's clicked.
 *
 * A group has no route of its own, so it opens on the first of its tabs that
 * does — which is the same place the rail's group would take someone after one
 * more click. A group whose tabs are all still to be built has nowhere to go,
 * and gets the same "coming soon" its row in the rail would give.
 */
function target(item: AdditionalNavItem): string | undefined {
  return item.href ?? item.children?.find((child) => child.href)?.href;
}

function AdditionalRow({
  item,
  inSidebar,
  onAdd,
  onRemove,
  onNavigate,
}: {
  item: AdditionalNavItem;
  inSidebar: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const href = target(item);

  return (
    <div
      className={cn(
        "group relative flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-3",
        "motion-safe:transition-colors hover:border-primary/30",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg",
            // Neutral, where an add-on's tile is indigo or teal. These aren't
            // categorised, because there's nothing to tell apart: it's one list.
            "bg-muted text-foreground",
          )}
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-sm font-semibold">{item.label}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {item.description}
          </p>
        </div>
      </div>

      {/*
        The state and the action as two things. A single button that said
        "Added" and removed on click would be naming the state and doing the
        opposite — so the badge says where it is and the button says what
        pressing it will do.

        `relative z-10` lifts this row above the overlay below, so the button
        takes its own clicks rather than the card's. `stopPropagation` on top of
        that: the overlay isn't an ancestor of these buttons today, but the next
        person to restructure this card shouldn't have to rediscover that adding
        to the sidebar must not also navigate away from the modal.
      */}
      <div className="relative z-10 mt-auto flex items-center gap-2">
        {inSidebar ? (
          <>
            <Badge variant="success" className="gap-1">
              <Check className="size-3" aria-hidden />
              In your sidebar
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              <Minus aria-hidden />
              Remove
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onAdd();
            }}
          >
            <Plus aria-hidden />
            Add to sidebar
          </Button>
        )}
      </div>

      {/*
        The card body, as an overlay laid under the controls above — the same
        pattern the add-on cards use, because a link or button wrapping another
        button is invalid markup and ambiguous about what a click means.

        A group has no route of its own, so it opens the first of its tabs that
        does. One with nothing built yet has nowhere to go, and says so rather
        than navigating to a page that isn't there.
      */}
      {href ? (
        <Link
          href={href}
          onClick={onNavigate}
          aria-label={`Open ${item.label}`}
          className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <button
          type="button"
          onClick={() => toast(`${item.label} is coming soon`)}
          aria-label={`Open ${item.label}`}
          className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
    </div>
  );
}
