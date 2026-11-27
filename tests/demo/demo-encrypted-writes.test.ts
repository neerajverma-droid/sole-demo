import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import { handleMockRequest } from "@/lib/demo-seed/mock-server";
import { __resetSessionForTests, endDemoSession } from "@/lib/demo-seed/session";

/**
 * The app's real writes are AES-encrypted into one `data` field. The transport can hand
 * the mock that as an object, as the JSON string axios builds from it, or as a FormData
 * when files ride along. All three must be understood.
 */

const get = (path: string, params: Record<string, any> = {}) => handleMockRequest("GET", path, params)!;

beforeEach(() => {
  endDemoSession();
  __resetSessionForTests();
  handleMockRequest("POST", "/demo/login", {}, { industry: "plumbing", country: "NZ" });
});
afterEach(() => {
  endDemoSession();
  __resetSessionForTests();
});

const invoiceFields = (no: string, clientId: string) => ({
  invoice_no: no,
  client_id: clientId,
  invoice_date: "2026-11-20",
  due_date: "2099-01-01",
  description: "Encrypted save",
  total: 115,
  sub_total: 100,
  total_gst: 15,
  item: [{ description: "Tap replacement", price: 100, qty: 1, gst: true, gst_percentage: 15 }],
});

describe("encrypted writes reach the overlay", () => {
  it("as an object", () => {
    const client = get("/client/v2", { type: "1" }).data.data[0];
    const body = buildEncryptedRequestBody(invoiceFields("INV-ENC-1", client.id));
    expect(typeof (body as { data: string }).data).toBe("string");
    const res = handleMockRequest("POST", "/invoice/add", {}, body)!;
    expect(res.data.success).toBe(true);
    expect(get("/invoice/invoices", { search: "INV-ENC-1" }).data.data.invoice_details).toHaveLength(1);
  });

  it("as the JSON string axios hands its adapter", () => {
    const client = get("/client/v2", { type: "1" }).data.data[0];
    const body = JSON.stringify(buildEncryptedRequestBody(invoiceFields("INV-ENC-2", client.id)));
    const res = handleMockRequest("POST", "/invoice/add", {}, body)!;
    expect(res.data.success).toBe(true);
    expect(get("/invoice/invoices", { search: "INV-ENC-2" }).data.data.invoice_details).toHaveLength(1);
  });

  it("as a FormData with an attachment", () => {
    const client = get("/client/v2", { type: "1" }).data.data[0];
    const file = new File(["x"], "receipt.pdf", { type: "application/pdf" });
    const body = buildEncryptedRequestBody(invoiceFields("INV-ENC-3", client.id), [file]);
    expect(body instanceof FormData).toBe(true);
    const res = handleMockRequest("POST", "/invoice/add", {}, body)!;
    expect(res.data.success).toBe(true);
    expect(get("/invoice/invoices", { search: "INV-ENC-3" }).data.data.invoice_details).toHaveLength(1);
  });

  it("an encrypted expense edit carries its id in the body", () => {
    const supplier = get("/client/v2", { type: "2" }).data.data[0];
    const created = handleMockRequest(
      "POST",
      "/v2/expense/",
      {},
      JSON.stringify(buildEncryptedRequestBody({ name: "Solder", price: 40, date: "2026-11-25", client_id: supplier.id, account_subcategory_id: 141, gst: 1 })),
    )!;
    const id = created.data.data.id;
    handleMockRequest("POST", "/v2/expense/edit", {}, JSON.stringify(buildEncryptedRequestBody({ id, name: "Solder (edited)", price: 55 })));
    expect(JSON.stringify(get("/expense/list", { limit: 500, page_size: 500 }).data)).toContain("Solder (edited)");
  });

  it("unencrypted JSON bodies still work", () => {
    const res = handleMockRequest("POST", "/client/", {}, JSON.stringify({ name: "Plain Body Ltd", type: 1 }))!;
    expect(res.data.success).toBe(true);
  });
});
