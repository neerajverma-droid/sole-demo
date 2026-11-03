"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAtom } from "jotai";
import {
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  Gift,
  GraduationCap,
  LibraryBig,
  ListChecks,
  LogOut,
  Megaphone,
  Pin,
  Puzzle,
  Scale,
  TrendingUp,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  NavGroupLabel,
  NavRow,
  type NavPin,
} from "@/components/layout/nav-row";
import { SoleLogo } from "@/components/layout/sole-logo";
import { CommunityDialog } from "@/components/layout/community-dialog";
import { EducationDialog } from "@/components/layout/education-dialog";
import { LogoutDialog } from "@/components/layout/logout-dialog";
import { SupportDialog } from "@/components/layout/support-dialog";
import { BusinessSwitcher } from "@/components/layout/business-switcher";
import { MoreAddonsDialog } from "@/components/addons/more-addons-dialog";
import {
  collapsedNavSectionsAtom,
  customiseSidebarOpenAtom,
  hasPinnedAtom,
  moreAddonsOpenAtom,
  pinnedNavIdsAtom,
  sidebarChildOrderAtom,
  sidebarExtraIdsAtom,
  sidebarHiddenAtom,
  sidebarOrderAtom,
} from "@/lib/atoms";
import { actionItems } from "@/lib/quick-actions";
import { SPRINTLAW_URL } from "@/lib/partner-hubs";
import { useSidebarSync } from "@/hooks/use-sidebar-sync";
import { useAddons } from "@/hooks/use-addons";
import { toIsoDate } from "@/lib/invoices";
import {
  ADDONS_SECTION,
  DASHBOARD_NAV,
  MAIN_SECTION,
  PROFILE_HREF,
  QUICK_ACTIONS_NAV,
  REFERRAL_HREF,
  RESOURCES_HREF,
  SOLE_PERKS_HREF,
  addonRows,
  findOpenGroup,
  isActivePath,
  pinTargets,
  replacedNavIds,
  sectionOrder,
  sectionsCoverPath,
  visibleNav,
  localiseNav,
  localiseNavLabel,
  type NavItem,
  type NavSection,
} from "@/lib/nav";
import { useCountryContext } from "@/hooks/use-country-context";
import { returnWord } from "@/lib/country-context";
import { useAccountIdentity } from "@/hooks/use-account-identity";
import { cn } from "@/lib/utils";
import { useExpensesStore } from "@/stores/expenses";
import { useInvoicesStore } from "@/stores/invoices";
import { useQuotesStore } from "@/stores/quotes";
import { useTransactionsStore } from "@/stores/transactions";

const PINNED_SECTION = "Pinned";

