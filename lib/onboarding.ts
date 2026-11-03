/**
 * Onboarding domain — the profile collected after sign-up, before the app.
 *
 * The draft lives in Jotai while the steps are walked; what the settings store
 * already models is committed on the way out of each step. Industry is the one
 * that matters beyond onboarding: it drives the create-invoice chooser and the
 * template gallery, so it's saved rather than held.
 */
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

import {
  identifierError,
  type CountryIdentifierField,
} from "@/lib/business-identifier";
import {
  BUSINESS_TYPES,
  INDUSTRIES,
  NDIS_INDUSTRY,
  ndisNumberError,
} from "@/lib/settings";

/* ------------------------------------------------------------------ *
 * The flow
 * ------------------------------------------------------------------ */

/**
 * The one page between sign-up and the product, and the celebration after it.
 *
 * Two routes and no more. Everything else onboarding used to do — how they
 * found us, what they're keeping their books in, how money reaches them, the
 * sidebar — is the overlay that opens over the dashboard, which is a surface
 * rather than a place and so has nothing to link to.
 */
export const BUSINESS_INFO_HREF = "/onboarding";
export const ONBOARDING_DONE_HREF = "/onboarding/done";

/**
 * The presets offered in the dropdown — everything the platform knows except
 * the "Other" catch-all, which the free-text option replaces. "Other" told us
 * nothing; a typed answer tells us which preset to add next.
 */
export const ONBOARDING_INDUSTRIES = INDUSTRIES.filter(
  (industry) => industry !== "Other",
);

/** The last row in the dropdown, which reveals the free-text field. */
export const CUSTOM_INDUSTRY_OPTION = "My industry isn't listed";

/**
 * What gets stored when the field is left alone. Something has to be, since the
 * template gallery and the starter catalogue both read it, and "Other" is the
 * honest label for an unanswered question — it's still selectable in Settings.
 */
export const UNSPECIFIED_INDUSTRY = "Other";

/** Whether a value is one of the presets, which is what decides the two modes. */
export function isPresetIndustry(value: string): boolean {
  return (ONBOARDING_INDUSTRIES as string[]).includes(value);
}

export type BusinessStructure = (typeof BUSINESS_TYPES)[number];

export type CompanyProfileDraft = {
  /** Typed as entered — spaces and all — and normalised on validation. */
  abn: string;
  businessName: string;
  /**
   * Where the business trades, as ISO 3166-1 alpha-2 — empty until chosen.
   *
   * Required, and the only answer on this screen that can never be revised:
   * it fixes the currency every figure is denominated in, the tax label, the
   * financial-year shape and which registration number is asked for. Those
   * reinterpret existing records rather than correct them, so the question is
   * asked once, here, and Settings shows it read-only afterwards.
   */
  countryIso2: string;
  /**
   * Who holds the account, as one field — split into `first_name`/`last_name`
   * on save (see `splitFullName`).
   *
   * Asked here rather than at sign-up. The sign-up step is "confirm it's you",
   * and a name is not a credential: it belongs beside the business it will
   * print next to on an invoice, where it can be corrected in the same breath
   * as the business name.
   */
  fullName: string;
  /**
   * A preset, something typed, or empty for "didn't say".
   *
   * Empty rather than pre-filled: a field that arrives already answered gets
   * left alone, and an industry nobody chose is worse than one nobody gave —
   * it looks like a fact. Optional either way; nothing here blocks Next.
   */
  industry: string;
  /**
   * Only collected for NDIS providers. The chooser needs both the industry and
   * a valid number before it offers NDIS invoicing, so asking here is what makes
   * choosing NDIS actually turn the feature on.
   */
  ndisNumber: string;
  /**
   * The one way the business can be reached, so it's asked for and checked —
   * unlike the ABN, there's no register that can fill this in instead.
   * Validated against `countryIso2` rather than a fixed shape: a number that's
   * a valid US mobile is not a valid AU one, and the country is already known
   * by the time this field is reached.
   */
  mobile: string;
};

/**
 * What a new account gets for the two questions step one stopped asking.
 *
 * Neither belongs in the way of a first screen, and both are a single control
 * away in Settings — the structure under Business details, the GST toggle under
 * Tax settings, which is where BAS and the accounting basis live.
 *
 * GST starts ON, at the country's standard rate: a new business can invoice
 * with tax from its first document, and one that isn't registered switches it
 * off once. A business register that says outright the business isn't
 * registered still wins over this default (see the onboarding step).
 */
export const DEFERRED_BUSINESS_DEFAULTS: {
  structure: BusinessStructure;
  gstRegistered: boolean;
} = {
  structure: "Sole trader",
  gstRegistered: true,
};

/* ------------------------------------------------------------------ *
 * Validation — live inline errors, keystrokes never blocked
 * ------------------------------------------------------------------ */

