import { describe, expect, it, vi, beforeEach } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
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
  fetchContributionsPage,
  fetchContributionDetail,
  createContributionApi,
  updateContributionApi,
  deleteContributionApi,
  fetchContributionMatrix,
  mapContributionMatrix,
  fetchFunds,
  createFundApi,
  contributionAmount,
  contributionMatched,
  contributionRemaining,
  contributionStatus,
  contributionStatusVariant,
  contributionsInPeriod,
  superStats,
  amountFieldError,
  contributionIssues,
  fundCreateLabel,
  fundNameError,
  emptyContributionDraft,
  draftFromContribution,
  contributionSummaryLine,
} = await import("@/lib/super");

import type { Contribution, ContributionDraft } from "@/lib/super";

/** Decrypts whatever body a call sent, whether it's a bare object or a DELETE's `config.data`. */
function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was not an encrypted {data} envelope");
  }
  return decryptPayload(asData.data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

/** A full contribution — individual fields overridden per test as needed. */
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

describe("fetchContributionsPage", () => {
  it("sends page and limit, and omits name when there's nothing to search for", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [], pagination: { total: 0 } },
    });

    await fetchContributionsPage(2, 25);

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.superContribution.list);
    expect(config.params).toEqual({ page: "2", limit: "25" });
  });

  it("sends a trimmed name param once there's something to search for", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [], pagination: { total: 0 } },
    });

    await fetchContributionsPage(1, 25, "  AMP Super  ");

    const [, config] = apiMock.get.mock.calls[0];
    expect(config.params).toEqual({
      page: "1",
      limit: "25",
      name: "AMP Super",
    });
  });

  it("maps every raw field, including possible_match and various is_taxable formats", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 89276,
            fund_id: 116,
            fund_name: "AMP Super",
            date: "2026-09-10",
            price: 1212,
            description: "test copy",
            is_taxable: true,
            remaining_amount: 1212,
            possible_match: 3,
          },
          {
            id: 89275,
            fund_id: 116,
            fund_name: "AMP Super",
            date: "2026-08-01",
            price: "56",
            description: "",
            is_taxable: "0",
            remaining_amount: "0",
            possible_match: 0,
          },
        ],
        pagination: { total: 2 },
      },
    });

    const result = await fetchContributionsPage(1, 50);

    expect(result.total).toBe(2);
    expect(result.contributions[0]).toMatchObject({
      id: "89276",
      fundId: "116",
      fundName: "AMP Super",
      date: "2026-09-10",
      amount: "1212",
      notes: "test copy",
      taxDeduction: true,
      possibleMatch: 3,
    });
    // Fully reconciled (remaining === price) — no personal-deduction bearing
    // on it, but is_taxable "0" is a truthy-looking string that has to read
    // as false, and remaining 0 means fully matched.
    expect(result.contributions[1]).toMatchObject({
      id: "89275",
      amount: "56",
      taxDeduction: false,
      possibleMatch: 0,
    });
  });

  it("synthesizes a single reconciled match from remaining_amount vs price, and none when nothing's matched", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            fund_id: 1,
            fund_name: "Fund A",
            date: "2026-09-10",
            price: 1000,
            is_taxable: false,
            remaining_amount: 400, // 600 already reconciled
          },
          {
            id: 2,
            fund_id: 1,
            fund_name: "Fund A",
            date: "2026-09-10",
            price: 500,
            is_taxable: false,
            remaining_amount: 500, // nothing reconciled yet
          },
        ],
        pagination: { total: 2 },
      },
    });

    const result = await fetchContributionsPage(1, 50);

    expect(result.contributions[0].matches).toEqual([
      {
        transactionId: "reconciled-1",
        reference: "Bank reconciliation",
        amount: 600,
      },
    ]);
    expect(result.contributions[1].matches).toEqual([]);
  });

  it("falls back to the array length when the response carries no pagination", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            fund_id: 1,
            fund_name: "Fund A",
            date: "2026-09-10",
            price: 100,
            is_taxable: false,
            remaining_amount: 100,
          },
        ],
      },
    });

    const result = await fetchContributionsPage(1, 50);
    expect(result.total).toBe(1);
  });
});

