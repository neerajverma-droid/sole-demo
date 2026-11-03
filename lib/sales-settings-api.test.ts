import { describe, expect, it, vi, beforeEach } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";
import { DEFAULT_SALES_SETTINGS, type SalesSettings } from "@/lib/sales-settings";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so `lib/sales-settings-api.ts`'s own `import api
// from "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  saveSeqNumbersApi,
  saveBrandingApi,
  uploadLogoApi,
  removeLogoApi,
  saveNotificationPreferenceApi,
  saveReminderPreferenceApi,
  enableTextMessageApi,
  fetchSalesSettings,
} = await import("@/lib/sales-settings-api");

/** Decrypts whatever body a call sent, whether it's a bare `{data}` object or a FormData carrying one. */
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

const FULL_SETTINGS: SalesSettings = structuredClone(DEFAULT_SALES_SETTINGS);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveSeqNumbersApi", () => {
  it("POSTs an encrypted body to settings.saveSeqNumber", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await saveSeqNumbersApi({
      invoicePrefix: "INV",
      nextInvoiceNumber: "25",
      quotePrefix: "QUO",
      nextQuoteNumber: "45410",
    });

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.settings.saveSeqNumber);
    expect(decryptedFieldsFromBody(body)).toEqual({
      invoice_prefix: "INV",
      next_invoice_no: "25",
      quote_prefix: "QUO",
      next_quote_no: "45410",
    });
  });

  it("throws with the server's message when it reports failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Prefix already in use" },
    });

    await expect(
      saveSeqNumbersApi({
        invoicePrefix: "INV",
        nextInvoiceNumber: "25",
        quotePrefix: "QUO",
        nextQuoteNumber: "45410",
      }),
    ).rejects.toThrow("Prefix already in use");
  });
});

describe("saveBrandingApi", () => {
  it("maps colours, and every field toggle to 1/0, including the defaults' 'off' fields", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await saveBrandingApi(FULL_SETTINGS);

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.brand_color).toBe(FULL_SETTINGS.brandColor);
    expect(fields.content_color).toBe(FULL_SETTINGS.contentColor);
    // customerAbn and autoPaidReceipt are off in the defaults.
    expect(fields.inv_customer_abn).toBe(0);
    expect(fields.send_paid_invoice_receipt).toBe(0);
    expect(fields.inv_customer_name).toBe(1);
    expect(fields.quo_customer_abn).toBe(0);
    expect(fields.quo_customer_name).toBe(1);
  });

  it("only sends a footer link's value while that link is switched on", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await saveBrandingApi({
      ...FULL_SETTINGS,
      footerLinks: {
        ...FULL_SETTINGS.footerLinks,
        website: { enabled: true, value: "https://sole.com.au" },
        facebook: { enabled: false, value: "leftover text" },
      },
    });

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.website_enabled).toBe(1);
    expect(fields.website).toBe("https://sole.com.au");
    expect(fields.facebook_url_enabled).toBe(0);
    // Switched off — its value never travels, even though the draft still has some.
    expect(fields).not.toHaveProperty("facebook_url");
  });

  it("combines the country code and digits-only number, only while the phone is on", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await saveBrandingApi({
      ...FULL_SETTINGS,
      footerPhone: { enabled: true, countryCode: "+61", value: "234 808 2823" },
    });
    let fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.phone_enabled).toBe(1);
    expect(fields.phone).toBe("+612348082823");

    await saveBrandingApi({
      ...FULL_SETTINGS,
      footerPhone: { enabled: false, countryCode: "+61", value: "234 808 2823" },
    });
    fields = decryptedFieldsFromBody(apiMock.post.mock.calls[1][1]);
    expect(fields.phone_enabled).toBe(0);
    expect(fields).not.toHaveProperty("phone");
  });

  it("falls back to sole-webapp's own default template ids when a slot is blank", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await saveBrandingApi({
      ...FULL_SETTINGS,
      invoiceStyle: "",
      quoteStyle: "",
      ndisInvoiceStyle: "",
      ndisQuoteStyle: "",
    });

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.invoice_template).toBe(1);
    expect(fields.quote_template).toBe(13);
    expect(fields.ndis_template).toBe(7);
    expect(fields.ndis_quote_template).toBe(25);
  });

  it("sends a real template id as-is when one is chosen", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await saveBrandingApi({ ...FULL_SETTINGS, invoiceStyle: "42" });

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.invoice_template).toBe("42");
  });

  it("maps the quote acceptance action, folding 'Do nothing' back to draft", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await saveBrandingApi({
      ...FULL_SETTINGS,
      quoteAcceptanceAction: "Create and send invoice",
    });
    expect(
      decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]).quote_accept_invoice_action,
    ).toBe("send");

    await saveBrandingApi({ ...FULL_SETTINGS, quoteAcceptanceAction: "Do nothing" });
    expect(
      decryptedFieldsFromBody(apiMock.post.mock.calls[1][1]).quote_accept_invoice_action,
    ).toBe("draft");
  });

  it("throws with the server's message when it reports failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Couldn't save" },
    });
    await expect(saveBrandingApi(FULL_SETTINGS)).rejects.toThrow("Couldn't save");
  });
});

