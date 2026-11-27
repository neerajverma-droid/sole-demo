/* eslint-disable @typescript-eslint/no-explicit-any -- builds loosely typed mock API payloads, like mock-server.ts */
import type { SeedData } from "../generator";
import type { DemoHandler } from "./types";

/*
 * Quick actions, including AI transactions.
 *
 * The Quick actions deck builds an "approve these AI-categorised bank lines" card from
 * unmatched bank lines whose prediction carries a category AND a client (or a document to
 * match to). The generic mock only had five unmatched lines with no client, so the card never
 * appeared. Here the unmatched lines are generated from the business's own books:
 *
 *   - lines the model paired with an existing unpaid expense or invoice (one-tap match),
 *   - category + supplier suggestions it is confident about (one-tap approve), and
 *   - a few it is unsure of (no client), which the card reports as "needs your eye".
 *
 * Approving or rejecting changes the books, so the deck, the bank feed and the reports stay
 * consistent. Everything is derived from `seed` deterministically.
 */

const prepared = new WeakSet<object>();
let TODAY = new Date().toISOString().slice(0, 10);
/** asset id -> the bank line it is matched to (per visit). */
const assetMatches = new WeakMap<object, Map<string, number>>();

const monthsBack = (months: number) => {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function subcategoryName(seed: SeedData, id: number): string {
  for (const category of seed.accountCategories as any[]) {
    for (const sub of category.account_subcategories as any[]) {
      if (Number(sub.account_subcategory_id) === id) return String(sub.name);
    }
  }
  return "General expenses";
}

function nextId(list: any[], keys: string[], floor: number): number {
  return list.reduce((max, row) => Math.max(max, ...keys.map((k) => Number(row?.[k]) || 0)), floor) + 1;
}

/** Add the AI-suggestion bank lines once per seed (idempotent, deterministic). */
function prepare(seed: SeedData) {
  if (prepared.has(seed)) return;
  prepared.add(seed);

  const lines = seed.bankTransactions as any[];
  // The seed's own unmatched lines (fees, a fuel stop, a merchant settlement…) get a modest guess.
  for (const line of lines) {
    if (!line.is_reconciled && !line.ai) {
      line.ai = {
        kind: "unsure",
        confidence: 0.62,
        reason: "partial description match",
        subcategoryId: line.direction === "credit" ? 101 : 142,
        alternativeId: line.direction === "credit" ? 102 : 141,
        amount: line.amount,
      };
    }
  }
  const bank = seed.business.bank_name;
  let id = Math.max(5300, ...lines.map((l) => Number(l.id) || 0)) + 1;
  const push = (line: Record<string, any>): number => {
    const lineId = id++;
    lines.push({
      id: lineId,
      bank_transaction_id: lineId,
      bank_name: bank,
      account_subcategory_id: 0,
      is_reconciled: false,
      status: "unreconciled",
      ...line,
    });
    return lineId;
  };

  // 1. Unpaid expenses the model has paired with a bank line.
  const openExpenses = (seed.expenses as any[]).filter((e) => Number(e.is_reconciled) === 0).slice(0, 6);
  for (const expense of openExpenses) {
    const amount = Number(expense.price);
    push({
      transaction_date: expense.date,
      date: expense.date,
      amount,
      direction: "debit",
      type: "debit",
      description: `${expense.client?.name ?? "Supplier"} ${expense.name}`.slice(0, 60),
      ai: {
        kind: "expense",
        confidence: 0.96,
        reason: `matched on: ${expense.client?.name ?? "supplier"}, amount ${amount.toFixed(2)}`,
        documentId: expense.expense_id,
        reference: `EXP-${expense.expense_id}`,
        clientId: expense.client_id,
        clientName: expense.client?.name ?? "",
        subcategoryId: expense.account_subcategory_id,
        amount,
      },
    });
  }

  // 2. Unpaid invoices a customer's deposit has been paired with.
  const openInvoices = (seed.invoices as any[]).filter((i) => i.status === "due" || i.status === "overdue").slice(0, 4);
  for (const invoice of openInvoices) {
    const amount = Number(invoice.remainingAmount || invoice.total);
    push({
      transaction_date: invoice.due_date,
      date: invoice.due_date,
      amount,
      direction: "credit",
      type: "credit",
      description: `Direct Deposit ${invoice.invoice_no} ${invoice.client?.name ?? ""}`.trim(),
      ai: {
        kind: "invoice",
        confidence: 0.98,
        reason: `matched on: ${invoice.invoice_no}, ${invoice.client?.name ?? "client"}`,
        documentId: invoice.invoice_id,
        reference: invoice.invoice_no,
        clientId: invoice.client_id,
        clientName: invoice.client?.name ?? "",
        subcategoryId: 101,
        amount,
      },
    });
  }

  // 3. Confident category + supplier suggestions (no existing document).
  const today = (seed.invoices[0] as any)?.created_at ?? "";
  const regulars = (seed.suppliers as any[]).filter((s) => [143, 144, 145, 147, 141, 142].includes(s.subcategoryId)).slice(0, 6);
  regulars.forEach((supplier, i) => {
    const amount = round2(Math.max(18, supplier.typical[0] + ((supplier.typical[1] - supplier.typical[0]) * ((i * 37) % 100)) / 100));
    const date = (seed.expenses as any[])[0]?.date ?? today;
    push({
      transaction_date: date,
      date,
      amount,
      direction: "debit",
      type: "debit",
      description: `${String(supplier.name).toUpperCase()} ${String(1000 + i * 137)}`,
      ai: {
        kind: "category",
        confidence: 0.9 - i * 0.02,
        reason: `matched on: ${supplier.name}`,
        clientId: supplier.id,
        clientName: supplier.name,
        subcategoryId: supplier.subcategoryId,
        amount,
        alternativeId: supplier.subcategoryId === 141 ? 142 : 141,
      },
    });
  });

  // 3b. The asset register: the first two assets were paid from the bank and matched; the rest
  // have a bank line waiting (the "AI match" on the register, and a document suggestion).
  const matches = new Map<string, number>();
  assetMatches.set(seed, matches);
  (seed.assets as any[]).forEach((asset, i) => {
    const date = monthsBack(Number(asset.monthsAgo) || 3);
    const description = `${asset.supplier ?? asset.brand} ${asset.name}`.slice(0, 60);
    if (i < 2) {
      const lineId = push({
        transaction_date: date,
        date,
        amount: asset.price,
        direction: "debit",
        type: "debit",
        description,
        is_reconciled: true,
        status: "reconciled",
        matched_entity_type: "asset",
        matched_entity_id: asset.id,
        ai: { kind: "none" },
      });
      matches.set(String(asset.id), lineId);
    } else {
      push({
        transaction_date: date,
        date,
        amount: asset.price,
        direction: "debit",
        type: "debit",
        description,
        ai: {
          kind: "asset",
          confidence: 0.93,
          reason: `matched on: ${asset.brand}, amount ${Number(asset.price).toFixed(2)}`,
          documentId: asset.id,
          reference: asset.name,
          clientId: 0,
          clientName: asset.supplier ?? asset.brand,
          subcategoryId: asset.category === "Vehicle" ? 15 : 14,
          amount: asset.price,
        },
      });
    }
  });

  // 4. Lines the model is unsure about: no client, a low-confidence guess.
  const unsure = [
    { description: "SQ *MARKET STALL 4421", amount: 64.5, subcategoryId: 149 },
    { description: "PAYPAL *TRANSFER 0381", amount: 212.0, subcategoryId: 149 },
    { description: "EFTPOS CASH OUT", amount: 150.0, subcategoryId: 149 },
  ];
  unsure.forEach((u, i) => {
    const date = (seed.expenses as any[])[i]?.date ?? today;
    push({
      transaction_date: date,
      date,
      amount: u.amount,
      direction: "debit",
      type: "debit",
      description: u.description,
      ai: { kind: "unsure", confidence: 0.55, reason: "no clear match", subcategoryId: u.subcategoryId, amount: u.amount, alternativeId: 141 },
    });
  });
}

/** The unmatched bank lines, newest first. */
function unmatched(seed: SeedData): any[] {
  prepare(seed);
  return (seed.bankTransactions as any[])
    .filter((l) => !l.is_reconciled)
    .sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)));
}

