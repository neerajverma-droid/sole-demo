/**
 * The business's own details, as Settings edits them — read from the server
 * and written back to it.
 *
 * This replaces the `business` and `bank` slices of the old `sole-settings`
 * store, which were neither. That store shipped with a fabricated profile
 * ("Jonathan's Firm", ABN 12 345 678 901), was never seeded from the API, was
 * global rather than per-business, and its Save button wrote localStorage and
 * showed "Business details saved" without a request leaving the browser. A
 * second business opened in the same browser read the first one's details, and
 * `hooks/use-active-business-industry.ts` exists entirely because that store
 * put its own hardcoded default industry in the UI.
 *
 * Reads come from `GET /businesses` via `useActiveBusiness` — the list
 * endpoint returns whole records, so the open business's details are already
 * in hand. Writes go to `POST /user/update_business_profile`, which scopes
 * itself to the `business_id` the axios client stamps on every request.
 *
 * Two fields in the form have no column behind them — `website` and `payId`.
 * They stay local (`stores/preferences.ts`) rather than being dropped, and are
 * marked as such there. Everything else here is real.
 *
 * The field names sent are the ones sole-webapp's `Account.js` and `Payment.js`
 * (components/Settings/) post to the same endpoint, so a profile saved from
 * either app round-trips through the other unchanged.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { getCountryCallingAndPhoneNumber } from "@/lib/phone";
import { splitFullName } from "@/lib/onboarding";
import { formatBusinessAddress, type BusinessProfile } from "@/lib/businesses";

/** Same default sole-webapp's Account.js applies to an unprefixed number. */
const DEFAULT_CALLING_CODE = "+61";

/**
 * The business half of the Settings form.
 *
 * `industryId` rather than an industry name, which is the other thing the old
 * store got wrong: it held a string from a local, made-up `INDUSTRIES` list
 * and posted `{ industry: "<name>" }`, a field `updateBusinessProfile` does
 * not read. The industry was silently discarded on every save. The wire format
 * is `industry_id`, so that is what the form carries, resolved to a label for
 * display against the live `/industry` list.
 */
export type BusinessDetailsForm = {
  businessName: string;
  abn: string;
  industryId: number | null;
  companyType: string;
  /**
   * What the Places search box holds — the whole address on one line, which is
   * also the legacy `address` column. Kept beside the parsed parts rather than
   * derived from them because it is what the record actually stores, and
   * because an address typed by hand never goes through Places at all.
   */
  addressSearch: string;
  /** Street line — `address_line1`, the column that supersedes `address`. */
  addressLine1: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  /** The combined display value, split back into `country_code` + `mobile_no` on save. */
  phone: string;
  email: string;
  ndisNumber: string;
};

export type BankDetailsForm = {
  /** Name on the account, as it appears on the invoice. */
  accountName: string;
  /** The institution — `bank_name`, which sole-webapp's Payment.js requires. */
  bankName: string;
  bsb: string;
  accountNumber: string;
};

/** Blank, for the window before the business list has landed. */
export const EMPTY_BUSINESS_DETAILS: BusinessDetailsForm = {
  businessName: "",
  abn: "",
  industryId: null,
  companyType: "",
  addressSearch: "",
  addressLine1: "",
  city: "",
  state: "",
  postcode: "",
  country: "",
  phone: "",
  email: "",
  ndisNumber: "",
};

export const EMPTY_BANK_DETAILS: BankDetailsForm = {
  accountName: "",
  bankName: "",
  bsb: "",
  accountNumber: "",
};

/**
 * The open business, as the form reads it.
 *
 * Empty rather than invented when there's no business yet: a form showing
 * someone else's plausible-looking details is worse than one showing none,
 * because nobody corrects what looks already filled in.
 */
export function businessDetailsFrom(
  business: BusinessProfile | null,
): BusinessDetailsForm {
  if (!business) return EMPTY_BUSINESS_DETAILS;

  const { countryCallingCode, nationalNumber } = getCountryCallingAndPhoneNumber(
    (business.countryCode || DEFAULT_CALLING_CODE) + business.mobile,
    DEFAULT_CALLING_CODE,
  );

  return {
    businessName: business.name === "Untitled business" ? "" : business.name,
    abn: business.abn,
    industryId: business.industryId,
    companyType: business.companyType,
    // The search box opens showing the address already on file, so picking a
    // suggestion is a correction rather than a retype. `mapApiBusiness` folds
    // the legacy single-line `address` column into `line1`, which is why there
    // is no separate raw value to seed this from.
    addressSearch: formatBusinessAddress(business),
    addressLine1: business.address.line1,
    city: business.address.city,
    state: business.address.state,
    postcode: business.address.postcode,
    country: business.address.country,
    // The two stored fields rebuilt into the one value the input edits — the
    // same round-trip `businessDraftFrom` does on the add-business form.
    phone: countryCallingCode + nationalNumber,
    email: business.email,
    ndisNumber: business.ndisNumber,
  };
}