describe("uploadLogoApi", () => {
  it("uploads the picked data: URL as a file and returns the server's URL", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: { user: { profile_pic: "https://cdn.example.com/logo-123.jpg" } },
      },
    });

    const dataUrl =
      "data:image/png;base64," + Buffer.from("fake-image-bytes").toString("base64");
    const url = await uploadLogoApi(dataUrl);

    expect(url).toBe("https://cdn.example.com/logo-123.jpg");
    const [postUrl, form] = apiMock.post.mock.calls[0];
    expect(postUrl).toBe(apiRoutes.user.updateUserProfile);
    expect(form).toBeInstanceOf(FormData);
    const file = form.get("profile_pic") as File;
    expect(file.type).toBe("image/png");
  });

  it("throws when the server returns no URL", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });

    await expect(uploadLogoApi("data:image/png;base64,AAAA")).rejects.toThrow(
      "returned no URL",
    );
  });
});

describe("removeLogoApi", () => {
  it("POSTs an encrypted empty body to user.removeProfilePicture", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await removeLogoApi();

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.user.removeProfilePicture);
    expect(decryptedFieldsFromBody(body)).toEqual({});
  });
});

describe("saveNotificationPreferenceApi", () => {
  it("sends both the email and push flags for the given module", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await saveNotificationPreferenceApi("invoice", true);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.communicationPreference.addNotification);
    expect(decryptedFieldsFromBody(body)).toEqual({
      module: "invoice",
      is_email: 1,
      is_push_notification: 1,
    });
  });
});

describe("saveReminderPreferenceApi", () => {
  it("sends a fixed one-day default while switching a reminder on", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await saveReminderPreferenceApi("inv_before", true);

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields).toEqual({ type: "inv_before", status: "on", days: 1 });
  });

  it("sends no day count while switching a reminder off", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await saveReminderPreferenceApi("quo_before", false);

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields).toEqual({ type: "quo_before", status: "off" });
  });
});

describe("enableTextMessageApi", () => {
  it("sends the toggle as 1 or 0", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await enableTextMessageApi(true);
    expect(
      decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]).isToggled,
    ).toBe(1);
  });
});

