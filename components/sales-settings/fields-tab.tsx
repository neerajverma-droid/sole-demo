"use client";

import * as React from "react";
import { CheckCircle2, FileText, ListChecks, StickyNote } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import { DocumentPreview } from "@/components/documents/document-preview";
import { SalesSection } from "@/components/sales-settings/tab-shell";
import { findStyle, INVOICE_STYLE_GROUPS, QUOTE_STYLE_GROUPS } from "@/lib/document-styles";
import { samplePreviewDoc } from "@/lib/preview-doc";
import {
  documentFieldsFor,
  QUOTE_ACCEPTANCE_ACTIONS,
  type DocumentFieldKey,
  type DocumentFields,
  type QuoteAcceptanceAction,
  type SalesSettings,
} from "@/lib/sales-settings";
import { useCountryContext } from "@/hooks/use-country-context";
import { businessIdentifiers, countryLabel, taxWord } from "@/lib/country-context";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useBusinessDetails } from "@/hooks/use-business-settings";

/** The width `DocumentPreview`'s px-sized type and spacing were drawn for. */
const PREVIEW_BASE_WIDTH = 280;

/**
 * The switches this tab offers, named the way this business's country names
 * them — "Your business NZBN" rather than "Your business ABN", "VAT" rather
 * than "GST".
 *
 * "Auto paid receipt" isn't one of them: it's hidden rather than removed from
 * `DOCUMENT_FIELDS`, so the saved value still round-trips to the API untouched
 * instead of being reset on the next save.
 */
function shownFields(labels: { businessId: string; tax: string }) {
  return documentFieldsFor(labels).filter((field) => field.key !== "autoPaidReceipt");
}

/**
 * Tabs 4 and 5. Identical field list, so one component with a `kind` — and a live
 * preview beside it, because a switch you can't see the effect of is decoration.
 */
export function FieldsTab({
  kind,
  values,
  patch,
}: {
  kind: "Invoice" | "Quote";
  values: SalesSettings;
  patch: (next: Partial<SalesSettings>) => void;
}) {
  const { values: business } = useBusinessDetails();
  const { business: activeBusiness } = useActiveBusiness();
  const { country } = useCountryContext();
  const shownFieldList = React.useMemo(
    () => shownFields({ businessId: countryLabel(country, "business_id", "ABN"), tax: taxWord(country) }),
    [country],
  );
  const isInvoice = kind === "Invoice";
  const fields = isInvoice ? values.invoiceFields : values.quoteFields;
  const notes = isInvoice ? values.invoiceNotes : values.quoteNotes;

  const setField = (key: DocumentFieldKey, on: boolean) => {
    const next: DocumentFields = { ...fields, [key]: on };
    patch(isInvoice ? { invoiceFields: next } : { quoteFields: next });
  };

  const previewRef = React.useRef<HTMLDivElement>(null);
  const [previewZoom, setPreviewZoom] = React.useState(1);
  React.useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width > 0) setPreviewZoom(width / PREVIEW_BASE_WIDTH);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const groups = [...new Set(shownFieldList.map((field) => field.group))];
  const styleGroups = isInvoice ? INVOICE_STYLE_GROUPS : QUOTE_STYLE_GROUPS;

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="space-y-4">
        <SalesSection
          icon={ListChecks}
          title={`${kind} Field Settings`}
          description={`Choose what prints on a ${kind.toLowerCase()}. Switching one off removes it from the document — it doesn't stop you recording it.`}
        >
          {groups.map((group) => (
            <div key={group} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </p>
              <div className="divide-y rounded-md border border-border">
                {shownFieldList.filter((field) => field.group === group).map(
                  (field) => (
                    <label
                      key={field.key}
                      className="flex cursor-pointer items-center justify-between gap-4 p-3"
                    >
                      <span className="text-sm">{field.label}</span>
                      <Switch
                        checked={fields[field.key]}
                        onCheckedChange={(on) => setField(field.key, on)}
                        aria-label={field.label}
                      />
                    </label>
                  ),
                )}
              </div>
            </div>
          ))}
        </SalesSection>

        <SalesSection
          icon={StickyNote}
          title={`Custom ${kind} Notes`}
          description={`Printed at the foot of every ${kind.toLowerCase()}, and prefilled into the notes field of a new one so you can change it per document.`}
        >
          <Field label={`${kind} notes`}>
            <Textarea
              rows={4}
              value={notes}
              onChange={(event) =>
                patch(
                  isInvoice
                    ? { invoiceNotes: event.target.value }
                    : { quoteNotes: event.target.value },
                )
              }
              placeholder={
                isInvoice
                  ? "Payment due within the terms above…"
                  : "This quote is valid for the period above…"
              }
            />
          </Field>
        </SalesSection>

        {!isInvoice && (
          <SalesSection
            icon={CheckCircle2}
            title="Quote Acceptance Flow"
            description="What happens the moment a client accepts."
          >
            <Field
              label="Invoice action after acceptance"
              hint="Deposit quotes will create the deposit invoice first."
            >
              <Select
                value={values.quoteAcceptanceAction}
                onValueChange={(value) =>
                  patch({
                    quoteAcceptanceAction: value as QuoteAcceptanceAction,
                  })
                }
              >
                <SelectTrigger aria-label="Invoice action after acceptance">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUOTE_ACCEPTANCE_ACTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </SalesSection>
        )}
      </div>

      {/* Sticky so the effect stays in view while you work down the list. */}
      <div className="space-y-2 lg:sticky lg:top-6">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <FileText className="size-3.5" aria-hidden />
          Live preview
        </p>
        <div
          ref={previewRef}
          className="overflow-hidden rounded-lg border border-border shadow-sm"
        >
          {/*
            The preview's type and spacing are drawn for a 280px page, so it's
            laid out at that width and zoomed to fill the half-width column —
            a bigger page rather than the same tiny text with more white space.
          */}
          <div style={{ width: PREVIEW_BASE_WIDTH, zoom: previewZoom }}>
            <DocumentPreview
              doc={samplePreviewDoc(kind, values, {
                businessName: business.businessName,
                abn: business.abn,
                identifiers: businessIdentifiers(country, activeBusiness),
                // The whole address on one line — what the document prints.
                address: business.addressSearch,
              })}
              style={findStyle(
                styleGroups,
                isInvoice ? values.invoiceStyle : values.quoteStyle,
              )}
              fields={fields}
              brandColor={values.brandColor}
              contentColor={values.contentColor}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Updates as you switch fields on and off.
        </p>
      </div>
    </div>
  );
}
