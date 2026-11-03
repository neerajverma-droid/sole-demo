"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import usertour from "usertour.js";

import { useSession } from "@/components/auth/session-provider";
import { mountTourCardMotion } from "@/components/usertour/tour-card-motion";
import { mountTourSpotlight } from "@/components/usertour/tour-spotlight";
import { useOnboardingSurveySessionStore } from "@/stores/onboarding-survey";

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
  // A sticky or fixed bar, like the editors' save actions, is on screen
  // wherever the page is scrolled. Scrolling the window for it only moved
  // the page under it, so the card landed beside some unrelated section.
  if (isPinned(el)) return;

  const rect = el.getBoundingClientRect();
  const viewport = window.innerHeight;
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";

  // Inside a dialog or drawer the page is locked and only the panel scrolls,
  // so moving the window would do nothing. Steps there sit beside the panel
  // rather than above their target, so it only has to come into view.
  if (el.closest('[role="dialog"]')) {
    el.scrollIntoView({ block: "nearest", behavior });
    return;
  }

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
