"use client";

import { Hash } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Field } from "@/components/documents/field";
import { SalesSection } from "@/components/sales-settings/tab-shell";
import {
  documentNumberPreview,
  nextNumberError,
  prefixError,
  type SalesSettings,
} from "@/lib/sales-settings";
import { cn } from "@/lib/utils";

export function SettingsTab({
  values,
  patch,
}: {
  values: SalesSettings;
  patch: (next: Partial<SalesSettings>) => void;
}) {
  return (
    <div className="space-y-4">
      <SalesSection
        icon={Hash}
        title="Invoice & Quote Numbers"
        description="Sole numbers each document for you, counting up from the next number below. Change the next number and the sequence continues from there — it never goes backwards past something you've already issued."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice prefix" required error={prefixError(values.invoicePrefix)}>
            <Input
              value={values.invoicePrefix}
              onChange={(event) => patch({ invoicePrefix: event.target.value })}
              placeholder="INV-"
              aria-invalid={!!prefixError(values.invoicePrefix)}
              className={cn(
                "tabular",
                prefixError(values.invoicePrefix) &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </Field>

          <Field
            label="Invoice next number"
            required
            error={nextNumberError(values.nextInvoiceNumber)}
            hint={
              nextNumberError(values.nextInvoiceNumber)
                ? undefined
                : `Next invoice will be ${documentNumberPreview(values.invoicePrefix, values.nextInvoiceNumber)}.`
            }
          >
            <Input
              value={values.nextInvoiceNumber}
              inputMode="numeric"
              onChange={(event) =>
                patch({ nextInvoiceNumber: event.target.value })
              }
              aria-invalid={!!nextNumberError(values.nextInvoiceNumber)}
              className={cn(
                "tabular",
                nextNumberError(values.nextInvoiceNumber) &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </Field>

          <Field label="Quote prefix" required error={prefixError(values.quotePrefix)}>
            <Input
              value={values.quotePrefix}
              onChange={(event) => patch({ quotePrefix: event.target.value })}
              placeholder="QUO-"
              aria-invalid={!!prefixError(values.quotePrefix)}
              className={cn(
                "tabular",
                prefixError(values.quotePrefix) &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </Field>

          <Field
            label="Quote next number"
            required
            error={nextNumberError(values.nextQuoteNumber)}
            hint={
              nextNumberError(values.nextQuoteNumber)
                ? undefined
                : `Next quote will be ${documentNumberPreview(values.quotePrefix, values.nextQuoteNumber)}.`
            }
          >
            <Input
              value={values.nextQuoteNumber}
              inputMode="numeric"
              onChange={(event) => patch({ nextQuoteNumber: event.target.value })}
              aria-invalid={!!nextNumberError(values.nextQuoteNumber)}
              className={cn(
                "tabular",
                nextNumberError(values.nextQuoteNumber) &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
          </Field>
        </div>
      </SalesSection>
    </div>
  );
}
