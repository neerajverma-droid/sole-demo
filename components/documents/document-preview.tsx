"use client";

import { useCountryContext } from "@/hooks/use-country-context";
import {
  countryLabel,
  customerIdLabel,
  documentHeading,
  taxWord,
  type DocumentIdentifier,
} from "@/lib/country-context";
import { cn } from "@/lib/utils";
import type { DocumentStyle } from "@/lib/document-styles";
import { invoiceMoney } from "@/lib/invoices";
import { normaliseHex, type DocumentFields } from "@/lib/sales-settings";

/**
 * A rendered invoice or quote, honouring the style, the field toggles, the notes
 * and the brand colours from Sales settings.
 *
 * This is the thing the field switches act on: if a toggle here changed nothing
 * visible, the settings screen would be decoration. It doubles as the preview in
 * the styling gallery and as the enlarged Preview dialog, so both show the real
 * effect rather than a stock thumbnail.
 */
export type PreviewDoc = {
  kind: "Invoice" | "Quote";
  number: string;
  date: string;
  /** Business — "your" side. */
  businessName: string;
  businessPerson: string;
  businessAddress: string;
  businessAbn: string;
  /**
   * The business's numbers as its country labels them (ABN; NZBN and GST
   * number; …). When given, printed instead of `businessAbn`.
   */
  businessIdentifiers?: DocumentIdentifier[];
  /** Client — "customer" side. */
  customerName: string;
  customerBusinessName: string;
  customerAddress: string;
  customerAbn: string;
  lines: {
    name: string;
    description: string;
    quantity: string;
    quantityType: string;
    price: number;
  }[];
  notes: string;
  logo: string | null;
  footer: string[];
};