function prediction(seed: SeedData, line: any) {
  const ai = line.ai;
  if (!ai || ai.kind === "none") return null;
  const primary = Number(ai.subcategoryId) || (line.direction === "credit" ? 101 : 149);
  const alt = Number(ai.alternativeId) || (line.direction === "credit" ? 102 : 142);
  const isDocument = ai.kind === "expense" || ai.kind === "invoice" || ai.kind === "asset";
  return {
    prediction_id: Number(line.id),
    type: isDocument ? ai.kind : "category",
    document: isDocument
      ? { type: ai.kind, id: ai.documentId, reference: ai.reference, amount: ai.amount, client_name: ai.clientName }
      : null,
    client: ai.clientId ? { client_id: Number(ai.clientId), name: ai.clientName } : null,
    account_subcategory_id: primary,
    account_category_id: line.direction === "credit" ? 3 : 4,
    name: subcategoryName(seed, primary),
    confidence: round2(ai.confidence),
    reason: ai.reason,
    model_name: "sole-classifier",
    alternatives: [{ account_subcategory_id: alt, name: subcategoryName(seed, alt), confidence: round2(Math.max(0.2, ai.confidence - 0.14)) }],
  };
}

const bankRow = (seed: SeedData, line: any) => ({
  bank_transacton_id: line.id,
  transaction_id: line.id,
  bank_account_id: "1",
  bank_name: line.bank_name || seed.business.bank_name,
  source: "bank_feed",
  amount: line.amount,
  description: line.description,
  user_description: line.description,
  direction: line.direction || line.type,
  type: line.direction || line.type,
  transaction_date: line.transaction_date || line.date,
  available_amount: line.amount,
  gst_exclude: 0,
  classification_prediction: prediction(seed, line),
});

