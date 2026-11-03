import { beforeEach, describe, expect, it } from "vitest";

import { useAssetRegistryStore } from "@/stores/asset-registry";

beforeEach(() => {
  useAssetRegistryStore.setState({
    brandRecords: [],
    typeRecords: [],
    brands: [],
    types: [],
  });
});

describe("setRegistry", () => {
  it("sorts both lists by name and derives the plain name arrays from them", () => {
    useAssetRegistryStore.getState().setRegistry({
      brands: [
        { id: 2, name: "Makita" },
        { id: 1, name: "DeWalt" },
      ],
      types: [
        { id: 4, name: "Used" },
        { id: 3, name: "New" },
      ],
    });

    const state = useAssetRegistryStore.getState();
    expect(state.brandRecords).toEqual([
      { id: 1, name: "DeWalt" },
      { id: 2, name: "Makita" },
    ]);
    expect(state.brands).toEqual(["DeWalt", "Makita"]);
    expect(state.types).toEqual(["New", "Used"]);
  });

  it("replaces wholesale rather than merging with what was there", () => {
    useAssetRegistryStore.getState().addBrandRecord({ id: 9, name: "Stale" });
    useAssetRegistryStore.getState().setRegistry({ brands: [{ id: 1, name: "DeWalt" }], types: [] });
    expect(useAssetRegistryStore.getState().brands).toEqual(["DeWalt"]);
  });

  it("doesn't mutate the arrays it was handed", () => {
    const brands = [
      { id: 2, name: "Makita" },
      { id: 1, name: "DeWalt" },
    ];
    useAssetRegistryStore.getState().setRegistry({ brands, types: [] });
    expect(brands.map((b) => b.name)).toEqual(["Makita", "DeWalt"]);
  });
});

describe("addBrandRecord / addTypeRecord", () => {
  beforeEach(() => {
    useAssetRegistryStore.getState().setRegistry({
      brands: [
        { id: 1, name: "Bosch" },
        { id: 2, name: "Makita" },
      ],
      types: [{ id: 3, name: "New" }],
    });
  });

  it("slots a new brand into alphabetical position, not onto the end", () => {
    useAssetRegistryStore.getState().addBrandRecord({ id: 5, name: "DeWalt" });
    const state = useAssetRegistryStore.getState();
    expect(state.brands).toEqual(["Bosch", "DeWalt", "Makita"]);
    expect(state.brandRecords[1]).toEqual({ id: 5, name: "DeWalt" });
  });

  it("does the same for types, leaving brands untouched", () => {
    useAssetRegistryStore.getState().addTypeRecord({ id: 6, name: "Hire" });
    const state = useAssetRegistryStore.getState();
    expect(state.types).toEqual(["Hire", "New"]);
    expect(state.brands).toEqual(["Bosch", "Makita"]);
  });

  it("doesn't dedupe — guarding against a duplicate is the API's job (409)", () => {
    useAssetRegistryStore.getState().addBrandRecord({ id: 7, name: "Bosch" });
    expect(useAssetRegistryStore.getState().brands).toEqual(["Bosch", "Bosch", "Makita"]);
  });
});
