import { describe, expect, it } from "vitest";

import { ALL_EVENT_NAMES, EVENTS, REQUIRED_PROPS } from "@/lib/analytics-events";
import {
  buildSmokeEvents,
  compareArrivals,
  describeVerdict,
  exportDay,
  exportFilter,
  passed,
  serviceAccountAuth,
  SMOKE_ENV,
  TRACK_URL,
  type ExportedEvent,
} from "@/lib/analytics-smoke";

/**
 * The smoke test's own logic, checked without a network.
 *
 * A verification harness that is itself wrong is worse than none: it reports
 * green and everybody stops looking. So the part that decides pass or fail is
 * pinned here, and the live run in `analytics-smoke.live.test.ts` only has to
 * supply the two halves of the comparison.
 */

const NOW = Date.UTC(2026, 9, 8, 3, 30, 0);

const arrivedFrom = (
  sent: ReturnType<typeof buildSmokeEvents>,
): ExportedEvent[] =>
  sent.map((item) => ({ event: item.event, properties: { ...item.properties } }));

describe("buildSmokeEvents", () => {
  it("covers every declared event, with no hand-written list to fall behind", () => {
    const events = buildSmokeEvents("run1", NOW);

    expect(events).toHaveLength(ALL_EVENT_NAMES.length);
    expect(events.map((e) => e.event).sort()).toEqual(
      [...ALL_EVENT_NAMES].sort(),
    );
  });

  it("satisfies each event's own required properties", () => {
    for (const item of buildSmokeEvents("run1", NOW)) {
      for (const prop of REQUIRED_PROPS[item.event] ?? []) {
        expect(item.properties[prop]).toBeDefined();
      }
    }
  });

  it("sends required amounts as numbers, not strings", () => {
    const sent = buildSmokeEvents("run1", NOW);
    const paid = sent.find((e) => e.event === EVENTS.INVOICE_PAID);

    /*
     * The case worth proving. A string amount is accepted by Mixpanel, shows
     * up in the event feed looking perfectly normal, and sums to zero on
     * every chart built over it.
     */
    expect(typeof paid?.properties.amount).toBe("number");
    expect(typeof paid?.properties.days_to_payment).toBe("number");

    const report = sent.find((e) => e.event === EVENTS.REPORT_EXPORTED);
    expect(typeof report?.properties.report).toBe("string");
  });

  it("tags everything so a run can never read as customer activity", () => {
    for (const item of buildSmokeEvents("run1", NOW)) {
      expect(item.properties.env).toBe(SMOKE_ENV);
      expect(item.properties.smoke_test).toBe(true);
      expect(item.properties.smoke_run_id).toBe("run1");
      expect(item.properties.is_internal).toBe(true);
      expect(item.properties.distinct_id).toBe("smoke-run1");
    }
  });

  it("gives each event a stable insert id, so a CI retry cannot double-count", () => {
    const first = buildSmokeEvents("run1", NOW);
    const again = buildSmokeEvents("run1", NOW + 90_000);

    expect(first[0].properties.$insert_id).toBe(again[0].properties.$insert_id);
    // Different within a run, though — one id for all of them would have
    // Mixpanel keep the first event and discard the other sixty-one.
    const ids = new Set(first.map((e) => e.properties.$insert_id));
    expect(ids.size).toBe(first.length);
  });

  it("keeps two concurrent runs apart", () => {
    const a = buildSmokeEvents("runA", NOW);
    const b = buildSmokeEvents("runB", NOW);
    expect(a[0].properties.$insert_id).not.toBe(b[0].properties.$insert_id);
    expect(exportFilter("runA")).not.toBe(exportFilter("runB"));
  });
});

