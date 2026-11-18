// @vitest-environment node
/**
 * Dashboard sample data for a brand-new account.
 *
 * Covers who sees the sample (`DashboardDemoProvider`'s decision), every way
 * it ends — the tour's own call (`endDashboardDemo`, exposed as
 * `window.soleEndDashboardDemo`) and the watchdog that ends it when the tour
 * is skipped, never starts, or never calls — how the end survives a failed
 * request, other tabs and other users on the same browser, and that the
 * sample itself is well-formed.
 *
 * Rendered to markup, like the other render tests here — there's no DOM
 * environment, so the decision is checked from seeded caches and stores, and
 * the watchdog through its pure step function.
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The sample is only ever shown where Usertour is set up to end it.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_USERTOUR_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_USERTOUR_DASHBOARD_TOUR_ID = "dashboard-tour";
});

const apiMock = vi.hoisted(() => ({
  get: vi.fn(() => new Promise(() => {})),
  post: vi.fn(),
  patch: vi.fn(() => Promise.resolve({ data: { success: true } })),
  put: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));
vi.mock("usertour.js", () => ({ default: { isStarted: vi.fn(() => false) } }));

/*
 * The provider only reads the stores through selectors. A server render reads
 * a zustand store's creation-time state rather than its current one, so the
 * stores are stood in for by plain selectors over a state the tests set.
 */
const storeState = vi.hoisted(() => ({
  invoices: { hydrated: false, invoices: [] as unknown[] },
  expenses: { hydrated: false, expenses: [] as unknown[] },
  session: { user: { user_id: 101 } as Record<string, unknown> | null },
}));
vi.mock("@/stores/invoices", () => ({
  useInvoicesStore: (select: (state: typeof storeState.invoices) => unknown) =>
    select(storeState.invoices),
}));
vi.mock("@/stores/expenses", () => ({
  useExpensesStore: (select: (state: typeof storeState.expenses) => unknown) =>
    select(storeState.expenses),
}));
vi.mock("@/stores/session", () => {
  const sessionUserId = (user: Record<string, unknown> | null | undefined) => {
    const raw = user?.user_id ?? user?.id;
    return raw == null || raw === "" ? null : String(raw);
  };
  return {
    sessionUserId,
    currentUserId: () => sessionUserId(storeState.session.user),
    useSessionStore: (select: (state: typeof storeState.session) => unknown) =>
      select(storeState.session),
  };
});

const {
  BETWEEN_TOURS_GRACE_MS,
  DashboardDemoProvider,
  INITIAL_WATCHDOG_STATE,
  TOUR_START_GRACE_MS,
  WATCH_INTERVAL_MS,
  useDashboardDemo,
  watchdogStep,
} = await import("@/hooks/use-dashboard-demo");
type WatchdogState = import("@/hooks/use-dashboard-demo").WatchdogState;
type WatchdogTick = import("@/hooks/use-dashboard-demo").WatchdogTick;
const demo = await import("@/lib/dashboard-demo");
const apiRoutes = (await import("@/config/api-routes")).default;

const DONE_PAYLOAD = { skippedTour: { parent_key: "dashboard", submenu_key: "demo" } };

/* ------------------------------------------------------------------ *
 * A minimal browser: window events and localStorage
 * ------------------------------------------------------------------ */

function fakeWindow() {
  const target = new EventTarget();
  const storage = new Map<string, string>();
  return Object.assign(target, {
    localStorage: {
      getItem: (key: string): string | null => storage.get(key) ?? null,
      setItem: (key: string, value: string): void => void storage.set(key, value),
      removeItem: (key: string): void => void storage.delete(key),
    },
    storage,
  });
}

/** A fresh copy of lib/dashboard-demo, so its per-tab memory starts empty. */
async function freshDemoLib() {
  vi.resetModules();
  return import("@/lib/dashboard-demo");
}

