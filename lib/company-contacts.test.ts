import { describe, expect, it, vi, beforeEach } from "vitest";

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

// Imported after the mock so `lib/company-contacts.ts`'s own `import api
// from "@/utils/axiosInstance"` resolves to the mocked module above.
const { fetchCompanyContacts } = await import("@/lib/company-contacts");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchCompanyContacts", () => {
  it("lists with type=2 for a supplier, type=1 for a client, always merging in the global defaults", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: [] } });

    await fetchCompanyContacts("Supplier");
    expect(apiMock.get.mock.calls[0][0]).toBe(apiRoutes.companyContact.list);
    expect(apiMock.get.mock.calls[0][1].params).toEqual({
      type: 2,
      "filter_by[scope]": "all",
    });

    await fetchCompanyContacts("Client");
    expect(apiMock.get.mock.calls[1][1].params).toEqual({
      type: 1,
      "filter_by[scope]": "all",
    });
  });

  it("maps contact_id (not id) as the contact's own id, distinct from client_id", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            contact_id: 38025,
            client_id: 44909,
            name: "Jane Vendor",
            email: "jane@timber.co",
            client: { business_name: "Timber & Co" },
          },
        ],
      },
    });

    const [contact] = await fetchCompanyContacts("Supplier");
    expect(contact).toEqual({
      contactId: "38025",
      clientId: "44909",
      name: "Jane Vendor",
      email: "jane@timber.co",
      clientName: "Timber & Co",
      isPrimary: false,
    });
  });

  it("marks the company's primary contact, the person a pick of the company stands for", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            contact_id: 60,
            client_id: 200,
            name: "Customer Support",
            is_primary: 1,
            client: { business_name: "Amazon" },
          },
          {
            contact_id: 61,
            client_id: 200,
            name: "Billing",
            is_primary: 0,
            client: { business_name: "Amazon" },
          },
        ],
      },
    });

    const contacts = await fetchCompanyContacts("Supplier");
    expect(
      contacts.map((contact) => [contact.contactId, contact.isPrimary]),
    ).toEqual([
      ["60", true],
      ["61", false],
    ]);
  });

  it("falls back to the contact's own name when the client has no business_name", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [{ contact_id: 1, client_id: 2, name: "Solo Trader" }],
      },
    });

    const [contact] = await fetchCompanyContacts("Supplier");
    expect(contact.clientName).toBe("Solo Trader");
  });

  it("drops a row with no client_id at all", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          { contact_id: 1, client_id: null, name: "Orphaned" },
          { contact_id: 2, client_id: 5, name: "Real one" },
        ],
      },
    });

    const contacts = await fetchCompanyContacts("Supplier");
    expect(contacts.map((c) => c.name)).toEqual(["Real one"]);
  });
});
