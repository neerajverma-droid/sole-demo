/**
 * Deterministic seed generator for a demo business.
 *
 * Takes a Story (one industry in one country) and produces every dataset the
 * mock API serves. The default story is the hand-built Coastal Spark
 * Electrical (AU); `buildStory` produces the rest from industry templates.
 */

import { getCountryConfig } from "./country";
import { deriveNarrative } from "./derive-narrative";
import { legacyNarrative } from "./legacy-narrative";
import { buildProjectRecords } from "./projects-data";
import { defaultStory, type Story } from "./story";
import { makeDates, makeRng } from "./util";

type Narrative = ReturnType<typeof legacyNarrative>;

export function generateSeedData(story: Story = defaultStory, anchor: Date = new Date()) {
  const { business, clients, suppliers, services, projects, vehicle, assets, employees } = story;
  const rawInventoryProducts = story.inventory;
  const cfg = getCountryConfig(story.country);
  const taxRate = cfg.taxRate;
  const taxFactor = taxRate / 100;
  const taxLabel = `${cfg.taxName} (${taxRate}%)`;
  const dates = makeDates(anchor);
  const { addDaysIso, addMonthsIso, today } = dates;
  const rng = makeRng(story.seed);
  const rngInt = rng.int;
  const rngPick = rng.pick;
  const rngChance = rng.chance;
  const rngMoney = rng.money;
  const ndisBusiness = Number(business.industry_id) === 9 && cfg.features.ndis === true;
  const bankDetails = business.bsb
    ? `BSB ${business.bsb} Acc ${business.account_number}`
    : `Acc ${business.account_number}`;

  /* ------------------------------------------------------------------ *
   * Price List / Custom Products & Tracked Inventory
   * ------------------------------------------------------------------ */
  const customProducts = [
    ...rawInventoryProducts.map((p) => ({
      id: Number(p.id),
      item_name: p.name,
      sku: p.sku,
      txn_type: "Credit",
      qty_type: p.unit,
      selling_price: p.selling_price,
      cost_price: p.cost_price,
      purchase_tax_rate: taxLabel,
      sale_tax_rate: taxLabel,
      gst: 1,
      gst_percentage: taxRate,
      inventory_flag: 1,
      is_inventory: 1,
      inventory_count: p.inventory_count,
      low_stock_threshold: p.low_stock_threshold,
      purchase_description: p.purchase_description,
      sale_description: p.sale_description,
      created_at: addMonthsIso(-6),
    })),
    ...services.map((service) => ({
      id: Number(service.id),
      item_name: service.name,
      sku: `SRV-${service.id}`,
      txn_type: "Credit",
      qty_type: service.unit,
      selling_price: service.price,
      cost_price: 0,
      purchase_tax_rate: taxLabel,
      sale_tax_rate: taxLabel,
      gst: 1,
      gst_percentage: taxRate,
      inventory_flag: 0,
      is_inventory: 0,
      inventory_count: null,
      low_stock_threshold: null,
      purchase_description: "",
      sale_description: service.name,
      created_at: addMonthsIso(-6),
    })),
  ];

  /* ------------------------------------------------------------------ *
   * Invoices (Sales)
   * ~55 invoices across 6 months
   * ------------------------------------------------------------------ */
  const invoices: any[] = [];
  let invId = 1001;

  // Generate invoices for each client
  for (let m = -6; m <= 0; m++) {
    for (const client of clients) {
      if (m === 0 && rngChance(0.4)) continue; // current month: only some billed yet
      if (m < 0 && rngChance(0.3)) continue; // past months: skip occasionally

      const id = String(invId++);
      const invoiceNo = `INV-${id}`;
      const issueDate = addMonthsIso(m, rngInt(2, 26));
      const termDays = client.kind === "strata" ? 30 : client.kind === "commercial" ? 14 : 7;
      const dueDate = new Date(new Date(issueDate).getTime() + termDays * 86400000).toISOString().slice(0, 10);

      // Lines
      const numLines = rngInt(1, 3);
      const items: any[] = [];
      let subTotal = 0;
      for (let l = 0; l < numLines; l++) {
        const prod = rngPick(customProducts);
        const qty = rngInt(1, prod.qty_type === "hours" ? 6 : 4);
        const linePrice = prod.selling_price;
        const lineNet = Math.round(linePrice * qty * 100) / 100;
        subTotal += lineNet;
        items.push({
          id: String(l + 1),
          invoice_id: id,
          product_id: String(prod.id),
          description: prod.item_name,
          qty: String(qty),
          qty_type: prod.qty_type,
          price: String(linePrice),
          gst: 1,
          gst_percentage: taxRate,
          discount: 0,
          disc_criteria: "percent",
        });
      }

      const taxAmount = Math.round(subTotal * taxFactor * 100) / 100;
      const total = Math.round((subTotal + taxAmount) * 100) / 100;

      // Status
      let status = "paid";
      let remainingAmount = 0;
      let paidAmount = total;

      if (m === 0) {
        if (rngChance(0.4)) {
          status = "due";
          remainingAmount = total;
          paidAmount = 0;
        } else if (rngChance(0.3)) {
          status = "draft";
          remainingAmount = total;
          paidAmount = 0;
        }
      } else if (m === -1 && rngChance(0.15)) {
        status = "overdue";
        remainingAmount = total;
        paidAmount = 0;
      }

      // Statuses must agree with the dates and the money: an unpaid invoice past its due date is
      // overdue, and now and then a customer has paid part of one.
      if (status === "due" && dueDate < today) status = "overdue";
      if (status === "paid" && invId % 13 === 0) {
        paidAmount = Math.round(total * 0.4 * 100) / 100;
        remainingAmount = Math.round((total - paidAmount) * 100) / 100;
        status = "partially_paid";
      }

      invoices.push({
        invoice_id: Number(id),
        id: Number(id),
        invoice_no: invoiceNo,
        client_id: Number(client.id),
        client: {
          client_id: Number(client.id),
          id: Number(client.id),
          name: client.name,
          business_name: client.kind === "residential" ? null : client.name,
          company_type: client.kind === "residential" ? "individual" : "business",
          email: client.email,
          city: client.city,
          country: client.country,
        },
        selected_contact: [
          {
            id: Number(client.contactId),
            name: client.contact,
            email: client.email,
            is_primary: 1,
          },
        ],
        invoice_date: issueDate,
        due_date: dueDate,
        status,
        mark_as: status,
        total,
        sub_total: subTotal,
        tax_amount: taxAmount,
        paid_amount: paidAmount,
        remainingAmount,
        currency_code: cfg.currency,
        currency_symbol: cfg.currencySymbol,
        is_multicurrency: 0,
        description: `${story.incomeCategory} — ${client.name}`,
        notes: `Thanks for choosing ${business.name}. Payment by bank transfer to ${business.bank_name} ${bankDetails}.`,
        invoice_items: items,
        items,
        // The layout the preview renders on: the NDIS layout for an NDIS business, else classic 1.
        template_id: ndisBusiness ? "2" : "17",
        created_at: issueDate,
      });
    }
  }

  // Sort invoices descending by date
  invoices.sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));

  /* ------------------------------------------------------------------ *
   * Quotes
   * ~15 quotes
   * ------------------------------------------------------------------ */
  const quotes: any[] = [];
  let quoteId = 2001;
  // One of each state the Quotes screen shows, repeating: accepted, sent, converted (billed),
  // declined, expired (sent, and past its expiry), saved (finalised, never emailed), draft.
  const quoteKinds = ["accepted", "sent", "converted", "declined", "expired", "saved", "draft", "sent"];
  const billedInvoices = invoices.filter((i) => i.status !== "draft");
  const daysBefore = (iso: string, days: number) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  };

  for (let q = 0; q < 16; q++) {
    const kind = quoteKinds[q % quoteKinds.length];
    // A converted quote is the one an existing invoice was raised from: same client, same lines.
    const source: any = kind === "converted" && billedInvoices.length ? billedInvoices[(q * 3 + 1) % billedInvoices.length] : null;
    const client = (source ? clients.find((c) => Number(c.id) === source.client_id) : null) ?? clients[q % clients.length];
    const id = String(quoteId++);
    const quoteNo = `Q-${id}`;
    const issueDate = source ? daysBefore(source.invoice_date, 9) : addDaysIso(-(q * 11 + 2));
    const validTill =
      kind === "sent" || kind === "saved"
        ? addDaysIso(6 + q)
        : kind === "expired"
          ? addDaysIso(-(q + 3))
          : addDaysIso(-(q * 11 - 18));
    const status = kind === "draft" ? "draft" : kind === "accepted" || kind === "converted" ? "accepted" : kind === "declined" ? "declined" : "sent";

    const prod = customProducts[q % customProducts.length];
    const qty = rngInt(2, 6);
    let subTotal = Math.round(prod.selling_price * qty * 100) / 100;
    let taxAmount = Math.round(subTotal * taxFactor * 100) / 100;
    let total = Math.round((subTotal + taxAmount) * 100) / 100;
    if (source) {
      subTotal = source.sub_total;
      taxAmount = source.tax_amount;
      total = source.total;
    }

    quotes.push({
      quote_id: Number(id),
      id: Number(id),
      quote_no: quoteNo,
      client_id: Number(client.id),
      client: {
        client_id: Number(client.id),
        name: client.name,
        email: client.email,
      },
      quote_date: issueDate,
      valid_till: validTill,
      status,
      converted: kind === "converted" ? 1 : 0,
      invoice_id: source ? source.invoice_id : null,
      invoice: source ? { id: source.invoice_id, invoice_no: source.invoice_no } : null,
      expired: kind === "expired",
      sent_at: kind === "draft" || kind === "saved" ? null : `${issueDate}T09:00:00.000Z`,
      saved_at: kind === "draft" ? null : `${issueDate}T09:00:00.000Z`,
      total,
      sub_total: subTotal,
      tax_amount: taxAmount,
      currency_code: cfg.currency,
      description: `${prod.item_name} for ${client.name}`,
      items: source
        ? source.items.map((it: any) => ({ ...it }))
        : [
            {
              id: "1",
              description: prod.item_name,
              qty: String(qty),
              qty_type: prod.qty_type,
              price: String(prod.selling_price),
              gst: 1,
              gst_percentage: taxRate,
            },
          ],
      template_id: ndisBusiness ? "25" : "21",
      created_at: issueDate,
    });
  }

  /* ------------------------------------------------------------------ *
   * Expenses (Supplier Bills)
   * ~70 bills over 6 months
   * ------------------------------------------------------------------ */
  const expenses: any[] = [];
  let expId = 3001;
  const legacyExpenseDescriptions: Record<string, string[]> = {
    "Middy's Electrical": ["Cable, conduit and fittings", "Switchgear and RCDs", "LED downlights (box of 20)", "Smoke alarms and bases", "Switchboard components"],
    "Bunnings Warehouse": ["Fixings and sundries", "Silicone and fasteners", "Ladder and site sundries", "Cable ties and tape"],
    "Ampol Southport": ["Diesel — work ute"],
    Telstra: ["Mobile and internet plan"],
    "Tradie Insurance Co": ["Public liability insurance (monthly)"],
    "Coastline Hire": ["Scissor lift hire", "Trencher hire (1 day)"],
    Officeworks: ["Printer ink and paper", "Invoice book and stationery"],
    "Gold Coast Workwear": ["Hi-vis shirts and work boots", "Arc-rated workwear"],
  };

  const expenseDescriptions: Record<string, string[]> = story.legacyNarrative
    ? legacyExpenseDescriptions
    : Object.fromEntries(suppliers.map((sup) => [sup.name, sup.items ?? [sup.name]]));

  for (let m = -6; m <= 0; m++) {
    for (const sup of suppliers) {
      const times = sup.typical[0] === sup.typical[1] ? 1 : rngInt(1, 3);
      for (let t = 0; t < times; t++) {
        const id = String(expId++);
        const date = addMonthsIso(m, rngInt(3, 27));
        const price = sup.typical[0] === sup.typical[1] ? sup.typical[0] : rngMoney(...sup.typical);
        const descList = expenseDescriptions[sup.name] || [sup.name];
        const name = rngPick(descList);
        const isReconciled = m < 0 || rngChance(0.7);

        expenses.push({
          expense_id: Number(id),
          id: Number(id),
          name,
          date,
          price: String(price),
          remainingAmount: isReconciled ? "0" : String(price),
          is_reconciled: isReconciled ? 1 : 0,
          account_subcategory_id: sup.subcategoryId,
          account_subcategory: {
            account_subcategory_id: sup.subcategoryId,
            name: sup.category[0] || "General Expense",
          },
          client_id: Number(sup.id),
          client: {
            client_id: Number(sup.id),
            name: sup.name,
            email: sup.email,
          },
          contact_id: Number(sup.contactId),
          contact: {
            id: Number(sup.contactId),
            name: sup.contact,
          },
          tax_amount: Math.round(price * taxFactor * 100) / 100,
          created_at: date,
        });
      }
    }
  }

  expenses.sort((a, b) => b.date.localeCompare(a.date));

  /* ------------------------------------------------------------------ *
   * Bank Transactions
   * Reconciled matched invoices + bills, plus some unreconciled items
   * ------------------------------------------------------------------ */
  const bankTransactions: any[] = [];
  let txnId = 5001;

  // Credits from paid invoices
  for (const inv of invoices.filter((i) => i.status === "paid").slice(0, 40)) {
    bankTransactions.push({
      id: txnId++,
      bank_transaction_id: txnId,
      transaction_date: inv.invoice_date,
      date: inv.invoice_date,
      amount: inv.total,
      direction: "credit",
      type: "credit",
      description: `Direct Deposit ${inv.invoice_no} ${inv.client?.name ?? ""}`,
      account_subcategory_id: 1,
      is_reconciled: true,
      status: "reconciled",
      matched_entity_type: "invoice",
      matched_entity_id: inv.invoice_id,
      bank_name: business.bank_name,
    });
  }

  // Debits from expenses
  for (const exp of expenses.filter((e) => e.is_reconciled === 1).slice(0, 40)) {
    bankTransactions.push({
      id: txnId++,
      bank_transaction_id: txnId,
      transaction_date: exp.date,
      date: exp.date,
      amount: Number(exp.price),
      direction: "debit",
      type: "debit",
      description: `${exp.client?.name ?? "Supplier"} ${exp.name}`,
      account_subcategory_id: exp.account_subcategory_id,
      is_reconciled: true,
      status: "reconciled",
      matched_entity_type: "expense",
      matched_entity_id: exp.expense_id,
      bank_name: business.bank_name,
    });
  }

  // Unreconciled recent transactions (fees, fuel, merchant receipt)
  const fuelSupplier = suppliers.find((sup) => sup.category.includes("fuel"));
  const unreconciledItems = [
    ...(story.legacyNarrative
      ? [
          { desc: "Ampol Southport Fuel", amount: 118.5, type: "debit" },
          { desc: "Bunnings Warehouse 141", amount: 48.9, type: "debit" },
        ]
      : [
          ...(fuelSupplier ? [{ desc: `${fuelSupplier.name} Fuel`, amount: 118.5, type: "debit" }] : []),
          { desc: `${suppliers[0].name} 141`, amount: 48.9, type: "debit" },
        ]),
    { desc: "Account Monthly Fee", amount: 10.0, type: "debit" },
    { desc: "Direct Credit Deposit Smith", amount: 350.0, type: "credit" },
    { desc: "Merch Settle 5521", amount: 1450.0, type: "credit" },
  ];
  for (const item of unreconciledItems) {
    bankTransactions.push({
      id: txnId++,
      bank_transaction_id: txnId,
      transaction_date: addDaysIso(-rngInt(1, 10)),
      date: addDaysIso(-rngInt(1, 10)),
      amount: item.amount,
      direction: item.type,
      type: item.type,
      description: item.desc,
      account_subcategory_id: 0,
      is_reconciled: false,
      status: "unreconciled",
      bank_name: business.bank_name,
    });
  }

  bankTransactions.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));

  /* ------------------------------------------------------------------ *
   * KM Tracker Trips
   * ------------------------------------------------------------------ */
  const kmTrips: any[] = [];
  let tripId = 7001;
  const kmRate = cfg.kmRate;

  for (let d = 84; d >= 1; d--) {
    const day = addDaysIso(-d);
    const dayOfWeek = new Date(day).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6 || !rngChance(0.55)) continue;

    const client = rngPick(clients);
    const distance = rngInt(8, 45);
    const amount = Math.round(distance * kmRate * 100) / 100;

    kmTrips.push({
      id: String(tripId++),
      start_time: `${day}T07:15:00.000Z`,
      end_time: `${day}T08:00:00.000Z`,
      start_location: `Workshop, ${business.address.line1}, ${business.address.city}`,
      end_location: `${client.name}, ${client.city}`,
      trip_type: "business",
      reason: `Site visit — ${client.name}`,
      calculation_method: "cents_per_kilometre",
      distance_km: distance,
      distance: distance,
      business_percentage: 100,
      personal_percentage: 0,
      rate_per_km: kmRate,
      rate: kmRate,
      total_amount: amount,
      amount,
      client_id: String(client.id),
      client_name: client.name,
      vehicle: vehicle?.nickname ?? "Personal vehicle",
      vehicle_id: "1",
      date: day,
    });
  }

  kmTrips.sort((a, b) => b.date.localeCompare(a.date));

  /* ------------------------------------------------------------------ *
   * Narrative blocks (calendar, bookings, planning, rules, super, bills,
   * proposals, credit notes, notifications): hand-built for the default
   * story, derived from the industry template for everything else.
   * ------------------------------------------------------------------ */
  const narrative: Narrative = story.legacyNarrative
    ? legacyNarrative(dates)
    : deriveNarrative(story, cfg, dates, { invoices });
  const {
    calendarEvents,
    bookingLinks,
    bookings,
    budgets,
    goals,
    expensePlans,
    cashWallet,
    matchingRules,
    superFunds,
    superContributions,
    bills,
    billSchedules,
    proposals,
    proposalTemplates,
    creditNotes,
    notifications,
  } = narrative;

  // Richer, API-shaped projects (jobs, tasks, time) and the invoice/quote/expense links to them.
  const projectRecords = buildProjectRecords({ story, cfg, invoices, quotes, expenses, dates });

  /* ------------------------------------------------------------------ *
   * Chart of Accounts / Categories
   * ------------------------------------------------------------------ */
  const accountCategories = [
    {
      account_category_id: 1,
      name: "Assets",
      account_subcategories: [
        { account_subcategory_id: 11, name: "Bank Accounts" },
        { account_subcategory_id: 12, name: "Accounts Receivable" },
        { account_subcategory_id: 13, name: "Inventory" },
        { account_subcategory_id: 14, name: "Tools & Equipment" },
        { account_subcategory_id: 15, name: "Motor Vehicles" },
      ],
    },
    {
      account_category_id: 2,
      name: "Liabilities",
      account_subcategories: [
        { account_subcategory_id: 21, name: `${cfg.taxName} Collected` },
        { account_subcategory_id: 22, name: `${cfg.taxName} Paid` },
        { account_subcategory_id: 23, name: `${cfg.retirementScheme} Payable` },
        { account_subcategory_id: 24, name: "Credit Card" },
      ],
    },
    {
      account_category_id: 3,
      name: "Income",
      account_subcategories: [
        { account_subcategory_id: 101, name: "Sales income" },
        { account_subcategory_id: 102, name: story.incomeCategory },
        { account_subcategory_id: 103, name: "Consulting income" },
        { account_subcategory_id: 104, name: "Other income" },
      ],
    },
    {
      account_category_id: 4,
      name: "Expenses",
      account_subcategories: [
        { account_subcategory_id: 141, name: "Materials & Supplies" },
        { account_subcategory_id: 142, name: "Consumables & Tools" },
        { account_subcategory_id: 143, name: "Motor Vehicle Fuel" },
        { account_subcategory_id: 144, name: "Telephone & Internet" },
        { account_subcategory_id: 145, name: "Insurance" },
        { account_subcategory_id: 146, name: "Equipment Hire" },
        { account_subcategory_id: 147, name: "Office supplies" },
        { account_subcategory_id: 148, name: "Workwear" },
        { account_subcategory_id: 149, name: "General expenses" },
      ],
    },
    {
      account_category_id: 5,
      name: "Capital",
      account_subcategories: [
        { account_subcategory_id: 51, name: "Owner's Contribution" },
        { account_subcategory_id: 52, name: "Owner's Drawings" },
      ],
    },
  ];

  /* ------------------------------------------------------------------ *
   * Payruns
   * ------------------------------------------------------------------ */
  const payruns = [
    {
      id: "14",
      payrun_id: "14",
      period_start: addDaysIso(-20),
      period_end: addDaysIso(-6),
      pay_date: addDaysIso(-5),
      total_gross: 2840.5,
      total_tax: 480.0,
      total_super: 326.65,
      total_net: 2033.85,
      status: "completed",
      employees_count: 2,
    },
    {
      id: "13",
      payrun_id: "13",
      period_start: addDaysIso(-34),
      period_end: addDaysIso(-21),
      pay_date: addDaysIso(-20),
      total_gross: 2840.5,
      total_tax: 480.0,
      total_super: 326.65,
      total_net: 2033.85,
      status: "completed",
      employees_count: 2,
    },
    {
      id: "12",
      payrun_id: "12",
      period_start: addDaysIso(-48),
      period_end: addDaysIso(-35),
      pay_date: addDaysIso(-34),
      total_gross: 2840.5,
      total_tax: 480.0,
      total_super: 326.65,
      total_net: 2033.85,
      status: "completed",
      employees_count: 2,
    },
  ];

  /* ------------------------------------------------------------------ *
   * SolePay & NextTap Merchant Accounts
   * ------------------------------------------------------------------ */
  const merchantAccounts = {
    worldpay: {
      account_status: "active",
      merchant_id: `WP_${business.name.replace(/[^A-Za-z]/g, "").slice(0, 12).toUpperCase()}_8821`,
      verified: true,
      currency: cfg.currency,
      payout_account: "•••• 4821",
      settlements: [
        { id: "1", amount: 2420.0, status: "settled", date: addDaysIso(-2), reference: "WP-SETTLE-881" },
        { id: "2", amount: 1850.0, status: "settled", date: addDaysIso(-5), reference: "WP-SETTLE-880" },
      ],
    },
    nexxtap: {
      using_nexxtap: true,
      nexxtap_mid: "NEXTTAP_CS_441",
      nexxtap_verified_abn: business.abn,
      nexxtap_verified_at: "2026-08-01T00:00:00.000Z",
    },
  };

  /* ------------------------------------------------------------------ *
   * Dashboard Calculations
   * ------------------------------------------------------------------ */
  const totalRevenue = invoices.reduce((acc, inv) => acc + (inv.paid_amount || 0), 0);
  const totalOutstanding = invoices
    .filter((inv) => inv.status === "due" || inv.status === "overdue")
    .reduce((acc, inv) => acc + (inv.remainingAmount || 0), 0);
  const totalExpenseAmount = expenses.reduce((acc, exp) => acc + (Number(exp.price) || 0), 0);

  // Last six calendar months of money in (paid invoices) and out (bills), from the books above.
  const cashFlowMonths = [-5, -4, -3, -2, -1, 0].map((offset) => {
    const monthStart = addMonthsIso(offset, 1);
    const key = monthStart.slice(0, 7);
    const moneyIn = Math.round(
      invoices.filter((inv) => inv.invoice_date.startsWith(key)).reduce((acc, inv) => acc + (inv.paid_amount || 0), 0),
    );
    const moneyOut = Math.round(
      expenses.filter((exp) => exp.date.startsWith(key)).reduce((acc, exp) => acc + (Number(exp.price) || 0), 0),
    );
    const month = new Date(`${monthStart}T12:00:00Z`).toLocaleString("en-AU", { month: "short", timeZone: "UTC" });
    return { month, moneyIn, moneyOut, net: moneyIn - moneyOut };
  });

  return {
    story,
    business,
    clients,
    suppliers,
    customProducts,
    invoices,
    quotes,
    expenses,
    bills,
    billSchedules,
    proposals,
    proposalTemplates,
    creditNotes,
    notifications,
    merchantAccounts,
    bankTransactions,
    projects,
    projectRecords,
    kmTrips,
    kmRate,
    vehicle,
    assets,
    employees,
    calendarEvents,
    bookingLinks,
    bookings,
    budgets,
    goals,
    expensePlans,
    cashWallet,
    matchingRules,
    superFunds,
    superContributions,
    accountCategories,
    payruns,
    dashboard: {
      balance: 18450.25,
      totalRevenue,
      totalOutstanding,
      totalExpenseAmount,
      cashFlowMonths,
      bankAccounts: [
        {
          id: "1",
          bank_name: business.bank_name,
          account_name: "Everyday Business Account",
          balance: 18450.25,
        },
      ],
    },
  };
}

export type SeedData = ReturnType<typeof generateSeedData>;

