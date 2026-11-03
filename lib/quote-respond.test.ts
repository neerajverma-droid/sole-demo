import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

const clientMock = {
  apiGet: vi.fn(),
  apiPost: vi.fn(),
};

vi.mock("@/lib/api/client", () => clientMock);

const {
  QUOTE_RESPOND_MESSAGES,
  acceptPublicQuote,
  fetchPublicQuote,
  formatQtyTypeLabel,
  formatQuoteDate,
  formatQuoteMoney,
  getConvertedAmount,
  getDepositRequestedAmount,
  getDisplayCurrencyCode,
  getQuoteDisplayTotal,
  normalizeQuoteItems,
  rejectPublicQuote,
  resolveViewState,
  validateRejection,
} = await import("@/lib/quote-respond");

const usdQuote = {
  is_multicurrency: 1,
  currency_code: "USD",
  exchange_rate: 0.65,
  total: 1000,
  exchange_total: 650,
};

describe("quote respond money", () => {
  it("keeps AUD quotes as stored", () => {
    const quote = { is_multicurrency: 0, currency_code: "AUD", total: 123.456, exchange_total: 99 };
    expect(getDisplayCurrencyCode(quote)).toBe("AUD");
    expect(getQuoteDisplayTotal(quote)).toBe(123.46);
  });

  it("treats a multicurrency flag on AUD as plain AUD", () => {
    expect(getDisplayCurrencyCode({ is_multicurrency: 1, currency_code: "AUD" })).toBe("AUD");
  });

  it("prefers the server's converted total, then the exchange rate", () => {
    expect(getDisplayCurrencyCode(usdQuote)).toBe("USD");
    expect(getQuoteDisplayTotal(usdQuote)).toBe(650);
    expect(getQuoteDisplayTotal({ ...usdQuote, exchange_total: 0, total_after_exchange: null })).toBe(650);
    expect(getConvertedAmount({ ...usdQuote, exchange_rate: 0 }, 10)).toBe(10);
  });

  it("works out the deposit requested", () => {
    expect(getDepositRequestedAmount({ is_deposit: 0, deposit_value: 50 })).toBe(0);
    expect(
      getDepositRequestedAmount({ is_deposit: 1, deposit_type: "percentage", deposit_value: 25, total: 400 }),
    ).toBe(100);
    expect(getDepositRequestedAmount({ is_deposit: 1, deposit_type: "fixed", deposit_value: 80 })).toBe(80);
    expect(
      getDepositRequestedAmount({ ...usdQuote, is_deposit: 1, deposit_type: "fixed", deposit_value: 100, exchange_deposit_value: 65 }),
    ).toBe(65);
    expect(
      getDepositRequestedAmount({ ...usdQuote, is_deposit: 1, deposit_type: "percentage", deposit_value: 10, exchange_deposit_value: null }),
    ).toBe(65);
  });

  it("formats money with the currency code leading", () => {
    expect(formatQuoteMoney("USD", 1234.5)).toBe("USD 1,234.50");
    expect(formatQuoteMoney(undefined, null)).toBe("AUD 0.00");
  });
});

describe("quote respond items", () => {
  it("normalises the summary's item shape, converting into the display currency", () => {
    const items = normalizeQuoteItems({
      ...usdQuote,
      items: [
        {
          quote_item_id: 7,
          description: "Logo design",
          price: 100,
          qty: 2,
          qty_type: "per_hour",
          gst: true,
          gst_amount: 20,
          total: 220,
          exchange_price: 65,
          exchange_gst_amount: 13,
          exchange_total: 143,
        },
      ],
    });
    expect(items).toEqual([
      { id: 7, name: "Logo design", qty: 2, rate: 65, qtyType: "per_hour", gst: 13, total: 143 },
    ]);
  });

  it("falls back through alternative lists and field names", () => {
    const items = normalizeQuoteItems({
      line_items: [{ item_name: "Widget", unit_price: 5, quantity: 3, amount: 15 }, {}],
    });
    expect(items[0]).toMatchObject({ id: 0, name: "Widget", rate: 5, qty: 3, total: 15, gst: 0, qtyType: "items" });
    expect(items[1]).toMatchObject({ id: 1, name: "Item 2", qty: 0, rate: 0 });
  });

  it("never reads the has-GST flag as an amount", () => {
    expect(normalizeQuoteItems({ items: [{ gst: true }] })[0].gst).toBe(0);
  });

  it("labels qty types", () => {
    expect(formatQtyTypeLabel("per_hour")).toBe("Per Hour");
    expect(formatQtyTypeLabel("")).toBe("Items");
  });
});

