import { describe, expect, it, vi, beforeEach } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";

/*
 * Companion to lib/equity.test.ts: the branches that file doesn't reach
 * (docs/testing-liabilities-equity.md → Gaps). Same harness as the original.
 */
const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

const {
  fetchEquityPage,
  fetchEquitySubcategories,
  fetchEquityDetail,
  createEquityApi,
  updateEquityApi,
  deleteEquityApi,
  undoEquityMatchApi,
  equityIssues,
} = await import("@/lib/equity");

import type { Equity, EquityDraft } from "@/lib/equity";

function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  if (body instanceof FormData) {
    const data = body.get("data");
    if (typeof data !== "string") throw new Error("FormData had no 'data' field");
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

function equity(overrides: Partial<Equity> = {}): Equity {
  return {
    id: "1",
    date: "2026-09-10",
    name: "Owner top-up",
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
  name: "Owner top-up",
  categoryId: "14",
  amount: 15000,
  paidWithCash: false,
  attachment: null,
};

describe("fetchEquityPage — empty and sparse replies", () => {
  it("resolves an empty page when the reply has no rows at all", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });

    expect(await fetchEquityPage(1, 25)).toEqual({ equity: [], total: 0 });
    expect(apiMock.get.mock.calls[0][0]).toBe(apiRoutes.equity.list);
  });

  it("leaves the date blank when neither transaction_date nor created_at is sent, and possible_match defaults to 0", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { rows: [{ id: 4, price: "200" }] } },
    });

    const [row] = (await fetchEquityPage(1, 25)).equity;

    expect(row).toMatchObject({
      id: "4",
      date: "",
      name: "",
      category: "",
      amount: 200,
      paidAmount: 0,
      paidWithCash: false,
      status: "Pending",
      possibleMatch: 0,
    });
  });

  it("treats any non-'0' string flag as true — including the string 'false'", async () => {
    // Documented quirk of the internal parseFlag (`!!value && value !== "0"`).
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          rows: [
            { id: 1, price: 1, paid_with_cash: "false" },
            { id: 2, price: 1, paid_with_cash: "0" },
          ],
        },
      },
    });

    const rows = (await fetchEquityPage(1, 25)).equity;
    expect(rows.map((r) => r.paidWithCash)).toEqual([true, false]);
  });
});

describe("fetchEquitySubcategories — nested payloads", () => {
  it.each([
    ["data.rows", { success: true, data: { rows: [{ account_subcategory_id: 14, account_subcategory_name: "Drawings" }] } }],
    ["data.data", { success: true, data: { data: [{ account_subcategory_id: 14, account_subcategory_name: "Drawings" }] } }],
    ["a bare data array", { success: true, data: [{ id: 14, name: "Drawings" }] }],
  ])("unwraps a list nested under %s", async (_label, payload) => {
    apiMock.get.mockResolvedValue({ data: payload });

    expect(await fetchEquitySubcategories()).toEqual([{ id: "14", name: "Drawings" }]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.equity.subcategoryList);
  });

  it("resolves [] for a payload that isn't a list in any known shape", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { count: 3 } } });
    expect(await fetchEquitySubcategories()).toEqual([]);
  });
});

describe("fetchEquityDetail — fallbacks", () => {
  it("returns a blank date when transaction_date is missing, and the category from account_subcategory.id", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { id: 3, name: "Drawings — Sept", price: "800", account_subcategory: { id: 14 } },
      },
    });

    const detail = await fetchEquityDetail("3");

    expect(detail).toEqual({
      date: "",
      name: "Drawings — Sept",
      categoryId: "14",
      amount: 800,
      paidWithCash: false,
      attachment: null,
      documents: [],
    });
  });

  it("maps documents through the same id/name/url fallbacks as liabilities", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 3,
          transaction_date: "2026-09-01T00:00:00Z",
          documents: [{ name: "orphan.pdf" }, { id: 5, url: "https://cdn.test/r.pdf" }],
        },
      },
    });

    const detail = await fetchEquityDetail("3");

    expect(detail.date).toBe("2026-09-01");
    expect(detail.documents).toEqual([
      { id: "5", name: "Attachment", url: "https://cdn.test/r.pdf" },
    ]);
    expect(detail.attachment).toEqual({
      dataUrl: "https://cdn.test/r.pdf",
      name: "Attachment",
      size: 0,
    });
  });
});

describe("updateEquityApi with a file", () => {
  it("sends FormData with the file under files[] and id/equity_id in the ciphertext", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    const file = new File(["bytes"], "receipt.png", { type: "image/png" });

    await updateEquityApi("8", { ...BASE_DRAFT, paidWithCash: true }, file);

    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.equity.update);
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).getAll("files[]")).toEqual([file]);
    const fields = decryptedFieldsFromBody(body);
    expect(fields).toMatchObject({
      id: "8",
      equity_id: "8",
      price: 15000,
      paid_with_cash: 1,
      transaction_date: "2026-09-10",
    });
    expect(fields).not.toHaveProperty("liability_id");
  });
});

describe("createEquityApi — reply without an id", () => {
  it("resolves { id: '' } rather than throwing", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await expect(createEquityApi(BASE_DRAFT, null)).resolves.toEqual({ id: "" });
  });
});

describe("fallback error messages when the server sends none", () => {
  const failure = { data: { success: false } };

  it.each([
    ["createEquityApi", "post", () => createEquityApi(BASE_DRAFT, null), "Failed to create equity entry."],
    ["updateEquityApi", "put", () => updateEquityApi("1", BASE_DRAFT, null), "Failed to save equity entry."],
    ["deleteEquityApi", "delete", () => deleteEquityApi("1"), "Failed to delete equity entry."],
    ["undoEquityMatchApi", "post", () => undoEquityMatchApi(equity()), "Failed to undo the match."],
  ] as const)("%s (%s) falls back to its default message", async (_name, verb, call, message) => {
    apiMock[verb].mockResolvedValue(failure);
    await expect(call()).rejects.toThrow(message);
  });
});

describe("equityIssues — messages and order", () => {
  it("lists category, name, amount, date in that order with their messages", () => {
    expect(
      equityIssues({ ...BASE_DRAFT, categoryId: "", name: "", amount: 0, date: "" }),
    ).toEqual([
      { key: "category", message: "Choose a category." },
      { key: "name", message: "Equity name must be 2–120 characters." },
      { key: "amount", message: "Enter an amount over $0." },
      { key: "date", message: "Choose a date." },
    ]);
  });

  it("rejects NaN and negative amounts as well as zero", () => {
    for (const amount of [Number.NaN, -1]) {
      expect(equityIssues({ ...BASE_DRAFT, amount })).toEqual([
        { key: "amount", message: "Enter an amount over $0." },
      ]);
    }
    expect(equityIssues({ ...BASE_DRAFT, amount: 0.01 })).toEqual([]);
  });
});
