import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import type { PreviewState } from "@/components/layout/preview-toggle";
import type { SectionDraft } from "@/components/settings/use-section-draft";
import type { ContactTab } from "@/lib/contacts";
import type { ProposalRow, ProposalStatus } from "@/lib/proposals";
import { DEFAULT_AREA_LEVEL, type AreaLevel } from "@/lib/customer-areas";
import type { AccountStage } from "@/lib/dashboard-data";
import {
  EMPTY_ASSET_ADVANCED_FILTERS,
  type AssetAdvancedFilters,
  type AssetSort,
} from "@/lib/assets";
import type { InvoiceTab } from "@/lib/invoices";
import { DEFAULT_KM_FILTERS, type KmTripFilters } from "@/lib/km-tracker";
import type { SalesSettings, SalesTab } from "@/lib/sales-settings";
import {
  EMPTY_GENERAL_FILTERS,
  EMPTY_NDIS_FILTERS,
  EMPTY_PRODUCT_FILTERS,
  type GeneralFilters,
  type NdisFilters,
  type PageSize,
  type ProductFilters,
  type ProductTab,
} from "@/lib/products";
import type { Quote, QuoteFilter } from "@/lib/quotes";
import type { ReportPeriod, ReportRange } from "@/lib/report-periods";
import type { RefundStatusFilter } from "@/lib/refunds";
import {
  EMPTY_SOLEPAY_META,
  EMPTY_SOLEPAY_ONBOARDING,
  type SolePayDraftMeta,
  type SolePayOnboarding,
} from "@/lib/solepay";
import {
  EMPTY_NEXXTAP_META,
  EMPTY_NEXXTAP_ONBOARDING,
  type NexxtapMeta,
  type NexxtapOnboarding,
  type NexxtapUploadedDocument,
} from "@/lib/nexxtap";
import type { SuperPeriod } from "@/lib/super";
import type {
  VendorRefundPeriod,
  VendorRefundStatusFilter,
} from "@/lib/vendor-refunds";
import type { Expense, ExpensePeriod, ExpenseSort } from "@/lib/expenses";
import type { InventoryFilter } from "@/lib/inventory";
import type { RuleFilter } from "@/lib/rules";
import type {
  DocumentsSectionForm,
  NotificationSettings,
  TaxSectionForm,
} from "@/lib/settings";
import type {
  BankDetailsForm,
  BusinessDetailsForm,
} from "@/lib/business-settings";
import type { PlannerTab } from "@/lib/planner";
import {
  EMPTY_GATEWAY_PAGINATION,
  SEED_PAYMENTS,
  type GatewayPagination,
  type LoadStatus,
  type Payment,
  type PaymentTab,
} from "@/lib/payments";
import { fiscalYearOf } from "@/lib/fiscal-year";
import { financialYearLabel, type TransactionFilter } from "@/lib/transactions";
import {
  EMPTY_TRANSACTION_FILTERS,
  type TransactionFilterDraft,
} from "@/lib/transaction-filters";

/**
 * The nav ids the person has pinned, in the order they pinned them — which is
 * also the order the PINNED section shows them in until they drag them about.
 *
 * Ids rather than resolved items, so a pin survives the label, icon or route
 * behind it changing; `pinTargets` resolves them and drops any that have since
 * left the nav.
 *
 * `atomWithStorage` reads storage in an effect rather than during render, so the
 * server and the first client paint agree that nothing is pinned and the stored
 * list lands a tick later. That's the right way round: a section appearing is
 * nothing, where rendering pins the server didn't know about would be a
 * hydration mismatch.
 */
export const pinnedNavIdsAtom = atomWithStorage<string[]>(
  "sole.sidebar.pinned",
  [],
);

/**
 * Whether the user has ever pinned a tab.
 *
 * Separate from the hint being dismissed: someone can wave the coachmark away
 * without having pinned anything, and the faint always-on pin affordance should
 * stay until they've actually done it once. One-way — unpinning everything
 * later doesn't put the training wheels back on.
 */
export const hasPinnedAtom = atomWithStorage("sole.sidebar.has-pinned", false);

/**
 * Whether the "hover an item and tap the pin" hint has been shown. Stored,
 * because "once" has to outlive the session, and set by pinning as well as by
 * dismissing — someone who has pinned something has no use for the hint.
 */
export const pinHintSeenAtom = atomWithStorage(
  "sole.sidebar.pin-hint-seen",
  false,
);

/**
 * Whether the sidebar's More modal is open.
 *
 * Ephemeral, unlike the collapsible it replaced: a modal is somewhere you go and
 * come back from, so reopening it on every load would be a dialog in the way of
 * the page rather than a preference honoured.
 */
export const moreAddonsOpenAtom = atom(false);

/**
 * Which of More's tabs is up.
 *
 * Out here rather than in the dialog's own state because two of the three tabs
 * are opened directly by things that aren't the More button — the footer menu's
 * Customise sidebar, the empty-rail prompt — and a caller can't reach into a
 * component's `useState` to say which tab it wanted.
 */
export type MoreTab = "addons" | "additional" | "customise";

export const moreAddonsTabAtom = atom<MoreTab>("addons");

/**
 * Sections the person has collapsed, by heading.
 *
 * Only the collapsed ones are stored, so a section added later arrives expanded
 * rather than hidden by a map that has never heard of it. A section holding the
 * current route opens regardless — see the sidebar.
 */
export const collapsedNavSectionsAtom = atomWithStorage<
  Record<string, boolean>
>("sole.sidebar.collapsed-sections", {});

/* ------------------------------------------------------------------ *
 * Sidebar customisation
 * ------------------------------------------------------------------ */

