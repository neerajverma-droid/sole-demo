"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
import { Building2, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

import { FormSection } from "@/components/ui/form-section";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Switch } from "@/components/ui/switch";
import { MoneyInput } from "@/components/planner/money-input";
import { Field } from "@/components/documents/field";
import {
  SolePayOnboardingShell,
  SolePayStepFooter,
  SOLEPAY_OVERVIEW_HREF,
  useSolePayHydration,
} from "@/components/payments/solepay/onboarding-shell";
import {
  AddressSearchField,
  SearchableSelectField,
  TextField,
  focusFirstSolePayIssue,
} from "@/components/payments/solepay/fields";
import { solePayMetaAtom, solePayOnboardingAtom } from "@/lib/atoms";
import {
  SOLEPAY_ENTITY_TYPES,
  SOLEPAY_INDUSTRIES,
  entityInvalidIssues,
  entityIssues,
  saveSolePayDraft,
  type SolePayAddress,
  type SolePayEntity,
  type SolePayIssues,
} from "@/lib/solepay";

/** The header treatment the setup wizard uses for a section that stands alone. */
const SECTION_HEADER =
  "gap-3 px-4 py-3.5 bg-primary/[0.06] dark:bg-primary/[0.12]";

/** Where `entityIssues`' keys actually live on the page, for scroll-to-error. */
const ENTITY_FIELD_IDS: Record<string, string> = {
  name: "entity-name",
  legalName: "entity-legal-name",
  abn: "entity-abn",
  type: "entity-type",
  email: "entity-email",
  industry: "entity-industry",
  website: "entity-website",
  phone: "entity-phone",
  transactionsFor: "entity-transactions-for",
  maxTransaction: "entity-max-txn",
  avgTransaction: "entity-avg-txn",
  transactionQty: "entity-qty",
  "address.line1": "entity-address-1",
  "address.city": "entity-city",
  "address.state": "entity-state",
  "address.postcode": "entity-postcode",
  "address.country": "entity-country",
};

/**
 * Entity details.
 *
 * One form over two sections: what the business is, and where it is. Both save
 * together — they're one step in the tracker, and a Save that committed the
 * business but not the address would tick a step that isn't done.
 *
 * The draft is local until Save. Leaving the page changes nothing, which is
 * what makes Cancel honest.
 */
