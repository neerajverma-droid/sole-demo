/**
 * The staging smoke test, as data and pure functions.
 *
 * WHY THIS EXISTS. Everything else in this integration checks the *code*: the
 * typed union checks that a name is spelled right, the coverage test checks
 * that something calls it, the dev validator checks that a required property
 * is present. Every defect in the old integration would have passed all three.
 * They were not code defects. The code ran, nothing threw, and the data was
 * wrong — `identify()` keyed on email, UTM read before hydration,
 * `switching_from` behind a guard that never evaluated true across 18,918
 * events.
 *
 * The only check that catches that class is sending a real event to a real
 * project and reading it back. That is what this file is for: fire every
 * declared event once, wait, ask Mixpanel what it received, and compare.
 *
 * The parts that can be wrong without a network are here as pure functions so
 * they can be tested without one. The part that needs credentials lives in
 * `analytics-smoke.live.test.ts`.
 */

import {
  ALL_EVENT_NAMES,
  REQUIRED_PROPS,
  type EventName,
} from "@/lib/analytics-events";

/* ──────────────────────────── keeping it separable ────────────────────── */

/**
 * Every smoke event carries these, and nothing a real person does ever will.
 *
 * Two jobs. A report excludes `env = "smoke"` the same way it excludes
 * `env = "local"`, so a test run cannot be mistaken for a customer. And
 * `smoke_run_id` is what the read-back filters on, so one run never sees
 * another's events — which matters the moment two branches run CI at once.
 */
export const SMOKE_ENV = "smoke";

export type SmokeEvent = {
  event: EventName;
  properties: Record<string, string | number | boolean>;
};

/**
 * Which required properties are numbers.
 *
 * `REQUIRED_PROPS` names them but says nothing about type, and sending
 * `amount: "1"` would prove the event arrives while leaving the thing most
 * worth proving untested: Mixpanel has to receive a number it can sum. A
 * string there produces a chart that silently reads zero.
 */
const NUMERIC_PROPS = new Set([
  "amount",
  "value",
  "count",
  "days_to_payment",
  "estimated_tax",
  "record_count",
]);

function sampleValue(prop: string): string | number {
  // Deliberately not round: a 1 would survive a bug that coerces to boolean,
  // and a 0 would survive one that drops falsy values.
  return NUMERIC_PROPS.has(prop) ? 42.5 : `smoke_${prop}`;
}

/**
 * One payload per declared event, each satisfying its own contract.
 *
 * Driven off `ALL_EVENT_NAMES` rather than a hand-written list, so an event
 * added tomorrow is covered by this tomorrow. A hand-written list is a second
 * place to forget something, and forgetting is the failure mode the whole
 * integration is built against.
 */
export function buildSmokeEvents(runId: string, nowMs: number): SmokeEvent[] {
  return ALL_EVENT_NAMES.map((event) => {
    const properties: Record<string, string | number | boolean> = {
      smoke_test: true,
      smoke_run_id: runId,
      env: SMOKE_ENV,
      app: "new_ui",
      is_internal: true,
      time: Math.floor(nowMs / 1000),
      // Mixpanel dedupes on this for 5 days. Without it a CI retry would
      // double every count and the comparison below would still pass.
      $insert_id: `${runId}-${event}`,
      distinct_id: `smoke-${runId}`,
    };

    for (const prop of REQUIRED_PROPS[event] ?? []) {
      properties[prop] = sampleValue(prop);
    }

    return { event, properties };
  });
}

/* ──────────────────────────────── the verdict ─────────────────────────── */

/** One event as the export API hands it back. */
export type ExportedEvent = {
  event: string;
  properties?: Record<string, unknown>;
};

export type SmokeVerdict = {
  /** Declared, sent, and never seen again. */
  missing: string[];
  /** Arrived, but without a property the contract says it cannot do without. */
  incomplete: { event: string; missing: string[] }[];
  /** Arrived carrying a required number as something other than a number. */
  wrongType: { event: string; prop: string; got: string }[];
  /** Tagged with this run but not in the contract at all. */
  unexpected: string[];
  arrived: number;
  expected: number;
};

export function passed(verdict: SmokeVerdict): boolean {
  return (
    verdict.missing.length === 0 &&
    verdict.incomplete.length === 0 &&
    verdict.wrongType.length === 0 &&
    verdict.unexpected.length === 0
  );
}

