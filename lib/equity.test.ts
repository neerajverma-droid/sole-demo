import { describe, expect, it, vi, beforeEach } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so `lib/equity.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  fetchEquityPage,
  fetchEquitySubcategories,
  fetchEquityDetail,
  createEquityApi,
  updateEquityApi,
  deleteEquityApi,
  undoEquityMatchApi,
  equityDirection,
  equityRemaining,
  formatEquityAmount,
  formatEquityRemaining,
  formatEquityDate,
  equityIssues,
  equitySummaryLine,
  emptyEquityDraft,
} = await import("@/lib/equity");

import type { Equity, EquityDraft } from "@/lib/equity";

/** Decrypts whatever body a call sent, whether a bare `{data}` object or FormData. */
function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  if (body instanceof FormData) {
    const data = body.get("data");
    if (typeof data !== "string")
      throw new Error("FormData had no 'data' field");
    return decryptPayload(data);
  }
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was neither FormData nor a {data} envelope");
  }
  return decryptPayload(asData.data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

/** A full equity entry — individual fields overridden per test as needed. */
function equity(overrides: Partial<Equity> = {}): Equity {
  return {
    id: "1",
    date: "2026-09-10",
    name: "Owner top-up — winter cashflow",
    category: "Owner Capital Input",
    amount: 15000,
    paidWithCash: false,
    paidAmount: 0,
    status: "Pending",
    transactionRef: null,
    attachment: null,
    possibleMatch: 0,
    ...overrides,
  };
}

const BASE_DRAFT: EquityDraft = {
  date: "2026-09-10",
  name: "Owner top-up — winter cashflow",
  categoryId: "14",
  amount: 15000,
  paidWithCash: false,
  attachment: null,
};

describe("fetchEquityPage", () => {
  it("sends page and limit, and omits searchQuery when there's nothing to search for", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { rows: [], paginationData: { total: 0 } } },
    });

    await fetchEquityPage(2, 25);

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.equity.list);
    expect(config.params).toEqual({ page: "2", limit: "25" });
  });

  it("sends a trimmed searchQuery param once there's something to search for", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { rows: [], paginationData: { total: 0 } } },
    });

    await fetchEquityPage(1, 50, "  drawings  ");

    const [, config] = apiMock.get.mock.calls[0];
    expect(config.params).toEqual({
      page: "1",
      limit: "50",
      searchQuery: "drawings",
    });
  });

  it("maps every raw field, including paid_with_cash and possible_match", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          rows: [
            {
              id: 5,
              name: "Quarterly drawings",
              subcategory_name: "Drawings",
              price: 1200,
              remainingAmount: 1200,
              transaction_date: "2026-07-25",
              is_reconciled: false,
              paid_with_cash: false,
              possible_match: 1,
            },
          ],
          paginationData: { total: 1 },
        },
      },
    });

    const result = await fetchEquityPage(1, 50);

    expect(result.total).toBe(1);
    expect(result.equity[0]).toEqual({
      id: "5",
      date: "2026-07-25",
      name: "Quarterly drawings",
      category: "Drawings",
      amount: 1200,
      paidWithCash: false,
      paidAmount: 0,
      status: "Pending",
      transactionRef: null,
      attachment: null,
      possibleMatch: 1,
    });
  });

  it("falls back to created_at when transaction_date is absent", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          rows: [
            {
              id: 1,
              name: "Legacy entry",
              price: 100,
              created_at: "2026-05-01T10:00:00.000Z",
            },
          ],
          paginationData: { total: 1 },
        },
      },
    });

    const result = await fetchEquityPage(1, 50);
    expect(result.equity[0].date).toBe("2026-05-01");
  });

  it("reads is_reconciled/paid_with_cash in their various raw forms", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          rows: [
            {
              id: 1,
              name: "Cash drawings",
              price: 350,
              remainingAmount: 0,
              is_reconciled: "1",
              paid_with_cash: "1",
            },
            {
              id: 2,
              name: "Owner input",
              price: 500,
              is_reconciled: 0,
              paid_with_cash: false,
            },
          ],
          paginationData: { total: 2 },
        },
      },
    });

    const result = await fetchEquityPage(1, 50);
    expect(result.equity[0]).toMatchObject({
      status: "Matched",
      paidWithCash: true,
      paidAmount: 350,
    });
    expect(result.equity[1]).toMatchObject({
      status: "Pending",
      paidWithCash: false,
      paidAmount: 0,
    });
  });

  it("falls back to the array length when the response carries no pagination total", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { rows: [{ id: 1, name: "A", price: 100 }] } },
    });
    const result = await fetchEquityPage(1, 50);
    expect(result.total).toBe(1);
  });
});

describe("fetchEquitySubcategories", () => {
  it("maps account_subcategory_id/account_subcategory_name pairs", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { account_subcategory_id: 14, account_subcategory_name: "Drawings" },
          { account_subcategory_id: 15, subcategory_name: "Owner Capital Input" },
        ],
      },
    });

    const result = await fetchEquitySubcategories();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.equity.subcategoryList);
    expect(result).toEqual([
      { id: "14", name: "Drawings" },
      { id: "15", name: "Owner Capital Input" },
    ]);
  });

  it("drops rows missing an id or a name", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { account_subcategory_id: 14, account_subcategory_name: "Drawings" },
          { account_subcategory_id: "", account_subcategory_name: "No id" },
          { account_subcategory_id: 15, account_subcategory_name: "" },
        ],
      },
    });

    expect(await fetchEquitySubcategories()).toEqual([
      { id: "14", name: "Drawings" },
    ]);
  });
});

describe("fetchEquityDetail", () => {
  it("fetches from viewDetail + id and maps the category id and date", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 5,
          name: "Quarterly drawings",
          price: 1200,
          transaction_date: "2026-07-25",
          paid_with_cash: 0,
          account_subcategory_id: 14,
          documents: [],
        },
      },
    });

    const result = await fetchEquityDetail("5");

    expect(apiMock.get).toHaveBeenCalledWith(
      `${apiRoutes.equity.viewDetail}5`,
    );
    expect(result).toMatchObject({
      date: "2026-07-25",
      name: "Quarterly drawings",
      categoryId: "14",
      amount: 1200,
      paidWithCash: false,
      attachment: null,
      documents: [],
    });
  });

  it("reads the category id from a nested account_subcategory when the flat field is absent", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 1,
          name: "Owner input",
          price: 500,
          transaction_date: "2026-01-01",
          account_subcategory: { account_subcategory_id: 15 },
        },
      },
    });

    const result = await fetchEquityDetail("1");
    expect(result.categoryId).toBe("15");
  });

  it("maps the first document into an attachment preview, keyed off its real url", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 1,
          name: "Van deposit",
          price: 6500,
          transaction_date: "2026-07-19",
          account_subcategory_id: 15,
          documents: [
            {
              document_id: 900,
              file_name: "deposit-slip.pdf",
              file_path: "https://cdn.test/deposit-slip.pdf",
            },
          ],
        },
      },
    });

    const result = await fetchEquityDetail("1");
    expect(result.documents).toEqual([
      {
        id: "900",
        name: "deposit-slip.pdf",
        url: "https://cdn.test/deposit-slip.pdf",
      },
    ]);
    expect(result.attachment).toEqual({
      dataUrl: "https://cdn.test/deposit-slip.pdf",
      name: "deposit-slip.pdf",
      size: 0,
    });
  });

  it("throws when the API returns no data", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    await expect(fetchEquityDetail("does-not-exist")).rejects.toThrow(
      "Equity entry not found",
    );
  });
});

describe("creating an equity entry", () => {
  it("POSTs an encrypted body with the category, name, price, paid_with_cash and transaction_date", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { id: 900 } },
    });

    const result = await createEquityApi(BASE_DRAFT, null);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.equity.add);
    expect(body).not.toBeInstanceOf(FormData);
    expect(decryptedFieldsFromBody(body)).toEqual({
      account_subcategory_id: "14",
      name: "Owner top-up — winter cashflow",
      price: 15000,
      paid_with_cash: 0,
      transaction_date: "2026-09-10",
    });
    expect(result).toEqual({ id: "900" });
  });

  it("sends paid_with_cash 1 when the switch is on", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    await createEquityApi({ ...BASE_DRAFT, paidWithCash: true }, null);
    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.paid_with_cash).toBe(1);
  });

  it("sends the attachment as a raw file beside the ciphertext when there is one", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    const file = new File(["bytes"], "deposit-slip.pdf", {
      type: "application/pdf",
    });

    await createEquityApi(BASE_DRAFT, file);

    const body = apiMock.post.mock.calls[0][1] as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("files[]")).toBe(file);
    expect(decryptedFieldsFromBody(body).name).toBe(BASE_DRAFT.name);
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Valid account_subcategory_id is required" },
    });
    await expect(createEquityApi(BASE_DRAFT, null)).rejects.toThrow(
      "Valid account_subcategory_id is required",
    );
  });
});

describe("updating an equity entry", () => {
  it("PUTs an encrypted body carrying both id and equity_id", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });

    await updateEquityApi("5", BASE_DRAFT, null);

    expect(apiMock.put).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.equity.update);
    const fields = decryptedFieldsFromBody(body);
    expect(fields.id).toBe("5");
    expect(fields.equity_id).toBe("5");
    expect(fields.account_subcategory_id).toBe("14");
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.put.mockResolvedValue({
      data: { success: false, message: "Equity not found: 999" },
    });
    await expect(updateEquityApi("999", BASE_DRAFT, null)).rejects.toThrow(
      "Equity not found: 999",
    );
  });
});

describe("deleting an equity entry", () => {
  it("DELETEs with an encrypted empty body carried as the `data` config option", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await deleteEquityApi("5");

    expect(apiMock.delete).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.delete.mock.calls[0];
    expect(url).toBe(`${apiRoutes.equity.delete}/5`);
    expect(decryptPayload(config.data.data)).toEqual({});
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.delete.mockResolvedValue({
      data: { success: false, message: "Something went wrong" },
    });
    await expect(deleteEquityApi("1")).rejects.toThrow("Something went wrong");
  });
});

describe("undoEquityMatchApi", () => {
  it("POSTs an encrypted {type, id} body — the same one endpoint for both a cash and a real-match undo", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await undoEquityMatchApi(equity({ id: "5" }));

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.equity.undoPaidWithCash);
    expect(decryptedFieldsFromBody(body)).toEqual({ type: "equity", id: "5" });
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Equity not found" },
    });
    await expect(undoEquityMatchApi(equity())).rejects.toThrow(
      "Equity not found",
    );
  });
});

describe("equityDirection", () => {
  it("reads Drawings as a debit, case-insensitively", () => {
    expect(equityDirection("Drawings")).toBe("Debit");
    expect(equityDirection("drawings")).toBe("Debit");
    expect(equityDirection("  Drawings  ")).toBe("Debit");
  });

  it("reads Owner Capital Input, and anything else, as a credit", () => {
    expect(equityDirection("Owner Capital Input")).toBe("Credit");
    expect(equityDirection("Some other subcategory")).toBe("Credit");
  });
});

describe("figures", () => {
  it("equityRemaining never goes below zero", () => {
    expect(equityRemaining(equity({ amount: 500, paidAmount: 700 }))).toBe(0);
    expect(equityRemaining(equity({ amount: 500, paidAmount: 200 }))).toBe(300);
  });

  it("formatEquityAmount and formatEquityRemaining read as currency, with an em dash once settled", () => {
    const partial = equity({ amount: 6500, paidAmount: 2000 });
    expect(formatEquityAmount(partial)).toBe("$6,500.00");
    expect(formatEquityRemaining(partial)).toBe("$4,500.00");
    expect(
      formatEquityRemaining(equity({ amount: 6500, paidAmount: 6500 })),
    ).toBe("—");
  });

  it("formatEquityDate reads the same as the rest of the platform's date formatting", () => {
    expect(formatEquityDate("2026-07-25")).toMatch(/2026/);
  });
});

describe("equityIssues", () => {
  it("flags a missing category, short name, non-positive amount and missing date", () => {
    const issues = equityIssues({
      ...emptyEquityDraft(""),
      name: "A",
      amount: 0,
    });
    expect(issues.map((issue) => issue.key)).toEqual(
      expect.arrayContaining(["category", "name", "amount", "date"]),
    );
  });

  it("rejects an amount of exactly zero — unlike a liability, equity requires strictly positive", () => {
    const issues = equityIssues({ ...BASE_DRAFT, amount: 0 });
    expect(issues.map((issue) => issue.key)).toContain("amount");
  });

  it("rejects a name over 120 characters", () => {
    const issues = equityIssues({ ...BASE_DRAFT, name: "a".repeat(121) });
    expect(issues.map((issue) => issue.key)).toContain("name");
  });

  it("is empty for a complete draft", () => {
    expect(equityIssues(BASE_DRAFT)).toEqual([]);
  });
});

describe("drafts", () => {
  it("emptyEquityDraft seeds today's date and blank fields", () => {
    expect(emptyEquityDraft("2026-09-10")).toEqual({
      date: "2026-09-10",
      name: "",
      categoryId: "",
      amount: 0,
      paidWithCash: false,
      attachment: null,
    });
  });

  it("equitySummaryLine reads the amount as currency", () => {
    expect(equitySummaryLine(BASE_DRAFT)).toBe("$15,000.00");
  });
});
