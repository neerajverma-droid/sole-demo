import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/utils/axiosInstance", () => ({
  default: { get: (...args: unknown[]) => get(...args) },
}));

import apiRoutes from "@/config/api-routes";
import { lookupBusiness } from "@/lib/business-lookup";

beforeEach(() => {
  get.mockReset();
});

/** An axios error, as the interceptor hands one back. */
function httpError(status: number, message?: string) {
  return Object.assign(new Error("request failed"), {
    response: { status, data: message ? { message } : undefined },
  });
}

describe("lookupBusiness", () => {
  it("asks sole-ocr, never the register directly", async () => {
    // The ABR call carries a registered GUID and the NZBN gateway a
    // subscription key; either one in the browser is a leaked credential.
    get.mockResolvedValue({ data: { success: true, data: { name: "Acme" } } });

    await lookupBusiness("51824753556", "au");

    expect(get).toHaveBeenCalledWith(apiRoutes.country.lookup, {
      params: { value: "51824753556", country: "AU" },
    });
  });

  it("sends the country explicitly, not the business's own", async () => {
    // Onboarding picks the country on the same screen, so the business is
    // still on the default one while this runs.
    get.mockResolvedValue({ data: { success: true, data: { name: "Kiwi Co" } } });
    await lookupBusiness("9429038053894", "NZ");
    expect(get.mock.calls[0][1].params.country).toBe("NZ");
  });

  it("normalises the record both registers come back as", async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: {
          identifier: "51824753556",
          name: "ACME PTY LTD",
          trading_name: "Acme",
          entity_type: "Australian Private Company",
          status: "Active",
          tax_registered: true,
          region: "VIC",
          postcode: "3000",
        },
      },
    });

    const result = await lookupBusiness("51824753556", "AU");
    expect(result).toEqual({
      ok: true,
      record: {
        identifier: "51824753556",
        name: "ACME PTY LTD",
        tradingName: "Acme",
        entityType: "Australian Private Company",
        status: "Active",
        taxRegistered: true,
        region: "VIC",
        postcode: "3000",
      },
    });
  });

  it("keeps an unpublished GST status as undefined, not false", async () => {
    // "The register didn't say" and "not registered" are different facts, and
    // the caller falls back to a default on the first but not the second.
    get.mockResolvedValue({ data: { success: true, data: { name: "Acme" } } });
    const result = await lookupBusiness("1", "NZ");
    expect(result.ok && result.record.taxRegistered).toBeUndefined();
  });

  it("drops empty optional fields rather than passing blank strings on", async () => {
    get.mockResolvedValue({
      data: { success: true, data: { name: "Acme", trading_name: "  " } },
    });
    const result = await lookupBusiness("1", "AU");
    expect(result.ok && result.record.tradingName).toBeUndefined();
  });

  it("reports a response with no name as no match", async () => {
    get.mockResolvedValue({ data: { success: true, data: {} } });
    await expect(lookupBusiness("1", "AU")).resolves.toEqual({
      ok: false,
      message: "No match in the business register.",
    });
  });

  it("turns a 404 into no match", async () => {
    get.mockRejectedValue(httpError(404));
    const result = await lookupBusiness("1", "AU");
    expect(result).toEqual({
      ok: false,
      message: "No match in the business register.",
    });
  });

  it("prefers the backend's own message when it sends one", async () => {
    get.mockRejectedValue(
      httpError(404, "No match in the New Zealand business register."),
    );
    const result = await lookupBusiness("1", "NZ");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/New Zealand/);
  });

  it("never throws, whatever the register does", async () => {
    // A failed lookup must not stop someone signing up — every field it would
    // have filled is typeable by hand.
    get.mockRejectedValue(httpError(500));
    await expect(lookupBusiness("1", "AU")).resolves.toEqual({
      ok: false,
      message: "The business register is unavailable right now.",
    });

    get.mockRejectedValue(new Error("network down"));
    await expect(lookupBusiness("1", "AU")).resolves.toMatchObject({
      ok: false,
    });
  });
});
