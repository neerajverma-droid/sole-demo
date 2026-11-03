"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import { AuthError } from "@/components/auth/auth-states";
import { useStageCountryMutation } from "@/hooks/use-admin-countries-query";
import { registryErrorMessage, type CountryConfig } from "@/lib/admin/countries";

/**
 * The words a country's documents and its assistant use.
 *
 * These are not cosmetic. `labels.tax` is printed on every invoice and used in
 * the chart of accounts and the BAS/GST101A/VAT201 headings; `labels.business_id`
 * is what the ABN field is called; `ai_context` is the paragraph the OCR and the
 * assistant are told before they read a receipt. Getting "VAT" in front of a
 * South African business is a registry edit here, not a release.
 *
 * Staged like everything else — nothing reaches a business until the country is
 * published.
 */
const LABEL_FIELDS: { key: string; label: string; hint: string; placeholder: string }[] = [
  { key: "tax", label: "The tax", hint: "Printed on invoices, reports and the chart of accounts.", placeholder: "GST" },
  { key: "tax_invoice", label: "Tax invoice", hint: "The heading on a document that carries tax.", placeholder: "Tax Invoice" },
  { key: "tax_return", label: "The return", hint: "Short name, used in report titles and emails.", placeholder: "BAS" },
  { key: "tax_return_long", label: "The return, in full", hint: "", placeholder: "Business Activity Statement" },
  { key: "tax_authority", label: "The authority", hint: "", placeholder: "ATO" },
  { key: "business_id", label: "Business number", hint: "The company identifier printed on documents.", placeholder: "ABN" },
  { key: "tax_id", label: "Tax number", hint: "The registration number, where it differs.", placeholder: "ABN" },
  { key: "bank_branch", label: "Bank branch code", hint: "Leave empty where a country has none.", placeholder: "BSB" },
  { key: "tax_free", label: "Not taxed", hint: "", placeholder: "GST free" },
  { key: "tax_inclusive", label: "Including tax", hint: "", placeholder: "Inc GST" },
  { key: "tax_exclusive", label: "Excluding tax", hint: "", placeholder: "Ex GST" },
];

/** What the locale would give, for the preview beside an empty symbol field. */
function localeSymbol(config: CountryConfig): string {
  try {
    return (
      new Intl.NumberFormat(config.locale || "en-AU", { style: "currency", currency: config.currency || "AUD" })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value || config.currency
    );
  } catch {
    return config.currency;
  }
}

export function WordingDialog({
  iso2,
  country,
  effective,
  open,
  onOpenChange,
}: {
  iso2: string;
  country: string;
  effective: CountryConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const stage = useStageCountryMutation(iso2);
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const [currencySymbol, setCurrencySymbol] = React.useState("");
  const [aiContext, setAiContext] = React.useState("");
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setLabels(
      Object.fromEntries(
        Object.entries(effective.labels ?? {}).map(([key, value]) => [key, value ?? ""]),
      ),
    );
    setCurrencySymbol(effective.currency_symbol ?? "");
    setAiContext(effective.ai_context ?? "");
    setServerError(null);
    stage.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effective]);

  // Keys the registry carries that this build has no field for — shown as plain
  // inputs rather than dropped, since a publish would otherwise erase them.
  const extraKeys = Object.keys(labels).filter(
    (key) => !LABEL_FIELDS.some((field) => field.key === key),
  );

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (stage.isPending) return;

    stage.mutate(
      {
        // An empty label is sent as null: the registry's own convention for
        // "this country has none", which the templates then leave out.
        labels: Object.fromEntries(
          Object.entries(labels).map(([key, value]) => [key, value.trim() || null]),
        ),
        // Empty is a real answer — "work it out from the locale" — not a
        // blank string to print in front of every amount.
        currency_symbol: currencySymbol.trim() || null,
        ai_context: aiContext.trim() || null,
      },
      {
        onSuccess: (result) => {
          toast.success(
            result.changedFields.length ? "Wording staged" : "No change — the wording already said that",
            {
              description: result.changedFields.length
                ? "Publish the country to put it in front of businesses."
                : undefined,
            },
          );
          onOpenChange(false);
        },
        onError: (error) =>
          setServerError(registryErrorMessage(error, "The wording couldn't be staged.")),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !stage.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Wording for {country}</DialogTitle>
          <DialogDescription>
            What invoices, reports and the assistant call things here, and the symbol every amount
            is printed with. Staged until the country is published.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {LABEL_FIELDS.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                htmlFor={`label-${field.key}`}
                hint={field.hint || undefined}
              >
                <Input
                  id={`label-${field.key}`}
                  value={labels[field.key] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(event) => {
                    setServerError(null);
                    setLabels((current) => ({ ...current, [field.key]: event.target.value }));
                  }}
                />
              </Field>
            ))}
            {extraKeys.map((key) => (
              <Field key={key} label={key} htmlFor={`label-${key}`}>
                <Input
                  id={`label-${key}`}
                  value={labels[key] ?? ""}
                  onChange={(event) => {
                    setServerError(null);
                    setLabels((current) => ({ ...current, [key]: event.target.value }));
                  }}
                />
              </Field>
            ))}
          </div>

          <Field
            label="Currency symbol"
            htmlFor="currency-symbol"
            hint={`What goes in front of every amount in ${country}. Leave it empty to use whatever the ${effective.locale} locale gives — which is a bare "$" for New Zealand dollars, and reads as Australian anywhere else.`}
          >
            <div className="flex items-center gap-3">
              <Input
                id="currency-symbol"
                value={currencySymbol}
                maxLength={8}
                placeholder={effective.currency}
                className="w-28"
                onChange={(event) => {
                  setServerError(null);
                  setCurrencySymbol(event.target.value);
                }}
              />
              <p className="text-sm text-muted-foreground tabular">
                {(currencySymbol.trim() || localeSymbol(effective)) + "1,234.50"}
              </p>
            </div>
          </Field>

          <Field
            label="What the assistant and OCR are told"
            htmlFor="ai-context"
            hint="Injected into every prompt. Say the tax, the rate, the currency and the date order — a model told the wrong thing will confidently extract the wrong tax."
          >
            <Textarea
              id="ai-context"
              rows={4}
              value={aiContext}
              onChange={(event) => {
                setServerError(null);
                setAiContext(event.target.value);
              }}
              placeholder="This is a New Zealand business. Sales tax is GST at 15%, administered by Inland Revenue…"
            />
          </Field>

          {serverError ? <AuthError message={serverError} /> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={stage.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={stage.isPending}>
              {stage.isPending ? "Staging…" : "Stage wording"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
