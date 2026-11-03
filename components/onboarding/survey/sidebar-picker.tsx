"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { ADDITIONAL_NAV, NAV, type NavItem, type NavLeaf } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The sidebar, as a list you can switch on and off — the pins step's picker.
 *
 * Ported from `sole-webapp/components/OnboardingSurveyPopup/SidebarPicker.js`.
 * A checklist rather than a column of switches: a tick reads as "this goes in
 * my sidebar" without anyone having to learn which side of a toggle is on.
 * The whole row's label is the click target, not just the box. The chevron
 * that opens a group is the one thing that isn't, so it stays a separate
 * button with its own label.
 *
 * Two differences from source, both because this app's nav catalogue
 * (`lib/nav.ts`) shapes the problem differently:
 *
 * - Source grouped rows under several labelled sections (`NAV_GROUPS`, one per
 *   nav category). This app's rail itself has a single "Main" section, plus a
 *   separate catalogue of items that start life in More
 *   (`ADDITIONAL_NAV` — Liabilities, Contacts, the reporting suite,
 *   Migrations). Both catalogues are pinnable (`pinTargets` resolves ids
 *   against all of them, not just what's currently in the rail), so this
 *   picker shows both, under two headings: "Your sidebar" for what ships by
 *   default, "More" for what a pin can add before it's ever been added to Main.
 * - Source badged some rows as locked, paid add-ons and excluded them from
 *   toggling (`isLocked`, `PINNABLE_ITEMS`). This app's add-ons
 *   (`lib/addons.ts`) aren't part of the pinnable catalogue at all —
 *   `lib/nav.ts`'s own `PIN_TARGETS` deliberately excludes them ("a pin that
 *   put a second copy of a row in PINNED would make adding an add-on look
 *   like it had landed in two places") — so there is no locked row to badge
 *   here, and the lock/add-on badge is dropped rather than ported dead code.
 */

/** Everyone gets these — the rail's shipped defaults. */
const PIN_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Your sidebar", items: NAV[0]?.items ?? [] },
  { label: "More", items: ADDITIONAL_NAV },
];

function Row({
  id,
  label,
  icon: Icon,
  depth = 0,
  checked,
  recommended,
  tabCount,
  open,
  onOpen,
  onToggle,
}: {
  id: string;
  label: string;
  icon?: NavItem["icon"];
  depth?: number;
  /** "indeterminate" on a group with only some of its pages ticked. */
  checked: boolean | "indeterminate";
  recommended: boolean;
  tabCount: number;
  open: boolean;
  onOpen?: () => void;
  onToggle: () => void;
}) {
  const checkboxId = `sidebar-pin-${id}`;
  const pinned = checked !== false;

  return (
    <div
      className={cn(
        "flex items-center rounded-lg border bg-card transition-colors",
        pinned
          ? "border-primary/40 bg-primary/5"
          : "border-border hover:bg-muted/40",
      )}
    >
      {/* The whole label is the click target, not just the box on the end. */}
      <label
        htmlFor={checkboxId}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2.5"
      >
        <Checkbox
          id={checkboxId}
          checked={checked}
          onCheckedChange={onToggle}
        />

        {Icon && depth === 0 ? (
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              pinned ? "text-primary" : "text-muted-foreground",
            )}
          />
        ) : null}

        <span
          className={cn(
            "min-w-0 truncate text-sm text-foreground",
            depth === 0 ? "font-medium" : "font-normal",
          )}
        >
          {label}
        </span>

        {/* On the same line as the label — a second line per row doubled the
            height of the list for a few words. */}
        {recommended ? (
          <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
            Suggested for your work
          </span>
        ) : tabCount ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {tabCount} page{tabCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </label>

      {/* Its own button, not part of the label: opening a group and adding it
          to the sidebar are two different things. */}
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} what's inside ${label}`}
          className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          />
        </button>
      ) : null}
    </div>
  );
}

/*
 * A group and its pages are one tree of checkboxes, but not one list of pins.
 *
 * Pinning a group already brings every page along as its submenu
 * (`lib/nav.ts`'s `PIN_TARGETS`), so a group with all its pages ticked is
 * stored as the group's id alone — storing the pages too would put each of
 * them in the sidebar twice. Only a partial selection is stored page by page.
 */

