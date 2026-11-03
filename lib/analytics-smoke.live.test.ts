import { describe, expect, it } from "vitest";

import { ALL_EVENT_NAMES } from "@/lib/analytics-events";
import {
  buildSmokeEvents,
  compareArrivals,
  describeVerdict,
  exportDay,
  exportFilter,
  EXPORT_URL,
  passed,
  serviceAccountAuth,
  TRACK_URL,
  type ExportedEvent,
} from "@/lib/analytics-smoke";

/**
 * Phase 4: the only check that proves the data is real.
 *
 * Not part of `npm test`. It talks to Mixpanel over the network, takes a few
 * minutes, and writes events to a real project — none of which belongs in a
 * suite people run on every save. Run it with `npm run test:smoke`, against
 * staging, before a release that touched analytics.
 *
 * WHAT IT PROVES THAT NOTHING ELSE DOES. The typed union proves a name is
 * spelled right. The coverage test proves something calls it. The dev
 * validator proves a required property was passed. All three pass on an
 * integration whose token is wrong, whose events are rejected at ingestion,
 * or whose numbers arrive as strings and sum to zero on every chart. Every
 * defect in the old project was of that kind — the code was fine, and the
 * data was wrong for weeks.
 *
 * WHAT IT CANNOT PROVE. That an event fires at the right moment, or that the
 * app passes real values rather than the sentinels below. It tests the
 * pipeline, not the call sites. `analytics-coverage.test.ts` covers the
 * second half, and reading a funnel after a week covers the rest.
 *
 * REQUIRES, as environment variables:
 *
 *   NEXT_PUBLIC_MIXPANEL_TOKEN        the project token — what the browser sends
 *   MIXPANEL_PROJECT_ID               numeric, for the export API
 *   MIXPANEL_SERVICE_ACCOUNT_USER     a service account with export rights
 *   MIXPANEL_SERVICE_ACCOUNT_SECRET
 *
 * The first is the same variable the app itself reads, deliberately: a smoke
 * test run against a different token than the app uses would prove nothing
 * about the app.
 */

const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
const PROJECT_ID = process.env.MIXPANEL_PROJECT_ID;
const SA_USER =
  process.env.MIXPANEL_SERVICE_ACCOUNT_USER ||
  process.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME;
const SA_SECRET = process.env.MIXPANEL_SERVICE_ACCOUNT_SECRET;

const configured = Boolean(TOKEN && PROJECT_ID && SA_USER && SA_SECRET);

/**
 * Ingestion is not instant — an event is queryable a minute or two after it
 * lands, and the export API is the slowest of the read paths. Polled rather
 * than slept once, so a fast project finishes in one round trip and a slow
 * one still passes.
 */
