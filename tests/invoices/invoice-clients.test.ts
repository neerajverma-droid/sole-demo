import { describe, expect, it, vi, beforeEach } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so `lib/invoice-clients.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  contactsForClient,
  createInvoiceClientApi,
  fetchClientNdisDetails,
  fetchInvoiceContacts,
  ndisClientIssue,
  primaryContactFor,
  saveParticipantNdisApi,
} = await import("@/lib/invoice-clients");

type InvoiceContact = Awaited<ReturnType<typeof fetchInvoiceContacts>>[number];

function contact(over: Partial<InvoiceContact> = {}): InvoiceContact {
  return {
    id: "1",
    clientId: "42",
    name: "Jo",
    email: "jo@acme.test",
    isPrimary: false,
    ndisNumber: "",
    clientName: "Acme",
    clientCurrency: null,
    clientAbn: "",
    clientAddress: "",
    ...over,
  };
}

function sentFields(body: unknown): Record<string, unknown> {
  return decryptPayload((body as { data: string }).data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ *
 * Contacts
 * ------------------------------------------------------------------ */

describe("fetchInvoiceContacts", () => {
  it("lists clients (type 1) by default, mapping and trimming each contact", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            contact_id: 7,
            client_id: 42,
            name: "  Priya Shah ",
            email: " priya@acme.test ",
            is_primary: 1,
            ndis_no: " 430123456 ",
            client: {
              business_name: " Acme Pty Ltd ",
              currency: "nzd",
              ABN: " 12 345 678 901 ",
              address: " 1 George St ",
            },
          },
        ],
      },
    });

    const contacts = await fetchInvoiceContacts();

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.companyContact.list, {
      params: { type: 1 },
    });
    expect(contacts).toEqual([
      {
        id: "7",
        clientId: "42",
        name: "Priya Shah",
        email: "priya@acme.test",
        isPrimary: true,
        ndisNumber: "430123456",
        clientName: "Acme Pty Ltd",
        clientCurrency: "NZD",
        clientAbn: "12 345 678 901",
        clientAddress: "1 George St",
      },
    ]);
  });

  it("asks for suppliers with type 2, and blanks what a bare row leaves out", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [{ contact_id: 8, client_id: 9, client: null }] },
    });

    const [row] = await fetchInvoiceContacts(2);

    expect(apiMock.get.mock.calls[0][1]).toEqual({ params: { type: 2 } });
    expect(row).toEqual({
      id: "8",
      clientId: "9",
      name: "",
      email: "",
      isPrimary: false,
      ndisNumber: "",
      clientName: "",
      clientCurrency: null,
      clientAbn: "",
      clientAddress: "",
    });
  });

  it("is an empty list when the response has no data — no success check", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false } });
    expect(await fetchInvoiceContacts()).toEqual([]);
  });
});

describe("contactsForClient / primaryContactFor", () => {
  const contacts = [
    contact({ id: "1", clientId: "42" }),
    contact({ id: "2", clientId: "42", isPrimary: true }),
    contact({ id: "3", clientId: "99", isPrimary: true }),
  ];

  it("keeps only that client's contacts, primary first", () => {
    expect(contactsForClient(contacts, "42").map((c) => c.id)).toEqual(["2", "1"]);
  });

  it("is empty with no client chosen", () => {
    expect(contactsForClient(contacts, null)).toEqual([]);
    expect(primaryContactFor(contacts, null)).toBeUndefined();
  });

  it("names the primary contact as the participant", () => {
    expect(primaryContactFor(contacts, "42")?.id).toBe("2");
  });

  it("falls back to the first contact when nobody is flagged primary", () => {
    const unflagged = [
      contact({ id: "5", clientId: "7" }),
      contact({ id: "6", clientId: "7" }),
    ];
    expect(primaryContactFor(unflagged, "7")?.id).toBe("5");
  });
});

/* ------------------------------------------------------------------ *
 * NDIS details
 * ------------------------------------------------------------------ */

describe("fetchClientNdisDetails", () => {
  it("reads the participant off the primary contact of GET /client/:id", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          contacts: [
            { id: 1, name: "Not primary", is_primary: 0, ndis_no: "111" },
            {
              id: 2,
              name: " Sam Lee ",
              is_primary: 1,
              ndis_no: " 430999 ",
              plan_manager_name: " Plan Co ",
              plan_manager_ndis: " PM-1 ",
            },
          ],
        },
      },
    });

    const details = await fetchClientNdisDetails("42");

    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.contact.getDetails}/42`);
    expect(details).toEqual({
      clientId: "42",
      participantContactId: "2",
      participantName: "Sam Lee",
      participantNumber: "430999",
      planManagerName: "Plan Co",
      planManagerNumber: "PM-1",
    });
  });

  it("falls back to the first contact when none is primary", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { contacts: [{ id: 5, name: "First" }, { id: 6 }] } },
    });
    expect(await fetchClientNdisDetails("42")).toMatchObject({
      participantContactId: "5",
      participantName: "First",
      participantNumber: "",
    });
  });

  it("returns blank details rather than throwing for a client with no contacts", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { contacts: null } } });
    expect(await fetchClientNdisDetails("42")).toEqual({
      clientId: "42",
      participantContactId: "",
      participantName: "",
      participantNumber: "",
      planManagerName: "",
      planManagerNumber: "",
    });
  });
});