/**
 * The order the person has dragged each section's items into, by heading.
 *
 * Two atoms rather than one layout object, because they're two independent
 * gestures on two different controls — dragging a row and switching one off —
 * and a combined value would make every drag rewrite the hidden list and every
 * toggle rewrite the order. Only sections actually dragged appear; see
 * `SidebarLayout`.
 */
export const sidebarOrderAtom = atomWithStorage<Record<string, string[]>>(
  "sole.sidebar.order",
  {},
);

/**
 * The order the person has dragged each group's submenu into, by group id.
 *
 * Its own key rather than more entries in `sidebarOrderAtom`, whose keys are
 * section headings: one map holding both would be keyed by two different kinds
 * of name at once, and the day a section is called what a group is called it
 * would silently reorder the wrong list.
 */
export const sidebarChildOrderAtom = atomWithStorage<Record<string, string[]>>(
  "sole.sidebar.child-order",
  {},
);

/**
 * The nav ids the person has switched off, at either level.
 *
 * One list for parents and children, because nav ids are unique across both —
 * see `SidebarLayout`. Distinct from a collapsed section, which is a heading
 * someone has folded away and can unfold from the rail itself. A hidden row
 * leaves the rail altogether, so the only way back is the modal that put it
 * there — which is why that modal lists hidden rows alongside the rest rather
 * than only what's showing.
 */
export const sidebarHiddenAtom = atomWithStorage<string[]>(
  "sole.sidebar.hidden",
  [],
);

/**
 * The additional items someone has added to Main from More.
 *
 * A different kind of fact from the three above, which is why it's its own
 * atom: those record how the rail was rearranged, this records what's in it to
 * rearrange. The rail ships with three rows and everything else in More, so
 * without this there'd be nothing to distinguish "hasn't added Contacts" from
 * "added Contacts and then switched it off" — and the second one has to survive
 * being switched back on.
 */
export const sidebarExtraIdsAtom = atomWithStorage<string[]>(
  "sole.sidebar.extras",
  [],
);

/*
 * The five-step setup wizard's two atoms used to live here. Both are gone with
 * it: what it asked is now asked in Welcome, which can't be skipped and stores
 * its answers on the account (`stores/welcome`) rather than in a draft that
 * only the wizard could read.
 */

/**
 * Whether the customiser is open — which now means More, on its third tab.
 *
 * Customising the rail and adding to it were two modals asking the same
 * question: what's in the sidebar. They're one modal with three tabs now, and
 * this stayed a boolean so that every caller that only ever wanted "open the
 * customiser" keeps saying exactly that and doesn't have to know it's become a
 * tab. Writing `false` closes More rather than switching tabs within it, which
 * is what Done in that tab means.
 */
export const customiseSidebarOpenAtom = atom(
  (get) => get(moreAddonsOpenAtom) && get(moreAddonsTabAtom) === "customise",
  (_get, set, next: boolean) => {
    // The tab is set either way: on the way in because that's the request, and
    // on the way out so the next person to press More gets the catalogue
    // rather than the tab somebody else left open.
    set(moreAddonsTabAtom, next ? "customise" : "addons");
    set(moreAddonsOpenAtom, next);
  },
);

/**
 * The industry whose recommendations the customise modal should band at the
 * top — or null for the plain grouped view.
 *
 * Nothing sets it as of the pricing step, and that's a statement about first
 * run rather than about this atom. "Let me choose" was its only writer: the
 * menu step opened the customiser with the industry attached, and that step is
 * gone — the plan screen that replaced it decides the nav with its own
 * checkboxes. The dialog still reads this, so the banded view is one setter
 * away for whatever next wants to open it against an industry.
 *
 * The industry rather than a boolean, because the band is titled with it and
 * every why-line underneath names it. A flag would mean the dialog reaching
 * into the settings store for a value that is only meaningful on one of its two
 * entry points.
 *
 * Separate from `customiseSidebarOpenAtom` rather than folded into it: three
 * other callers set that one, and widening its type would make all of them
 * declare a mode they have no opinion about.
 */
export const customiseSidebarRecommendedAtom = atom<string | null>(null);

/*
 * There's no add-business atom any more: that flow is a page at
 * `/businesses/new`, and both switcher entry points link to it. The dialog it
 * replaced was the only thing this opened.
 */

/**
 * Back to the shipped rail — every part of it at once.
 *
 * One write, because "reset" is one thing to the person clicking it: clearing
 * the order and leaving a row switched off, or leaving one group's submenu
 * rearranged, would be a reset that visibly didn't.
 */
export const resetSidebarLayoutAtom = atom(null, (_get, set) => {
  set(sidebarOrderAtom, {});
  set(sidebarChildOrderAtom, {});
  set(sidebarHiddenAtom, []);
  // Back to the three shipped rows, which is what "default" means now. An
  // added item left behind would be a reset that visibly didn't.
  set(sidebarExtraIdsAtom, []);
});

/*
 * `addedAddonsAtom` is gone. What's on the plan is the plan's business: the
 * slugs live on `user_subscriptions.addons`, arrive with every
 * `my-subscription` read, and are scoped to the open business the way a
 * subscription is. `hooks/use-addons.ts` is the one way to ask.
 *
 * It was a localStorage list, which meant it agreed with what anybody was
 * billed for only by coincidence: a business already paying for the asset
 * register saw a locked card asking it to buy one, and a card could claim to be
 * "on your plan" against a subscription that had never heard of it.
 *
 * The order the ADD-ONS section draws in used to ride on the same list. That's
 * a local preference rather than a fact about billing, so it moved to
 * `sidebarOrderAtom` under the ADD-ONS heading, alongside every other section's
 * — which also got it syncing across devices for free.
 */

