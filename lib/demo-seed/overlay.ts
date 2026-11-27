/* eslint-disable @typescript-eslint/no-explicit-any -- builds loosely typed mock API payloads, like mock-server.ts */
/**
 * Writable in-memory overlay for the demo.
 *
 * The mock serves reads straight from the generated seed arrays, so a write is
 * simply a change to those arrays: the next list or detail read shows it. The
 * seed lives only in the visitor's tab and is rebuilt on every new visit, so
 * nothing here can reach, or outlive, anyone's real data.
 *
 * Supported: contacts (clients and suppliers), invoices, quotes, expenses and
 * price-list items — create, edit and delete. Everything else stays read-only
 * and the mock tells the visitor so.
 */

import type { SeedData } from "./generator";

export interface OverlayResponse {
  status: number;
  data: any;
}

type Fields = Record<string, any>;

const ok = (data: any, extra: Record<string, unknown> = {}): OverlayResponse => ({
  status: 200,
  data: { success: true, ...extra, data },
});
const fail = (message: string): OverlayResponse => ({ status: 200, data: { success: false, message, data: null } });

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown, fallback = ""): string => (v === undefined || v === null ? fallback : String(v));
const round2 = (n: number) => Math.round(n * 100) / 100;
const nextId = (list: any[], keys: string[], floor: number): number =>
  list.reduce((max, row) => Math.max(max, ...keys.map((k) => Number(row?.[k]) || 0)), floor) + 1;

function idsFrom(fields: Fields, path: string): string[] {
  const tail = path.split("/").pop() ?? "";
  const fromBody =
    fields.ids ?? fields.id_list ?? fields.expenses ?? fields.invoices ?? fields.quotes ?? fields.clients ?? fields.items;
  const list = Array.isArray(fromBody) ? fromBody : fromBody !== undefined ? [fromBody] : [];
  const out = list.map((v) => String(typeof v === "object" && v ? (v.id ?? v.invoice_id ?? v.quote_id ?? v.expense_id) : v));
  if (!out.length && /^\d+$/.test(tail)) out.push(tail);
  if (!out.length && fields.id !== undefined) out.push(String(fields.id));
  return out;
}

function removeWhere<T>(list: T[], pred: (row: T) => boolean): number {
  let removed = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (pred(list[i])) {
      list.splice(i, 1);
      removed++;
    }
  }
  return removed;
}

function lineItems(fields: Fields, rate: number) {
  const raw: any[] = Array.isArray(fields.item) ? fields.item : Array.isArray(fields.items) ? fields.items : [];
  return raw.map((it, i) => ({
    id: String(i + 1),
    product_id: it.product_id == null ? undefined : String(it.product_id),
    description: str(it.description),
    qty: str(it.qty ?? it.quantity ?? 1),
    qty_type: str(it.qty_type, "items"),
    price: str(it.price ?? 0),
    gst: it.gst ? 1 : 0,
    gst_percentage: it.gst ? num(it.gst_percentage, rate) : 0,
    discount: num(it.discount),
    disc_criteria: str(it.disc_criteria, "percent"),
  }));
}

function totalsFrom(fields: Fields, items: ReturnType<typeof lineItems>, rate: number) {
  const computedSub = round2(items.reduce((a, it) => a + num(it.qty, 1) * num(it.price), 0));
  const subTotal = fields.sub_total !== undefined ? num(fields.sub_total) : computedSub;
  const tax = fields.total_gst !== undefined ? num(fields.total_gst) : round2(items.reduce((a, it) => a + (it.gst ? num(it.qty, 1) * num(it.price) * (num(it.gst_percentage, rate) / 100) : 0), 0));
  const total = fields.total !== undefined ? num(fields.total) : round2(subTotal + tax);
  return { subTotal, tax, total };
}

function findClient(seed: SeedData, id: unknown) {
  const key = String(id ?? "");
  return [...seed.clients, ...seed.suppliers].find((c: any) => String(c.id) === key);
}

function clientSummary(c: any) {
  if (!c) return { client_id: 0, id: 0, name: "Walk-in customer" };
  return {
    client_id: Number(c.id),
    id: Number(c.id),
    name: c.name,
    business_name: c.kind === "residential" ? null : c.name,
    company_type: c.kind === "residential" ? "individual" : "business",
    email: c.email,
    city: c.city,
    country: c.country,
  };
}

/**
 * Apply one write. Returns null when the path isn't a supported resource, so the
 * caller can fall back to its "not saved in the demo" answer.
 */
