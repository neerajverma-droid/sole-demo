import { describe, expect, it } from "vitest";

import {
  DEFAULT_SALES_SETTINGS,
  TAB_KEYS,
  brandingTabIssues,
  footerTabIssues,
  hexColorError,
  invoiceNumbering,
  isSalesTab,
  linkError,
  migrateSalesSettings,
  nextNumberError,
  normaliseHex,
  phoneError,
  prefixError,
  quoteNumbering,
  refundNumbering,
  settingsTabIssues,
  tabDefaults,
  tabDirty,
  tabSlice,
  type SalesSettings,
} from "@/lib/sales-settings";

/** A full, valid settings object — individual fields overridden per test. */
const BASE: SalesSettings = structuredClone(DEFAULT_SALES_SETTINGS);

describe("prefixError", () => {
  it("requires a prefix", () => {
    expect(prefixError("")).toBe("Enter a prefix.");
    expect(prefixError("   ")).toBe("Enter a prefix.");
  });

  it("allows letters, numbers and hyphens up to 8 characters", () => {
    expect(prefixError("INV")).toBeUndefined();
    expect(prefixError("INV-2026")).toBeUndefined();
  });

  it("rejects other characters or anything longer than 8 characters", () => {
    expect(prefixError("INV_2026")).toBe(
      "Letters, numbers and hyphens only, up to 8 characters.",
    );
    expect(prefixError("123456789")).toBe(
      "Letters, numbers and hyphens only, up to 8 characters.",
    );
  });
});

describe("nextNumberError", () => {
  it("requires a starting number", () => {
    expect(nextNumberError("")).toBe("Enter a starting number.");
  });

  it("requires a whole, non-negative number", () => {
    expect(nextNumberError("12.5")).toBe("Enter a whole number (0 or more).");
    expect(nextNumberError("-1")).toBe("Enter a whole number (0 or more).");
    expect(nextNumberError("abc")).toBe("Enter a whole number (0 or more).");
  });

  it("accepts a whole number, including zero", () => {
    expect(nextNumberError("0")).toBeUndefined();
    expect(nextNumberError("45410")).toBeUndefined();
  });
});

describe("hexColorError and normaliseHex", () => {
  it("requires a colour", () => {
    expect(hexColorError("")).toBe("Enter a colour.");
  });

  it("accepts 3- or 6-digit hex, with or without the hash", () => {
    expect(hexColorError("#abc")).toBeUndefined();
    expect(hexColorError("abc")).toBeUndefined();
    expect(hexColorError("#4D4DFE")).toBeUndefined();
  });

  it("rejects anything else", () => {
    expect(hexColorError("blue")).toBe("Enter a hex colour, e.g. #4D4DFE.");
    expect(hexColorError("#12345")).toBe("Enter a hex colour, e.g. #4D4DFE.");
  });

  it("expands a 3-digit hex and upper-cases the result", () => {
    expect(normaliseHex("abc")).toBe("#AABBCC");
    expect(normaliseHex("#4d4dfe")).toBe("#4D4DFE");
  });

  it("falls back to black for anything invalid, so a bad value still previews", () => {
    expect(normaliseHex("not-a-colour")).toBe("#000000");
  });
});

describe("phoneError", () => {
  it("never fails while the row is switched off", () => {
    expect(phoneError({ enabled: false, value: "", countryCode: "+61" })).toBeUndefined();
  });

  it("requires a value once switched on", () => {
    expect(
      phoneError({ enabled: true, value: "", countryCode: "+61" }),
    ).toBe("Enter a phone number.");
  });

  it("requires 6 to 12 digits", () => {
    expect(
      phoneError({ enabled: true, value: "123", countryCode: "+61" }),
    ).toBe("Enter a valid phone number.");
    expect(
      phoneError({ enabled: true, value: "234 808 2823", countryCode: "+61" }),
    ).toBeUndefined();
  });
});

describe("linkError", () => {
  it("never fails while switched off", () => {
    expect(linkError({ enabled: false, value: "" })).toBeUndefined();
  });

  it("requires a value once switched on", () => {
    expect(linkError({ enabled: true, value: "" })).toBe(
      "Enter a value, or switch this off.",
    );
    expect(linkError({ enabled: true, value: "https://sole.com.au" })).toBeUndefined();
  });
});

describe("settingsTabIssues", () => {
  it("has no issues for the defaults", () => {
    expect(settingsTabIssues(BASE)).toEqual([]);
  });

  it("reports a bad invoice or quote prefix or number", () => {
    const issues = settingsTabIssues({
      ...BASE,
      invoicePrefix: "",
      nextQuoteNumber: "abc",
    });
    expect(issues.map((i) => i.key)).toEqual(["invoicePrefix", "nextQuoteNumber"]);
  });

  it("no longer validates credit note numbering — there's no field for it on this tab", () => {
    const issues = settingsTabIssues({
      ...BASE,
      refundPrefix: "",
      nextRefundNumber: "not-a-number",
    });
    expect(issues).toEqual([]);
  });
});

describe("brandingTabIssues", () => {
  it("has no issues for the defaults", () => {
    expect(brandingTabIssues(BASE)).toEqual([]);
  });

  it("reports an invalid brand or content colour", () => {
    const issues = brandingTabIssues({ ...BASE, brandColor: "nope" });
    expect(issues).toEqual([
      { key: "brandColor", message: "Enter a hex colour, e.g. #4D4DFE." },
    ]);
  });
});

