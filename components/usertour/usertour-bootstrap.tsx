"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import usertour from "usertour.js";

import { useSession } from "@/components/auth/session-provider";
import { mountTourCardMotion } from "@/components/usertour/tour-card-motion";
import {
  mountTourSpotlight,
  setTourTarget,
} from "@/components/usertour/tour-spotlight";
import { getAccessToken, getRefreshToken } from "@/lib/api/session";
import { endDashboardDemo } from "@/lib/dashboard-demo";
import { useOnboardingSurveySessionStore } from "@/stores/onboarding-survey";
import { sessionUserId, useSessionStore } from "@/stores/session";

const USERTOUR_TOKEN = process.env.NEXT_PUBLIC_USERTOUR_TOKEN;

/*
 * The Usertour backend to talk to, for a self-hosted instance. Unset means
 * Usertour Cloud. Only the websocket moves — the SDK bundle and its CSS still
 * load from Cloud, which is why ASSETS_URI and the bundle URLs are left alone.
 *
 * It has to be on `window` before `init()`: the npm package is only a loader,
 * and the bundle it fetches reads this when it boots. Don't also call
 * `setServerEndpoint()` — with both set the SDK hangs.
 */
const USERTOUR_WS_URI = process.env.NEXT_PUBLIC_USERTOUR_WS_URI;

/*
 * Room to leave above a tour target: the sticky top bar plus a tour card
 * (about 260px with a two-line title) plus the gap to its notch.
 */
const TOUR_CARD_ROOM = 320;
/** The sticky top bar plus a little air: where a target goes when its card has to sit below it. */
const TOP_BAR_ROOM = 72;
/** How long after a step starts its target may still change size and be placed again. */
const SETTLE_MS = 2000;

let settling: ResizeObserver | null = null;

/**
 * Where the SDK scrolls a tooltip's target to.
 *
 * The SDK asks once, as soon as the target is in the DOM — which can be before
 * its data has landed. The settings profile header is a line of dashes at
 * that point and twice the height a moment later, and on a phone the card
 * placed against the short version ended up off the bottom of the screen. So
 * the target is placed again if it changes size while the step settles.
 */
function scrollTourTarget(el: Element) {
  // The spotlight rings this element itself, not the box the SDK measured —
  // or, inside a `data-tour-scroll` block, the whole block: the step points at
  // a small header so the card can sit beside it, and the ring covers the
  // card the header belongs to.
  setTourTarget(el.closest("[data-tour-scroll]") ?? el);
  revealSideways(el);
  settling?.disconnect();
  placeTourTarget(el);

  let first = true;
  const observer = new ResizeObserver(() => {
    // Observing reports the current size straight away; only changes count.
    if (first) {
      first = false;
      return;
    }
    placeTourTarget(el);
  });
  observer.observe(el);
  settling = observer;
  setTimeout(() => observer.disconnect(), SETTLE_MS);
}

/**
 * The SDK centres a target by default, which is fine for a button and wrong
 * for a dashboard card: centre a 420px card in an 800px window and there's
 * under 200px left either side, so the tour card fits nowhere and hangs off
 * the bottom of the screen. Instead the target is parked low enough to leave
 * a card's height clear above it, and left alone if it's already there.
 */
