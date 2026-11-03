import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// Imported after the mock so `lib/contacts-api.ts`'s own
// `import api from "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  fetchAllContacts,
  fetchContactsPage,
  fetchContactDetail,
  createContactApi,
  updateContactApi,
  deleteContactApi,
  bulkCreateContactsApi,
} = await import("@/lib/contacts-api");

import { contactFormDefaults, type ContactFormValues, type ContactPerson } from "@/lib/contacts";
import type { BulkRow } from "@/lib/bulk-import";

/**
 * Gap-filling companion to `lib/contacts-api.test.ts` — see "Gaps" in
 * `docs/testing-clients-contacts.md`. Same mocking idiom, same fixtures.
 */

function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was not a {data} envelope");
  }
  return decryptPayload(asData.data);
}

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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ *
 * fetchAllContacts — the dashboard's customer-areas feed
 * ------------------------------------------------------------------ */

describe("fetchAllContacts", () => {
  it("GETs /client/v2 for the Client tab only, in one 1000-row page, with no search", async () => {
    apiMock.get.mockResolvedValue({ data: { data: [] } });
    await fetchAllContacts();
    expect(apiMock.get).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.contact.list);
    expect(config.params).toEqual({ page: "1", limit: "1000", type: "1" });
    expect(config.params).not.toHaveProperty("filter_by[scope]");
    expect(config.params).not.toHaveProperty("searchQuery");
  });

  it("maps rows with the same mapper as the paginated list, never as defaults", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 501,
            business_name: "Turner Consulting",
            email: "accounts@turner.test",
            type: "Client",
            created_at: "17-09-2026",
            notes: null,
            primary_contact: { name: "Michael Turner", phone_number: "411111111", country_calling_code: "+61" },
            address_line1: "1 Collins St",
            city: "Melbourne",
            country: "Australia",
          },
        ],
        pagination: { total: 1 },
      },
    });

    const [row] = await fetchAllContacts();

    expect(row).toEqual({
      id: "501",
      businessName: "Turner Consulting",
      personName: "Michael Turner",
      email: "accounts@turner.test",
      countryCode: "+61",
      phone: "411111111",
      abn: "",
      website: "",
      currency: "AUD",
      division: "",
      position: "",
      addressLine1: "1 Collins St",
      city: "Melbourne",
      country: "Australia",
      notes: "",
      isPrimary: true,
      type: "Client",
      businessType: "Business",
      created: "17 Sept 2026",
      isDefault: false,
    });
  });

  it("returns a plain array (no total) and [] for an empty response", async () => {
    apiMock.get.mockResolvedValue({ data: {} });
    expect(await fetchAllContacts()).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * cleanAddressField — the iOS `Optional("…")` bug
 * ------------------------------------------------------------------ */

describe("address cleanup on list rows", () => {
  it('unwraps a literal Optional("…") on city, country and address_line1', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 1,
            business_name: "Acme",
            address_line1: 'Optional("12 Queen St")',
            city: 'Optional("Brisbane")',
            country: '  Optional("Australia")  ',
          },
        ],
      },
    });
    const [row] = await fetchAllContacts();
    expect(row).toMatchObject({ addressLine1: "12 Queen St", city: "Brisbane", country: "Australia" });
  });

  it("unwraps an empty Optional(\"\") to blank, so the contact groups as Unknown", async () => {
    apiMock.get.mockResolvedValue({ data: { data: [{ id: 1, city: 'Optional("")' }] } });
    const [row] = await fetchAllContacts();
    expect(row.city).toBe("");
  });

  it("passes a plain value through, trimmed, and blanks null/undefined", async () => {
    apiMock.get.mockResolvedValue({
      data: { data: [{ id: 1, city: "  Gold Coast ", country: null }] },
    });
    const [row] = await fetchAllContacts();
    expect(row).toMatchObject({ city: "Gold Coast", country: "", addressLine1: "" });
  });

  it("leaves a value that merely contains Optional( untouched", async () => {
    apiMock.get.mockResolvedValue({ data: { data: [{ id: 1, city: 'Optional(Brisbane)' }] } });
    const [row] = await fetchAllContacts();
    expect(row.city).toBe("Optional(Brisbane)");
  });

  it("applies the same cleanup on the paginated Contacts-screen list", async () => {
    apiMock.get.mockResolvedValue({ data: { data: [{ id: 1, city: 'Optional("Hobart")' }] } });
    const { contacts } = await fetchContactsPage("Supplier", 1, 10, "");
    expect(contacts[0].city).toBe("Hobart");
  });
});

/* ------------------------------------------------------------------ *
 * fetchContactDetail — untested branches
 * ------------------------------------------------------------------ */

