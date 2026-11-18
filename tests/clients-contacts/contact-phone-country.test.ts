import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCountries, getCountryCallingCode } from "libphonenumber-js";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so `lib/contacts-api.ts` and `lib/country-context.ts`
// resolve `@/utils/axiosInstance` to the mocked module above.
const { createContactApi } = await import("@/lib/contacts-api");
const {
  FALLBACK_COUNTRY_CONTEXT,
  contactDefaultDialCode,
  mapCountryContext,
} = await import("@/lib/country-context");

import {
  EMPTY_CONTACT_PERSON,
  contactFormDefaults,
  contactSchema,
  type ContactFormValues,
} from "@/lib/contacts";
import { countryForDialCode, dialCodeFor, pickerCountryFor } from "@/lib/phone";

/**
 * The contact drawer's phone field: the searchable country picker it shares
 * with the business profile, and the dial code a new contact starts on — the
 * open business's own (+61 for an Australian business, +64 for a New Zealand
 * one), read from the country context.
 *
 * The drawer itself isn't rendered (the suite runs in node); what it does with
 * the country is built from the functions below, so they're tested the way the
 * drawer uses them.
 */

const AU = FALLBACK_COUNTRY_CONTEXT;
const NZ = mapCountryContext({ country_iso2: "NZ", currency: "NZD", phone_dial_code: "+64" });

/** What the drawer's create defaults are for a business in `ctx`. */
function createDefaultsFor(ctx: typeof AU): ContactFormValues {
  return { ...contactFormDefaults, countryCode: contactDefaultDialCode(ctx) };
}

function formValues(
  ctx: typeof AU,
  overrides: Partial<ContactFormValues> = {},
): ContactFormValues {
  return {
    ...createDefaultsFor(ctx),
    businessName: "Turner Consulting",
    personName: "Michael Turner",
    email: "michael.turner@email.com",
    ...overrides,
  };
}