const POLL_TIMEOUT_MS = 6 * 60_000;
const POLL_INTERVAL_MS = 20_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function sendEvents(
  events: ReturnType<typeof buildSmokeEvents>,
): Promise<void> {
  const body = events.map((item) => ({
    event: item.event,
    properties: { ...item.properties, token: TOKEN },
  }));

  const response = await fetch(TRACK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Mixpanel rejected the batch (${response.status}): ${text}\n` +
        "With strict=1 this is a real rejection — the message names what it " +
        "objected to (a missing token or a missing event name).",
    );
  }

  /*
   * A 200 is not success, and even `status: 1` is not success.
   *
   * Mixpanel answers 200 with a body listing what it refused, so reading the
   * status code alone would be the "it ran, nothing threw, the data is wrong"
   * shape this whole test exists to stop. `num_good_events` is checked
   * against what was sent because a batch can be *partly* refused: sixty-one
   * of sixty-two accepted still reads as `status: 1`, and the one that fell
   * out would otherwise surface five minutes later as an unexplained
   * "missing" with no reason attached.
   *
   * None of this says the token is valid — a nonsense token is accepted here
   * with `num_good_events: 1`. Only the read-back can tell.
   */
  let parsed: { status?: number; num_good_events?: number; error?: string } | number;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = Number(text);
  }

  if (typeof parsed === "number") {
    // The non-strict shape. Means the `strict=1` on TRACK_URL was lost.
    throw new Error(
      `Mixpanel answered the non-strict body "${text}" — strict=1 is missing ` +
        "from the request, so malformed events are being dropped silently.",
    );
  }

  if (parsed.status !== 1) {
    throw new Error(`Mixpanel accepted the request but not the events: ${text}`);
  }

  if (parsed.num_good_events !== events.length) {
    throw new Error(
      `Mixpanel took ${parsed.num_good_events} of ${events.length} events: ${text}`,
    );
  }
}

async function readBack(runId: string, nowMs: number): Promise<ExportedEvent[]> {
  const day = exportDay(nowMs);
  const params = new URLSearchParams({
    project_id: String(PROJECT_ID),
    // A day either side: the export API works in the project's timezone, and
    // a run just after midnight UTC would otherwise look for its events on a
    // day Mixpanel has filed them under yesterday.
    from_date: exportDay(nowMs - 86_400_000),
    to_date: day,
    where: exportFilter(runId),
  });

  const response = await fetch(`${EXPORT_URL}?${params}`, {
    headers: { Authorization: serviceAccountAuth(SA_USER!, SA_SECRET!) },
  });

  if (!response.ok) {
    throw new Error(
      `Export API said ${response.status}: ${await response.text()}\n` +
        "A 401 here usually means the service account has no export rights " +
        "on this project rather than that the secret is wrong.",
    );
  }

  // JSONL — one event per line, and an empty body when nothing matched.
  return (await response.text())
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ExportedEvent);
}

describe.skipIf(!configured)("analytics smoke test (live Mixpanel)", () => {
  it(
    "every declared event reaches the project with its required properties",
    async () => {
      const runId = `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const nowMs = Date.now();
      const events = buildSmokeEvents(runId, nowMs);

      console.log(
        `[smoke] run ${runId}: sending ${events.length} events to project ${PROJECT_ID}`,
      );
      await sendEvents(events);

      let arrived: ExportedEvent[] = [];
      const deadline = Date.now() + POLL_TIMEOUT_MS;

      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);
        arrived = await readBack(runId, nowMs);
        console.log(`[smoke] ${arrived.length}/${events.length} visible so far`);
        if (arrived.length >= events.length) break;
      }

      const verdict = compareArrivals(events, arrived);
      console.log(`[smoke] ${describeVerdict(verdict)}`);

      /*
       * The message is the assertion. A bare `expect(passed).toBe(true)`
       * prints "expected false to be true", which tells whoever is reading
       * the CI log nothing about which events are missing — and sends them to
       * the Mixpanel UI to find out something this test already knows.
       */
      expect(describeVerdict(verdict)).toBe(
        `All ${events.length} events arrived with their required properties.`,
      );
      expect(passed(verdict)).toBe(true);
    },
    POLL_TIMEOUT_MS + 60_000,
  );
});

describe.skipIf(configured)("analytics smoke test (not configured)", () => {
  it("says what is missing rather than passing quietly", () => {
    /*
     * A skipped suite that reports nothing is how "we have a smoke test"
     * becomes true on paper and false in practice. This names the gap in the
     * same output, so a CI run without credentials reads as unverified rather
     * than as verified.
     */
    const absent = [
      ["NEXT_PUBLIC_MIXPANEL_TOKEN", TOKEN],
      ["MIXPANEL_PROJECT_ID", PROJECT_ID],
      ["MIXPANEL_SERVICE_ACCOUNT_USER", SA_USER],
      ["MIXPANEL_SERVICE_ACCOUNT_SECRET", SA_SECRET],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    console.warn(
      `[smoke] NOT RUN — missing ${absent.join(", ")}. ` +
        `${ALL_EVENT_NAMES.length} events are declared and none of them has ` +
        "been proved to reach Mixpanel.",
    );

    expect(absent.length).toBeGreaterThan(0);
  });
});