export function bankDetailsFrom(
  business: BusinessProfile | null,
): BankDetailsForm {
  if (!business) return EMPTY_BANK_DETAILS;
  return {
    accountName: business.bank.accountHolder,
    bankName: business.bank.bankName,
    bsb: business.bank.bsb,
    accountNumber: business.bank.accountNumber,
  };
}

/**
 * How the books are kept — `accounting_type` on the same record.
 *
 * It belongs to the Tax section rather than this one, but it is a column on
 * `businesses` like everything else here, so it saves the same way. Anything
 * the server hasn't been told reads as Cash, which is what a sole trader is
 * on by default.
 */
export function accountingBasisFrom(
  business: BusinessProfile | null,
): "Cash" | "Accrual" {
  return business?.accountingType === "accrual" ? "Accrual" : "Cash";
}

export function saveAccountingBasis(basis: "Cash" | "Accrual") {
  return postBusinessProfile({
    accounting_type: basis === "Accrual" ? "accrual" : "cash",
  });
}

/**
 * Save, as an encrypted body.
 *
 * sole-ocr registers `update_business_profile` as POST and decrypts a `data`
 * field when one is present — same envelope `CompanyProfileStep` uses. Only
 * the fields a given section owns are sent: the handler applies each key it
 * finds and leaves the rest of the row alone, so a partial body is a partial
 * update rather than a blanking of everything omitted.
 *
 * Throws on failure. The caller shows the message and keeps the draft, which
 * is the whole point of making the save real — a failed write has to be
 * visible, and the old local-only Save could not fail at all.
 */
async function postBusinessProfile(
  fields: Record<string, unknown>,
): Promise<void> {
  const response = await api.post<{ success?: boolean; message?: string }>(
    apiRoutes.user.updateUserProfile,
    buildEncryptedRequestBody(fields),
  );

  // The endpoint answers 200 with `{ success: false }` for a business the
  // caller can't write to, so the status alone isn't the answer.
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't save your changes.");
  }
}

/**
 * Set the business's country. Onboarding only — see below.
 *
 * A different endpoint from everything else here, and it has to be:
 * `update_business_profile` has no country column at all, so a `country_iso2`
 * posted there is dropped like any other key it doesn't recognise.
 * `PATCH /businesses/:id` is the one route that writes it, because it runs
 * through the Country Registry (`resolveUpdateFields`) — which also resolves
 * the currency and timezone that come with the choice.
 *
 * ── Why this is called once, from one screen ───────────────────────────────
 *
 * The country decides the currency every figure is denominated in, the tax
 * label (GST vs VAT), the financial-year shape and which registration number
 * is required. Changing it after any of that has been used would reinterpret
 * existing records rather than correct them, so it is asked once at onboarding
 * and never offered again — Settings renders it read-only.
 *
 * The backend keeps its own guard regardless of what any client does: the same
 * handler refuses with 409 once the business has books. That is the backstop,
 * not the rule — the rule is that the product never offers the control.
 */
export async function saveBusinessCountry(
  businessId: string,
  iso2: string,
  registrationNumber: string,
): Promise<void> {
  const response = await api.patch<{ success?: boolean; message?: string }>(
    apiRoutes.businesses.update(businessId),
    {
      country_iso2: iso2.toUpperCase(),
      /*
       * `business_registration_number`, not `abn` — the column an ABN is only
       * Australia's instance of. A New Zealand NZBN sent as `abn` would land
       * in the legacy AU column and leave the real one empty.
       *
       * It rides on this call rather than on the profile save for two
       * reasons: `update_business_profile` writes `abn` and nothing else, and
       * this handler validates the number against the country's own schema
       * (pattern and check digit) in the same request that sets the country —
       * so the two can never be checked against each other out of order. The
       * backend mirrors it back into `abn` itself when the country is AU.
       */
      business_registration_number: registrationNumber.trim(),
    },
  );

  if (response.data?.success === false) {
    throw new Error(
      response.data.message || "Couldn't save the country for this business.",
    );
  }
}

/**
 * The account holder's name.
 *
 * A different endpoint again, and for a reason worth stating: this is a fact
 * about the PERSON, not the business. `/user/update` writes `user_info`, which
 * is where `buildUserProfile` reads `full_name` from — so this is what makes
 * the app greet someone by name. `update_business_profile` has `first_name`
 * and `last_name` columns too, but those are the business's contact, and a
 * name written only there never reaches the signed-in user's profile.
 *
 * Split the way the API stores it: first word, then everything after. A single
 * name is legitimate, so `last_name` is nullable — see `splitFullName`.
 */
