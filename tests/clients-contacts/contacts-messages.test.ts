import { describe, expect, it } from "vitest";

import {
  contactFormDefaults,
  contactPeople,
  contactSchema,
  type Contact,
  type ContactFormValues,
  type ContactPerson,
} from "@/lib/contacts";

/**
 * Gap-filling companion to `lib/contacts.test.ts` — see "Gaps" in
 * `docs/testing-clients-contacts.md`: the schema's user-facing error copy (the
 * existing tests assert `success`/`path` only), and `contactPeople` with more
 * than one stored person flagged primary.
 */

function formValues(overrides: Partial<ContactFormValues> = {}): ContactFormValues {
  return {
    ...contactFormDefaults,
    businessName: "Turner Consulting",
    personName: "Michael Turner",
    email: "michael.turner@email.com",
    countryCode: "+61",
    phone: "411111111",
    ...overrides,
  };
}

function person(overrides: Partial<ContactPerson> = {}): ContactPerson {
  return {
    personName: "Sarah Chen",
    email: "sarah.chen@email.com",
    countryCode: "+61",
    phone: "422222222",
    division: "",
    position: "",
    isPrimary: false,
    ...overrides,
  };
}

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "1",
    businessName: "Turner Consulting",
    personName: "Michael Turner",
    email: "michael.turner@email.com",
    countryCode: "+61",
    phone: "411111111",
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
    type: "Client",
    businessType: "Business",
    created: "",
    isDefault: false,
    ...overrides,
  };
}

/** `path.join(".")` → message, for every issue the schema raised. */
function issues(values: ContactFormValues): Record<string, string> {
  const result = contactSchema.safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message]));
}

describe("contactSchema error copy", () => {
  it("names the business-name and contact-name minimums", () => {
    expect(issues(formValues({ businessName: "A", personName: " B " }))).toEqual({
      businessName: "Enter a business name (at least 2 characters).",
      personName: "Enter the contact name (at least 2 characters).",
    });
  });

  it("asks for a valid email on the primary, which is required", () => {
    expect(issues(formValues({ email: "" }))).toEqual({ email: "Enter a valid email address." });
    expect(issues(formValues({ email: "not-an-email" }))).toEqual({ email: "Enter a valid email address." });
  });

  it("tells you how many ABN digits you actually typed", () => {
    expect(issues(formValues({ abn: "12 345 678" }))).toEqual({
      abn: "ABN must be 11 digits (you entered 8).",
    });
    expect(issues(formValues({ abn: "12 345 678 901 2" }))).toEqual({
      abn: "ABN must be 11 digits (you entered 12).",
    });
  });

  it("names the chosen country's own phone lengths", () => {
    expect(issues(formValues({ countryCode: "+61", phone: "4111" }))).toEqual({
      phone: "Enter a valid +61 phone number (9 digits).",
    });
    expect(issues(formValues({ countryCode: "+64", phone: "1234567" }))).toEqual({
      phone: "Enter a valid +64 phone number (8 or 9 digits).",
    });
  });

  it("falls back to the wide default list for an unknown code", () => {
    expect(issues(formValues({ countryCode: "+999", phone: "12" }))).toEqual({
      phone: "Enter a valid +999 phone number (7 or 8 or 9 or 10 digits).",
    });
  });

  it("refuses additional people on an Individual with one array-level message, skipping per-row checks", () => {
    expect(
      issues(
        formValues({
          businessType: "Individual",
          businessName: "",
          additionalContacts: [person({ personName: "", email: "bad", phone: "1" })],
        }),
      ),
    ).toEqual({ additionalContacts: "An individual can only have one contact person." });
  });

  it("puts each additional person's message at its own indexed path, using that row's country", () => {
    expect(
      issues(
        formValues({
          additionalContacts: [
            person(),
            person({ personName: "X", email: "nope", countryCode: "+64", phone: "1234567" }),
          ],
        }),
      ),
    ).toEqual({
      "additionalContacts.1.personName": "Enter the contact name (at least 2 characters).",
      "additionalContacts.1.email": "Enter a valid email address.",
      "additionalContacts.1.phone": "Enter a valid +64 phone number (8 or 9 digits).",
    });
  });
});

describe("contactPeople with more than one stored primary", () => {
  it("the first flagged person wins; every later one is demoted, order kept", () => {
    const people = contactPeople(
      contact({
        people: [
          person({ id: "a", personName: "Alice", isPrimary: false }),
          person({ id: "b", personName: "Bob", isPrimary: true }),
          person({ id: "c", personName: "Cara", isPrimary: true }),
          person({ id: "d", personName: "Dan", isPrimary: false }),
        ],
      }),
    );

    expect(people.map((p) => [p.id, p.isPrimary])).toEqual([
      ["b", true],
      ["a", false],
      ["c", false],
      ["d", false],
    ]);
    expect(people.filter((p) => p.isPrimary)).toHaveLength(1);
  });

  it("doesn't mutate the stored list", () => {
    const stored = [person({ id: "a", isPrimary: true }), person({ id: "b", isPrimary: true })];
    contactPeople(contact({ people: stored }));
    expect(stored.map((p) => p.isPrimary)).toEqual([true, true]);
  });
});