export function SolePayEntityScreen() {
  const router = useRouter();
  const [state, setState] = useAtom(solePayOnboardingAtom);
  const setMeta = useSetAtom(solePayMetaAtom);

  const [entity, setEntity] = React.useState<SolePayEntity>(state.entity);
  const [address, setAddress] = React.useState<SolePayAddress>(state.address);
  const [addressSearch, setAddressSearch] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  /**
   * The problems found by the last Save.
   *
   * Empty until it's pressed, so a form nobody has submitted isn't covered in
   * red. Once a Save attempt has actually run — `triedSubmit` — every
   * further edit re-validates the whole form live, so a field's message
   * clears exactly when its value becomes valid rather than the moment it's
   * merely touched, and stays if the new value is still wrong.
   */
  const [issues, setIssues] = React.useState<SolePayIssues>({});
  const [triedSubmit, setTriedSubmit] = React.useState(false);

  // Re-seeds from the atom once the real draft has actually loaded — see
  // `useSolePayHydration`'s own comment for why the plain `useState` above
  // isn't enough by itself on a hard refresh landing straight on this page.
  useSolePayHydration(() => {
    setEntity(state.entity);
    setAddress(state.address);
  });

  const patchEntity = (values: Partial<SolePayEntity>) => {
    const nextEntity = { ...entity, ...values };
    setEntity(nextEntity);
    if (triedSubmit) setIssues(entityIssues(nextEntity, address));
  };

  const patchAddress = (values: Partial<SolePayAddress>) => {
    const nextAddress = { ...address, ...values };
    setAddress(nextAddress);
    if (triedSubmit) setIssues(entityIssues(entity, nextAddress));
  };

  const save = async () => {
    const found = entityIssues(entity, address);
    setIssues(found);
    setTriedSubmit(true);

    if (Object.keys(found).length > 0) {
      const count = Object.keys(found).length;
      toast.error(
        `${count} ${count === 1 ? "field needs" : "fields need"} attention`,
      );
      focusFirstSolePayIssue(found, ENTITY_FIELD_IDS);
      return;
    }

    /*
     * Sends the FULL current onboarding state, not just this form — Worldpay's
     * own save endpoint overwrites the whole entity and the whole director on
     * every call, so the director and accounts already on file have to travel
     * along with this save or the backend will null them out.
     */
    const next = { ...state, entity, address };
    setSaving(true);
    try {
      const result = await saveSolePayDraft(next);
      setState(result.state);
      setMeta(result.meta);

      /*
       * The save itself always succeeds — Worldpay still records a bad ABN
       * or an out-of-range phone, it just flags it in `groupedInvalid`
       * rather than rejecting the request. Those are the checks this form
       * deliberately doesn't try to guess client-side (checksum, AU state
       * codes, the AU phone shape), so this is the one place they surface.
       */
      const backendIssues = entityInvalidIssues(result.meta.groupedInvalid.entity);
      if (Object.keys(backendIssues).length > 0) {
        setIssues(backendIssues);
        toast.error("Worldpay flagged a problem with these details.");
        focusFirstSolePayIssue(backendIssues, ENTITY_FIELD_IDS);
        return;
      }

      toast.success("Entity details saved");
      router.push(SOLEPAY_OVERVIEW_HREF);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save entity details",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SolePayOnboardingShell stepId="entity">
      <div className="space-y-4">
        <FormSection
          icon={Building2}
          title="Entity details"
          description="The business SolePay settles to."
          headerClassName={SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="entity-name"
              label="Name"
              required
              hint="The trading name your customers know you by."
              placeholder="Turner Consulting"
              value={entity.name}
              error={issues.name}
              onChange={(name) => patchEntity({ name })}
            />
            <TextField
              id="entity-legal-name"
              label="Full legal name"
              required
              hint="As registered with ASIC, or on your ABN registration."
              placeholder="Turner Consulting Pty Ltd"
              value={entity.legalName}
              error={issues.legalName}
              onChange={(legalName) => patchEntity({ legalName })}
            />
            <TextField
              id="entity-abn"
              label="ABN"
              required
              inputMode="numeric"
              hint="11-digit Australian Business Number."
              placeholder="12 345 678 901"
              value={entity.abn}
              error={issues.abn}
              onChange={(abn) => patchEntity({ abn })}
            />
            <SearchableSelectField
              id="entity-type"
              label="Entity type"
              required
              hint="Select how your business is legally structured."
              placeholder="Select entity type"
              searchPlaceholder="Search entity types…"
              options={SOLEPAY_ENTITY_TYPES}
              value={entity.type}
              error={issues.type}
              onChange={(type) => patchEntity({ type })}
            />
            <TextField
              id="entity-email"
              label="Email"
              required
              type="email"
              hint="We'll send SolePay account notifications here."
              placeholder="accounts@turnerconsulting.com.au"
              value={entity.email}
              error={issues.email}
              onChange={(email) => patchEntity({ email })}
            />
            <SearchableSelectField
              id="entity-industry"
              label="Industry"
              required
              hint="Select the category that best matches your business."
              placeholder="Select industry"
              searchPlaceholder="Search industries…"
              options={SOLEPAY_INDUSTRIES}
              value={entity.industry}
              error={issues.industry}
              onChange={(industry) => patchEntity({ industry })}
            />
            <TextField
              id="entity-website"
              label="Website"
              required
              hint="Enter your business website URL."
              placeholder="turnerconsulting.com.au"
              value={entity.website}
              error={issues.website}
              onChange={(website) => patchEntity({ website })}
            />
            <Field
              label="Phone"
              htmlFor="entity-phone"
              required
              hint="Include the country code, e.g. +61."
              error={issues.phone}
            >
              <PhoneInput
                id="entity-phone"
                value={entity.phone}
                invalid={!!issues.phone}
                required
                onChange={(phone) => patchEntity({ phone })}
              />
            </Field>
          </div>

          {/*
            SolePay's own questions, kept together and under a rule: they're
            about the trading rather than about the business, and they're the
            ones people pause on.
          */}
          <div className="space-y-4 border-t border-border pt-4">
            <p className="text-sm font-medium">Expected trading</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="entity-transactions-for"
                label="Transactions for"
                required
                hint="In your own words — what the payments are for."
                placeholder="Sales of goods and services"
                value={entity.transactionsFor}
                error={issues.transactionsFor}
                onChange={(transactionsFor) => patchEntity({ transactionsFor })}
              />
              <TextField
                id="entity-qty"
                label="Qty transactions"
                required
                inputMode="numeric"
                hint="Roughly how many a month."
                placeholder="40"
                value={entity.transactionQty}
                error={issues.transactionQty}
                onChange={(transactionQty) => patchEntity({ transactionQty })}
              />

              <MoneyField
                id="entity-max-txn"
                label="Max transaction"
                required
                hint="The highest amount you'd expect to process in one go."
                placeholder="1000"
                value={entity.maxTransaction}
                error={issues.maxTransaction}
                onChange={(maxTransaction) => patchEntity({ maxTransaction })}
              />
              <MoneyField
                id="entity-avg-txn"
                label="Avg transaction"
                required
                hint="A typical amount for one of your transactions."
                placeholder="500"
                value={entity.avgTransaction}
                error={issues.avgTransaction}
                onChange={(avgTransaction) => patchEntity({ avgTransaction })}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-[9px] border border-border p-3">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="entity-arrears" className="text-sm font-medium">
                  Paid in arrears
                </Label>
                <p className="text-xs text-muted-foreground">
                  On if you invoice after the work is delivered.
                </p>
              </div>
              <Switch
                id="entity-arrears"
                checked={entity.paidInArrears}
                onCheckedChange={(paidInArrears) =>
                  patchEntity({ paidInArrears })
                }
              />
            </div>

            {/*
              Only asked when paid in advance — a business paid in arrears has
              nothing to answer here, so the field stands down rather than
              sitting there unused. Restores a field the old SolePay form had
              that got dropped in this screen's rebuild.
            */}
            {!entity.paidInArrears && (
              <TextField
                id="entity-days-in-advance"
                label="Days in advance"
                required
                inputMode="numeric"
                hint="On average, how many days before delivery you're paid."
                placeholder="14"
                value={entity.daysInAdvance}
                error={issues.daysInAdvance}
                onChange={(daysInAdvance) => patchEntity({ daysInAdvance })}
              />
            )}
          </div>
        </FormSection>

        <FormSection
          icon={MapPin}
          title="Address information"
          description="Where the business trades from."
          headerClassName={SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          <AddressSearchField
            id="entity-address-search"
            value={addressSearch}
            onChange={setAddressSearch}
            onSelect={(place) =>
              patchAddress({
                line1: place.addressLine1,
                country: place.country,
                city: place.city,
                state: place.state,
                postcode: place.postcode,
              })
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField
                id="entity-address-1"
                label="Address line 1"
                required
                placeholder="18 Cremorne Street"
                value={address.line1}
                error={issues["address.line1"]}
                onChange={(line1) => patchAddress({ line1 })}
              />
            </div>
            <TextField
              id="entity-city"
              label="City"
              required
              placeholder="Melbourne"
              value={address.city}
              error={issues["address.city"]}
              onChange={(city) => patchAddress({ city })}
            />
            <TextField
              id="entity-state"
              label="State / province"
              required
              hint="e.g. NSW, VIC, QLD."
              placeholder="VIC"
              value={address.state}
              error={issues["address.state"]}
              onChange={(state) => patchAddress({ state })}
            />
            <TextField
              id="entity-postcode"
              label="Postcode"
              required
              inputMode="numeric"
              hint="e.g. 2000, 4000."
              placeholder="3121"
              value={address.postcode}
              error={issues["address.postcode"]}
              onChange={(postcode) => patchAddress({ postcode })}
            />
            <TextField
              id="entity-country"
              label="Country"
              required
              value={address.country}
              error={issues["address.country"]}
              onChange={(country) => patchAddress({ country })}
            />
          </div>
        </FormSection>
      </div>

      <SolePayStepFooter
        onSave={save}
        saveDisabled={saving}
        saveLabel={
          saving ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            "Save entity details"
          )
        }
      />
    </SolePayOnboardingShell>
  );
}

/** A money field with the platform's dollar input inside the shared label slot. */
function MoneyField({
  id,
  label,
  value,
  onChange,
  error,
  required,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        )}
      </Label>
      <MoneyInput
        id={id}
        label={label}
        value={value}
        onChange={onChange}
        invalid={!!error}
        placeholder={placeholder}
      />
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