export function AppSidebar() {
  const pathname = usePathname() ?? "";
  const { setOpenMobile } = useSidebar();

  const [expanded, setExpanded] = React.useState<string | null>(null);
  const openGroup = expanded !== null ? expanded : findOpenGroup(pathname);

  useSidebarSync();

  const [pinnedIds, setPinnedIds] = useAtom(pinnedNavIdsAtom);
  const [hasPinned, setHasPinned] = useAtom(hasPinnedAtom);
  const [order, setOrder] = useAtom(sidebarOrderAtom);
  const [childOrder] = useAtom(sidebarChildOrderAtom);
  const [storedHidden] = useAtom(sidebarHiddenAtom);
  const [extras] = useAtom(sidebarExtraIdsAtom);
  /*
   * What's on the plan, from the plan. This used to be a localStorage list that
   * agreed with the subscription only by accident — so the ADD-ONS section
   * could show rows nobody was billed for, and hide ones they were.
   */
  const { activeIds: added } = useAddons();

  /*
   * `atomWithStorage` hands back whatever localStorage holds, which is whatever
   * the last version of this code put there — a list added after someone's last
   * visit arrives undefined. Normalised once here rather than at each of the
   * three places below that iterate it.
   */
  const hidden = storedHidden ?? [];

  /*
   * Rows an add-on on the plan has taken over. The asset register is the first:
   * adding it doesn't give someone a second place to keep assets, so the free
   * row stands down and the paid one takes its place in ADD-ONS.
   */
  const replaced = replacedNavIds(added);
  /*
   * A pin is a move, not a copy: `pinnedIds` goes in so the rows that went up
   * to PINNED come out of the section they came from. Otherwise the shortcut
   * list makes the rail longer than it was before anyone used it.
   *
   * The raw stored ids rather than the resolved `pinned` below, and that order
   * matters: `pinned` has the hidden and superseded ones filtered out, and
   * feeding that back here would put a row someone had switched off back into
   * MAIN the moment they pinned it.
   */
  /*
   * The rail says what this business's country calls a thing: "BAS report" in
   * Australia, "GST return report" in New Zealand. Only the label changes —
   * the row's id stays `bas`, because pins, hidden rows and section order are
   * keyed by it and live in this person's own storage.
   */
  const { country } = useCountryContext();
  const navWords = { taxReturn: returnWord(country) };

  const sections = localiseNav(
    visibleNav({
      order,
      childOrder,
      hidden,
      extras,
      replaced,
      pinned: pinnedIds,
    }),
    navWords,
  );

  /*
   * A switched-off row is off everywhere, its shortcut included — a pin that
   * survived hiding would make the switch look broken. By exact id, so hiding
   * the Sales group takes away a pinned Sales row and leaves a pinned Invoices
   * one: they asked to hide Sales, not Invoices.
   */
  const pinned = pinTargets(pinnedIds)
    .filter((item) => !hidden.includes(item.id) && !replaced.includes(item.id))
    // A pinned row is the same row, so it reads the same as it does in its
    // own section rather than reverting to the Australian wording.
    .map((item) => ({
      ...item,
      label: localiseNavLabel(item.id, item.label, navWords),
    }));

  /*
   * The add-ons on the plan, which is the whole of the ADD-ONS section: being
   * added *is* having a row, so there's no separate list of what's showing and
   * nothing to reconcile. The list's order is the section's order, which is what
   * a drag in it rewrites.
   */
  const addonsSection: NavSection = {
    section: ADDONS_SECTION,
    items: addonRows(added, order[ADDONS_SECTION]),
  };

  const [, setMoreOpen] = useAtom(moreAddonsOpenAtom);
  const [, setCustomiseOpen] = useAtom(customiseSidebarOpenAtom);

  const [collapsedSections, setCollapsedSections] = useAtom(
    collapsedNavSectionsAtom,
  );
  /**
   * Sections collapsed by hand in this session, which outrank the auto-expand
   * below — otherwise a heading holding the current route couldn't be closed at
   * all, and its chevron would look broken.
   */
  const [sessionCollapsed, setSessionCollapsed] = React.useState<
    Record<string, boolean>
  >({});

  const sectionOpen = (section: NavSection) => {
    if (sessionCollapsed[section.section]) return false;
    // A collapsed section still opens when the route is inside it: a hidden
    // active row is worse than an ignored preference.
    return (
      !collapsedSections[section.section] ||
      sectionsCoverPath([section], pathname)
    );
  };

  const toggleSection = (section: NavSection) => {
    const next = !sectionOpen(section);
    setCollapsedSections((current) => ({
      ...current,
      [section.section]: !next,
    }));
    setSessionCollapsed((current) => ({
      ...current,
      [section.section]: !next,
    }));
  };

  const togglePin = (id: string) => {
    // Pinning is the lesson the faint icons were there to teach, so doing it
    // once retires them.
    setHasPinned(true);
    setPinnedIds((current) => {
      const next = current.includes(id)
        ? current.filter((pinnedId) => pinnedId !== id)
        : [...current, id];
      // No save call here: `useSidebarSync` watches this atom and posts the
      // list once it settles. Which is also what makes a dragged reorder
      // persist — that writes the same atom and used to save nothing at all.
      return next;
    });
  };

  /* ---------------------------------------------------------------- *
   * Reordering
   * ---------------------------------------------------------------- */

  /**
   * Which row is being dragged, and out of which list.
   *
   * One piece of state for every reorderable section rather than one each,
   * because it's one pointer: two lists that each thought a drag was theirs is
   * exactly how a row ends up in the wrong section. The scope is what refuses
   * that — a section only moves rows that started in it.
   */
  const [dragging, setDragging] = React.useState<{
    scope: string;
    id: string;
  } | null>(null);

  /** Drop the dragged id in at the target's index, the rest closing up after. */
  const reorder = (ids: string[], dragged: string, target: string) => {
    const from = ids.indexOf(dragged);
    const to = ids.indexOf(target);
    if (from === -1 || to === -1 || from === to) return null;
    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    return next;
  };

  const movePin = (dragged: string, target: string) =>
    setPinnedIds((current) => reorder(current, dragged, target) ?? current);

  /**
   * Main's order, resolved inside the updater rather than captured at render.
   *
   * A drag fires this repeatedly, and a list read at render time would be a
   * frame behind the one on screen. `sectionOrder` resolves the person's stored
   * order against the catalogue, so the first drag in Main has a full list to
   * rearrange rather than the empty map storage holds until then.
   *
   * The list it writes includes switched-off rows. Both ends of a drag are
   * visible ones, so the visible order comes out right and a hidden row keeps
   * its place for whenever it's switched back on.
   */
  const moveMain = (dragged: string, target: string) =>
    setOrder((current) => {
      const next = reorder(
        sectionOrder(MAIN_SECTION, current, extras),
        dragged,
        target,
      );
      return next ? { ...current, [MAIN_SECTION]: next } : current;
    });

  /*
   * The ADD-ONS list belongs to the subscription, so a drag can't rewrite it —
   * and shouldn't: what order someone likes their rows in is not a fact about
   * what they're billed for. The arrangement is stored like every other
   * section's instead, under the ADD-ONS heading in the same layout the
   * customise modal writes, which also means it syncs and survives a device.
   */
  const moveAddon = (dragged: string, target: string) =>
    setOrder((current) => {
      const next = reorder(current[ADDONS_SECTION] ?? added, dragged, target);
      return next ? { ...current, [ADDONS_SECTION]: next } : current;
    });

  /** What a reorderable section needs, bound to the list it rearranges. */
  const dragFor = (scope: string, onMove: (a: string, b: string) => void) => ({
    scope,
    active: dragging,
    onStart: (id: string) => setDragging({ scope, id }),
    onEnter: (id: string) => {
      // Same list, different row: anything else is a drag that started
      // somewhere this section has no business moving rows for.
      if (dragging?.scope === scope && dragging.id !== id)
        onMove(dragging.id, id);
    },
    onEnd: () => setDragging(null),
  });

  /**
   * The stored value arrives an effect after mount, so the faint pins can only
   * be judged once we're on the client.
   */
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  /** The training-wheels affordance, until they've pinned something once. */
  const showFaintPins = mounted && !hasPinned;

  const closeMobile = () => setOpenMobile(false);

  /** Every row dismisses the mobile sheet; targetless rows also toast. */
  const selectRow = (label: string, href?: string) => () => {
    closeMobile();
    if (!href) comingSoon(label);
  };

  /** What every row needs to know, wherever in the nav it turns up. */
  const entry: EntryContext = {
    pathname,
    openGroup,
    onToggleGroup: (id) => setExpanded(openGroup === id ? "" : id),
    onSelectRow: selectRow,
    pinnedIds,
    onTogglePin: togglePin,
    alwaysShowPin: showFaintPins,
  };

  return (
    <Sidebar data-usertour="app-sidebar">
      <SidebarHeader className="h-14 justify-center border-b px-4">
        <Link
          href="/dashboard"
          onClick={closeMobile}
          className="w-fit rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SoleLogo />
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0 px-2 pb-4 ">
        <div className="space-y-1 border-b border-border pb-2 pt-2 ">
          <BusinessSwitcher />
          <QuickActionsSlot onNavigate={closeMobile} pathname={pathname} />
          <FixtureRow
            href={DASHBOARD_NAV.href}
            label={DASHBOARD_NAV.label}
            icon={DASHBOARD_NAV.icon}
            pathname={pathname}
            onNavigate={closeMobile}
          />
        </div>

        <nav aria-label="Main">
          {pinned.length > 0 ? (
            <PinnedSection
              items={pinned}
              entry={entry}
              drag={dragFor(PINNED_SECTION, movePin)}
            />
          ) : (
            <PinnedPlaceholder />
          )}

          {sections.map((section) => (
            <NavSectionBlock
              key={section.section}
              section={section}
              entry={entry}
              open={sectionOpen(section)}
              onToggle={() => toggleSection(section)}
              drag={dragFor(section.section, moveMain)}
            />
          ))}

          {/*
            The heading doesn't render at zero, because there's nothing to head:
            an ADD-ONS label over empty space would advertise a section of the
            rail most people never open, which is what More is for.
          */}
          {addonsSection.items.length > 0 && (
            <NavSectionBlock
              section={addonsSection}
              entry={entry}
              open={sectionOpen(addonsSection)}
              onToggle={() => toggleSection(addonsSection)}
              drag={dragFor(ADDONS_SECTION, moveAddon)}
            />
          )}
        </nav>
      </SidebarContent>
      <SidebarFooter className="gap-0">
        <button
          type="button"
          onClick={() => {
            closeMobile();
            setMoreOpen(true);
          }}
          aria-haspopup="dialog"
          className={cn(
            "flex w-full items-center gap-3 rounded-md py-1 pl-3 pr-3 text-left outline-none",
            "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Puzzle className="size-4 shrink-0" aria-hidden />
          <span className="truncate text-sm font-semibold">More</span>
        </button>
        <div className="my-2 h-px bg-border" />
        <UserMenu />
      </SidebarFooter>

      <MoreAddonsDialog />
    </Sidebar>
  );
}

function FixtureRow({
  href,
  label,
  icon: Icon,
  count,
  pathname,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown on the right when there's something to say. */
  count?: number;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = isActivePath(pathname, href);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-md py-2 pl-3 pr-2 text-left outline-none",
        "transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-indigo-50 text-primary hover:bg-indigo-100 dark:bg-primary/15 dark:hover:bg-primary/20"
          : "hover:bg-accent",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate text-sm font-semibold">{label}</span>

      {/*
        Muted rather than red, for the reason the Dashboard's card gives for the
        same figure: this is how much there is to do, not an alarm. A count that
        shouts from the rail on every page would be shouting most of the time.
      */}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium tabular",
            active
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {count}
          <span className="sr-only"> items to action</span>
        </span>
      )}

      {active ? (
        <span
          className="absolute right-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-l-full bg-primary"
          aria-hidden
        />
      ) : null}
    </Link>
  );
}

