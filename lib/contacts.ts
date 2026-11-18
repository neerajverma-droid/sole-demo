import { z } from "zod";

import {
  FALLBACK_CONTACT_FORM,
  validateFormField,
  type ModuleForm,
} from "@/lib/country-forms";

type FieldPath = (string | number)[];

export type ContactType = "Client" | "Supplier";
export type BusinessType = "Business" | "Individual";

/**
 * One person at a contact.
 *
 * A business is rarely one person — there's who you invoice, who signs off, and
 * who to ring when neither answers. This is that person, and a contact holds a
 * list of them.
 *
 * The same six fields the flat `Contact` already carries for its primary, which
 * is deliberate: the primary is a `ContactPerson` too, so nothing about a person
 * depends on whether they happen to be first.
 */
export type ContactPerson = {
  /**
   * The server's own id for this person (a `/contact` row), absent for one
   * added in the drawer this session and not yet saved. This is what tells
   * the update flow whether a submitted person needs a POST (no id), a PATCH
   * (an id whose fields changed) or nothing at all.
   */
  id?: string;
  personName: string;
  email: string;
  countryCode: string;
  phone: string;
  division: string;
  position: string;
  isPrimary: boolean;
};

/** A blank additional person, ready to be typed into. */
export const EMPTY_CONTACT_PERSON: ContactPerson = {
  personName: "",
  email: "",
  countryCode: "+61",
  phone: "",
  division: "",
  position: "",
  isPrimary: false,
};

export type Contact = {
  id: string;
  /** Empty for an Individual — the person's name is then the display name. */
  businessName: string;
  personName: string;
  email: string;
  countryCode: string;
  phone: string;
  abn: string;
  website: string;
  currency: string;
  division: string;
  position: string;
  addressLine1: string;
  city: string;
  country: string;
  notes: string;
  isPrimary: boolean;
  type: ContactType;
  businessType: BusinessType;
  created: string;
  /**
   * Everyone at this contact, primary first.
   *
   * Optional, and the flat fields above are not going anywhere: the table, the
   * client picker, invoices and quotes all read `personName` and `email`
   * directly, and a contact seeded or imported before this existed has no list
   * to read. `contactPeople` is the accessor that papers over both — never read
   * this array directly.
   */
  people?: ContactPerson[];
  /**
   * A global, unowned record (`user_id = 0` server-side) rather than one of
   * the caller's own clients or suppliers — surfaced only by the "Default"
   * tab. Always false for a contact the account created itself. Read-only:
   * no edit or delete affordance is ever offered for one of these.
   */
  isDefault: boolean;
};

export const CONTACT_TABS = ["Client", "Supplier", "Default"] as const;
export type ContactTab = (typeof CONTACT_TABS)[number];

/** National significant number lengths, per country calling code. */
export const COUNTRY_CODES: {
  code: string;
  label: string;
  lengths: number[];
}[] = [
  { code: "+61", label: "🇦🇺 +61", lengths: [9] },
  { code: "+64", label: "🇳🇿 +64", lengths: [8, 9] },
  { code: "+1", label: "🇺🇸 +1", lengths: [10] },
  { code: "+44", label: "🇬🇧 +44", lengths: [10] },
  { code: "+65", label: "🇸🇬 +65", lengths: [8] },
  { code: "+91", label: "🇮🇳 +91", lengths: [10] },
];

