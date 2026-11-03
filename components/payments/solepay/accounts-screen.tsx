"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAtom, useSetAtom } from "jotai";
import { Landmark, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { FormSection } from "@/components/ui/form-section";
import { Label } from "@/components/ui/label";
import {
  SolePayOnboardingShell,
  SolePayStepFooter,
  SOLEPAY_OVERVIEW_HREF,
  useSolePayHydration,
} from "@/components/payments/solepay/onboarding-shell";
import {
  TextField,
  focusFirstSolePayIssue,
} from "@/components/payments/solepay/fields";
import { solePayMetaAtom, solePayOnboardingAtom } from "@/lib/atoms";
import {
  accountsIssues,
  saveSolePayDraft,
  type SolePayBankAccount,
  type SolePayIssues,
} from "@/lib/solepay";
import { useBankDetails } from "@/hooks/use-business-settings";
import type { BankDetailsForm } from "@/lib/business-settings";

const SECTION_HEADER =
  "gap-3 px-4 py-3.5 bg-primary/[0.06] dark:bg-primary/[0.12]";

/**
 * Whether the account this form can be filled from is actually there.
 *
 * The three fields SolePay needs, not all four — `payId` has no field here, and
 * a profile with only a PayID saved has nothing to prefill.
 */
function hasSavedBank(bank: BankDetailsForm): boolean {
  return (
    !!bank.accountName.trim() &&
    !!bank.bsb.trim() &&
    !!bank.accountNumber.trim()
  );
}

/** Whether an account has enough in it to have been answered. */
function accountStarted(account: SolePayBankAccount): boolean {
  return (
    !!account.accountName.trim() ||
    !!account.bsb.trim() ||
    !!account.accountNumber.trim()
  );
}

/** Where `accountsIssues`' keys actually live on the page, for scroll-to-error. */
const ACCOUNTS_FIELD_IDS: Record<string, string> = {
  "settlement.accountName": "settlement-account-name",
  "settlement.bsb": "settlement-bsb",
  "settlement.accountNumber": "settlement-account-number",
  "billing.accountName": "billing-account-name",
  "billing.bsb": "billing-bsb",
  "billing.accountNumber": "billing-account-number",
};

/**
 * Bank accounts.
 *
 * Two accounts and a checkbox, and the checkbox is the interesting part: most
 * businesses settle and get billed to one account, so mirroring is the default
 * and the second section stands down rather than asking for the same four
 * answers again.
 *
 * The settlement account is prefilled from the bank details already in
 * Settings, because they're the same account — asking someone to retype what
 * the product already prints on their invoices is the kind of form people
 * abandon.
 */
export function SolePayAccountsScreen() {
  const router = useRouter();
  const [state, setState] = useAtom(solePayOnboardingAtom);
  const setMeta = useSetAtom(solePayMetaAtom);
  const { values: savedBank } = useBankDetails();

  const [settlement, setSettlement] = React.useState<SolePayBankAccount>(
    state.bankAccounts.settlement,
  );
  const [billing, setBilling] = React.useState<SolePayBankAccount>(
    state.bankAccounts.billing,
  );
  const [mirrored, setMirrored] = React.useState(
    state.bankAccounts.billingSameAsSettlement,
  );
  const [issues, setIssues] = React.useState<SolePayIssues>({});
  const [triedSubmit, setTriedSubmit] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Re-seeds from the atom once the real draft has actually loaded — see
  // `useSolePayHydration`'s own comment for why the plain `useState` above
  // isn't enough by itself on a hard refresh landing straight on this page.
  useSolePayHydration(() => {
    setSettlement(state.bankAccounts.settlement);
    setBilling(state.bankAccounts.billing);
    setMirrored(state.bankAccounts.billingSameAsSettlement);
  });

  /** Whether the settlement fields came from Settings, for the note. */
  const [prefilled, setPrefilled] = React.useState(false);
  /** Set by any edit, so a prefill can never land on top of typing. */
  const [touched, setTouched] = React.useState(false);

  /*
   * Prefill, once, and only into an untouched empty form.
   *
   * An effect rather than a seed in `useState` because the settings store
   * defers rehydration — reading it during the first render gets the defaults,
   * and the stored account arrives a tick later. Keyed on `savedBank` so the
   * form fills from the real value when it does, and guarded by `touched` so
   * that can't overwrite anything typed in the meantime.
   */
  React.useEffect(() => {
    if (touched || prefilled) return;
    // A settlement account already saved against SolePay wins: it's the answer
    // to this question, where Settings only holds a good guess at it.
    if (accountStarted(state.bankAccounts.settlement)) return;
    if (!hasSavedBank(savedBank)) return;

    setSettlement((current) => ({
      ...current,
      accountName: savedBank.accountName,
      bsb: savedBank.bsb,
      accountNumber: savedBank.accountNumber,
    }));
    setPrefilled(true);
  }, [savedBank, touched, prefilled, state.bankAccounts.settlement]);

  // Once a Save attempt has run, every further edit re-validates the whole
  // form live — see `entity-screen.tsx`'s `patchEntity` for the same reasoning.
  const patchSettlement = (values: Partial<SolePayBankAccount>) => {
    setTouched(true);
    const nextSettlement = { ...settlement, ...values };
    setSettlement(nextSettlement);
    if (triedSubmit) {
      setIssues(
        accountsIssues({
          settlement: nextSettlement,
          billing: mirrored ? nextSettlement : billing,
          billingSameAsSettlement: mirrored,
        }),
      );
    }
  };

  const patchBilling = (values: Partial<SolePayBankAccount>) => {
    setTouched(true);
    const nextBilling = { ...billing, ...values };
    setBilling(nextBilling);
    if (triedSubmit) {
      setIssues(
        accountsIssues({
          settlement,
          billing: nextBilling,
          billingSameAsSettlement: mirrored,
        }),
      );
    }
  };

  const save = async () => {
    /*
     * Mirroring is resolved before validating and before saving, so what's
     * stored is a real billing account rather than a flag other screens have to
     * remember to check. The flag is kept as well — it's why the two match, and
     * the Documents step reads it to know one statement is enough.
     */
    const resolvedBilling = mirrored ? { ...settlement } : billing;
    const accounts = {
      settlement,
      billing: resolvedBilling,
      billingSameAsSettlement: mirrored,
    };

    const found = accountsIssues(accounts);
    setIssues(found);
    setTriedSubmit(true);

    if (Object.keys(found).length > 0) {
      const count = Object.keys(found).length;
      toast.error(
        `${count} ${count === 1 ? "field needs" : "fields need"} attention`,
      );
      focusFirstSolePayIssue(found, ACCOUNTS_FIELD_IDS);
      return;
    }

    // Sends the FULL current onboarding state — see `entity-screen.tsx`'s
    // save for why an accounts-only payload would null out the entity.
    const next = { ...state, bankAccounts: accounts };
    setSaving(true);
    try {
      const result = await saveSolePayDraft(next);
      setState(result.state);
      setMeta(result.meta);
      toast.success("Bank accounts saved");
      router.push(SOLEPAY_OVERVIEW_HREF);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save bank accounts",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SolePayOnboardingShell stepId="accounts">
      <div className="space-y-4">
        {/*
          The mirror, above both sections rather than inside either.

          It's a fact about the pair, so it sits over them — putting it in the
          billing header would make it look like a setting on that account
          alone.
        */}
        <div className="flex items-start gap-3 rounded-[14px] border border-border bg-card p-4 shadow-sm">
          <Checkbox
            id="accounts-mirrored"
            checked={mirrored}
            onCheckedChange={(checked) => {
              const nextMirrored = checked === true;
              setMirrored(nextMirrored);
              setTouched(true);
              // Anything flagged against billing stops applying the moment it
              // stops being asked for — recomputed live, same as any other
              // edit once a Save attempt has run.
              if (triedSubmit) {
                setIssues(
                  accountsIssues({
                    settlement,
                    billing: nextMirrored ? settlement : billing,
                    billingSameAsSettlement: nextMirrored,
                  }),
                );
              }
            }}
            className="mt-0.5"
          />
          <div className="min-w-0 space-y-1">
            <Label
              htmlFor="accounts-mirrored"
              className="text-sm font-medium leading-normal"
            >
              Billing and settlement info are same
            </Label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              If enabled, billing mirrors settlement and only one bank statement
              is required in Documents.
            </p>
          </div>
        </div>

        <FormSection
          icon={Landmark}
          title="Settlement account"
          description="Where SolePay pays your takings."
          headerClassName={SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          {/* Only where it actually happened, so it's news rather than
              decoration on a form somebody filled in themselves. */}
          {prefilled && (
            <p className="text-xs text-muted-foreground">
              Prefilled from your saved bank details — edit if needed.
            </p>
          )}

          <AccountFields
            idPrefix="settlement"
            account={settlement}
            issues={issues}
            onChange={patchSettlement}
          />
        </FormSection>

        <FormSection
          icon={Receipt}
          title="Billing account"
          description="Where SolePay takes its fees from."
          headerClassName={SECTION_HEADER}
          className="space-y-4 p-4 sm:p-6"
        >
          {mirrored ? (
            /*
              Shown filled and disabled rather than hidden.

              Hiding it would leave the question unanswered on screen — this way
              what's about to be saved is visible, and switching the box off
              reveals a form rather than conjuring one.
            */
            <>
              <p className="text-xs text-muted-foreground">
                Mirroring the settlement account. Untick the box above to bill a
                different account.
              </p>
              <AccountFields
                idPrefix="billing"
                account={settlement}
                issues={{}}
                onChange={() => {}}
                disabled
              />
            </>
          ) : (
            <AccountFields
              idPrefix="billing"
              account={billing}
              issues={issues}
              onChange={patchBilling}
            />
          )}
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
            "Save bank accounts"
          )
        }
      />
    </SolePayOnboardingShell>
  );
}

/**
 * The four fields an account is, used by both sections.
 *
 * One component so the two accounts can't drift into asking for different
 * things — and so the mirrored, disabled copy is provably the same form as the
 * one it mirrors.
 */
function AccountFields({
  idPrefix,
  account,
  issues,
  onChange,
  disabled,
}: {
  idPrefix: "settlement" | "billing";
  account: SolePayBankAccount;
  issues: SolePayIssues;
  onChange: (values: Partial<SolePayBankAccount>) => void;
  disabled?: boolean;
}) {

  const accountNumberHint =
    idPrefix === "settlement"
      ? "Where SolePay pays out your takings \u2014 6 to 10 digits."
      : "Where SolePay debits any fees owed \u2014 6 to 10 digits.";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        id={`${idPrefix}-account-name`}
        label="Account name"
        required
        disabled={disabled}
        placeholder="Turner Consulting Pty Ltd"
        hint="Exactly as it appears on your bank statement."
        value={account.accountName}
        error={issues[`${idPrefix}.accountName`]}
        onChange={(accountName) => onChange({ accountName })}
      />
      <TextField
        id={`${idPrefix}-bsb`}
        label="BSB"
        required
        disabled={disabled}
        inputMode="numeric"
        placeholder="083-004"
        hint="6-digit bank-state-branch number."
        value={account.bsb}
        error={issues[`${idPrefix}.bsb`]}
        onChange={(bsb) => onChange({ bsb })}
      />
      <TextField
        id={`${idPrefix}-account-number`}
        label="Account number"
        required
        disabled={disabled}
        inputMode="numeric"
        placeholder="12345678"
        hint={accountNumberHint}
        value={account.accountNumber}
        error={issues[`${idPrefix}.accountNumber`]}
        onChange={(accountNumber) => onChange({ accountNumber })}
      />
    </div>
  );
}
