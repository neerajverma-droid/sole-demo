import { describe, expect, it, vi, beforeEach } from "vitest";

import apiRoutes from "@/config/api-routes";

const apiMock = { get: vi.fn() };

vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

// Imported after the mock so the module's own axios import resolves to it.
const { fetchReceiptAddress } = await import("@/lib/email-receipts");

describe("fetchReceiptAddress", () => {
  // Braces matter: a hook that returns a function is run again as its teardown.
  beforeEach(() => {
    apiMock.get.mockReset();
  });

  it("reads the address from the receipt-address endpoint", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, receiptEmail: " sole-1@receipts.getsole.ai " },
    });

    await expect(fetchReceiptAddress()).resolves.toBe(
      "sole-1@receipts.getsole.ai",
    );
    expect(apiMock.get).toHaveBeenCalledWith(
      apiRoutes.inboundEmail.receiptAddress,
    );
  });

  it("throws the server's message when the call reports failure", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: false, message: "Business not found" },
    });

    await expect(fetchReceiptAddress()).rejects.toThrow("Business not found");
  });

  it("throws a plain message when success comes back without an address", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });

    await expect(fetchReceiptAddress()).rejects.toThrow(
      "Could not load your receipt address.",
    );
  });

  it("throws when the server reports failure even if an address is present", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: false, receiptEmail: "sole-1@receipts.getsole.ai" },
    });

    await expect(fetchReceiptAddress()).rejects.toThrow(
      "Could not load your receipt address.",
    );
  });

  it("rejects a blank address rather than showing an empty field", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, receiptEmail: "   " },
    });

    await expect(fetchReceiptAddress()).rejects.toThrow(
      "Could not load your receipt address.",
    );
  });

  it("lets a network or HTTP error reach the caller untouched", async () => {
    const failure = new Error("Network Error");
    apiMock.get.mockRejectedValue(failure);

    await expect(fetchReceiptAddress()).rejects.toBe(failure);
  });
});

describe("receipt address route contract", () => {
  it("points at the backend's GET /inbound-email/receipt-address", () => {
    // sole-ocr mounts the router at /api/inbound-email and serves
    // GET /receipt-address on it; business_id is stamped by the axios client.
    expect(apiRoutes.inboundEmail.receiptAddress).toMatch(
      /\/api\/inbound-email\/receipt-address$|\/inbound-email\/receipt-address$/,
    );
    expect(apiRoutes.inboundEmail.receiptAddress).not.toContain("business_id");
  });
});
