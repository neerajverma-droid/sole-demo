import { describe, expect, it } from "vitest";

import { partyOptions } from "@/hooks/use-bulk-transaction-parties";
import type { InvoiceContact } from "@/lib/invoice-clients";

function contact(overrides: Partial<InvoiceContact> = {}): InvoiceContact {
  return {
    id: "10",
    clientId: "1",
    name: "Jo Lee",
    email: "jo@acme.test",
    isPrimary: false,
    ndisNumber: "",
    clientName: "Acme",
    clientCurrency: null,
    clientAbn: "",
    clientAddress: "",
    ...overrides,
  };
}

describe("partyOptions", () => {
  it("offers one entry per client, carrying its contact id", () => {
    expect(partyOptions([contact()])).toEqual([
      { clientId: "1", contactId: "10", name: "Acme" },
    ]);
  });

  it("prefers the primary contact, whichever order they arrive in", () => {
    const rows = [
      contact({ id: "10", isPrimary: false }),
      contact({ id: "11", isPrimary: true }),
    ];
    expect(partyOptions(rows)[0].contactId).toBe("11");
    expect(partyOptions([...rows].reverse())[0].contactId).toBe("11");
  });

  it("keeps the first contact when no one is marked primary", () => {
    const rows = [contact({ id: "10" }), contact({ id: "11" })];
    expect(partyOptions(rows)).toHaveLength(1);
    expect(partyOptions(rows)[0].contactId).toBe("10");
  });

  it("falls back to the person's name when the client has no business name", () => {
    expect(partyOptions([contact({ clientName: "" })])[0].name).toBe("Jo Lee");
    expect(
      partyOptions([contact({ clientName: "", name: "" })])[0].name,
    ).toBe("Unnamed");
  });

  it("drops a contact with no client — there is nothing to match against", () => {
    expect(partyOptions([contact({ clientId: "" })])).toEqual([]);
  });

  it("sorts by name, and tolerates no data at all", () => {
    const rows = [
      contact({ clientId: "1", clientName: "Zeta" }),
      contact({ clientId: "2", clientName: "Alpha" }),
    ];
    expect(partyOptions(rows).map((party) => party.name)).toEqual([
      "Alpha",
      "Zeta",
    ]);
    expect(partyOptions(undefined)).toEqual([]);
  });
});
