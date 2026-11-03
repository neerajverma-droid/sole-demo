"use client";

import * as React from "react";
import Link from "next/link";
import { useAtom, useSetAtom } from "jotai";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Lock,
  Minus,
  Puzzle,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterPills } from "@/components/ui/filter-pills";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddonCartBar } from "@/components/addons/addon-cart-bar";
import { AddonsMarketplace } from "@/components/addons/addons-marketplace";
import { AdditionalItems } from "@/components/layout/additional-items";
import { useAddons } from "@/hooks/use-addons";
import { addonMonthlyPrice } from "@/lib/addon-entitlements";
import { RemoveAddonDialog } from "@/components/addons/remove-addon-dialog";
import { CustomiseSidebarPanel } from "@/components/layout/customise-sidebar-panel";
import {
  customiseSidebarRecommendedAtom,
  moreAddonsOpenAtom,
  moreAddonsTabAtom,
  selectedAddonsAtom,
  toggleSelectedAddonAtom,
  type MoreTab,
} from "@/lib/atoms";
import {
  ADDON_ACCENT,
  ADDON_FILTERS,
  ADDON_GROUPS,
  ADDON_FILTERS_WORTHWHILE,
  addonById,
  addonLayout,
  type Addon,
  type AddonAccent,
} from "@/lib/addons";
import { cn } from "@/lib/utils";

/**
 * What the sidebar's More opens.
 *
 * The rail used to expand into the add-ons it didn't have, which put a shop
 * inside a nav: a column of rows that looked like destinations, none of which
 * went anywhere. This is the same catalogue as a browsing surface instead — a
 * card per add-on, with the one action that add-on is currently up for.
 *
 * Two states, one control each. Not on the plan: locked, priced, and Add to
 * sidebar. On it: a badge saying where it went, and Remove. Nothing is hidden in
 * either — a locked card reads dimmer and still says what it does, because an
 * upsell nobody can read is an upsell nobody takes.
 *
 * Three tabs, which between them are every answer to "what's in my sidebar".
 * This catalogue; the additional items — the parts of the product that aren't in
 * the rail by default and don't cost anything to put there; and the customiser,
 * which arranges what's already in it. The first two are what keep free and paid
 * from reading as one undifferentiated list. The third used to be a modal of its
 * own, which meant adding a tab and moving it were separate errands with no way
 * across between them.
 *
 * And two views over the add-ons tab: the grid, and the marketplace's detail for
 * whichever add-on someone opens from it. Mounted beside the sidebar that opens
 * it, so it's available from whatever page they happen to be on.
 */