/*
 * There's no marketplace-open atom to go with the one above: the marketplace is
 * the More modal's second view now rather than a dialog of its own, and which
 * add-on it's showing is that modal's own state — the value that says which of
 * its two views is up. Lifting it here would only let something else put the
 * modal into a view without opening it.
 */

/**
 * An add-on joining the plan, which is the same act as it joining the rail.
 *
 * No pin any more: the ADD-ONS section is drawn from this list, so being on the
 * plan *is* having a row. That's what lets the card say "Add to sidebar" and
 * mean it — the old flow added to the plan and then pinned, which was two
 * writes to say one thing and left "added but unpinned" as a state someone
 * could reach and then wonder where their add-on had gone.
 *
 * Appended, so a new add-on lands at the bottom of its section rather than
 * displacing the order someone has dragged the rest into.
 */
/**
 * Paid add-ons chosen but not yet paid for.
 *
 * The cart, and deliberately *not* persisted — unlike `addedAddonsAtom`, which
 * is the active, paid set. A cart that survived a reload would be a list of
 * things someone might believe they'd bought, and the whole point of gating
 * these behind a charge is that selecting is not the same as having.
 *
 * Ids rather than resolved add-ons, matching every other list in this file: the
 * catalogue can drop one, and `addonMonthlyTotal` already charges nothing for
 * an id it can't find.
 */
export const selectedAddonsAtom = atom<string[]>([]);

/** In or out of the cart. One writer, so the two directions can't disagree. */
export const toggleSelectedAddonAtom = atom(null, (get, set, id: string) => {
  const current = get(selectedAddonsAtom);
  const adding = !current.includes(id);

  set(
    selectedAddonsAtom,
    adding ? [...current, id] : current.filter((entry) => entry !== id),
  );

  /*
   * The paywall, as this product actually has one.
   *
   * There is no "you cannot do this, upgrade" interstitial anywhere — the
   * locked add-on card is the only place somebody meets a feature they have
   * not paid for, so selecting one IS the paywall hit. Which feature is the
   * whole point of the event: "forty people hit a paywall" is not actionable,
   * "forty people wanted Payroll" is.
   *
   * Only on the way in. Taking an add-on back out of the cart is a different
   * fact, and counting it here would make every change of mind look like
   * fresh demand.
   */
  if (adding) track(EVENTS.PAYWALL_HIT, { feature: id, surface: "addons" });
});

/** Emptied once the charge goes through, and on nothing else. */
export const clearSelectedAddonsAtom = atom(null, (_get, set) => {
  set(selectedAddonsAtom, []);
});

/*
 * `addAddonAtom` and `removeAddonAtom` went with it. Joining or leaving a plan
 * is a round trip to Stripe, not a set() — see `hooks/use-addons.ts`, which
 * carries over the one piece of local work `removeAddonAtom` did: clearing a
 * pin stored under the add-on's id.
 */

/**
 * Whether the first-run overlay is on screen right now.
 *
 * Published by `FirstRunOverlay` and read by `ActivationNudge`, so the nudge
 * doesn't arrive on the same load underneath a modal nobody can get past.
 *
 * Ephemeral, and deliberately not derived from the store's `complete` flag
 * alone. That flag can't answer "is the card up" on its own: the overlay also
 * reopens with `complete` false long after first run is over — the business
 * switcher offers re-running the tailoring — and it renders nothing at all for
 * the tick before the store rehydrates. Readers need the answer to the
 * narrower question, so the overlay states it rather than leaving it to be
 * inferred.
 */
export const firstRunOverlayOpenAtom = atom(false);

/** Ephemeral shell UI state — Jotai per the spec's state split. */
export const commandOpenAtom = atom(false);
/** The Ask Sole widget's open/closed state — read by `SupportChat` and, in
 *  principle, settable from anywhere else that wants to open it. */
export const chatOpenAtom = atom(false);

/**
 * Per-screen preview state, so each list can be demoed empty or populated.
 * Default "data" — the populated view is the real one.
 */
export const transactionsPreviewAtom = atom<PreviewState>("data");

/**
 * Dashboard view state. The reporting period lives in the Cash flow card's own
 * state now — it's the only thing a period changes, and a card that owns its
 * controls doesn't need a page-wide atom.
 */
export const accountStageAtom = atom<AccountStage>("active");

/**
 * How finely "Where your customers are" groups its rows.
 *
 * Stored, and shared by the dashboard card and the insights page — they're two
 * views of one question, and answering it twice differently is how a summary
 * ends up disagreeing with the page it summarises.
 */
export const areaLevelAtom = atomWithStorage<AreaLevel>(
  "sole.dashboard.area-level",
  DEFAULT_AREA_LEVEL,
);

/** Contacts screen UI state. */
export const contactsTabAtom = atom<ContactTab>("Client");
export const contactsQueryAtom = atom("");
/** `editId` null means the dialog is creating rather than editing. */
export const contactDrawerAtom = atom<{ open: boolean; editId: string | null }>(
  { open: false, editId: null },
);
export const deleteContactIdAtom = atom<string | null>(null);
export const bulkUploadOpenAtom = atom(false);
export const bulkStepAtom = atom<1 | 2 | 3 | 4>(1);

/** Invoices list UI state. */
export const invoicesTabAtom = atom<InvoiceTab>("All");
export const invoicesQueryAtom = atom("");
/**
 * The invoices queued for deletion — one from a row menu, or a whole selection.
 * A list rather than an id, so both routes end at the same confirmation.
 */
