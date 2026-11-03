/**
 * SolePay onboarding: what Worldpay needs before it can settle payments to you.
 *
 * Five steps over four groups of answers — the entity, the one person who
 * signs for it, where the money goes, and the paperwork that proves the first
 * three. The shape lives here rather than in the screen because the sub-pages
 * each own one group of it, and they have to agree about what an account or a
 * document slot is.
 *
 * Ported from sole-webapp's real `/worldpay` flow (`components/Worldpay/index.js`,
 * `EntityForm.js`, `MemberForm.js`, `schemas/Worldpay.schema.js`) and cross-checked
 * against sole-ocr's `worldpay.service.js` — "SolePay" is this product's brand
 * name for the same Worldpay merchant-boarding integration. Two real backend
 * quirks worth keeping in mind when touching this file:
 *
 * 1. The backend only ever keeps ONE signatory (`Members[0]`) — there is no
 *    multi-director support server-side, so this only ever edits one director,
 *    unlike a naive list-of-directors UI would suggest.
 * 2. `saveWorldpayDraftLegacy` always overwrites the FULL entity and FULL
 *    member on every save — sending only the section that changed would null
 *    out the other one, since the sanitizer fills every omitted key with a
 *    default rather than leaving it alone. `saveSolePayDraft` below always
 *    sends the complete current state for exactly this reason.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { toIsoDate } from "@/lib/invoices";
import {
  Building2,
  FileText,
  Landmark,
  LayoutGrid,
  Users,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * The steps
 * ------------------------------------------------------------------ */

/**
 * The five steps, in the order the answers stop depending on each other.
 *
 * `href` is the addition over a plain step list — these are pages rather than
 * a wizard's slides, so each step has somewhere to be.
 *
 * Overview is a step in the tracker but not a form: it's the summary of the
 * other four, which is why `stepsDone` always counts it.
 */
export const SOLEPAY_STEPS = [
  {
    id: "overview",
    label: "Overview",
    title: "Overview",
    subtitle: "What SolePay has so far, and what's still to fill in.",
    href: "/payments/solepay/onboarding",
    icon: LayoutGrid as LucideIcon,
  },
  {
    id: "entity",
    label: "Entity",
    title: "Entity details",
    subtitle: "The business SolePay will be settling to.",
    href: "/payments/solepay/onboarding/entity",
    icon: Building2 as LucideIcon,
  },
  {
    id: "directors",
    label: "Director",
    title: "Director",
    subtitle: "Whoever signs for the business.",
    href: "/payments/solepay/onboarding/directors",
    icon: Users as LucideIcon,
  },
  {
    id: "accounts",
    label: "Accounts",
    title: "Bank accounts",
    subtitle: "Where takings are settled, and where fees are billed.",
    href: "/payments/solepay/onboarding/accounts",
    icon: Landmark as LucideIcon,
  },
  {
    id: "documents",
    label: "Documents",
    title: "Documents",
    subtitle: "The paperwork that verifies the answers above.",
    href: "/payments/solepay/onboarding/documents",
    icon: FileText as LucideIcon,
  },
] as const;

export type SolePayStepId = (typeof SOLEPAY_STEPS)[number]["id"];

/* ------------------------------------------------------------------ *
 * The option lists — real Worldpay ids, not display labels
 * ------------------------------------------------------------------ */

/**
 * How the business is structured. Ids are Worldpay's own numeric entity-type
 * codes (verbatim from sole-webapp's `ENTITY_TYPE_OPTIONS`) — there's a real
 * gap at "2", and "4" (Trustee) is what makes a Trust Agreement document
 * required in the Documents step.
 */
export const SOLEPAY_ENTITY_TYPES = [
  { id: "0", name: "Individual / Sole Proprietorship" },
  { id: "1", name: "Company" },
  { id: "3", name: "Partnership" },
  { id: "4", name: "Trustee" },
  { id: "5", name: "Non-Profit Organization" },
  { id: "6", name: "Government / Council / Statutory Authority" },
  { id: "7", name: "Association" },
] as const;

/**
 * Worldpay's own industry list, verbatim from sole-webapp's
 * `EntityForm.js` `INDUSTRY_OPTIONS` — not `lib/settings`' `INDUSTRIES`,
 * which is a different, much longer list built for the business profile
 * form and shares no real values with this one beyond a few names.
 */
export const SOLEPAY_INDUSTRIES = [
  "Professional Services",
  "Retail",
  "Hospitality",
  "Health",
  "Education",
  "Construction",
  "Technology",
  "Other",
] as const;

/** The photo ID a director can verify with — Worldpay only ever accepts these two. */
export const SOLEPAY_ID_TYPES = [
  { id: "1", name: "Driving Licence" },
  { id: "2", name: "Passport" },
] as const;

/** Australian states and territories, for an address and a licence. */
export const AU_STATES = [
  "ACT",
  "NSW",
  "NT",
  "QLD",
  "SA",
  "TAS",
  "VIC",
  "WA",
] as const;

/* ------------------------------------------------------------------ *
 * The answers
 * ------------------------------------------------------------------ */

/**
 * One address, reused by the entity and by the director.
 *
 * A single line, not a line1/line2 pair — sole-webapp's own `EntitySchema` /
 * `MemberSchema` only ever have `address1`, so a second line here would be a
 * field this form asks for that the real one, and Worldpay itself, doesn't.
 */
export type SolePayAddress = {
  line1: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
};

export const EMPTY_SOLEPAY_ADDRESS: SolePayAddress = {
  line1: "",
  city: "",
  state: "",
  postcode: "",
  // Right for essentially everyone using this, and a required field nobody has
  // to think about is a required field nobody resents.
  country: "Australia",
};

/**
 * The business itself.
 *
 * `type` holds a `SOLEPAY_ENTITY_TYPES` id ("0".."7"), not the label — that's
 * the value Worldpay actually stores. `transactionsFor` is free text on the
 * real form ("Test sales of goods and services"), not a fixed list.
 */
export type SolePayEntity = {
  name: string;
  legalName: string;
  abn: string;
  type: string;
  email: string;
  industry: string;
  website: string;
  phone: string;
  /** Free text — what the payments are for, in the merchant's own words. */
  transactionsFor: string;
  maxTransaction: string;
  avgTransaction: string;
  /** Expected number per month, as typed. */
  transactionQty: string;
  /**
   * Whether the work is invoiced after it's delivered.
   *
   * A boolean because the form asks it with a switch — "Yes"/"No" as text
   * would be a two-value string that every reader has to compare carefully.
   */
  paidInArrears: boolean;
  
  daysInAdvance: string;
};

