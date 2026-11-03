import { describe, expect, it } from "vitest";

import {
  DEFAULT_SALES_SETTINGS,
  SALES_TABS,
  TAB_KEYS,
  migrateSalesSettings,
  normaliseHex,
  phoneError,
  prefixError,
  tabDefaults,
  tabDirty,
  tabSlice,
  type SalesSettings,
  type SalesTab,
} from "@/lib/sales-settings";

function settings(over: Partial<SalesSettings> = {}): SalesSettings {
  return { ...structuredClone(DEFAULT_SALES_SETTINGS), ...over };
}

describe("SALES_TABS", () => {
  it("lists the eight tabs in on-screen order with their labels", () => {
    expect(SALES_TABS.map((tab) => [tab.id, tab.label])).toEqual([
      ["settings", "Settings"],
      ["branding", "Logo & Colors"],
      ["footer", "Footer & Social"],
      ["invoice-fields", "Invoice Customisation"],
      ["quote-fields", "Quote Customisation"],
      ["invoice-styling", "Invoice Styling"],
      ["quote-styling", "Quote Styling"],
      ["communication", "Communication Preferences"],
    ]);
  });
});

describe("TAB_KEYS", () => {
  it("gives the remaining tabs the keys they own", () => {
    expect(TAB_KEYS.branding).toEqual(["logo", "brandColor", "contentColor"]);
    expect(TAB_KEYS.footer).toEqual(["footerPhone", "footerLinks"]);
    expect(TAB_KEYS["invoice-fields"]).toEqual(["invoiceFields", "invoiceNotes"]);
    expect(TAB_KEYS["quote-fields"]).toEqual([
      "quoteFields",
      "quoteNotes",
      "quoteAcceptanceAction",
    ]);
    expect(TAB_KEYS.communication).toEqual([
      "textMessagesEnabled",
      "bccInvoiceEmails",
      "bccQuoteEmails",
      "remindInvoiceDue",
      "remindInvoiceOverdue",
      "remindQuoteExpiry",
    ]);
  });

  it("gives every key to exactly one tab, apart from the local-only refund numbering", () => {
    const owned = Object.values(TAB_KEYS).flat();
    expect(new Set(owned).size).toBe(owned.length);
    const unowned = Object.keys(DEFAULT_SALES_SETTINGS).filter(
      (key) => !owned.includes(key as keyof SalesSettings),
    );
    expect(unowned.sort()).toEqual(["nextRefundNumber", "refundPrefix"]);
  });
});

describe("tabSlice, tabDefaults and tabDirty across every tab", () => {
  const tabs = SALES_TABS.map((tab) => tab.id) as SalesTab[];

  it("slices only the tab's own keys", () => {
    for (const tab of tabs) {
      expect(Object.keys(tabSlice(tab, settings()))).toEqual([...TAB_KEYS[tab]]);
    }
  });

  it("takes the defaults for just that tab", () => {
    expect(tabDefaults("communication")).toEqual({
      textMessagesEnabled: false,
      bccInvoiceEmails: true,
      bccQuoteEmails: false,
      remindInvoiceDue: true,
      remindInvoiceOverdue: true,
      remindQuoteExpiry: true,
    });
    expect(tabDefaults("quote-fields")).toMatchObject({
      quoteAcceptanceAction: "Create invoice as draft",
    });
  });

  it("is dirty only on the tab that owns the changed key", () => {
    const stored = settings();
    const changes: Record<SalesTab, Partial<SalesSettings>> = {
      settings: { nextQuoteNumber: "1" },
      branding: { logo: "https://cdn.example.com/l.png" },
      footer: { footerPhone: { ...stored.footerPhone, enabled: false } },
      "invoice-fields": { invoiceNotes: "Changed" },
      "quote-fields": { quoteAcceptanceAction: "Do nothing" },
      "invoice-styling": { ndisInvoiceStyle: "7" },
      "quote-styling": { quoteStyle: "13" },
      communication: { remindQuoteExpiry: false },
    };

    for (const [changedTab, change] of Object.entries(changes)) {
      const values = settings(change);
      for (const tab of tabs) {
        expect(tabDirty(tab, values, stored), `${changedTab} → ${tab}`).toBe(
          tab === changedTab,
        );
      }
    }
  });

  it("isn't dirty for a refund-numbering change, which no tab owns", () => {
    const values = settings({ refundPrefix: "CN" });
    for (const tab of tabs) {
      expect(tabDirty(tab, values, settings())).toBe(false);
    }
  });

  it("sees a nested toggle change on the fields tab", () => {
    const values = settings({
      quoteFields: { ...DEFAULT_SALES_SETTINGS.quoteFields, gst: false },
    });
    expect(tabDirty("quote-fields", values, settings())).toBe(true);
    expect(tabDirty("invoice-fields", values, settings())).toBe(false);
  });
});