export function emptyCompanyProfile(): CompanyProfileDraft {
  // `countryIso2` deliberately empty rather than "AU": the one answer here
  // that can't be changed later shouldn't arrive pre-answered by a constant.
  // The onboarding step may fill it from the visitor's location, but says on
  // screen that it did — a guess shown as a guess.
  return {
    abn: "",
    businessName: "",
    countryIso2: "",
    fullName: "",
    industry: "",
    ndisNumber: "",
    mobile: "",
  };
}

/** Whether the industry chosen is the one that unlocks NDIS invoicing. */
export function isNdisChoice(draft: CompanyProfileDraft): boolean {
  return draft.industry === NDIS_INDUSTRY;
}

export type OnboardingIssue = { key: string; message: string };

/** Permissive: a domain with a dot in it. People type these many ways. */
export function websiteError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const trimmed = value.trim().replace(/^https?:\/\//i, "");
  return /^[^\s/]+\.[^\s/]{2,}/.test(trimmed)
    ? undefined
    : "Enter a valid website, e.g. yourbusiness.com.au";
}

/**
 * What step one insists on: one of an ABN or a business name, and nothing
 * malformed.
 *
 * Either identifies the business well enough to carry on — the ABN because the
 * lookup fills the name in from it, the name because plenty of sole traders
 * haven't registered one. Everything else on the screen has a working default
 * and is editable in Settings, so nothing else is allowed to hold up Next.
 */
/**
 * @param identifierField the business-number field this country asks for, from
 *   the Country Registry — null while the country list is still loading, or
 *   when the chosen country asks for no number at all. Its shape is the
 *   registry's, not ours — an 11-digit ABN with a mod-89 check digit, a
 *   13-digit NZBN — but whether it's optional here never is: this screen
 *   doesn't require one from any country, so a number is only validated when
 *   someone has actually typed one in.
 * @param countryName the chosen country's display name, for the one message
 *   that needs to say it ("Enter a mobile number for New Zealand.") rather
 *   than just its ISO2 code.
 */
export function companyProfileIssues(
  draft: CompanyProfileDraft,
  identifierField: CountryIdentifierField | null = null,
  countryName?: string,
): OnboardingIssue[] {
  const issues: OnboardingIssue[] = [];

  // The one unrevisable answer on this screen, so it is the one that blocks.
  // Defaulting it would be choosing for them, and silently: a business created
  // in the wrong country can't be moved once it has books.
  if (!draft.countryIso2.trim()) {
    issues.push({
      key: "countryIso2",
      message: "Choose the country your business trades in.",
    });
  }

  /*
   * Whatever this country calls its business number, validated the way that
   * country validates it — hardcoding `abnError` here meant a New Zealand
   * business was told its 13-digit NZBN had to be 11 digits.
   *
   * Never required to get past this screen, regardless of what the registry
   * says — an ABN lookup depends on a credential (ABR_GUID / NZBN keys) that
   * isn't always configured, and blocking sign-up on a field whose own lookup
   * can be down is worse than letting someone type their business name by
   * hand. A number that IS typed is still checked against the country's own
   * shape and check digit, so a typo is still caught. See `identifierError`.
   */
  const identifier = identifierError(identifierField, draft.abn, {
    require: false,
  });
  if (identifier) issues.push({ key: "abn", message: identifier });

  /*
   * The name is still checked, because a register can be down or hold a name
   * nobody trades under — but it is no longer the ALTERNATIVE to the number.
   * It used to be "one or the other", which let someone through with neither
   * a verified identity nor a lookup to fix it later.
   */
  if (draft.businessName.trim().length < 2) {
    issues.push({
      key: "businessName",
      message: "Enter your business name.",
    });
  }

  /*
   * Only the first word is required: plenty of people go by one name, and the
   * API's `last_name` is nullable — see `splitFullName`.
   */
  if (!splitFullName(draft.fullName).first_name) {
    issues.push({ key: "fullName", message: "Enter your full name." });
  }

  // Only when NDIS is the choice, and only if something's been typed: the
  // number can be finished later in Settings, but a wrong one shouldn't pass.
  if (draft.industry === NDIS_INDUSTRY && draft.ndisNumber.trim()) {
    const ndis = ndisNumberError(draft.ndisNumber);
    if (ndis) issues.push({ key: "ndisNumber", message: ndis });
  }

  /*
   * Required, and checked against the country just chosen above — a shape
   * that's a valid mobile number in one country is routinely not one in
   * another, so there's no fixed pattern to check it against the way a
   * website or an email has. No business can be reached without a number on
   * file, which is why this one blocks Next and the ABN no longer does.
   */
  const mobile = draft.mobile.trim();
  if (!mobile) {
    issues.push({ key: "mobile", message: "Enter your mobile number." });
  } else if (draft.countryIso2) {
    const parsed = parsePhoneNumberFromString(
      mobile,
      draft.countryIso2 as CountryCode,
    );
    if (!parsed?.isValid()) {
      issues.push({ key: "mobile", message: "Enter a valid mobile number." });
    } else if (parsed.country && parsed.country !== draft.countryIso2) {
      issues.push({
        key: "mobile",
        message: `Enter a mobile number for ${countryName ?? "the country you selected"}.`,
      });
    }
  }

  return issues;
}