export const EMPTY_SOLEPAY_ENTITY: SolePayEntity = {
  name: "",
  legalName: "",
  abn: "",
  type: "",
  email: "",
  industry: "",
  website: "",
  // AU by default, same as `PhoneInput`'s own `defaultCountry` — a blank
  // field would show no dial code at all until someone starts typing.
  phone: "+61",
  transactionsFor: "",
  maxTransaction: "",
  avgTransaction: "",
  transactionQty: "",
  paidInArrears: false,
  daysInAdvance: "",
};

/**
 * The one person who signs for the business, and where they live.
 *
 * Worldpay only ever keeps one (`Members[0]` server-side — see the module
 * comment), so unlike a generic "directors" list this is a single record, not
 * an array. `idType` and `licenceState`/`cardNumber` mirror the real
 * conditional: the licence fields only matter, and are only required, when
 * `idType` is "1" (Driving Licence).
 */
export type SolePayDirector = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** ISO `YYYY-MM-DD`. Converted to Worldpay's `YYYYMMDD` only at save time. */
  dateOfBirth: string;
  /** A `SOLEPAY_ID_TYPES` id — "1" (Driving Licence) or "2" (Passport). */
  idType: string;
  idNumber: string;
  /** Share of the business, as a percent string, e.g. "25.3". */
  ownershipPercent: string;
  /** The state that issued the licence — only asked for a driving licence. */
  licenceState: string;
  /** The number on the front of the card — only asked for a driving licence. */
  cardNumber: string;
  address: SolePayAddress;
};

export const EMPTY_SOLEPAY_DIRECTOR: SolePayDirector = {
  firstName: "",
  lastName: "",
  email: "",
  // AU by default — see `EMPTY_SOLEPAY_ENTITY.phone`.
  phone: "+61",
  dateOfBirth: "",
  // The one field that arrives answered: it's what nearly every director
  // verifies with, and the two that follow it only make sense for a licence.
  idType: "1",
  idNumber: "",
  ownershipPercent: "",
  licenceState: "",
  cardNumber: "",
  address: { ...EMPTY_SOLEPAY_ADDRESS },
};

/** Matches Worldpay's own account shape exactly — no bank-name field, since it doesn't have one. */
export type SolePayBankAccount = {
  accountName: string;
  bsb: string;
  accountNumber: string;
};

export const EMPTY_SOLEPAY_BANK_ACCOUNT: SolePayBankAccount = {
  accountName: "",
  bsb: "",
  accountNumber: "",
};

/**
 * The two accounts, and whether they're the same one.
 *
 * Most people settle and get billed to one account, so the mirror flag is what
 * stops the second form being a retype of the first. It's a fact about the
 * answer rather than about the form, which is why it's stored: reloading the
 * page has to remember that billing wasn't skipped, it was the same.
 */
export type SolePayBankAccounts = {
  settlement: SolePayBankAccount;
  billing: SolePayBankAccount;
  billingSameAsSettlement: boolean;
};

/**
 * The slots the documents step fills.
 *
 * Slots rather than a list of uploads, because Worldpay asks for specific
 * things and "three files attached" doesn't answer whether the right three
 * are there. `trust-agreement` is conditional — see `requiredDocumentSlots`.
 */
export const SOLEPAY_DOCUMENT_SLOTS = [
  {
    id: "id-front",
    label: "Identification front",
    hint: "Front side of your ID. PNG, JPG or PDF.",
    pdfOnly: false,
  },
  {
    id: "id-back",
    label: "Identification back",
    hint: "Back side of your ID. PNG, JPG or PDF.",
    pdfOnly: false,
  },
  {
    id: "settlement-statement",
    label: "Settlement bank statement",
    hint: "Showing the settlement account name and BSB. PDF only — no screenshots or photos, dated within the last 3 months.",
    pdfOnly: true,
  },
  {
    id: "billing-statement",
    label: "Billing bank statement",
    hint: "Showing the billing account name and BSB. PDF only — no screenshots or photos, dated within the last 3 months.",
    pdfOnly: true,
  },
  {
    id: "trust-agreement",
    label: "Trust agreement",
    hint: "Required for a trustee entity. PNG, JPG or PDF.",
    pdfOnly: false,
  },
] as const;

export type SolePayDocumentSlotId =
  (typeof SOLEPAY_DOCUMENT_SLOTS)[number]["id"];

/** What was uploaded into a slot, or null while it's empty. */
export type SolePayDocument = {
  name: string;
  /** ISO `YYYY-MM-DD`. */
  uploadedAt: string;
} | null;

export type SolePayDocuments = Record<SolePayDocumentSlotId, SolePayDocument>;

export const EMPTY_SOLEPAY_DOCUMENTS: SolePayDocuments = {
  "id-front": null,
  "id-back": null,
  "settlement-statement": null,
  "billing-statement": null,
  "trust-agreement": null,
};


export const SOLEPAY_PDF_ONLY_ACCEPT = "application/pdf,.pdf";
export const SOLEPAY_IMAGE_OR_PDF_ACCEPT =
  "image/png,.png,image/jpeg,.jpg,.jpeg,application/pdf,.pdf";

export const SOLEPAY_MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * The bytes each accepted type actually starts with, read off the file
 * itself rather than trusted from its extension or MIME type — the same
 * check `nexxtapFileIssue` applies for the NextTap flow. A ".pdf" that's
 * really a screenshot renamed by hand should fail here, not at Worldpay.
 */
const SOLEPAY_FILE_SIGNATURES = {
  pdf: [[0x25, 0x50, 0x44, 0x46, 0x2d]], // "%PDF-"
  png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  jpeg: [[0xff, 0xd8, 0xff]],
} as const;

const SOLEPAY_KIND_BY_MIME: Record<
  string,
  keyof typeof SOLEPAY_FILE_SIGNATURES
> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
};

function solepaySignatureMatches(
  head: Uint8Array,
  kind: keyof typeof SOLEPAY_FILE_SIGNATURES,
): boolean {
  const signatures = SOLEPAY_FILE_SIGNATURES[kind];
  if (kind === "pdf") {
    // A PDF's header can sit a little into the file rather than at byte 0.
    return signatures.some((signature) =>
      head.some((_, offset) =>
        signature.every((byte, index) => head[offset + index] === byte),
      ),
    );
  }
  return signatures.some((signature) =>
    signature.every((byte, index) => head[index] === byte),
  );
}

