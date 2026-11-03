import { describe, expect, it, vi, beforeEach } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so the modules' own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const { buildQuotePayload, saveQuoteApi } = await import("@/lib/quote-submit");
const { emptyQuoteDraft } = await import("@/lib/quotes");

type QuoteDraft = ReturnType<typeof emptyQuoteDraft>;

const CONTEXT = {
  gstPercent: 10,
  gstEnabled: true,
  templateId: "13",
  exchangeRate: null as number | null,
  files: [] as File[],
};

/**
 * Three real lines with a blank editing row in the middle — the shape that
 * makes the editor's positions and the sent positions disagree.
 */
function draft(over: Partial<QuoteDraft> = {}): QuoteDraft {
  return {
    ...emptyQuoteDraft("QUO-9", "2026-03-01"),
    clientId: "42",
    clientName: "Acme",
    description: "Fitout",
    items: [
      { id: "1", description: "Labour", quantity: "4", price: "95", discountPercent: "", gst: true },
      { id: "2", description: "", quantity: "", price: "", discountPercent: "", gst: false },
      { id: "3", description: "Materials", quantity: "1", price: "260", discountPercent: "", gst: true },
      { id: "4", description: "Paint", quantity: "2", price: "50", discountPercent: "", gst: false },
    ],
    ...over,
  };
}

function decrypted(body: unknown): Record<string, unknown> {
  return decryptPayload((body as { data: string }).data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("an items deposit", () => {
  it("renumbers the chosen lines against what is actually sent", () => {
    // Editor rows 2 and 3 are the 2nd and 3rd lines sent once row 1 (blank) drops.
    const payload = buildQuotePayload(
      draft({ deposit: { mode: "items", value: "", selectedItems: [2, 3] } }),
      "draft",
      CONTEXT,
    );

    expect(payload.item as unknown[]).toHaveLength(3);
    expect(payload).toMatchObject({
      payment_structure: "deposit_balance",
      is_deposit: 1,
      deposit_type: "fixed",
      deposit_selection_type: "select_items",
      deposit_selected_items: [1, 2],
      // Materials 260 + 10% GST, plus Paint 100 GST-free — summed on the editor's own rows.
      deposit_value: 386,
      deposit_value_currency: "AUD",
      exchange_deposit_value: null,
    });
  });

  it("drops a chosen row that isn't sent rather than pointing at its neighbour", () => {
    const payload = buildQuotePayload(
      draft({ deposit: { mode: "items", value: "", selectedItems: [1, 3] } }),
      "draft",
      CONTEXT,
    );
    expect(payload.deposit_selected_items).toEqual([2]);
  });

  it("carries the deposit's own due date", () => {
    const payload = buildQuotePayload(
      draft({ deposit: { mode: "percent", value: "20", dueDate: "2026-03-04" } }),
      "draft",
      CONTEXT,
    );
    expect(payload.deposit_due_date).toBe("2026-03-04");
    expect(payload.deposit_selected_items).toEqual([]);
  });
});

describe("a converting quote with no rate yet", () => {
  const foreign = {
    convertCurrency: true,
    currency: "NZD" as QuoteDraft["currency"],
    rateEdited: true,
  };

  it("still labels the currency but adds none of the rate fields", () => {
    const payload = buildQuotePayload(draft(foreign), "draft", {
      ...CONTEXT,
      exchangeRate: null,
    });

    expect(payload.currency_code).toBe("NZD");
    expect(payload.is_multicurrency).toBe(1);
    expect(payload).not.toHaveProperty("exchange_rate");
    expect(payload).not.toHaveProperty("total_after_exchange");
    expect(payload).not.toHaveProperty("is_exchange_rate_edited");
    // Without a rate the document figures are the AUD ones.
    expect(payload.exchange_total).toBe(payload.total);
  });

  it("adds the rate fields once a rate is known", () => {
    const payload = buildQuotePayload(draft(foreign), "draft", {
      ...CONTEXT,
      exchangeRate: 1.0912345,
    });
    expect(payload.exchange_rate).toBe(1.09);
    expect(payload.total_after_exchange).toBe(payload.exchange_total);
    expect(payload.is_exchange_rate_edited).toBe(1);
  });

  it("treats a currency of AUD with conversion on as no conversion at all", () => {
    const payload = buildQuotePayload(
      draft({ convertCurrency: true, currency: "AUD" }),
      "draft",
      { ...CONTEXT, exchangeRate: 2 },
    );
    expect(payload).toMatchObject({
      currency_code: "AUD",
      is_multicurrency: 0,
      exchange_total: 0,
      exchange_sub_total: 0,
    });
    expect(payload).not.toHaveProperty("exchange_rate");
  });
});

describe("modes on an existing quote", () => {
  it("keeps the id alongside the send and print flags", () => {
    const send = buildQuotePayload(draft(), "send", { ...CONTEXT, quoteId: "77" });
    expect(send).toMatchObject({ id: "77", save: 1, send: 1 });

    const print = buildQuotePayload(draft(), "print", { ...CONTEXT, quoteId: "77" });
    expect(print).toMatchObject({ id: "77", save: 1, send: 2 });
  });

  it("PUTs a send to the quote's own URL with the flags inside the ciphertext", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });

    const saved = await saveQuoteApi(draft(), "send", { ...CONTEXT, quoteId: "77" });

    expect(saved).toEqual({ id: "77" });
    expect(apiMock.post).not.toHaveBeenCalled();
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(`${apiRoutes.quote.update}77`);
    expect(decrypted(body)).toMatchObject({ id: "77", save: 1, send: 1 });
  });

  it("uses its own fallback message when an update is refused without one", async () => {
    apiMock.put.mockResolvedValue({ data: { success: false } });
    await expect(
      saveQuoteApi(draft(), "print", { ...CONTEXT, quoteId: "77" }),
    ).rejects.toThrow("Couldn't save that quote.");
  });
});

describe("a quote for no client yet", () => {
  it("sends a blank client id rather than null", () => {
    const payload = buildQuotePayload(draft({ clientId: null }), "draft", CONTEXT);
    expect(payload.client_id).toBe("");
  });
});