describe("fetchContributionDetail", () => {
  it("fetches from the details route and maps the nested fund", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 89276,
          fund: { id: 116, name: "AMP Super" },
          date: "10-09-2026",
          price: 1212,
          notes: "test copy",
          is_taxable: 1,
          remaining_amount: 0,
        },
      },
    });

    const result = await fetchContributionDetail("89276");

    expect(apiMock.get).toHaveBeenCalledWith(
      `${apiRoutes.superContribution.details}/89276`,
    );
    expect(result).toMatchObject({
      id: "89276",
      fundId: "116",
      fundName: "AMP Super",
      date: "2026-09-10",
      amount: "1212",
      notes: "test copy",
      taxDeduction: true,
      possibleMatch: 0,
    });
  });

  it("maps a null fund to an empty id and name", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 1,
          fund: null,
          date: "01-01-2026",
          price: 100,
          notes: "",
          is_taxable: false,
          remaining_amount: 100,
        },
      },
    });

    const result = await fetchContributionDetail("1");
    expect(result.fundId).toBe("");
    expect(result.fundName).toBe("");
  });

  it("throws when the API returns no data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    await expect(fetchContributionDetail("does-not-exist")).rejects.toThrow(
      "Contribution not found",
    );
  });
});

describe("creating a contribution", () => {
  it("POSTs an encrypted body with the fund, price, date, tax flag, notes and fund name", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await createContributionApi(BASE_DRAFT);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.superContribution.create);
    expect(decryptedFieldsFromBody(body)).toEqual({
      fund_id: "116",
      price: 1212,
      date: "2026-09-10",
      is_taxable: 1,
      notes: "test copy",
      fund_name: "AMP Super",
    });
  });

  it("sends is_taxable 0 for a non-deductible contribution", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await createContributionApi({ ...BASE_DRAFT, taxDeduction: false });
    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.is_taxable).toBe(0);
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Fund not found" },
    });
    await expect(createContributionApi(BASE_DRAFT)).rejects.toThrow(
      "Fund not found",
    );
  });
});

describe("editing a contribution", () => {
  it("PATCHes an encrypted body without fund_name", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });

    await updateContributionApi("89276", BASE_DRAFT);

    expect(apiMock.patch).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(`${apiRoutes.superContribution.update}/89276`);
    const fields = decryptedFieldsFromBody(body);
    expect(fields).toEqual({
      fund_id: "116",
      price: 1212,
      date: "2026-09-10",
      is_taxable: 1,
      notes: "test copy",
    });
    expect(fields.fund_name).toBeUndefined();
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.patch.mockResolvedValue({
      data: { success: false, message: "Contribution not found" },
    });
    await expect(
      updateContributionApi("999", BASE_DRAFT),
    ).rejects.toThrow("Contribution not found");
  });
});

describe("deleting a contribution", () => {
  it("DELETEs with an encrypted empty body carried as the `data` config option", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await deleteContributionApi("89276");

    expect(apiMock.delete).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.delete.mock.calls[0];
    expect(url).toBe(`${apiRoutes.superContribution.delete}/89276`);
    expect(decryptPayload(config.data.data)).toEqual({});
  });

  it("throws with the server's own message — e.g. a reconciled contribution", async () => {
    apiMock.delete.mockResolvedValue({
      data: {
        success: false,
        message: "Reconciled contributions cannot be deleted",
      },
    });
    await expect(deleteContributionApi("1")).rejects.toThrow(
      "Reconciled contributions cannot be deleted",
    );
  });
});

describe("fetchContributionMatrix", () => {
  it("sends the period as the type param", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { has_previous_data: false, cards_data: [] } },
    });

    await fetchContributionMatrix("month");

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.superContribution.kpi, {
      params: { type: "month" },
    });
  });

  it("falls back to an empty matrix when the response carries no data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    const result = await fetchContributionMatrix("year");
    expect(result).toEqual({ has_previous_data: false, cards_data: [] });
  });
});