function sentFields(): Record<string, unknown> {
  const [route, body] = apiMock.post.mock.calls[0];
  expect(route).toBe(apiRoutes.contact.create);
  return decryptPayload((body as { data: string }).data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ *
 * The business's dial code
 * ------------------------------------------------------------------ */

describe("contactDefaultDialCode", () => {
  it("is +61 for an Australian business and before the server answers", () => {
    expect(contactDefaultDialCode(AU)).toBe("+61");
    expect(contactDefaultDialCode(mapCountryContext({ country_iso2: "AU" }))).toBe("+61");
  });

  it("is +64 for a New Zealand business", () => {
    expect(contactDefaultDialCode(NZ)).toBe("+64");
  });

  it("uses the registry's phone_dial_code, adding a missing + and trimming", () => {
    expect(contactDefaultDialCode(mapCountryContext({ country_iso2: "ZA", phone_dial_code: "27" }))).toBe("+27");
    expect(contactDefaultDialCode(mapCountryContext({ country_iso2: "NZ", phone_dial_code: " +64 " }))).toBe("+64");
  });

  it("works the code out from the country when the registry sends none", () => {
    expect(contactDefaultDialCode(mapCountryContext({ country_iso2: "NZ" }))).toBe("+64");
    expect(contactDefaultDialCode(mapCountryContext({ country_iso2: "GB" }))).toBe("+44");
  });

  it("falls back to +61 for a country it can't place", () => {
    expect(contactDefaultDialCode({ ...AU, iso2: "XX", phoneDialCode: null })).toBe("+61");
  });
});

/* ------------------------------------------------------------------ *
 * The flag the picker shows for a stored dial code
 * ------------------------------------------------------------------ */

describe("countryForDialCode", () => {
  it("reads the business codes back to their own country", () => {
    expect(countryForDialCode("+61")).toBe("AU");
    expect(countryForDialCode("+64")).toBe("NZ");
    expect(countryForDialCode("+27")).toBe("ZA");
  });

  it("shows the main country for a shared code, not the first alphabetically", () => {
    expect(countryForDialCode("+1")).toBe("US"); // not American Samoa
    expect(countryForDialCode("+44")).toBe("GB"); // not Guernsey
    expect(countryForDialCode("+358")).toBe("FI"); // not Åland Islands
  });

  it("accepts a code without the +, and gives undefined for none or an unknown one", () => {
    expect(countryForDialCode("64")).toBe("NZ");
    expect(countryForDialCode("")).toBeUndefined();
    expect(countryForDialCode("+999")).toBeUndefined();
  });
});

describe("pickerCountryFor", () => {
  it("shows the business's flag on a new contact", () => {
    expect(pickerCountryFor(contactDefaultDialCode(AU), undefined)).toBe("AU");
    expect(pickerCountryFor(contactDefaultDialCode(NZ), undefined)).toBe("NZ");
  });

  it("keeps the country the person picked when it shares its code", () => {
    expect(pickerCountryFor("+1", "CA")).toBe("CA");
    expect(pickerCountryFor("+44", "JE")).toBe("JE");
  });

  it("drops a stale pick once the code changes from outside (a form reset)", () => {
    expect(pickerCountryFor("+64", "AU")).toBe("NZ");
  });

  it("falls back for an unknown code", () => {
    expect(pickerCountryFor("+999", undefined)).toBe("AU");
    expect(pickerCountryFor("", undefined, "NZ")).toBe("NZ");
  });

  it("round-trips every country in the list: picking it stores a code that shows it again", () => {
    for (const iso2 of getCountries()) {
      const stored = `+${dialCodeFor(iso2)}`;
      expect(stored).toBe(`+${getCountryCallingCode(iso2)}`);
      expect(pickerCountryFor(stored, iso2)).toBe(iso2);
      // Even with the pick forgotten, the flag lands on a country with that code.
      expect(dialCodeFor(pickerCountryFor(stored, undefined))).toBe(dialCodeFor(iso2));
    }
  });
});

/* ------------------------------------------------------------------ *
 * The new contact's form, validated and saved
 * ------------------------------------------------------------------ */

describe("a new contact under the business's country", () => {
  it("starts an Australian business's contact on +61, validated as 9 digits", () => {
    const values = formValues(AU, { phone: "411111111" });
    expect(values.countryCode).toBe("+61");
    expect(contactSchema.safeParse(values).success).toBe(true);
    expect(contactSchema.safeParse({ ...values, phone: "41111111" }).success).toBe(false);
  });

  it("starts a New Zealand business's contact on +64, validated as 8 or 9 digits", () => {
    const values = formValues(NZ, { phone: "21234567" });
    expect(values.countryCode).toBe("+64");
    expect(contactSchema.safeParse(values).success).toBe(true);
    expect(contactSchema.safeParse({ ...values, phone: "212345678" }).success).toBe(true);
    expect(contactSchema.safeParse({ ...values, phone: "2123456" }).success).toBe(false);
  });

  it("accepts a code from the full picker list that the old six-code select didn't have", () => {
    const values = formValues(AU, { countryCode: "+27", phone: "821234567" });
    expect(contactSchema.safeParse(values).success).toBe(true);
  });

  it("starts an added contact person on the business's code, validated by its own row", () => {
    const added = { ...EMPTY_CONTACT_PERSON, countryCode: contactDefaultDialCode(NZ) };
    expect(added.countryCode).toBe("+64");

    const result = contactSchema.safeParse(
      formValues(NZ, {
        phone: "21234567",
        additionalContacts: [{ ...added, personName: "Sarah Chen", phone: "2123456" }],
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Enter a valid +64 phone number (8 or 9 digits).",
    ]);
  });

  it("saves the NZ dial code on the company's primary and every additional person", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 7 } } });

    const created = await createContactApi(
      formValues(NZ, {
        phone: "21234567",
        additionalContacts: [
          { ...EMPTY_CONTACT_PERSON, countryCode: contactDefaultDialCode(NZ), personName: "Sarah Chen", phone: "221234567" },
          // One the person switched to Australia in the picker.
          { ...EMPTY_CONTACT_PERSON, countryCode: "+61", personName: "Ann Lee", phone: "411111111" },
        ],
      }),
    );

    const contacts = sentFields().contacts as Record<string, unknown>[];
    expect(contacts.map((c) => [c.name, c.country_calling_code, c.phone_number])).toEqual([
      ["Michael Turner", "+64", "21234567"],
      ["Sarah Chen", "+64", "221234567"],
      ["Ann Lee", "+61", "411111111"],
    ]);
    expect(created).toMatchObject({ countryCode: "+64", phone: "21234567" });
  });

  it("still saves +61 for an Australian business, as before", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 8 } } });
    await createContactApi(formValues(AU, { phone: "411111111" }));

    const [primary] = sentFields().contacts as Record<string, unknown>[];
    expect(primary).toMatchObject({ country_calling_code: "+61", phone_number: "411111111" });
  });
});
