/**
 * Invoice and quote styles.
 *
 * A style is a small set of layout choices rather than a bespoke component, so
 * fourteen of them are fourteen data rows and one renderer. `DocumentPreview`
 * reads these; adding a style means adding an entry here.
 */

/** Where the header sits and how the accent is used. */
export type StyleLayout =
  | "banner" // full-width accent band behind the title
  | "rule" // thin accent rule under a plain header
  | "sidebar" // accent column down the left edge
  | "block" // accent square beside the title
  | "minimal" // no accent furniture at all
  | "centred" // title centred, accent underline
  | "classic"; // ruled table, serif-ish weighting, no accent fill

export type DocumentStyle = {
  id: string;
  name: string;
  layout: StyleLayout;
  /** Compact fits more lines before it needs a second page. */
  density: "compact" | "regular";
  /** Whether the table header carries the accent colour. */
  tintedTableHeader: boolean;
};

export type DocumentStyleGroup = {
  label: string;
  styles: DocumentStyle[];
};

function style(
  id: string,
  name: string,
  layout: StyleLayout,
  density: DocumentStyle["density"] = "regular",
  tintedTableHeader = false,
): DocumentStyle {
  return { id, name, layout, density, tintedTableHeader };
}

export const INVOICE_STYLE_GROUPS: DocumentStyleGroup[] = [
  {
    label: "General Style",
    styles: [
      style("general-01", "Standard", "rule", "regular", true),
      style("general-02", "Banner", "banner"),
      style("general-03", "Sidebar", "sidebar"),
      style("general-04", "Block", "block", "regular", true),
      style("general-05", "Minimal", "minimal", "compact"),
      style("general-06", "Centred", "centred"),
    ],
  },
  {
    label: "NDIS Style",
    styles: [
      style("ndis-01", "NDIS Standard", "rule", "compact", true),
      style("ndis-02", "NDIS Claim", "block", "compact", true),
      style("ndis-03", "NDIS Plain", "minimal", "compact"),
      style("ndis-04", "NDIS Banner", "banner", "compact"),
    ],
  },
  {
    label: "Classic Template",
    styles: [
      style("classic-01", "Classic", "classic"),
      style("classic-02", "Classic Ruled", "classic", "compact", true),
      style("classic-03", "Classic Centred", "centred", "regular"),
      style("classic-04", "Classic Plain", "minimal"),
    ],
  },
];

export const QUOTE_STYLE_GROUPS: DocumentStyleGroup[] = [
  {
    label: "General Styles",
    styles: [
      style("quote-general-01", "Standard", "rule", "regular", true),
      style("quote-general-02", "Banner", "banner"),
      style("quote-general-03", "Sidebar", "sidebar"),
      style("quote-general-04", "Block", "block", "regular", true),
      style("quote-general-05", "Minimal", "minimal", "compact"),
      style("quote-general-06", "Centred", "centred"),
    ],
  },
  {
    label: "Classic Styles",
    styles: [
      style("quote-classic-01", "Classic", "classic"),
      style("quote-classic-02", "Classic Ruled", "classic", "compact", true),
      style("quote-classic-03", "Classic Centred", "centred"),
      style("quote-classic-04", "Classic Plain", "minimal"),
    ],
  },
  {
    label: "NDIS Styles",
    styles: [
      style("quote-ndis-01", "NDIS Standard", "rule", "compact", true),
      style("quote-ndis-02", "NDIS Claim", "block", "compact", true),
      style("quote-ndis-03", "NDIS Plain", "minimal", "compact"),
      style("quote-ndis-04", "NDIS Banner", "banner", "compact"),
    ],
  },
];

export function allStyles(groups: DocumentStyleGroup[]): DocumentStyle[] {
  return groups.flatMap((group) => group.styles);
}

/** Falls back to the first style, so a stale saved id can't blank the preview. */
export function findStyle(
  groups: DocumentStyleGroup[],
  id: string,
): DocumentStyle {
  return allStyles(groups).find((entry) => entry.id === id) ?? groups[0].styles[0];
}

export function styleGroupLabel(
  groups: DocumentStyleGroup[],
  id: string,
): string | undefined {
  return groups.find((group) => group.styles.some((s) => s.id === id))?.label;
}
