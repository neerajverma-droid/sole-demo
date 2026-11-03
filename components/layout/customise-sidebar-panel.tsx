"use client";

import * as React from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  ChevronDown,
  GripVertical,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  customiseSidebarRecommendedAtom,
  resetSidebarLayoutAtom,
  sidebarChildOrderAtom,
  sidebarExtraIdsAtom,
  sidebarHiddenAtom,
  sidebarOrderAtom,
} from "@/lib/atoms";
import {
  childrenOrder,
  orderedNav,
  replacedNavIds,
  sectionOrder,
  type NavItem,
  type NavLeaf,
} from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useAddons } from "@/hooks/use-addons";
import {
  applyTools,
  sidebarDefaultsFor,
  whyRecommended,
} from "@/lib/workspace-tools";

/**
 * What a drag is currently rearranging.
 *
 * `scope` is the list the dragged row belongs to — a section heading for a top
 * level row, a group id for a child — and it's what refuses a drop into any
 * other list. `kind` picks which stored order the move writes to; the two can't
 * be collapsed into one, because scope alone wouldn't say whether "sales" meant
 * a row in a section or the parent of a submenu.
 */
type Dragging = {
  kind: "item" | "child";
  scope: string;
  id: string;
};

/**
 * Which nav rows an industry's recommendations correspond to, and why.
 *
 * The catalogue and the rail don't share a vocabulary: a workspace tool points
 * at either a top-level nav id or a tab inside a group, and the modal lists
 * top-level rows with their tabs nested underneath. So a recommendation for a
 * tab is resolved to the row that holds it — the parent is what someone has to
 * switch on for the tab to be reachable, which makes it the honest thing to
 * band and the honest thing to explain.
 *
 * Returns a map rather than a list because each row carries its own why-line,
 * and the line belongs to the tool that was recommended rather than to the row
 * it landed on.
 */
function recommendedRows(
  industry: string,
  sections: { items: NavItem[] }[],
): Map<string, string | undefined> {
  const rows = new Map<string, string | undefined>();

  for (const toolId of sidebarDefaultsFor(industry)) {
    const placed = applyTools([toolId]);
    const targets = [...placed.nav, ...placed.pins];
    const why = whyRecommended(toolId, industry);

    for (const item of sections.flatMap((section) => section.items)) {
      const isRow = targets.includes(item.id);
      const holdsTab = (item.children ?? []).some((child) =>
        targets.includes(child.id),
      );
      // First tool to claim a row keeps its reason. Two recommendations
      // landing on one row is possible — refunds puts two tabs in the same
      // group — and a row with two why-lines would read as an argument.
      if ((isRow || holdsTab) && !rows.has(item.id)) rows.set(item.id, why);
    }
  }

  return rows;
}

/**
 * The rail, editable — both levels of it.
 *
 * More's third tab rather than a modal of its own. Customising the rail and
 * adding to it were two dialogs answering one question — what's in the sidebar —
 * and a person who opened the wrong one had to close it to reach the other. So
 * this is a panel: no window of its own, and the tabs above it are what switch
 * between arranging what's there and finding what isn't.
 *
 * Every change here lands on the sidebar as it's made rather than on a Save —
 * the thing being edited is in view behind the modal, so the preview is the
 * product and a staged copy of the layout would only be a second version of it
 * to disagree with. Which is also why there's no Cancel: Reset to default is the
 * undo, and it's the one people actually want.
 *
 * Headings don't move, and nor do children cross parents: Invoices under
 * Expenses would be a false statement about where invoices live, not a
 * preference.
 *
 * Scoped to Main, which is every row the rail lets someone arrange. Quick
 * Actions and the Dashboard are fixtures above it, and the ADD-ONS section is
 * the plan rather than a layout — a switch in here that hid a row someone is
 * billed for would be the one control in this modal that loses them money.
 * Add-ons are added and removed in More, which is where their prices are.
 */
