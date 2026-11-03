import { describe, expect, it } from "vitest";

import {
  INVOICE_STYLE_GROUPS,
  QUOTE_STYLE_GROUPS,
  allStyles,
  findStyle,
  styleGroupLabel,
} from "@/lib/document-styles";
import { DEFAULT_SALES_SETTINGS } from "@/lib/sales-settings";

describe("the style catalogs", () => {
  it("groups invoice styles as 6 General, 4 NDIS, 4 Classic", () => {
    expect(
      INVOICE_STYLE_GROUPS.map((group) => [group.label, group.styles.length]),
    ).toEqual([
      ["General Style", 6],
      ["NDIS Style", 4],
      ["Classic Template", 4],
    ]);
  });

  it("groups quote styles as 6 General, 4 Classic, 4 NDIS", () => {
    expect(
      QUOTE_STYLE_GROUPS.map((group) => [group.label, group.styles.length]),
    ).toEqual([
      ["General Styles", 6],
      ["Classic Styles", 4],
      ["NDIS Styles", 4],
    ]);
  });

  it("never reuses an id, within or across the two catalogs", () => {
    const ids = [...allStyles(INVOICE_STYLE_GROUPS), ...allStyles(QUOTE_STYLE_GROUPS)].map(
      (style) => style.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("holds the four style ids the sales-settings defaults point at", () => {
    const invoiceIds = allStyles(INVOICE_STYLE_GROUPS).map((style) => style.id);
    const quoteIds = allStyles(QUOTE_STYLE_GROUPS).map((style) => style.id);
    expect(invoiceIds).toContain(DEFAULT_SALES_SETTINGS.invoiceStyle);
    expect(invoiceIds).toContain(DEFAULT_SALES_SETTINGS.ndisInvoiceStyle);
    expect(quoteIds).toContain(DEFAULT_SALES_SETTINGS.quoteStyle);
    expect(quoteIds).toContain(DEFAULT_SALES_SETTINGS.ndisQuoteStyle);
  });
});

describe("allStyles", () => {
  it("flattens the groups in order", () => {
    const styles = allStyles(INVOICE_STYLE_GROUPS);
    expect(styles).toHaveLength(14);
    expect(styles[0].id).toBe("general-01");
    expect(styles[6].id).toBe("ndis-01");
    expect(styles[13].id).toBe("classic-04");
  });

  it("is empty for no groups", () => {
    expect(allStyles([])).toEqual([]);
  });
});

describe("findStyle", () => {
  it("finds a style in any group by id", () => {
    expect(findStyle(QUOTE_STYLE_GROUPS, "quote-ndis-02")).toMatchObject({
      id: "quote-ndis-02",
      name: "NDIS Claim",
      layout: "block",
      density: "compact",
      tintedTableHeader: true,
    });
  });

  it("falls back to the first style for an unknown id, so the preview never blanks", () => {
    expect(findStyle(INVOICE_STYLE_GROUPS, "nope").id).toBe("general-01");
    expect(findStyle(QUOTE_STYLE_GROUPS, "").id).toBe("quote-general-01");
  });

  it("falls back for a numeric server template id — the catalog only knows local ids", () => {
    // What fields-tab.tsx passes once get-branding has filled the store.
    expect(findStyle(INVOICE_STYLE_GROUPS, "7").id).toBe("general-01");
    expect(findStyle(QUOTE_STYLE_GROUPS, "13").id).toBe("quote-general-01");
  });

  it("doesn't find an invoice style in the quote catalog", () => {
    expect(findStyle(QUOTE_STYLE_GROUPS, "ndis-01").id).toBe("quote-general-01");
  });
});

describe("styleGroupLabel", () => {
  it("names the group a style sits in, or nothing for an unknown id", () => {
    expect(styleGroupLabel(INVOICE_STYLE_GROUPS, "classic-02")).toBe("Classic Template");
    expect(styleGroupLabel(QUOTE_STYLE_GROUPS, "quote-ndis-01")).toBe("NDIS Styles");
    expect(styleGroupLabel(INVOICE_STYLE_GROUPS, "quote-ndis-01")).toBeUndefined();
  });
});
