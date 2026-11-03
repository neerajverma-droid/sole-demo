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

// Imported after the mock so `lib/invoice-context.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  DEFAULT_PAYMENT_RAILS,
  DEFAULT_TAX_SETTINGS,
  fetchExchangeRates,
  fetchInvoiceBranding,
  fetchInvoiceEmail,
  fetchInvoicePaymentRails,
  fetchInvoiceTaxSettings,
  fetchNextInvoiceNumber,
  quoteTemplateIdFor,
  templateIdFor,
  updateSolePaySettingsApi,
} = await import("@/lib/invoice-context");

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ *
 * Branding
 * ------------------------------------------------------------------ */

describe("fetchInvoiceBranding", () => {
  it("reads each layout id off the branding settings as a string", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoice_template: 4,
          ndis_template: "6",
          quote_template: 14,
          ndis_quote_template: 26,
          invoice_note: "Thanks for your business",
        },
      },
    });

    const branding = await fetchInvoiceBranding();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.settings.getBranding);
    expect(branding).toEqual({
      invoiceTemplateId: "4",
      ndisTemplateId: "6",
      quoteTemplateId: "14",
      ndisQuoteTemplateId: "26",
      invoiceNote: "Thanks for your business",
    });
  });

  it("falls back to sole-webapp's own layout ids for any falsy id, 0 included", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          invoice_template: 0,
          ndis_template: null,
          quote_template: "",
          invoice_note: null,
        },
      },
    });

    expect(await fetchInvoiceBranding()).toEqual({
      invoiceTemplateId: "1",
      ndisTemplateId: "2",
      quoteTemplateId: "13",
      ndisQuoteTemplateId: "25",
      invoiceNote: "",
    });
  });
});

describe("templateIdFor / quoteTemplateIdFor", () => {
  const branding = {
    invoiceTemplateId: "4",
    ndisTemplateId: "6",
    quoteTemplateId: "14",
    ndisQuoteTemplateId: "26",
    invoiceNote: "",
  };

  it("picks the NDIS or general layout off the branding record", () => {
    expect(templateIdFor(branding, false)).toBe("4");
    expect(templateIdFor(branding, true)).toBe("6");
    expect(quoteTemplateIdFor(branding)).toBe("14");
    expect(quoteTemplateIdFor(branding, true)).toBe("26");
  });

  it("uses the default ids while branding hasn't loaded", () => {
    expect(templateIdFor(undefined, false)).toBe("1");
    expect(templateIdFor(undefined, true)).toBe("2");
    expect(quoteTemplateIdFor(undefined)).toBe("13");
    expect(quoteTemplateIdFor(undefined, true)).toBe("25");
  });
});

/* ------------------------------------------------------------------ *
 * Tax
 * ------------------------------------------------------------------ */

describe("fetchInvoiceTaxSettings", () => {
  it("reads a single tax_settings object", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { tax_settings: { tax_percentage: "15", is_default: 1 } },
      },
    });

    expect(await fetchInvoiceTaxSettings()).toEqual({
      gstPercent: 15,
      gstEnabled: true,
    });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.tax.getDetails);
  });

  it("takes the first entry when tax_settings comes back as a list", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          tax_settings: [
            { tax_percentage: 12, is_default: false },
            { tax_percentage: 99, is_default: true },
          ],
        },
      },
    });

    expect(await fetchInvoiceTaxSettings()).toEqual({
      gstPercent: 12,
      gstEnabled: false,
    });
  });

  it("falls back to 10% when the stored percentage is 0 or unreadable", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { tax_settings: { tax_percentage: 0 } } },
    });
    expect((await fetchInvoiceTaxSettings()).gstPercent).toBe(10);

    apiMock.get.mockResolvedValue({
      data: { success: true, data: { tax_settings: { tax_percentage: "n/a" } } },
    });
    expect((await fetchInvoiceTaxSettings()).gstPercent).toBe(10);
  });

  it("returns the defaults when there's no tax record at all (null, missing or an empty list)", async () => {
    for (const tax_settings of [null, undefined, []]) {
      apiMock.get.mockResolvedValue({
        data: { success: true, data: { tax_settings } },
      });
      expect(await fetchInvoiceTaxSettings()).toEqual(DEFAULT_TAX_SETTINGS);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Numbering, email, exchange rates
 * ------------------------------------------------------------------ */

describe("fetchNextInvoiceNumber", () => {
  it("returns the server's number and saved note", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { no: "INV-0031", note: "Pay within 7 days" } },
    });

    expect(await fetchNextInvoiceNumber()).toEqual({
      number: "INV-0031",
      note: "Pay within 7 days",
    });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.invoice.getNo);
  });

  it("blanks both fields when the server sends neither", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    expect(await fetchNextInvoiceNumber()).toEqual({ number: "", note: "" });
  });
});

describe("fetchInvoiceEmail", () => {
  it("reads invoice_email off the sequence-number settings", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { invoice_email: "accounts@acme.test" } },
    });

    expect(await fetchInvoiceEmail()).toBe("accounts@acme.test");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.settings.getSeqNumber);
  });

  it("is an empty string when none is saved", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { invoice_email: null } },
    });
    expect(await fetchInvoiceEmail()).toBe("");
  });
});