describe("fetchContactDetail branches", () => {
  function detail(data: Record<string, unknown>) {
    apiMock.get.mockResolvedValue({ data: { success: true, data } });
  }

  it("reads company_type 'individual' as an Individual, anything else as a Business", async () => {
    detail({ id: 1, company_type: "individual", contacts: [] });
    expect((await fetchContactDetail("1")).businessType).toBe("Individual");

    detail({ id: 1, company_type: "business", contacts: [] });
    expect((await fetchContactDetail("1")).businessType).toBe("Business");

    detail({ id: 1, company_type: null, contacts: [] });
    expect((await fetchContactDetail("1")).businessType).toBe("Business");
  });

  it("defaults a blank or missing currency to AUD", async () => {
    detail({ id: 1, currency: "", contacts: [] });
    expect((await fetchContactDetail("1")).currency).toBe("AUD");
    detail({ id: 1, contacts: [] });
    expect((await fetchContactDetail("1")).currency).toBe("AUD");
    detail({ id: 1, currency: "NZD", contacts: [] });
    expect((await fetchContactDetail("1")).currency).toBe("NZD");
  });

  it("reads is_primary '0' (a string) as not primary, and '1'/1/true as primary", async () => {
    detail({
      id: 1,
      contacts: [
        { id: 10, name: "String Zero", is_primary: "0" },
        { id: 11, name: "String One", is_primary: "1" },
        { id: 12, name: "Number Zero", is_primary: 0 },
        { id: 13, name: "Bool True", is_primary: true },
      ],
    });
    const contact = await fetchContactDetail("1");
    expect(contact.people?.map((p) => p.isPrimary)).toEqual([false, true, false, true]);
    // The flat primary is the first one flagged — not the first in the list.
    expect(contact.personName).toBe("String One");
  });

  it("drops state and postcode — they aren't fields on Contact", async () => {
    detail({ id: 1, city: "Newstead", state: "QLD", postcode: "4006", contacts: [] });
    const contact = await fetchContactDetail("1");
    expect(contact.city).toBe("Newstead");
    expect(contact).not.toHaveProperty("state");
    expect(contact).not.toHaveProperty("postcode");
  });

  it("falls back to the requested id, AU defaults and no people when the server sends only the bare record", async () => {
    detail({});
    expect(await fetchContactDetail("77")).toMatchObject({
      id: "77",
      personName: "",
      countryCode: "+61",
      people: [],
      type: "Client",
      isDefault: false,
      created: "",
    });
  });
});

/* ------------------------------------------------------------------ *
 * createContactApi — returned Contact + fallback message
 * ------------------------------------------------------------------ */

describe("createContactApi returned contact", () => {
  it("blanks businessName for an Individual even if the form still holds one", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 9 } } });
    const created = await createContactApi(
      formValues({ businessType: "Individual", businessName: "Leftover Pty Ltd" }),
    );
    expect(created).toMatchObject({ id: "9", businessName: "", businessType: "Individual" });
    expect(created.people).toHaveLength(1);
  });

  it("trims names/email and stamps today's date in the list's own en-AU format", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 8, 9, 0));
    apiMock.post.mockResolvedValue({ data: { data: { id: "abc" } } });

    const created = await createContactApi(
      formValues({ businessName: "  Turner Consulting ", personName: " Michael ", email: " m@t.test " }),
    );

    expect(created).toMatchObject({
      id: "abc",
      businessName: "Turner Consulting",
      personName: "Michael",
      email: "m@t.test",
      created: "08 Oct 2026",
      isPrimary: true,
      isDefault: false,
    });
  });

  it("a missing success flag counts as success", async () => {
    apiMock.post.mockResolvedValue({ data: { data: { id: 1 } } });
    await expect(createContactApi(formValues())).resolves.toMatchObject({ id: "1" });
  });
});

describe("fallback error messages when the server sends none", () => {
  it("createContactApi → 'Failed to create contact.'", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(createContactApi(formValues())).rejects.toThrow("Failed to create contact.");
  });

  it("updateContactApi → 'Failed to update contact.'", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: false, message: "" } });
    await expect(updateContactApi("501", formValues(), [])).rejects.toThrow("Failed to update contact.");
  });

  it("deleteContactApi → 'Failed to delete contact.'", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: false } });
    await expect(deleteContactApi("501")).rejects.toThrow("Failed to delete contact.");
  });

  it("bulkCreateContactsApi → 'Failed to import contacts.'", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });
    const rows = [{ values: { businessName: "Acme", personName: "Jo", email: "jo@acme.test", type: "Client" } }] as unknown as BulkRow[];
    await expect(bulkCreateContactsApi(rows)).rejects.toThrow("Failed to import contacts.");
  });
});

