// @vitest-environment node
/**
 * Quick Actions — stopping or starting a timer anywhere refreshes the Time
 * tracker card.
 *
 * The app's timer actions are shared: the card's Stop, the top bar and the
 * Time Tracker screen all run them. They used to refresh Time Tracker and
 * Projects but not Quick Actions, so the card kept a stopped session listed as
 * running until the page was reloaded. Each action here is the real hook,
 * taken from a rendered component and run against a mocked server.
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted with the mock, since the modules below import the client at load.
const apiMock = vi.hoisted(() => ({
  get: vi.fn(() => new Promise(() => {})),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const projectTimer = await import("@/hooks/use-project-timer");
const timeTracker = await import("@/hooks/use-time-tracker-query");

import type { ActiveTimer } from "@/lib/project-timer";
import { EMPTY_SELECTION } from "@/lib/time-tracker";

const LIST_KEY = ["unibox", "timeTracker"];
const ACTIVE_TIMER_KEY = ["active-timer"];
const ok = { data: { success: true, data: {} } };

const timer: ActiveTimer = {
  id: "900",
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
};

/** A fresh cache holding the card's list and a running timer. */
function cache() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(LIST_KEY, [{ id: 900, entry_type: "timer", status: "running" }]);
  client.setQueryData(ACTIVE_TIMER_KEY, timer);
  return client;
}

/** The value a hook returns, from one real render inside the cache's provider. */
function take<T>(client: QueryClient, useHook: () => T): T {
  let value: T | undefined;
  function Probe() {
    value = useHook();
    return null;
  }
  renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, React.createElement(Probe)));
  return value as T;
}

const listInvalidated = (client: QueryClient) => client.getQueryState(LIST_KEY)?.isInvalidated === true;

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.put.mockResolvedValue(ok);
  apiMock.post.mockResolvedValue(ok);
  apiMock.delete.mockResolvedValue(ok);
});

describe("stopping a timer refreshes the Time tracker card", () => {
  it("Stop (a timer with a client) — the card's own Stop and the top bar", async () => {
    const client = cache();
    const stop = take(client, projectTimer.useStopTimerMutation);

    await stop.mutateAsync(timer);

    expect(client.getQueryData(ACTIVE_TIMER_KEY)).toBeNull();
    expect(listInvalidated(client)).toBe(true);
  });

  it("Save and stop (a timer with no client yet)", async () => {
    const client = cache();
    const saveAndStop = take(client, timeTracker.useSaveAndStopTimerMutation);

    await saveAndStop.mutateAsync({
      timer,
      description: "Site visit",
      selection: { ...EMPTY_SELECTION, client: { clientId: "12", contactId: null, name: "Acme", email: "" } },
    });

    expect(client.getQueryData(ACTIVE_TIMER_KEY)).toBeNull();
    expect(listInvalidated(client)).toBe(true);
  });

  it("Update details and stop (the top bar's picker)", async () => {
    const client = cache();
    const updateAndStop = take(client, projectTimer.useUpdateAndStopTimerMutation);

    await updateAndStop.mutateAsync({
      timer,
      details: {
        clientId: "12",
        contactId: null,
        projectId: null,
        jobId: null,
        taskId: null,
        isBillable: true,
        hourlyRate: "100",
      },
    });

    expect(client.getQueryData(ACTIVE_TIMER_KEY)).toBeNull();
    expect(listInvalidated(client)).toBe(true);
  });

  it("Discard", async () => {
    const client = cache();
    const discard = take(client, timeTracker.useDiscardTimerMutation);

    await discard.mutateAsync(timer);

    expect(listInvalidated(client)).toBe(true);
  });
});

describe("starting a timer refreshes the Time tracker card", () => {
  it("Start timer — the card's own button and the Time Tracker bar", async () => {
    const client = cache();
    client.setQueryData(ACTIVE_TIMER_KEY, null);
    const start = take(client, timeTracker.useStartTimerMutation);

    await start.mutateAsync({ description: "", selection: { ...EMPTY_SELECTION, isBillable: true } });

    expect(listInvalidated(client)).toBe(true);
  });

  it("Start on a project task", async () => {
    const client = cache();
    client.setQueryData(ACTIVE_TIMER_KEY, null);
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 901 } } });
    const start = take(client, projectTimer.useStartTaskTimerMutation);

    await start.mutateAsync({ projectId: "7", taskId: "40", taskName: "Install" });

    expect(listInvalidated(client)).toBe(true);
  });
});

describe("a failed stop", () => {
  it("leaves the timer running and the card as it was", async () => {
    const client = cache();
    apiMock.put.mockResolvedValueOnce({ data: { success: false, message: "Timer not found" } });
    const stop = take(client, projectTimer.useStopTimerMutation);

    await expect(stop.mutateAsync(timer)).rejects.toThrow("Timer not found");

    expect(client.getQueryData(ACTIVE_TIMER_KEY)).toEqual(timer);
    expect(listInvalidated(client)).toBe(false);
  });
});
