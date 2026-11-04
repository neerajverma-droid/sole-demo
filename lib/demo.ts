/**
 * The demo login.
 *
 * A prospect clicks "Explore the demo" and is signed in to a fully populated
 * account they can actually use — add an invoice, edit a contact, run a
 * report. Everything they do is wiped when they sign out, or once they've been
 * gone for a while (a closed tab).
 *
 * Almost all of that lives in the backend (sole-ocr docs/DEMO_LOGIN.md): a pool
 * of identical accounts, each handed to one visitor at a time and restored
 * from a snapshot afterwards. This side only starts the visit and says, on
 * every screen, that it is one.
 *
 * A demo session is an ordinary session once it exists — same cookies, same
 * refresh, same sign-out — so nothing else in the app needs to know about it.
 * Two small additions: the banner sends a heartbeat while the tab is open
 * (`sendDemoHeartbeat`), and a demo session that dies says "your demo has
 * ended" on the sign-in screen instead of "your session expired"
 * (`sessionEndReason` in lib/api/session.ts).
 */

import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { apiPost } from "@/lib/api/client";
import { setBusinessId } from "@/lib/api/business-id";
import { ensureDeviceId } from "@/lib/api/device";
import { PLATFORM } from "@/lib/api/env";
import { apiRoutes } from "@/lib/api/routes";
import { setSession } from "@/lib/api/session";
import type { AuthUser } from "@/lib/api/types";
import { demoUser } from "@/lib/demo-seed/mock-server";

/**
 * Whether to offer the demo at all. In sole-demo this is enabled by default.
 */
export const DEMO_LOGIN_ENABLED =
  process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED !== "false";

export type DemoResult =
  | { ok: true; user: AuthUser | null }
  | { ok: false; message: string };

const GENERIC_FAILURE =
  "We couldn't start the demo. Please try again in a moment.";

/** Sign in to a free demo account. Resolves either way, like every auth call. */
export async function startDemo(): Promise<DemoResult> {
  const device_id = await ensureDeviceId();
  if (!device_id) {
    return {
      ok: false,
      message:
        "We couldn't set this browser up for the demo. Refresh the page and try again.",
    };
  }

  const result = await apiPost<{ user?: AuthUser }>(apiRoutes.demo.login, {
    device_id,
    platform: PLATFORM,
  });

  if (!result.success) {
    return { ok: false, message: result.message || GENERIC_FAILURE };
  }

  const user = result.data?.user || (demoUser as AuthUser);

  setSession(user);
  setBusinessId(String((user as any).business_id || 1));
  track(EVENTS.SIGNIN_COMPLETED, { method: "demo" });
  return { ok: true, user };
}

/**
 * How often an open demo tab says it's still there. The backend ends a visit
 * it hasn't heard from in 5 minutes (DEMO_IDLE_MINUTES), so a minute leaves
 * room for the throttling browsers apply to background tabs.
 */
export const DEMO_HEARTBEAT_MS = 60_000;

/**
 * "This tab is still open." Keeps the seat of a visitor who is reading rather
 * than clicking. Once the visit is over the backend answers 401, and the
 * client's normal dead-session handling takes the visitor to sign-in.
 */
export async function sendDemoHeartbeat(): Promise<void> {
  await apiPost(apiRoutes.demo.heartbeat, {}, { auth: "bearer" });
}

export function isDemoUser(user: AuthUser | null | undefined): boolean {
  return Boolean(user?.is_demo);
}