describe("mapContributionMatrix", () => {
  const matrix = {
    has_previous_data: true,
    cards_data: [
      { key: "total_contributions" as const, total_amount: 1000, percentage_change: 25 },
      { key: "matched_contributions" as const, total_amount: 600, percentage_change: -10 },
      { key: "pending_contributions" as const, total_amount: 400, percentage_change: 0 },
    ],
  };

  it("maps each card's value and an up/down/level delta from the server's own percentage", () => {
    const stats = mapContributionMatrix(matrix, "This year");
    expect(stats.total.delta).toBe("25% up on last year");
    expect(stats.matched.delta).toBe("10% down on last year");
    expect(stats.pending.delta).toBe("Level with last year");
  });

  it("reads 'No comparison' when the server reports no previous-period data", () => {
    const stats = mapContributionMatrix(
      { ...matrix, has_previous_data: false },
      "This month",
    );
    expect(stats.total.delta).toBe("No comparison for last month");
  });

  it("defaults a missing card to zero", () => {
    const stats = mapContributionMatrix(
      { has_previous_data: false, cards_data: [] },
      "This year",
    );
    expect(stats.total.value).toBe("$0.00");
  });
});

describe("funds", () => {
  it("fetchFunds maps the raw list to {id, name}", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [{ id: 116, name: "AMP Super" }] },
    });

    const funds = await fetchFunds();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.fund.list);
    expect(funds).toEqual([{ id: "116", name: "AMP Super" }]);
  });

  it("createFundApi POSTs an encrypted {name} body and returns the created fund", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { id: 200, name: "New Fund" } },
    });

    const fund = await createFundApi("New Fund");

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.fund.create);
    expect(decryptedFieldsFromBody(body)).toEqual({ name: "New Fund" });
    expect(fund).toEqual({ id: "200", name: "New Fund" });
  });

  it("throws when the server reports failure — e.g. a duplicate name", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: false,
        message: "Fund with this name already exists for this user",
      },
    });
    await expect(createFundApi("AMP Super")).rejects.toThrow(
      "Fund with this name already exists for this user",
    );
  });
});

describe("figures", () => {
  it("contributionAmount reads the typed amount as a number", () => {
    expect(contributionAmount({ amount: "1212.5" })).toBe(1212.5);
    expect(contributionAmount({ amount: "" })).toBe(0);
  });

  it("contributionMatched sums the matches", () => {
    expect(
      contributionMatched({
        matches: [
          { transactionId: "a", reference: "A", amount: 600 },
          { transactionId: "b", reference: "B", amount: 200 },
        ],
      }),
    ).toBe(800);
  });

  it("contributionRemaining never goes below zero", () => {
    expect(
      contributionRemaining({
        amount: "500",
        matches: [{ transactionId: "a", reference: "A", amount: 700 }],
      }),
    ).toBe(0);
  });

  it("contributionStatus reads Unmatched, Partly matched and Matched off the same figures", () => {
    expect(contributionStatus({ amount: "500", matches: [] })).toBe(
      "Unmatched",
    );
    expect(
      contributionStatus({
        amount: "500",
        matches: [{ transactionId: "a", reference: "A", amount: 200 }],
      }),
    ).toBe("Partly matched");
    expect(
      contributionStatus({
        amount: "500",
        matches: [{ transactionId: "a", reference: "A", amount: 500 }],
      }),
    ).toBe("Matched");
  });

  it("contributionStatusVariant maps status to a badge tone", () => {
    expect(contributionStatusVariant("Matched")).toBe("success");
    expect(contributionStatusVariant("Partly matched")).toBe("warning");
    expect(contributionStatusVariant("Unmatched")).toBe("secondary");
  });
});