describe("ndisClientIssue", () => {
  const details = {
    clientId: "42",
    participantContactId: "2",
    participantName: "Sam Lee",
    participantNumber: "",
    planManagerName: "",
    planManagerNumber: "",
  };

  it("names the participant who's missing an NDIS number", () => {
    expect(ndisClientIssue(details, "42")).toBe(
      "Sam Lee has no NDIS number. Add it to their contact record before claiming.",
    );
  });

  it("uses a generic message when the participant has no name", () => {
    expect(ndisClientIssue({ ...details, participantName: "" }, "42")).toBe(
      "This client's primary contact has no NDIS number.",
    );
  });

  it("has no issue once the participant has a number", () => {
    expect(ndisClientIssue({ ...details, participantNumber: "430" }, "42")).toBeUndefined();
  });

  it("gives no verdict for a stale lookup that belongs to a different client", () => {
    expect(ndisClientIssue(details, "99")).toBeUndefined();
  });

  it("gives no verdict with no client chosen or nothing loaded yet", () => {
    expect(ndisClientIssue(details, null)).toBeUndefined();
    expect(ndisClientIssue(undefined, "42")).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * Creating a client
 * ------------------------------------------------------------------ */

describe("createInvoiceClientApi", () => {
  it("POSTs a plain JSON client with one primary contact", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { client_id: 55, contacts: [{ contact_id: 66 }] } },
    });

    const created = await createInvoiceClientApi({
      name: "Acme",
      email: "hi@acme.test",
      ndisNumber: "430123",
    });

    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.client.add, {
      name: "Acme",
      email: "hi@acme.test",
      type: 1,
      contacts: [
        { name: "Acme", email: "hi@acme.test", is_primary: 1, ndis_no: "430123" },
      ],
    });
    expect(created).toEqual({
      clientId: "55",
      clientName: "Acme",
      contact: { id: "66", name: "Acme", email: "hi@acme.test" },
    });
  });

  it("omits ndis_no when no number is given", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { client_id: 55, contacts: [{ id: 66 }] } },
    });

    await createInvoiceClientApi({ name: "Acme", email: "hi@acme.test" });

    const body = apiMock.post.mock.calls[0][1] as { contacts: object[] };
    expect(body.contacts[0]).not.toHaveProperty("ndis_no");
  });

  it("falls back to data.id for the client and contact.id for the contact", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { id: 12, contacts: [{ id: 34 }] } },
    });

    const created = await createInvoiceClientApi({ name: "Acme", email: "a@b.test" });
    expect(created.clientId).toBe("12");
    expect(created.contact.id).toBe("34");
  });

  it("leaves the contact id blank when the response omits the contact", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { client_id: 12 } } });

    const created = await createInvoiceClientApi({ name: "Acme", email: "a@b.test" });
    expect(created.contact.id).toBe("");
  });

  it("throws the server's message on success:false, or the fallback", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Email already used", data: { client_id: 1 } },
    });
    await expect(
      createInvoiceClientApi({ name: "Acme", email: "a@b.test" }),
    ).rejects.toThrow("Email already used");

    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(
      createInvoiceClientApi({ name: "Acme", email: "a@b.test" }),
    ).rejects.toThrow("Couldn't add that client.");
  });

  it("throws when a successful response carries no data at all", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await expect(
      createInvoiceClientApi({ name: "Acme", email: "a@b.test" }),
    ).rejects.toThrow("Couldn't add that client.");
  });

  it("throws when the client saved but no id came back", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { contacts: [] } } });
    await expect(
      createInvoiceClientApi({ name: "Acme", email: "a@b.test" }),
    ).rejects.toThrow("The client saved but the server returned no id.");
  });
});

/* ------------------------------------------------------------------ *
 * Saving a participant's NDIS number
 * ------------------------------------------------------------------ */

describe("saveParticipantNdisApi", () => {
  const values = {
    ndisNumber: " 430123 ",
    planManagerName: " Plan Co ",
    planManagerNumber: " PM-1 ",
  };

  it("PATCHes the existing primary contact with the trimmed fields, encrypted", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: true } });

    const saved = await saveParticipantNdisApi(
      { clientId: "42", participantContactId: "7", participantName: "Sam" },
      values,
      "Acme",
    );

    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(`${apiRoutes.companyContact.update}/7`);
    expect(sentFields(body)).toEqual({
      ndis_no: "430123",
      plan_manager_name: "Plan Co",
      plan_manager_ndis: "PM-1",
    });
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(saved).toEqual({
      clientId: "42",
      participantContactId: "7",
      participantName: "Sam",
      participantNumber: "430123",
      planManagerName: "Plan Co",
      planManagerNumber: "PM-1",
    });
  });

  it("creates a primary contact named after the client when the client has none", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 88 } } });

    const saved = await saveParticipantNdisApi(
      { clientId: "42", participantContactId: "", participantName: "" },
      values,
      " Acme ",
    );

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.companyContact.create);
    expect(sentFields(body)).toEqual({
      ndis_no: "430123",
      plan_manager_name: "Plan Co",
      plan_manager_ndis: "PM-1",
      client_id: "42",
      name: "Acme",
      is_primary: 1,
    });
    expect(saved).toMatchObject({ participantContactId: "88", participantName: "Acme" });
  });

  it("names a created contact 'Participant' when the client has no name either", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { contact_id: 9 } } });

    const saved = await saveParticipantNdisApi(
      { clientId: "42", participantContactId: "", participantName: "" },
      values,
      "  ",
    );
    expect(saved).toMatchObject({ participantContactId: "9", participantName: "Participant" });
  });

  it("throws with the server's message, or its own fallback, from either path", async () => {
    apiMock.patch.mockResolvedValue({ data: { success: false, message: "Bad number" } });
    await expect(
      saveParticipantNdisApi(
        { clientId: "42", participantContactId: "7", participantName: "Sam" },
        values,
        "Acme",
      ),
    ).rejects.toThrow("Bad number");

    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(
      saveParticipantNdisApi(
        { clientId: "42", participantContactId: "", participantName: "" },
        values,
        "Acme",
      ),
    ).rejects.toThrow("Couldn't save the NDIS number.");
  });
});
