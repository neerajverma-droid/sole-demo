import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import {
  EMPTY_QUOTE_FILTERS,
  activeQuoteFilterCount,
  resolveQuoteFilters,
} from "@/components/quotes/quotes-filters";
import { fetchQuoteStatusCounts, fetchQuotesPage } from "@/lib/quotes";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

beforeEach(() => {
  apiMock.get.mockReset();
});

describe("activeQuoteFilterCount", () => {
  it("is zero for the empty draft", () => {
    expect(activeQuoteFilterCount(EMPTY_QUOTE_FILTERS)).toBe(0);
  });

  it("counts each range once, plus sent, type and a client selection", () => {
    expect(
      activeQuoteFilterCount({
        issuedFrom: "2026-01-01",
        issuedTo: "2026-01-31",
        minTotal: "",
        maxTotal: "500",
        sent: "not_sent",
        type: "ndis",
        clientIds: ["1", "2"],
      }),
    ).toBe(5);
  });
});

describe("resolveQuoteFilters", () => {
  it("drops blanks and 'any', and parses amounts", () => {
    expect(
      resolveQuoteFilters({
        ...EMPTY_QUOTE_FILTERS,
        minTotal: "10.5",
        maxTotal: "abc",
        type: "general",
      }),
    ).toEqual({
      issuedFrom: undefined,
      issuedTo: undefined,
      minTotal: 10.5,
      maxTotal: undefined,
      sent: undefined,
      type: "general",
    });
  });
});

describe("fetchQuotesPage", () => {
  it("asks for one page, with the tab as display_status and every filter as filter_by", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { quote_details: [{ quote_id: 7, quote_no: "QUO-7" }], total: 31 },
      },
    });

    const page = await fetchQuotesPage(2, 25, {
      status: "Saved",
      search: "  roof ",
      issuedFrom: "2026-01-01",
      issuedTo: "2026-03-31",
      minTotal: 0,
      maxTotal: 900,
      sent: "not_sent",
      type: "ndis",
      clientIds: ["4", "9"],
    });

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.quote.list, {
      params: {
        page: 2,
        page_size: 25,
        "sort_by[quote_id]": "desc",
        "filter_by[display_status]": "saved",
        "filter_by[search]": "roof",
        "filter_by[start_date]": "2026-01-01",
        "filter_by[end_date]": "2026-03-31",
        "filter_by[min_price]": 0,
        "filter_by[max_price]": 900,
        "filter_by[sent_status]": 0,
        "filter_by[type]": "ndis",
        "filter_by[client_id][1]": "4",
        "filter_by[client_id][2]": "9",
      },
    });
    expect(page.total).toBe(31);
    expect(page.quotes.map((quote) => quote.number)).toEqual(["QUO-7"]);
  });

  it("sends no status for the All tab", async () => {
    apiMock.get.mockResolvedValue({ data: { data: {} } });
    await fetchQuotesPage(1, 25, { status: "All" });
    expect(apiMock.get.mock.calls[0][1].params).toEqual({
      page: 1,
      page_size: 25,
      "sort_by[quote_id]": "desc",
    });
  });
});

describe("fetchQuoteStatusCounts", () => {
  it("maps the server's lower-case keys onto every tab, zero for anything missing", async () => {
    apiMock.get.mockResolvedValue({
      data: { data: { all: 12, draft: 2, sent: 3, saved: 1, converted: 4 } },
    });

    const counts = await fetchQuoteStatusCounts(["5"]);

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.quote.statusCounts, {
      params: { "filter_by[client_id][1]": "5" },
    });
    expect(counts).toEqual({
      All: 12,
      Draft: 2,
      Sent: 3,
      Saved: 1,
      Accepted: 0,
      Converted: 4,
      Declined: 0,
      Expired: 0,
    });
  });
});
