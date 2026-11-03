import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  EMPTY_SIDEBAR_LAYOUT,
  fetchSidebarLayout,
  fetchSidebarPins,
  readSidebarLayout,
  serialiseLayout,
  serialisePins,
  type SidebarLayout,
} from "@/lib/sidebar-sync";

const get = vi.fn();

vi.mock("@/utils/axiosInstance", () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
    post: vi.fn(),
  },
}));

/**
 * The two halves that decide whether the rail survives a round trip.
 *
 * `read*` is what stands between a body the server versioned independently and
 * a sidebar that throws while rendering it. `serialise*` is what stops the sync
 * effects posting on every render — and, more importantly, what decides whether
 * two states are the SAME state: get that wrong in the lenient direction and a
 * real change is never saved.
 *
 * The distinction between a failed read and an empty one is pinned hardest,
 * because the writes behind it replace rather than merge — mistaking one for
 * the other doesn't just fail to load the rail, it saves the mistake.
 */

beforeEach(() => {
  get.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("readSidebarLayout", () => {
  it("reads a well-formed layout through unchanged", () => {
    const layout: SidebarLayout = {
      order: { Main: ["transactions", "sales"] },
      childOrder: { sales: ["invoices"] },
      hidden: ["assets"],
      extras: ["contacts"],
    };

    expect(readSidebarLayout(layout)).toEqual(layout);
  });

  it("fills in the keys an older server left out", () => {
    expect(readSidebarLayout({ hidden: ["assets"] })).toEqual({
      ...EMPTY_SIDEBAR_LAYOUT,
      hidden: ["assets"],
    });
  });

  it.each([null, undefined, 42, "layout", ["a"]])(
    "reads %p as the empty layout rather than throwing",
    (value) => {
      expect(readSidebarLayout(value)).toEqual(EMPTY_SIDEBAR_LAYOUT);
    },
  );

  it("drops entries that aren't nav ids", () => {
    expect(
      readSidebarLayout({ hidden: ["assets", "", null, 7, { id: "x" }] })
        .hidden,
    ).toEqual(["assets"]);
  });

  it("drops a section whose list cleans down to nothing, so it reads as absent", () => {
    expect(
      readSidebarLayout({ order: { Main: [], Other: ["sales"] } }).order,
    ).toEqual({
      Other: ["sales"],
    });
  });

  it("keeps list order, which is the preference being read", () => {
    expect(readSidebarLayout({ hidden: ["c", "a", "b"] }).hidden).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});

describe("fetchSidebarPins", () => {
  it("returns the stored ids", async () => {
    get.mockResolvedValue({
      data: { success: true, data: { pinnedNavIds: ["sales", "quotes"] } },
    });

    await expect(fetchSidebarPins()).resolves.toEqual(["sales", "quotes"]);
  });

  it("returns [] for an account that has pinned nothing", async () => {
    get.mockResolvedValue({
      data: { success: true, data: { pinnedNavIds: [] } },
    });

    await expect(fetchSidebarPins()).resolves.toEqual([]);
  });

  it("returns null when the request never lands, not []", async () => {
    get.mockRejectedValue(new Error("offline"));

    // The difference the whole module turns on: [] would seed an empty rail
    // and the write effect would then save it over the real one.
    await expect(fetchSidebarPins()).resolves.toBeNull();
  });

  it("returns null on a body that says it failed", async () => {
    get.mockResolvedValue({ data: { success: false, message: "nope" } });

    await expect(fetchSidebarPins()).resolves.toBeNull();
  });
});

describe("fetchSidebarLayout", () => {
  it("returns the stored layout", async () => {
    get.mockResolvedValue({
      data: { success: true, data: { sidebarLayout: { hidden: ["assets"] } } },
    });

    await expect(fetchSidebarLayout()).resolves.toEqual({
      ...EMPTY_SIDEBAR_LAYOUT,
      hidden: ["assets"],
    });
  });

  it("returns the empty layout for an account that has never customised", async () => {
    get.mockResolvedValue({
      data: { success: true, data: { sidebarLayout: null } },
    });

    await expect(fetchSidebarLayout()).resolves.toEqual(EMPTY_SIDEBAR_LAYOUT);
  });

  it("returns null when the request never lands", async () => {
    get.mockRejectedValue(new Error("offline"));

    await expect(fetchSidebarLayout()).resolves.toBeNull();
  });
});

describe("serialisePins", () => {
  it("calls the same list the same", () => {
    expect(serialisePins(["a", "b"])).toBe(serialisePins(["a", "b"]));
  });

  it("calls a reordered list different — a drag is a change to save", () => {
    expect(serialisePins(["a", "b"])).not.toBe(serialisePins(["b", "a"]));
  });

  it("calls a longer list different", () => {
    expect(serialisePins(["a"])).not.toBe(serialisePins(["a", "b"]));
  });
});

describe("serialiseLayout", () => {
  const layout = (over: Partial<SidebarLayout> = {}): SidebarLayout => ({
    ...EMPTY_SIDEBAR_LAYOUT,
    ...over,
  });

  it("ignores the order the keys happen to be in", () => {
    const a = layout({ order: { Main: ["x"], Other: ["y"] } });
    const b = layout({ order: { Other: ["y"], Main: ["x"] } });

    // Two objects built by different code paths describe one rail; a new POST
    // on every render that rebuilt them in a different order would be noise.
    expect(serialiseLayout(a)).toBe(serialiseLayout(b));
  });

  it("does not ignore the order within a list", () => {
    expect(serialiseLayout(layout({ order: { Main: ["x", "y"] } }))).not.toBe(
      serialiseLayout(layout({ order: { Main: ["y", "x"] } })),
    );
  });

  it("separates the four parts, so one can't be read as another", () => {
    expect(serialiseLayout(layout({ hidden: ["a"] }))).not.toBe(
      serialiseLayout(layout({ extras: ["a"] })),
    );
  });

  it("notices a row being switched off", () => {
    expect(serialiseLayout(layout())).not.toBe(
      serialiseLayout(layout({ hidden: ["assets"] })),
    );
  });

  it("notices a submenu reorder, not just a top-level one", () => {
    expect(
      serialiseLayout(layout({ childOrder: { sales: ["a", "b"] } })),
    ).not.toBe(serialiseLayout(layout({ childOrder: { sales: ["b", "a"] } })));
  });
});