/**
 * Why a picked document can't be used for a slot, or null when it can.
 *
 * Mirrors the b2b side's rule (`FileUploadCard`'s `pdfOnly`, spmfrontend):
 * a bank statement has to be a real PDF, nothing else accepts more than
 * PNG/JPG/PDF, and nothing over 20 MB. Content is sniffed from its first
 * bytes so a mislabeled or renamed file is caught here instead of failing
 * later at Worldpay.
 */
export async function solepayFileIssue(
  file: File,
  pdfOnly: boolean,
): Promise<string | null> {
  const kind = SOLEPAY_KIND_BY_MIME[file.type];
  const allowed: Array<keyof typeof SOLEPAY_FILE_SIGNATURES> = pdfOnly
    ? ["pdf"]
    : ["pdf", "png", "jpeg"];

  if (!kind || !allowed.includes(kind)) {
    return pdfOnly
      ? "Only PDF files are accepted for a bank statement — screenshots and photos can't be used."
      : "Only PNG, JPG, JPEG or PDF files are accepted.";
  }
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > SOLEPAY_MAX_FILE_BYTES) {
    return "That file is over the 20 MB limit.";
  }

  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  } catch {
    return `${file.name} couldn't be read. Try choosing it again.`;
  }

  return solepaySignatureMatches(head, kind)
    ? null
    : `${file.name} looks damaged or isn't really the type its name says. Open it to check, then export or download it again.`;
}

/**
 * Which slots are actually asked for.
 *
 * Mirrored billing is one account, so it's one statement — asking for a second
 * copy of the same document is a step nobody can finish honestly. A Trust
 * Agreement is only asked of a Trustee entity (`entityType === "4"`), the same
 * rule the backend's own `getMissingFields` applies.
 */
export function requiredDocumentSlots(
  billingSameAsSettlement: boolean,
  entityType: string,
  idType: string,
): SolePayDocumentSlotId[] {
  const required: SolePayDocumentSlotId[] = [
    "id-front",
    "settlement-statement",
  ];
  if (idType === "1") required.push("id-back");
  if (!billingSameAsSettlement) required.push("billing-statement");
  if (entityType === "4") required.push("trust-agreement");
  return required;
}

/** Everything the four steps collect. */
export type SolePayOnboarding = {
  entity: SolePayEntity;
  address: SolePayAddress;
  director: SolePayDirector;
  bankAccounts: SolePayBankAccounts;
  documents: SolePayDocuments;
};

export const EMPTY_SOLEPAY_ONBOARDING: SolePayOnboarding = {
  entity: { ...EMPTY_SOLEPAY_ENTITY },
  address: { ...EMPTY_SOLEPAY_ADDRESS },
  director: { ...EMPTY_SOLEPAY_DIRECTOR, address: { ...EMPTY_SOLEPAY_ADDRESS } },
  bankAccounts: {
    settlement: { ...EMPTY_SOLEPAY_BANK_ACCOUNT },
    billing: { ...EMPTY_SOLEPAY_BANK_ACCOUNT },
    billingSameAsSettlement: true,
  },
  documents: { ...EMPTY_SOLEPAY_DOCUMENTS },
};

/* ------------------------------------------------------------------ *
 * Wire-format conversions
 *
 * Worldpay's own field names and encodings, ported verbatim from
 * sole-webapp's `components/Worldpay/index.js` (`hydrateFromDraftStatus`,
 * `buildDraftPayload`) and confirmed against sole-ocr's `worldpay.service.js`.
 * ------------------------------------------------------------------ */

const digitsOnly = (value: string) => value.replace(/\D/g, "");

/** `"25.3"` (percent) <-> `"2530"` (basis points) — Worldpay stores ownership as the latter. */
export function percentToBasisPoints(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const pct = Number(raw);
  if (!Number.isFinite(pct)) return null;
  return String(Math.round(pct * 100));
}