describe("quote respond dates and state", () => {
  it("formats date-only strings without a timezone shift", () => {
    expect(formatQuoteDate("2026-01-01")).toBe("01 Jan 2026");
    expect(formatQuoteDate("2026-10-07T00:00:00.000Z")).toBe("07 Oct 2026");
    expect(formatQuoteDate(null)).toBe("—");
    expect(formatQuoteDate("not a date")).toBe("—");
  });

  it("reads unknown states as pending", () => {
    expect(resolveViewState({ view_state: "expired" })).toBe("expired");
    expect(resolveViewState({ view_state: "weird" })).toBe("pending");
    expect(resolveViewState(null)).toBe("pending");
  });

  it("validates the reject form as respond.js does", () => {
    expect(validateRejection("", "")).toBe(QUOTE_RESPOND_MESSAGES.reasonRequired);
    expect(validateRejection("Other", "  ")).toBe(QUOTE_RESPOND_MESSAGES.otherTextRequired);
    expect(validateRejection("Other", "Too slow")).toBeNull();
    expect(validateRejection("Price too high", "")).toBeNull();
  });
});

describe("quote respond calls", () => {
  beforeEach(() => {
    clientMock.apiGet.mockReset();
    clientMock.apiPost.mockReset();
  });

  it("fetches publicly by token and surfaces the server's message", async () => {
    clientMock.apiGet.mockResolvedValueOnce({ success: true, status: 200, data: { quote_no: "Q-1" } });
    await expect(fetchPublicQuote("abc")).resolves.toEqual({ quote_no: "Q-1" });
    expect(clientMock.apiGet).toHaveBeenCalledWith(apiRoutes.quote.publicRespond, {
      auth: "public",
      params: { token: "abc" },
    });

    clientMock.apiGet.mockResolvedValueOnce({ success: false, status: 404, message: "Invalid or expired quote response link" });
    await expect(fetchPublicQuote("abc")).rejects.toThrow("Invalid or expired quote response link");
  });

  it("sends accept and reject as encrypted bodies", async () => {
    clientMock.apiPost.mockResolvedValue({ success: true, status: 200, data: { status: "accepted" } });

    await acceptPublicQuote("tok");
    const [acceptUrl, acceptBody, acceptOptions] = clientMock.apiPost.mock.calls[0];
    expect(acceptUrl).toBe(apiRoutes.quote.publicRespondAccept);
    expect(acceptOptions).toEqual({ auth: "public" });
    expect(decryptPayload(acceptBody.data)).toEqual({ token: "tok" });

    await rejectPublicQuote({ token: "tok", reasonCategory: "Other", reasonText: "  Too slow  " });
    const [rejectUrl, rejectBody] = clientMock.apiPost.mock.calls[1];
    expect(rejectUrl).toBe(apiRoutes.quote.publicRespondReject);
    expect(decryptPayload(rejectBody.data)).toEqual({
      token: "tok",
      reason_category: "Other",
      reason_text: "Too slow",
    });
  });

  it("throws the server's message when a response is refused", async () => {
    clientMock.apiPost.mockResolvedValueOnce({ success: false, status: 400, message: "This quote has already been responded to" });
    await expect(acceptPublicQuote("tok")).rejects.toThrow("This quote has already been responded to");

    clientMock.apiPost.mockResolvedValueOnce({ success: false, status: 0 });
    await expect(
      rejectPublicQuote({ token: "tok", reasonCategory: "Price too high", reasonText: "" }),
    ).rejects.toThrow(QUOTE_RESPOND_MESSAGES.rejectFailed);
  });
});
