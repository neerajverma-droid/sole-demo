import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * After any way of recording time — the timer's Start and Save, Add manual
 * time entry, the weekly log, or the top bar's Stop — the Time Tracker's list,
 * chart and client/project breakdown must ask the API again. Each case runs the
 * real mutation hook against a mocked API, with those three queries on screen,
 * and counts the requests they make afterwards.
 */

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const timeHooks = await import("@/hooks/use-time-tracker-query");
const projectTimer = await import("@/hooks/use-project-timer");
const { EMPTY_SELECTION, emptyManualLog, emptyWeeklyRow } = await import("@/lib/time-tracker");

const CLIENT = { clientId: "11", contactId: null, name: "Acme", email: "" };
const TIMER = {
  id: "501",
  taskId: "9",
  clientId: "11",
  contactId: null,
  clientName: "Acme",
  projectId: null,
  jobId: null,
  isBillable: true,
  hourlyRate: "100",
  elapsedSeconds: 60,
  isPaused: false,
  raw: {},
};

/** The list, the chart and the breakdown, on screen, each counting its fetches. */
function onScreen(client: QueryClient) {
  const fetches = { list: 0, chart: 0, breakdown: 0 };
  const watch = (key: readonly unknown[], name: keyof typeof fetches) => {
    client.setQueryData(key, { stale: true });
    const observer = new QueryObserver(client, {
      queryKey: key,
      queryFn: async () => {
        fetches[name] += 1;
        return { fresh: true };
      },
      staleTime: Infinity,
    });
    return observer.subscribe(() => {});
  };
  const stops = [
    watch(["time-tracker", "tasks", 1, 25], "list"),
    watch(["time-tracker", "stats", "week"], "chart"),
    watch(["time-tracker", "breakdown", "week", "client"], "breakdown"),
  ];
  return { fetches, stop: () => stops.forEach((unsubscribe) => unsubscribe()) };
}

/** Runs a hook inside a provider and hands back what it returned. */
function useHookIn<T>(client: QueryClient, hook: () => T): T {
  let result: T | undefined;
  function Probe() {
    result = hook();
    return null;
  }
  renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, React.createElement(Probe)));
  return result as T;
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 501 } } });
  apiMock.put.mockResolvedValue({ data: { success: true, data: {} } });
  apiMock.get.mockResolvedValue({ data: { success: true, data: null } });
});

const cases: [string, (client: QueryClient) => Promise<unknown>][] = [
  [
    "starting the timer",
    (client) =>
      useHookIn(client, timeHooks.useStartTimerMutation).mutateAsync({ description: "x", selection: EMPTY_SELECTION }),
  ],
  [
    "stopping the timer from Save time entry",
    (client) =>
      useHookIn(client, timeHooks.useSaveAndStopTimerMutation).mutateAsync({
        timer: TIMER,
        description: "x",
        selection: { ...EMPTY_SELECTION, client: CLIENT, hourlyRate: "100" },
      }),
  ],
  [
    "Add manual time entry",
    (client) =>
      useHookIn(client, timeHooks.useCreateManualLogMutation).mutateAsync({
        ...emptyManualLog(new Date(2026, 9, 22)),
        description: "x",
        client: CLIENT,
      }),
  ],
  [
    "saving the weekly log",
    (client) =>
      useHookIn(client, timeHooks.useSaveWeeklyLogsMutation).mutateAsync({
        rows: [{ ...emptyWeeklyRow(), client: CLIENT, taskId: "7", times: ["2", "", "", "", "", "", ""] }],
        sunday: new Date(2026, 9, 18),
      }),
  ],
  ["stopping from the top bar", (client) => useHookIn(client, projectTimer.useStopTimerMutation).mutateAsync(TIMER)],
];

describe("after time is recorded", () => {
  it.each(cases)("%s re-fetches the list, the chart and the breakdown", async (_name, run) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const screen = onScreen(client);

    await run(client);
    // Let the triggered refetches land.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.fetches).toEqual({ list: 1, chart: 1, breakdown: 1 });
    screen.stop();
  });

  it("a failed save asks for nothing", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Nope" } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const screen = onScreen(client);

    await expect(
      useHookIn(client, timeHooks.useCreateManualLogMutation).mutateAsync({
        ...emptyManualLog(new Date(2026, 9, 22)),
        description: "x",
        client: CLIENT,
      }),
    ).rejects.toThrow("Nope");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.fetches).toEqual({ list: 0, chart: 0, breakdown: 0 });
    screen.stop();
  });

  it("a page that isn't on screen — the weekly log is — reloads when it comes back", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // The main screen's list cached from before, nobody watching it.
    client.setQueryData(["time-tracker", "tasks", 1, 25], { stale: true });

    await useHookIn(client, timeHooks.useSaveWeeklyLogsMutation).mutateAsync({ rows: [], sunday: new Date(2026, 9, 18) });

    expect(client.getQueryState(["time-tracker", "tasks", 1, 25])?.isInvalidated).toBe(true);
  });
});
