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

// Imported after the mock so `lib/vendor-refunds.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  fetchVendorRefundsPage,
  fetchVendorRefundsSummary,
  vendorRefundPeriodRange,
  vendorRefundsNarrowed,
} = await import("@/lib/vendor-refunds");

const TODAY = "2026-03-15";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("vendorRefundPeriodRange", () => {
  it("spans the whole calendar month for 'This month'", () => {
    expect(vendorRefundPeriodRange("This month", TODAY)).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    });
  });

  it("handles a short month correctly", () => {
    expect(vendorRefundPeriodRange("This month", "2026-02-10")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("spans the whole calendar year for 'This year'", () => {
    expect(vendorRefundPeriodRange("This year", TODAY)).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });
});

describe("fetchVendorRefundsPage", () => {
  it("always scopes the request to this user, the vendor side of the endpoint, and the page/limit", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchVendorRefundsPage(2, 25, "All status", 493, undefined, "This year", TODAY);

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.creditNote.list);
    expect(config.params).toEqual({
      user_id: "493",
      type: "vendor",
      from_date: "2026-01-01",
      to_date: "2026-12-31",
      page: "2",
      limit: "25",
    });
  });

  it("omits the status param for 'All status' rather than sending status=all", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchVendorRefundsPage(1, 25, "All status", 493, undefined, "This year", TODAY);

    const [, config] = apiMock.get.mock.calls[0];
    expect(config.params).not.toHaveProperty("status");
  });

  it("maps 'Awaiting' and 'Refunded' to the server's own status values", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchVendorRefundsPage(1, 25, "Awaiting", 493, undefined, "This year", TODAY);
    expect(apiMock.get.mock.calls[0][1].params.status).toBe("issued");

    await fetchVendorRefundsPage(1, 25, "Refunded", 493, undefined, "This year", TODAY);
    expect(apiMock.get.mock.calls[1][1].params.status).toBe("refunded");
  });

  it("sends a trimmed search param only when one is given", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchVendorRefundsPage(1, 25, "All status", 493, "  VRN-0002  ", "This year", TODAY);
    expect(apiMock.get.mock.calls[0][1].params.search).toBe("VRN-0002");

    await fetchVendorRefundsPage(1, 25, "All status", 493, "", "This year", TODAY);
    expect(apiMock.get.mock.calls[1][1].params).not.toHaveProperty("search");

    await fetchVendorRefundsPage(1, 25, "All status", 493, "   ", "This year", TODAY);
    expect(apiMock.get.mock.calls[2][1].params).not.toHaveProperty("search");

    await fetchVendorRefundsPage(1, 25, "All status", 493, undefined, "This year", TODAY);
    expect(apiMock.get.mock.calls[3][1].params).not.toHaveProperty("search");
  });

  it("reads the total from the pagination envelope, falling back to the row count", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, data: [], pagination: { total: 42 } },
    });
    const withTotal = await fetchVendorRefundsPage(1, 25, "All status", 493, undefined, "This year", TODAY);
    expect(withTotal.total).toBe(42);

    apiMock.get.mockResolvedValueOnce({
      data: { success: true, data: [{ id: 1, credit_note_no: "VRN-1", credit_note_date: "2026-03-01", type: "vendor", total: 10, gst_amount: 0, reason: "Other", status: "issued", has_complete_bank_info: false }] },
    });
    const withoutTotal = await fetchVendorRefundsPage(1, 25, "All status", 493, undefined, "This year", TODAY);
    expect(withoutTotal.total).toBe(1);
  });

  it("derives 'Vendor refund' vs 'Credit note' from has_complete_bank_info, not the server's own type", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            credit_note_no: "VRN-0001",
            credit_note_date: "2026-03-01",
            type: "vendor",
            total: 110,
            gst_amount: 10,
            reason: "Returned stock",
            status: "issued",
            has_complete_bank_info: true,
            client: {
              business_name: "Timber & Co",
              account_holder: "Timber Co Pty Ltd",
              bsb: "083-004",
              account_number: "12345678",
            },
          },
          {
            id: 2,
            credit_note_no: "VRN-0002",
            credit_note_date: "2026-03-02",
            type: "vendor",
            total: 55,
            gst_amount: 5,
            reason: "Billing adjustment",
            status: "refunded",
            has_complete_bank_info: false,
            client: { name: "Supplies Direct" },
          },
        ],
        pagination: { total: 2 },
      },
    });

    const { refunds } = await fetchVendorRefundsPage(1, 25, "All status", 493, undefined, "This year", TODAY);

    expect(refunds[0]).toMatchObject({
      id: "1",
      reference: "VRN-0001",
      type: "Vendor refund",
      status: "Awaiting",
      supplierName: "Timber & Co",
      bank: {
        accountName: "Timber Co Pty Ltd",
        bsb: "083-004",
        accountNumber: "12345678",
      },
    });

    expect(refunds[1]).toMatchObject({
      id: "2",
      reference: "VRN-0002",
      type: "Credit note",
      status: "Refunded",
      supplierName: "Supplies Direct",
      bank: null,
    });
  });

  it("maps the supplier's contact id from client.id, so the table can match a live Contacts entry", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            credit_note_no: "CR-2",
            credit_note_date: "2026-09-09",
            type: "vendor",
            total: "1620.00",
            gst_amount: "0.00",
            reason: "Refund",
            status: "refunded",
            has_complete_bank_info: true,
            client: {
              id: 44231,
              name: "Emma Williams",
              business_name: "Williams Health Services",
              bsb: "013456",
              account_number: "456123789",
              account_holder: "Emma Williams",
              bank_name: "ANZ Bank",
            },
          },
          {
            id: 2,
            credit_note_no: "CR-1",
            credit_note_date: "2026-09-09",
            type: "vendor",
            total: "51.00",
            gst_amount: "0.00",
            reason: "Refund",
            status: "refunded",
            has_complete_bank_info: false,
            client: null,
          },
        ],
      },
    });

    const { refunds } = await fetchVendorRefundsPage(1, 25, "All status", 493, undefined, "This year", TODAY);

    expect(refunds[0].supplierId).toBe("44231");
    // No client on the row at all — nothing to match a contact by.
    expect(refunds[1].supplierId).toBeNull();
  });

  it("matches a known reason case-insensitively, and buckets anything else as Other", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            credit_note_no: "VRN-0001",
            credit_note_date: "2026-03-01",
            type: "vendor",
            total: 100,
            gst_amount: 0,
            reason: "returned stock",
            status: "issued",
            has_complete_bank_info: false,
          },
          {
            id: 2,
            credit_note_no: "VRN-0002",
            credit_note_date: "2026-03-02",
            type: "vendor",
            total: 100,
            gst_amount: 0,
            reason: "Freight damaged in transit",
            status: "issued",
            has_complete_bank_info: false,
          },
        ],
      },
    });

    const { refunds } = await fetchVendorRefundsPage(1, 25, "All status", 493, undefined, "This year", TODAY);

    expect(refunds[0].reason).toBe("Returned stock");
    expect(refunds[0].reasonOther).toBe("");

    expect(refunds[1].reason).toBe("Other");
    expect(refunds[1].reasonOther).toBe("Freight damaged in transit");
  });

  it("treats any status other than 'refunded' as Awaiting, same fail-open reasoning as the reference", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            credit_note_no: "VRN-0001",
            credit_note_date: "2026-03-01",
            type: "vendor",
            total: 100,
            gst_amount: 0,
            reason: "Returned stock",
            status: "draft",
            has_complete_bank_info: false,
          },
        ],
      },
    });

    const { refunds } = await fetchVendorRefundsPage(1, 25, "All status", 493, undefined, "This year", TODAY);
    expect(refunds[0].status).toBe("Awaiting");
  });
});