function placeTourTarget(el: Element) {
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";

  // Inside a dialog or drawer the page is locked and only the panel scrolls,
  // so moving the window would do nothing. Steps there sit beside the panel
  // rather than above their target, so the panel is scrolled to bring it in.
  //
  // This has to come before the pinned check below: a dialog is itself
  // `position: fixed`, so everything inside one counted as pinned and this
  // branch was never reached — a step on a field further down a long form
  // (the Create property modal's purchase details) stayed out of view.
  if (el.closest('[role="dialog"]')) {
    scrollWithinDialog(el, behavior);
    return;
  }

  // A sticky or fixed bar, like the editors' save actions, is on screen
  // wherever the page is scrolled. Scrolling the window for it only moved
  // the page under it, so the card landed beside some unrelated section.
  if (isPinned(el)) return;

  const rect = el.getBoundingClientRect();
  const viewport = window.innerHeight;

  const roomAbove = rect.top >= TOUR_CARD_ROOM;
  const fullyVisible = rect.top >= 0 && rect.bottom <= viewport - 16;
  if (roomAbove && fullyVisible) return;

  const parkAt = window.scrollY + rect.top - TOUR_CARD_ROOM;

  // Too tall for the screen, like a whole settings section. Centring it left
  // the card no room on either side, so its top edge is parked a card's
  // height down instead: the card sits above it, and the spotlight runs on
  // past the bottom of the screen.
  if (rect.height + TOUR_CARD_ROOM > viewport - 16) {
    window.scrollTo({ top: Math.max(parkAt, 0), behavior });
    return;
  }

  // Near the top of the page the window can't scroll far enough to make room
  // above, and on a short phone screen the card then had nowhere to go but
  // off the bottom. Lift the target up under the top bar instead, so the card
  // fits beneath it.
  if (parkAt < 0 && viewport - rect.bottom < TOUR_CARD_ROOM - TOP_BAR_ROOM) {
    window.scrollTo({ top: window.scrollY + rect.top - TOP_BAR_ROOM, behavior });
    return;
  }

  window.scrollTo({ top: parkAt, behavior });
}

/**
 * Scrolls a dialog's own scrolling body so a step's target is in view.
 *
 * A target already fully on screen is left alone. Otherwise it is centred in
 * the body, with room above and below for the ring, or — when it is taller
 * than the body, like a block of several fields — lined up with the top so
 * its first field is what the card is beside. The footer, outside the body,
 * needs nothing.
 */
function scrollWithinDialog(el: Element, behavior: ScrollBehavior) {
  const dialog = el.closest('[role="dialog"]');
  let body: Element | null = null;
  for (
    let node = el.parentElement;
    node && node !== dialog;
    node = node.parentElement
  ) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      body = node;
      break;
    }
  }

  // No scrolling body inside: some dialogs (the km-tracker vehicle form)
  // scroll as a whole, so the dialog itself is the scroller.
  if (!body && dialog && dialog.scrollHeight > dialog.clientHeight) {
    body = dialog;
  }

  if (!body) {
    el.scrollIntoView({ block: "nearest", behavior });
    return;
  }

  // A target inside a `data-tour-scroll="start"` block always lines that
  // block up with the top of the body, even if the target is already visible.
  // For a step that points at a small header on top of a long section, so the
  // section reads from its start rather than wherever the body was left.
  const lineUp = el.closest('[data-tour-scroll="start"]');
  if (lineUp && body.contains(lineUp)) {
    lineUp.scrollIntoView({ block: "start", behavior });
    return;
  }

  const box = el.getBoundingClientRect();
  const frame = body.getBoundingClientRect();
  const inView = box.top >= frame.top && box.bottom <= frame.bottom;
  if (inView) return;

  el.scrollIntoView({
    block: box.height > body.clientHeight ? "start" : "center",
    behavior,
  });
}

/**
 * Slides a target that sits in a sideways-scrolling row into view — a tab like
 * "CGT" at the end of the property tabs, which a narrower window clips. Moves
 * only that row, instantly (so the target's box is settled when the card is
 * placed), and only when the target is actually cut off.
 */
function revealSideways(el: Element) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowX } = getComputedStyle(node);
    if (
      (overflowX === "auto" || overflowX === "scroll") &&
      node.scrollWidth > node.clientWidth
    ) {
      const box = el.getBoundingClientRect();
      const frame = node.getBoundingClientRect();
      if (box.left < frame.left || box.right > frame.right) {
        node.scrollTo({
          left: node.scrollLeft + (box.left - frame.left) - (frame.width - box.width) / 2,
          behavior: "auto",
        });
      }
      return;
    }
  }
}

/** Whether the target, or anything it sits in, is stuck to the viewport. */
function isPinned(el: Element) {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const { position } = getComputedStyle(node);
    if (position === "sticky" || position === "fixed") return true;
  }
  return false;
}

