"use client";

import * as React from "react";
import { Coins, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSection } from "@/components/ui/form-section";
import { InfoTip } from "@/components/ui/info-tip";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/documents/field";
import {
  formatDocumentMoney,
  type DocumentCurrency,
} from "@/lib/invoices";
import { cn } from "@/lib/utils";

/**
 * Billing a foreign client in their own currency.
 *
 * Only appears when the selected client is recorded against a currency other
 * than AUD, and stays off until it's switched on: a client whose head office
 * is overseas may still be invoiced in dollars, and quietly converting their
 * invoice would be worse than not offering to.
 *
 * The rate is held on the document once saved, not looked up again. What an
 * invoice was worth to the business is what the rate was the day it was
 * raised — a figure that moves every time the list is opened can't be
 * reconciled against a bank statement.
 */
export function CurrencyConversionCard({
  currency,
  enabled,
  onEnabledChange,
  rate,
  baseCurrency,
  publishedRate,
  edited,
  onRateChange,
  onRateReset,
  documentTotal,
}: {
  /** The client's currency. The card isn't rendered without one. */
  currency: DocumentCurrency;
  /** The business's own currency, which the books are kept in. */
  baseCurrency: DocumentCurrency;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  /** Units of `currency` per one unit of the base currency, as it will be saved. */
  rate: number | null;
  /** Today's published rate, for the "reset" affordance. */
  publishedRate: number | null;
  edited: boolean;
  onRateChange: (value: string) => void;
  onRateReset: () => void;
  /** The invoice total in `currency`, for the base-currency equivalent below. */
  documentTotal: number;
}) {
  const [draftRate, setDraftRate] = React.useState(
    rate != null ? String(rate) : "",
  );

  // Follows the published rate until it's been overridden, so choosing a
  // different client doesn't leave the previous one's rate in the field.
  React.useEffect(() => {
    if (!edited) setDraftRate(rate != null ? String(rate) : "");
  }, [rate, edited]);

  const parsed = Number(draftRate);
  const invalid =
    !!draftRate.trim() && (!Number.isFinite(parsed) || parsed <= 0);
  const baseTotal = rate && rate > 0 ? documentTotal / rate : documentTotal;

  return (
    <FormSection
      icon={Coins}
      title={
        <>
          Bill in {currency}
          <InfoTip
            text={`This client is recorded in ${currency}. Prices you enter will be in ${currency}, and your books stay in ${baseCurrency}.`}
          />
        </>
      }
      className="space-y-3"
      bare={!enabled}
      action={
        <Switch
          checked={enabled}
          onCheckedChange={onEnabledChange}
          aria-label={`Bill this invoice in ${currency}`}
        />
      }
    >
      {enabled && (
        <div className="space-y-3 border-t border-border pt-3">
          <Field
            label={`Exchange rate (${currency} per 1 ${baseCurrency})`}
            error={invalid ? "Enter a rate greater than zero." : undefined}
            hint={
              publishedRate != null && !edited
                ? "Today's published rate. Edit it to use the rate you actually got."
                : undefined
            }
          >
            <div className="flex items-center gap-2">
              <Input
                className={cn(
                  "tabular",
                  invalid &&
                    "border-destructive focus-visible:ring-destructive",
                )}
                inputMode="decimal"
                value={draftRate}
                onChange={(event) => {
                  setDraftRate(event.target.value);
                  onRateChange(event.target.value);
                }}
                placeholder={
                  publishedRate != null ? String(publishedRate) : "1.00"
                }
                aria-invalid={invalid}
              />
              {edited && publishedRate != null && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraftRate(String(publishedRate));
                    onRateReset();
                  }}
                >
                  <RotateCcw />
                  Reset
                </Button>
              )}
            </div>
          </Field>

          {/* Both figures, always — the client's amount and yours. */}
          <dl className="space-y-1.5 rounded-lg bg-muted/40 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">
                Invoice total ({currency})
              </dt>
              <dd className="text-sm font-medium tabular">
                {formatDocumentMoney(documentTotal, currency)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">
                Recorded in your books
              </dt>
              <dd className="text-sm tabular">{formatDocumentMoney(baseTotal, baseCurrency)}</dd>
            </div>
          </dl>
        </div>
      )}

      {!enabled && publishedRate == null && (
        <p className="text-xs text-muted-foreground">
          No published rate for {currency} yet — switch this on and enter the
          rate you were given.
        </p>
      )}
    </FormSection>
  );
}