const ok = (message = "", extra: Record<string, unknown> = {}) => ({
  status: 200,
  data: { success: true, message, ...extra },
});
const fail = (message: string) => ({ status: 200, data: { success: false, message, data: null } });

function reconcile(line: any, entityType: string, entityId: unknown) {
  line.is_reconciled = true;
  line.status = "reconciled";
  line.matched_entity_type = entityType;
  line.matched_entity_id = entityId;
  line.ai = { kind: "none" };
}

/** Approve one line as the model suggested: match its document, or book it to the chosen category and supplier. */
function approveLine(seed: SeedData, line: any, input: { categoryId?: unknown; clientId?: unknown; gstIncluded?: boolean }, today: string, rate: number) {
  const ai = line.ai ?? {};
  if (ai.kind === "expense") {
    const expense = (seed.expenses as any[]).find((e) => e.expense_id === ai.documentId);
    if (expense) {
      expense.is_reconciled = 1;
      expense.remainingAmount = "0";
    }
    reconcile(line, "expense", ai.documentId);
    return;
  }
  if (ai.kind === "asset") {
    assetMatches.get(seed)?.set(String(ai.documentId), Number(line.id));
    reconcile(line, "asset", ai.documentId);
    return;
  }
  if (ai.kind === "invoice") {
    const invoice = (seed.invoices as any[]).find((i) => i.invoice_id === ai.documentId);
    if (invoice) {
      invoice.status = "paid";
      invoice.mark_as = "paid";
      invoice.paid_amount = invoice.total;
      invoice.remainingAmount = 0;
    }
    reconcile(line, "invoice", ai.documentId);
    return;
  }
  // A category + supplier approval books a new, already reconciled expense (or income line for a credit).
  const supplier: any = [...(seed.suppliers as any[]), ...(seed.clients as any[])].find((c) => String(c.id) === String(input.clientId ?? ai.clientId));
  const subId = Number(input.categoryId) || Number(ai.subcategoryId) || 149;
  if (line.direction !== "credit") {
    const id = nextId(seed.expenses as any[], ["expense_id", "id"], 3000);
    (seed.expenses as any[]).unshift({
      expense_id: id,
      id,
      name: String(line.description),
      date: line.transaction_date || today,
      price: String(line.amount),
      remainingAmount: "0",
      is_reconciled: 1,
      account_subcategory_id: subId,
      account_subcategory: { account_subcategory_id: subId, name: subcategoryName(seed, subId) },
      client_id: Number(supplier?.id ?? 0),
      client: supplier ? { client_id: Number(supplier.id), name: supplier.name, email: supplier.email } : { client_id: 0, name: "" },
      tax_amount: input.gstIncluded === false ? 0 : round2(Number(line.amount) - Number(line.amount) / (1 + rate / 100)),
      created_at: today,
    });
    reconcile(line, "expense", id);
    return;
  }
  reconcile(line, "income", subId);
}