export function CustomiseSidebarPanel({
  /** Closes More. The tab has a Done because the work in it is finishable. */
  onDone,
}: {
  onDone: () => void;
}) {
  /**
   * The industry whose recommendations get banded at the top, or null.
   *
   * Only first run's "Let me choose" sets it. Opened from the sidebar's own
   * menu or from Settings it's null and everything below behaves exactly as it
   * did — one band, in nav order, no why-lines. More clears it on close, so the
   * next opening from anywhere else can't inherit the mode.
   */
  const recommendedIndustry = useAtomValue(customiseSidebarRecommendedAtom);
  const [order, setOrder] = useAtom(sidebarOrderAtom);
  const [childOrder, setChildOrder] = useAtom(sidebarChildOrderAtom);
  const [storedHidden, setHidden] = useAtom(sidebarHiddenAtom);
  /* Same reason as the sidebar's: storage predates the field it's read into. */
  const hidden = storedHidden ?? [];
  /*
   * What someone has added from More. Read-only here: this modal arranges the
   * rail, and taking an item back out is More's job — the same list it was
   * added from, rather than a second way to do it that only one of the two
   * surfaces would show.
   */
  const [storedExtras] = useAtom(sidebarExtraIdsAtom);
  const extras = storedExtras ?? [];
  /*
   * Rows an add-on has taken over. Dropped from the list rather than shown
   * switched off: the switch would be one nobody flipped and flipping it back
   * would do nothing, because the rail is hiding the row for a reason this
   * modal has no say over. Removing the add-on brings the row — and its switch —
   * back on its own.
   */
  const { activeIds: added } = useAddons();
  const replaced = replacedNavIds(added);
  const resetLayout = useSetAtom(resetSidebarLayoutAtom);

  const [dragging, setDragging] = React.useState<Dragging | null>(null);
  /**
   * Which groups are open, by id. Not stored: a disclosure is where someone got
   * to in a job, not a preference about the product, and it costs one click to
   * get back to.
   */
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const sections = orderedNav(order, childOrder, extras).map((section) => ({
    section: section.section,
    items: section.items.filter((item) => !replaced.includes(item.id)),
  }));
  /*
   * Whether there's anything to reset. An order stored back at its shipped
   * sequence still counts as customised, which is the generous reading: the
   * button being live when nothing would change is a harmless no-op, where a
   * greyed-out Reset next to a rail someone has clearly rearranged reads as
   * broken.
   */
  const customised =
    Object.keys(order).length > 0 ||
    Object.keys(childOrder).length > 0 ||
    hidden.length > 0 ||
    extras.length > 0;

  /**
   * Drop the dragged id in at the target's index, the rest closing up after —
   * the same move the PINNED section's reorder makes, so every reorderable list
   * in the product behaves identically under the pointer.
   *
   * The list is resolved inside the updater rather than captured at render,
   * because a drag fires this repeatedly and a captured list would be a frame
   * behind the one on screen.
   */
  const reorder = (
    ids: string[],
    dragged: string,
    target: string,
  ): string[] | null => {
    const from = ids.indexOf(dragged);
    const to = ids.indexOf(target);
    if (from === -1 || to === -1 || from === to) return null;
    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    return next;
  };

  const moveItem = (sectionName: string, dragged: string, target: string) =>
    setOrder((current) => {
      const next = reorder(
        sectionOrder(sectionName, current, extras),
        dragged,
        target,
      );
      return next ? { ...current, [sectionName]: next } : current;
    });

  const moveChild = (groupId: string, dragged: string, target: string) =>
    setChildOrder((current) => {
      const next = reorder(childrenOrder(groupId, current), dragged, target);
      return next ? { ...current, [groupId]: next } : current;
    });

  const toggle = (id: string) =>
    setHidden((current) =>
      current.includes(id)
        ? current.filter((hiddenId) => hiddenId !== id)
        : [...current, id],
    );

  const reset = () => {
    resetLayout();
    setExpanded({});
    toast("Sidebar reset", {
      description:
        "Back to the tabs Sole ships with, in the order they came in.",
    });
  };

  /** The handlers that make a row both a drag source and a drop target. */
  const dragProps = (drag: Dragging, onEnter: () => void) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.effectAllowed = "move";
      // Firefox starts no drag at all without payload.
      event.dataTransfer.setData("text/plain", drag.id);
      setDragging(drag);
    },
    onDragEnter: onEnter,
    // Without this the row refuses the drop and the drag ends nowhere.
    onDragOver: (event: React.DragEvent) => event.preventDefault(),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(null);
    },
    onDragEnd: () => setDragging(null),
    className: cn(
      "transition-opacity",
      dragging?.id === drag.id && "opacity-50",
    ),
  });

  /**
   * The recommended rows, and the flat list the two bands are cut from.
   *
   * Flattened across sections because the bands cut *across* the nav's own
   * grouping — but every row keeps the section it came from, which is what it
   * drags within. Only Main is reorderable (`sectionOrder` returns nothing for
   * anything else), so in practice every draggable row carries the same scope
   * it always did and the drag mechanics below are untouched.
   */
  const recommended = recommendedIndustry
    ? recommendedRows(recommendedIndustry, sections)
    : null;
  const flatRows = sections.flatMap((section) =>
    section.items.map((item) => ({ item, section: section.section })),
  );

  /**
   * One top-level row, its drag wiring, and its tabs when it's open.
   *
   * Lifted out of the list so both views draw the identical row: the plain
   * grouped view every other entry point sees, and first run's two bands. A
   * second copy would be a second place for the drag scopes to drift, which is
   * exactly the bug that ends with a child reordering the level above it.
   *
   * `sectionName` is the row's real nav section, never the band it's displayed
   * in — that's what keeps drag-reorder writing to the same stored order it
   * always has.
   */
  const renderItem = (item: NavItem, sectionName: string, why?: string) => {
    const children = item.children ?? [];
    const shown = !hidden.includes(item.id);
    const isOpen = !!expanded[item.id];

    return (
      <li key={item.id}>
        {/*
            The handlers sit on this wrapper rather than on the <li>,
            so an expanded group's children aren't inside their own
            parent's drop target — nested drag scopes that overlap are
            how a child drag ends up reordering the level above it.
          */}
        <div
          {...dragProps(
            {
              kind: "item",
              scope: sectionName,
              id: item.id,
            },
            () => {
              if (
                dragging?.kind === "item" &&
                dragging.scope === sectionName &&
                dragging.id !== item.id
              ) {
                moveItem(sectionName, dragging.id, item.id);
              }
            },
          )}
        >
          <ItemRow
            item={item}
            shown={shown}
            hidden={hidden}
            expanded={isOpen}
            onExpand={
              children.length
                ? () =>
                    setExpanded((current) => ({
                      ...current,
                      [item.id]: !current[item.id],
                    }))
                : undefined
            }
            onToggle={() => toggle(item.id)}
          />
        </div>

        {/*
            Why this row was suggested, in the industry's own terms.

            Under the row rather than inside it: the row is a fixed anatomy —
            handle, icon, label, tab count, switch — that every other entry
            point into this dialog draws identically, and threading an optional
            second line through it would change the row everywhere to serve one
            caller. This sits beneath, indented to the label's column, and only
            exists in the recommended band.
          */}
        {why && (
          <p className="ml-[3.35rem] mt-1 text-xs leading-relaxed text-muted-foreground">
            {why}
          </p>
        )}

        {isOpen && children.length > 0 && (
          /*
              A rule down the left rather than indentation alone: it
              says where the group's tabs end, which matters when the
              next thing under them is another row at the level above.
            */
          <ul
            className={cn(
              "ml-[1.6rem] mt-1.5 space-y-1.5 border-l border-border pl-3",
              // Children of a switched-off group are still theirs
              // to arrange — they just aren't going anywhere yet.
              !shown && "opacity-60",
            )}
          >
            {children.map((child) => (
              <li
                key={child.id}
                {...dragProps(
                  {
                    kind: "child",
                    scope: item.id,
                    id: child.id,
                  },
                  () => {
                    if (
                      dragging?.kind === "child" &&
                      dragging.scope === item.id &&
                      dragging.id !== child.id
                    ) {
                      moveChild(item.id, dragging.id, child.id);
                    }
                  },
                )}
              >
                <ChildRow
                  child={child}
                  shown={!hidden.includes(child.id)}
                  onToggle={() => toggle(child.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    /*
      A flex column that fills the tab, so the list scrolls inside the modal and
      the bar under it stays put — Reset is the one control someone reaches for
      after scrolling, which makes it the last thing that should scroll away.
    */
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:px-6">
        {recommended ? (
          /*
              First run's "Let me choose": two bands, never more.

              The nav's own heading is dropped here on purpose. It names one
              section and would sit above a band that cuts across it, which is
              a heading describing the wrong list. Two bands is the whole
              taxonomy — what we suggested, and everything else — because a
              third would turn a confirmation into a filing exercise.
            */
          <>
            <div className="space-y-1.5">
              <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recommended for {recommendedIndustry}
              </p>
              <ul className="space-y-1.5">
                {flatRows
                  .filter((row) => recommended.has(row.item.id))
                  .map((row) =>
                    renderItem(
                      row.item,
                      row.section,
                      recommended.get(row.item.id),
                    ),
                  )}
              </ul>
            </div>

            <div className="space-y-1.5">
              <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Everything else
              </p>
              <ul className="space-y-1.5">
                {flatRows
                  .filter((row) => !recommended.has(row.item.id))
                  .map((row) => renderItem(row.item, row.section))}
              </ul>
            </div>
          </>
        ) : (
          sections.map((section) => (
            <div key={section.section} className="space-y-1.5">
              <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.section}
              </p>
              <ul className="space-y-1.5">
                {section.items.map((item) => renderItem(item, section.section))}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t p-4 sm:px-6">
        <Button
          variant="outline"
          size="sm"
          onClick={reset}
          disabled={!customised}
        >
          <RotateCcw aria-hidden />
          Reset to default
        </Button>
        {/* No Cancel to pair with it: everything here is already applied, so
              the only thing left to do is stop. */}
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

/**
 * A top-level row: disclosure, handle, what it is, how many tabs it has left,
 * and whether it's in the rail.
 *
 * A switched-off row dims its label and icon but not its switch — the control
 * that puts it back is the one part of a hidden row that has to stay legible.
 */
function ItemRow({
  item,
  shown,
  hidden,
  expanded,
  onExpand,
  onToggle,
}: {
  item: NavItem;
  shown: boolean;
  /** Every switched-off id, so the tab count can be counted rather than stored. */
  hidden: string[];
  expanded: boolean;
  /** Absent for a row with no children, which has nothing to disclose. */
  onExpand?: () => void;
  onToggle: () => void;
}) {
  const Icon = item.icon;
  const children = item.children ?? [];
  const enabled = children.filter((child) => !hidden.includes(child.id)).length;
  /*
   * A group with its own switch on and every tab off. The rail draws that as a
   * row that opens onto nothing, which is a fair rendering of what was asked
   * for — so this says so rather than quietly overriding it. Pointless to warn
   * about while the group itself is off: it isn't in the rail to be empty in.
   */
  const emptyInSidebar = children.length > 0 && enabled === 0 && shown;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border p-2.5 pl-1.5",
        "motion-safe:transition-colors",
        shown ? "bg-background" : "surface-subtle",
      )}
    >
      {onExpand ? (
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} tabs in ${item.label}`}
          className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn(
              "size-4 motion-safe:transition-transform motion-safe:duration-150",
              !expanded && "-rotate-90",
            )}
            aria-hidden
          />
        </button>
      ) : (
        // Holds the disclosure's column open, so every handle in the list lines
        // up whether or not its row has anything to open.
        <span className="size-6 shrink-0" aria-hidden />
      )}

      {/* The handle is the affordance, not the control: the whole row is
          draggable, because a 16px target is a hard thing to catch. */}
      <GripVertical
        className="size-4 shrink-0 cursor-grab text-muted-foreground/60"
        aria-hidden
      />

      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5",
          !shown && "opacity-60",
        )}
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {item.label}
        </span>
      </div>

      {/* A fixed lane for the count and the switch, so they sit in the same
          column down the list instead of wherever each label leaves them. */}
      <div className="flex shrink-0 items-center justify-end gap-4 pl-2">
        {emptyInSidebar ? (
          <Badge variant="warning" className="gap-1 font-medium">
            <TriangleAlert className="size-3" aria-hidden />
            Empty in the sidebar
          </Badge>
        ) : (
          children.length > 0 && (
            <span className="text-xs text-muted-foreground tabular">
              {enabled} tabs
            </span>
          )
        )}
        <Switch
          checked={shown}
          onCheckedChange={onToggle}
          aria-label={`Show ${item.label} in the sidebar`}
        />
      </div>
    </div>
  );
}

/** One tab inside a group. No icon, because children carry none in the nav. */
function ChildRow({
  child,
  shown,
  onToggle,
}: {
  child: NavLeaf;
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border p-2 pl-1.5",
        "motion-safe:transition-colors",
        shown ? "bg-background" : "surface-subtle",
      )}
    >
      <GripVertical
        className="size-3.5 shrink-0 cursor-grab text-muted-foreground/60"
        aria-hidden
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          !shown && "opacity-60",
        )}
      >
        {child.label}
      </span>
      <Switch
        checked={shown}
        onCheckedChange={onToggle}
        aria-label={`Show ${child.label} in the sidebar`}
        className="shrink-0"
      />
    </div>
  );
}
