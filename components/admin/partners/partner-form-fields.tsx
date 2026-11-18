"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/documents/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SOURCE_OPTIONS,
  partnerSlugify,
  type PartnerForm,
  type PartnerFormIssues,
} from "@/lib/admin/partners";

/*
 * The three groups of partner fields. The onboarding flow shows one per step;
 * the partner's settings page shows them together. Both hold the same
 * `PartnerForm`, so validation and the request body are shared too.
 */

type FieldsProps = {
  form: PartnerForm;
  issues: PartnerFormIssues;
  onChange: (patch: Partial<PartnerForm>) => void;
};

/** Name, slug (follows the name until edited; locked once created) and source. */
export function PartnerDetailsFields({
  form,
  issues,
  onChange,
  slugLocked = false,
}: FieldsProps & { slugLocked?: boolean }) {
  const [slugEdited, setSlugEdited] = React.useState(slugLocked);

  return (
    <div className="space-y-4">
      <Field label="Partner name" htmlFor="partner-name" required error={issues.name}>
        <Input
          id="partner-name"
          autoFocus={!slugLocked}
          value={form.name}
          onChange={(event) => {
            const name = event.target.value;
            onChange(slugEdited ? { name } : { name, slug: partnerSlugify(name) });
          }}
          placeholder="Sole Practice Manager"
          aria-invalid={!!issues.name}
        />
      </Field>

      <Field
        label="Slug"
        htmlFor="partner-slug"
        required
        error={issues.slug}
        hint={
          slugLocked
            ? "Fixed once created: it's in the partner's API address and every client id."
            : form.slug
              ? `API address: /api/partner/${form.slug}/…  · It can't be changed later.`
              : "Lowercase letters, digits and underscores. It can't be changed later."
        }
      >
        <Input
          id="partner-slug"
          value={form.slug}
          disabled={slugLocked}
          maxLength={32}
          onChange={(event) => {
            setSlugEdited(true);
            onChange({ slug: event.target.value.toLowerCase().replace(/[\s-]+/g, "_") });
          }}
          placeholder="spm"
          className="font-mono"
          spellCheck={false}
          autoCapitalize="none"
          aria-invalid={!!issues.slug}
        />
      </Field>

      <Field label="Type of partner" htmlFor="partner-source" hint="Where the partner's accountants come from.">
        <Select value={form.sourcePartner} onValueChange={(sourcePartner) => onChange({ sourcePartner })}>
          <SelectTrigger id="partner-source" className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

/**
 * Accountant-paid billing switch and the per-accountant cap. There is no plan
 * choice: every partner offers Sole's whole subscription system (all plans
 * and add-ons, same prices as the app).
 */
export function PartnerPlansFields({ form, issues, onChange }: FieldsProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
        <div className="space-y-1">
          <Label htmlFor="partner-billing" className="text-sm font-medium">
            Accountants can pay for their clients
          </Label>
          <p className="text-sm text-muted-foreground">
            Lets the partner start checkouts where the accountant pays. Leave off while the partner is only referring
            clients who pay for themselves.
          </p>
        </div>
        <Switch
          id="partner-billing"
          checked={form.billingEnabled}
          onCheckedChange={(billingEnabled) => onChange({ billingEnabled })}
        />
      </div>


      <Field
        label="Paid clients per accountant"
        htmlFor="partner-cap"
        error={issues.maxSponsored}
        hint="The most client plans one accountant can pay for. Leave empty for no limit."
      >
        <Input
          id="partner-cap"
          inputMode="numeric"
          value={form.maxSponsored}
          onChange={(event) => onChange({ maxSponsored: event.target.value.replace(/[^\d]/g, "") })}
          placeholder="No limit"
          className="w-32 tabular"
          aria-invalid={!!issues.maxSponsored}
        />
      </Field>
    </div>
  );
}

/** Return addresses for checkout, and how invite emails present the partner. */
export function PartnerLinksFields({ form, issues, onChange }: FieldsProps) {
  const setBranding = (patch: Partial<PartnerForm["branding"]>) => onChange({ branding: { ...form.branding, ...patch } });

  return (
    <div className="space-y-5">
      <Field
        label="Return addresses"
        htmlFor="partner-return-urls"
        error={issues.returnUrls}
        hint="One per line, https only (e.g. https://app.partner.com). After a checkout, Stripe may only send people back to these."
      >
        <Textarea
          id="partner-return-urls"
          rows={3}
          value={form.returnUrls}
          onChange={(event) => onChange({ returnUrls: event.target.value })}
          placeholder="https://app.partner.com"
          className="font-mono text-sm"
          spellCheck={false}
          aria-invalid={!!issues.returnUrls}
        />
      </Field>

      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">
          Branding in invite emails <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        <Field label="Display name" htmlFor="partner-display-name" hint="Defaults to the partner name.">
          <Input
            id="partner-display-name"
            value={form.branding.displayName}
            onChange={(event) => setBranding({ displayName: event.target.value })}
            placeholder={form.name || "Partner name"}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Support email" htmlFor="partner-support-email" error={issues.supportEmail}>
            <Input
              id="partner-support-email"
              type="email"
              value={form.branding.supportEmail}
              onChange={(event) => setBranding({ supportEmail: event.target.value })}
              placeholder="support@partner.com"
              aria-invalid={!!issues.supportEmail}
            />
          </Field>
          <Field label="Website" htmlFor="partner-website" error={issues.website}>
            <Input
              id="partner-website"
              value={form.branding.website}
              onChange={(event) => setBranding({ website: event.target.value })}
              placeholder="https://partner.com"
              aria-invalid={!!issues.website}
            />
          </Field>
        </div>
        <Field label="Logo URL" htmlFor="partner-logo" error={issues.logoUrl} hint="An https image address.">
          <Input
            id="partner-logo"
            value={form.branding.logoUrl}
            onChange={(event) => setBranding({ logoUrl: event.target.value })}
            placeholder="https://partner.com/logo.png"
            aria-invalid={!!issues.logoUrl}
          />
        </Field>
      </fieldset>
    </div>
  );
}