const idOf = (v: unknown) => String(typeof v === "object" && v ? (v as any).id ?? (v as any).transaction_id : v);

const ASSET_TYPE_ID: Record<string, string> = { Vehicle: "1", Tools: "2", Equipment: "3", Technology: "4" };

/** An asset as the register's API sends it, with its bank-match state. */
function assetRow(seed: SeedData, asset: any) {
  prepare(seed);
  const lineId = assetMatches.get(seed)?.get(String(asset.id));
  const line = lineId ? (seed.bankTransactions as any[]).find((l) => Number(l.id) === lineId) : null;
  const matched = Boolean(line);
  const purchased = monthsBack(Number(asset.monthsAgo) || 3);
  return {
    id: Number(asset.id),
    asset_id: Number(asset.id),
    name: asset.name,
    price: asset.price,
    asset_type: asset.type,
    asset_type_id: ASSET_TYPE_ID[asset.category] ?? "3",
    asset_brand_id: null,
    date_of_purchase: purchased,
    is_depreciation: 1,
    depreciation_method: asset.method,
    depreciation_start_date: purchased,
    effective_life_years: asset.life,
    depreciation_rate: Math.round(100 / (Number(asset.life) || 1)),
    residual_value: 0,
    gst: 1,
    paid_with_cash: 0,
    serial_no: asset.serial,
    model_no: "",
    asset_status: "active",
    inventory_flag: 0,
    client: asset.supplier ? { name: asset.supplier } : null,
    account_subcategory_id: asset.category === "Vehicle" ? 15 : 14,
    is_reconciled: matched ? 1 : 0,
    remainingAmount: matched ? 0 : asset.price,
    possible_match: matched ? 0 : 1,
    matched_journal_entries: matched
      ? [{ journal_entry_id: lineId, bank_transaction_id: lineId, transaction_description: line.description, matched_amount: asset.price, matched_at: line.transaction_date }]
      : [],
  };
}