/**
 * Where a tour's `navigate` action goes. Without this the SDK sets
 * `window.location`, which reloads the whole app; a same-origin URL goes
 * through the router instead, so it is the same client-side route change as
 * clicking a link. Anything off-site still loads normally.
 */
function tourNavigate(push: (href: string) => void, url: string) {
  const next = new URL(url, window.location.href);
  if (next.origin !== window.location.origin) {
    window.location.assign(next.href);
    return;
  }
  push(`${next.pathname}${next.search}${next.hash}`);
}

declare global {
  interface Window {
    USERTOURJS_ENV_VARS?: Record<string, string>;
    /** Set once `usertour.init()` has run, so a re-run of the effect can't start a second SDK. */
    __usertourInitialised?: boolean;
  }
}

/**
 * Boots the Usertour SDK once per app load and keeps its identity in sync
 * with whoever is signed in. `identify()`'s userId must equal the
 * `externalId` Usertour content targets.
 *
 * The user comes from `SessionProvider`, which proves the token against
 * /auth/profile and is the only thing in the app that knows who is signed in.
 * This read used to go to the `sole-session` zustand store instead — a store
 * nothing ever writes to, so `user` was permanently null and every render
 * called `reset()` rather than `identify()`. No content could ever match a
 * user, because as far as Usertour was concerned there was never one.
 *
 * Mount this INSIDE `SessionProvider`: `useSession` throws outside it, and as
 * a sibling it could not see the session at all.
 */