export async function saveAccountName(fullName: string): Promise<void> {
  const { first_name, last_name } = splitFullName(fullName);
  if (!first_name) return;

  const response = await api.post<{ success?: boolean; message?: string }>(
    apiRoutes.user.addAccInfo,
    { first_name, last_name },
  );

  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't save your name.");
  }
}

/**
 * The account holder's own profile — their name, mobile and (read-only)
 * email — as the Settings "Profile" tab reads and writes it. Kept separate
 * from `BusinessDetailsForm`/`saveAccountName` above for the same reason that
 * function exists: these are facts about the PERSON, read from and written to
 * `/user/update`'s `user_info`/`users` columns, never `update_business_profile`.
 *
 * Email has no setter here — sole-webapp's own Account.js renders the same
 * field disabled, because changing it is a verification flow neither screen
 * offers.
 */
export type PersonalProfileForm = {
  fullName: string;
  /** The combined display value, split back into `country_code` + `mobile_no` on save. */
  mobile: string;
  email: string;
};

export const EMPTY_PERSONAL_PROFILE: PersonalProfileForm = {
  fullName: "",
  mobile: "",
  email: "",
};

type ApiPersonalProfile = {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  user_email?: string;
  email?: string;
  country_code?: string;
  mobile_number?: string;
};

/**
 * `/user/getProfile` despite the name POSTs (sole-webapp's own
 * `getUserProfile` does the same — see `fetchLogo` in
 * `lib/sales-settings-api.ts`), and always answers `{ data: { user: {...} } }`
 * — see sole-ocr's `getFullProfile`.
 */
export async function fetchPersonalProfile(): Promise<PersonalProfileForm> {
  const response = await api.post<{
    success?: boolean;
    data?: { user?: ApiPersonalProfile };
  }>(apiRoutes.user.getUserProfile, buildEncryptedRequestBody({}));

  const u = response.data?.data?.user ?? {};
  const fullName =
    u.full_name || [u.first_name, u.last_name].filter(Boolean).join(" ");

  const { countryCallingCode, nationalNumber } = getCountryCallingAndPhoneNumber(
    (u.country_code || DEFAULT_CALLING_CODE) + (u.mobile_number || ""),
    DEFAULT_CALLING_CODE,
  );

  return {
    fullName,
    // Empty rather than a bare calling code — a number nobody has entered
    // yet should look unanswered, not pre-filled with "+61".
    mobile: u.mobile_number ? countryCallingCode + nationalNumber : "",
    email: u.user_email || u.email || "",
  };
}

/** Everything on the Profile tab except email — see the type doc above. */
export async function savePersonalProfile(values: {
  fullName: string;
  mobile: string;
}): Promise<void> {
  const { first_name, last_name } = splitFullName(values.fullName);
  const { countryCallingCode, nationalNumber } = getCountryCallingAndPhoneNumber(
    values.mobile,
    DEFAULT_CALLING_CODE,
  );

  const response = await api.post<{ success?: boolean; message?: string }>(
    apiRoutes.user.addAccInfo,
    {
      first_name,
      last_name,
      // The backend only writes mobile_no when both arrive non-empty, so an
      // untouched/blank field is simply left off rather than sent as "".
      ...(nationalNumber
        ? { mobile_no: nationalNumber, country_code: countryCallingCode }
        : {}),
    },
  );

  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't save your profile.");
  }
}

export function saveBusinessDetails(values: BusinessDetailsForm) {
  const { countryCallingCode, nationalNumber } = getCountryCallingAndPhoneNumber(
    values.phone.trim(),
    DEFAULT_CALLING_CODE,
  );

  return postBusinessProfile({
    business_name: values.businessName.trim(),
    abn: values.abn.trim(),
    // Omitted rather than sent as null when unset: null would clear a stored
    // industry on a save from a form that simply hadn't loaded it yet.
    ...(values.industryId != null ? { industry_id: values.industryId } : {}),
    company_type: values.companyType,

    // Both the one-line column and the parsed parts, the way
    // `buildBusinessRequestBody` sends them — `address` is what the older
    // records and the PDF footer read, `address_line1` and below are what
    // everything written since reads.
    address: values.addressSearch.trim(),
    address_line1: values.addressLine1.trim(),
    city: values.city.trim(),
    state: values.state.trim(),
    postcode: values.postcode.trim(),
    country: values.country.trim(),

    country_code: countryCallingCode,
    mobile_no: nationalNumber,
    // sole-webapp's Account.js posts the business email to both keys, and
    // `mapApiBusiness` reads `business_email` back — sending only `email`
    // leaves the record's own copy stale.
    email: values.email.trim(),
    business_email: values.email.trim(),
    ndis_no: values.ndisNumber.trim(),
  });
}

export function saveBankDetails(values: BankDetailsForm) {
  return postBusinessProfile({
    account_holder: values.accountName.trim(),
    bank_name: values.bankName.trim(),
    bsb: values.bsb.trim(),
    account_number: values.accountNumber.trim(),
  });
}