describe("fetchVendorRefundsSummary", () => {
  it("asks for a generously large single page rather than the table's own page size", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchVendorRefundsSummary("All status", 493, undefined, "This year", TODAY);

    const [, config] = apiMock.get.mock.calls[0];
    expect(config.params.page).toBe("1");
    expect(Number(config.params.limit)).toBeGreaterThanOrEqual(500);
  });

  it("returns just the refunds, not the pagination envelope", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            credit_note_no: "VRN-0001",
            credit_note_date: "2026-03-01",
            type: "vendor",
            total: 100,
            gst_amount: 0,
            reason: "Returned stock",
            status: "issued",
            has_complete_bank_info: false,
          },
        ],
        pagination: { total: 1 },
      },
    });

    const result = await fetchVendorRefundsSummary("All status", 493, undefined, "This year", TODAY);
    expect(result).toEqual([
      expect.objectContaining({ id: "1", reference: "VRN-0001" }),
    ]);
  });
});

describe("vendorRefundsNarrowed", () => {
  it("is false when neither the search nor the status filter is set", () => {
    expect(vendorRefundsNarrowed({ query: "", status: "All status" })).toBe(false);
  });

  it("is false for a whitespace-only search", () => {
    expect(vendorRefundsNarrowed({ query: "   ", status: "All status" })).toBe(false);
  });

  it("is true once a search term is entered", () => {
    expect(vendorRefundsNarrowed({ query: "vrn", status: "All status" })).toBe(true);
  });

  it("is true once the status filter narrows from 'All status'", () => {
    expect(vendorRefundsNarrowed({ query: "", status: "Refunded" })).toBe(true);
  });
});