describe("migrateSalesSettings — edge rules", () => {
  it("treats a stored null the same as a missing value", () => {
    const migrated = migrateSalesSettings({
      brandColor: null,
      quotePrefix: null,
      footerLinks: null,
      logo: null,
    });
    expect(migrated.brandColor).toBe("#4D4DFE");
    expect(migrated.quotePrefix).toBe("QUO");
    expect(migrated.footerLinks).toEqual(DEFAULT_SALES_SETTINGS.footerLinks);
    expect(migrated.logo).toBeNull();
  });

  it("merges nested records one level deep only — a stored link entry replaces the default whole", () => {
    const migrated = migrateSalesSettings({
      footerLinks: { website: { enabled: false } },
    });
    // The stored entry wins outright; the default's value isn't merged in.
    expect(migrated.footerLinks.website).toEqual({ enabled: false });
    expect(migrated.footerLinks.facebook).toEqual({ enabled: false, value: "" });
  });

  it("keeps falsy-but-real stored values", () => {
    const migrated = migrateSalesSettings({
      textMessagesEnabled: false,
      bccInvoiceEmails: false,
      invoiceNotes: "",
    });
    expect(migrated.bccInvoiceEmails).toBe(false);
    expect(migrated.invoiceNotes).toBe("");
  });

  it("hands back fresh nested containers, not the shared defaults themselves", () => {
    const migrated = migrateSalesSettings(undefined);
    expect(migrated).not.toBe(DEFAULT_SALES_SETTINGS);
    expect(migrated.invoiceFields).not.toBe(DEFAULT_SALES_SETTINGS.invoiceFields);
    expect(migrated.quoteFields).not.toBe(DEFAULT_SALES_SETTINGS.quoteFields);
    expect(migrated.footerPhone).not.toBe(DEFAULT_SALES_SETTINGS.footerPhone);
    expect(migrated.footerLinks).not.toBe(DEFAULT_SALES_SETTINGS.footerLinks);
  });
});

describe("validator boundaries", () => {
  it("trims a prefix before checking it, and allows exactly 8 characters", () => {
    expect(prefixError(" INV ")).toBeUndefined();
    expect(prefixError("ABCDEFGH")).toBeUndefined();
    expect(prefixError("ABCDEFGHI")).toBeDefined();
    expect(prefixError("   ")).toBe("Enter a prefix.");
  });

  it("normalises a hex with surrounding whitespace", () => {
    expect(normaliseHex("  #abc  ")).toBe("#AABBCC");
    expect(normaliseHex(" 4d4dfe")).toBe("#4D4DFE");
  });

  it("accepts a phone of exactly 6 or 12 digits, ignoring formatting", () => {
    const phone = (value: string) => ({ enabled: true, countryCode: "+61", value });
    expect(phoneError(phone("123 456"))).toBeUndefined();
    expect(phoneError(phone("12345"))).toBeDefined();
    expect(phoneError(phone("(02) 1234-567890"))).toBeUndefined();
    expect(phoneError(phone("1234567890123"))).toBeDefined();
  });
});
