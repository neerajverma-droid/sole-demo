"use client";

import * as React from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/admin/shared/status-pill";
import { WordingDialog } from "@/components/admin/countries/wording-dialog";
import {
  countryStatusPill,
  describeFiscalYear,
  formatRate,
  frequencyLabel,
  type CountryConfig,
  type TaxRate,
} from "@/lib/admin/countries";

/**
 * What a business in this country actually gets: its tax, its financial year,
 * the words on its invoices and the identifiers it's asked for.
 *
 * Read-only on purpose. Every value here is editable — through staging, a
 * preview and a publish — and a page of inputs that quietly become a draft is
 * the wrong shape for data this consequential. This tab answers "what is set up
 * here"; the Tax rates and Thresholds tabs are where it gets changed.
 */
export function OverviewTab({
  iso2,
  config,
  effective,
  hasDraft,
  rates,
}: {
  iso2: string;
  config: CountryConfig;
  effective: CountryConfig;
  hasDraft: boolean;
  rates: TaxRate[];
}) {
  const [wordingOpen, setWordingOpen] = React.useState(false);
  const status = countryStatusPill(effective.status);
  const standard = rates.find((rate) => rate.isDefault && rate.state === "current");
  const changed = (field: keyof CountryConfig) =>
    hasDraft && JSON.stringify(config[field]) !== JSON.stringify(effective[field]);

  return (
    <div className="space-y-6">
      <Group title="Jurisdiction">
        <Row label="Status" changed={changed("status")}>
          <div className="flex items-center gap-2">
            <StatusPill label={status.label} tone={status.tone} />
            <span className="text-xs text-muted-foreground">{status.help}</span>
          </div>
        </Row>
        <Row label="Currency" changed={changed("currency")}>
          {effective.currency}
        </Row>
        <Row label="Symbol" changed={changed("currency_symbol")}>
          {effective.currency_symbol ? (
            <>
              <span className="font-medium">{effective.currency_symbol}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {effective.currency_symbol}1,234.50
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              Not set — taken from the {effective.locale} locale
            </span>
          )}
        </Row>
        <Row label="Locale" changed={changed("locale")}>
          {effective.locale}
        </Row>
        <Row label="Timezone" changed={changed("default_timezone")}>
          {effective.default_timezone}
        </Row>
        <Row label="Phone code" changed={changed("phone_dial_code")}>
          {effective.phone_dial_code}
        </Row>
      </Group>

      <Group title="Tax">
        <Row label="Called" changed={changed("tax_type")}>
          {effective.tax_type}
        </Row>
        <Row label="Authority" changed={changed("tax_authority")}>
          {effective.tax_authority}
        </Row>
        <Row label="Standard rate">
          {standard ? (
            <>
              <span className="font-medium tabular">{formatRate(standard.rate)}</span>
              <span className="text-muted-foreground"> · {standard.taxCode}</span>
            </>
          ) : (
            <span className="text-destructive">No standard rate is in effect</span>
          )}
        </Row>
        <Row label="Return" changed={changed("tax_return_template")}>
          <span className="font-mono text-xs">{effective.tax_return_template}</span>
          {effective.tax_return_template === "generic" ? (
            <span className="ml-2 text-xs text-warning">
              No official form is mapped — figures are right, but it isn&apos;t filing-ready.
            </span>
          ) : null}
        </Row>
      </Group>

      <Group title="Financial year and filing">
        <Row label="Financial year" changed={changed("fiscal_year_start_month")}>
          {describeFiscalYear(effective.fiscal_year_start_month, effective.fiscal_year_start_day)}
        </Row>
        <Row label="Filing frequencies" changed={changed("filing_frequencies")}>
          <div className="flex flex-wrap gap-1.5">
            {(effective.filing_frequencies ?? []).map((frequency) => (
              <span
                key={frequency}
                className={
                  frequency === effective.default_filing_frequency
                    ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                    : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                }
              >
                {frequencyLabel(frequency)}
                {frequency === effective.default_filing_frequency ? " · default" : ""}
              </span>
            ))}
          </div>
        </Row>
      </Group>

      <Group title="Identifiers">
        {(effective.identifier_schema ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No identifiers are asked for.</p>
        ) : (
          (effective.identifier_schema ?? []).map((field) => (
            <Row key={field.key} label={field.label}>
              <span className="font-mono text-xs text-muted-foreground">{field.key}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {field.required
                  ? "required"
                  : field.required_if === "tax_registered"
                    ? "required once registered"
                    : field.same_as
                      ? `same as ${field.same_as}`
                      : "optional"}
                {field.validator ? ` · ${field.validator}` : ""}
              </span>
            </Row>
          ))
        )}
      </Group>

      <Group title="Bank account">
        {(effective.bank_account_schema ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No bank fields are asked for.</p>
        ) : (
          (effective.bank_account_schema ?? []).map((field) => (
            <Row key={field.key} label={field.label}>
              <span className="font-mono text-xs text-muted-foreground">
                {field.mask ?? field.pattern ?? field.key}
              </span>
            </Row>
          ))
        )}
      </Group>

      <Group
        title="Words on a document"
        changed={changed("labels") || changed("ai_context")}
        action={
          <Button variant="outline" size="sm" onClick={() => setWordingOpen(true)}>
            <Pencil />
            Edit wording
          </Button>
        }
      >
        <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {Object.entries(effective.labels ?? {}).map(([key, value]) => (
            <div key={key} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-mono text-xs text-muted-foreground">{key}</span>
              <span className="truncate text-right">{value ?? "—"}</span>
            </div>
          ))}
        </div>
        {effective.ai_context ? (
          <p className="mt-3 border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">The assistant and OCR are told:</span>{" "}
            {effective.ai_context}
          </p>
        ) : null}
      </Group>

      <WordingDialog
        iso2={iso2}
        country={effective.name}
        effective={effective}
        open={wordingOpen}
        onOpenChange={setWordingOpen}
      />
    </div>
  );
}

function Group({
  title,
  changed,
  action,
  children,
}: {
  title: string;
  changed?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {title}
          {changed ? <ChangedBadge /> : null}
        </h3>
        {action}
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({
  label,
  changed,
  children,
}: {
  label: string;
  changed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        {label}
        {changed ? <ChangedBadge /> : null}
      </span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

/** Marks a value the draft would change, so the Publish dialog holds no surprises. */
function ChangedBadge() {
  return (
    <span className="rounded-full bg-warning/10 px-1.5 py-px text-[11px] font-medium text-warning">
      staged
    </span>
  );
}
