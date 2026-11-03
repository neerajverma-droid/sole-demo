import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An in-memory localStorage that actually returns what was stored — the
 * rehydrate-before-write guard's whole point is reading back a count another
 * route persisted, so Template B's no-op stub isn't enough here.
 */
const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
  setItem: (key: string, value: string) => void memory.set(key, String(value)),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
});

const KEY = "sole-migrations";

function seedStorage(imported: Record<string, number>) {
  memory.set(KEY, JSON.stringify({ state: { imported }, version: 0 }));
}

function stored(): Record<string, number> | undefined {
  const raw = memory.get(KEY);
  return raw ? JSON.parse(raw).state.imported : undefined;
}

/**
 * A fresh module per test: the store is a singleton, and once persist has
 * hydrated it stays hydrated for the module's lifetime — which would hide the
 * guard from every test after the first.
 */
async function freshStore() {
  vi.resetModules();
  const { useMigrationsStore } = await import("@/stores/migrations");
  return useMigrationsStore;
}

beforeEach(() => {
  memory.clear();
});

describe("recordImport", () => {
  it("is cumulative — a second import into the same step adds to it", async () => {
    const store = await freshStore();

    store.getState().recordImport("contacts", 12);
    store.getState().recordImport("contacts", 8);

    expect(store.getState().imported).toEqual({ contacts: 20 });
    expect(stored()).toEqual({ contacts: 20 });
  });

  it.each([0, -3, Number.NaN, Number.POSITIVE_INFINITY])(
    "ignores a count of %s rather than ticking the step green",
    async (count) => {
      const store = await freshStore();

      store.getState().recordImport("invoices", count);

      expect(store.getState().imported).toEqual({});
      expect(store.getState().imported).not.toHaveProperty("invoices");
    },
  );

  it("starts unhydrated — nothing is read from storage until something asks", async () => {
    seedStorage({ transactions: 340 });
    const store = await freshStore();

    expect(store.persist.hasHydrated()).toBe(false);
    expect(store.getState().imported).toEqual({});
  });

  it("rehydrates first, so a write from another route doesn't overwrite stored counts", async () => {
    seedStorage({ transactions: 340 });
    const store = await freshStore();

    store.getState().recordImport("contacts", 12);

    expect(store.getState().imported).toEqual({ transactions: 340, contacts: 12 });
    expect(stored()).toEqual({ transactions: 340, contacts: 12 });
  });

  it("adds onto a stored total for the same step", async () => {
    seedStorage({ transactions: 340 });
    const store = await freshStore();

    store.getState().recordImport("transactions", 10);

    expect(stored()).toEqual({ transactions: 350 });
  });

  it("doesn't touch storage for an ignored count", async () => {
    seedStorage({ transactions: 340 });
    const store = await freshStore();

    store.getState().recordImport("contacts", 0);

    expect(store.persist.hasHydrated()).toBe(false);
    expect(stored()).toEqual({ transactions: 340 });
  });
});

describe("clearImport", () => {
  it("deletes the step's key rather than storing 0", async () => {
    const store = await freshStore();
    store.getState().recordImport("assets", 4);
    store.getState().recordImport("expenses", 2);

    store.getState().clearImport("assets");

    expect(store.getState().imported).toEqual({ expenses: 2 });
    expect(store.getState().imported).not.toHaveProperty("assets");
    expect(stored()).toEqual({ expenses: 2 });
  });

  it("rehydrates first, so clearing one step keeps the others that were stored", async () => {
    seedStorage({ transactions: 340, contacts: 12 });
    const store = await freshStore();

    store.getState().clearImport("contacts");

    expect(store.getState().imported).toEqual({ transactions: 340 });
    expect(stored()).toEqual({ transactions: 340 });
  });
});
