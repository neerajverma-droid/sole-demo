import { beforeEach, describe, expect, it } from "vitest";

import { useSuperStore } from "@/stores/super";
import type { Contribution, SuperFund } from "@/lib/super";

function fund(overrides: Partial<SuperFund> = {}): SuperFund {
  return { id: "fund-1", name: "AustralianSuper", ...overrides };
}

function contribution(overrides: Partial<Contribution> = {}): Contribution {
  return {
    id: "c1",
    fundId: "fund-1",
    fundName: "AustralianSuper",
    date: "2026-08-01",
    amount: "500",
    notes: "",
    taxDeduction: false,
    matches: [],
    possibleMatch: 0,
    ...overrides,
  };
}

beforeEach(() => {
  useSuperStore.setState({ funds: [], contributions: [], hydrated: false });
});

describe("addFund — dedupes by id", () => {
  it("prepends a genuinely new fund", () => {
    useSuperStore.setState({ funds: [fund({ id: "existing" })] });

    useSuperStore.getState().addFund(fund({ id: "new-fund" }));

    expect(useSuperStore.getState().funds.map((f) => f.id)).toEqual([
      "new-fund",
      "existing",
    ]);
  });

  it("is a no-op when a fund with the same id already exists — the API can hand back a fund already in the list", () => {
    useSuperStore.setState({ funds: [fund({ id: "fund-1", name: "Original name" })] });

    useSuperStore.getState().addFund(fund({ id: "fund-1", name: "Renamed elsewhere" }));

    expect(useSuperStore.getState().funds).toEqual([
      fund({ id: "fund-1", name: "Original name" }),
    ]);
  });
});

describe("setFunds / setContributions", () => {
  it("setFunds replaces the list wholesale", () => {
    useSuperStore.setState({ funds: [fund({ id: "old" })] });
    useSuperStore.getState().setFunds([fund({ id: "new" })]);
    expect(useSuperStore.getState().funds.map((f) => f.id)).toEqual(["new"]);
  });

  it("setContributions replaces the page and marks the store hydrated", () => {
    expect(useSuperStore.getState().hydrated).toBe(false);

    useSuperStore.getState().setContributions([contribution()]);

    expect(useSuperStore.getState().contributions).toHaveLength(1);
    expect(useSuperStore.getState().hydrated).toBe(true);
  });
});
