import { beforeEach, describe, expect, it, vi } from "vitest";

// `persist` writes through to storage on every `set()`, and `rehydrate()`
// reads from it — stubbed so the store runs under the plain "node" test
// environment, which has no real `localStorage`. Tests that rehydrate put a
// stored copy in `stored` first.
const stored = new Map<string, string>();
const storage = {
  getItem: vi.fn((key: string) => stored.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    stored.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    stored.delete(key);
  }),
};
vi.stubGlobal("localStorage", storage);

// Imported after the stub so the store's storage resolves to it.
const { useSalesSettingsStore } = await import("@/stores/sales-settings");
const { DEFAULT_SALES_SETTINGS, SALES_SETTINGS_VERSION } = await import(
  "@/lib/sales-settings"
);

const STORAGE_KEY = "sole-sales-settings";

beforeEach(() => {
  stored.clear();
  vi.clearAllMocks();
  useSalesSettingsStore.setState({ settings: DEFAULT_SALES_SETTINGS });
});

describe("patch", () => {
  it("merges a tab's values and leaves a sibling tab's untouched", () => {
    useSalesSettingsStore.getState().patch({ brandColor: "#111111" });
    useSalesSettingsStore.getState().patch({ quotePrefix: "Q" });

    const { settings } = useSalesSettingsStore.getState();
    expect(settings.brandColor).toBe("#111111");
    expect(settings.quotePrefix).toBe("Q");
    expect(settings.invoicePrefix).toBe(DEFAULT_SALES_SETTINGS.invoicePrefix);
  });

  it("replaces a nested record whole rather than merging into it", () => {
    useSalesSettingsStore.getState().patch({
      footerLinks: { website: { enabled: false, value: "" } } as never,
    });
    expect(useSalesSettingsStore.getState().settings.footerLinks).toEqual({
      website: { enabled: false, value: "" },
    });
  });

  it("writes through to storage under its own key and version", () => {
    useSalesSettingsStore.getState().patch({ brandColor: "#222222" });

    const raw = stored.get(STORAGE_KEY);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw as string);
    expect(parsed.version).toBe(SALES_SETTINGS_VERSION);
    expect(parsed.state.settings.brandColor).toBe("#222222");
  });
});

describe("resetAll", () => {
  it("puts every value back to the factory defaults", () => {
    useSalesSettingsStore.getState().patch({ brandColor: "#111111", quotePrefix: "Q" });
    useSalesSettingsStore.getState().resetAll();
    expect(useSalesSettingsStore.getState().settings).toEqual(DEFAULT_SALES_SETTINGS);
  });
});

describe("rehydrating a stored copy", () => {
  it("skips hydration on creation, so nothing was read on import", () => {
    expect(useSalesSettingsStore.persist.getOptions().skipHydration).toBe(true);
    expect(useSalesSettingsStore.persist.getOptions().name).toBe(STORAGE_KEY);
  });

  it("migrates an older version by unwrapping `settings` and filling the gaps", async () => {
    stored.set(
      STORAGE_KEY,
      JSON.stringify({
        version: 0,
        state: {
          settings: {
            brandColor: "#ABCDEF",
            invoiceFields: { gst: false },
            notAField: true,
          },
        },
      }),
    );

    await useSalesSettingsStore.persist.rehydrate();

    const { settings } = useSalesSettingsStore.getState();
    expect(settings.brandColor).toBe("#ABCDEF");
    expect(settings.invoiceFields).toEqual({
      ...DEFAULT_SALES_SETTINGS.invoiceFields,
      gst: false,
    });
    expect(settings.quotePrefix).toBe(DEFAULT_SALES_SETTINGS.quotePrefix);
    expect(settings).not.toHaveProperty("notAField");
  });

  it("falls back to the defaults when an older stored copy has no settings at all", async () => {
    stored.set(STORAGE_KEY, JSON.stringify({ version: 0, state: {} }));

    await useSalesSettingsStore.persist.rehydrate();

    expect(useSalesSettingsStore.getState().settings).toEqual(DEFAULT_SALES_SETTINGS);
  });

  it("restores a current-version copy as stored, without migrating it", async () => {
    stored.set(
      STORAGE_KEY,
      JSON.stringify({
        version: SALES_SETTINGS_VERSION,
        state: { settings: { ...DEFAULT_SALES_SETTINGS, quotePrefix: "QQ" } },
      }),
    );

    await useSalesSettingsStore.persist.rehydrate();

    expect(useSalesSettingsStore.getState().settings.quotePrefix).toBe("QQ");
  });
});