export const deleteInvoiceIdsAtom = atom<string[]>([]);
/**
 * Row-menu dialogs: read-only detail (the same dialog also serves print/
 * download — see InvoicePreviewDialog) and attachments.
 */
export const viewInvoiceIdAtom = atom<string | null>(null);
export const attachInvoiceIdAtom = atom<string | null>(null);
/** The invoice being reconciled against the bank feed, if any. */
export const matchInvoiceIdAtom = atom<string | null>(null);
/** The invoice whose match is being undone, if any. */
export const unmatchInvoiceIdAtom = atom<string | null>(null);
/** The invoice whose audit trail is open, if any. */
export const historyInvoiceIdAtom = atom<string | null>(null);
/** The invoice being marked paid with cash — open while its payment-date dialog is. */
export const cashPaymentInvoiceIdAtom = atom<string | null>(null);
/**
 * The recurring invoice queued to stop, if any — confirmed before it takes
 * effect. Carries the number with the id, so the dialog never depends on the
 * row also being in the store's newest-200 cache.
 */
export const stopRecurringInvoiceIdAtom = atom<{
  id: string;
  number: string;
} | null>(null);
/** Rows per page on the invoices list — same shared sizes every paginated table offers. */
export const invoicesPageSizeAtom = atom<PageSize>(25);
/**
 * The invoice open in the quick editor, if any. Set from anywhere an invoice is
 * referenced rather than listed — the linked invoice on a converted quote, so
 * far.
 */
export const quickEditInvoiceIdAtom = atom<string | null>(null);

/** Quotes list UI state. */
export const quotesFilterAtom = atom<QuoteFilter>("All");
export const quotesQueryAtom = atom("");
/** Rows per page on the quotes list — same shared sizes every paginated table offers. */
export const quotesPageSizeAtom = atom<PageSize>(25);
/**
 * The page of quotes the list is showing. The row dialogs (view, history,
 * delete) look a quote up here as well as in the store, whose newest-200 fill
 * doesn't reach an older quote on a later page.
 */
export const listedQuotesAtom = atom<Quote[]>([]);
/**
 * The quotes queued for deletion — one from a row menu, or a whole selection.
 *
 * A list rather than an id, so the row action and the bulk action end at the
 * same confirmation instead of two dialogs that have to agree with each other.
 */
export const deleteQuoteIdsAtom = atom<string[]>([]);
export const viewQuoteIdAtom = atom<string | null>(null);
/** The quote whose history is open, if any. */
export const historyQuoteIdAtom = atom<string | null>(null);

/** Transactions list UI state. */
/** Opens on the Unmatched pile — the work still to do. */
export const transactionsFilterAtom = atom<TransactionFilter>("Review");
/**
 * Which financial year the lists are scoped to — the current one to start
 * with, as in sole-webapp (labelled by its end year). July to June here,
 * because an atom can't know the business; the Transactions screen moves it
 * onto the business's own year once the country context says what that is.
 */
export const transactionsPeriodAtom = atom<string>(
  financialYearLabel(fiscalYearOf(new Date()) + 1),
);
export const transactionsQueryAtom = atom("");
/**
 * Each tab's Filters popover, as applied — kept apart so narrowing Matched
 * by category doesn't leave Unmatched mysteriously filtered too.
 */
export const transactionsFiltersAtom = atom<{
  unmatched: TransactionFilterDraft;
  matched: TransactionFilterDraft;
}>({
  unmatched: EMPTY_TRANSACTION_FILTERS,
  matched: EMPTY_TRANSACTION_FILTERS,
});
export const viewTransactionIdAtom = atom<string | null>(null);
export const deleteTransactionIdAtom = atom<string | null>(null);
/** Row-menu dialogs: edit, recategorise, match to an expense, split. */
export const editTransactionIdAtom = atom<string | null>(null);
export const recategoriseTransactionIdAtom = atom<string | null>(null);
export const matchTransactionIdAtom = atom<string | null>(null);
/** The transaction whose match is being undone, if any. */
export const unmatchTransactionIdAtom = atom<string | null>(null);
export const splitTransactionIdAtom = atom<string | null>(null);
/** The transaction whose transfer destination is being chosen. */
export const markTransferIdAtom = atom<string | null>(null);

/* ------------------------------------------------------------------ *
 * Payments
 * ------------------------------------------------------------------ */

/**
 * Which half of the Payments screen is showing, once someone has picked.
 *
 * Null means nobody has, and the screen follows the account instead: a gateway
 * connected means they came to see money, none means they came to find a
 * provider. Holding "not chosen" as a value rather than as a second flag keeps
 * the default out of an effect — the tab is derived at render, so it can't
 * flicker through the wrong one on the way.
 */
export const paymentsTabAtom = atom<PaymentTab | null>(null);

/**
 * The gateway ids the account has connected.
 *
 * Seeded with one, so the screen opens on the state most accounts are in.
 * Ephemeral for now: a real connection lives with the provider, not in the
 * browser, and storing it here would only disagree with them later.
 */
/**
 * The gateways connected in this session.
 *
 * Empty to start. It used to seed `["stripe"]`, which had two effects nobody
 * asked for: the Payments screen opened on Transactions rather than Gateways
 * (see `hasGateway`), and the Stripe card resolved to "connected" — so its
 * "Continue onboarding" button was never rendered, and looked like a button
 * that did nothing.
 *
 * Connecting is now each provider's own flow rather than a generic button, so
 * this fills from those rather than from a seed.
 */
export const connectedGatewaysAtom = atom<string[]>([]);

