import { describe, expect, it } from "vitest";

import {
  canonicalBusinessType,
  canonicalContactType,
  clientCreateLabel,
  composeContactPeople,
  contactDisplayName,
  contactInitials,
  contactPeople,
  contactFormDefaults,
  contactPersonSchema,
  contactSchema,
  digitsOnly,
  exactContactMatch,
  formatPhone,
  matchContacts,
  phoneLengthsFor,
  primaryContactPerson,
  splitCsvLine,
  type Contact,
  type ContactFormValues,
  type ContactPerson,
} from "@/lib/contacts";

/** A full, saved Contact — individual fields overridden per test as needed. */
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
    created: "15 Jul 2026",
    isDefault: false,
    ...overrides,
  };
}

/** A valid, fully-filled business form — individual fields overridden per test. */
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

/* ------------------------------------------------------------------ *
 * Phone/digit helpers
 * ------------------------------------------------------------------ */

describe("phoneLengthsFor", () => {
  it("returns the country's own digit lengths", () => {
    expect(phoneLengthsFor("+61")).toEqual([9]);
    expect(phoneLengthsFor("+64")).toEqual([8, 9]);
  });

  it("falls back to a wide range for an unknown code", () => {
    expect(phoneLengthsFor("+999")).toEqual([7, 8, 9, 10]);
  });
});

describe("digitsOnly", () => {
  it("strips everything but digits", () => {
    expect(digitsOnly("(04) 1111-1111")).toBe("0411111111");
  });
});

/* ------------------------------------------------------------------ *
 * contactSchema
 * ------------------------------------------------------------------ */

