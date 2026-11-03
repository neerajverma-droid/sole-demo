"use client";

import * as React from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
// Accounting basis is hidden for now (see below); kept for when it comes back.
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/documents/field";
import { SectionCard } from "@/components/settings/section-card";
import { useSectionDraft } from "@/components/settings/use-section-draft";
import { taxDraftAtom } from "@/lib/atoms";
import { apiErrorMessage } from "@/lib/api-error";
import { taxPercentageError } from "@/lib/tax-settings";
import { returnWord, taxWord } from "@/lib/country-context";
import { cn } from "@/lib/utils";
import { useTaxSettings } from "@/hooks/use-business-settings";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useCountryContext } from "@/hooks/use-country-context";

/**
 * Tax settings, in the business's own country's words.
 *
 * "GST", "10%", "BAS" and "1 July" were written into this form. Every one of
 * them is a different answer in New Zealand (GST, 15%, a GST return, 1 April)
 * and South Africa (VAT, 15%, a VAT201, 1 March), and all of them come from the
 * Country Registry — so the heading, the rate's hint, the filing frequencies
 * and the financial year are read from `/country-context` rather than being
 * written here. The registry's rate is offered as the standard one; a business
 * whose accountant has pinned a different rate keeps it.
 *
 * The rate is an explicit choice: follow the country's standard rate (the
 * registry's rate for each document's date, so a government change applies
 * itself with nothing to edit here) or a custom rate typed in. It is saved as
 * the record's `follow_country_rate`, never guessed from the number.
 *
 * "Registered for GST" and the rate are the default tax record on
 * `/v2/settings/tax-settings` (`is_default` and `tax_percentage`), the same
 * endpoint sole-webapp's `TaxesAndBanking/TaxSetup.js` reads and writes and
 * the same one the invoice and quote editors read to decide whether a new line
 * starts with GST on.
 *
 * The accounting basis is shown as Cash and locked: Sole works on a cash basis
 * only. Being disabled it never changes the draft, so the save never posts an
 * `accounting_type` — a business record that already says accrual is left as
 * it is rather than rewritten from here.
 *
 * BAS frequency and the financial year start used to sit here too. They had no
 * column anywhere in sole-ocr — only ever saved on the device — and nothing
 * else read them, so they were taken off rather than left as settings that
 * didn't do anything.
 */
export function TaxSection() {
  const { country } = useCountryContext();
  const { values: stored, loading, save } = useTaxSettings();
  const { business } = useActiveBusiness();
  const { values, dirty, patch, reset } = useSectionDraft(
    stored,
    taxDraftAtom,
    business?.id ?? null,
  );
  const [saving, setSaving] = React.useState(false);

  const tax = taxWord(country);
  const taxReturn = returnWord(country);
  // The registry rate for today. A rate scheduled to change later applies itself
  // server-side on its effective date — this is only what today's documents use.
  const standardRate = country.effectiveTax.countryRate ?? country.standardRate;
  const customRate = values.rateMode === "custom";

  // Only a custom rate can be wrong, and only while the tax is on — a business
  // that has just switched off registration shouldn't be held up by a field it
  // can no longer see.
  const rateIssue = values.gstRegistered && customRate
    ? taxPercentageError(values.gstRate, tax)
    : undefined;

  const onSave = async () => {
    if (rateIssue) {
      toast.error(rateIssue);
      return;
    }
    setSaving(true);
    try {
      await save(values);
      reset();
      toast.success("Tax settings saved");
    } catch (error) {
      // Draft kept, same as the other sections that can really fail.
      toast.error(apiErrorMessage(error, "Couldn't save your tax settings."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title={`Tax & ${tax}`}
      description={`How Sole calculates ${tax} and prepares your ${taxReturn}.`}
      dirty={dirty && !rateIssue && !loading}
      saving={saving}
      onSave={() => void onSave()}
    >
      <div className="flex items-center justify-between gap-[15px] rounded-md border p-[15px]">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Registered for {tax}</p>
          <p className="text-xs text-muted-foreground">
            Turn on once you&apos;re registered{country.taxAuthority ? ` with the ${country.taxAuthority}` : ""}. New
            invoice lines then start with {tax} applied and Sole prepares your {taxReturn}.
          </p>
        </div>
        <Switch
          checked={values.gstRegistered}
          disabled={loading}
          onCheckedChange={(checked) =>
            // Turning registration on starts at the country's standard rate; a
            // custom rate is a deliberate second choice, never the starting point.
            patch(checked ? { gstRegistered: true, rateMode: "country" } : { gstRegistered: false })
          }
          aria-label={`Registered for ${tax}`}
        />
      </div>

      {/* Reporting settings only mean something once the tax is on. */}
      {values.gstRegistered ? (
        <>
          <Separator />
          <div className="grid gap-[15px] sm:grid-cols-2">
            <Field
              label={`${tax} rate`}
              required
              error={rateIssue}
              hint={
                customRate
                  ? `Percentage points, 1–100. Keep your own figure only if your accountant set it${standardRate === null ? "" : ` — ${country.name}'s standard rate is ${standardRate}%`}.`
                  : `Changes automatically when ${country.taxAuthority || "the government"} changes the rate.`
              }
            >
              <RadioGroup
                value={values.rateMode}
                onValueChange={(mode) =>
                  patch({
                    rateMode: mode as "country" | "custom",
                    // Starting a custom rate from the standard one is the usual edit.
                    ...(mode === "custom" && !values.gstRate.trim() && standardRate !== null ? { gstRate: String(standardRate) } : {}),
                  })
                }
                disabled={loading}
                className="gap-2"
              >
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/50">
                  <RadioGroupItem value="country" aria-label={`Use ${country.name}'s standard rate`} />
                  <span>
                    {country.name}&apos;s standard rate
                    {standardRate === null ? "" : ` (${standardRate}%)`}
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/50">
                  <RadioGroupItem value="custom" aria-label="Use a custom rate" />
                  <span className="shrink-0">Custom rate</span>
                  {customRate && (
                    <span className="relative ml-auto w-24">
                      <Input
                        value={values.gstRate}
                        inputMode="decimal"
                        placeholder={standardRate === null ? undefined : String(standardRate)}
                        disabled={loading}
                        onChange={(event) => patch({ gstRate: event.target.value })}
                        aria-label={`Custom ${tax} rate`}
                        aria-invalid={!!rateIssue}
                        className={cn(
                          "h-8 pr-7 text-right tabular",
                          rateIssue &&
                            "border-destructive focus-visible:ring-destructive",
                        )}
                      />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        %
                      </span>
                    </span>
                  )}
                </label>
              </RadioGroup>
            </Field>

            {/* Accounting basis — hidden for now, kept for when it comes back.
            <Field
              label="Accounting basis"
              hint={`Sole reports ${tax} on a cash basis — when money moves, not when you invoice.`}
            >
              <Select value="Cash" disabled>
                <SelectTrigger aria-label="Accounting basis">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            */}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          The {tax} rate appears once you&apos;re registered for {tax}.
        </p>
      )}
    </SectionCard>
  );
}
