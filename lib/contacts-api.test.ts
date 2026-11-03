import { describe, expect, it, vi, beforeEach } from "vitest";

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
  fetchContactsPage,
  fetchContactTabCounts,
  fetchContactDetail,
  createContactApi,
  updateContactApi,
  deleteContactApi,
  bulkCreateContactsApi,
} = await import("@/lib/contacts-api");

import { contactFormDefaults, type ContactFormValues, type ContactPerson } from "@/lib/contacts";
import type { BulkRow, BulkValues } from "@/lib/bulk-import";

/** Decrypts whatever body a call sent — every Contacts write is a bare `{data}` envelope, never FormData. */
function decryptedFieldsFromBody(body: unknown): Record<string, unknown> {
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was not a {data} envelope");
  }
  return decryptPayload(asData.data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

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
 * List
 * ------------------------------------------------------------------ */

describe("fetchContactsPage", () => {
  it("Client tab sends type=1 and no scope", async () => {
    apiMock.get.mockResolvedValue({ data: { data: [], pagination: { total: 0 } } });
    await fetchContactsPage("Client", 1, 10, "");
    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.contact.list);
    expect(config.params).toEqual({ page: "1", limit: "10", type: "1" });
  });

  it("Supplier tab sends type=2", async () => {
    apiMock.get.mockResolvedValue({ data: { data: [], pagination: { total: 0 } } });
    await fetchContactsPage("Supplier", 1, 10, "");
    const [, config] = apiMock.get.mock.calls[0];
    expect(config.params).toEqual({ page: "1", limit: "10", type: "2" });
  });

  it("Default tab sends filter_by[scope]=default and no type", async () => {
    apiMock.get.mockResolvedValue({ data: { data: [], pagination: { total: 0 } } });
    await fetchContactsPage("Default", 2, 25, "");
    const [, config] = apiMock.get.mock.calls[0];
    expect(config.params).toEqual({
      page: "2",
      limit: "25",
      "filter_by[scope]": "default",
    });
  });

  it("includes a trimmed searchQuery only once there's something to search for", async () => {
    apiMock.get.mockResolvedValue({ data: { data: [], pagination: { total: 0 } } });
    await fetchContactsPage("Client", 1, 10, "  acme  ");
    const [, config] = apiMock.get.mock.calls[0];
    expect(config.params.searchQuery).toBe("acme");

    await fetchContactsPage("Client", 1, 10, "   ");
    const [, blankConfig] = apiMock.get.mock.calls[1];
    expect(blankConfig.params.searchQuery).toBeUndefined();
  });

  it("maps every row, including the primary contact's flat fields", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 501,
            business_name: "Turner Consulting",
            email: "billing@turner.test",
            type: "Client",
            created_at: "15-07-2026",
            notes: "Long-standing client",
            primary_contact: {
              name: "Michael Turner",
              email: "michael.turner@email.com",
              country_calling_code: "+61",
              phone_number: "411111111",
            },
          },
        ],
        pagination: { total: 1 },
        meta: { all: 1, total_clients: 1, total_suppliers: 0 },
      },
    });

    const result = await fetchContactsPage("Client", 1, 10, "");
    expect(result.total).toBe(1);
    expect(result.contacts[0]).toMatchObject({
      id: "501",
      businessName: "Turner Consulting",
      personName: "Michael Turner",
      email: "billing@turner.test",
      countryCode: "+61",
      phone: "411111111",
      type: "Client",
      businessType: "Business",
      notes: "Long-standing client",
      isDefault: false,
    });
    expect(result.contacts[0].created).toMatch(/2026/);
  });

  it("parses the server's DD-MM-YYYY created_at correctly, including a day past the 12th", async () => {
    // `new Date("17-09-2026")` is Invalid Date (blank column) — the actual bug
    // this covers, since day 17 can't be read as a month.
    apiMock.get.mockResolvedValue({
      data: { data: [{ id: 1, business_name: "Amazon", created_at: "17-09-2026" }] },
    });
    const result = await fetchContactsPage("Default", 1, 10, "");
    expect(result.contacts[0].created).toBe("17 Sept 2026");
  });

  it("doesn't silently swap day and month for a day of 12 or under", async () => {
    // `new Date("05-09-2026")` mis-reads this as 9 May instead of 5 September.
    apiMock.get.mockResolvedValue({
      data: { data: [{ id: 1, business_name: "Acme", created_at: "05-09-2026" }] },
    });
    const result = await fetchContactsPage("Client", 1, 10, "");
    expect(result.contacts[0].created).toBe("05 Sept 2026");
  });

  it("marks every row isDefault when the tab is Default", async () => {
    apiMock.get.mockResolvedValue({
      data: { data: [{ id: 1, business_name: "Amazon", type: "Client" }] },
    });
    const result = await fetchContactsPage("Default", 1, 10, "");
    expect(result.contacts[0].isDefault).toBe(true);
  });

  it("treats anything other than the literal string 'Supplier' as Client", async () => {
    apiMock.get.mockResolvedValue({
      data: { data: [{ id: 1, business_name: "Acme", type: "Supplier" }, { id: 2, business_name: "Beta", type: null }] },
    });
    const result = await fetchContactsPage("Client", 1, 10, "");
    expect(result.contacts[0].type).toBe("Supplier");
    expect(result.contacts[1].type).toBe("Client");
  });

  it("derives businessType from whether a business name is present", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: [
          { id: 1, business_name: "Acme", type: "Client" },
          { id: 2, business_name: "", type: "Client", primary_contact: { name: "Jo Lee" } },
        ],
      },
    });
    const result = await fetchContactsPage("Client", 1, 10, "");
    expect(result.contacts[0].businessType).toBe("Business");
    expect(result.contacts[1].businessType).toBe("Individual");
  });

  it("falls back to the row count when the response has no pagination total", async () => {
    apiMock.get.mockResolvedValue({ data: { data: [{ id: 1, business_name: "Acme" }] } });
    const result = await fetchContactsPage("Client", 1, 10, "");
    expect(result.total).toBe(1);
  });

  it("returns an empty page when the response has no data at all", async () => {
    apiMock.get.mockResolvedValue({ data: {} });
    expect(await fetchContactsPage("Client", 1, 10, "")).toEqual({
      contacts: [],
      total: 0,
    });
  });
});