export const handle: DemoHandler = (ctx) => {
  TODAY = ctx.today;
  const { method, path, params, seed } = ctx;
  const rate = ctx.cfg.taxRate;

  /* ---- Reads ------------------------------------------------------------ */
  if (method === "GET") {
    if (path === "/assets" || path === "/asset") {
      const rows = (seed.assets as any[]).map((a) => assetRow(seed, a));
      return ok("", { data: { asset_details: rows, total: rows.length } });
    }
    const one = /^\/assets?\/(\d+)$/.exec(path);
    if (one) {
      const found = (seed.assets as any[]).find((a) => String(a.id) === one[1]);
      return found ? ok("", { data: assetRow(seed, found) }) : null;
    }
    if (path === "/unibox/assets") {
      return ok("", { data: (seed.assets as any[]).map((a) => assetRow(seed, a)).filter((a) => !a.is_reconciled) });
    }

    // The match dialog's candidates: the bank lines this record could be matched to.
    const possible = /^\/possible-matches\/([^/]+)\/([^/]+)$/.exec(path);
    if (possible) {
      const [, type, entryId] = possible;
      const multiple = String(params.multiple_match_mode ?? "") === "true";
      let remaining = 0;
      if (type === "asset") {
        const asset = (seed.assets as any[]).find((a) => String(a.id) === entryId);
        remaining = asset && !assetMatches.get(seed)?.has(String(asset.id)) ? Number(asset.price) : 0;
      } else if (type === "expense") {
        const expense = (seed.expenses as any[]).find((e) => String(e.expense_id) === entryId);
        remaining = expense ? Number(expense.remainingAmount ?? expense.price) : 0;
      } else if (type === "invoice") {
        const invoice = (seed.invoices as any[]).find((i) => String(i.invoice_id) === entryId);
        remaining = invoice ? Number(invoice.remainingAmount ?? invoice.total) : 0;
      } else {
        return null;
      }
      const wantCredit = type === "invoice";
      const list = unmatched(seed)
        .filter((l) => (l.direction === "credit") === wantCredit)
        .filter((l) => multiple || Number(l.amount) <= remaining + 0.005)
        .slice(0, 20)
        .map((l) => ({ id: l.id, transaction_date: l.transaction_date, description: l.description, reference: "", amount: l.amount, available_amount: l.amount }));
      return ok("", { data: { list, expense_remaining_amount: remaining, asset_remaining_amount: remaining } });
    }

    if (path === "/v2/bank/bank-transactions") {
      const page = Number(params.page) || 1;
      const pageSize = Number(params.pageSize || params.page_size || params.limit) || 50;
      const search = String(params["filter_by[search]"] || params.search || "").toLowerCase();
      let rows = unmatched(seed);
      if (search) rows = rows.filter((t) => String(t.description).toLowerCase().includes(search));
      const start = (page - 1) * pageSize;
      return ok("", {
        data: { bank_transactions: { bank_transaction_details: rows.slice(start, start + pageSize).map((l) => bankRow(seed, l)), total: rows.length } },
      });
    }

    if (path === "/v2/classification/summary") {
      const rows = unmatched(seed);
      const confident = rows.filter((l) => l.ai && l.ai.kind !== "unsure" && l.ai.kind !== "none").length;
      return ok("", { data: { pending: rows.length, confident, confidence_threshold: 0.8 } });
    }

    if (path === "/unibox/bank-transactions") {
      return ok("", {
        data: unmatched(seed)
          .slice(0, 12)
          .map((l) => ({
            id: l.id,
            bank_transacton_id: l.id,
            transaction_id: l.id,
            bank_account_id: "1",
            bank_name: l.bank_name,
            description: l.description,
            user_description: l.description,
            direction: l.direction,
            transaction_date: l.transaction_date,
            amount: l.amount,
            available_amount: l.amount,
            status: "unreconciled",
          })),
      });
    }

    if (path === "/unibox/invoices") {
      const status = String(params.status ?? "");
      const invoices = seed.invoices as any[];
      const soon = ctx.today;
      const inSevenDays = new Date(new Date(`${soon}T12:00:00Z`).getTime() + 7 * 86400000).toISOString().slice(0, 10);
      let rows: any[];
      if (status === "draft") rows = invoices.filter((i) => i.status === "draft");
      else if (status === "overdue") rows = invoices.filter((i) => i.status === "overdue" || (i.status === "due" && i.due_date < soon));
      else if (status === "due_soon") rows = invoices.filter((i) => i.status === "due" && i.due_date >= soon && i.due_date <= inSevenDays);
      else rows = invoices.filter((i) => i.status === "due" || i.status === "overdue" || i.status === "draft");
      return ok("", { data: rows.slice(0, 8) });
    }

    if (path === "/unibox/expenses") {
      prepare(seed);
      const open = (seed.expenses as any[]).filter((e) => Number(e.is_reconciled) === 0).slice(0, 8);
      // An expense a bank line is paired with gets the AI match button.
      const paired = new Set((seed.bankTransactions as any[]).filter((l) => !l.is_reconciled && l.ai?.kind === "expense").map((l) => l.ai.documentId));
      return ok("", {
        data: open.map((e) => ({ ...e, id: e.expense_id, contact: e.client?.name, remaining_amount: e.remainingAmount, possible_match: paired.has(e.expense_id) ? 1 : 0 })),
      });
    }

    if (path === "/unibox/priorities") {
      const items: any[] = [];
      const overdue = (seed.invoices as any[]).filter((i) => i.status === "overdue").slice(0, 2);
      for (const invoice of overdue) {
        items.push({
          id: `inv-${invoice.invoice_id}`,
          type: "overdue_invoice",
          resource_type: "invoice",
          entity_id: invoice.invoice_id,
          action: { key: "send_reminder", label: "Send reminder" },
          data: { id: invoice.invoice_id, invoice_no: invoice.invoice_no, status: "overdue", mark_as: "overdue", due_date: invoice.due_date, total: invoice.total, client: invoice.client },
        });
      }
      const lines = unmatched(seed).slice(0, 2);
      for (const line of lines) {
        items.push({
          id: `bank-${line.id}`,
          type: "unmatched_bank_line",
          resource_type: "bank_feed",
          entity_id: line.id,
          action: { key: "match", label: "Match" },
          data: { id: line.id, description: line.description, amount: line.amount, direction: line.direction, transaction_date: line.transaction_date },
        });
      }
      return ok("", { data: { items, count: items.length, limit: 5 } });
    }

    if (path === "/unibox/progress") {
      const lines = unmatched(seed);
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      return ok("", {
        data: {
          health: { score: 86, status: "Healthy", to_action: lines.length },
          streak: { current: 14, level: "Steady", next_level: "Consistent", to_next_level: 6, progress_percent: 70 },
          activity: {
            counts: [4, 6, 3, 7, 5, 1, 2],
            days,
            total_this_week: 28,
            comparison: { direction: "ahead", label: "6 more than last week" },
          },
          recent_actions: [
            { id: 1, title: "Matched a bank payment to an invoice", date: ctx.today },
            { id: 2, title: "Approved 4 AI category suggestions", date: ctx.today },
            { id: 3, title: "Sent a quote", date: ctx.today },
          ],
        },
      });
    }
    return null;
  }

  /* ---- Writes ----------------------------------------------------------- */
  if (method !== "POST") return null;

  if (path === "/unibox/action" || /^\/unibox\/(invoices|quotes)\/[^/]+\/send$/.test(path)) {
    return ok("Done.");
  }

  if (path === "/v2/bank/transaction-detail-match") {
    prepare(seed);
    const body = ctx.fields();
    const rows: any[] = Array.isArray(body.transactions) ? body.transactions : [body];
    let approved = 0;
    for (const row of rows) {
      const line = (seed.bankTransactions as any[]).find((l) => String(l.id) === idOf(row.transaction_id));
      if (!line || line.is_reconciled) continue;
      approveLine(seed, line, { categoryId: row.account_subcategory_id ?? row.category_id, clientId: row.client_id ?? row.supplier_id, gstIncluded: String(row.gst_included ?? row.gst) !== "0" }, ctx.today, rate);
      approved++;
    }
    return approved ? ok(approved > 1 ? `${approved} transactions approved.` : "Transaction approved successfully.") : fail("That transaction is no longer available.");
  }

  if (path === "/v2/bank-transaction/match-invoice" || path === "/v2/bank-transaction/match-asset-expense") {
    prepare(seed);
    const body = ctx.fields();
    const line = (seed.bankTransactions as any[]).find((l) => String(l.id) === idOf(body.bank_transaction_id));
    if (!line) return fail("That transaction is no longer available.");
    const isInvoice = path.endsWith("match-invoice");
    const docId = (isInvoice ? body.invoices : body.expenses ?? body.assets)?.[0];
    if (isInvoice) {
      const invoice = (seed.invoices as any[]).find((i) => String(i.invoice_id) === String(docId));
      if (invoice) {
        invoice.status = "paid";
        invoice.mark_as = "paid";
        invoice.paid_amount = invoice.total;
        invoice.remainingAmount = 0;
      }
      reconcile(line, "invoice", docId);
    } else if (body.assets) {
      assetMatches.get(seed)?.set(String(docId), Number(line.id));
      reconcile(line, "asset", docId);
    } else {
      const expense = (seed.expenses as any[]).find((e) => String(e.expense_id) === String(docId));
      if (expense) {
        expense.is_reconciled = 1;
        expense.remainingAmount = "0";
      }
      reconcile(line, "expense", docId);
    }
    return ok("Transaction matched successfully.");
  }

  if (path === "/v2/bank-transaction/ai-suggestion-action") {
    prepare(seed);
    const body = ctx.fields();
    const ids: string[] = (Array.isArray(body.transaction_ids) ? body.transaction_ids : []).map(idOf);
    let rejected = 0;
    for (const line of seed.bankTransactions as any[]) {
      if (ids.includes(String(line.id)) && !line.is_reconciled) {
        line.ai = { kind: "none" };
        rejected++;
      }
    }
    return ok(`${rejected} suggestion${rejected === 1 ? "" : "s"} rejected.`);
  }

  return null;
};