/**
 * Quick Actions, and the count of what's on it.
 *
 * Its own component so the four stores behind the count are subscribed here
 * rather than in `AppSidebar` — a transaction changing shouldn't re-render the
 * whole rail to move one number.
 */
function QuickActionsSlot({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: () => void;
}) {
  const invoices = useInvoicesStore((state) => state.invoices);
  const expenses = useExpensesStore((state) => state.expenses);
  const quotes = useQuotesStore((state) => state.quotes);
  const transactions = useTransactionsStore((state) => state.transactions);

  const count = actionItems({
    invoices,
    quotes,
    expenses,
    transactions,
    today: toIsoDate(new Date()),
  }).length;

  return (
    <FixtureRow
      href={QUICK_ACTIONS_NAV.href}
      label={QUICK_ACTIONS_NAV.label}
      icon={ListChecks}
      count={count}
      pathname={pathname}
      onNavigate={onNavigate}
    />
  );
}

/**
 * What a reorderable section needs to know.
 *
 * `active` is the drag in flight anywhere in the rail; `scope` is this list's
 * name. A section only acts on a drag whose scope is its own, which is the whole
 * of the "no dragging between sections" rule — there's no check to forget,
 * because a foreign drag simply never matches.
 */
type SectionDrag = {
  scope: string;
  active: { scope: string; id: string } | null;
  onStart: (id: string) => void;
  onEnter: (id: string) => void;
  onEnd: () => void;
};