describe("fetchContactTabCounts", () => {
  it("makes two limit=1 calls — one plain, one scoped to default — and reads their own counters", async () => {
    apiMock.get.mockImplementation((_url: string, config: { params: Record<string, string> }) => {
      if (config.params["filter_by[scope]"] === "default") {
        return Promise.resolve({ data: { pagination: { total: 7 } } });
      }
      return Promise.resolve({
        data: { meta: { all: 12, total_clients: 9, total_suppliers: 3 } },
      });
    });

    const result = await fetchContactTabCounts();

    expect(apiMock.get).toHaveBeenCalledTimes(2);
    expect(apiMock.get).toHaveBeenCalledWith(
      apiRoutes.contact.list,
      { params: { page: "1", limit: "1" } },
    );
    expect(apiMock.get).toHaveBeenCalledWith(
      apiRoutes.contact.list,
      { params: { page: "1", limit: "1", "filter_by[scope]": "default" } },
    );
    expect(result).toEqual({ clients: 9, suppliers: 3, default: 7 });
  });

  it("defaults every counter to 0 when the response carries none", async () => {
    apiMock.get.mockResolvedValue({ data: {} });
    expect(await fetchContactTabCounts()).toEqual({
      clients: 0,
      suppliers: 0,
      default: 0,
    });
  });
});

/* ------------------------------------------------------------------ *
 * Detail
 * ------------------------------------------------------------------ */