/* ------------------------------------------------------------------ *
 * ABN lookup
 * ------------------------------------------------------------------ */

/** What a lookup tells us about the business behind an ABN. */
export type AbrRecord = {
  businessName: string;
  /** The ABR's own words, shown back so the prefill is explainable. */
  entityType: string;
  structure: BusinessStructure;
  gstRegistered: boolean;
  /** True when the register itself said whether it's registered, rather than the default standing in. */
  gstFromRegister?: boolean;
};

/**
 * MOCK ABR LOOKUP — to be replaced by the real ABN Lookup web service.
 *
 * Keyed off the ABN's digits rather than randomised, so the same ABN gives the
 * same business twice and a demo can be repeated. The real service returns the
 * entity name, the entity type and the GST registration date; those are exactly
 * the three things prefilled here, so swapping the body over is the whole job.
 */
export function mockAbrLookup(abn: string): AbrRecord {
  const digits = abn.replace(/\D/g, "");
  const total = [...digits].reduce((sum, digit) => sum + Number(digit), 0);
  return ABR_RECORDS[total % ABR_RECORDS.length];
}

const ABR_RECORDS: AbrRecord[] = [
  {
    businessName: "Turner Consulting",
    entityType: "Individual/Sole Trader",
    structure: "Sole trader",
    gstRegistered: true,
  },
  {
    businessName: "Northlight Studios Pty Ltd",
    entityType: "Australian Private Company",
    structure: "Company",
    gstRegistered: true,
  },
  {
    businessName: "Harper & Wells Partnership",
    entityType: "Partnership",
    structure: "Partnership",
    gstRegistered: true,
  },
  {
    // Under the threshold, so GST comes back off — the toggle has to be able to
    // go both ways or the prefill is just a switch that's always on.
    businessName: "Marlow Trades",
    entityType: "Individual/Sole Trader",
    structure: "Sole trader",
    gstRegistered: false,
  },
];

/*
 * There's no `previewFields` helper here any more.
 *
 * It flattened the draft into display strings for the preview card, which meant
 * the card's placeholders and its em dashes lived in a domain module rather
 * than in the card. They're presentation, and they're now where they're
 * rendered — see `BusinessPreviewCard`.
 */

/* ------------------------------------------------------------------ *
 * Names and numbers, as they're shown back
 * ------------------------------------------------------------------ */

/**
 * The sign-up form asks for one name; the API wants two. Mirrors
 * sole-webapp's own `splitFullName` (`components/Auth/Onboarding/index.js`)
 * exactly: split on whitespace, the first word is `first_name`, everything
 * after is rejoined with a single space as `last_name` — or `null` when
 * there's nothing after it, since `last_name` is nullable and plenty of
 * people go by one name. Left as typed, not title-cased — this is a value
 * sent to the API, not one shown back.
 */
export function splitFullName(value: string): {
  first_name: string;
  last_name: string | null;
} {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const first_name = parts[0] || "";
  const last_name = parts.slice(1).join(" ") || null;
  return { first_name, last_name };
}

/**
 * "jonathan" → "Jonathan", "mary-jane o'brien" → "Mary-Jane O'Brien".
 *
 * Splits on the separators rather than on spaces alone, so a hyphenated or
 * apostrophised name doesn't end up half-capitalised. Anything already cased
 * deliberately — "McLeod" — is left alone, since only the first letter of each
 * part is touched.
 */
export function titleCaseName(value: string): string {
  return value
    .trim()
    .split(/(\s+|-|')/)
    .map((part) =>
      /^[\s\-']+$/.test(part) || !part
        ? part
        : part[0].toUpperCase() + part.slice(1),
    )
    .join("");
}

/** 12 345 678 901 — the ATO's own grouping. */
export function formatAbn(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "—";
  if (digits.length !== 11) return digits;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
}

/* ------------------------------------------------------------------ *
 * Inviting an accountant
 * ------------------------------------------------------------------ */

/** Permissive, for the same reason as everywhere else on the platform. */
export function accountantEmailError(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    ? undefined
    : "Enter a valid email address.";
}

export function inviteIssues(email: string): OnboardingIssue[] {
  const format = accountantEmailError(email);
  if (!email.trim()) {
    return [{ key: "email", message: "Enter your accountant's email." }];
  }
  return format ? [{ key: "email", message: format }] : [];
}