describe("contributionsInPeriod", () => {
  const rows = [
    contribution({ id: "1", date: "2026-09-10" }),
    contribution({ id: "2", date: "2026-03-05" }),
    contribution({ id: "3", date: "2025-09-10" }),
  ];

  it("narrows to the calendar year for 'This year'", () => {
    const result = contributionsInPeriod(rows, "This year", "2026-09-15");
    expect(result.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("narrows to the calendar month for 'This month'", () => {
    const result = contributionsInPeriod(rows, "This month", "2026-09-15");
    expect(result.map((r) => r.id)).toEqual(["1"]);
  });
});

describe("superStats", () => {
  it("reconciles matched + pending against the total, and counts tax-deductible rows", () => {
    const rows = [
      contribution({
        id: "1",
        date: "2026-09-10",
        amount: "1000",
        taxDeduction: true,
        matches: [{ transactionId: "a", reference: "A", amount: 1000 }],
      }),
      contribution({
        id: "2",
        date: "2026-09-05",
        amount: "500",
        taxDeduction: false,
        matches: [],
      }),
    ];

    const stats = superStats(rows, "This year", "2026-09-15");

    expect(stats.total.value).toBe("$1,500.00");
    expect(stats.matched.value).toBe("$1,000.00");
    expect(stats.pending.value).toBe("$500.00");
    expect(stats.deductible.value).toBe("$1,000.00");
    expect(stats.deductible.count).toBe(1);
  });

  it("has no comparison when the prior period is empty", () => {
    const rows = [contribution({ id: "1", date: "2026-09-10" })];
    const stats = superStats(rows, "This year", "2026-09-15");
    expect(stats.total.delta).toBe("No comparison for last year");
  });
});

describe("validation", () => {
  it("amountFieldError rejects letters and negatives, accepts up to two decimals", () => {
    expect(amountFieldError("")).toBeUndefined();
    expect(amountFieldError("1212")).toBeUndefined();
    expect(amountFieldError("1212.50")).toBeUndefined();
    expect(amountFieldError("abc")).toBeDefined();
    expect(amountFieldError("-5")).toBeDefined();
  });

  it("contributionIssues flags a missing fund, date and amount", () => {
    const issues = contributionIssues(
      emptyContributionDraft("2026-09-10"),
    );
    expect(issues.map((issue) => issue.key)).toEqual(
      expect.arrayContaining(["fund", "amount"]),
    );
  });

  it("contributionIssues is empty for a complete draft", () => {
    expect(contributionIssues(BASE_DRAFT)).toEqual([]);
  });

  it("fundCreateLabel quotes a typed name, and invites one when empty", () => {
    expect(fundCreateLabel("AMP Super")).toBe('Create "AMP Super"');
    expect(fundCreateLabel("  ")).toBe("Add new fund");
  });

  it("fundNameError requires a real name and rejects a case-insensitive duplicate", () => {
    const funds = [{ id: "1", name: "AMP Super" }];
    expect(fundNameError("a", funds)).toBeDefined();
    expect(fundNameError("amp super", funds)).toBeDefined();
    expect(fundNameError("amp super", funds, "1")).toBeUndefined();
    expect(fundNameError("New Fund", funds)).toBeUndefined();
  });
});

describe("drafts", () => {
  it("emptyContributionDraft seeds today's date and blank fields", () => {
    expect(emptyContributionDraft("2026-09-10")).toEqual({
      fundId: "",
      fundName: "",
      date: "2026-09-10",
      amount: "",
      notes: "",
      taxDeduction: false,
    });
  });

  it("draftFromContribution carries every editable field, dropping id/matches/possibleMatch", () => {
    const source = contribution({ possibleMatch: 3 });
    expect(draftFromContribution(source)).toEqual({
      fundId: source.fundId,
      fundName: source.fundName,
      date: source.date,
      amount: source.amount,
      notes: source.notes,
      taxDeduction: source.taxDeduction,
    });
  });

  it("contributionSummaryLine reads '$X to fund'", () => {
    expect(contributionSummaryLine(BASE_DRAFT)).toBe(
      "$1,212.00 to AMP Super",
    );
  });

  it("contributionSummaryLine falls back to 'No amount' with nothing typed", () => {
    expect(
      contributionSummaryLine(emptyContributionDraft("2026-09-10")),
    ).toBe("No amount");
  });
});