/**
 * SolePay onboarding, as it stands.
 *
 * An atom rather than state on the overview screen, because the five steps are
 * five routes: saving the entity form and returning to the overview is a
 * navigation, and component state doesn't survive one. This is the client's
 * cache of what Worldpay actually holds — hydrated from `fetchSolePayDraft()`
 * on the shell's mount, and written through on every step's save.
 *
 * Not persisted to storage: a reload re-fetches the real draft rather than
 * trusting a stale local copy, the same reasoning `useExpensesStore` follows.
 */
export const solePayOnboardingAtom = atom<SolePayOnboarding>(
  EMPTY_SOLEPAY_ONBOARDING,
);

/**
 * What the last fetch/save told us about the draft — `isComplete`,
 * `applicationStatus`, and which fields Worldpay itself still considers
 * missing or invalid. Kept separate from the answers themselves: this is
 * server-reported metadata, not something a step's form edits directly.
 */
export const solePayMetaAtom = atom<SolePayDraftMeta>(EMPTY_SOLEPAY_META);

/** Whether the shell has fetched the real draft yet — gates the first paint so a step doesn't briefly show blank defaults before the real answers land. */
export const solePayHydratedAtom = atom<boolean>(false);

/**
 * NextTap onboarding, as it stands.
 *
 * Same reasoning as SolePay's atoms above — the steps are routes, so the
 * answers can't live in a screen's state and survive the navigation between
 * them. Hydrated from `fetchNexxtapOnboarding()` on the shell's mount, and
 * written through on every step's save.
 */
export const nexxtapOnboardingAtom = atom<NexxtapOnboarding>(
  EMPTY_NEXXTAP_ONBOARDING,
);

/** The application id, its status and the service's completion percentage. */
export const nexxtapMetaAtom = atom<NexxtapMeta>(EMPTY_NEXXTAP_META);

/**
 * The documents the service already holds.
 *
 * Kept beside the answers rather than inside them: uploads go through their
 * own endpoint and never touch `draft_payload`, so a save of the Bank step
 * shouldn't be able to overwrite what's on file.
 */
export const nexxtapDocumentsAtom = atom<NexxtapUploadedDocument[]>([]);

/** Whether the shell has fetched the real application yet — gates the first paint. */
export const nexxtapHydratedAtom = atom<boolean>(false);

export const paymentsStatusAtom = atom<LoadStatus>("idle");
export const paymentsErrorAtom = atom<string | null>(null);
export const paymentsAtom = atom<Payment[]>([]);

/**
 * Fetches the payments — the one write that moves all three atoms above, so
 * status, error and rows can't drift apart.
 *
 * The failure is reachable on purpose (`load({ fail: true })`), because an
 * error state nobody can reach is an error state nobody has looked at. It
 * clears the rows as it goes: figures from a half-finished load are worse than
 * none.
 */
export const loadPaymentsAtom = atom(
  null,
  async (get, set, options: { fail?: boolean } = {}) => {
    // A second call while one is in flight would only race the first.
    if (get(paymentsStatusAtom) === "loading") return;
    set(paymentsStatusAtom, "loading");
    set(paymentsErrorAtom, null);
    // Mocked latency, long enough to see the skeletons. TODO: wire the
    // provider API and drop the timeout.
    await new Promise((resolve) => setTimeout(resolve, 650));

    if (options.fail) {
      set(paymentsStatusAtom, "error");
      set(paymentsErrorAtom, "We couldn't reach your payment provider.");
      set(paymentsAtom, []);
      return;
    }
    set(paymentsAtom, SEED_PAYMENTS);
    set(paymentsStatusAtom, "ready");
  },
);

export const connectGatewayAtom = atom(null, (get, set, gatewayId: string) => {
  const current = get(connectedGatewaysAtom);
  if (current.includes(gatewayId)) return;
  set(connectedGatewaysAtom, [...current, gatewayId]);
});

export const disconnectGatewayAtom = atom(
  null,
  (get, set, gatewayId: string) => {
    set(
      connectedGatewaysAtom,
      get(connectedGatewaysAtom).filter((id) => id !== gatewayId),
    );
  },
);

/* ------------------------------------------------------------------ *
 * Gateway-specific payment sub-tabs
 * ------------------------------------------------------------------ */

/**
 * Which gateway's transaction tab is active within the Payments screen.
 *
 * Mirrors sole-webapp's URL-based `?id=worldpay-payments` / `?id=stripe-payments`
 * logic, but stored in an atom so it survives in-app navigation without touching
 * the URL — consistent with how this app handles all other tab state.
 *
 * Null means "not yet chosen" and the screen picks a sensible default based on
 * which gateways are connected (same as sole-webapp's own fallback).
 */
export const gatewayTransactionTabAtom = atom<
  | "gateways"
  | "solepay-payments"
  | "stripe-payments"
  | "nexttap-payments"
  | null
>(null);

/** Whether the account has a completed SolePay (Worldpay/Payrix) merchant account. */
export const worldpayConnectedAtom = atom<boolean>(false);
/** Whether the account has completed Stripe onboarding. */
export const stripeConnectedAtom = atom<boolean>(false);
/** Whether the current business has a NextTap Merchant ID linked. */
export const nexxtapConnectedAtom = atom<boolean>(false);

/** Whether a connection-check is in flight. */
export const checkingGatewayConnectionAtom = atom<boolean>(true);

/** SolePay (Worldpay/Payrix) transaction rows for the current page. */
export const worldpayPaymentsAtom = atom<Payment[]>([]);
export const worldpayPaginationAtom = atom<GatewayPagination>(
  EMPTY_GATEWAY_PAGINATION,
);
export const worldpayLoadingAtom = atom<boolean>(false);