export function MoreAddonsDialog() {
  const [open, setOpen] = useAtom(moreAddonsOpenAtom);
  const {
    activeIds: added,
    remove,
    currentCost,
    activeSlugs,
    busy,
    catalogue,
    subscription,
  } = useAddons();
  const planInterval = subscription?.planInterval ?? "monthly";
  const [cart] = useAtom(selectedAddonsAtom);
  const toggleSelected = useSetAtom(toggleSelectedAddonAtom);

  /*
   * Which tab is up. Add-ons leads, because it's what More was built for — but
   * it's an atom rather than local state, because the footer menu's Customise
   * sidebar and the empty-rail prompt open this modal straight onto the third
   * tab, and neither of them can reach in here to say so.
   */
  const [tab, setTab] = useAtom(moreAddonsTabAtom);
  const setRecommendedIndustry = useSetAtom(customiseSidebarRecommendedAtom);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState(ADDON_FILTERS[0]);
  /**
   * Which add-on the detail view is showing, and by being set at all, that the
   * detail view is what's showing. One value rather than a view enum and an id
   * that have to agree with each other.
   */
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const detailAddon = detailId ? addonById(detailId) : undefined;

  /*
   * Two rows rather than one grid. Every card looking the same made the page
   * flat: nothing led, and a catalogue where the $15 payroll add-on and the $5
   * km tracker are drawn identically leaves the reader to do the ranking.
   */
  const { featured, compact } = addonLayout(filter, query);
  const results = [...featured, ...compact];
  /*
   * Counted from the resolved add-ons rather than from the stored ids, so the
   * count and the total are answers to the same question. A plan can hold an id
   * the catalogue has since dropped — storage outlives any given catalogue —
   * and `addonMonthlyTotal` already charges nothing for one of those, so
   * counting the raw ids would have billed two add-ons and claimed three.
   */
  /*
   * How many add-ons the plan carries — counted from the subscription's own
   * slugs, not from the cards they resolve to.
   *
   * `accounting`, `inventory` and `crypto` are billable with no card written
   * for them here. Counting cards reported a business paying for three add-ons
   * as having two, and sat that figure next to a total that did include the
   * third. One of the two numbers had to change; this is the one that can be
   * right, because the line is reporting the plan rather than this catalogue.
   */
  const onPlanCount = activeSlugs.length;
  /*
   * What the add-ons on this plan come to, at the price list's figures and with
   * the package's own free allowance applied — not the sum of the hardcoded
   * numbers on the cards. A plan that includes three add-ons charges nothing
   * for the first three, and a header claiming otherwise is a header arguing
   * with the invoice.
   *
   * `currentCost`, not `costOf(added)`: the second asks what adding those would
   * change the bill by, which counts them against the allowance a second time
   * and bills for three add-ons on a package that covers three.
   */
  const monthly = currentCost;

  /** This add-on's real price, at the interval this plan is billed on. */
  const priceOf = (addon: Addon) =>
    addonMonthlyPrice(addon, catalogue, planInterval);

  /**
   * Where the grid was scrolled to when someone left it for a detail view.
   *
   * The grid unmounts while the detail is up — one view at a time, in a modal
   * whose height is fixed — and `display: none` wouldn't have helped anyway:
   * a box with no layout has no scroll position to come back to. So it's saved
   * on the way out and put back in a layout effect on the way in, which lands
   * before the browser paints and so reads as never having moved.
   */
  const listRef = React.useRef<HTMLDivElement>(null);
  const listScroll = React.useRef(0);
  const showDetail = detailAddon !== undefined;

  React.useLayoutEffect(() => {
    if (!showDetail && listRef.current) {
      listRef.current.scrollTop = listScroll.current;
    }
  }, [showDetail]);

  /**
   * Choosing an add-on is not the same as having it.
   *
   * It used to be: one press added the add-on and its sidebar row together.
   * Paid add-ons are gated behind a charge now, so a press puts it in the cart
   * and the bar at the foot of the tab pays for the lot — which is also what
   * makes buying three a single transaction rather than three.
   *
   * No toast: the cart bar appearing is the feedback, and one notification per
   * tick in a multi-select talks over the thing already saying it.
   */
  const toggle = (addon: Addon) => toggleSelected(addon.id);

  /**
   * Which add-on is waiting on a confirmation to be taken off the plan.
   *
   * Removing used to be one click: it edited a list in this browser, so the
   * worst case was a row coming back. It changes what the business is billed
   * now, and takes the add-on's pages out of the sidebar with it — which is
   * worth a sentence and a second press rather than an undo nobody is offered.
   */
  const [removing, setRemoving] = React.useState<Addon | null>(null);

  const confirmRemove = async () => {
    const addon = removing;
    if (!addon) return;

    try {
      await remove(addon.id);
      setRemoving(null);
      toast(`${addon.name} removed`, {
        description:
          "It's off your plan from the next invoice, and out of your sidebar now.",
      });
    } catch (error) {
      toast.error("Couldn't remove that", {
        description:
          error instanceof Error
            ? error.message
            : "Your plan hasn't changed. Try again in a moment.",
      });
    }
  };

  const drop = (addon: Addon) => setRemoving(addon);

  /**
   * The long version of one add-on is the second view of this modal rather than
   * a modal of its own. Everything the grid was showing stays in state while
   * it's up — the term, the pill, the place in the list — so coming back is a
   * return to the page someone left rather than a fresh one.
   */
  const openDetails = (addon: Addon) => {
    listScroll.current = listRef.current?.scrollTop ?? 0;
    setDetailId(addon.id);
  };

  const back = () => setDetailId(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A term left in the box would filter a list nobody has looked at yet
        // the next time this opens, which reads as a catalogue that has shrunk —
        // and a detail view left up would reopen on an add-on nobody asked for.
        if (!next) {
          setTab("addons");
          // The recommended band is a property of how the customiser was
          // opened, not of the customiser — so it doesn't outlive the opening
          // that asked for it.
          setRecommendedIndustry(null);
          setQuery("");
          setFilter(ADDON_FILTERS[0]);
          setDetailId(null);
          listScroll.current = 0;
        }
      }}
    >
      {/*
        A flex column with a bounded height: grid rows size to their content, so
        the card list would grow past the modal and be clipped by
        overflow-hidden instead of scrolling inside it.
      */}
      <DialogContent
        className={cn(
          "flex max-h-[90svh] max-w-5xl flex-col gap-0 overflow-hidden p-0 lg:max-w-6xl",
          // Fixed for the catalogue and the detail view over it, so drilling
          // into an add-on and coming back doesn't resize the window around the
          // person doing it. Not for the other two: four short cards — or four
          // nav rows — in a box built for forty is a screen of empty space, and
          // switching tabs is a deliberate act where following a link is not.
          // The customise tab grows with its own list and stops at the 90svh
          // cap above, which is where its scroller takes over.
          tab === "addons" && "h-[90svh]",
        )}
        // In the detail view Escape is the back button's keyboard twin, not the
        // close: one press per level, the way a back stack behaves everywhere
        // else. Escape from the grid still closes, because there's nowhere left
        // to go back to.
        onEscapeKeyDown={(event) => {
          if (!showDetail) return;
          event.preventDefault();
          back();
        }}
      >
        {detailAddon ? (
          /*
           * pr-14 keeps the bar clear of the close button, which belongs to the
           * modal rather than to either view — so it closes the whole thing from
           * both, and Back is the only control that navigates.
           */
          <DialogHeader className="shrink-0 space-y-0 border-b p-3 pl-4 pr-14 text-left">
            <Button
              variant="ghost"
              size="sm"
              onClick={back}
              className="-ml-1.5 w-fit gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft aria-hidden />
              Back to add-ons
            </Button>
            {/* The panel below opens with the add-on's name as a heading, so the
                dialog's own title would be the same words twice over. It's here
                for the accessible name and nothing else. */}
            <DialogTitle className="sr-only">
              {detailAddon.name} add-on
            </DialogTitle>
            <DialogDescription className="sr-only">
              What the {detailAddon.name} add-on does, what it costs and
              what&apos;s included.
            </DialogDescription>
          </DialogHeader>
        ) : null}

        {detailAddon ? (
          <AddonsMarketplace selected={detailAddon} onSelect={setDetailId} />
        ) : (
          /*
            The tabs own the header as well as the body, because the list has to
            sit under the title and above the content it switches — a TabsList
            outside the Tabs root wouldn't be wired to anything.
          */
          <Tabs
            value={tab}
            onValueChange={(next) => setTab(next as MoreTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <DialogHeader className="shrink-0 space-y-3 border-b p-5 pr-14 text-left">
              <div className="space-y-1.5">
                <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
                  <span
                    className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary"
                    aria-hidden
                  >
                    <Puzzle className="size-4" />
                  </span>
                  More
                  <span className="text-muted-foreground">·</span>
                  <span className="font-normal text-muted-foreground">
                    everything you can add to your sidebar
                  </span>
                </DialogTitle>
                <DialogDescription>
                  {tab === "addons" && (
                    <>
                      Add what you use to the sidebar, and unlock the rest when
                      you need it.
                      {onPlanCount > 0 && (
                        <>
                          {" "}
                          <span className="font-medium text-foreground tabular">
                            {onPlanCount} on your plan · ${monthly}/month
                          </span>
                        </>
                      )}
                    </>
                  )}
                  {tab === "additional" && (
                    <>
                      The rest of Sole. Everything here is already included —
                      add any of it to your sidebar, or open it from this list.
                    </>
                  )}
                  {tab === "customise" && (
                    <>
                      Drag to reorder, and switch off anything you don&apos;t
                      use. Open a group to arrange the tabs inside it. Changes
                      apply straight away.
                    </>
                  )}
                </DialogDescription>
              </div>

              {/* Wrapped, so the segmented control keeps its own width instead
                  of stretching to the header's — DialogHeader is a flex column,
                  and a bare inline-flex child would fill it. */}
              <div>
                <TabsList aria-label="More">
                  <TabsTrigger value="addons">Add-ons</TabsTrigger>
                  <TabsTrigger value="additional">Additional items</TabsTrigger>
                  <TabsTrigger value="customise">Customise sidebar</TabsTrigger>
                </TabsList>
              </div>
            </DialogHeader>

            <TabsContent
              value="addons"
              className="mt-0 flex min-h-0 flex-1 flex-col"
            >
              <div className="shrink-0 space-y-3 border-b p-5">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search add-ons"
                    aria-label="Search add-ons"
                    className="h-9 pl-9"
                  />
                </div>

                {ADDON_FILTERS_WORTHWHILE && (
                  <FilterPills
                    options={ADDON_FILTERS}
                    value={filter}
                    onChange={setFilter}
                    label="Filter add-ons by category"
                  />
                )}
              </div>

              <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-5">
                {results.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No add-on matches that.
                  </p>
                ) : (
                  <div className="space-y-5">
                    {featured.length > 0 && (
                      /* Two across on `sm` and up so a pair sits side by side;
                       one on its own takes half the row rather than stretching,
                       because a lone card at full width reads as a banner. */
                      <ul className="grid gap-3 sm:grid-cols-2">
                        {featured.map((addon) => (
                          <li key={addon.id}>
                            <FeaturedCard
                              addon={addon}
                              price={priceOf(addon)}
                              onPlan={added.includes(addon.id)}
                              inCart={cart.includes(addon.id)}
                              onToggleSelect={() => toggle(addon)}
                              onRemove={() => drop(addon)}
                              onDetails={() => openDetails(addon)}
                              onNavigate={() => setOpen(false)}
                            />
                          </li>
                        ))}
                      </ul>
                    )}

                    {compact.length > 0 && (
                      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {compact.map((addon) => (
                          <li key={addon.id}>
                            <AddonCard
                              addon={addon}
                              price={priceOf(addon)}
                              onPlan={added.includes(addon.id)}
                              inCart={cart.includes(addon.id)}
                              onToggleSelect={() => toggle(addon)}
                              onRemove={() => drop(addon)}
                              onDetails={() => openDetails(addon)}
                              onNavigate={() => setOpen(false)}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Under the list rather than in it, so it stays put while the
                  grid scrolls. Renders nothing on an empty cart. */}
              <AddonCartBar />
            </TabsContent>

            {/*
              A plain scroller rather than the add-ons tab's search-and-filter
              header: four items don't need finding, and a search box over a
              list you can see all of is furniture.
            */}
            <TabsContent
              value="additional"
              className="mt-0 min-h-0 flex-1 overflow-y-auto p-5"
            >
              <AdditionalItems onNavigate={() => setOpen(false)} />
            </TabsContent>

            {/*
              The panel brings its own scroller and its own footer bar, because
              Reset is the control someone reaches for after scrolling the list
              and it has to still be there when they get to the bottom. So this
              is a bare flex column, with no padding of its own to fight it.
            */}
            <TabsContent
              value="customise"
              className="mt-0 flex min-h-0 flex-1 flex-col"
            >
              <CustomiseSidebarPanel onDone={() => setOpen(false)} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>

      {/* A sibling of the catalogue rather than a child of a card: the card it
          belongs to unmounts when the grid filters or the detail view opens,
          and a confirmation that vanishes mid-decision is worse than none. */}
      <RemoveAddonDialog
        addon={removing}
        busy={busy}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </Dialog>
  );
}

/**
 * A card's action, in whichever of its two states it's in.
 *
 * Shared by both treatments so a featured card and a compact one can't offer
 * different things for the same add-on — only the size differs between them.
 *
 * Add to sidebar carries the category's colour, because it's the one control
 * that acts on the category's own thing. The added state doesn't: a badge and a
 * Remove are the same fact and the same act whichever category an add-on
 * belongs to, and colour there would be colour without a meaning behind it.
 */
function AddonAction({
  accent,
  locked,
  inCart,
  onToggleSelect,
  onRemove,
  className,
}: {
  accent: AddonAccent;
  locked: boolean;
  /** Chosen but not paid for. Only meaningful while `locked`. */
  inCart: boolean;
  onToggleSelect: () => void;
  onRemove: () => void;
  className?: string;
}) {
  if (locked) {
    /*
     * Select, not add. The charge happens once for the whole cart, so a card's
     * job is to get the add-on into it — the padlock stays because what makes
     * this one different from the free items is still that it's paid for.
     *
     * In the cart it goes outline and says how to undo itself, because at that
     * point the next thing to press is the cart bar rather than this.
     */
    return (
      <Button
        size="sm"
        variant={inCart ? "outline" : "default"}
        // Selecting is not a request to go anywhere. The card body is a link,
        // and the overlay it uses isn't an ancestor of this button — but saying
        // so here means the next restructure of the card can't quietly make
        // this navigate as well.
        onClick={(event) => {
          event.stopPropagation();
          onToggleSelect();
        }}
        className={cn(!inCart && accent.cta, className)}
      >
        {inCart ? (
          <>
            <Check aria-hidden />
            Selected · remove
          </>
        ) : (
          <>
            <Lock aria-hidden />
            Select
          </>
        )}
      </Button>
    );
  }

  /*
   * The state and the act as two things, not one button that names one and does
   * the other. Removing an add-on stops a subscription, so it says Remove where
   * it could have said "Added" and quietly meant the opposite.
   */
  return (
    <div className={cn("flex items-center gap-2", className)}>
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
    </div>
  );
}

/**
 * The pair that leads the modal.
 *
 * Bigger, washed in its category's colour, and strapped along the top in it —
 * so the two rows read as "start here" and "and the rest" before a word of copy
 * is taken in. The category is named on these because they're the cards someone
 * lands on cold; the grid below can leave it to the icon.
 *
 * Still both states. The brief describes the locked CTA, which is what most
 * people see, but a featured add-on already on the plan has to offer Remove
 * like any other — a promoted card that lost its controls once bought would be
 * the one card that stopped working.
 */
function FeaturedCard({
  addon,
  price,
  onPlan,
  inCart,
  onToggleSelect,
  onRemove,
  onDetails,
  onNavigate,
}: {
  addon: Addon;
  /**
   * What it costs per month, from the price list rather than from the card.
   *
   * Passed in rather than read off `addon`: the figure written into the
   * catalogue here is copy, and the one the subscription charges is in the
   * database. A card quoting its own number is a card that goes stale the
   * moment somebody edits a price.
   */
  price: number;
  onPlan: boolean;
  inCart: boolean;
  onToggleSelect: () => void;
  onRemove: () => void;
  onDetails: () => void;
  onNavigate: () => void;
}) {
  const Icon = addon.icon;
  const locked = !onPlan;
  const accent = ADDON_ACCENT[addon.group];
  const category = ADDON_GROUPS.find((group) => group.key === addon.group);

  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-xl border border-border shadow-sm",
        "motion-safe:transition-colors",
        accent.wash,
      )}
    >
      {/* The 4px strip. Its own element rather than a border, so it clips to the
          card's radius and can't be overridden by a border utility later. */}
      <div className={cn("h-1 w-full shrink-0", accent.strip)} aria-hidden />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <Badge
            variant="outline"
            className="rounded-full border-transparent bg-background/80 px-2 py-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Featured
          </Badge>
          {category && (
            <Badge
              variant="outline"
              className={cn(
                "rounded-full px-2 py-0 text-[10px] font-semibold",
                accent.pill,
              )}
            >
              {category.pill}
            </Badge>
          )}
        </div>

        <div className="flex items-start gap-3">
          <span
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl",
              accent.tile,
            )}
            aria-hidden
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-tight">
              {addon.name}
            </h3>
          </div>
          <p className="shrink-0 text-right text-sm font-semibold tabular">
            ${price}
            <span className="block text-[11px] font-normal text-muted-foreground">
              {addon.priceUnit ? `per ${addon.priceUnit} / month` : "per month"}
            </span>
          </p>
        </div>

        {/* Two lines rather than the grid's one: these cards have the room, and
            the second line is where an add-on stops sounding like a feature
            list and starts sounding like something you'd buy. */}
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {addon.subtext}. {addon.whatItDoes}
        </p>

        <div className="relative z-10 mt-auto space-y-2">
          <AddonAction
            accent={accent}
            locked={locked}
            inCart={inCart}
            onToggleSelect={onToggleSelect}
            onRemove={onRemove}
            className="w-full"
          />
          <button
            type="button"
            onClick={onDetails}
            className="group/details flex w-full items-center justify-center gap-1 rounded text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            See details
            <ArrowRight
              className="size-3 motion-safe:transition-transform group-hover/details:translate-x-0.5"
              aria-hidden
            />
            <span className="sr-only">about {addon.name}</span>
          </button>
        </div>
      </div>

      {/* Last in the DOM so it sits over the static content but under the
          controls above, which carry z-10. */}
      <CardBody
        addon={addon}
        locked={locked}
        onDetails={onDetails}
        onNavigate={onNavigate}
      />
    </div>
  );
}

/**
 * One add-on in the grid below.
 *
 * The category is the tile's colour and nothing else — no pill, no label. With
 * the featured cards naming both categories directly above, the colour has
 * something to refer back to, which is what lets it carry the meaning on its own.
 *
 * The Details link is gone from here; the card itself opens it. That's an overlay
 * button laid under the content with the action button above it, because a link
 * or button wrapping another button is invalid markup and ambiguous about what a
 * click means.
 */
function AddonCard({
  addon,
  price,
  onPlan,
  inCart,
  onToggleSelect,
  onRemove,
  onDetails,
  onNavigate,
}: {
  addon: Addon;
  /**
   * What it costs per month, from the price list rather than from the card.
   *
   * Passed in rather than read off `addon`: the figure written into the
   * catalogue here is copy, and the one the subscription charges is in the
   * database. A card quoting its own number is a card that goes stale the
   * moment somebody edits a price.
   */
  price: number;
  onPlan: boolean;
  inCart: boolean;
  onToggleSelect: () => void;
  onRemove: () => void;
  onDetails: () => void;
  onNavigate: () => void;
}) {
  const Icon = addon.icon;
  const locked = !onPlan;
  const accent = ADDON_ACCENT[addon.group];

  return (
    <div
      className={cn(
        "group relative flex h-full flex-col gap-3 rounded-xl border p-4",
        "motion-safe:transition-colors",
        locked
          ? "border-dashed border-border surface-subtle"
          : "border-border bg-card hover:border-primary/30",
      )}
    >
      <div className={cn("flex items-start gap-3", locked && "opacity-70")}>
        <span className="relative shrink-0" aria-hidden>
          <span
            className={cn(
              "grid size-9 place-items-center rounded-lg",
              accent.tile,
            )}
          >
            <Icon className="size-4" />
          </span>
          {/* The lock sits on the add-on's own icon rather than replacing it:
              which add-on this is and whether it's locked are two things, and a
              padlock in the icon slot only answers the second. */}
          {locked && (
            <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full border border-background bg-muted-foreground text-background">
              <Lock className="size-2.5" />
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
              {addon.name}
            </h3>
            <span className="shrink-0 text-xs font-medium text-muted-foreground tabular">
              ${price}
              {addon.priceUnit ? `/${addon.priceUnit}` : ""}/mo
            </span>
          </div>
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {addon.subtext}
          </p>
        </div>
      </div>

      {/* mt-auto so the actions sit on one line across a row of cards whose
          descriptions wrap to different heights. Above the overlay, so the
          button takes its own clicks. */}
      <div className="relative z-10 mt-auto flex items-center gap-2">
        <AddonAction
          accent={accent}
          locked={locked}
          inCart={inCart}
          onToggleSelect={onToggleSelect}
          onRemove={onRemove}
        />
      </div>

      {/* Last in the DOM so it sits over the static content but under the
          controls above, which carry z-10. */}
      <CardBody
        addon={addon}
        locked={locked}
        onDetails={onDetails}
        onNavigate={onNavigate}
      />
    </div>
  );
}

/**
 * The click target over an add-on card.
 *
 * Where it goes depends on whether the add-on is owned. On the plan, it has a
 * page and the card opens it, like any other card in the product. Locked, there
 * is no page to open — so the card opens the add-on's own detail view, which is
 * the thing someone clicking a locked card is actually asking to see.
 */
function CardBody({
  addon,
  locked,
  onDetails,
  onNavigate,
}: {
  addon: Addon;
  locked: boolean;
  onDetails: () => void;
  onNavigate: () => void;
}) {
  const overlay =
    "absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (!locked && addon.href) {
    return (
      <Link
        href={addon.href}
        onClick={onNavigate}
        aria-label={`Open ${addon.name}`}
        className={overlay}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onDetails}
      aria-label={`Details about ${addon.name}`}
      className={overlay}
    />
  );
}