beforeEach(() => {
  vi.clearAllMocks();
  storeState.session.user = { user_id: 101 };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ *
 * Who sees the sample
 * ------------------------------------------------------------------ */

type Seed = {
  tourDone?: boolean;
  bankAccounts?: number;
  invoices?: number;
  expenses?: number;
  hydrated?: boolean;
};

function renderMode(
  { tourDone, bankAccounts = 0, invoices = 0, expenses = 0, hydrated = true }: Seed,
  Provider: typeof DashboardDemoProvider = DashboardDemoProvider,
  useMode: typeof useDashboardDemo = useDashboardDemo,
): string {
  const client = new QueryClient();
  if (tourDone !== undefined) client.setQueryData(["tour", "dashboard-demo"], tourDone);
  client.setQueryData(["dashboard", "bank-accounts"], {
    accounts: demo.demoBankAccounts().accounts.slice(0, bankAccounts),
    totalBalance: 0,
  });
  storeState.invoices = { hydrated, invoices: demo.demoInvoices().slice(0, invoices) };
  storeState.expenses = { hydrated, expenses: demo.demoExpenses().slice(0, expenses) };

  function Probe() {
    return React.createElement("span", null, useMode().mode);
  }
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(Provider, null, React.createElement(Probe)),
    ),
  );
}

describe("who sees the sample", () => {
  it("shows it to a new account whose tour hasn't ended", () => {
    expect(renderMode({ tourDone: false })).toContain("demo");
  });

  it("shows real data once the tour is marked done", () => {
    expect(renderMode({ tourDone: true })).toContain("live");
  });

  it("never shows it to an account with its own invoices", () => {
    expect(renderMode({ tourDone: false, invoices: 1 })).toContain("live");
  });

  it("never shows it to an account with its own expenses", () => {
    expect(renderMode({ tourDone: false, expenses: 1 })).toContain("live");
  });

  it("never shows it to an account with a connected bank", () => {
    expect(renderMode({ tourDone: false, bankAccounts: 1 })).toContain("live");
  });

  it("waits, rather than guessing, while the tour status is unknown", () => {
    expect(renderMode({})).toContain("loading");
  });

  it("waits while the account's own lists haven't loaded", () => {
    expect(renderMode({ tourDone: false, hydrated: false })).toContain("loading");
  });

  it("is off entirely without the dashboard tour's id, since nothing could end it", async () => {
    vi.resetModules();
    const saved = process.env.NEXT_PUBLIC_USERTOUR_DASHBOARD_TOUR_ID;
    delete process.env.NEXT_PUBLIC_USERTOUR_DASHBOARD_TOUR_ID;
    try {
      const fresh = await import("@/hooks/use-dashboard-demo");
      expect(fresh.DASHBOARD_DEMO_ENABLED).toBe(false);
      expect(
        renderMode({ tourDone: false }, fresh.DashboardDemoProvider, fresh.useDashboardDemo),
      ).toContain("live");
    } finally {
      process.env.NEXT_PUBLIC_USERTOUR_DASHBOARD_TOUR_ID = saved;
    }
  });

  it("is off entirely without Usertour", async () => {
    vi.resetModules();
    const saved = process.env.NEXT_PUBLIC_USERTOUR_TOKEN;
    delete process.env.NEXT_PUBLIC_USERTOUR_TOKEN;
    try {
      const fresh = await import("@/hooks/use-dashboard-demo");
      expect(fresh.DASHBOARD_DEMO_ENABLED).toBe(false);
    } finally {
      process.env.NEXT_PUBLIC_USERTOUR_TOKEN = saved;
    }
  });
});

/* ------------------------------------------------------------------ *
 * The watchdog — ending it when the tour doesn't
 * ------------------------------------------------------------------ */

const idle: WatchdogTick = {
  dashboardTourRunning: false,
  earlierTourRunning: false,
  tourCanStart: true,
  elapsedMs: WATCH_INTERVAL_MS,
};