describe("fetchSalesSettings", () => {
  /** Routes each mocked call by URL, the way the real API distinguishes endpoints. */
  function routeGet(handlers: Record<string, unknown>) {
    apiMock.get.mockImplementation(async (url: string) => {
      for (const [match, data] of Object.entries(handlers)) {
        if (url === match) return { data };
      }
      throw new Error(`Unexpected GET ${url}`);
    });
  }

  function routePost(handlers: Record<string, unknown>) {
    apiMock.post.mockImplementation(async (url: string) => {
      for (const [match, data] of Object.entries(handlers)) {
        if (url === match) return { data };
      }
      throw new Error(`Unexpected POST ${url}`);
    });
  }

  it("merges seq numbers, branding, logo, communication and text-message state into one object", async () => {
    routeGet({
      [apiRoutes.settings.getSeqNumber]: {
        success: true,
        data: {
          invoice_prefix: "INV",
          next_invoice_no: "9",
          quote_prefix: "QUO",
          next_quote_no: "12",
        },
      },
      [apiRoutes.settings.getBranding]: {
        success: true,
        data: {
          brand_color: "#111111",
          content_color: "#222222",
          inv_customer_name: 1,
          inv_customer_abn: 0,
          quo_customer_name: 1,
          quo_customer_abn: 0,
          invoice_template: 7,
          quote_template: 13,
          ndis_template: 9,
          ndis_quote_template: 25,
          quote_accept_invoice_action: "send",
          phone_enabled: 1,
          phone: "+61234808282",
          website_enabled: 1,
          website: "https://sole.com.au",
        },
      },
      [apiRoutes.communicationPreference.get]: {
        success: true,
        data: {
          notification_setting_details: [
            { module: "invoice", is_email: true },
            { module: "quote", is_email: false },
          ],
          reminder_setting: { inv_before: true, inv_after: false, quo_before: true },
        },
      },
    });
    routePost({
      [apiRoutes.user.getUserProfile]: {
        success: true,
        data: { user: { profile_pic: "https://cdn.example.com/logo.png" } },
      },
      [apiRoutes.settings.getTextMessageStatus]: {
        success: true,
        data: { is_text_message: 1 },
      },
    });

    const merged = await fetchSalesSettings();

    expect(merged.invoicePrefix).toBe("INV");
    expect(merged.nextQuoteNumber).toBe("12");
    expect(merged.brandColor).toBe("#111111");
    expect(merged.invoiceStyle).toBe("7");
    expect(merged.ndisInvoiceStyle).toBe("9");
    expect(merged.quoteAcceptanceAction).toBe("Create and send invoice");
    expect(merged.footerPhone).toEqual({
      enabled: true,
      countryCode: "+61",
      value: "234808282",
    });
    expect(merged.footerLinks?.website).toEqual({
      enabled: true,
      value: "https://sole.com.au",
    });
    expect(merged.logo).toBe("https://cdn.example.com/logo.png");
    expect(merged.bccInvoiceEmails).toBe(true);
    expect(merged.bccQuoteEmails).toBe(false);
    expect(merged.remindInvoiceDue).toBe(true);
    expect(merged.remindInvoiceOverdue).toBe(false);
    expect(merged.textMessagesEnabled).toBe(true);
  });

  it("fetches the logo over POST, not GET — user.getUserProfile is a POST-only endpoint", async () => {
    routeGet({
      [apiRoutes.settings.getSeqNumber]: { success: true, data: {} },
      [apiRoutes.settings.getBranding]: { success: true, data: {} },
      [apiRoutes.communicationPreference.get]: { success: true, data: {} },
    });
    routePost({
      [apiRoutes.user.getUserProfile]: {
        success: true,
        data: { user: { profile_pic: "https://cdn.example.com/logo.png" } },
      },
      [apiRoutes.settings.getTextMessageStatus]: { success: true, data: {} },
    });

    await fetchSalesSettings();

    expect(apiMock.get).not.toHaveBeenCalledWith(
      apiRoutes.user.getUserProfile,
      expect.anything(),
    );
    expect(apiMock.post).toHaveBeenCalledWith(
      apiRoutes.user.getUserProfile,
      expect.anything(),
    );
  });

  it("keeps whatever loaded successfully when one piece fails, instead of losing everything", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === apiRoutes.settings.getSeqNumber) {
        return { data: { success: true, data: { invoice_prefix: "INV" } } };
      }
      if (url === apiRoutes.settings.getBranding) {
        return { data: { success: true, data: {} } };
      }
      if (url === apiRoutes.communicationPreference.get) {
        throw new Error("network down");
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    routePost({
      [apiRoutes.user.getUserProfile]: { success: true, data: {} },
      [apiRoutes.settings.getTextMessageStatus]: { success: true, data: {} },
    });

    const merged = await fetchSalesSettings();

    expect(merged.invoicePrefix).toBe("INV");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