describe("fetchContactDetail", () => {
  it("fetches from getDetails + id and maps the company fields and people", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          id: 501,
          type: "Supplier",
          company_type: "business",
          business_name: "Turner Consulting",
          website: "turnerconsulting.com.au",
          ABN: "12345678901",
          notes: "Pays on time",
          currency: "AUD",
          address_line1: "18 Cremorne Street",
          country: "Australia",
          city: "Melbourne",
          state: "VIC",
          postcode: "3121",
          contacts: [
            {
              id: 10,
              name: "Michael Turner",
              email: "michael.turner@email.com",
              phone_number: "411111111",
              country_calling_code: "+61",
              is_primary: 1,
            },
            {
              id: 11,
              name: "Sarah Chen",
              email: "sarah.chen@email.com",
              is_primary: 0,
            },
          ],
        },
      },
    });

    const result = await fetchContactDetail("501");

    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.contact.getDetails}/501`);
    expect(result).toMatchObject({
      id: "501",
      businessName: "Turner Consulting",
      personName: "Michael Turner",
      email: "michael.turner@email.com",
      abn: "12345678901",
      website: "turnerconsulting.com.au",
      addressLine1: "18 Cremorne Street",
      city: "Melbourne",
      country: "Australia",
      type: "Supplier",
      businessType: "Business",
      isDefault: false,
    });
    expect(result.people).toHaveLength(2);
    expect(result.people?.[0]).toMatchObject({ id: "10", isPrimary: true });
    expect(result.people?.[1]).toMatchObject({ id: "11", isPrimary: false });
  });

  it("falls back to the first person when none is flagged primary", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          id: 1,
          business_name: "Acme",
          contacts: [{ id: 20, name: "Jo Lee", email: "jo@acme.test" }],
        },
      },
    });
    const result = await fetchContactDetail("1");
    expect(result.personName).toBe("Jo Lee");
  });

  it("throws when the API returns no data", async () => {
    apiMock.get.mockResolvedValue({ data: {} });
    await expect(fetchContactDetail("999")).rejects.toThrow("Contact not found");
  });
});

/* ------------------------------------------------------------------ *
 * Create
 * ------------------------------------------------------------------ */

describe("createContactApi", () => {
  it("POSTs an encrypted body with the company fields and every person, numeric type included", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 900 } } });

    await createContactApi(
      formValues({
        type: "Supplier",
        additionalContacts: [person()],
      }),
    );

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.contact.create);
    const fields = decryptedFieldsFromBody(body);
    expect(fields).toMatchObject({
      business_name: "Turner Consulting",
      company_type: "business",
      type: 2,
    });
    expect(fields.contacts).toHaveLength(2);
    expect((fields.contacts as { name: string }[])[0]).toMatchObject({
      name: "Michael Turner",
      is_primary: 1,
    });
    expect((fields.contacts as { name: string }[])[1]).toMatchObject({
      name: "Sarah Chen",
      is_primary: 0,
    });
  });

  it("sends only the primary in contacts[] for an Individual", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } });
    await createContactApi(
      formValues({ businessType: "Individual", businessName: "" }),
    );
    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.contacts).toHaveLength(1);
    expect(fields.company_type).toBe("individual");
  });

  it("returns the created contact carrying the server's id", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 900 } } });
    const result = await createContactApi(formValues());
    expect(result.id).toBe("900");
    expect(result.isDefault).toBe(false);
  });

  it("throws when the server reports failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Business name is required" },
    });
    await expect(createContactApi(formValues())).rejects.toThrow(
      "Business name is required",
    );
  });

  it("throws when the server reports success but no id", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await expect(createContactApi(formValues())).rejects.toThrow(
      "The contact saved but the server returned no id.",
    );
  });
});

/* ------------------------------------------------------------------ *
 * Update — company PATCH plus person reconciliation
 * ------------------------------------------------------------------ */

describe("updateContactApi", () => {
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
    return formValues({
      personId: "10",
      additionalContacts: [
        person({
          id: "11",
          personName: "Sarah Chen",
          email: "sarah.chen@email.com",
          countryCode: "+61",
          phone: "422222222",
        }),
      ],
    });
  }

  it("PATCHes the company fields only — no contacts array", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });
    await updateContactApi("501", unchangedValues(), originalPeople);

    const companyCall = apiMock.patch.mock.calls[0];
    expect(companyCall[0]).toBe(`${apiRoutes.contact.update}/501`);
    const fields = decryptedFieldsFromBody(companyCall[1]);
    expect(fields).not.toHaveProperty("contacts");
    expect(fields).toMatchObject({ business_name: "Turner Consulting" });
  });

  it("makes no person calls at all when nothing about them changed", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });
    await updateContactApi("501", unchangedValues(), originalPeople);
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(apiMock.delete).not.toHaveBeenCalled();
    // Only the one company PATCH — no person PATCH either.
    expect(apiMock.patch).toHaveBeenCalledTimes(1);
  });

  it("PATCHes a person whose fields changed", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });
    const values = unchangedValues();
    values.additionalContacts[0].email = "sarah.chen+new@email.com";

    await updateContactApi("501", values, originalPeople);

    expect(apiMock.patch).toHaveBeenCalledTimes(2);
    const personCall = apiMock.patch.mock.calls[1];
    expect(personCall[0]).toBe(`${apiRoutes.companyContact.update}/11`);
    expect(decryptedFieldsFromBody(personCall[1])).toMatchObject({
      email: "sarah.chen+new@email.com",
    });
  });

  it("POSTs a brand-new person (no id) with the client_id attached", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });
    apiMock.post.mockResolvedValue({ data: { success: true } });
    const values = unchangedValues();
    values.additionalContacts.push(person({ personName: "New Person" }));

    await updateContactApi("501", values, originalPeople);

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.companyContact.create);
    expect(decryptedFieldsFromBody(body)).toMatchObject({
      name: "New Person",
      client_id: "501",
    });
  });

  it("DELETEs a person present in originalPeople but missing from the submission", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    // Drop the additional contact entirely — only the primary remains.
    const values = formValues({ personId: "10", additionalContacts: [] });

    await updateContactApi("501", values, originalPeople);

    expect(apiMock.delete).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.delete.mock.calls[0];
    expect(url).toBe(`${apiRoutes.companyContact.delete}/11`);
    expect(decryptPayload(config.data.data)).toEqual({});
  });

  it("throws on the company PATCH's own failure without touching any person endpoint", async () => {
    apiMock.patch.mockResolvedValue({
      data: { success: false, message: "Contact not found" },
    });
    await expect(
      updateContactApi("501", unchangedValues(), originalPeople),
    ).rejects.toThrow("Contact not found");
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(apiMock.delete).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ *
 * Delete
 * ------------------------------------------------------------------ */

describe("deleteContactApi", () => {
  it("DELETEs with an encrypted empty body carried as the `data` config option", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await deleteContactApi("501");

    const [url, config] = apiMock.delete.mock.calls[0];
    expect(url).toBe(`${apiRoutes.contact.delete}/501`);
    expect(decryptPayload(config.data.data)).toEqual({});
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.delete.mockResolvedValue({
      data: { success: false, message: "Contact has open invoices" },
    });
    await expect(deleteContactApi("501")).rejects.toThrow(
      "Contact has open invoices",
    );
  });
});

/* ------------------------------------------------------------------ *
 * Bulk create
 * ------------------------------------------------------------------ */

describe("bulkCreateContactsApi", () => {
  /** A clean row in the import engine's generic shape. */
  function row(values: Partial<BulkValues> = {}): BulkRow {
    return {
      index: 0,
      issues: [],
      values: {
        "Business name": "Acme",
        "Contact name": "Jo Lee",
        "Contact email": "jo@acme.test",
        "Mobile no": "411111111",
        Type: "Client",
        "Business type": "Business",
        ...values,
      },
    };
  }

  it("maps rows to Title-Case keys, with Type transformed to '1'/'2'", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await bulkCreateContactsApi([row({ Type: "Client" }), row({ Type: "supplier" })]);

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    expect(fields.type).toBe("upload");
    const fileData = fields.file_data as Record<string, string>[];
    expect(fileData[0]).toMatchObject({
      "Business Name": "Acme",
      "Contact Name": "Jo Lee",
      "Contact Email": "jo@acme.test",
      "Mobile No": "411111111",
      Type: 1,
      "Business type": "Business",
      Currency: "AUD",
    });
    expect(fileData[1].Type).toBe(2);
  });

  it("POSTs to the bulk-insert route", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await bulkCreateContactsApi([row()]);
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.client.bulkInsert);
  });

  it("reads the counts out of meta, keeping skipped apart from failed", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: [],
        meta: { total: 4, created: 2, skipped: 1, failed: 1 },
      },
    });
    expect(await bulkCreateContactsApi([row(), row(), row(), row()])).toMatchObject({
      created: 2,
      failed: 1,
      skipped: 1,
    });
  });

  it("counts the per-row log when the server sends no meta", async () => {
    // The service's own status strings are success/skipped/failed — not
    // "created", which is what `meta` calls the same thing.
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: [
          { row: 1, status: "success", identifier: "Acme" },
          { row: 2, status: "skipped", message: "Client with this email already exists" },
        ],
      },
    });
    expect(await bulkCreateContactsApi([row(), row()])).toMatchObject({
      created: 1,
      failed: 0,
      skipped: 1,
    });
  });

  it("carries the per-row log through, so the results dialog can show it", async () => {
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            row: 1,
            status: "skipped",
            identifier: "Acme",
            message: "Client with this email already exists",
          },
        ],
        meta: { total: 1, created: 0, skipped: 1, failed: 0 },
      },
    });

    const result = await bulkCreateContactsApi([row()]);
    expect(result).toMatchObject({ created: 0, skipped: 1, failed: 0 });
    expect(result.rows).toEqual([
      {
        row: 1,
        status: "skipped",
        identifier: "Acme",
        message: "Client with this email already exists",
      },
    ]);
  });

  it("treats an unrecognised per-row status as a failure, not a success", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: [{ row: 1, status: "exploded" }] },
    });
    expect((await bulkCreateContactsApi([row()])).rows?.[0].status).toBe(
      "failed",
    );
  });

  it("falls back to every row succeeding when the server echoes nothing", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    const rows = [row(), row()];
    expect(await bulkCreateContactsApi(rows)).toEqual({
      created: 2,
      failed: 0,
      skipped: 0,
    });
  });

  it("sends the extra mapped fields alongside the core columns", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await bulkCreateContactsApi([
      row({ Website: "https://acme.test", Currency: "NZD" }),
    ]);

    const fields = decryptedFieldsFromBody(apiMock.post.mock.calls[0][1]);
    const fileData = fields.file_data as Record<string, string>[];
    expect(fileData[0]).toMatchObject({
      Website: "https://acme.test",
      // A mapped Currency column wins over the AUD default.
      Currency: "NZD",
    });
  });

  it("refuses an empty file rather than posting one", async () => {
    await expect(bulkCreateContactsApi([])).rejects.toThrow("File is empty");
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "clients array is required" },
    });
    await expect(bulkCreateContactsApi([row()])).rejects.toThrow(
      "clients array is required",
    );
  });
});