export function phoneLengthsFor(countryCode: string): number[] {
  return (
    COUNTRY_CODES.find((entry) => entry.code === countryCode)?.lengths ?? [
      7, 8, 9, 10,
    ]
  );
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * A bare domain or a full URL — `turnerconsulting.com.au`, `https://…`.
 *
 * The lookahead stops `www.` counting as the domain itself: `www.google` would
 * otherwise read as the name `www` on a `.google` ending, and pass.
 */
const WEBSITE_PATTERN =
  /^(https?:\/\/)?(?!www\.[a-z0-9-]+(?:[:/]|$))([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i;

/** Place names: letters in any script, spaces, and the punctuation they carry. */
const PLACE_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;

/**
 * The rule every optional free-text field shares: empty is fine, but once
 * something is typed it has to be a sensible length (and shape, where one
 * applies). Returns the message to raise, or nothing.
 */
function optionalTextIssue(
  value: string,
  label: string,
  { min = 2, max, pattern, patternMessage }: {
    min?: number;
    max: number;
    pattern?: RegExp;
    patternMessage?: string;
  },
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length < min) return `${label} must be at least ${min} characters.`;
  if (trimmed.length > max) return `${label} must be ${max} characters or fewer.`;
  if (pattern && !pattern.test(trimmed)) {
    return patternMessage ?? `Enter a valid ${label.toLowerCase()}.`;
  }
  return undefined;
}

/**
 * The quick "New client / New supplier" dialog's rules — the Contacts
 * drawer's, cut down to its three fields: a name of at least two characters,
 * and an email that looks like one. A client has to have an email (it's where
 * its invoices and quotes go); a supplier can be saved without one.
 */
export function quickContactIssues(
  type: ContactType,
  values: { name: string; email: string },
): { name?: string; email?: string; emailRequired: boolean } {
  const emailRequired = type === "Client";
  const email = values.email.trim();
  return {
    emailRequired,
    name:
      values.name.trim().length < 2
        ? "Enter the contact name (at least 2 characters)."
        : undefined,
    email: !email
      ? emailRequired
        ? `Enter the ${type.toLowerCase()}'s email address.`
        : undefined
      : !EMAIL_PATTERN.test(email)
        ? "Enter a valid email address."
        : undefined,
  };
}

/**
 * An additional person, as the form holds them.
 *
 * Shapes only — every rule is in the parent's `superRefine`, so an issue can be
 * raised at `["additionalContacts", index, field]` and land on the row that's
 * wrong instead of on the list.
 */
export const contactPersonSchema = z.object({
  /** The server's id for this person, carried through unchanged once set — see `ContactPerson.id`. */
  id: z.string().optional(),
  personName: z.string(),
  email: z.string(),
  countryCode: z.string(),
  phone: z.string(),
  division: z.string(),
  position: z.string(),
  isPrimary: z.boolean(),
});

/**
 * Validation mirrors the design reference exactly, including error copy.
 * Optional fields (ABN, phone) only error once something has been typed.
 */
export const contactSchemaFor = (form: ModuleForm | undefined) => z
  .object({
    type: z.enum(["Client", "Supplier"]),
    businessType: z.enum(["Business", "Individual"]),
    businessName: z.string(),
    /** The flat primary's own id, when editing one loaded from the server. */
    personId: z.string().optional(),
    personName: z.string(),
    email: z.string(),
    countryCode: z.string(),
    phone: z.string(),
    abn: z.string(),
    website: z.string(),
    currency: z.string(),
    division: z.string(),
    position: z.string(),
    addressLine1: z.string(),
    city: z.string(),
    country: z.string(),
    notes: z.string(),
    isPrimary: z.boolean(),
    /**
     * Everyone other than the primary. The primary stays in the flat fields
     * above, where it has always been.
     */
    additionalContacts: z.array(contactPersonSchema),
  })
  .superRefine((values, ctx) => {
    if (
      values.businessType === "Business" &&
      values.businessName.trim().length < 2
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["businessName"],
        message: "Enter a business name (at least 2 characters).",
      });
    }

    if (values.personName.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["personName"],
        message: "Enter the contact name (at least 2 characters).",
      });
    }

    /*
     * Only the primary has to have an email. The flags are read off the raw
     * values, so a person promoted from the list is held to it in their own
     * card, and the card they replaced is let off — the same answer as
     * validating after `withPrimaryFirst` swaps them, raised where it's typed.
     */
    const anchorEmail = values.email.trim();
    if (values.isPrimary && !anchorEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Enter the primary contact's email address.",
      });
    } else if (anchorEmail && !EMAIL_PATTERN.test(anchorEmail)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Enter a valid email address.",
      });
    }

    // Optional fields: nothing typed is fine, anything typed has to be valid.
    const optional: [FieldPath, string | undefined][] = [
      [
        ["website"],
        optionalTextIssue(values.website, "Website", {
          min: 4,
          max: 255,
          pattern: WEBSITE_PATTERN,
          patternMessage: "Enter a valid website, e.g. turnerconsulting.com.au",
        }),
      ],
      [["division"], optionalTextIssue(values.division, "Division", { max: 100 })],
      [["position"], optionalTextIssue(values.position, "Position", { max: 100 })],
      [
        ["addressLine1"],
        optionalTextIssue(values.addressLine1, "Address line 1", { min: 3, max: 255 }),
      ],
      [
        ["city"],
        optionalTextIssue(values.city, "City", {
          max: 100,
          pattern: PLACE_NAME_PATTERN,
          patternMessage: "City can only contain letters, spaces, hyphens and apostrophes.",
        }),
      ],
      [
        ["country"],
        optionalTextIssue(values.country, "Country", {
          max: 100,
          pattern: PLACE_NAME_PATTERN,
          patternMessage: "Country can only contain letters, spaces, hyphens and apostrophes.",
        }),
      ],
      [["notes"], optionalTextIssue(values.notes, "Notes", { min: 1, max: 1000 })],
    ];
    for (const [path, message] of optional) {
      if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    }

    // The business number (ABN, NZBN, …) is checked by the rules the server
    // sent for this business's country. Empty is fine: a contact never has to have one.
    const numberField = form?.fields.find((entry) => entry.key === "ABN") ?? null;
    if (values.abn && numberField) {
      const message = validateFormField(numberField, values.abn);
      if (message) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["abn"],
          message,
        });
      }
    }

    if (values.phone) {
      const lengths = phoneLengthsFor(values.countryCode);
      if (!lengths.includes(digitsOnly(values.phone).length)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phone"],
          message: `Enter a valid ${values.countryCode} phone number (${lengths.join(" or ")} digits).`,
        });
      }
    }

    /*
     * The same three rules as the primary, per row: a name is required, and the
     * email and phone only error once something has been typed into them.
     * `countryCode` is read off the row rather than the parent, so a person
     * with a +64 mobile is checked against New Zealand's digit counts and not
     * Australia's.
     */
    values.additionalContacts.forEach((person, index) => {
      if (person.personName.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["additionalContacts", index, "personName"],
          message: "Enter the contact name (at least 2 characters).",
        });
      }

      const email = person.email.trim();
      if (person.isPrimary && !email) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["additionalContacts", index, "email"],
          message: "Enter the primary contact's email address.",
        });
      } else if (email && !EMAIL_PATTERN.test(email)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["additionalContacts", index, "email"],
          message: "Enter a valid email address.",
        });
      }

      for (const field of ["division", "position"] as const) {
        const message = optionalTextIssue(
          person[field],
          field === "division" ? "Division" : "Position",
          { max: 100 },
        );
        if (message) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["additionalContacts", index, field],
            message,
          });
        }
      }

      if (person.phone) {
        const lengths = phoneLengthsFor(person.countryCode);
        if (!lengths.includes(digitsOnly(person.phone).length)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["additionalContacts", index, "phone"],
            message: `Enter a valid ${person.countryCode} phone number (${lengths.join(" or ")} digits).`,
          });
        }
      }
    });
  });

