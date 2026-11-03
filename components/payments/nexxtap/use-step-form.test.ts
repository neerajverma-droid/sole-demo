import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/utils/axiosInstance", () => ({ default: {} }));

const { hasValueAt, visibleIssues } = await import(
  "@/components/payments/nexxtap/use-step-form"
);

const all = { abn: "bad", city: "required", "0.email": "bad" };

describe("visibleIssues", () => {
  it("shows a problem in a value that's already there, before Save", () => {
    const shown = visibleIssues(all, {
      draft: { abn: "123", city: "" },
      touched: new Set(),
      focusedKeys: [],
      showAll: false,
    });
    expect(shown).toEqual({ abn: "bad" });
  });

  it("holds back the field being typed in until it's left", () => {
    const shown = visibleIssues(all, {
      draft: { abn: "123" },
      touched: new Set(),
      focusedKeys: ["abn"],
      showAll: false,
    });
    expect(shown).toEqual({});
  });

  it("shows an empty required field once it has been left", () => {
    const shown = visibleIssues(all, {
      draft: { city: "" },
      touched: new Set(["city"]),
      focusedKeys: [],
      showAll: false,
    });
    expect(shown).toEqual({ city: "required" });
  });

  it("shows everything after Save", () => {
    const shown = visibleIssues(all, {
      draft: {},
      touched: new Set(),
      focusedKeys: ["abn"],
      showAll: true,
    });
    expect(shown).toEqual(all);
  });
});

describe("hasValueAt", () => {
  it("reads owner keys by index", () => {
    expect(hasValueAt([{ email: "a@b.co" }], "0.email")).toBe(true);
    expect(hasValueAt([{ email: " " }], "0.email")).toBe(false);
    expect(hasValueAt({ devices: [] }, "devices")).toBe(false);
  });
});