export function DocumentPreview({
  doc,
  style,
  fields,
  brandColor,
  contentColor,
  className,
}: {
  doc: PreviewDoc;
  style: DocumentStyle;
  fields: DocumentFields;
  brandColor: string;
  contentColor: string;
  className?: string;
}) {
  // The preview shows this business's own country: "VAT" and 15% for a South
  // African business, not a hardcoded Australian 10% GST. The rate is the one
  // in effect today, from the Country Registry.
  const { country } = useCountryContext();
  const tax = taxWord(country);
  const businessIdLabel = countryLabel(country, "business_id", "ABN");
  const taxRate = country.standardRate ?? 0;

  const brand = normaliseHex(brandColor);
  const ink = normaliseHex(contentColor);
  const compact = style.density === "compact";

  const subtotal = doc.lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * line.price,
    0,
  );
  const gst = fields.gst ? (subtotal * taxRate) / 100 : 0;
  // "TAX INVOICE" when tax is charged, as the rendered PDF heads it.
  const heading = documentHeading(country, doc.kind === "Quote" ? "quote" : "invoice", gst > 0);
  const businessNumbers = doc.businessIdentifiers
    ? doc.businessIdentifiers.map((identifier) => `${identifier.label} ${identifier.value}`)
    : doc.businessAbn
      ? [`${businessIdLabel} ${doc.businessAbn}`]
      : [];

  /** Whichever "from" lines are switched on. */
  const fromLines = [
    fields.yourBusinessName ? doc.businessName : null,
    fields.yourName ? doc.businessPerson : null,
    fields.yourBusinessAddress ? doc.businessAddress : null,
    ...(fields.yourBusinessAbn ? businessNumbers : []),
  ].filter(Boolean) as string[];

  const toLines = [
    fields.customerBusinessName ? doc.customerBusinessName : null,
    fields.customerName ? doc.customerName : null,
    fields.customerAddress ? doc.customerAddress : null,
    fields.customerAbn ? `${customerIdLabel(country)} ${doc.customerAbn}` : null,
  ].filter(Boolean) as string[];

  return (
    // A fixed A4-ish ratio, always light: a document is printed on paper, so it
    // doesn't follow the app's theme.
    <div
      className={cn(
        "flex aspect-[1/1.414] w-full flex-col overflow-hidden bg-white text-[6px] leading-tight",
        className,
      )}
      style={{ color: ink }}
    >
      {style.layout === "banner" && (
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ backgroundColor: brand, color: "#FFFFFF" }}
        >
          <Title doc={doc} heading={heading} />
          <Logo doc={doc} inverted />
        </div>
      )}

      <div
        className={cn(
          "flex min-h-0 flex-1",
          style.layout === "sidebar" && "gap-2",
        )}
      >
        {style.layout === "sidebar" && (
          <div className="w-1.5 shrink-0" style={{ backgroundColor: brand }} />
        )}

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            compact ? "gap-1.5 p-2.5" : "gap-2 p-3",
          )}
        >
          {style.layout !== "banner" && (
            <div
              className={cn(
                "flex items-start gap-2",
                style.layout === "centred"
                  ? "flex-col items-center text-center"
                  : "justify-between",
              )}
            >
              {style.layout === "block" && (
                <div
                  className="size-5 shrink-0 rounded"
                  style={{ backgroundColor: brand }}
                  aria-hidden
                />
              )}
              <Title
                doc={doc}
                heading={heading}
                accent={style.layout === "minimal" ? undefined : brand}
              />
              <Logo doc={doc} />
            </div>
          )}

          {(style.layout === "rule" || style.layout === "centred") && (
            <div
              className={cn(
                "h-[1.5px] shrink-0",
                style.layout === "centred" && "w-8 self-center",
              )}
              style={{ backgroundColor: brand }}
              aria-hidden
            />
          )}
          {style.layout === "classic" && (
            <div className="h-[1px] shrink-0 bg-neutral-300" aria-hidden />
          )}

          {/* From / To — only the switched-on lines. */}
          <div className="flex gap-3">
            {fromLines.length > 0 && <Party label="From" lines={fromLines} />}
            {toLines.length > 0 && <Party label="To" lines={toLines} />}
          </div>

          {/* Line items */}
          <div className="min-h-0 flex-1">
            <div
              className={cn(
                "flex items-center gap-1 px-1 py-0.5 font-semibold",
                style.layout === "classic" && "border-y border-neutral-300",
              )}
              style={
                style.tintedTableHeader
                  ? { backgroundColor: `${brand}1A`, color: brand }
                  : undefined
              }
            >
              <span className="flex-1">Item</span>
              {fields.quantityType && (
                <span className="w-8 text-right">Qty</span>
              )}
              <span className="w-8 text-right">Price</span>
              <span className="w-9 text-right">Amount</span>
            </div>
            {doc.lines.map((line, index) => (
              <div
                // By position: two lines on one document can legitimately carry
                // the same description, and React needs the keys to differ.
                key={index}
                className="flex items-start gap-1 border-b border-neutral-200 px-1 py-0.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{line.name}</span>
                  {/* Off means the second line simply isn't printed. */}
                  {fields.itemDescriptions && line.description && (
                    <span className="block truncate text-neutral-500">
                      {line.description}
                    </span>
                  )}
                </span>
                {fields.quantityType && (
                  <span className="w-8 shrink-0 text-right">
                    {line.quantity} {line.quantityType}
                  </span>
                )}
                <span className="w-8 shrink-0 text-right">
                  {invoiceMoney(line.price)}
                </span>
                <span className="w-9 shrink-0 text-right">
                  {invoiceMoney((Number(line.quantity) || 0) * line.price)}
                </span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="ml-auto w-24 space-y-0.5">
            <Total label="Subtotal" value={invoiceMoney(subtotal)} />
            {/* Tax off means no tax line at all, not a zero. */}
            {fields.gst && <Total label={tax} value={invoiceMoney(gst)} />}
            <div
              className="flex justify-between border-t pt-0.5 font-semibold"
              style={{ borderColor: brand, color: brand }}
            >
              <span>Total</span>
              <span>{invoiceMoney(subtotal + gst)}</span>
            </div>
          </div>

          {doc.notes.trim() && (
            <p className="line-clamp-2 text-neutral-500">{doc.notes}</p>
          )}

          {doc.footer.length > 0 && (
            <p className="truncate border-t border-neutral-200 pt-1 text-neutral-500">
              {doc.footer.join("  ·  ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Title({
  doc,
  heading,
  accent,
}: {
  doc: PreviewDoc;
  heading: string;
  accent?: string;
}) {
  return (
    <div className="min-w-0">
      <p
        className="text-[9px] font-extrabold uppercase leading-none tracking-tight"
        style={accent ? { color: accent } : undefined}
      >
        {heading}
      </p>
      <p className="truncate">
        {doc.number} · {doc.date}
      </p>
    </div>
  );
}

function Logo({ doc, inverted }: { doc: PreviewDoc; inverted?: boolean }) {
  if (!doc.logo) return null;
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center overflow-hidden rounded",
        inverted ? "bg-white/20" : "bg-neutral-100",
      )}
      aria-hidden
    >
      {/* A data URL from the user's own upload. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={doc.logo} alt="" className="size-full object-contain p-0.5" />
    </span>
  );
}

function Party({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="font-semibold text-neutral-500">{label}</p>
      {lines.map((line, index) => (
        // Keyed by position for the same reason: a business whose trading name
        // matches its own name prints the line twice, and did so with one key.
        <p key={index} className="truncate">
          {line}
        </p>
      ))}
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-neutral-600">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