/** The schema for the bundled Australian form — what applies until the server's answer lands. */
export const contactSchema = contactSchemaFor(FALLBACK_CONTACT_FORM);

export type ContactFormValues = z.infer<typeof contactSchema>;

export const contactFormDefaults: ContactFormValues = {
  type: "Client",
  businessType: "Business",
  businessName: "",
  personName: "",
  email: "",
  countryCode: "+61",
  phone: "",
  abn: "",
  website: "",
  currency: "AUD",
  division: "",
  position: "",
  addressLine1: "",
  city: "",
  country: "",
  notes: "",
  isPrimary: true,
  additionalContacts: [],
};

/**
 * @deprecated Use `contactFormDefaults`. Kept as an alias because the vendored
 * `sole-project` snapshot still imports this name from here.
 */
export const EMPTY_CONTACT_FORM = contactFormDefaults;

export function contactDisplayName(contact: Contact): string {
  return contact.businessName || contact.personName;
}

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

/** The primary, read off the flat fields — where it has always lived. */
export function primaryContactPerson(contact: Contact): ContactPerson {
  return {
    personName: contact.personName,
    email: contact.email,
    countryCode: contact.countryCode,
    phone: contact.phone,
    division: contact.division,
    position: contact.position,
    isPrimary: true,
  };
}

