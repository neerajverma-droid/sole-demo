/**
 * The sample document every preview renders. One source, so the styling gallery,
 * the enlarged Preview and the editors all show the same thing.
 */
import type { PreviewDoc } from "@/components/documents/document-preview";
import {
  formatInvoiceDate,
  lineTotals,
  type Invoice,
} from "@/lib/invoices";
import {
  documentNumberPreview,
  FOOTER_LINKS,
  type SalesSettings,
} from "@/lib/sales-settings";
import type { DocumentIdentifier } from "@/lib/country-context";

/** The footer strings that are switched on, in the order they're configured. */
export function footerParts(settings: SalesSettings): string[] {
  const parts: string[] = [];
  if (settings.footerPhone.enabled && settings.footerPhone.value.trim()) {
    parts.push(
      `${settings.footerPhone.countryCode} ${settings.footerPhone.value.trim()}`,
    );
  }
  for (const link of FOOTER_LINKS) {
    const entry = settings.footerLinks[link.key];
    if (entry.enabled && entry.value.trim()) parts.push(entry.value.trim());
  }
  return parts;
}

/**
 * A real invoice as the printable document, rather than the sample.
 *
 * Line prices are the ex-GST unit price, because `DocumentPreview` adds GST
 * itself when the field is on — passing an inclusive figure would tax it twice.
 * Per-line discounts are folded into the unit price, since the printed layout
 * has no discount column to show them in.
 */
/**
 * Only the three fields the preview actually prints, so this doesn't need the
 * whole business profile — and doesn't have to change shape every time that
 * profile does.
 */
export type PreviewBusiness = {
  businessName: string;
  address: string;
  abn: string;
  /** The business's numbers as its country labels them; preferred over `abn`. */
  identifiers?: DocumentIdentifier[];
};

export function invoicePreviewDoc(
  invoice: Invoice,
  settings: SalesSettings,
  business: PreviewBusiness,
  client: {
    name: string;
    businessName: string;
    address: string;
    abn: string;
  },
): PreviewDoc {
  return {
    kind: "Invoice",
    number: invoice.number,
    date: formatInvoiceDate(invoice.issued),
    businessName: business.businessName,
    businessPerson: business.businessName,
    businessAddress: business.address,
    businessAbn: business.abn,
    businessIdentifiers: business.identifiers,
    customerName: client.name,
    customerBusinessName: client.businessName,
    customerAddress: client.address,
    customerAbn: client.abn,
    lines: invoice.items
      .filter((item) => lineTotals(item).net > 0)
      .map((item) => {
        const quantity = Number(item.quantity) || 0;
        const line = lineTotals(item);
        return {
          name: item.description,
          description: "",
          quantity: item.quantity,
          quantityType: "Items",
          price: quantity > 0 ? line.net / quantity : line.net,
        };
      }),
    notes: invoice.notes,
    logo: settings.logo,
    footer: footerParts(settings),
  };
}

export function samplePreviewDoc(
  kind: "Invoice" | "Quote",
  settings: SalesSettings,
  business: PreviewBusiness,
): PreviewDoc {
  const numbering =
    kind === "Invoice"
      ? documentNumberPreview(
          settings.invoicePrefix || "INV-",
          settings.nextInvoiceNumber,
        )
      : documentNumberPreview(
          settings.quotePrefix || "QUO-",
          settings.nextQuoteNumber,
        );

  return {
    kind,
    number: numbering,
    date: "05/08/2026",
    businessName: business.businessName,
    businessPerson: "Jonathan Adah",
    businessAddress: business.address,
    businessAbn: business.abn,
    businessIdentifiers: business.identifiers,
    customerName: "Alex Turner",
    customerBusinessName: "Turner Consulting",
    customerAddress: "88 Bourke St, Melbourne VIC 3000",
    customerAbn: "98 765 432 109",
    lines: [
      {
        name: "Advisory — day rate",
        description: "Strategy workshop and written recommendations",
        quantity: "2",
        quantityType: "Days",
        price: 1250,
      },
      {
        name: "Report & recommendations",
        description: "Final report, delivered as PDF",
        quantity: "1",
        quantityType: "Items",
        price: 900,
      },
      {
        name: "Travel",
        description: "Return airfare, at cost",
        quantity: "1",
        quantityType: "Items",
        price: 260,
      },
    ],
    notes: kind === "Invoice" ? settings.invoiceNotes : settings.quoteNotes,
    logo: settings.logo,
    footer: footerParts(settings),
  };
}