describe("compareArrivals", () => {
  it("passes when everything came back intact", () => {
    const sent = buildSmokeEvents("run1", NOW);
    const verdict = compareArrivals(sent, arrivedFrom(sent));

    expect(passed(verdict)).toBe(true);
    expect(verdict.arrived).toBe(verdict.expected);
    expect(describeVerdict(verdict)).toContain("arrived with their required");
  });

  it("names the events that never arrived", () => {
    const sent = buildSmokeEvents("run1", NOW);
    const arrived = arrivedFrom(sent).filter(
      (row) =>
        row.event !== EVENTS.PAYWALL_HIT && row.event !== EVENTS.INVOICE_SENT,
    );

    const verdict = compareArrivals(sent, arrived);

    expect(passed(verdict)).toBe(false);
    expect(verdict.missing.sort()).toEqual(
      [EVENTS.INVOICE_SENT, EVENTS.PAYWALL_HIT].sort(),
    );
    // Named, not counted — "2 events missing" sends somebody to the Mixpanel
    // UI to find out something this already knows.
    expect(describeVerdict(verdict)).toContain(EVENTS.PAYWALL_HIT);
  });

  it("catches an event that arrived stripped of a required property", () => {
    const sent = buildSmokeEvents("run1", NOW);
    const arrived = arrivedFrom(sent).map((row) =>
      row.event === EVENTS.INVOICE_PAID
        ? { ...row, properties: { ...row.properties, days_to_payment: undefined } }
        : row,
    );

    const verdict = compareArrivals(sent, arrived);

    expect(passed(verdict)).toBe(false);
    expect(verdict.incomplete).toEqual([
      { event: EVENTS.INVOICE_PAID, missing: ["days_to_payment"] },
    ]);
  });

  it("catches a number that came back as a string", () => {
    const sent = buildSmokeEvents("run1", NOW);
    const arrived = arrivedFrom(sent).map((row) =>
      row.event === EVENTS.EXPENSE_LOGGED
        ? { ...row, properties: { ...row.properties, amount: "42.5" } }
        : row,
    );

    const verdict = compareArrivals(sent, arrived);

    /*
     * The quietest failure of the lot. The event is there, the property is
     * there, the Mixpanel event feed looks right — and every chart summing
     * `amount` reads zero. Nothing short of checking the type finds it.
     */
    expect(passed(verdict)).toBe(false);
    expect(verdict.wrongType).toEqual([
      { event: EVENTS.EXPENSE_LOGGED, prop: "amount", got: "string" },
    ]);
    expect(describeVerdict(verdict)).toContain("will read zero");
  });

  it("flags an event the contract does not declare", () => {
    const sent = buildSmokeEvents("run1", NOW);
    const arrived = [
      ...arrivedFrom(sent),
      { event: "mystery_event", properties: { smoke_run_id: "run1" } },
    ];

    const verdict = compareArrivals(sent, arrived);

    // The contract and the code have drifted — something is firing a name
    // nobody declared, which no report will ever be built on.
    expect(passed(verdict)).toBe(false);
    expect(verdict.unexpected).toEqual(["mystery_event"]);
  });

  it("reports an empty project as everything missing, not as a pass", () => {
    const sent = buildSmokeEvents("run1", NOW);
    const verdict = compareArrivals(sent, []);

    // A wrong token, a rejected batch, or an export that returned nothing all
    // land here. None of them may read as success.
    expect(passed(verdict)).toBe(false);
    expect(verdict.missing).toHaveLength(sent.length);
    expect(verdict.arrived).toBe(0);
  });
});

describe("the endpoints", () => {
  it("sends with strict=1", () => {
    /*
     * Without it Mixpanel answers 200 and `1` for a malformed event and drops
     * it silently — the test would then prove the opposite of what it claims.
     */
    expect(TRACK_URL).toContain("strict=1");
  });

  it("builds service-account auth the way sole-ocr does", () => {
    expect(serviceAccountAuth("user", "secret")).toBe(
      `Basic ${Buffer.from("user:secret").toString("base64")}`,
    );
  });

  it("filters the export to one run", () => {
    expect(exportFilter("abc123")).toBe(
      'properties["smoke_run_id"] == "abc123"',
    );
  });

  it("asks for the right day", () => {
    expect(exportDay(NOW)).toBe("2026-10-08");
  });
});
