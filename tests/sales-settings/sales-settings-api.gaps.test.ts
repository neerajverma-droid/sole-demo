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

function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was not a {data} envelope");
  }
  return decryptPayload(asData.data);
}

const FULL_SETTINGS: SalesSettings = structuredClone(DEFAULT_SALES_SETTINGS);

/**
 * Answers every read `fetchSalesSettings` makes. Each test overrides only the
 * endpoint it's about; the rest return an envelope with no data.
 */
function routeReads(over: {
  seq?: unknown;
  branding?: unknown;
  logo?: unknown;
  communication?: unknown;
  textMessage?: unknown;
}) {
  const empty = { success: true };
  const gets: Record<string, unknown> = {
    [apiRoutes.settings.getSeqNumber]: over.seq ?? empty,
    [apiRoutes.settings.getBranding]: over.branding ?? empty,
    [apiRoutes.communicationPreference.get]: over.communication ?? empty,
  };
  const posts: Record<string, unknown> = {
    [apiRoutes.user.getUserProfile]: over.logo ?? empty,
    [apiRoutes.settings.getTextMessageStatus]: over.textMessage ?? empty,
  };
  apiMock.get.mockImplementation(async (url: string) => {
    if (url in gets) return { data: gets[url] };
    throw new Error(`Unexpected GET ${url}`);
  });
  apiMock.post.mockImplementation(async (url: string) => {
    if (url in posts) return { data: posts[url] };
    throw new Error(`Unexpected POST ${url}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.get.mockReset();
  apiMock.post.mockReset();
});

/* ------------------------------------------------------------------ *
 * get-branding mapping
 * ------------------------------------------------------------------ */

describe("fetchSalesSettings — branding fields", () => {
  it("maps every invoice toggle, defaulting the unset ones on except ABN and paid receipt", async () => {
    routeReads({
      branding: {
        success: true,
        data: {
          inv_customer_name: 0,
          inv_customer_business_name: "1",
          inv_display_desc: "true",
          show_quantity_type: false,
          // Everything else absent.
        },
      },
    });

    const merged = await fetchSalesSettings();

    expect(merged.invoiceFields).toEqual({
      customerName: false,
      customerBusinessName: true,
      customerAddress: true,
      customerAbn: false,
      yourName: true,
      yourBusinessName: true,
      yourBusinessAddress: true,
      yourBusinessAbn: true,
      itemDescriptions: true,
      quantityType: false,
      gst: true,
      autoPaidReceipt: false,
    });
    // No quo_customer_name, so the quote toggles aren't touched.
    expect(merged).not.toHaveProperty("quoteFields");
  });

  it("hard-codes the two quote toggles the server has no field for", async () => {
    routeReads({
      branding: {
        success: true,
        data: {
          quo_customer_name: 1,
          quo_customer_abn: 1,
          quo_show_quantity_type: 0,
          quo_show_gst: 0,
          // Sent, but only for invoices — must not leak onto the quote.
          inv_display_desc: 0,
          send_paid_invoice_receipt: 1,
        },
      },
    });

    const { quoteFields } = await fetchSalesSettings();

    expect(quoteFields).toMatchObject({
      customerName: true,
      customerAbn: true,
      quantityType: false,
      gst: false,
      itemDescriptions: true,
      autoPaidReceipt: false,
    });
  });

  it("reads anything other than true/1/'1'/'true' as off", async () => {
    routeReads({
      branding: {
        success: true,
        data: { inv_customer_name: "yes", inv_customer_address: 2, inv_customer_abn: "1" },
      },
    });
    const { invoiceFields } = await fetchSalesSettings();
    expect(invoiceFields?.customerName).toBe(false);
    expect(invoiceFields?.customerAddress).toBe(false);
    expect(invoiceFields?.customerAbn).toBe(true);
  });

  it("ignores a note that is null or the literal string 'null'", async () => {
    routeReads({
      branding: { success: true, data: { invoice_note: "null", quote_note: null } },
    });
    let merged = await fetchSalesSettings();
    expect(merged).not.toHaveProperty("invoiceNotes");
    expect(merged).not.toHaveProperty("quoteNotes");

    routeReads({
      branding: { success: true, data: { invoice_note: "Pay in 7 days", quote_note: "" } },
    });
    merged = await fetchSalesSettings();
    expect(merged.invoiceNotes).toBe("Pay in 7 days");
    // A blank note is a real value — the user cleared it.
    expect(merged.quoteNotes).toBe("");
  });

  it("maps 'draft' to drafting the invoice, and leaves anything unknown unset", async () => {
    routeReads({ branding: { success: true, data: { quote_accept_invoice_action: "draft" } } });
    expect((await fetchSalesSettings()).quoteAcceptanceAction).toBe(
      "Create invoice as draft",
    );

    routeReads({ branding: { success: true, data: { quote_accept_invoice_action: "nothing" } } });
    expect(await fetchSalesSettings()).not.toHaveProperty("quoteAcceptanceAction");
  });

  it("leaves the footer phone alone when neither phone key is present", async () => {
    routeReads({ branding: { success: true, data: { brand_color: "#123456" } } });
    const merged = await fetchSalesSettings();
    expect(merged).not.toHaveProperty("footerPhone");
    expect(merged.brandColor).toBe("#123456");
  });

  it("splits a phone from its country code even when only the number is sent", async () => {
    routeReads({ branding: { success: true, data: { phone: "+64211234567" } } });
    expect((await fetchSalesSettings()).footerPhone).toEqual({
      enabled: false,
      countryCode: "+64",
      value: "211234567",
    });
  });

  it("always rebuilds the footer links, so a response without them switches the website off", async () => {
    routeReads({
      branding: {
        success: true,
        data: { instagram_url_enabled: 1, instagram_url: "@sole", tiktok_url: "@left" },
      },
    });

    const { footerLinks } = await fetchSalesSettings();

    expect(footerLinks).toEqual({
      website: { enabled: false, value: "" },
      facebook: { enabled: false, value: "" },
      instagram: { enabled: true, value: "@sole" },
      linkedin: { enabled: false, value: "" },
      tiktok: { enabled: false, value: "@left" },
    });
  });

  it("returns no branding fields at all when get-branding has no data", async () => {
    routeReads({ branding: { success: true } });
    const merged = await fetchSalesSettings();
    expect(merged).not.toHaveProperty("footerLinks");
    expect(merged).not.toHaveProperty("invoiceStyle");
  });

  it("keeps the local style ids when the server sends no template ids", async () => {
    routeReads({ branding: { success: true, data: { brand_color: "#000000" } } });
    const merged = await fetchSalesSettings();
    for (const key of ["invoiceStyle", "quoteStyle", "ndisInvoiceStyle", "ndisQuoteStyle"]) {
      expect(merged).not.toHaveProperty(key);
    }
  });

  it("doesn't check success on a read — data is what counts", async () => {
    routeReads({
      seq: { success: false, data: { invoice_prefix: "ABC", next_invoice_no: 7 } },
    });
    const merged = await fetchSalesSettings();
    expect(merged.invoicePrefix).toBe("ABC");
    expect(merged.nextInvoiceNumber).toBe("7");
    expect(merged).not.toHaveProperty("quotePrefix");
  });
});

/* ------------------------------------------------------------------ *
 * logo, communication, text messages
 * ------------------------------------------------------------------ */

describe("fetchSalesSettings — logo", () => {
  it("falls back to a top-level profile_pic", async () => {
    routeReads({
      logo: { success: true, data: { profile_pic: "https://cdn.example.com/top.png" } },
    });
    expect((await fetchSalesSettings()).logo).toBe("https://cdn.example.com/top.png");
  });

  it("always sets the logo, null when the profile has none", async () => {
    routeReads({ logo: { success: true, data: { user: { profile_pic: "" } } } });
    let merged = await fetchSalesSettings();
    expect(merged).toHaveProperty("logo", null);

    routeReads({ logo: { success: true } });
    merged = await fetchSalesSettings();
    expect(merged).toHaveProperty("logo", null);
  });

  it("asks for the profile with an encrypted empty body", async () => {
    routeReads({});
    await fetchSalesSettings();
    const call = apiMock.post.mock.calls.find(([url]) => url === apiRoutes.user.getUserProfile);
    expect(decryptedFieldsFromBody(call?.[1])).toEqual({});
  });
});

describe("fetchSalesSettings — communication", () => {
  it("forces every reminder off when reminder_setting is missing, and leaves the BCC flags alone", async () => {
    routeReads({ communication: { success: true, data: {} } });

    const merged = await fetchSalesSettings();

    expect(merged).toMatchObject({
      remindInvoiceDue: false,
      remindInvoiceOverdue: false,
      remindQuoteExpiry: false,
    });
    expect(merged).not.toHaveProperty("bccInvoiceEmails");
    expect(merged).not.toHaveProperty("bccQuoteEmails");
  });

  it("sets only the BCC flag whose module row exists", async () => {
    routeReads({
      communication: {
        success: true,
        data: {
          notification_setting_details: [{ module: "quote", is_email: 1 }],
          reminder_setting: { quo_before: "1", quo_before_days: 3 },
        },
      },
    });

    const merged = await fetchSalesSettings();

    expect(merged.bccQuoteEmails).toBe(true);
    expect(merged).not.toHaveProperty("bccInvoiceEmails");
    expect(merged.remindQuoteExpiry).toBe(true);
    expect(merged.remindInvoiceDue).toBe(false);
  });

  it("returns nothing for communication when the response has no data", async () => {
    routeReads({ communication: { success: true } });
    const merged = await fetchSalesSettings();
    expect(merged).not.toHaveProperty("remindInvoiceDue");
  });
});

describe("fetchSalesSettings — text messages", () => {
  it("leaves the switch alone when no status comes back", async () => {
    routeReads({ textMessage: { success: true, data: {} } });
    expect(await fetchSalesSettings()).not.toHaveProperty("textMessagesEnabled");
  });

  it("reads a 0 as off", async () => {
    routeReads({ textMessage: { success: true, data: { is_text_message: 0 } } });
    expect((await fetchSalesSettings()).textMessagesEnabled).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * saveBrandingApi — the whole field list
 * ------------------------------------------------------------------ */

describe("saveBrandingApi — the full record", () => {
  it("sends exactly the branding fields, with no quote item-description field", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await saveBrandingApi(FULL_SETTINGS);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.settings.saveBranding);
    const fields = decryptedFieldsFromBody(body);

    expect(fields).toEqual({
      brand_color: "#4D4DFE",
      content_color: "#0F1117",
      inv_customer_name: 1,
      inv_customer_business_name: 1,
      inv_customer_address: 1,
      inv_customer_abn: 0,
      inv_sole_user_name: 1,
      inv_sole_business_name: 1,
      inv_sole_business_address: 1,
      inv_sole_business_abn: 1,
      inv_display_desc: 1,
      show_quantity_type: 1,
      show_gst: 1,
      send_paid_invoice_receipt: 0,
      quo_customer_name: 1,
      quo_customer_business_name: 1,
      quo_customer_address: 1,
      quo_customer_abn: 0,
      quo_sole_user_name: 1,
      quo_sole_business_name: 1,
      quo_sole_business_address: 1,
      quo_sole_business_abn: 1,
      quo_show_quantity_type: 1,
      quo_show_gst: 1,
      website_enabled: 1,
      website: "https://sole.com.au",
      facebook_url_enabled: 0,
      instagram_url_enabled: 0,
      linkedin_url_enabled: 0,
      tiktok_url_enabled: 0,
      phone_enabled: 1,
      phone: "+612348082823",
      // Deliberately loose — see the it.todo below.
      invoice_template: expect.anything(),
      quote_template: expect.anything(),
      ndis_template: expect.anything(),
      ndis_quote_template: expect.anything(),
      invoice_note: DEFAULT_SALES_SETTINGS.invoiceNotes,
      quote_note: DEFAULT_SALES_SETTINGS.quoteNotes,
      quote_accept_invoice_action: "draft",
    });
    expect(fields).not.toHaveProperty("quo_display_desc");
    expect(fields).not.toHaveProperty("refund_prefix");
  });

  // Discrepancy: DEFAULT_SALES_SETTINGS' style ids are local lib/document-styles
  // catalog ids ("general-01", ...), and `invoiceStyle || 1` only catches "", so a
  // business whose get-branding returns no template ids saves those strings as
  // invoice_template/quote_template/... instead of the server's numeric defaults.
  it.todo("falls back to the numeric server template ids (1/13/7/25) when the slot still holds a local catalog default");

  it("maps the show_* toggles and the item-description toggle off as 0", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await saveBrandingApi({
      ...FULL_SETTINGS,
      invoiceFields: {
        ...FULL_SETTINGS.invoiceFields,
        itemDescriptions: false,
        quantityType: false,
        gst: false,
      },
      quoteFields: {
        ...FULL_SETTINGS.quoteFields,
        quantityType: false,
        gst: false,
        itemDescriptions: false,
      },
      invoiceNotes: "",
      quoteNotes: "Valid 30 days",
    });

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields).toMatchObject({
      inv_display_desc: 0,
      show_quantity_type: 0,
      show_gst: 0,
      quo_show_quantity_type: 0,
      quo_show_gst: 0,
      invoice_note: "",
      quote_note: "Valid 30 days",
    });
    // Local only — switching it off sends nothing.
    expect(fields).not.toHaveProperty("quo_display_desc");
  });

  it("uses its own fallback message when the server says nothing", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(saveBrandingApi(FULL_SETTINGS)).rejects.toThrow(
      "Couldn't save sales settings.",
    );
  });
});

/* ------------------------------------------------------------------ *
 * Writes — "off" payloads and failure paths
 * ------------------------------------------------------------------ */

describe("writes — off payloads", () => {
  it("sends isToggled: 0 to switch text messages off", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await enableTextMessageApi(false);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.settings.enableTextMessage);
    expect(decryptedFieldsFromBody(body)).toEqual({ isToggled: 0 });
  });

  it("switches both flags off together for the quote module", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await saveNotificationPreferenceApi("quote", false);
    expect(decryptedFieldsFromBody(apiMock.post.mock.calls[0][1])).toEqual({
      module: "quote",
      is_email: 0,
      is_push_notification: 0,
    });
  });

  it("sends the overdue reminder under its own type", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });

    await saveReminderPreferenceApi("inv_after", true);
    await saveReminderPreferenceApi("inv_after", false);

    expect(apiMock.post.mock.calls[0][0]).toBe(
      apiRoutes.communicationPreference.addComPreference,
    );
    expect(decryptedFieldsFromBody(apiMock.post.mock.calls[0][1])).toEqual({
      type: "inv_after",
      status: "on",
      days: 1,
    });
    expect(decryptedFieldsFromBody(apiMock.post.mock.calls[1][1])).toEqual({
      type: "inv_after",
      status: "off",
    });
  });

  it("sends the numbering untrimmed, exactly as typed", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await saveSeqNumbersApi({
      invoicePrefix: " INV ",
      nextInvoiceNumber: "25",
      quotePrefix: "QUO",
      nextQuoteNumber: " 9",
    });
    expect(decryptedFieldsFromBody(apiMock.post.mock.calls[0][1])).toMatchObject({
      invoice_prefix: " INV ",
      next_quote_no: " 9",
    });
  });
});

describe("writes — failure paths", () => {
  const cases: [string, () => Promise<unknown>, string][] = [
    ["saveSeqNumbersApi", () => saveSeqNumbersApi({ invoicePrefix: "INV", nextInvoiceNumber: "1", quotePrefix: "QUO", nextQuoteNumber: "1" }), "Couldn't save invoice & quote numbering."],
    ["uploadLogoApi", () => uploadLogoApi("data:image/png;base64,AAAA"), "Couldn't upload that logo."],
    ["removeLogoApi", () => removeLogoApi(), "Couldn't remove the logo."],
    ["saveNotificationPreferenceApi", () => saveNotificationPreferenceApi("invoice", true), "Couldn't save that notification preference."],
    ["saveReminderPreferenceApi", () => saveReminderPreferenceApi("quo_before", true), "Couldn't save that reminder."],
    ["enableTextMessageApi", () => enableTextMessageApi(true), "Couldn't update text message settings."],
  ];

  for (const [name, call, fallback] of cases) {
    it(`${name} throws the server's message, else its own fallback`, async () => {
      apiMock.post.mockResolvedValue({ data: { success: false, message: "Server said no" } });
      await expect(call()).rejects.toThrow("Server said no");

      apiMock.post.mockResolvedValue({ data: { success: false } });
      await expect(call()).rejects.toThrow(fallback);
    });

    it(`${name} treats a missing success as success`, async () => {
      apiMock.post.mockResolvedValue({
        data: { data: { user: { profile_pic: "https://cdn.example.com/x.jpg" } } },
      });
      // Rejects (and fails the test) only if the absent flag were read as failure.
      await call();
    });
  }
});

describe("uploadLogoApi — the file", () => {
  it("sends plain FormData (not encrypted) and defaults the type to JPEG", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { user: { profile_pic: "https://cdn.example.com/l.jpg" } } },
    });

    await uploadLogoApi("data:;base64," + Buffer.from("abc").toString("base64"));

    const form = apiMock.post.mock.calls[0][1] as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("data")).toBeNull();
    const file = form.get("profile_pic") as File;
    expect(file.name).toBe("logo.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(file.size).toBe(3);
  });
});