/** Stripe transaction rows for the current page. */
export const stripePaymentsAtom = atom<Payment[]>([]);
export const stripePaginationAtom = atom<GatewayPagination>(
  EMPTY_GATEWAY_PAGINATION,
);
export const stripeLoadingAtom = atom<boolean>(false);

/** Inventory list UI state. */
export const inventoryFilterAtom = atom<InventoryFilter>("All");
export const inventoryQueryAtom = atom("");
export const deleteItemIdAtom = atom<string | null>(null);
export const adjustStockIdAtom = atom<string | null>(null);
/** Item whose full stock history drawer is open, beyond the inline preview. */
export const inventoryHistoryIdAtom = atom<string | null>(null);

/** Sales settings: which tab is open, and the unsaved draft for it. */
export const salesTabAtom = atom<SalesTab>("settings");
export const salesDraftAtom = atom<Partial<SalesSettings> | null>(null);

/**
 * Products & services list UI state. Deletion reuses Inventory's
 * `deleteItemIdAtom` and dialog — it's one catalogue, so one confirmation.
 */
export const productsTabAtom = atom<ProductTab>("General");
/**
 * One query for all three tabs.
 *
 * Searching for "assessment" and switching tab is a person asking the same
 * question of a different catalogue, so the term follows them. Filters don't:
 * they name fields that only exist on the tab they were set from.
 */
export const productsQueryAtom = atom("");
export const productFiltersAtom = atom<ProductFilters>(EMPTY_PRODUCT_FILTERS);
export const generalFiltersAtom = atom<GeneralFilters>(EMPTY_GENERAL_FILTERS);
export const ndisFiltersAtom = atom<NdisFilters>(EMPTY_NDIS_FILTERS);
export const productFilterOpenAtom = atom(false);
export const productDialogAtom = atom<{ open: boolean; editId: string | null }>(
  {
    open: false,
    editId: null,
  },
);
export const productBulkOpenAtom = atom(false);
export const viewProductIdAtom = atom<string | null>(null);
/** Page and size per tab, so switching tabs doesn't land you on a dead page. */
export const productsPageAtom = atom<Record<ProductTab, number>>({
  General: 1,
  NDIS: 1,
  Custom: 1,
});
export const productsPageSizeAtom = atom<PageSize>(10);

/** Client refunds list UI state. */
export const refundsQueryAtom = atom("");
export const viewRefundIdAtom = atom<string | null>(null);
export const refundStatusFilterAtom = atom<RefundStatusFilter>("All status");
export const deleteRefundIdAtom = atom<string | null>(null);

/** Vendor refunds list UI state. Its own atoms, so filtering one refunds
 *  screen doesn't silently filter the other. */
export const vendorRefundPeriodAtom = atom<VendorRefundPeriod>("This year");
export const vendorRefundsQueryAtom = atom("");
export const viewVendorRefundIdAtom = atom<string | null>(null);
export const vendorRefundStatusFilterAtom =
  atom<VendorRefundStatusFilter>("All status");

/** Assets list UI state. */
export const assetsQueryAtom = atom("");
export const assetsAdvancedFilterAtom = atom<AssetAdvancedFilters>(
  EMPTY_ASSET_ADVANCED_FILTERS,
);
export const assetsSortAtom = atom<AssetSort>("Newest first");
export const assetSelectionAtom = atom<string[]>([]);
/**
 * The asset a dialog is acting on: viewing, attaching, deleting.
 *
 * Depreciation, its schedule, insurance and disposal are pages under
 * `/assets/{id}/…` rather than dialogs, so none of them needs an atom to say
 * which record it's on — the URL says it.
 */
export const viewAssetIdAtom = atom<string | null>(null);
export const attachAssetIdAtom = atom<string | null>(null);
/**
 * @deprecated Depreciation is a page now — `/assets/{id}/depreciation`. Nothing
 * in the app reads this; it stays only because the vendored `sole-project`
 * snapshot still imports it from here, and it should go with that.
 */
export const depreciationAssetIdAtom = atom<string | null>(null);
export const deleteAssetIdAtom = atom<string | null>(null);
/** Non-null while a bulk delete is being confirmed. */
export const deleteAssetIdsAtom = atom<string[] | null>(null);
/** Non-null while the match-transaction dialog is open for this asset. */
export const matchAssetIdAtom = atom<string | null>(null);
/** Non-null while an undo-match confirmation is open for this asset. */
export const undoAssetMatchIdAtom = atom<string | null>(null);
/**
 * Set alongside `undoAssetMatchIdAtom` when the undo is the first half of an
 * edit (the BAS review's "Edit" on a matched asset): holds the asset to open in
 * the edit form once its match is undone, and makes the dialog say so.
 */
export const editAssetAfterUndoAtom = atom<string | null>(null);
/** Non-null while a bulk undo-match is being confirmed. */
export const bulkUndoAssetMatchIdsAtom = atom<string[] | null>(null);
/**
 * The registry of makes and asset types, open for management.
 *
 * An atom rather than local state because two screens open the same dialog:
 * the Assets header, and the Manage registry link under either dropdown on the
 * asset form — a different route entirely.
 */
export const assetRegistryOpenAtom = atom(false);

/** The bulk asset import dialog, open or closed. */
export const assetBulkOpenAtom = atom(false);

/**
 * The Invoices and Expenses bulk importers.
 *
 * Atoms rather than local state for the same reason the Contacts one is: the
 * Data Migration Center mounts each dialog and opens it in place, so the step
 * runs without bouncing someone to another screen and leaving them there.
 */
export const invoiceBulkOpenAtom = atom(false);
export const expenseBulkOpenAtom = atom(false);

