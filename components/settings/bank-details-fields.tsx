"use client";

import { Input } from "@/components/ui/input";
import { Field } from "@/components/documents/field";
import { useCountryContext } from "@/hooks/use-country-context";
import {
  bankAccountField,
  bankBranchField,
  bankFieldError,
  bankFieldHelp,
  type CountryContext,
} from "@/lib/country-context";
import type { BankDetailsForm } from "@/lib/business-settings";
import { cn } from "@/lib/utils";

/**
 * The bank fields a country asks for, as a plain record keyed the way the
 * registry names them.
 *
 * `bsb` and `account_number` are the business's own columns. The column name
 * is Australian; the value in it is whatever its country calls a branch — a
 * BSB in Australia, a branch code in South Africa, and nothing at all in New
 * Zealand, whose account number carries the bank and branch inside it.
 */
function bankValues(ctx: CountryContext, values: BankDetailsForm): Record<string, string> {
  const branch = bankBranchField(ctx);
  return {
    account_number: values.accountNumber,
    ...(branch ? { [branch.key]: values.bsb } : {}),
  };
}

/** Both bank-field rules for the business's country, so a caller can gate Save. */
export function bankDetailsIssue(
  ctx: CountryContext,
  values: BankDetailsForm,
): string | undefined {
  const branch = bankBranchField(ctx);
  const mapped = bankValues(ctx, values);
  return (
    (branch ? bankFieldError(ctx, branch.key, mapped[branch.key]) : undefined) ??
    bankFieldError(ctx, "account_number", mapped.account_number)
  );
}

/**
 * The account a client pays into.
 *
 * Account name, bank name, branch and account number are real columns on the
 * business record (`account_holder`, `bank_name`, `bsb`, `account_number`) and
 * come in as `values`. Bank name is the one sole-webapp's own Payment.js
 * treats as required and this form had no field for at all — `hasBankDetails`
 * checks it, so a business could look unpayable with nothing on screen to fix.
 *
 * The branch and account fields come from the country's `bank_account_schema`
 * rather than being written here: "BSB, 6 digits" is Australia's answer, and
 * drawing it for a New Zealand business asks for a number that doesn't exist.
 */
export function BankDetailsFields({
  values,
  patch,
}: {
  values: BankDetailsForm;
  patch: (partial: Partial<BankDetailsForm>) => void;
}) {
  const { country } = useCountryContext();
  const branch = bankBranchField(country);
  const account = bankAccountField(country);
  const mapped = bankValues(country, values);

  const branchIssue = branch ? bankFieldError(country, branch.key, mapped[branch.key]) : undefined;
  const accountIssue = bankFieldError(country, "account_number", mapped.account_number);

  const branchHelp = branch ? bankFieldHelp(country, branch.key) : null;
  const accountHelp = bankFieldHelp(country, "account_number");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Field
          label="Account name"
          hint="As it appears on the account your clients pay into."
        >
          <Input
            value={values.accountName}
            placeholder="Your business name"
            onChange={(event) => patch({ accountName: event.target.value })}
          />
        </Field>
      </div>

      <div>
        <Field
          label="Bank name"
          hint="The institution holding the account, e.g. Commonwealth Bank."
        >
          <Input
            value={values.bankName}
            placeholder="Commonwealth Bank"
            onChange={(event) => patch({ bankName: event.target.value })}
          />
        </Field>
      </div>

      {branch ? (
        <Field
          label={branch.label}
          error={branchIssue}
          hint={branchHelp ? `${branchHelp}${branch.mask ? `, usually ${branch.mask.replace(/9/g, "0")}` : ""}.` : undefined}
        >
          <Input
            value={values.bsb}
            inputMode="numeric"
            placeholder={branch.mask?.replace(/9/g, "0") ?? undefined}
            onChange={(event) => patch({ bsb: event.target.value })}
            aria-invalid={!!branchIssue}
            className={cn(
              "tabular",
              branchIssue && "border-destructive focus-visible:ring-destructive",
            )}
          />
        </Field>
      ) : null}

      <div className={branch ? undefined : "sm:col-span-2"}>
        <Field
          label={account?.label ?? "Account number"}
          error={accountIssue}
          hint={accountHelp ? `${accountHelp}.` : undefined}
        >
          <Input
            value={values.accountNumber}
            inputMode="numeric"
            placeholder={account?.mask?.replace(/9/g, "0") ?? "12345678"}
            onChange={(event) => patch({ accountNumber: event.target.value })}
            aria-invalid={!!accountIssue}
            className={cn(
              "tabular",
              accountIssue && "border-destructive focus-visible:ring-destructive",
            )}
          />
        </Field>
      </div>
    </div>
  );
}