/* ------------------------------------------------------------------ *
 * updateContactApi — person reconciliation edge cases and partial failure
 * ------------------------------------------------------------------ */

describe("updateContactApi reconciliation edges", () => {
  const originalPeople: ContactPerson[] = [
    person({
      id: "10",
      personName: "Michael Turner",
      email: "michael.turner@email.com",
      countryCode: "+61",
      phone: "411111111",
      isPrimary: true,
    }),
    person({ id: "11", personName: "Sarah Chen" }),
  ];

  function unchangedValues(): ContactFormValues {
    return formValues({ personId: "10", additionalContacts: [person({ id: "11" })] });
  }

  it("PATCHes a changed *primary* person by its own /contact id", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });
    const values = unchangedValues();
    values.phone = "499999999";

    await updateContactApi("501", values, originalPeople);

    expect(apiMock.patch).toHaveBeenCalledTimes(2);
    const [url, body] = apiMock.patch.mock.calls[1];
    expect(url).toBe(`${apiRoutes.companyContact.update}/10`);
    expect(decryptedFieldsFromBody(body)).toMatchObject({ phone_number: "499999999", is_primary: 1 });
  });

  it("PATCHes (never POSTs) a submitted person whose id isn't in originalPeople", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });
    const values = unchangedValues();
    values.additionalContacts.push(person({ id: "99", personName: "Stale Id" }));

    await updateContactApi("501", values, originalPeople);

    expect(apiMock.post).not.toHaveBeenCalled();
    expect(apiMock.patch.mock.calls.map((c) => c[0])).toEqual([
      `${apiRoutes.contact.update}/501`,
      `${apiRoutes.companyContact.update}/99`,
    ]);
  });

  it("treats a primary swap as two person PATCHes (is_primary flipped on both)", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });
    // Sarah promoted into the flat fields; Michael demoted into additionalContacts.
    const values = formValues({
      personId: "11",
      personName: "Sarah Chen",
      email: "sarah.chen@email.com",
      phone: "422222222",
      additionalContacts: [
        person({ id: "10", personName: "Michael Turner", email: "michael.turner@email.com", phone: "411111111" }),
      ],
    });

    await updateContactApi("501", values, originalPeople);

    expect(apiMock.post).not.toHaveBeenCalled();
    expect(apiMock.delete).not.toHaveBeenCalled();
    const personCalls = apiMock.patch.mock.calls.slice(1);
    const byUrl = Object.fromEntries(personCalls.map(([url, body]) => [url, decryptedFieldsFromBody(body)]));
    expect(byUrl[`${apiRoutes.companyContact.update}/11`]).toMatchObject({ is_primary: 1 });
    expect(byUrl[`${apiRoutes.companyContact.update}/10`]).toMatchObject({ is_primary: 0 });
  });

  it("surfaces a person POST's fallback message after the company PATCH has already landed", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });
    apiMock.post.mockResolvedValue({ data: { success: false } });
    const values = unchangedValues();
    values.additionalContacts.push(person({ personName: "New Person" }));

    await expect(updateContactApi("501", values, originalPeople)).rejects.toThrow(
      "Failed to add a contact person.",
    );
    // Not atomic: the company update was already sent.
    expect(apiMock.patch).toHaveBeenCalledWith(`${apiRoutes.contact.update}/501`, expect.anything());
  });

  it("surfaces a person PATCH's own server message, else its fallback", async () => {
    const values = unchangedValues();
    values.additionalContacts[0].email = "changed@email.com";

    apiMock.patch
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValueOnce({ data: { success: false, message: "Email already used" } });
    await expect(updateContactApi("501", values, originalPeople)).rejects.toThrow("Email already used");

    apiMock.patch
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValueOnce({ data: { success: false } });
    await expect(updateContactApi("501", values, originalPeople)).rejects.toThrow(
      "Failed to update a contact person.",
    );
  });

  it("surfaces a person DELETE's fallback message, while the other person calls still run", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });
    apiMock.delete.mockResolvedValue({ data: { success: false } });
    apiMock.post.mockResolvedValue({ data: { success: true } });
    // Sarah (11) removed, a new person added.
    const values = formValues({ personId: "10", additionalContacts: [person({ personName: "New Person" })] });

    await expect(updateContactApi("501", values, originalPeople)).rejects.toThrow(
      "Failed to remove a contact person.",
    );
    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.companyContact.delete}/11`, expect.anything());
    // Promise.all rejects on the first failure but doesn't cancel the rest.
    expect(apiMock.post).toHaveBeenCalledTimes(1);
  });
});