function groupState(
  item: NavItem,
  pinnedIds: string[],
): boolean | "indeterminate" {
  const children = item.children ?? [];
  if (pinnedIds.includes(item.id)) return true;
  if (children.length === 0) return false;
  const ticked = children.filter((child) => pinnedIds.includes(child.id));
  if (ticked.length === 0) return false;
  return ticked.length === children.length ? true : "indeterminate";
}

/** Ticks every page (as the group's own id), or clears them all. */
function toggleGroupPin(item: NavItem, pinnedIds: string[]): string[] {
  const childIds = (item.children ?? []).map((child) => child.id);
  const rest = pinnedIds.filter(
    (id) => id !== item.id && !childIds.includes(id),
  );
  return groupState(item, pinnedIds) === true ? rest : [...rest, item.id];
}

function toggleChildPin(
  item: NavItem,
  childId: string,
  pinnedIds: string[],
): string[] {
  const childIds = (item.children ?? []).map((child) => child.id);

  // Unticking one page of a whole group: the group pin becomes its siblings.
  if (pinnedIds.includes(item.id)) {
    return [
      ...pinnedIds.filter((id) => id !== item.id),
      ...childIds.filter((id) => id !== childId && !pinnedIds.includes(id)),
    ];
  }

  if (pinnedIds.includes(childId)) {
    return pinnedIds.filter((id) => id !== childId);
  }

  // Ticking the last page left: collapse the pages back into the group.
  const next = [...pinnedIds, childId];
  return childIds.every((id) => next.includes(id))
    ? [...next.filter((id) => !childIds.includes(id)), item.id]
    : next;
}

export function SidebarPicker({
  pinnedIds,
  recommendedIds = [],
  onChange,
}: {
  pinnedIds: string[];
  /** Why a row came pre-ticked — see `Row`'s `recommended` prop. */
  recommendedIds?: string[];
  /** The whole next list: one tick on a group can change several ids. */
  onChange: (ids: string[]) => void;
}) {
  /** Groups holding something the user just switched on start open. */
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(() => {
    const open = new Set<string>();
    for (const group of PIN_GROUPS) {
      for (const item of group.items) {
        if (item.children?.some((child) => pinnedIds.includes(child.id))) {
          open.add(item.id);
        }
      }
    }
    return open;
  });

  const toggleGroup = (id: string) =>
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-5">
      {PIN_GROUPS.map((group) => {
        if (group.items.length === 0) return null;

        return (
          <div key={group.label}>
            <p className="m-0 mb-2 text-xs font-medium text-muted-foreground">
              {group.label}
            </p>

            <div className="space-y-1.5">
              {group.items.map((item) => {
                const children: NavLeaf[] = item.children ?? [];
                const open = openGroups.has(item.id);

                return (
                  <div key={item.id} className="space-y-1.5">
                    <Row
                      id={item.id}
                      label={item.label}
                      icon={item.icon}
                      checked={groupState(item, pinnedIds)}
                      recommended={recommendedIds.includes(item.id)}
                      tabCount={children.length}
                      open={open}
                      onOpen={
                        children.length ? () => toggleGroup(item.id) : undefined
                      }
                      onToggle={() =>
                        onChange(toggleGroupPin(item, pinnedIds))
                      }
                    />

                    {open && children.length > 0 && (
                      // The rail is what makes these read as "inside" the
                      // group rather than as more top-level rows.
                      <div className="ml-5 space-y-1.5 border-l border-border pl-3">
                        {children.map((child) => (
                          <Row
                            key={child.id}
                            id={child.id}
                            label={child.label}
                            depth={1}
                            checked={
                              pinnedIds.includes(item.id) ||
                              pinnedIds.includes(child.id)
                            }
                            recommended={recommendedIds.includes(child.id)}
                            tabCount={0}
                            open={false}
                            onToggle={() =>
                              onChange(
                                toggleChildPin(item, child.id, pinnedIds),
                              )
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