/** Super contributions list UI state. */
export const superPeriodAtom = atom<SuperPeriod>("This year");
export const superQueryAtom = atom("");
/** The contribution being matched, and the one queued for deletion. */
export const matchContributionIdAtom = atom<string | null>(null);
export const deleteContributionIdAtom = atom<string | null>(null);

/** Expenses list UI state. */
export const expensesQueryAtom = atom("");
/** Same reasoning as `matchExpenseAtom` — the full row, not an id to look up. */
export const deleteExpenseAtom = atom<Expense | null>(null);
/**
 * The full row, not just an id to look up — the listing no longer keeps
 * every expense in a shared store by default (real pagination only holds
 * the current page), so a lookup here would come up empty for any expense
 * not on whatever page happened to be loaded last. The row already has the
 * full object in hand when it opens this.
 */
export const matchExpenseAtom = atom<Expense | null>(null);
/* ------------------------------------------------------------------ *
 * Liabilities
 * ------------------------------------------------------------------ */

export const liabilitiesQueryAtom = atom("");
export const liabilitiesPageAtom = atom(1);
export const liabilitiesPageSizeAtom = atom<PageSize>(10);
export const viewLiabilityIdAtom = atom<string | null>(null);
export const attachLiabilityIdAtom = atom<string | null>(null);
export const deleteLiabilityIdAtom = atom<string | null>(null);
export const matchLiabilityIdAtom = atom<string | null>(null);
export const unmatchLiabilityIdAtom = atom<string | null>(null);

/* ------------------------------------------------------------------ *
 * Proposals
 * ------------------------------------------------------------------ */

export const proposalsQueryAtom = atom("");
export const proposalsStatusAtom = atom<ProposalStatus | "all">("all");
export const proposalsPageAtom = atom(1);
export const proposalsPageSizeAtom = atom<PageSize>(50);
export const viewProposalIdAtom = atom<string | null>(null);
/** The row itself — the list is server-paged, so there's no store to look it up in. */
export const deleteProposalAtom = atom<ProposalRow | null>(null);
export const proposalTemplatePickerOpenAtom = atom(false);

/* ------------------------------------------------------------------ *
 * KM Tracker
 *
 * Held here rather than in the screen so the filters and page someone was
 * on are still there when they come back from adding or editing a trip.
 * ------------------------------------------------------------------ */

export const kmFiltersAtom = atom<KmTripFilters>(DEFAULT_KM_FILTERS);
export const kmPageAtom = atom(1);

/* ------------------------------------------------------------------ *
 * Equity / capital
 * ------------------------------------------------------------------ */

export const equityQueryAtom = atom("");
export const equityPageAtom = atom(1);
export const equityPageSizeAtom = atom<PageSize>(10);
export const viewEquityIdAtom = atom<string | null>(null);
export const attachEquityIdAtom = atom<string | null>(null);
export const deleteEquityIdAtom = atom<string | null>(null);
export const matchEquityIdAtom = atom<string | null>(null);
export const unmatchEquityIdAtom = atom<string | null>(null);

/** The expense whose match is being undone, if any — same reasoning as `matchExpenseAtom`. */
export const unmatchExpenseAtom = atom<Expense | null>(null);
/** The expense being reconciled against the bank feed, if any. */
export const matchExpenseIdAtom = atom<string | null>(null);
/** The expense whose match is being undone, if any. */
export const unmatchExpenseIdAtom = atom<string | null>(null);

export const expensePeriodAtom = atom<ExpensePeriod>("This year");
export const expenseSortAtom = atom<ExpenseSort>("Date, newest");
/** Selected row ids, for the bulk action bar. */
export const expenseSelectionAtom = atom<string[]>([]);
export const viewExpenseIdAtom = atom<string | null>(null);
/** Same reasoning as `matchExpenseAtom` — the full row, not an id to look up. */
export const attachExpenseAtom = atom<Expense | null>(null);
/**
 * The expense being on-charged, if any — what opens the invoice editor in a
 * dialog over the list rather than navigating away from it, same as
 * sole-webapp's own "Convert to Invoice" drawer. The whole row, not an id:
 * the listing is paginated server-side, so the store it would be looked up in
 * generally doesn't hold it.
 */
export const convertExpenseAtom = atom<Expense | null>(null);

/**
 * The explainer that runs before the provider's flow.
 *
 * Every "add bank account" button opens this rather than the flow itself, so
 * the consent explanation can't be bypassed by adding another entry point —
 * `connectBankOpenAtom` is what the explainer's Continue sets, and nothing else
 * should set it.
 */
export const connectBankIntroOpenAtom = atom(false);
export const connectBankOpenAtom = atom(false);
/**
 * A Fiskil link already fetched by whoever opened the flow — the "Add Bank
 * Account" button fetches it while showing its own loading, so the full-screen
 * view opens straight onto Fiskil. Null means the view fetches one itself.
 */
export const connectBankAuthUrlAtom = atom<string | null>(null);
/** The accountant invite, opened from the get-started list on any page. */
export const inviteAccountantOpenAtom = atom(false);

/**
 * Auth UI state. The field values stay local to each form — they're per-screen —
 * while these three cross the boundary between screens: the address being
 * authenticated, whether a request is in flight, and the error the last one
 * came back with.
 */
export const authEmailAtom = atom("accounts.coastalspark@example.com");
export const authPendingAtom = atom(false);
export const authErrorAtom = atom<string | null>(null);

/**
 * The name given at sign-up, as one string — that's how it was asked for, and
 * splitting a name into two boxes is a question nobody should be asked twice.
 * Onboarding reads it rather than re-collecting it.
 *
 * Stored, not ephemeral: sign-up and onboarding are separate page loads, and an
 * atom that only lives in memory would lose the name between them.
 */