describe("contactSchema", () => {
  it("accepts a complete Business contact", () => {
    expect(contactSchema.safeParse(formValues()).success).toBe(true);
  });

  it("accepts a complete Individual contact with no business name", () => {
    const result = contactSchema.safeParse(
      formValues({ businessType: "Individual", businessName: "" }),
    );
    expect(result.success).toBe(true);
  });

  it("requires a business name of at least 2 characters when Business", () => {
    const result = contactSchema.safeParse(
      formValues({ businessType: "Business", businessName: "A" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path)).toContainEqual([
        "businessName",
      ]);
    }
  });

  it("requires a contact name of at least 2 characters", () => {
    const result = contactSchema.safeParse(formValues({ personName: "M" }));
    expect(result.success).toBe(false);
  });

  it("requires a valid email", () => {
    const result = contactSchema.safeParse(formValues({ email: "not-an-email" }));
    expect(result.success).toBe(false);
  });

  it("only checks the ABN once something has been typed", () => {
    expect(contactSchema.safeParse(formValues({ abn: "" })).success).toBe(true);
    expect(
      contactSchema.safeParse(formValues({ abn: "123" })).success,
    ).toBe(false);
    // 11 digits isn't enough: the ABN's check digit must be right.
    expect(
      contactSchema.safeParse(formValues({ abn: "12345678901" })).success,
    ).toBe(false);
    expect(
      contactSchema.safeParse(formValues({ abn: "51 824 753 556" })).success,
    ).toBe(true);
  });

  it("only checks the phone once something has been typed, against the chosen country's lengths", () => {
    expect(contactSchema.safeParse(formValues({ phone: "" })).success).toBe(
      true,
    );
    expect(
      contactSchema.safeParse(
        formValues({ countryCode: "+61", phone: "1234" }),
      ).success,
    ).toBe(false);
    expect(
      contactSchema.safeParse(
        formValues({ countryCode: "+64", phone: "12345678" }),
      ).success,
    ).toBe(true);
  });

  it("rejects an Individual carrying additional contacts", () => {
    const result = contactSchema.safeParse(
      formValues({
        businessType: "Individual",
        businessName: "",
        additionalContacts: [person()],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("validates each additional contact's own name, email and phone", () => {
    const badPerson = person({ personName: "S", email: "bad", phone: "1" });
    const result = contactSchema.safeParse(
      formValues({ additionalContacts: [badPerson] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("additionalContacts.0.personName");
      expect(paths).toContain("additionalContacts.0.email");
      expect(paths).toContain("additionalContacts.0.phone");
    }
  });

  it("allows an additional contact with no email or phone at all", () => {
    const result = contactSchema.safeParse(
      formValues({
        additionalContacts: [person({ email: "", phone: "" })],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("carries an optional id through unchanged", () => {
    expect(contactPersonSchema.safeParse(person({ id: "42" })).success).toBe(
      true,
    );
  });
});

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

describe("primaryContactPerson", () => {
  it("reads the primary off the flat fields, always marked primary", () => {
    expect(primaryContactPerson(contact())).toEqual({
      personName: "Michael Turner",
      email: "michael.turner@email.com",
      countryCode: "+61",
      phone: "411111111",
      division: "",
      position: "",
      isPrimary: true,
    });
  });
});

describe("contactPeople", () => {
  it("synthesises a lone primary from the flat fields when there's no people list", () => {
    expect(contactPeople(contact())).toEqual([primaryContactPerson(contact())]);
  });

  it("puts whoever is flagged primary in the stored list first, demoting everyone else", () => {
    const stored = [
      person({ personName: "Sarah Chen", isPrimary: false }),
      person({ personName: "Alex Wong", isPrimary: true }),
    ];
    const result = contactPeople(contact({ people: stored }));
    expect(result.map((p) => p.personName)).toEqual(["Alex Wong", "Sarah Chen"]);
    expect(result[0].isPrimary).toBe(true);
    expect(result[1].isPrimary).toBe(false);
  });

  it("falls back to the synthesised flat primary, ahead of every stored person demoted, when none is flagged", () => {
    const stored = [person({ personName: "Sarah Chen", isPrimary: false })];
    const result = contactPeople(contact({ people: stored }));
    expect(result.map((p) => p.personName)).toEqual([
      "Michael Turner",
      "Sarah Chen",
    ]);
    expect(result[0].isPrimary).toBe(true);
    expect(result[1].isPrimary).toBe(false);
  });
});

describe("composeContactPeople", () => {
  it("returns just the trimmed primary for an Individual", () => {
    const result = composeContactPeople(
      formValues({
        businessType: "Individual",
        businessName: "",
        personName: "  Michael Turner  ",
        email: "  michael.turner@email.com  ",
      }),
    );
    expect(result).toEqual([
      {
        id: undefined,
        personName: "Michael Turner",
        email: "michael.turner@email.com",
        countryCode: "+61",
        phone: "411111111",
        division: "",
        position: "",
        isPrimary: true,
      },
    ]);
  });

  it("puts the primary first, then every additional contact demoted and trimmed", () => {
    const result = composeContactPeople(
      formValues({
        additionalContacts: [
          person({ personName: "  Sarah Chen  ", email: "  sarah@email.com  " }),
        ],
      }),
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ personName: "Michael Turner", isPrimary: true });
    expect(result[1]).toMatchObject({
      personName: "Sarah Chen",
      email: "sarah@email.com",
      isPrimary: false,
    });
  });

  it("carries the primary's own personId through as the person's id", () => {
    const result = composeContactPeople(formValues({ personId: "900" }));
    expect(result[0].id).toBe("900");
  });

  it("carries each additional contact's own id through unchanged", () => {
    const result = composeContactPeople(
      formValues({ additionalContacts: [person({ id: "42" })] }),
    );
    expect(result[1].id).toBe("42");
  });
});

/* ------------------------------------------------------------------ *
 * Display / combobox helpers
 * ------------------------------------------------------------------ */

describe("contactDisplayName", () => {
  it("prefers the business name", () => {
    expect(contactDisplayName(contact())).toBe("Turner Consulting");
  });

  it("falls back to the person's name for an Individual", () => {
    expect(
      contactDisplayName(contact({ businessName: "", personName: "Jo Lee" })),
    ).toBe("Jo Lee");
  });
});

describe("matchContacts", () => {
  const contacts = [
    contact({ id: "1", businessName: "Turner Consulting", email: "a@turner.test" }),
    contact({ id: "2", businessName: "Williams Health", email: "b@williams.test" }),
  ];

  it("returns everything when the query is blank", () => {
    expect(matchContacts(contacts, "  ")).toEqual(contacts);
  });

  it("matches case-insensitively on display name or email", () => {
    expect(matchContacts(contacts, "turner").map((c) => c.id)).toEqual(["1"]);
    expect(matchContacts(contacts, "WILLIAMS.TEST").map((c) => c.id)).toEqual([
      "2",
    ]);
  });
});

describe("exactContactMatch", () => {
  const contacts = [contact({ id: "1", businessName: "Turner Consulting" })];

  it("finds a contact whose display name matches exactly, case-insensitively", () => {
    expect(exactContactMatch(contacts, "turner consulting")?.id).toBe("1");
  });

  it("is undefined for a blank query or a partial match", () => {
    expect(exactContactMatch(contacts, "")).toBeUndefined();
    expect(exactContactMatch(contacts, "turner")).toBeUndefined();
  });
});

describe("clientCreateLabel", () => {
  it("quotes the typed query, or offers a generic label when blank", () => {
    expect(clientCreateLabel("Acme")).toBe('Create "Acme"');
    expect(clientCreateLabel("  ")).toBe("Add new client");
  });
});

describe("contactInitials", () => {
  it("takes the first letter of up to two words", () => {
    expect(contactInitials("Michael Turner")).toBe("MT");
    expect(contactInitials("Michael")).toBe("M");
    expect(contactInitials("Michael James Turner")).toBe("MJ");
  });

  it("falls back to '?' for an empty name", () => {
    expect(contactInitials("")).toBe("?");
  });
});

describe("formatPhone", () => {
  it("shows the phone number on its own, with no country code prefix", () => {
    expect(formatPhone(contact({ countryCode: "+61", phone: "411111111" }))).toBe(
      "411111111",
    );
  });

  it("shows an em dash with no phone", () => {
    expect(formatPhone(contact({ phone: "" }))).toBe("—");
  });
});

/* ------------------------------------------------------------------ *
 * Bulk upload / CSV
 * ------------------------------------------------------------------ */

describe("splitCsvLine", () => {
  it("splits on plain commas", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("keeps a comma inside quotes as part of the cell", () => {
    expect(splitCsvLine('"Acme, Inc.",b')).toEqual(["Acme, Inc.", "b"]);
  });

  it("unescapes a doubled quote inside a quoted cell", () => {
    expect(splitCsvLine('"Say ""hi""",b')).toEqual(['Say "hi"', "b"]);
  });
});

describe("canonicalContactType / canonicalBusinessType", () => {
  it("normalises casing, and reads '' for anything else", () => {
    expect(canonicalContactType("client")).toBe("Client");
    expect(canonicalContactType("SUPPLIER")).toBe("Supplier");
    expect(canonicalContactType("vendor")).toBe("");
    expect(canonicalBusinessType("business")).toBe("Business");
    expect(canonicalBusinessType("INDIVIDUAL")).toBe("Individual");
    expect(canonicalBusinessType("company")).toBe("");
  });
});