export function UsertourBootstrap() {
  const { user, status } = useSession();
  const router = useRouter();
  const surveyDone = useOnboardingSurveySessionStore(
    (state) => state.surveyCompletedThisSession,
  );
  /** The userId `identify()` last succeeded for — `updateUser()` needs one. */
  const [identifiedAs, setIdentifiedAs] = React.useState<string | null>(null);
  /** Who was signed in last time, from the persisted session store. */
  const cachedUserId = useSessionStore((state) => sessionUserId(state.user));

  /*
   * `user_id`, not `id`. The profile endpoint returns `user_id` / `full_name`
   * (verified against the live response); `AuthUser` declares an optional
   * `id` that never arrives, and because every field on that type is optional
   * reading the wrong one type-checks cleanly and silently identifies nobody.
   */
  const userId = user?.user_id ?? user?.id;
  const name =
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    undefined;

  React.useEffect(() => {
    if (!USERTOUR_TOKEN) return;
    /*
     * Once per page load, whatever re-runs this effect. Strict Mode (on in
     * `next.config`) runs every effect twice in development, and each
     * `init()` starts its own SDK — two of them start the same tour a few
     * hundred milliseconds apart, so every tour appeared twice at once and
     * had to be dismissed twice. Kept on `window` rather than in the module so
     * a hot reload of this file doesn't forget it has already started.
     */
    if (window.__usertourInitialised) return;
    window.__usertourInitialised = true;
    if (USERTOUR_WS_URI) {
      window.USERTOURJS_ENV_VARS = {
        ...window.USERTOURJS_ENV_VARS,
        WS_URI: USERTOUR_WS_URI,
      };
    }
    usertour.setCustomScrollIntoView(scrollTourTarget);
    usertour.init(USERTOUR_TOKEN);
  }, []);

  React.useEffect(() => {
    if (!USERTOUR_TOKEN) return;
    usertour.setCustomNavigate((url) => tourNavigate(router.push, url));
    return () => usertour.setCustomNavigate(null);
  }, [router]);

  /*
   * What the dashboard tour calls when it ends, to swap the dashboard's sample
   * figures for the account's own: a "Run JavaScript" action on the tour's
   * last step (and its skip/dismiss, where it has one) with
   *
   *     window.soleEndDashboardDemo()
   *
   * Registered here rather than on the dashboard because this is mounted on
   * every page, so the call works wherever the tour happens to end.
   */
  React.useEffect(() => {
    // Wrapped so whatever a tour action passes along can't be taken for the
    // user id: the call is always for whoever is signed in.
    const end = () => endDashboardDemo();
    window.soleEndDashboardDemo = end;
    return () => {
      if (window.soleEndDashboardDemo === end) delete window.soleEndDashboardDemo;
    };
  }, []);

  // Its own effect so it gets a cleanup: unlike init(), it adds an element
  // and observers that a remount (or Strict Mode's double effect) would
  // otherwise duplicate.
  React.useEffect(() => {
    if (!USERTOUR_TOKEN) return;
    return mountTourSpotlight();
  }, []);

  // Same reasoning: observers that must not be duplicated by a remount.
  React.useEffect(() => {
    if (!USERTOUR_TOKEN) return;
    return mountTourCardMotion();
  }, []);

  /*
   * Identifies straight away as whoever was signed in last, rather than after
   * /auth/profile answers. Nothing can start until the SDK knows the user, so
   * waiting for the profile held every tour back by that whole round trip —
   * seconds, on a slow backend — even on screens whose tour needs no data.
   *
   * Only while the session is still "loading", and only with a token to
   * resume. The effect below then confirms it: the same id again is just an
   * attributes refresh in the SDK, and a different one (or no session at all)
   * switches or resets it as before.
   */
  React.useEffect(() => {
    if (!USERTOUR_TOKEN || status !== "loading" || cachedUserId == null) return;
    if (!getAccessToken() && !getRefreshToken()) return;
    void usertour
      .identify(cachedUserId)
      .then(() => setIdentifiedAs(cachedUserId))
      // Swallowed for the reason given below; the confirming identify logs.
      .catch(() => {});
  }, [status, cachedUserId]);

  React.useEffect(() => {
    if (!USERTOUR_TOKEN) return;
    /*
     * "loading" is the first render on every page load, before the profile
     * call settles. Resetting on it would sign the user out of Usertour on
     * each navigation and lose any flow mid-progress, so wait for an answer.
     */
    if (status === "loading") return;

    if (userId != null) {
      const id = String(userId);
      // No `onboarding_completed` here: it is set by the effect below, once
      // the onboarding survey is out of the way.
      void usertour
        .identify(id, { name, email: user?.email })
        .then(() => setIdentifiedAs(id))
        /*
         * Swallowed, deliberately.
         *
         * `identify` returns a promise, and it rejects whenever the SDK can't
         * reach its backend — which for a self-hosted instance
         * (`NEXT_PUBLIC_USERTOUR_WS_URI`) is any time that service is down or
         * simply not running locally. Uncaught, that is an unhandled
         * rejection: Next's dev overlay raises it as an application error and
         * the browser logs "The API request to create or update user
         * information was unsuccessful."
         *
         * Nothing about the product depends on it. Tours are optional chrome;
         * failing to register someone with the tour service is a reason for
         * them not to see a walkthrough, never a reason for the app to report
         * an error. Logged in development so it isn't invisible when someone
         * is actually working on tours.
         */
        .catch((error: unknown) => {
          if (process.env.NODE_ENV === "production") return;
          console.warn(
            "[usertour] identify failed — tours are off for this session.",
            USERTOUR_WS_URI
              ? `Self-hosted backend: ${USERTOUR_WS_URI}. Is it running?`
              : "",
            error,
          );
        });
    } else {
      usertour.reset();
      setIdentifiedAs(null);
    }
  }, [status, userId, name, user?.email]);

  /*
   * "Dashboard — first look" starts only when `onboarding_completed` is true
   * (and no `[role="dialog"]` is on screen). So it isn't sent until the
   * onboarding survey has settled for this tab: finished, dismissed, nothing
   * left to ask, or already seen on the server. A new user therefore gets
   * the survey first and the tour the moment it closes; everyone else has it
   * set within a second of landing.
   *
   * Only ever sent as true. Usertour keeps the value, so a later session
   * doesn't need to wait for the survey store before it counts.
   */
  React.useEffect(() => {
    if (!USERTOUR_TOKEN || !surveyDone || identifiedAs == null) return;
    void usertour
      .updateUser({ onboarding_completed: true })
      .catch((error: unknown) => {
        if (process.env.NODE_ENV === "production") return;
        console.warn("[usertour] could not set onboarding_completed.", error);
      });
  }, [surveyDone, identifiedAs]);

  return null;
}