describe("fetchExchangeRates", () => {
  it("keys each rate by its normalised code, dropping invalid codes and non-positive rates", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { target_currency: "usd", rate: "0.65" },
          { target_currency: "NZD", rate: 1.08 },
          { target_currency: "EURO", rate: 0.6 },
          { target_currency: "GBP", rate: 0 },
          { target_currency: "JPY", rate: -1 },
          { target_currency: "SGD", rate: "abc" },
          { rate: 1 },
        ],
      },
    });

    expect(await fetchExchangeRates()).toEqual({ USD: 0.65, NZD: 1.08 });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.exchangeRates.getAll, { params: undefined });
  });

  it("asks for the business's own base currency's table when given one", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [{ target_currency: "INR", rate: "47.6" }] } });
    expect(await fetchExchangeRates("NZD")).toEqual({ INR: 47.6 });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.exchangeRates.getAll, { params: { base: "NZD" } });
  });

  it("is an empty map when the feed returns nothing", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    expect(await fetchExchangeRates()).toEqual({});
  });
});

/* ------------------------------------------------------------------ *
 * Payment rails
 * ------------------------------------------------------------------ */

describe("fetchInvoicePaymentRails", () => {
  function stripeAnswers(onboardingComplete: boolean) {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { account: { onboarding_complete: onboardingComplete } },
      },
    });
  }

  it("asks Payrix for this user's account map with a plain JSON body", async () => {
    stripeAnswers(false);
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });

    await fetchInvoicePaymentRails("77");

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.stripeConnect.account);
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.payrix.getAccountMap, {
      user_id: "77",
    });
  });

  it("reads an approved Payrix account — automate is test_payrix, not a field named for it", async () => {
    stripeAnswers(true);
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          account: {
            payrix_status: true,
            test_payrix: "1",
            payment_type: "credit_card",
            show_bank_details: 0,
          },
        },
      },
    });

    expect(await fetchInvoicePaymentRails("77")).toEqual({
      stripeConnected: true,
      payrixConnected: true,
      payrixAutomate: true,
      paymentType: "credit_card",
      showBankDetails: false,
    });
  });

  it("treats an account without payrix_status as not connected, whatever else it carries", async () => {
    stripeAnswers(false);
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          account: {
            payrix_status: false,
            test_payrix: 1,
            payment_type: "payto",
            show_bank_details: 0,
          },
        },
      },
    });

    expect(await fetchInvoicePaymentRails("77")).toEqual(DEFAULT_PAYMENT_RAILS);
  });

  it("defaults the payment type to direct payment when an approved account has none", async () => {
    stripeAnswers(false);
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: { account: { payrix_status: true, test_payrix: 0, show_bank_details: 1 } },
      },
    });

    expect(await fetchInvoicePaymentRails("77")).toMatchObject({
      payrixConnected: true,
      payrixAutomate: false,
      paymentType: "direct_payment",
      showBankDetails: true,
    });
  });

  it("skips the Payrix call entirely when there's no user id", async () => {
    stripeAnswers(true);

    const rails = await fetchInvoicePaymentRails(null);

    expect(apiMock.post).not.toHaveBeenCalled();
    expect(rails).toEqual({ ...DEFAULT_PAYMENT_RAILS, stripeConnected: true });
  });

  it("fails soft per rail — a Stripe error doesn't lose a connected Payrix account", async () => {
    apiMock.get.mockRejectedValue(new Error("500"));
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: { account: { payrix_status: true, payment_type: "payto" } },
      },
    });

    expect(await fetchInvoicePaymentRails("77")).toMatchObject({
      stripeConnected: false,
      payrixConnected: true,
      paymentType: "payto",
    });
  });

  it("fails soft per rail — a Payrix error doesn't lose a connected Stripe account", async () => {
    stripeAnswers(true);
    apiMock.post.mockRejectedValue(new Error("404"));

    expect(await fetchInvoicePaymentRails("77")).toEqual({
      ...DEFAULT_PAYMENT_RAILS,
      stripeConnected: true,
    });
  });
});

describe("updateSolePaySettingsApi", () => {
  it("sends only the settings given, encrypted, with automate as a 1/0 status", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await updateSolePaySettingsApi("77", { paymentMethod: "payto", automate: false });

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.payrix.updateInvoiceToggle);
    expect(decryptPayload((body as { data: string }).data)).toEqual({
      user_id: "77",
      payment_method: "payto",
      status: 0,
    });
  });

  it("leaves out a setting that wasn't passed", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await updateSolePaySettingsApi("77", { automate: true });

    const body = apiMock.post.mock.calls[0][1] as { data: string };
    expect(decryptPayload(body.data)).toEqual({ user_id: "77", status: 1 });
  });

  it("throws with the server's message, or its own fallback", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "Nope" } });
    await expect(updateSolePaySettingsApi("77", { automate: true })).rejects.toThrow(
      "Nope",
    );

    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(updateSolePaySettingsApi("77", { automate: true })).rejects.toThrow(
      "Couldn't update the SolePay setting.",
    );
  });
});