/**
 * Everyone at a contact, primary first and exactly one of them primary.
 *
 * The one way to read a contact's people. A contact stored before the list
 * existed — a seed, a CSV import, anything saved by the quick client dialog —
 * has no `people`, so its primary is synthesised from the flat fields and the
 * caller gets the same shape either way.
 *
 * Normalising rather than trusting what's stored: two primaries or none is a
 * state the drawer can't produce but data outlives the code that wrote it, and
 * a list whose first entry might not be the primary is a list every caller has
 * to search. The first person flagged primary leads; everyone else is demoted
 * in the order they were held.
 */
export function contactPeople(contact: Contact): ContactPerson[] {
  const stored = contact.people ?? [];
  if (stored.length === 0) return [primaryContactPerson(contact)];

  const primaryIndex = stored.findIndex((person) => person.isPrimary);
  const primary =
    primaryIndex === -1
      ? primaryContactPerson(contact)
      : { ...stored[primaryIndex], isPrimary: true };

  const others = stored
    .filter((_, index) => index !== primaryIndex)
    .map((person) => ({ ...person, isPrimary: false }));

  return [primary, ...others];
}

/**
 * The form's two halves back into one list: the flat primary, then the rest.
 *
 * Composed here rather than in the drawer so it can't be bypassed — the store
 * is the only thing that builds a `Contact`, and it calls this. `isPrimary` is
 * forced on both sides instead of trusted from the form, which is what makes
 * "exactly one primary, and it's first" true by construction.
 */
export function composeContactPeople(
  values: ContactFormValues,
): ContactPerson[] {
  const primary: ContactPerson = {
    id: values.personId,
    personName: values.personName.trim(),
    email: values.email.trim(),
    countryCode: values.countryCode,
    phone: values.phone,
    division: values.division,
    position: values.position,
    isPrimary: true,
  };

  // Everyone, whatever the business type: the old app defaulted every contact
  // to "individual" and still let it hold several people, so an Individual
  // loaded from the server can legitimately carry a list. Dropping it here
  // would delete those people on the next save.
  return [
    primary,
    ...values.additionalContacts.map((person) => ({
      ...person,
      personName: person.personName.trim(),
      email: person.email.trim(),
      isPrimary: false,
    })),
  ];
}

/* ------------------------------------------------------------------ *
 * Client combobox
 * ------------------------------------------------------------------ */

/** Contacts matching a combobox query, by display name or email. */
export function matchContacts(contacts: Contact[], query: string): Contact[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return contacts;
  return contacts.filter((contact) =>
    `${contactDisplayName(contact)} ${contact.email}`
      .toLowerCase()
      .includes(needle),
  );
}

/**
 * A contact whose display name is exactly what was typed. Clicking the create
 * row then selects it rather than making a duplicate.
 */
export function exactContactMatch(
  contacts: Contact[],
  query: string,
): Contact | undefined {
  const needle = query.trim().toLowerCase();
  if (!needle) return undefined;
  return contacts.find(
    (contact) => contactDisplayName(contact).toLowerCase() === needle,
  );
}

/** The combobox's create-row label. */
export function clientCreateLabel(query: string): string {
  const trimmed = query.trim();
  return trimmed ? `Create "${trimmed}"` : "Add new client";
}

export function contactInitials(name: string): string {
  const initials = (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  return initials.toUpperCase() || "?";
}

/** No country code prefix — the number itself already reads as a phone number without it. */
export function formatPhone(contact: Contact): string {
  return contact.phone || "—";
}

/* ------------------------------------------------------------------ *
 * Bulk upload
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Bulk upload
 *
 * The field list, validation rules, template and payload builder now live in
 * `lib/contact-import.ts` as a `BulkImportSpec`, so Contacts, Invoices,
 * Expenses and Assets all render one importer instead of four. What's left
 * here is only what the rest of the Contacts module uses.
 * ------------------------------------------------------------------ */

/** Handles quoted fields, which a plain split on commas would break. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Canonical casing for a Client/Supplier value, `""` when unrecognised. Still
 * used by the contact form and the detail drawer, not only by the importer.
 */
export function canonicalContactType(value: string): "" | ContactType {
  const normalized = value.trim().toLowerCase();
  if (normalized === "client") return "Client";
  if (normalized === "supplier") return "Supplier";
  return "";
}

export function canonicalBusinessType(value: string): "" | BusinessType {
  const normalized = value.trim().toLowerCase();
  if (normalized === "business") return "Business";
  if (normalized === "individual") return "Individual";
  return "";
}