/**
 * The rows of one list, draggable within it.
 *
 * Reordering happens on drag-enter rather than on drop, so the list rearranges
 * under the pointer and the row you're dragging is always where you'd let go.
 * That makes the drop itself a no-op, and an abandoned drag keeps the order it
 * had reached — which is the one you last saw, so nothing jumps back.
 *
 * The handlers sit on the `<li>` and the grab cursor goes on the row inside it:
 * the whole row is the handle, because a rail this narrow has no room for a
 * column of grips and nowhere for one to hide until hover.
 */
function DraggableRows({
  items,
  entry,
  drag,
}: {
  items: NavItem[];
  entry: EntryContext;
  drag?: SectionDrag;
}) {
  const activeHere = drag && drag.active?.scope === drag.scope;

  return (
    <ul
      className={cn(
        "space-y-0.5 rounded-md",
        // The drop zone, and only while there's something to drop in it: a
        // permanent outline would be chrome, where this appears exactly when
        // it answers "where can this go".
        activeHere && "bg-primary/[0.04] ring-1 ring-primary/25",
        "motion-safe:transition-colors",
      )}
    >
      {items.map((item) => {
        const beingDragged = activeHere && drag?.active?.id === item.id;
        const row = (
          <NavEntry
            item={item}
            entry={entry}
            className={drag ? "cursor-grab active:cursor-grabbing" : undefined}
          />
        );

        return (
          <li
            key={item.id}
            {...(drag
              ? {
                  draggable: true,
                  onDragStart: (event: React.DragEvent) => {
                    event.dataTransfer.effectAllowed = "move";
                    // Firefox starts no drag at all without payload.
                    event.dataTransfer.setData("text/plain", item.id);
                    drag.onStart(item.id);
                  },
                  onDragEnter: () => drag.onEnter(item.id),
                  // Without this the row refuses the drop and the drag ends
                  // nowhere.
                  onDragOver: (event: React.DragEvent) =>
                    event.preventDefault(),
                  onDrop: (event: React.DragEvent) => {
                    event.preventDefault();
                    drag.onEnd();
                  },
                  onDragEnd: drag.onEnd,
                }
              : {})}
            className={cn("transition-opacity", beingDragged && "opacity-50")}
          >
            {row}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A section heading and its rows.
 *
 * Given `open` and `onToggle` the heading becomes a collapsible trigger; given
 * neither it's a plain label. The heading itself is never draggable — a section
 * is what its rows mean rather than where it sits, so moving one would reorder
 * nothing and only make the labels wrong.
 */
function NavSectionBlock({
  section,
  entry,
  open,
  onToggle,
  drag,
}: {
  section: NavSection;
  entry: EntryContext;
  open?: boolean;
  onToggle?: () => void;
  drag?: SectionDrag;
}) {
  const rows = (
    <DraggableRows items={section.items} entry={entry} drag={drag} />
  );

  if (open === undefined || !onToggle) {
    return (
      <div>
        <NavGroupLabel>{section.section}</NavGroupLabel>
        {rows}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "group/section flex w-full items-center gap-2 rounded-md px-3 pb-2 pt-6 text-left outline-none",
            "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
            "transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span className="truncate">{section.section}</span>
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-150",
              !open && "-rotate-90",
            )}
            aria-hidden
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>{rows}</CollapsibleContent>
    </Collapsible>
  );
}

/** Anything the sidebar draws as a row: a top-level item or one of its children. */
type RowItem = {
  id: string;
  label: string;
  href?: string;
  icon?: LucideIcon;
  tone?: "teal" | "red";
  children?: { id: string; label: string; href?: string; icon?: LucideIcon }[];
};

type EntryContext = {
  pathname: string;
  openGroup: string | null;
  onToggleGroup: (id: string) => void;
  onSelectRow: (label: string, href?: string) => () => void;
  pinnedIds: string[];
  onTogglePin: (id: string) => void;
  /** Faint always-on pin icons, until the first pin teaches the gesture. */
  alwaysShowPin: boolean;
};

/**
 * One nav row, wherever it appears — pinned or in its own section, group or
 * leaf, top level or child. Every path through here ends at the same NavRow,
 * which is what guarantees the pin: there is no second row component left for a
 * call site to reach for and quietly leave the pin off.
 */
function NavEntry({
  item,
  entry,
  depth = 0,
  className,
}: {
  item: RowItem;
  entry: EntryContext;
  depth?: 0 | 1;
  /** Passed to the row itself — the grab cursor a draggable list wants. */
  className?: string;
}) {
  const pin: NavPin = {
    pinned: entry.pinnedIds.includes(item.id),
    onToggle: () => entry.onTogglePin(item.id),
    alwaysVisible: entry.alwaysShowPin,
  };

  if (item.children?.length) {
    return (
      <CollapsibleNavItem
        item={item}
        entry={entry}
        pin={pin}
        className={className}
      />
    );
  }

  return (
    <NavRow
      label={item.label}
      icon={item.icon}
      href={item.href}
      tone={item.tone}
      depth={depth}
      active={!!item.href && isActivePath(entry.pathname, item.href)}
      // A group that reaches here has children in the catalogue but none left
      // on screen — every one switched off. It has nothing to open and nowhere
      // of its own to go, so it isn't "coming soon" either. (The all-pinned
      // version of the same emptiness never gets here: `visibleNav` drops it.)
      onClick={
        item.children ? undefined : entry.onSelectRow(item.label, item.href)
      }
      pin={pin}
      className={className}
    />
  );
}

/**
 * The PINNED section before anything is in it. A ghost row rather than nothing
 * at all: an empty area teaches nothing, whereas a labelled slot says what the
 * space is for and where pinned tabs will land — which is the only way anyone
 * finds out pinning exists.
 */
function PinnedPlaceholder() {
  return (
    <div>
      <NavGroupLabel>Pinned</NavGroupLabel>
      <div className="flex items-center gap-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground/70">
        <Pin className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">Pin your most-used tabs here</span>
      </div>
    </div>
  );
}

/**
 * The shortcuts, above everything else. A pin is a copy rather than a move, so
 * the row stays in its own section as well for as long as it's pinned.
 */
function PinnedSection({
  items,
  entry,
  drag,
}: {
  items: NavItem[];
  entry: EntryContext;
  drag: SectionDrag;
}) {
  return (
    <div>
      <NavGroupLabel>Pinned</NavGroupLabel>
      <DraggableRows items={items} entry={entry} drag={drag} />
    </div>
  );
}

/**
 * A group row and its submenu. The row is the collapsible's trigger, so the pin
 * NavRow lays over it is a sibling of the trigger rather than inside it — a
 * click on the pin toggles the pin and leaves the group as it found it.
 */
function CollapsibleNavItem({
  item,
  entry,
  pin,
  className,
}: {
  item: RowItem;
  entry: EntryContext;
  pin: NavPin;
  className?: string;
}) {
  const isOpen = entry.openGroup === item.id;
  const hasActiveChild = !!item.children?.some(
    (child) => child.href && isActivePath(entry.pathname, child.href),
  );

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={() => entry.onToggleGroup(item.id)}
    >
      <CollapsibleTrigger asChild>
        <NavRow
          label={item.label}
          icon={item.icon}
          tone={item.tone}
          hasChildren
          expanded={isOpen}
          // A collapsed group owning the current route reads as active.
          active={hasActiveChild && !isOpen}
          pin={pin}
          className={className}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-0.5 space-y-0.5">
          {item.children?.map((child) => (
            <li key={child.id}>
              <NavEntry item={child} entry={entry} depth={1} />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function UserMenu() {
  const router = useRouter();
  const user = useAccountIdentity();
  const [confirmingLogout, setConfirmingLogout] = React.useState(false);
  const [supportOpen, setSupportOpen] = React.useState(false);
  const [educationOpen, setEducationOpen] = React.useState(false);
  const [communityOpen, setCommunityOpen] = React.useState(false);
  // Commented out with the Customise sidebar item below: More's third tab is
  // the way in now, and the account menu offering a second one was two doors
  // onto the same room. Uncomment both together to put it back.
  // const [, setCustomiseOpen] = useAtom(customiseSidebarOpenAtom);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {user.initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">
                {user.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </span>
            <ChevronsUpDown
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          className="w-[--radix-dropdown-menu-trigger-width]"
        >
          <DropdownMenuItem className="text-xs font-semibold" onSelect={() => router.push(PROFILE_HREF)}>
            <User className="text-muted-foreground" />
            Profile
          </DropdownMenuItem>
          {/* <DropdownMenuItem className="text-xs font-semibold" onSelect={() => setCustomiseOpen(true)}>
            <SlidersHorizontal className="text-muted-foreground" />
            Customise sidebar
          </DropdownMenuItem> */}
          <DropdownMenuItem className="text-xs font-semibold" onSelect={() => setSupportOpen(true)}>
            <CircleHelp className="text-muted-foreground" />
            Support
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs font-semibold" onSelect={() => setEducationOpen(true)}>
            <GraduationCap className="text-muted-foreground" />
            Education
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs font-semibold" onSelect={() => router.push(RESOURCES_HREF)}>
            <LibraryBig className="text-muted-foreground" />
            Resources
          </DropdownMenuItem>
          {/*
            Growth & Marketing is the one row still without anywhere to go —
            the old app's version was a picker over five different embedded
            tools with no shared destination, so there's no single link that
            would be faithful to it. Still a "coming soon" rather than a page
            guessing at content this app has no data for.
          */}
          <DropdownMenuItem className="text-xs font-semibold" onSelect={() => comingSoon("Growth & Marketing")}>
            <TrendingUp className="text-muted-foreground" />
            Growth & Marketing
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs font-semibold" asChild>
            <a href={SPRINTLAW_URL} target="_blank" rel="noopener noreferrer">
              <Scale className="text-muted-foreground" />
              Legal Help
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs font-semibold" onSelect={() => router.push(REFERRAL_HREF)}>
            <Gift className="text-primary" />
            <span className="text-primary">Refer & Earn $50</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs font-semibold" onSelect={() => setCommunityOpen(true)}>
            <Users className="text-muted-foreground" />
            Sole Community
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs font-semibold" onSelect={() => router.push(SOLE_PERKS_HREF)}>
            <Megaphone className="text-muted-foreground" />
            Sole Perks
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs font-semibold text-destructive focus:text-destructive"
            onSelect={() => setConfirmingLogout(true)}
          >
            <LogOut className="text-destructive" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
      <EducationDialog open={educationOpen} onOpenChange={setEducationOpen} />
      <CommunityDialog open={communityOpen} onOpenChange={setCommunityOpen} />
      <LogoutDialog
        open={confirmingLogout}
        onOpenChange={setConfirmingLogout}
      />
    </>
  );
}

function comingSoon(label: string) {
  toast(`${label} is coming soon`);
}