/**
 * What Mixpanel actually received, against what was sent.
 *
 * Four separate findings rather than one boolean, because they mean four
 * different things and have four different fixes: an event that never arrived
 * is an ingestion or naming problem; one that arrived stripped of a property
 * is a payload problem; one whose number came back as a string will silently
 * sum to zero on a chart; and an event nobody declared means the contract and
 * the code have drifted apart.
 */
export function compareArrivals(
  sent: SmokeEvent[],
  arrived: ExportedEvent[],
): SmokeVerdict {
  const declared = new Set<string>(ALL_EVENT_NAMES);
  const byName = new Map<string, ExportedEvent>();
  for (const row of arrived) byName.set(row.event, row);

  const missing: string[] = [];
  const incomplete: SmokeVerdict["incomplete"] = [];
  const wrongType: SmokeVerdict["wrongType"] = [];

  for (const item of sent) {
    const row = byName.get(item.event);
    if (!row) {
      missing.push(item.event);
      continue;
    }

    const props = row.properties ?? {};
    const required = REQUIRED_PROPS[item.event] ?? [];

    const absent = required.filter(
      (prop) => props[prop] === undefined || props[prop] === null,
    );
    if (absent.length > 0) {
      incomplete.push({ event: item.event, missing: absent });
    }

    for (const prop of required) {
      if (!NUMERIC_PROPS.has(prop)) continue;
      const value = props[prop];
      if (value === undefined || value === null) continue;
      if (typeof value !== "number") {
        wrongType.push({ event: item.event, prop, got: typeof value });
      }
    }
  }

  const unexpected = [...byName.keys()].filter((name) => !declared.has(name));

  return {
    missing,
    incomplete,
    wrongType,
    unexpected,
    arrived: byName.size,
    expected: sent.length,
  };
}

/**
 * The verdict as something a person reading a CI log can act on.
 *
 * Written out in full rather than as a count: "3 events missing" sends
 * somebody to the Mixpanel UI to work out which three, and the names are
 * already here.
 */
export function describeVerdict(verdict: SmokeVerdict): string {
  if (passed(verdict)) {
    return `All ${verdict.expected} events arrived with their required properties.`;
  }

  const lines: string[] = [
    `${verdict.arrived} of ${verdict.expected} declared events arrived.`,
  ];

  if (verdict.missing.length > 0) {
    lines.push(`Never arrived: ${verdict.missing.join(", ")}`);
  }
  for (const entry of verdict.incomplete) {
    lines.push(
      `${entry.event} arrived without: ${entry.missing.join(", ")}`,
    );
  }
  for (const entry of verdict.wrongType) {
    lines.push(
      `${entry.event}.${entry.prop} came back as ${entry.got}, not a number — a chart summing it will read zero.`,
    );
  }
  if (verdict.unexpected.length > 0) {
    lines.push(
      `Tagged with this run but not in the contract: ${verdict.unexpected.join(", ")}`,
    );
  }

  return lines.join("\n");
}

/* ─────────────────────────────── the endpoints ─────────────────────────── */

/**
 * `strict=1` catches a malformed event. It does NOT catch a wrong token.
 *
 * Measured against the live endpoint rather than assumed, because the
 * difference decides whether this whole test means anything:
 *
 *   no `token` property      → HTTP 400, `status: 0`, "token, missing or empty"
 *   no `event` name          → HTTP 400, `status: 0`, "event, missing"
 *   a token that is nonsense → **HTTP 200, `status: 1`, `num_good_events: 1`**
 *   no `distinct_id`         → HTTP 200, `status: 1`
 *
 * Without `strict=1` even the first two answer `200` and the bare body `1`.
 *
 * So the third line is the one that matters: Mixpanel accepts events against
 * a token that belongs to no project and reports them as good. **A successful
 * send proves nothing.** Only reading the events back out of the project
 * proves they went anywhere — which is why the read-back below is the test
 * and the send is only the setup, and why nobody should later "simplify" this
 * by trusting the 200.
 */
export const TRACK_URL = "https://api.mixpanel.com/track?strict=1";
export const EXPORT_URL = "https://data.mixpanel.com/api/2.0/export";

/** Basic auth for a Mixpanel service account, as sole-ocr builds it. */
export function serviceAccountAuth(user: string, secret: string): string {
  return `Basic ${Buffer.from(`${user}:${secret}`).toString("base64")}`;
}

/** Only this run's events, so two CI jobs at once cannot read each other's. */
export function exportFilter(runId: string): string {
  return `properties["smoke_run_id"] == "${runId}"`;
}

/** Mixpanel's export API takes dates, not timestamps, in the project's timezone. */
export function exportDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}