export function applyOverlayWrite(
  method: string,
  path: string,
  fields: Fields,
  seed: SeedData,
  today: string,
  rate: number,
): OverlayResponse | null {
  const m = method.toUpperCase();
  const isDelete = m === "DELETE" || /bulk-delete$|\/delete$/.test(path);

  /* ---- Contacts -------------------------------------------------------- */
  if (/^\/client(\/|$)/.test(path) && !path.startsWith("/client/bulk") && !/(\/v2|\/check|\/search)/.test(path)) {
    if (isDelete) {
      const ids = idsFrom(fields, path);
      for (const id of ids) {
        removeWhere(seed.clients as any[], (c) => String(c.id) === id);
        removeWhere(seed.suppliers as any[], (c) => String(c.id) === id);
      }
      return ok(null, { message: "Contact deleted." });
    }
    const tail = path.replace(/^\/client\/?/, "");
    if (m === "POST" && !tail) {
      const isSupplier = num(fields.type, 1) === 2;
      const list: any[] = isSupplier ? (seed.suppliers as any[]) : (seed.clients as any[]);
      const id = nextId([...(seed.clients as any[]), ...(seed.suppliers as any[])], ["id"], 99);
      const contactId = nextId([...(seed.clients as any[]), ...(seed.suppliers as any[])], ["contactId"], 199);
      const primary = (Array.isArray(fields.contacts) ? fields.contacts[0] : null) ?? {};
      const name = str(fields.business_name || fields.name || primary.name, "New contact");
      const rec: any = {
        id: String(id),
        name,
        contact: str(primary.name || fields.name || name),
        kind: fields.company_type === "individual" ? "residential" : "commercial",
        email: str(fields.email || primary.email),
        city: str(fields.city, seed.business.address.city),
        country: seed.business.address.country,
        contactId: String(contactId),
        category: [],
        subcategoryId: 149,
        typical: [0, 0],
      };
      list.unshift(rec);
      return ok({ client_id: id, id, primary_contact: contactId });
    }
    if (tail && (m === "PUT" || m === "PATCH" || m === "POST")) {
      const id = tail.split("/")[0];
      const rec: any = findClient(seed, id);
      if (!rec) return fail("That contact no longer exists.");
      const name = fields.business_name || fields.name;
      if (name) rec.name = str(name);
      if (fields.email !== undefined) rec.email = str(fields.email);
      if (fields.city !== undefined) rec.city = str(fields.city);
      return ok({ client_id: Number(rec.id), id: Number(rec.id) });
    }
  }
  if (/^\/contact(\/|$)/.test(path)) {
    const id = path.split("/")[2];
    if (isDelete || m === "PUT" || m === "PATCH") {
      const rec: any = [...seed.clients, ...seed.suppliers].find((c: any) => String(c.contactId) === id);
      if (rec && !isDelete) {
        if (fields.name) rec.contact = str(fields.name);
        if (fields.email !== undefined) rec.email = str(fields.email);
      }
      return ok({ id: Number(id) || 0 });
    }
    if (m === "POST") return ok({ id: nextId([], [], 900), contact_id: nextId([], [], 900) });
  }

  /* ---- Invoices -------------------------------------------------------- */
  if (path === "/invoice/add" || path === "/invoice/edit") {
    const editing = path === "/invoice/edit";
    const items = lineItems(fields, rate);
    const { subTotal, tax, total } = totalsFrom(fields, items, rate);
    const client = findClient(seed, fields.client_id);
    const due = str(fields.due_date, today);
    const existing: any = editing
      ? (seed.invoices as any[]).find((i) => String(i.invoice_id) === String(fields.id ?? fields.invoice_id))
      : null;
    if (editing && !existing) return fail("That invoice no longer exists.");
    const id = existing ? existing.invoice_id : nextId(seed.invoices as any[], ["invoice_id", "id"], 1000);
    const paid = existing ? num(existing.paid_amount) : 0;
    const remaining = Math.max(0, round2(total - paid));
    const status = existing && remaining === 0 ? "paid" : due < today ? "overdue" : "due";
    const rec: any = {
      ...(existing ?? {}),
      invoice_id: id,
      id,
      invoice_no: str(fields.invoice_no, `INV-${id}`),
      client_id: Number(client?.id ?? fields.client_id ?? 0),
      client: clientSummary(client),
      selected_contact: Array.isArray(fields.selected_contact) && fields.selected_contact.length
        ? fields.selected_contact.map((p: any, i: number) => ({ id: Number(p.id) || i + 1, name: p.name, email: p.email, is_primary: i === 0 ? 1 : 0 }))
        : client
          ? [{ id: Number(client.contactId), name: client.contact, email: client.email, is_primary: 1 }]
          : [],
      invoice_date: str(fields.invoice_date, today),
      due_date: due,
      status,
      mark_as: status,
      total,
      sub_total: subTotal,
      tax_amount: tax,
      paid_amount: paid,
      remainingAmount: remaining,
      description: str(fields.description, existing?.description ?? ""),
      notes: str(fields.notes, existing?.notes ?? ""),
      invoice_items: items,
      items,
      created_at: existing?.created_at ?? today,
    };
    if (existing) Object.assign(existing, rec);
    else (seed.invoices as any[]).unshift(rec);
    return ok({ invoice_id: id, id });
  }
  if (/^\/invoice\/(bulk-delete|delete)/.test(path) || (m === "DELETE" && path.startsWith("/invoice/"))) {
    const ids = idsFrom(fields, path);
    const removed = removeWhere(seed.invoices as any[], (i) => ids.includes(String(i.invoice_id)) || ids.includes(String(i.id)));
    return ok(null, { message: `${removed} invoice(s) deleted.` });
  }

  /* ---- Quotes ---------------------------------------------------------- */
  if ((m === "POST" && path === "/v2/quote") || (m === "PUT" && path.startsWith("/v2/quote/"))) {
    const editing = m === "PUT";
    const items = lineItems(fields, rate);
    const { subTotal, tax, total } = totalsFrom(fields, items, rate);
    const client = findClient(seed, fields.client_id);
    const editId = editing ? path.split("/").pop() : null;
    const existing: any = editing ? (seed.quotes as any[]).find((q) => String(q.quote_id) === editId) : null;
    if (editing && !existing) return fail("That quote no longer exists.");
    const id = existing ? existing.quote_id : nextId(seed.quotes as any[], ["quote_id", "id"], 2000);
    const rec: any = {
      ...(existing ?? {}),
      quote_id: id,
      id,
      quote_no: str(fields.quote_no ?? fields.quote_number, existing?.quote_no ?? `Q-${id}`),
      client_id: Number(client?.id ?? fields.client_id ?? 0),
      client: { client_id: Number(client?.id ?? 0), name: client?.name ?? "Walk-in customer", email: client?.email ?? "" },
      quote_date: str(fields.quote_date ?? fields.date, existing?.quote_date ?? today),
      valid_till: str(fields.valid_till ?? fields.expiry_date, existing?.valid_till ?? today),
      status: existing?.status ?? "sent",
      sent_at: existing ? existing.sent_at : `${today}T09:00:00.000Z`,
      saved_at: existing ? existing.saved_at : `${today}T09:00:00.000Z`,
      converted: existing?.converted ?? 0,
      total,
      sub_total: subTotal,
      tax_amount: tax,
      currency_code: existing?.currency_code ?? str(fields.currency_code, seed.business.currency),
      description: str(fields.description, existing?.description ?? ""),
      items,
      created_at: existing?.created_at ?? today,
    };
    if (existing) Object.assign(existing, rec);
    else (seed.quotes as any[]).unshift(rec);
    return ok({ quote_id: id, id });
  }
  if (/^\/(v2\/)?quote(\/bulk-delete)?/.test(path) && isDelete) {
    const ids = idsFrom(fields, path);
    const removed = removeWhere(seed.quotes as any[], (q) => ids.includes(String(q.quote_id)) || ids.includes(String(q.id)));
    return ok(null, { message: `${removed} quote(s) deleted.` });
  }

  /* ---- Expenses -------------------------------------------------------- */
  if (path === "/v2/expense" || path === "/v2/expense/" || path === "/v2/expense/edit") {
    const editing = path === "/v2/expense/edit";
    const existing: any = editing
      ? (seed.expenses as any[]).find((e) => String(e.expense_id) === String(fields.id))
      : null;
    if (editing && !existing) return fail("That expense no longer exists.");
    const supplier: any = findClient(seed, fields.client_id);
    const price = num(fields.price, existing ? num(existing.price) : 0);
    const id = existing ? existing.expense_id : nextId(seed.expenses as any[], ["expense_id", "id"], 3000);
    const subId = num(fields.account_subcategory_id, existing?.account_subcategory_id ?? 149);
    const rec: any = {
      ...(existing ?? {}),
      expense_id: id,
      id,
      name: str(fields.name, existing?.name ?? "Expense"),
      date: str(fields.date, existing?.date ?? today),
      price: String(price),
      remainingAmount: existing?.remainingAmount ?? String(price),
      is_reconciled: existing?.is_reconciled ?? 0,
      account_subcategory_id: subId,
      account_subcategory: { account_subcategory_id: subId, name: existing?.account_subcategory?.name ?? "General expenses" },
      client_id: Number(supplier?.id ?? existing?.client_id ?? 0),
      client: supplier ? { client_id: Number(supplier.id), name: supplier.name, email: supplier.email } : (existing?.client ?? { client_id: 0, name: "" }),
      tax_amount: fields.gst === 0 || fields.gst === "0" ? 0 : round2(price - price / (1 + rate / 100)),
      created_at: existing?.created_at ?? today,
    };
    if (existing) Object.assign(existing, rec);
    else (seed.expenses as any[]).unshift(rec);
    return ok({ id });
  }
  if (path === "/v2/expense/bulk-delete" || (m === "DELETE" && path.startsWith("/v2/expense"))) {
    const ids = idsFrom(fields, path);
    const before = (seed.expenses as any[]).length;
    const reconciled = (seed.expenses as any[]).filter((e) => ids.includes(String(e.expense_id)) && Number(e.is_reconciled) === 1).length;
    removeWhere(seed.expenses as any[], (e) => ids.includes(String(e.expense_id)) && Number(e.is_reconciled) !== 1);
    const deleted = before - (seed.expenses as any[]).length;
    return ok(null, {
      message: `${deleted} expense(s) deleted.${reconciled ? ` ${reconciled} reconciled expense(s) skipped.` : ""}`,
    });
  }

  /* ---- Price list / inventory ----------------------------------------- */
  if (path === "/custom-product" || path.startsWith("/custom-product/")) {
    const tail = path.replace(/^\/custom-product\/?/, "");
    if (tail === "" && m === "POST") {
      const id = nextId(seed.customProducts as any[], ["id"], 399);
      const tracked = fields.inventory_flag === 1 || fields.inventory_flag === "1" || fields.is_inventory === 1;
      const rec: any = {
        id,
        item_name: str(fields.item_name ?? fields.name, "New item"),
        sku: str(fields.sku, `ITEM-${id}`),
        txn_type: "Credit",
        qty_type: str(fields.qty_type, "items"),
        selling_price: num(fields.selling_price ?? fields.price),
        cost_price: num(fields.cost_price),
        purchase_tax_rate: str(fields.purchase_tax_rate, ""),
        sale_tax_rate: str(fields.sale_tax_rate, ""),
        gst: fields.gst === 0 ? 0 : 1,
        gst_percentage: num(fields.gst_percentage, rate),
        inventory_flag: tracked ? 1 : 0,
        is_inventory: tracked ? 1 : 0,
        inventory_count: tracked ? num(fields.inventory_count ?? fields.opening_stock) : null,
        low_stock_threshold: tracked ? num(fields.low_stock_threshold) : null,
        purchase_description: str(fields.purchase_description),
        sale_description: str(fields.sale_description),
        created_at: today,
      };
      (seed.customProducts as any[]).unshift(rec);
      return ok(rec);
    }
    if (tail && (m === "PATCH" || m === "PUT" || m === "POST") && !isDelete) {
      const rec: any = (seed.customProducts as any[]).find((p) => String(p.id) === tail);
      if (!rec) return fail("That item no longer exists.");
      const map: Record<string, string> = { item_name: "item_name", name: "item_name", sku: "sku", selling_price: "selling_price", cost_price: "cost_price", qty_type: "qty_type", sale_description: "sale_description", purchase_description: "purchase_description", low_stock_threshold: "low_stock_threshold" };
      for (const [from, to] of Object.entries(map)) if (fields[from] !== undefined) rec[to] = ["selling_price", "cost_price", "low_stock_threshold"].includes(to) ? num(fields[from]) : str(fields[from]);
      if (fields.inventory_count !== undefined) rec.inventory_count = num(fields.inventory_count);
      return ok(rec);
    }
    if (tail && isDelete) {
      removeWhere(seed.customProducts as any[], (p) => String(p.id) === tail);
      return ok(null, { message: "Item deleted." });
    }
  }

  return null;
}