describe("footerTabIssues", () => {
  it("has no issues for the defaults", () => {
    expect(footerTabIssues(BASE)).toEqual([]);
  });

  it("reports a phone switched on with no value", () => {
    const issues = footerTabIssues({
      ...BASE,
      footerPhone: { enabled: true, countryCode: "+61", value: "" },
    });
    expect(issues).toEqual([
      { key: "footerPhone", message: "Enter a phone number." },
    ]);
  });

  it("reports a social link switched on with no value, keyed per link", () => {
    const issues = footerTabIssues({
      ...BASE,
      footerLinks: {
        ...BASE.footerLinks,
        facebook: { enabled: true, value: "" },
      },
    });
    expect(issues).toEqual([
      { key: "footer-facebook", message: "Enter a value, or switch this off." },
    ]);
  });
});

describe("numbering helpers", () => {
  it("read prefix and next number for each document type", () => {
    expect(invoiceNumbering(BASE)).toEqual({ prefix: "INV", next: "25" });
    expect(quoteNumbering(BASE)).toEqual({ prefix: "QUO", next: "45410" });
    expect(refundNumbering(BASE)).toEqual({ prefix: "CRN", next: "5" });
  });
});

describe("isSalesTab", () => {
  it("accepts a real tab id", () => {
    expect(isSalesTab("branding")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isSalesTab("not-a-tab")).toBe(false);
  });
});

describe("TAB_KEYS", () => {
  it("no longer gives the Settings tab credit note or invoice email fields", () => {
    expect(TAB_KEYS.settings).toEqual([
      "invoicePrefix",
      "nextInvoiceNumber",
      "quotePrefix",
      "nextQuoteNumber",
    ]);
  });

  it("gives each Styling tab its NDIS slot alongside the general/classic one", () => {
    expect(TAB_KEYS["invoice-styling"]).toEqual(["invoiceStyle", "ndisInvoiceStyle"]);
    expect(TAB_KEYS["quote-styling"]).toEqual(["quoteStyle", "ndisQuoteStyle"]);
  });
});

describe("tabSlice, tabDefaults and tabDirty", () => {
  it("tabSlice picks only the keys the tab owns", () => {
    expect(tabSlice("branding", BASE)).toEqual({
      logo: null,
      brandColor: "#4D4DFE",
      contentColor: "#0F1117",
    });
  });

  it("tabDefaults is the same slice taken from the factory defaults", () => {
    expect(tabDefaults("branding")).toEqual(
      tabSlice("branding", DEFAULT_SALES_SETTINGS),
    );
  });

  it("tabDirty is false when nothing in the tab's own keys changed", () => {
    const edited = { ...BASE, invoiceNotes: "changed, but on a different tab" };
    expect(tabDirty("branding", edited, BASE)).toBe(false);
  });

  it("tabDirty is true once a key the tab owns changes", () => {
    const edited = { ...BASE, brandColor: "#000000" };
    expect(tabDirty("branding", edited, BASE)).toBe(true);
  });

  it("tabDirty compares nested objects by value, not by reference", () => {
    const edited = { ...BASE, footerLinks: { ...BASE.footerLinks } };
    expect(tabDirty("footer", edited, BASE)).toBe(false);
  });
});

describe("migrateSalesSettings", () => {
  it("fills in every default when given nothing", () => {
    expect(migrateSalesSettings(undefined)).toEqual(DEFAULT_SALES_SETTINGS);
  });

  it("keeps a stored flat value instead of the default", () => {
    const migrated = migrateSalesSettings({ brandColor: "#000000" });
    expect(migrated.brandColor).toBe("#000000");
    expect(migrated.contentColor).toBe(DEFAULT_SALES_SETTINGS.contentColor);
  });

  it("merges a partial nested record instead of dropping the rest of it", () => {
    const migrated = migrateSalesSettings({
      invoiceFields: { customerName: false },
    });
    expect(migrated.invoiceFields.customerName).toBe(false);
    // Every other invoice field is still there, untouched.
    expect(migrated.invoiceFields.gst).toBe(true);
  });

  it("merges a partial footerPhone and footerLinks instead of dropping fields", () => {
    const migrated = migrateSalesSettings({
      footerPhone: { value: "999 999 999" },
      footerLinks: { facebook: { enabled: true, value: "https://fb.com/x" } },
    });
    expect(migrated.footerPhone).toEqual({
      enabled: DEFAULT_SALES_SETTINGS.footerPhone.enabled,
      countryCode: DEFAULT_SALES_SETTINGS.footerPhone.countryCode,
      value: "999 999 999",
    });
    expect(migrated.footerLinks.facebook).toEqual({
      enabled: true,
      value: "https://fb.com/x",
    });
    expect(migrated.footerLinks.website).toEqual(DEFAULT_SALES_SETTINGS.footerLinks.website);
  });

  it("ignores a key that isn't part of the shape at all", () => {
    const migrated = migrateSalesSettings({ notAField: "whatever" } as unknown);
    expect(migrated).not.toHaveProperty("notAField");
  });
});

describe("DEFAULT_SALES_SETTINGS", () => {
  it("prints ABN off and auto paid receipt off by default, everything else on", () => {
    expect(DEFAULT_SALES_SETTINGS.invoiceFields.customerAbn).toBe(false);
    expect(DEFAULT_SALES_SETTINGS.invoiceFields.autoPaidReceipt).toBe(false);
    expect(DEFAULT_SALES_SETTINGS.invoiceFields.customerName).toBe(true);
    expect(DEFAULT_SALES_SETTINGS.quoteFields.customerAbn).toBe(false);
    expect(DEFAULT_SALES_SETTINGS.quoteFields.autoPaidReceipt).toBe(false);
  });
});
