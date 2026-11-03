import { describe, expect, it, vi, beforeEach } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so `lib/super.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  SUPER_PERIODS,
  contributionAmount,
  contributionIssues,
  contributionStatus,
  contributionsInPeriod,
  createContributionApi,
  createFundApi,
  deleteContributionApi,
  fetchContributionDetail,
  fetchContributionsPage,
  fetchFunds,
  formatContributionDate,
  fundNameError,
  superStats,
  updateContributionApi,
} = await import("@/lib/super");

import type { Contribution, ContributionDraft } from "@/lib/super";

beforeEach(() => {
  vi.clearAllMocks();
});

function contribution(overrides: Partial<Contribution> = {}): Contribution {
  return {
    id: "1",
    fundId: "116",
    fundName: "AMP Super",
    date: "2026-09-10",
    amount: "1212",
    notes: "",
    taxDeduction: true,
    matches: [],
    possibleMatch: 0,
    ...overrides,
  };
}

const BASE_DRAFT: ContributionDraft = {
  fundId: "116",
  fundName: "AMP Super",
  date: "2026-09-10",
  amount: "1212",
  notes: "test copy",
  taxDeduction: true,
};

function matched(amount: number) {
  return [{ transactionId: "a", reference: "A", amount }];
}

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    fund_id: 1,
    fund_name: "Fund A",
    date: "2026-09-10",
    price: 100,
    is_taxable: false,
    remaining_amount: 100,
    ...overrides,
  };
}

describe("SUPER_PERIODS / formatContributionDate", () => {
  it("offers the two period tabs, and formats dates like the invoices do", () => {
    expect(SUPER_PERIODS).toEqual(["This year", "This month"]);
    expect(formatContributionDate("2026-09-10")).toBe("10/09/2026");
  });
});

describe("contributionAmount / contributionStatus — edges", () => {
  it("reads a non-numeric amount as 0", () => {
    expect(contributionAmount({ amount: "abc" })).toBe(0);
  });

  it("uses a half-cent tolerance: 0.004 remaining is Matched, 0.005 and 0.006 are Partly matched", () => {
    expect(contributionStatus({ amount: "1", matches: matched(0.996) })).toBe("Matched");
    expect(contributionStatus({ amount: "1", matches: matched(0.995) })).toBe(
      "Partly matched",
    );
    expect(contributionStatus({ amount: "1", matches: matched(0.994) })).toBe(
      "Partly matched",
    );
  });

  it("reads an over-matched contribution as Matched, never negative remaining", () => {
    expect(contributionStatus({ amount: "100", matches: matched(150) })).toBe("Matched");
  });
});

describe("contributionsInPeriod / superStats — prior-period wrap and delta wording", () => {
  it("'This month' in January compares against December of the prior year", () => {
    const rows = [
      contribution({ id: "1", date: "2027-01-10", amount: "150" }),
      contribution({ id: "2", date: "2026-12-10", amount: "100" }),
      contribution({ id: "3", date: "2027-12-10", amount: "999" }),
    ];
    expect(contributionsInPeriod(rows, "This month", "2027-01-15").map((r) => r.id)).toEqual([
      "1",
    ]);
    const stats = superStats(rows, "This month", "2027-01-15");
    expect(stats.total.delta).toBe("50% up on last month");
  });

  it("reads 'down' for a drop, and 'Level with' when the change rounds to 0", () => {
    const down = superStats(
      [
        contribution({ id: "1", date: "2026-09-10", amount: "75" }),
        contribution({ id: "2", date: "2025-09-10", amount: "100" }),
      ],
      "This year",
      "2026-09-15",
    );
    expect(down.total.delta).toBe("25% down on last year");

    const level = superStats(
      [
        contribution({ id: "1", date: "2026-09-10", amount: "1001" }),
        contribution({ id: "2", date: "2025-09-10", amount: "1000" }),
      ],
      "This year",
      "2026-09-15",
    );
    expect(level.total.delta).toBe("Level with last year");
  });

  it("sums remaining amounts (not face value) into pending, so matched + pending = total", () => {
    const stats = superStats(
      [contribution({ amount: "1000", matches: matched(600), taxDeduction: false })],
      "This year",
      "2026-09-15",
    );
    expect(stats.total.value).toBe("$1,000.00");
    expect(stats.matched.value).toBe("$600.00");
    expect(stats.pending.value).toBe("$400.00");
    // A part-matched contribution counts as pending, not matched.
    expect(stats.matched.count).toBe(0);
    expect(stats.pending.count).toBe(1);
    expect(stats.deductible.value).toBe("$0.00");
    expect(stats.deductible.count).toBe(0);
  });

  it("reads 'No comparison for last month' on the month tab", () => {
    const stats = superStats([contribution()], "This month", "2026-09-15");
    expect(stats.matched.delta).toBe("No comparison for last month");
  });
});

describe("contributionIssues — the two distinct amount messages", () => {
  it("uses the shape message for a malformed amount", () => {
    expect(contributionIssues({ ...BASE_DRAFT, amount: "12.345" })).toEqual([
      { key: "amount", message: "Enter a valid amount — no letters or negatives." },
    ]);
  });

  it("uses the blank message for an empty or zero amount", () => {
    expect(contributionIssues({ ...BASE_DRAFT, amount: "" })).toEqual([
      { key: "amount", message: "Enter a contribution amount." },
    ]);
    expect(contributionIssues({ ...BASE_DRAFT, amount: "0" })).toEqual([
      { key: "amount", message: "Enter a contribution amount." },
    ]);
  });

  it("flags a missing date, and accepts a typed fund name with no fund id", () => {
    expect(contributionIssues({ ...BASE_DRAFT, date: "" })).toEqual([
      { key: "date", message: "Choose a contribution date." },
    ]);
    expect(contributionIssues({ ...BASE_DRAFT, fundId: "", fundName: "New Fund" })).toEqual(
      [],
    );
  });

  it("lists fund, date and amount in on-screen order with their exact wording", () => {
    expect(
      contributionIssues({ ...BASE_DRAFT, fundId: "", fundName: " ", date: "", amount: "" }),
    ).toEqual([
      { key: "fund", message: "Choose the fund this went to." },
      { key: "date", message: "Choose a contribution date." },
      { key: "amount", message: "Enter a contribution amount." },
    ]);
  });
});

describe("fundNameError — exact messages", () => {
  it("asks for a name under 2 characters (after trimming), and names a clash", () => {
    const funds = [{ id: "1", name: " AMP Super " }];
    expect(fundNameError("  a  ", funds)).toBe("Name this fund.");
    expect(fundNameError("  amp SUPER ", funds)).toBe(
      "A fund with this name already exists.",
    );
  });
});

describe("parseTaxDeduction (via fetchContributionsPage)", () => {
  it.each([
    [true, true],
    [1, true],
    ["1", true],
    ["false", true], // truthy string that isn't literally "0"
    [false, false],
    [0, false],
    ["0", false],
    ["", false],
  ] as const)("is_taxable %j reads as %s", async (is_taxable, expected) => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [listRow({ is_taxable })] },
    });
    const { contributions } = await fetchContributionsPage(1, 50);
    expect(contributions[0].taxDeduction).toBe(expected);
  });
});

describe("syntheticMatches (via fetchContributionsPage)", () => {
  async function matchesFor(price: number, remaining: number) {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [listRow({ price, remaining_amount: remaining })] },
    });
    return (await fetchContributionsPage(1, 50)).contributions[0];
  }

  it("fabricates nothing when reconciled is within half a cent — so the row still reads Unmatched", async () => {
    const row = await matchesFor(100, 99.996);
    expect(row.matches).toEqual([]);
    expect(contributionStatus(row)).toBe("Unmatched");
  });

  it("treats a negative remaining_amount as fully reconciled", async () => {
    const row = await matchesFor(100, -20);
    expect(row.matches).toEqual([
      { transactionId: "reconciled-1", reference: "Bank reconciliation", amount: 100 },
    ]);
    expect(contributionStatus(row)).toBe("Matched");
  });

  it("fabricates nothing when remaining exceeds the price", async () => {
    expect((await matchesFor(100, 150)).matches).toEqual([]);
  });

  it("treats a missing remaining_amount as nothing reconciled", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [listRow({ remaining_amount: undefined })] },
    });
    expect((await fetchContributionsPage(1, 50)).contributions[0].matches).toEqual([]);
  });
});

describe("fetchContributionsPage — never gates on success", () => {
  it("still maps rows when the envelope reports success:false", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, data: [listRow()] } });
    const result = await fetchContributionsPage(1, 50);
    expect(result.contributions).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("sends page/limit as strings and omits a whitespace-only search", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });
    await fetchContributionsPage(2, 25, "   ");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.superContribution.list, {
      params: { page: "2", limit: "25" },
    });
  });

  it("maps a null fund_id / fund_name / description to blanks", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [listRow({ fund_id: null, fund_name: null, description: null })],
      },
    });
    const [row] = (await fetchContributionsPage(1, 50)).contributions;
    expect(row.fundId).toBe("");
    expect(row.fundName).toBe("");
    expect(row.notes).toBe("");
  });
});

describe("fetchContributionDetail — date conversion", () => {
  function detail(date: string) {
    return {
      data: {
        success: true,
        data: {
          id: 1,
          fund: { id: 1, name: "Fund A" },
          date,
          price: 100,
          is_taxable: 0,
          remaining_amount: 100,
        },
      },
    };
  }

  it("passes an unparseable date through unchanged", async () => {
    apiMock.get.mockResolvedValue(detail("2026-09-10"));
    expect((await fetchContributionDetail("1")).date).toBe("2026-09-10");
    apiMock.get.mockResolvedValue(detail("10/09/2026"));
    expect((await fetchContributionDetail("1")).date).toBe("10/09/2026");
  });

  it("throws even on success:true if no data came back", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    await expect(fetchContributionDetail("1")).rejects.toThrow("Contribution not found");
  });
});

describe("write calls — generic fallback messages differ per action", () => {
  it("create / update / delete each have their own message", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(createContributionApi(BASE_DRAFT)).rejects.toThrow(
      "Failed to record contribution",
    );

    apiMock.patch.mockResolvedValue({ data: { success: false } });
    await expect(updateContributionApi("1", BASE_DRAFT)).rejects.toThrow(
      "Failed to save contribution",
    );

    apiMock.delete.mockResolvedValue({ data: { success: false } });
    await expect(deleteContributionApi("1")).rejects.toThrow(
      "Failed to delete contribution",
    );
  });

  it("update goes through PATCH to the id route, never POST", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });
    await updateContributionApi("89276", BASE_DRAFT);
    expect(apiMock.patch.mock.calls[0][0]).toBe(
      `${apiRoutes.superContribution.update}/89276`,
    );
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("delete targets the id route", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await deleteContributionApi("89276");
    expect(apiMock.delete.mock.calls[0][0]).toBe(
      `${apiRoutes.superContribution.delete}/89276`,
    );
  });
});

describe("funds — fallbacks", () => {
  it("fetchFunds is empty when the response has no data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    expect(await fetchFunds()).toEqual([]);
  });

  it("createFundApi throws on a nominal success with no fund, with a generic message", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await expect(createFundApi("New Fund")).rejects.toThrow("Failed to create fund");
  });
});