/** Runs ticks until one ends the sample; returns the reason and elapsed time. */
function run(ticks: WatchdogTick[], start: WatchdogState = INITIAL_WATCHDOG_STATE) {
  let state = start;
  let elapsed = 0;
  for (const tick of ticks) {
    elapsed += tick.elapsedMs;
    const step = watchdogStep(state, tick);
    state = step.state;
    if (step.end) return { end: step.end, elapsed, state };
  }
  return { end: null, elapsed, state };
}

const times = (tick: WatchdogTick, ms: number) =>
  Array.from({ length: Math.ceil(ms / tick.elapsedMs) }, () => tick);

describe("the watchdog", () => {
  it("ends it the moment the dashboard tour closes — finished or skipped", () => {
    const result = run([
      { ...idle, dashboardTourRunning: true },
      { ...idle, dashboardTourRunning: true },
      idle,
    ]);
    expect(result.end).toBe("tour-ended");
    expect(result.elapsed).toBe(3 * WATCH_INTERVAL_MS);
  });

  it("keeps the sample up for the whole of a long tour", () => {
    expect(run(times({ ...idle, dashboardTourRunning: true }, 10 * 60_000)).end).toBeNull();
  });

  it("keeps it up through the sidebar tour and the hand-over to the dashboard one", () => {
    const result = run([
      ...times({ ...idle, earlierTourRunning: true }, 90_000),
      // The page change and the next tour loading.
      ...times(idle, BETWEEN_TOURS_GRACE_MS - WATCH_INTERVAL_MS),
      ...times({ ...idle, dashboardTourRunning: true }, 60_000),
    ]);
    expect(result.end).toBeNull();
  });

  it("ends it when the sidebar tour is skipped and the dashboard tour never follows", () => {
    const result = run([
      ...times({ ...idle, earlierTourRunning: true }, 5_000),
      ...times(idle, 5 * 60_000),
    ]);
    expect(result.end).toBe("tour-skipped");
    expect(result.elapsed).toBe(5_000 + BETWEEN_TOURS_GRACE_MS);
  });

  it("ends it when no tour ever starts — Usertour down, blocked, or not targeted", () => {
    const result = run(times(idle, 5 * 60_000));
    expect(result.end).toBe("tour-never-started");
    expect(result.elapsed).toBe(TOUR_START_GRACE_MS);
  });

  it("doesn't count time spent on the survey, or in any dialog", () => {
    const blocked = { ...idle, tourCanStart: false };
    const result = run([
      ...times(blocked, 10 * 60_000),
      ...times(idle, TOUR_START_GRACE_MS - WATCH_INTERVAL_MS),
    ]);
    expect(result.end).toBeNull();
  });

  it("gives a tour that starts late its full run", () => {
    const result = run([
      ...times(idle, TOUR_START_GRACE_MS - WATCH_INTERVAL_MS),
      ...times({ ...idle, dashboardTourRunning: true }, 60_000),
    ]);
    expect(result.end).toBeNull();
    expect(result.state.seenDashboardTour).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Ending it — what the tour calls, and what survives it
 * ------------------------------------------------------------------ */

describe("ending the sample", () => {
  it("tells the dashboard, records it on the server, and does both only once", async () => {
    const lib = await freshDemoLib();
    const win = fakeWindow();
    const heard = vi.fn();
    win.addEventListener(lib.DASHBOARD_DEMO_ENDED_EVENT, heard);
    vi.stubGlobal("window", win);

    await lib.endDashboardDemo();
    await lib.endDashboardDemo();

    expect(heard).toHaveBeenCalledTimes(1);
    expect(apiMock.patch).toHaveBeenCalledTimes(1);
    expect(apiMock.patch).toHaveBeenCalledWith(apiRoutes.tour.list, DONE_PAYLOAD);
    expect(lib.dashboardDemoEndedLocally("101")).toBe(true);
    expect(win.storage.get(lib.dashboardDemoLocalKey("101"))).toBe("synced");
  });

  it("keeps it ended, and retries, when the server can't be told", async () => {
    const lib = await freshDemoLib();
    const win = fakeWindow();
    vi.stubGlobal("window", win);
    apiMock.patch.mockRejectedValueOnce(new Error("offline") as never);

    await expect(lib.endDashboardDemo()).resolves.toBeUndefined();
    expect(win.storage.get(lib.dashboardDemoLocalKey("101"))).toBe("pending");

    // Next visit: a fresh tab, same browser. Still ended, and re-sent.
    const nextVisit = await freshDemoLib();
    expect(nextVisit.dashboardDemoEndedLocally("101")).toBe(true);
    await nextVisit.retryPendingDashboardDemoEnd("101");
    expect(apiMock.patch).toHaveBeenCalledTimes(2);
    expect(win.storage.get(lib.dashboardDemoLocalKey("101"))).toBe("synced");

    // Nothing left to retry after that.
    await nextVisit.retryPendingDashboardDemoEnd("101");
    expect(apiMock.patch).toHaveBeenCalledTimes(2);
  });

  it("is per user: someone else signing in on the same browser still gets the sample", async () => {
    const lib = await freshDemoLib();
    vi.stubGlobal("window", fakeWindow());
    await lib.endDashboardDemo();

    expect(lib.dashboardDemoEndedLocally("101")).toBe(true);
    expect(lib.dashboardDemoEndedLocally("202")).toBe(false);
  });

  it("still ends it for this tab with storage blocked (private mode)", async () => {
    const lib = await freshDemoLib();
    const win = fakeWindow();
    win.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    win.localStorage.getItem = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("window", win);

    await expect(lib.endDashboardDemo()).resolves.toBeUndefined();
    expect(lib.dashboardDemoEndedLocally("101")).toBe(true);
    expect(apiMock.patch).toHaveBeenCalledTimes(1);
  });

  it("names the key other tabs listen for by user", () => {
    expect(demo.dashboardDemoLocalKey("101")).toBe("sole.dashboard-demo.ended.101");
  });
});

/* ------------------------------------------------------------------ *
 * The tour flag on the server
 * ------------------------------------------------------------------ */

describe("the tour flag", () => {
  it("reads dashboard.demo from /tour", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, data: { tour_data: { dashboard: { demo: true } } } },
    } as never);
    await expect(demo.fetchDashboardDemoDone()).resolves.toBe(true);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.tour.list);
  });

  it("is false for a user with no tour row yet", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: true, data: {} } } as never);
    await expect(demo.fetchDashboardDemoDone()).resolves.toBe(false);
  });

  it("is false when only other tours are recorded", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, data: { tour_data: { invoice: { list: true } } } },
    } as never);
    await expect(demo.fetchDashboardDemoDone()).resolves.toBe(false);
  });

  it("is recorded with the payload the backend whitelists", async () => {
    await demo.markDashboardDemoDone();
    expect(apiMock.patch).toHaveBeenCalledWith(apiRoutes.tour.list, DONE_PAYLOAD);
  });
});

/* ------------------------------------------------------------------ *
 * The sample itself
 * ------------------------------------------------------------------ */

describe("the sample itself", () => {
  it("covers every invoice state the dashboard reports on", () => {
    const statuses = new Set(demo.demoInvoices().map((invoice) => invoice.status));
    expect(statuses).toEqual(
      new Set(["Paid", "Outstanding", "Overdue", "Partially paid", "Draft"]),
    );
  });

  it("carries amounts paid that agree with what's outstanding", () => {
    const partial = demo.demoInvoices().find((invoice) => invoice.status === "Partially paid");
    expect(partial?.paidAmount).toBe(3000);
  });

  it("totals the bank balance from its accounts", () => {
    const { accounts, totalBalance } = demo.demoBankAccounts();
    expect(totalBalance).toBe(accounts.reduce((sum, account) => sum + account.balance, 0));
  });

  it("dates every invoice on or before today", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const invoice of demo.demoInvoices()) {
      expect(invoice.issued <= today).toBe(true);
    }
  });
});
