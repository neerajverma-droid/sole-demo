"use client";

import * as React from "react";
import { Check, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DEFAULT_CARD_VISIBILITY,
  UNIBOX_CARD_OPTIONS,
  cardVisibilityKey,
  parseCardVisibility,
  toggleCardVisibility,
  visibleCardCount,
  type UniboxCardId,
} from "@/lib/unibox";
import { cn } from "@/lib/utils";
import { sessionUserId, useSessionStore } from "@/stores/session";
import { useBusinessesStore } from "@/stores/businesses";

export type CardVisibility = {
  isVisible: (id: UniboxCardId) => boolean;
  toggle: (id: UniboxCardId) => void;
  /** How many cards the grid will draw — Liabilities & equity counts as two. */
  visibleCount: number;
};

/**
 * Which cards the grid shows, remembered per user and per business in local
 * storage under the old page's key — so a preference set in sole-webapp
 * carries over.
 *
 * Every card is offered on every plan. sole-webapp locked some behind plan
 * features, but this app has no feature check to map them to, and guessing at
 * one hid cards that should show — so only these toggles hide a card.
 */
export function useCardVisibility(): CardVisibility {
  const user = useSessionStore((state) => state.user);
  const businessId = useBusinessesStore((state) => state.activeId);
  const userId = sessionUserId(user);
  const key = userId ? cardVisibilityKey(userId, businessId || null) : null;

  const [visibility, setVisibility] = React.useState(DEFAULT_CARD_VISIBILITY);
  const loadedKey = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!key) return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      /* storage blocked — every card shows */
    }
    setVisibility(parseCardVisibility(raw));
    loadedKey.current = key;
  }, [key]);

  React.useEffect(() => {
    if (!key || loadedKey.current !== key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(visibility));
    } catch {
      /* private mode, full storage — the choice still holds for this visit */
    }
  }, [key, visibility]);

  return {
    isVisible: (id) => visibility[id] !== false,
    toggle: (id) => setVisibility((current) => toggleCardVisibility(current, id)),
    visibleCount: visibleCardCount(visibility),
  };
}

export function CustomiseMenu({ cards }: { cards: CardVisibility }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-usertour="quick-actions-customise"
        >
          <SlidersHorizontal />
          Customise
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1.5">
        <DropdownMenuLabel className="px-2 py-1.5 text-sm font-semibold">Show on home</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {UNIBOX_CARD_OPTIONS.map((option) => {
          const checked = cards.isVisible(option.id);
          return (
            <DropdownMenuItem
              key={option.id}
              // Kept open, so several cards can be switched in one visit.
              onSelect={(event) => {
                event.preventDefault();
                cards.toggle(option.id);
              }}
              className="gap-2.5 rounded-md px-2 py-1.5 text-[13px]"
            >
              <span
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded border transition-colors",
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-transparent",
                )}
                aria-hidden
              >
                <Check className="size-3" strokeWidth={3} />
              </span>
              {option.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
