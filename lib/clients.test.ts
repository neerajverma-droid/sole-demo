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

// Imported after the mock so `lib/clients.ts`'s own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const { fetchBusinessContacts, createBusinessContactApi } = await import(
  "@/lib/clients"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchBusinessContacts", () => {
  it("lists clients with filter_by[type]=client", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { clients_details: [] } },
    });

    await fetchBusinessContacts("Client");

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    const [url, config] = apiMock.get.mock.calls[0];
    expect(url).toBe(apiRoutes.client.listV2);
    expect(config.params).toEqual({
      page_size: 100,
      "filter_by[type]": "client",
      "filter_by[scope]": "all",
    });
  });

  it("lists suppliers with filter_by[type]=supplier", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { clients_details: [] } },
    });

    await fetchBusinessContacts("Supplier");

    const [, config] = apiMock.get.mock.calls[0];
    expect(config.params["filter_by[type]"]).toBe("supplier");
  });

  it("asks the backend to merge in the global default clients/suppliers", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { clients_details: [] } },
    });
    await fetchBusinessContacts("Supplier");
    const [, config] = apiMock.get.mock.calls[0];
    expect(config.params["filter_by[scope]"]).toBe("all");
  });

  it("maps every field, preferring business_name over name for display", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          clients_details: [
            {
              client_id: 44231,
              name: "Emma Williams",
              business_name: "Williams Health Services",
              email: "emma.williams@yopmail.com",
              currency: "AUD",
              ABN: "15345678905",
              address: {
                address_line1: "4 Kippax Street",
                city: "Sydney",
                state: "NSW",
                country: "Australia",
              },
            },
          ],
        },
      },
    });

    const result = await fetchBusinessContacts("Client");

    expect(result).toEqual([
      {
        id: "44231",
        name: "Williams Health Services",
        email: "emma.williams@yopmail.com",
        currency: "AUD",
        abn: "15345678905",
        address: "4 Kippax Street, Sydney, NSW, Australia",
        primaryContactId: null,
      },
    ]);
  });

  it("reads primary_contact as the client's own primary contact id, a different id space than client_id", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          clients_details: [
            { client_id: 44231, name: "Emma Williams", primary_contact: 90125 },
          ],
        },
      },
    });

    const result = await fetchBusinessContacts("Client");
    expect(result[0].primaryContactId).toBe("90125");
  });

  it("falls back to the contact's own name when there's no business name", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { clients_details: [{ client_id: 1, name: "test", business_name: "" }] },
      },
    });
    const result = await fetchBusinessContacts("Client");
    expect(result[0].name).toBe("test");
  });

  it("leaves email/currency/abn/address blank rather than throwing when absent", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { clients_details: [{ client_id: 1, name: "test" }] },
      },
    });
    const result = await fetchBusinessContacts("Client");
    expect(result[0]).toEqual({
      id: "1",
      name: "test",
      email: "",
      currency: null,
      abn: "",
      address: "",
      primaryContactId: null,
    });
  });

  it("returns an empty list when the response carries none", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: {} } });
    expect(await fetchBusinessContacts("Client")).toEqual([]);
  });
});

describe("createBusinessContactApi", () => {
  it("POSTs a plain (unencrypted) body with type: 1 and a primary contact for a client", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { client_id: 501 } },
    });

    await createBusinessContactApi("Client", {
      name: "Acme Pty Ltd",
      email: "accounts@acme.com",
    });

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.client.add);
    expect(body).toEqual({
      name: "Acme Pty Ltd",
      email: "accounts@acme.com",
      type: 1,
      contacts: [{ name: "Acme Pty Ltd", email: "accounts@acme.com", is_primary: 1 }],
    });
  });

  it("sends type: 2 for a supplier", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { client_id: 502 } },
    });

    await createBusinessContactApi("Supplier", { name: "Timber & Co" });

    const body = apiMock.post.mock.calls[0][1];
    expect(body.type).toBe(2);
  });

  it("defaults a missing email to an empty string on every contact", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { client_id: 503 } },
    });

    await createBusinessContactApi("Supplier", { name: "Timber & Co" });

    const body = apiMock.post.mock.calls[0][1];
    expect(body.email).toBe("");
    expect(body.contacts[0].email).toBe("");
  });

  it("resolves the new contact's id from client_id", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { client_id: 501 } },
    });
    const result = await createBusinessContactApi("Client", { name: "Acme" });
    expect(result).toEqual({
      id: "501",
      name: "Acme",
      email: "",
      currency: null,
      abn: "",
      address: "",
      primaryContactId: null,
    });
  });

  it("resolves the new primary contact's own id from data.primary_contact", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { client_id: 501, primary_contact: 38025 } },
    });
    const result = await createBusinessContactApi("Client", { name: "Acme" });
    expect(result.primaryContactId).toBe("38025");
  });

  it("falls back to a bare id if client_id is absent", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { id: 777 } },
    });
    const result = await createBusinessContactApi("Client", { name: "Acme" });
    expect(result.id).toBe("777");
  });

  it("trims and keeps the given email on the returned contact", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { client_id: 501 } },
    });
    const result = await createBusinessContactApi("Client", {
      name: "Acme",
      email: "  accounts@acme.com  ",
    });
    expect(result.email).toBe("accounts@acme.com");
  });

  it("throws with the server's own message on failure", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: false, message: "Duplicate contact name." },
    });
    await expect(
      createBusinessContactApi("Supplier", { name: "Timber & Co" }),
    ).rejects.toThrow("Duplicate contact name.");
  });

  it("throws a type-worded fallback message when the server gives none", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false } });
    await expect(
      createBusinessContactApi("Supplier", { name: "Timber & Co" }),
    ).rejects.toThrow("Couldn't add that supplier.");
  });

  it("throws when the server reports success with no id at all", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await expect(
      createBusinessContactApi("Client", { name: "Acme" }),
    ).rejects.toThrow("The client saved but the server returned no id.");
  });
});
