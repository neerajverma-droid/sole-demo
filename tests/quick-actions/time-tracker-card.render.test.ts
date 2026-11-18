// @vitest-environment node
/**
 * Quick Actions — the Time tracker card, rendered.
 *
 * Renders the real `TimeTrackerCard` with the query cache set to each moment
 * of a start → stop: what the card's own list says, and what the app's active
 * timer says. The bug this guards: after stopping a timer the row kept its
 * Stop button until the page was reloaded, because the card trusted its own
 * (not yet refetched) list over the active timer.
 *
 * Rendered to markup, the way `components/reports/bas-ai-review.test.ts`
 * renders its card — this repo has no DOM test environment, so the clicks
 * themselves aren't simulated; the states they lead to are.
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/axiosInstance", () => ({
  default: { get: vi.fn(() => new Promise(() => {})), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const { TimeTrackerCard } = await import("@/components/actions/unibox/time-tracker-card");

import type { ActiveTimer } from "@/lib/project-timer";
import type { UniboxTimeEntry } from "@/lib/unibox";

const ACTIVE_TIMER_KEY = ["active-timer"];
const LIST_KEY = ["unibox", "timeTracker"];

const running = (over: Partial<UniboxTimeEntry> = {}): UniboxTimeEntry => ({
  id: 900,
  task_name: "Site visit",
  entry_type: "timer",
  status: "running",
  start_time: "2026-10-29T09:00:00",
  end_time: null,
  duration_minutes: 12,
  amount: 0,
  is_billable: true,
  is_invoiced: false,
  created_at: "2026-10-29T09:00:00",
  ...over,
});

const stopped = (over: Partial<UniboxTimeEntry> = {}): UniboxTimeEntry =>
  running({ status: "completed", end_time: "2026-10-29T09:30:00", duration_minutes: 30, amount: 50, ...over });

const timer = (id: string): ActiveTimer => ({
  id,
  taskId: "40",
  clientId: "12",
  contactId: null,
  clientName: "Acme",
  projectId: null,
  jobId: null,
  isBillable: true,
  hourlyRate: "100",
  elapsedSeconds: 720,
  isPaused: false,
  raw: {},
});

/**
 * The card's HTML with its list and the active timer as given. `activeTimer`
 * left out means the active-timer query hasn't answered yet.
 */
function render(list: UniboxTimeEntry[], activeTimer?: ActiveTimer | null): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(LIST_KEY, list);
  if (activeTimer !== undefined) client.setQueryData(ACTIVE_TIMER_KEY, activeTimer);
  return renderToStaticMarkup(
    React.createElement(QueryClientProvider, { client }, React.createElement(TimeTrackerCard)),
  );
}

/** The button whose text is `label`, with its attributes. */
function button(html: string, label: string): string | null {
  const match = html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*?${label}(?:(?!</button>).)*?</button>`));
  return match ? match[0] : null;
}

const isDisabled = (markup: string | null) => Boolean(markup && /\sdisabled=""/.test(markup));

describe("Time tracker card — start → stop", () => {
  it("while the timer runs: the row says Running now with a Stop button, and Start timer is locked", () => {
    const html = render([running()], timer("900"));

    expect(html).toContain("Running now");
    expect(button(html, "Stop")).not.toBeNull();
    expect(button(html, "Timer running")).not.toBeNull();
    expect(isDisabled(button(html, "Timer running"))).toBe(true);
  });

  it("right after Stop, before the list refetches: no Stop button, and Start timer is free again", () => {
    // The list still says running — exactly what the card held when the bug hit.
    const html = render([running()], null);

    expect(button(html, "Stop")).toBeNull();
    expect(html).not.toContain("Running now");
    expect(button(html, "Invoice")).not.toBeNull();
    expect(button(html, "Start timer")).not.toBeNull();
    expect(isDisabled(button(html, "Start timer"))).toBe(false);
  });

  it("once the list has refetched: the stopped session shows its time and Invoice", () => {
    const html = render([stopped()], null);

    expect(button(html, "Stop")).toBeNull();
    expect(html).toContain("30 min · not yet invoiced");
    expect(isDisabled(button(html, "Invoice"))).toBe(false);
  });

  it("puts Stop only on the session that is actually running", () => {
    const html = render([running({ id: 900 }), stopped({ id: 899, task_name: "Earlier job" })], timer("900"));

    expect(html.match(/>Stop</g)).toHaveLength(1);
    expect(html).toContain("Earlier job");
  });

  it("shows a timer started elsewhere as running before the list catches up", () => {
    const html = render([stopped({ id: 901 })], timer("901"));

    expect(button(html, "Stop")).not.toBeNull();
    expect(html).toContain("Running now");
  });

  it("goes by the list's own status until the active timer has loaded", () => {
    const html = render([running()]);

    expect(button(html, "Stop")).not.toBeNull();
    expect(isDisabled(button(html, "Timer running"))).toBe(true);
  });

  it("offers a spent, disabled Invoiced on a session already invoiced", () => {
    const html = render([stopped({ is_invoiced: true })], null);

    expect(isDisabled(button(html, "Invoiced"))).toBe(true);
  });

  it("says No time entries with nothing to list", () => {
    const html = render([], null);

    expect(html).toContain("No time entries");
    expect(isDisabled(button(html, "Start timer"))).toBe(false);
  });

  it("lets a long title truncate instead of pushing the buttons off the row", () => {
    const html = render([stopped({ task_name: "A very long task name that would never fit beside the amount and button" })], null);

    // Each row's column may shrink below its content, and the title truncates.
    expect(html).toContain("grid-cols-[minmax(0,1fr)]");
    expect(html).toMatch(/<p class="truncate[^"]*"[^>]*>A very long task name/);
  });
});