export function basisPointsToPercent(value: unknown): string {
  if (value === undefined || value === null || String(value).trim() === "") {
    return "";
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  const pct = num / 100;
  return Number.isInteger(pct) ? String(pct) : String(pct).replace(/\.?0+$/, "");
}

/** ISO `YYYY-MM-DD` -> Worldpay's `YYYYMMDD`, or null when it isn't a full date yet. */
export function formatDobForWire(iso: string): string | null {
  const digits = digitsOnly(iso);
  return /^\d{8}$/.test(digits) ? digits : null;
}

/** Worldpay's `YYYYMMDD` -> ISO `YYYY-MM-DD`, or "" when it isn't one. */
export function parseDobFromWire(value: unknown): string {
  const digits = String(value ?? "").trim();
  if (!/^\d{8}$/.test(digits)) return "";
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/**
 * The real AU ABN checksum (modulus 89), ported from sole-ocr's
 * `isValidAustralianAbn` so a bad ABN is caught here instead of on submit.
 */
export function isValidAustralianAbn(value: string): boolean {
  const digits = digitsOnly(value);
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const numbers = digits.split("").map(Number);
  numbers[0] -= 1;
  const total = numbers.reduce((sum, digit, index) => sum + digit * weights[index], 0);
  return total % 89 === 0;
}

/** Worldpay's own phone rule: `+<digits>`, and AU numbers specifically can't carry the local leading 0. */
export function isValidSolePayPhone(phone: string): boolean {
  const value = phone.replace(/\s+/g, "");
  if (!/^\+\d{8,15}$/.test(value)) return false;
  if (value.startsWith("+61")) return /^\+61[23478]\d{8}$/.test(value);
  return true;
}

type WireAccountEntry = {
  account: {
    accountnumber: string;
    routing: string;
    accountname: string;
    accountType: number;
  };
};

function accountFilled(account: SolePayBankAccount): boolean {
  return (
    !!account.accountName.trim() &&
    !!account.bsb.trim() &&
    !!account.accountNumber.trim()
  );
}

function toWireAccount(
  account: SolePayBankAccount,
  accountType: 1 | 2,
): WireAccountEntry {
  return {
    account: {
      accountnumber: digitsOnly(account.accountNumber),
      routing: digitsOnly(account.bsb),
      accountname: account.accountName,
      accountType,
    },
  };
}

/**
 * The full wire payload for a save — always the complete entity, address and
 * director together, whichever step's Save button triggered it. See the
 * module comment: sending only the changed section would null out the rest.
 */
function buildDraftPayload(state: SolePayOnboarding) {
  const { entity, address, director, bankAccounts } = state;

  const accounts: WireAccountEntry[] = [];
  if (accountFilled(bankAccounts.settlement)) {
    accounts.push(toWireAccount(bankAccounts.settlement, 1));
  }
  const billingAccount = bankAccounts.billingSameAsSettlement
    ? bankAccounts.settlement
    : bankAccounts.billing;
  if (accountFilled(billingAccount)) {
    accounts.push(toWireAccount(billingAccount, 2));
  }

  return {
    entity: {
      name: entity.name || null,
      fulllegalname: entity.legalName || null,
      abn: entity.abn ? digitsOnly(entity.abn) : null,
      address1: address.line1 || null,
      city: address.city || null,
      state: address.state || null,
      zip: address.postcode || null,
      country: address.country || "Australia",
      email: entity.email || null,
      // Every merchant listed publicly — the real form never asks this, it's
      // sent as a constant.
      public: 1,
      industry: entity.industry || null,
      // Sent as a number, matching sole-webapp's own `Number(entityState.type)`
      // — a blank value becomes `NaN`, which `JSON.stringify` already turns
      // into `null` on the wire, so this is the same payload without a
      // separate branch to get there.
      type: Number(entity.type),
      website: entity.website || null,
      phone: entity.phone || null,
      transactionsFor: entity.transactionsFor || null,
      maxTransaction: Number(entity.maxTransaction),
      avgTransaction: Number(entity.avgTransaction),
      qtyTransactions: Number(entity.transactionQty),
      paidInArrears: entity.paidInArrears,
      // Only sent when it applies — mirrors sole-webapp's own
      // `!entityState.paid_in_arrears && entityState.days_in_advance !== "" ...`
      // so a business paid in arrears never has a stale days-in-advance value
      // resubmitted once they've ticked that switch.
      daysInAdvance:
        !entity.paidInArrears && entity.daysInAdvance !== ""
          ? Number(entity.daysInAdvance)
          : null,
      // Sent as a constant, matching the b2b side (spmfrontend) — there's no
      // UI for this anywhere yet either, and Worldpay's own validation
      // (`requiredEntityFields` in worldpayOwnership.service.js) rejects a
      // draft without it.
      feeAllocationModel: "business_paid",
      accounts,
    },
    Members: [
      {
        first: director.firstName || null,
        last: director.lastName || null,
        email: director.email || null,
        phone: director.phone || null,
        issignatory: true,
        primary: 1,
        emailFormtoMerchant: false,
        biometrics: false,
        dob: formatDobForWire(director.dateOfBirth),
        address1: director.address.line1 || null,
        city: director.address.city || null,
        state: director.address.state || null,
        zip: director.address.postcode || null,
        country: director.address.country || "Australia",
        timezone: "aest",
        // Matches sole-webapp's own `memberState.typeofid ?? 1` — defaults to
        // Driving Licence rather than null, since that's the ID type every
        // director's form already opens on.
        typeofid: Number(director.idType) || 1,
        ownership: percentToBasisPoints(director.ownershipPercent),
        idnumber: director.idNumber || null,
        dlstate: director.licenceState || null,
        cardnumber: director.cardNumber || null,
      },
    ],
  };
}

function mapWireEntity(wire: Record<string, unknown> | undefined): {
  entity: SolePayEntity;
  address: SolePayAddress;
} {
  const w = wire ?? {};
  const str = (value: unknown) => (value == null ? "" : String(value));
  return {
    entity: {
      name: str(w.name),
      legalName: str(w.fulllegalname),
      abn: str(w.abn),
      type: w.type != null ? String(w.type) : "",
      email: str(w.email),
      industry: str(w.industry),
      website: str(w.website),
      // AU by default when nothing's been saved yet — see `EMPTY_SOLEPAY_ENTITY.phone`.
      phone: str(w.phone) || "+61",
      transactionsFor: str(w.transactionsFor),
      maxTransaction: w.maxTransaction != null ? String(w.maxTransaction) : "",
      avgTransaction: w.avgTransaction != null ? String(w.avgTransaction) : "",
      transactionQty: w.qtyTransactions != null ? String(w.qtyTransactions) : "",
      paidInArrears: Boolean(w.paidInArrears),
      daysInAdvance: w.daysInAdvance != null ? String(w.daysInAdvance) : "",
    },
    address: {
      line1: str(w.address1),
      city: str(w.city),
      state: str(w.state),
      postcode: str(w.zip),
      country: str(w.country) || "Australia",
    },
  };
}

function mapWireMember(wire: Record<string, unknown> | undefined): SolePayDirector {
  const w = wire ?? {};
  const str = (value: unknown) => (value == null ? "" : String(value));
  return {
    firstName: str(w.first),
    lastName: str(w.last),
    email: str(w.email),
    // AU by default when nothing's been saved yet — see `EMPTY_SOLEPAY_ENTITY.phone`.
    phone: str(w.phone) || "+61",
    dateOfBirth: parseDobFromWire(w.dob),
    idType: w.typeofid != null ? String(w.typeofid) : "1",
    idNumber: str(w.idnumber),
    ownershipPercent: basisPointsToPercent(w.ownership),
    licenceState: str(w.dlstate),
    cardNumber: str(w.cardnumber),
    address: {
      line1: str(w.address1),
      city: str(w.city),
      state: str(w.state),
      postcode: str(w.zip),
      country: str(w.country) || "Australia",
    },
  };
}

type WireAccountsGroup = {
  settlement?: WireAccountEntry | null;
  billing?: WireAccountEntry | null;
} | undefined;

function mapWireAccounts(wire: WireAccountsGroup): SolePayBankAccounts {
  const settlementAccount = wire?.settlement?.account;
  const billingAccount = wire?.billing?.account;

  const settlement = settlementAccount
    ? {
        accountName: settlementAccount.accountname ?? "",
        bsb: settlementAccount.routing ?? "",
        accountNumber: settlementAccount.accountnumber ?? "",
      }
    : { ...EMPTY_SOLEPAY_BANK_ACCOUNT };

  const billing = billingAccount
    ? {
        accountName: billingAccount.accountname ?? "",
        bsb: billingAccount.routing ?? "",
        accountNumber: billingAccount.accountnumber ?? "",
      }
    : { ...EMPTY_SOLEPAY_BANK_ACCOUNT };

  const same =
    !!settlementAccount &&
    !!billingAccount &&
    settlementAccount.accountnumber === billingAccount.accountnumber &&
    settlementAccount.routing === billingAccount.routing;

  return {
    settlement,
    // No billing saved yet reads as "still mirrored" — there's nothing on
    // file to contradict the default.
    billing: same ? { ...EMPTY_SOLEPAY_BANK_ACCOUNT } : billing,
    billingSameAsSettlement: same || !billingAccount,
  };
}

type WireAttachment = {
  id: number | string;
  file_name: string;
  file_path: string;
  created_at: string;
  kind: string;
};

const ATTACHMENT_KIND_TO_SLOT: Record<string, SolePayDocumentSlotId> = {
  identification_front: "id-front",
  identification_back: "id-back",
  settlement_bank_statement: "settlement-statement",
  billing_bank_statement: "billing-statement",
  trust_agreement: "trust-agreement",
};

/** The filename prefix Worldpay's own `inferAttachmentKind` keys off — the only signal it uses to classify an upload. */
const ATTACHMENT_SLOT_PREFIX: Record<SolePayDocumentSlotId, string> = {
  "id-front": "identification_front_",
  "id-back": "identification_back_",
  "settlement-statement": "settlement_bank_statement_",
  "billing-statement": "billing_bank_statement_",
  "trust-agreement": "trust_agreement_",
};

function mapWireAttachments(list: unknown): SolePayDocuments {
  const documents = { ...EMPTY_SOLEPAY_DOCUMENTS };
  if (!Array.isArray(list)) return documents;

  for (const raw of list as WireAttachment[]) {
    const slot = ATTACHMENT_KIND_TO_SLOT[raw.kind];
    if (!slot) continue;
    const uploadedAt = raw.created_at ? new Date(raw.created_at) : null;
    documents[slot] = {
      name: raw.file_name,
      uploadedAt: uploadedAt && !Number.isNaN(uploadedAt.getTime())
        ? toIsoDate(uploadedAt)
        : "",
    };
  }

  return documents;
}

/* ------------------------------------------------------------------ *
 * Completion — the flags Worldpay's own validation reports back
 * ------------------------------------------------------------------ */

export type SolePayValidationGroups = {
  entity: string[];
  member: string[];
  accounts: string[];
  attachments: string[];
};

export type SolePayInvalidGroups = {
  entity: string[];
  member: string[];
  accounts: string[];
};

export type SolePayApplicationStatus =
  | "pending"
  | "data_required"
  | "escalated_to_risk"
  | "approved"
  | "declined";

/** What the last fetch/save told us about the draft, alongside the answers themselves. */
export type SolePayDraftMeta = {
  draftExists: boolean;
  isComplete: boolean;
  applicationStatus: SolePayApplicationStatus;
  /** Set once Worldpay actually has this application (submitDraft succeeded) — null for a draft that's never been submitted. */
  merchantAppId: string | null;
  groupedMissing: SolePayValidationGroups;
  groupedInvalid: SolePayInvalidGroups;
};

export const EMPTY_SOLEPAY_META: SolePayDraftMeta = {
  draftExists: false,
  isComplete: false,
  applicationStatus: "pending",
  merchantAppId: null,
  groupedMissing: { entity: [], member: [], accounts: [], attachments: [] },
  groupedInvalid: { entity: [], member: [], accounts: [] },
};

function normalizeApplicationStatus(value: unknown): SolePayApplicationStatus {
  const status = String(value ?? "").toLowerCase();
  if (status === "approved") return "approved";
  if (status === "declined" || status === "rejected") return "declined";
  if (status === "data_required") return "data_required";
  if (status === "escalated_to_risk") return "escalated_to_risk";
  return "pending";
}

export function isSolePayApplicationLocked(meta: SolePayDraftMeta): boolean {
  return Boolean(meta.merchantAppId) && meta.applicationStatus !== "data_required";
}

/**
 * The single source of wording for each status, shared by the overview
 * banner and the full-page locked notice so the two can never drift —
 * phrasing matches spm's own per-status copy (`finance/payments/page.tsx`).
 */
export const SOLEPAY_APPLICATION_STATUS_COPY: Record<
  SolePayApplicationStatus,
  { title: string; description: string }
> = {
  pending: {
    title: "Submitted for review",
    description:
      "Your application is with SolePay for review. This usually takes a few business days.",
  },
  data_required: {
    title: "More information needed",
    description:
      "SolePay needs some additional information before it can continue reviewing this application.",
  },
  escalated_to_risk: {
    title: "Under additional review",
    description:
      "This application has been escalated to our risk team for a closer look. No action is needed from you right now.",
  },
  approved: {
    title: "Approved",
    description: "Your SolePay account has been approved.",
  },
  declined: {
    title: "Declined",
    description:
      "SolePay declined this application — check your details and resubmit, or contact support.",
  },
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

type SolePayDraftData = {
  draft_exists?: boolean;
  entity?: Record<string, unknown>;
  member?: Record<string, unknown>;
  accounts?: WireAccountsGroup;
  attachments?: unknown;
  is_complete?: boolean;
  application_status?: string;
  merchant_app_id?: string | number | null;
  grouped_missing?: Partial<Record<keyof SolePayValidationGroups, unknown>>;
  grouped_invalid?: Partial<Record<keyof SolePayInvalidGroups, unknown>>;
};

export type SolePayDraftResult = {
  state: SolePayOnboarding;
  meta: SolePayDraftMeta;
};

function mapMeta(data: SolePayDraftData): SolePayDraftMeta {
  return {
    draftExists: data.draft_exists ?? true,
    isComplete: !!data.is_complete,
    applicationStatus: normalizeApplicationStatus(data.application_status),
    merchantAppId: data.merchant_app_id != null ? String(data.merchant_app_id) : null,
    groupedMissing: {
      entity: stringArray(data.grouped_missing?.entity),
      member: stringArray(data.grouped_missing?.member),
      accounts: stringArray(data.grouped_missing?.accounts),
      attachments: stringArray(data.grouped_missing?.attachments),
    },
    groupedInvalid: {
      entity: stringArray(data.grouped_invalid?.entity),
      member: stringArray(data.grouped_invalid?.member),
      accounts: stringArray(data.grouped_invalid?.accounts),
    },
  };
}

function mapDraftResponse(data: SolePayDraftData): SolePayDraftResult {
  const { entity, address } = mapWireEntity(data.entity);
  const director = mapWireMember(data.member);
  const bankAccounts = mapWireAccounts(data.accounts);
  const documents = mapWireAttachments(data.attachments);

  return {
    state: { entity, address, director, bankAccounts, documents },
    meta: mapMeta(data),
  };
}

/**
 * Which steps look done from the answers alone — used for the tracker between
 * saves, before there's a fresh `SolePayDraftMeta` to read `isComplete` from.
 */
const filled = (value: string) => value.trim().length > 0;

const REQUIRED_ENTITY_FIELDS: (keyof SolePayEntity)[] = [
  "name",
  "legalName",
  "abn",
  "type",
  "email",
  "industry",
  // Worldpay's own `requiredEntityFields` lists `website` too — its form
  // just doesn't mark it required visually, so this keeps the two truths
  // apart deliberately: matching the backend rather than sole-webapp's UI.
  "website",
  "phone",
  "transactionsFor",
  "maxTransaction",
  "avgTransaction",
  "transactionQty",
];

export function entityDone(entity: SolePayEntity, address: SolePayAddress): boolean {
  return (
    REQUIRED_ENTITY_FIELDS.every((field) => filled(entity[field] as string)) &&
    (entity.paidInArrears || filled(entity.daysInAdvance)) &&
    filled(address.line1) &&
    filled(address.city) &&
    filled(address.state) &&
    filled(address.postcode) &&
    filled(address.country)
  );
}

export function directorDone(director: SolePayDirector): boolean {
  const licenceOk =
    director.idType !== "1" ||
    (filled(director.licenceState) && filled(director.cardNumber));

  return (
    filled(director.firstName) &&
    filled(director.lastName) &&
    filled(director.email) &&
    filled(director.phone) &&
    filled(director.dateOfBirth) &&
    filled(director.idType) &&
    filled(director.idNumber) &&
    filled(director.ownershipPercent) &&
    filled(director.address.line1) &&
    filled(director.address.city) &&
    filled(director.address.state) &&
    filled(director.address.postcode) &&
    licenceOk
  );
}

export function accountsDone(accounts: SolePayBankAccounts): boolean {
  if (!accountFilled(accounts.settlement)) return false;
  // Mirrored billing is answered by the settlement account, so there's nothing
  // further to check — that's the whole point of the flag.
  return accounts.billingSameAsSettlement || accountFilled(accounts.billing);
}

export function documentsDone(
  documents: SolePayDocuments,
  billingSameAsSettlement: boolean,
  entityType: string,
  idType: string,
): boolean {
  return requiredDocumentSlots(billingSameAsSettlement, entityType, idType).every(
    (slot) => documents[slot] !== null,
  );
}

/**
 * Which steps count as complete.
 *
 * Derived from the answers rather than from a "visited" flag, so walking away
 * from a half-filled step doesn't tick it and coming back to change an answer
 * doesn't untick the ones after it.
 */
export function stepsDone(state: SolePayOnboarding): SolePayStepId[] {
  const done: SolePayStepId[] = ["overview"];

  if (entityDone(state.entity, state.address)) done.push("entity");
  if (directorDone(state.director)) done.push("directors");
  if (accountsDone(state.bankAccounts)) done.push("accounts");
  if (
    documentsDone(
      state.documents,
      state.bankAccounts.billingSameAsSettlement,
      state.entity.type,
      state.director.idType,
    )
  ) {
    done.push("documents");
  }

  return done;
}

/** How many steps still want an answer, for the header's pill. */
export function actionsRequired(state: SolePayOnboarding): number {
  return SOLEPAY_STEPS.length - stepsDone(state).length;
}

/* ------------------------------------------------------------------ *
 * Client-side validation — checked on Save, ahead of the round trip
 * ------------------------------------------------------------------ */

export type SolePayIssues = Record<string, string>;

const REQUIRED = "This field is required.";

export function entityIssues(
  entity: SolePayEntity,
  address: SolePayAddress,
): SolePayIssues {
  const issues: SolePayIssues = {};

  const require = (key: string, value: string) => {
    if (!filled(value)) issues[key] = REQUIRED;
  };

  require("name", entity.name);
  require("legalName", entity.legalName);
  require("abn", entity.abn);
  require("type", entity.type);
  require("email", entity.email);
  require("industry", entity.industry);
  require("website", entity.website);
  require("phone", entity.phone);
  require("transactionsFor", entity.transactionsFor);
  require("maxTransaction", entity.maxTransaction);
  require("avgTransaction", entity.avgTransaction);
  require("transactionQty", entity.transactionQty);
  // Conditional, not in `require`'s flat list above — only asked (and only
  // required) once the business says it's paid in advance, same as the old
  // SolePay form's `!paid_in_arrears` branch.
  if (!entity.paidInArrears && !filled(entity.daysInAdvance)) {
    issues.daysInAdvance = REQUIRED;
  }
  if (filled(entity.daysInAdvance) && Number(entity.daysInAdvance) < 0) {
    issues.daysInAdvance = "Enter 0 or more days.";
  } else if (filled(entity.daysInAdvance) && Number(entity.daysInAdvance) > 365) {
    // Matches spm's EntitySchema upper bound - not something the backend
    // itself enforces (getInvalidFields only ever checks >= 0), but worth
    // catching here rather than only on the b2b side.
    issues.daysInAdvance = "Please enter a value up to 365 days.";
  }

  // Not backend-enforced (unlike the ABN/state/phone checks below, which
  // mirror a real `getInvalidFields` rule) - matches spm's EntitySchema,
  // which checks this purely client-side too.
  if (
    filled(entity.transactionsFor) &&
    entity.transactionsFor.trim().length < 3
  ) {
    issues.transactionsFor =
      "Please provide a brief description (at least 3 characters).";
  }

  if (filled(entity.email) && !/.+@.+\..+/.test(entity.email)) {
    issues.email = "Enter a valid email address.";
  }
  // Digit count only, matching sole-webapp's own `EntitySchema` (a plain
  // `/^\d{11}$/` regex) — the real modulus-89 checksum is a backend-only
  // check (`isValidAustralianAbn`), surfaced from the save response instead
  // of guessed at here, so an 11-digit number is never rejected before the
  // one system that actually knows whether it's a real ABN has weighed in.
  if (filled(entity.abn) && !/^\d{11}$/.test(digitsOnly(entity.abn))) {
    issues.abn = "Enter an 11-digit ABN.";
  }
  // A length floor, matching `EntitySchema`'s `phone (min 5)` — the
  // AU-specific `+61[23478]…` shape is likewise backend-only.
  if (filled(entity.phone) && entity.phone.replace(/\s+/g, "").length < 5) {
    issues.phone = "Phone number looks too short.";
  }

  // Not backend-enforced - matches spm's EntitySchema website regex,
  // which is likewise a purely client-side check.
  if (
    filled(entity.website) &&
    !/^https?:\/\/[^\s/]+\.[a-zA-Z]{2,}([/?#].*)?$/.test(entity.website)
  ) {
    issues.website = "Enter a valid website URL (e.g. https://company.com).";
  }

  // Not backend-enforced - matches spm's EntitySchema's avg <= max
  // superRefine, a sanity check rather than anything Worldpay itself
  // requires.
  if (
    filled(entity.maxTransaction) &&
    filled(entity.avgTransaction) &&
    Number.isFinite(Number(entity.maxTransaction)) &&
    Number.isFinite(Number(entity.avgTransaction)) &&
    Number(entity.avgTransaction) > Number(entity.maxTransaction)
  ) {
    issues.avgTransaction =
      "Avg transaction cannot be more than max transaction.";
  }

  require("address.line1", address.line1);
  require("address.city", address.city);
  require("address.state", address.state);
  require("address.postcode", address.postcode);
  require("address.country", address.country);

  return issues;
}

export function directorIssues(director: SolePayDirector): SolePayIssues {
  const issues: SolePayIssues = {};

  const require = (key: string, value: string) => {
    if (!filled(value)) issues[key] = REQUIRED;
  };

  require("firstName", director.firstName);
  require("lastName", director.lastName);
  require("email", director.email);
  require("phone", director.phone);
  require("dateOfBirth", director.dateOfBirth);
  require("idType", director.idType);
  require("idNumber", director.idNumber);
  require("ownershipPercent", director.ownershipPercent);

  // Not backend-enforced - `getInvalidFields` only checks member.dob's wire
  // format (`/^\d{8}$/`), never the date itself, so without this a minor
  // (or a typo'd future date) would sail straight through to Worldpay.
  // Matches spm's MemberSchema dob refinements.
  if (filled(director.dateOfBirth)) {
    const dob = new Date(director.dateOfBirth);
    if (Number.isNaN(dob.getTime())) {
      issues.dateOfBirth = "Enter a valid date of birth.";
    } else if (dob.getTime() > Date.now()) {
      issues.dateOfBirth = "Date of birth cannot be in the future.";
    } else {
      const minAgeDate = new Date();
      minAgeDate.setFullYear(minAgeDate.getFullYear() - 18);
      if (dob.getTime() > minAgeDate.getTime()) {
        issues.dateOfBirth = "Director must be at least 18 years old.";
      }
    }
  }

  if (director.idType === "1") {
    require("licenceState", director.licenceState);
    require("cardNumber", director.cardNumber);
  }

  if (filled(director.email) && !/.+@.+\..+/.test(director.email)) {
    issues.email = "Enter a valid email address.";
  }
  // A length floor, matching `MemberSchema`'s `phone (min 5)` — see
  // `entityIssues` for why the stricter AU-specific shape stays backend-only.
  if (filled(director.phone) && director.phone.replace(/\s+/g, "").length < 5) {
    issues.phone = "Phone number looks too short.";
  }
  if (filled(director.ownershipPercent)) {
    const pct = Number(director.ownershipPercent);
    if (!Number.isFinite(pct) || pct < 0.01 || pct > 100) {
      issues.ownershipPercent = "Enter a value between 0.01 and 100.";
    }
  }

  require("address.line1", director.address.line1);
  require("address.country", director.address.country);
  require("address.city", director.address.city);
  require("address.state", director.address.state);
  require("address.postcode", director.address.postcode);

  return issues;
}

/**
 * The backend-only checks (ABN checksum, AU state codes, the AU-specific
 * phone shape) as issue maps, read off a save's own `groupedInvalid` — not
 * guessed at client-side, so they only ever appear right after a real Save
 * attempt, and only for what Worldpay itself rejected. Messages ported
 * verbatim from sole-webapp's own `ENTITY_INVALID_MESSAGES` /
 * `MEMBER_INVALID_MESSAGES` (`components/Worldpay/EntityForm.js` /
 * `MemberForm.js`).
 */
const ENTITY_INVALID_FIELD_TO_LOCAL_KEY: Record<string, string> = {
  "entity.abn": "abn",
  "entity.state": "address.state",
  "entity.phone": "phone",
};

const ENTITY_INVALID_MESSAGES: Record<string, string> = {
  abn: "Entity ABN is invalid. Enter a valid 11-digit Australian ABN.",
  "address.state":
    "Entity state is invalid. Use ACT, NSW, NT, QLD, SA, TAS, VIC, or WA.",
  phone:
    "Entity phone is invalid. Use international format, for example +61412345678.",
};

export function entityInvalidIssues(groupedInvalidEntity: string[]): SolePayIssues {
  const issues: SolePayIssues = {};
  for (const field of groupedInvalidEntity) {
    const key = ENTITY_INVALID_FIELD_TO_LOCAL_KEY[field];
    if (key) issues[key] = ENTITY_INVALID_MESSAGES[key];
  }
  return issues;
}

const MEMBER_INVALID_FIELD_TO_LOCAL_KEY: Record<string, string> = {
  "member.dob": "dateOfBirth",
  "member.ownership": "ownershipPercent",
  "member.state": "address.state",
  "member.phone": "phone",
  "member.dlstate": "licenceState",
};

const MEMBER_INVALID_MESSAGES: Record<string, string> = {
  dateOfBirth: "Director date of birth is invalid.",
  ownershipPercent: "Director ownership is invalid. Use a value between 0.01 and 100.",
  "address.state":
    "Director state is invalid. Use ACT, NSW, NT, QLD, SA, TAS, VIC, or WA.",
  phone:
    "Director phone is invalid. Use international format, for example +61412345678.",
  licenceState:
    "Driving licence state is invalid. Use ACT, NSW, NT, QLD, SA, TAS, VIC, or WA.",
};

export function directorInvalidIssues(groupedInvalidMember: string[]): SolePayIssues {
  const issues: SolePayIssues = {};
  for (const field of groupedInvalidMember) {
    const key = MEMBER_INVALID_FIELD_TO_LOCAL_KEY[field];
    if (key) issues[key] = MEMBER_INVALID_MESSAGES[key];
  }
  return issues;
}

/**
 * Keyed `settlement.*` and `billing.*`, so one map covers both sections.
 * Billing is skipped entirely when it's mirrored.
 */
export function accountsIssues(accounts: SolePayBankAccounts): SolePayIssues {
  const issues: SolePayIssues = {};

  const requireAccount = (
    prefix: "settlement" | "billing",
    account: SolePayBankAccount,
  ) => {
    if (!filled(account.accountName)) {
      issues[`${prefix}.accountName`] = REQUIRED;
    }
    if (!filled(account.bsb)) {
      issues[`${prefix}.bsb`] = REQUIRED;
    } else if (!/^\d{6}$/.test(digitsOnly(account.bsb))) {
      issues[`${prefix}.bsb`] = "Enter a 6-digit BSB.";
    }
    if (!filled(account.accountNumber)) {
      issues[`${prefix}.accountNumber`] = REQUIRED;
    } else if (!/^\d{6,10}$/.test(digitsOnly(account.accountNumber))) {
      issues[`${prefix}.accountNumber`] = "Enter a 6–10 digit account number.";
    }
  };

  requireAccount("settlement", accounts.settlement);
  if (!accounts.billingSameAsSettlement) {
    requireAccount("billing", accounts.billing);
  }

  return issues;
}

/** One line of an address, joined for a summary row. */
export function formatSolePayAddress(address: SolePayAddress): string {
  return [
    address.line1,
    address.city,
    address.state,
    address.postcode,
    address.country,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

/* ------------------------------------------------------------------ *
 * The real API — GET/POST apiRoutes.worldpayOnboarding.*
 *
 * Plain JSON bodies, not the platform's usual encrypted envelope: sole-ocr's
 * `worldpay.controller.js` reads `req.body` directly with no decrypt step.
 * ------------------------------------------------------------------ */

type SolePayDraftResponse = {
  success: boolean;
  message?: string;
  data?: SolePayDraftData;
};

/** The current draft, as Worldpay holds it. Hydrates the shell on every step's mount. */
export async function fetchSolePayDraft(): Promise<SolePayDraftResult> {
  const response = await api.get<SolePayDraftResponse>(
    apiRoutes.worldpayOnboarding.getDraftStatus,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to fetch SolePay status");
  }
  return mapDraftResponse(response.data.data ?? {});
}

/**
 * Saves the complete current state — always entity + director + accounts
 * together, whichever step's form triggered the save. See the module comment
 * for why a partial payload would be actively destructive here.
 */
export async function saveSolePayDraft(
  state: SolePayOnboarding,
): Promise<SolePayDraftResult> {
  const payload = buildDraftPayload(state);
  const response = await api.post<SolePayDraftResponse>(
    apiRoutes.worldpayOnboarding.saveDraft,
    payload,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to save SolePay details");
  }
  return mapDraftResponse(response.data.data ?? {});
}

/**
 * Uploads whichever document slots were just picked, renaming each file with
 * the prefix `inferAttachmentKind` on the backend keys off — that filename
 * convention is the only signal it uses to classify an upload, there's no
 * separate "kind" field sent alongside it.
 */
export type SolePayUploadResult = {
  documents: SolePayDocuments;
  meta: SolePayDraftMeta;
};

/**
 * Returns only `documents` and `meta`, not a full `SolePayDraftResult` — the
 * real upload endpoint's response has no `entity`/`member`/`accounts` keys at
 * all (unlike `saveDraft`'s), so mapping it through the full draft shape would
 * read those as blank and wipe out everything else already in the atom.
 */
export async function uploadSolePayDocuments(
  files: Partial<Record<SolePayDocumentSlotId, File>>,
  /**
   * Worldpay's own `getMissingFields` (worldpayOwnership.service.js) always
   * requires a `billing_bank_statement` attachment kind, mirrored billing or
   * not — the mirrored exception there only lets that file also cover
   * `settlement_bank_statement`, never the other way around. The Documents
   * step only asks for one statement when mirrored (see
   * `requiredDocumentSlots`), so without this the submission permanently
   * fails with "attachments.billing_bank_statement" missing. Matches the b2b
   * side (spmfrontend's `handleUploadAll`), which sends the same file twice,
   * once under each prefix.
   */
  billingSameAsSettlement = false,
): Promise<SolePayUploadResult> {
  const form = new FormData();
  for (const [slot, file] of Object.entries(files)) {
    if (!file) continue;
    const prefix = ATTACHMENT_SLOT_PREFIX[slot as SolePayDocumentSlotId];
    const renamed = new File([file], `${prefix}${file.name}`, {
      type: file.type,
    });
    form.append("files", renamed);
  }

  const settlementFile = files["settlement-statement"];
  if (billingSameAsSettlement && settlementFile && !files["billing-statement"]) {
    const renamedAsBilling = new File(
      [settlementFile],
      `${ATTACHMENT_SLOT_PREFIX["billing-statement"]}${settlementFile.name}`,
      { type: settlementFile.type },
    );
    form.append("files", renamedAsBilling);
  }

  const response = await api.post<SolePayDraftResponse>(
    apiRoutes.worldpayOnboarding.uploadDraftAttachments,
    form,
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to upload documents");
  }
  const data = response.data.data ?? {};
  return {
    documents: mapWireAttachments(data.attachments),
    meta: mapMeta(data),
  };
}

type SolePaySubmitResponse = {
  success: boolean;
  message?: string;
  data?: { merchant_id?: string | number };
};

/**
 * Who attested to the submission, and that they actually ticked the box.
 *
 * Worldpay requires the final submission to be an explicit act by a
 * director, owner, or controller — the backend enforces this server-side
 * (`submitWorldpayDraft` in the payments service refuses a submit without
 * it) regardless of what the client sends, the same rule the b2b side's
 * `SubmitConfirmModal` already attests to.
 */
export type SolePaySubmitAuthorization = {
  authorizedByName: string;
  confirmed: boolean;
};

/** Submits the completed draft for review — the one call that actually reaches Worldpay. */
export async function submitSolePayDraft(
  authorization: SolePaySubmitAuthorization,
): Promise<{ merchantId: string }> {
  const response = await api.post<SolePaySubmitResponse>(
    apiRoutes.worldpayOnboarding.submitDraft,
    { authorization },
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message || "Failed to submit for review");
  }
  return { merchantId: String(response.data.data?.merchant_id ?? "") };
}
