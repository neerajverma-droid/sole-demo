import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Time Tracker → invoice page: the selected sessions travel as a key in the
 * URL with the invoice itself in sessionStorage, so the full-page editor (and
 * a reload of it) can pick it up.
 */

const {
  clearTimeInvoiceHandoff,
  readTimeInvoiceHandoff,
  saveTimeInvoiceHandoff,
  timeInvoiceHref,
} = await import("@/lib/time-invoice-handoff");
const { buildTimeInvoice, mapTimeTask } = await import("@/lib/time-tracker");

function invoice() {
  const task = mapTimeTask({
    task_id: 7,
    task_name: "Design",
    rate: 120,
    is_billable: true,
    client_id: 11,
    client_name: "Acme",
    project_id: 3,
    project_name: "Website",
    time_entries: [{ id: 101, duration_minutes: 60, amount: "120", status: "stopped", log_date: "2026-10-20" }],
  });
  const result = buildTimeInvoice([task], new Set(["101"]));
  if ("error" in result) throw new Error(result.error);
  return result;
}

/** A sessionStorage stand-in on a fake window, as the browser has. */
function withStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("handing a Time Tracker invoice to the invoice page", () => {
  it("round-trips the invoice under a short key", () => {
    withStorage();
    const original = invoice();
    const key = saveTimeInvoiceHandoff(original);
    expect(key).toMatch(/^[a-z0-9]+$/);
    expect(readTimeInvoiceHandoff(key)).toEqual(original);
  });

  it("survives a reload: storage alone is enough to read it back", async () => {
    const store = withStorage();
    const original = invoice();
    const key = saveTimeInvoiceHandoff(original);

    // A reload starts with fresh module state — only sessionStorage remains.
    vi.resetModules();
    const fresh = await import("@/lib/time-invoice-handoff");
    expect(store.has(`time-invoice:${key}`)).toBe(true);
    expect(fresh.readTimeInvoiceHandoff(key)).toEqual(JSON.parse(JSON.stringify(original)));
  });

  it("still works for the navigation itself when storage is blocked", () => {
    vi.stubGlobal("window", {
      get sessionStorage(): Storage {
        throw new Error("SecurityError");
      },
    });
    const original = invoice();
    const key = saveTimeInvoiceHandoff(original);
    expect(readTimeInvoiceHandoff(key)).toEqual(original);
  });

  it("is gone once cleared, so going back can't raise the invoice twice", () => {
    const store = withStorage();
    const key = saveTimeInvoiceHandoff(invoice());
    clearTimeInvoiceHandoff(key);
    expect(readTimeInvoiceHandoff(key)).toBeNull();
    expect(store.size).toBe(0);
  });

  it("finds nothing for a missing, unknown or corrupted key", () => {
    const store = withStorage();
    expect(readTimeInvoiceHandoff(undefined)).toBeNull();
    expect(readTimeInvoiceHandoff("nope")).toBeNull();
    store.set("time-invoice:bad", "{not json");
    expect(readTimeInvoiceHandoff("bad")).toBeNull();
    store.set("time-invoice:wrong", JSON.stringify({ hello: 1 }));
    expect(readTimeInvoiceHandoff("wrong")).toBeNull();
  });

  it("opens a new general invoice, or the chosen draft", () => {
    expect(timeInvoiceHref("abc123")).toBe("/invoices/new/general?time=abc123");
    expect(timeInvoiceHref("abc123", "55")).toBe("/invoices/55?time=abc123");
  });
});