export const authNameAtom = atomWithStorage("sole.auth.name", "");

/**
 * Business planner UI state. Which tab, which form is open, and the one-off
 * explainer.
 */
/**
 * Which section the tabbed screen shows. Goal, budget, expense-plan and wallet
 * details are routed pages, so they set this on mount — leaving one returns to
 * the tab it belongs to rather than to Overview.
 */
export const plannerTabAtom = atom<PlannerTab>("Overview");
export const deleteGoalIdAtom = atom<string | null>(null);
export const deleteBudgetIdAtom = atom<string | null>(null);
export const deletePlanIdAtom = atom<string | null>(null);
/**
 * Whether the "allocations don't post a transaction" explainer has been shown.
 *
 * Stored, because "once" has to outlive the session, and set the moment the
 * banner appears rather than when it's closed — otherwise navigating away
 * without dismissing it would let it come back. Nothing renders directly from
 * this value, so there's no server/client mismatch on first paint.
 */
export const plannerHintSeenAtom = atomWithStorage(
  "sole.planner.hint-seen",
  false,
);

/* ------------------------------------------------------------------ *
 * Reporting suite
 * ------------------------------------------------------------------ */

/**
 * The Profit & Loss period, and the dates behind "Custom range".
 *
 * Ephemeral, like every other screen's period: a report is a question someone
 * asks now, and reopening the page on a range they set last week would answer a
 * question they've stopped asking. The range survives switching away from Custom
 * and back, though, so a preset isn't a trap that discards the dates.
 */
export const plPeriodAtom = atom<ReportPeriod>("This financial year");
export const plRangeAtom = atom<ReportRange | null>(null);

/**
 * Which state the P&L is being demoed in — the dev-only preview toggle.
 *
 * Defaults to "data", so a production build (where the toggle doesn't render)
 * shows the report rather than a first-run screen nobody can switch off.
 */
export const plPreviewAtom = atom<PreviewState>("data");

/**
 * The Transaction Listing's period, range and preview.
 *
 * Its own three rather than sharing the P&L's: they're two reports someone moves
 * between, and a period set on one is not a period asked for on the other — the
 * listing opens on this month where the P&L opens on the year.
 */
export const tlPeriodAtom = atom<ReportPeriod>("This month");
export const tlRangeAtom = atom<ReportRange | null>(null);
export const tlPreviewAtom = atom<PreviewState>("data");

/**
 * The BAS report's period and range. Opens on last quarter — the one that's
 * actually due to be lodged, where this quarter is still being traded.
 */
export const basPeriodAtom = atom<ReportPeriod>("Last quarter");
export const basRangeAtom = atom<ReportRange | null>(null);

/**
 * The Asset Listing's and Customer/Supplier report's periods.
 *
 * Both open on the financial year: an asset register and a contact's dealings
 * are year-scoped questions, where the P&L's caller usually wants a month.
 * Chart of Accounts and the Audit Trail have no period atom because neither
 * endpoint takes dates.
 */
export const assetListingPeriodAtom = atom<ReportPeriod>("This financial year");
export const assetListingRangeAtom = atom<ReportRange | null>(null);
export const custSupplierPeriodAtom = atom<ReportPeriod>("This financial year");
export const custSupplierRangeAtom = atom<ReportRange | null>(null);

/** The Cash Flow report's period — opens on the month, like a bank statement. */
export const cashFlowPeriodAtom = atom<ReportPeriod>("This month");
export const cashFlowRangeAtom = atom<ReportRange | null>(null);

/**
 * Whether the send-report modal is open.
 *
 * One atom for every report, because only one report page is mounted at a time
 * and each passes its own descriptor into the dialog.
 */
export const sendReportOpenAtom = atom(false);

/** Matching rules list UI state. */
export const rulesFilterAtom = atom<RuleFilter>("All");
export const rulesQueryAtom = atom("");
export const deleteRuleIdAtom = atom<string | null>(null);

/**
 * Settings UI state. Each section's draft is null until it's edited, so it
 * mirrors the store — and survives switching sections without going stale.
 *
 * Which section is open is no longer one of these: it lives in the URL's
 * `?section=` query param instead (see `components/settings/settings-screen.tsx`),
 * so a tab is linkable and survives a refresh.
 */
/**
 * `BusinessDetailsForm`/`BankDetailsForm` rather than the old
 * `BusinessDetails`/`BankSettings`: those two sections read and write the
 * server record now (`lib/business-settings.ts`), so the draft has to be the
 * shape that goes on the wire — `industryId`, not an industry name off a
 * local list that `update_business_profile` never read.
 *
 * Tagged with the business id it was edited against, same as
 * `stores/preferences.ts` keys its own per-business state — a flat, untagged
 * draft left a business's in-progress edits on screen after switching to a
 * different one, showing (and "Save"-ing) the wrong business's data. See
 * `useSectionDraft`.
 */
export const businessDraftAtom = atom<SectionDraft<BusinessDetailsForm>>(null);
export const bankDraftAtom = atom<SectionDraft<BankDetailsForm>>(null);
/**
 * Both of these carry their section's server-backed fields alongside its
 * device-local ones — one draft per section, regardless of how many places it
 * ends up being written to on Save.
 */
export const documentsDraftAtom =
  atom<SectionDraft<DocumentsSectionForm>>(null);
export const taxDraftAtom = atom<SectionDraft<TaxSectionForm>>(null);
export const notificationsDraftAtom =
  atom<SectionDraft<NotificationSettings>>(null);
