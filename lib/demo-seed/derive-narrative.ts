/* eslint-disable @typescript-eslint/no-explicit-any -- builds loosely typed mock API payloads, like mock-server.ts */
/**
 * Narrative blocks derived from a Story (any industry, any country):
 * calendar jobs, bookings, budgets and goals, bank matching rules, retirement
 * contributions, supplier bills, proposals, credit notes and notifications.
 *
 * Everything is built from the template's own clients, services, suppliers and
 * assets, so an industry never has to hand-write prose. The shapes mirror the
 * hand-built default in legacy-narrative.ts field for field.
 */

import type { DemoCountryConfig } from "./country";
import type { legacyNarrative } from "./legacy-narrative";
import type { DemoClient, DemoSupplier, Story } from "./story";
import { round2, type DateHelpers } from "./util";

type Narrative = ReturnType<typeof legacyNarrative>;

interface Ctx {
  invoices: { invoice_no: string; client?: { name?: string } | null; total: number }[];
}

const SUBCATEGORY_NAMES: Record<number, string> = {
  141: "Materials & Supplies",
  142: "Consumables & Tools",
  143: "Motor Vehicle Fuel",
  144: "Telephone & Internet",
  145: "Insurance",
  146: "Equipment Hire",
  147: "Office supplies",
  148: "Workwear",
  149: "General expenses",
};

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

export function deriveNarrative(
  story: Story,
  cfg: DemoCountryConfig,
  dates: DateHelpers,
  ctx: Ctx = { invoices: [] },
): Narrative {
  const { addDaysIso, addMonthsIso } = dates;
  const { business, clients, suppliers, services, projects } = story;
  const rate = cfg.taxRate;
  const rateFactor = rate / 100;
  const money = (n: number) =>
    `${cfg.currencySymbol}${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const cur = cfg.currency.toLowerCase();

  const specific = suppliers.filter((s) => ![143, 144, 145, 147].includes(s.subcategoryId));
  const fuel = suppliers.find((s) => s.subcategoryId === 143);
  const telco = suppliers.find((s) => s.subcategoryId === 144)!;
  const insurance = suppliers.find((s) => s.subcategoryId === 145)!;
  const byPrice = [...services].sort((a, b) => b.price - a.price);
  const client = (i: number): DemoClient => clients[i % clients.length];
  const service = (i: number) => services[i % services.length];
  const ownerName = `${business.owner.first_name} ${business.owner.last_name}`;
  const firstStaff = story.employees[0];

  /* Calendar ------------------------------------------------------------ */
  const slots = [
    { day: 0, from: "08:30", to: "12:30", stage: ["2", "In Progress"], priority: "high", color: "#6366f1" },
    { day: 1, from: "09:00", to: "11:30", stage: ["1", "To Do"], priority: "medium", color: "#0ea5e9" },
    { day: 2, from: "13:00", to: "14:30", stage: ["1", "To Do"], priority: "low", color: "#10b981" },
    { day: 3, from: "07:30", to: "16:00", stage: ["1", "To Do"], priority: "high", color: "#f59e0b" },
    { day: -1, from: "10:00", to: "14:00", stage: ["4", "Invoiced"], priority: "medium", color: "#8b5cf6" },
  ];
  const calendarEvents: any[] = slots.map((slot, i) => {
    const c = client([1, 3, 4, 2, 0][i] + i);
    const svc = service(i * 2 + 1);
    const date = addDaysIso(slot.day);
    const start = `${date}T${slot.from}:00.000Z`;
    const end = `${date}T${slot.to}:00.000Z`;
    const title = `${c.name} - ${svc.name}`;
    return {
      id: String(i + 1),
      task_id: String(i + 1),
      title,
      name: title,
      task_name: title,
      start_at: start,
      end_at: end,
      start_date: start,
      end_date: end,
      date,
      client_id: c.id,
      client_name: c.name,
      client: { id: Number(c.id), name: c.name, business_name: c.name },
      ...(i === 0 && projects[0]
        ? {
            project_id: projects[0].id,
            project_name: projects[0].name,
            project: { id: Number(projects[0].id), name: projects[0].name },
          }
        : {}),
      is_billable: true,
      amount: Math.round(svc.price * (svc.unit === "hours" ? 3 : 1)),
      color: slot.color,
      stage_id: slot.stage[0],
      stage_name: slot.stage[1],
      priority: slot.priority,
      task_details: `${svc.name} for ${c.contact} (${c.name}).`,
    };
  });
  const meetingDate = addDaysIso(-3);
  calendarEvents.push({
    id: "6",
    task_id: "6",
    title: "Weekly planning & schedule meeting",
    name: "Weekly planning & schedule meeting",
    task_name: "Weekly planning & schedule meeting",
    start_at: `${meetingDate}T07:00:00.000Z`,
    end_at: `${meetingDate}T08:00:00.000Z`,
    start_date: `${meetingDate}T07:00:00.000Z`,
    end_date: `${meetingDate}T08:00:00.000Z`,
    date: meetingDate,
    is_billable: false,
    amount: 0,
    color: "#64748b",
    stage_id: "4",
    stage_name: "Completed",
    priority: "low",
    task_details: `Weekly review of upcoming ${story.job.noun}s, quotes to chase and cash position.`,
  });

  /* Booking page -------------------------------------------------------- */
  const slug = business.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const onSite = Boolean(story.vehicle);
  const bookingLinks: any[] = [
    {
      id: "1",
      slug: `${slug}-${story.job.noun.replace(/[^a-z]+/g, "-")}-1`,
      title: story.job.bookingTitle,
      description: story.job.bookingBlurb,
      duration_min: 60,
      meeting_type: "in_person",
      location: onSite ? "At your location" : `${business.address.line1}, ${business.address.city}`,
      timezone: cfg.timezone,
      bookings_count: 3,
    },
  ];
  const people = [
    ["Grace Holloway", "grace.holloway@example.com", 2, "10:00"],
    ["Ben Carter", "ben.carter@example.com", 4, "14:00"],
    ["Ava Thompson", "ava.thompson@example.com", 7, "11:00"],
  ] as const;
  const bookings: any[] = people.map(([name, email, day, time], i) => ({
    id: String(i + 1),
    booking_link_id: "1",
    name,
    email,
    start_utc: `${addDaysIso(day)}T${time}:00.000Z`,
    message: `Hoping to book a ${story.job.noun}: ${service(i * 3).name.toLowerCase()}.`,
    status: "confirmed",
  }));

  /* Planning ------------------------------------------------------------ */
  const budgetPlan = [
    { period: "monthly", label: "Monthly", spent: 0.77, alert: 80, from: -2, to: 10 },
    { period: "monthly", label: "Monthly", spent: 0.65, alert: 85, from: -2, to: 10 },
    { period: "quarterly", label: "Quarterly", spent: 0.62, alert: 75, from: -1, to: 11 },
  ];
  const budgets: any[] = budgetPlan.map((plan, i) => {
    const sup = specific[i % specific.length];
    const amount = roundTo(sup.typical[1] * 4, 500);
    const category = sup.category[0];
    return {
      id: String(i + 1),
      name: `${cap(category)} budget`,
      amount,
      period_type: plan.period,
      period: plan.label,
      repeat_frequency: plan.period,
      start_date: addMonthsIso(plan.from),
      end_date: addMonthsIso(plan.to),
      alert_threshold_percent: plan.alert,
      alertThreshold: plan.alert,
      notes: `${(sup.items ?? []).slice(0, 2).join(", ")} from ${sup.name}.`,
      category_ids: [sup.subcategoryId],
      categories: [SUBCATEGORY_NAMES[sup.subcategoryId] ?? cap(category)],
      total_spent: Math.round(amount * plan.spent),
    };
  });

  const equipmentName = story.assets[0]?.name ?? "new equipment";
  const goalRows = [
    { name: `${cfg.returnName} & ${cfg.taxName} reserve`, type: "Buffer", goal_type: "tax_set_aside", target: 14000, current: 9500, months: 3, ago: -5 },
    { name: `${equipmentName} upgrade fund`, type: "Equipment", goal_type: "equipment", target: 25000, current: 8000, months: 9, ago: -12 },
    { name: "3-Month Emergency Operating Buffer", type: "Buffer", goal_type: "buffer", target: 18000, current: 12000, months: 6, ago: -20 },
  ];
  const goals: any[] = goalRows.map((g, i) => ({
    id: String(i + 1),
    name: g.name,
    type: g.type,
    goal_type: g.goal_type,
    target_amount: g.target,
    targetAmount: String(g.target),
    target_date: addMonthsIso(g.months),
    targetDate: addMonthsIso(g.months),
    current_amount: g.current,
    saved_percentage: round2((g.current / g.target) * 100),
    status: "On track",
    allocations: [
      { id: `a-${i + 1}`, source_account_id: "1", source_name: "Everyday Business Account", amount: String(g.current), date: addDaysIso(g.ago) },
    ],
  }));

  const planAssets = story.assets.slice(0, 3);
  const expensePlans: any[] = [
    {
      id: "1",
      name: `${story.label} equipment upgrade`,
      type: "Expansion",
      funding_source: "Cash",
      fundingSource: "Cash",
      start_date: addDaysIso(0),
      startDate: addDaysIso(0),
      end_date: addMonthsIso(6),
      endDate: addMonthsIso(6),
      expected_revenue: String(roundTo(planAssets.reduce((a, x) => a + x.price, 0) * 3, 1000)),
      expectedRevenue: String(roundTo(planAssets.reduce((a, x) => a + x.price, 0) * 3, 1000)),
      lines: planAssets.map((a, i) => ({
        id: `l-${i + 1}`,
        name: a.name,
        planned: String(a.price),
        actual: String(Math.round(a.price * [0.92, 1, 0.33][i % 3])),
      })),
    },
    {
      id: "2",
      name: "Marketing & growth push",
      type: "Marketing",
      funding_source: "Cash",
      fundingSource: "Cash",
      start_date: addDaysIso(-30),
      startDate: addDaysIso(-30),
      end_date: addMonthsIso(3),
      endDate: addMonthsIso(3),
      expected_revenue: "30000",
      expectedRevenue: "30000",
      lines: [
        { id: "l-4", name: "Website refresh", planned: "4500", actual: "4500" },
        { id: "l-5", name: "Local advertising", planned: "3000", actual: "2200" },
        { id: "l-6", name: "Branded signage and stationery", planned: "2500", actual: "1800" },
      ],
    },
  ];

  const cashWallet = {
    balance: 1450.0,
    opening_balance: 1000.0,
    currency: cfg.currency,
    movements: [
      { id: "wm-1", date: addDaysIso(-14), amount: 500, note: "Cash float replenishment from ATM" },
      { id: "wm-2", date: addDaysIso(-8), amount: -50, note: "Petty cash for small supplies" },
      { id: "wm-3", date: addDaysIso(-2), amount: 0, note: "Opening cash float balance verified" },
    ],
  };

  /* Bank matching rules ------------------------------------------------- */
  const rule = (id: number, sup: DemoSupplier, assign: string) => ({
    id,
    name: `${sup.name} Supplies`,
    transaction_type: "D" as const,
    condition_type: "DESCRIPTION",
    condition: "CONTAIN",
    condition_val: JSON.stringify([sup.name.split(/[\s']/)[0].toLowerCase()]),
    account_subcategory_id: sup.subcategoryId,
    account_category_id: 4,
    account_category_name: "Expenses",
    acccount_subcategory_name: SUBCATEGORY_NAMES[sup.subcategoryId] ?? "General expenses",
    client_id: Number(sup.id),
    client_name: sup.name,
    client: { id: Number(sup.id), name: sup.name },
    assign_name: assign,
    gst_include: 1,
  });
  const matchingRules: any[] = [
    rule(1, specific[0], (specific[0].items ?? [])[0] ?? specific[0].name),
    rule(2, specific[1] ?? specific[0], (specific[1]?.items ?? [])[0] ?? specific[0].name),
    rule(3, fuel ?? telco, fuel ? "Vehicle fuel" : "Phone and internet"),
    {
      id: 4,
      name: "Direct Client Payments via Stripe",
      transaction_type: "C" as const,
      condition_type: "DESCRIPTION",
      condition: "CONTAIN",
      condition_val: JSON.stringify(["stripe", "stripe payments"]),
      account_subcategory_id: 101,
      account_category_id: 3,
      account_category_name: "Income",
      acccount_subcategory_name: "Sales income",
      client_id: Number(clients[0].id),
      client_name: clients[0].name,
      client: { id: Number(clients[0].id), name: clients[0].name },
      assign_name: "",
      gst_include: 1,
    },
  ];

  /* Retirement contributions (Super in AU, KiwiSaver in NZ) ------------- */
  const isAU = cfg.iso2 === "AU";
  const superFunds: any[] = cfg.retirementFunds.map((name, i) => ({ id: String(i + 1), name }));
  const contribLabel = isAU ? "SGC superannuation" : "employer KiwiSaver";
  const contribRows = [
    { fund: 0, month: -1, day: 28, price: 2875, q: "Q1", who: ownerName, open: false },
    { fund: 0, month: -4, day: 25, price: 2875, q: "Q4", who: ownerName, open: false },
    { fund: 1, month: -7, day: 26, price: 3450, q: "Q3", who: `${ownerName} & ${firstStaff.first_name} ${firstStaff.last_name}`, open: false },
    { fund: 1, month: -10, day: 24, price: 2300, q: "Q2", who: ownerName, open: true },
  ];
  const superContributions: any[] = contribRows.map((r, i) => ({
    id: String(i + 1),
    fund_id: String(r.fund + 1),
    fund_name: superFunds[r.fund].name,
    date: addMonthsIso(r.month, r.day),
    price: r.price,
    description: `${r.q} ${contribLabel} contribution for ${r.who}`,
    is_taxable: 1,
    remaining_amount: r.open ? r.price : 0,
    possible_match: r.open ? 1 : 0,
    fund: { id: String(r.fund + 1), name: superFunds[r.fund].name },
  }));

  /* Bills --------------------------------------------------------------- */
  let billSeq = 0;
  const bill = (
    sup: DemoSupplier,
    billOffset: number,
    dueOffset: number,
    status: "unpaid" | "overdue" | "paid" | "draft",
    source: "manual" | "ocr",
    possible: number,
    mix: number,
  ) => {
    billSeq += 1;
    const items = (sup.items ?? [sup.name]).slice(0, 2).map((description, i) => {
      const qty = i === 0 ? 2 : 1;
      const unit = round2(sup.typical[0] + (sup.typical[1] - sup.typical[0]) * (mix + i * 0.25));
      return { description, qty, price: round2(unit / qty), gst: 1, gst_percentage: rate };
    });
    const sub = round2(items.reduce((a, it) => a + it.qty * it.price, 0));
    const gst = round2(sub * rateFactor);
    const total = round2(sub + gst);
    const paid = status === "paid";
    return {
      bill_id: String(billSeq),
      id: String(billSeq),
      bill_no: `BILL-2026-${String(billSeq).padStart(3, "0")}`,
      bill_date: addDaysIso(billOffset),
      due_date: addDaysIso(dueOffset),
      status,
      payment_status: status === "overdue" ? "unpaid" : status,
      is_overdue: status === "overdue",
      amount_paid: paid ? total : 0,
      amount_due: paid ? 0 : total,
      possible_match: possible,
      sub_total: sub,
      total_gst: gst,
      total,
      notes: (sup.items ?? [sup.name]).slice(0, 2).join(" and "),
      source,
      client_id: Number(sup.id),
      client: { client_id: Number(sup.id), name: sup.name },
      account_subcategory_id: sup.subcategoryId,
      category: { account_subcategory_id: sup.subcategoryId, name: SUBCATEGORY_NAMES[sup.subcategoryId] ?? "General expenses" },
      items,
    };
  };
  const s0 = specific[0];
  const s1 = specific[1] ?? specific[0];
  const s2 = specific[2] ?? specific[0];
  const bills: any[] = [
    bill(s0, -5, 2, "unpaid", "manual", 1, 0.3),
    bill(s1, -18, -1, "overdue", "ocr", 0, 0.5),
    bill(s0, -28, -14, "paid", "manual", 0, 0.9),
    bill(s2, -2, 12, "draft", "manual", 0, 0.2),
    bill(fuel ?? s2, -3, 11, "unpaid", "ocr", 1, 0.4),
    bill(telco, -10, 10, "unpaid", "manual", 1, 0),
  ];
  const billSchedules: any[] = [
    {
      schedule_id: "1",
      id: "1",
      frequency: "monthly",
      status: "active",
      next_date: addDaysIso(20),
      end_type: "never",
      total_count: null,
      occurrences_made: 6,
      supplier_name: telco.name,
      client_id: Number(telco.id),
      amount: telco.typical[0],
      account_subcategory_name: "Telephone & Internet",
    },
    {
      schedule_id: "2",
      id: "2",
      frequency: "monthly",
      status: "active",
      next_date: addDaysIso(14),
      end_type: "never",
      total_count: null,
      occurrences_made: 12,
      supplier_name: insurance.name,
      client_id: Number(insurance.id),
      amount: insurance.typical[0],
      account_subcategory_name: "Insurance",
    },
  ];

  /* Proposals ----------------------------------------------------------- */
  const proposalBase = (i: number, svc: (typeof services)[number], c: DemoClient, status: string, daysAgo: number, titleStep: string, steps: string[]) => {
    const total = round2(svc.price * (svc.unit === "hours" ? 10 : svc.unit === "days" ? 3 : 2));
    const local = c.contact.toLowerCase().replace(/[^a-z]+/g, ".");
    return {
      id: String(i + 1),
      proposal_id: String(i + 1),
      title: `${svc.name} — ${c.name}`,
      status,
      client_id: Number(c.id),
      client_name: c.name,
      client: { id: Number(c.id), name: c.name, email: `${local}@example.com` },
      service_total: total,
      [`service_total_${cur}`]: total,
      currency_code: cfg.currency,
      is_multicurrency: 0,
      created_at: addDaysIso(-daysAgo),
      token: `prop_demo_tok_${c.id}_${i + 1}`,
      steps: [
        { key: "INTRODUCTION", title: "Introduction", status: "completed" },
        { key: "SERVICES", title: titleStep, status: steps[0] },
        { key: "PAYMENT", title: "Payment Terms", status: steps[1] },
        ...(steps[2] ? [{ key: "THANK_YOU", title: "Acceptance", status: steps[2] }] : []),
      ],
      payment_data: i === 0 ? { payment_type: "DEPOSIT", deposit_type: "PERCENTAGE", deposit_amount: 50 } : { payment_type: "FULL" },
    };
  };
  const proposals: any[] = [
    proposalBase(0, byPrice[0], client(1), "SENT", 5, "Scope of Work", ["completed", "completed", "completed"]),
    proposalBase(1, byPrice[1] ?? byPrice[0], client(2), "DRAFT", 2, "Scope and Specifications", ["in_progress", "pending", ""]),
  ];
  const proposalTemplates: any[] = [
    ...[0, 1, 2].map((i) => ({
      id: String(i + 1),
      template_id: String(i + 1),
      template_name: byPrice[i % byPrice.length].name,
      template_type: "PROPOSAL",
      description: `Standard proposal for ${byPrice[i % byPrice.length].name.toLowerCase()}: scope, inclusions, timeline and payment terms.`,
      created_at: addMonthsIso(-(3 - i)),
    })),
    {
      id: "4",
      template_id: "4",
      template_name: `Welcome to ${business.name}`,
      template_type: "INTRODUCTION",
      description: `Introductory cover page for ${business.name}: who we are, how we work and what every quote includes.`,
      created_at: addMonthsIso(-4),
    },
  ];

  /* Credit notes -------------------------------------------------------- */
  const bankFor = (n: number) =>
    isAU ? { bsb: `0${n}4-00${n}`, account_number: `1234567${n}` } : { account_number: `03-1234-056789${n}-00` };
  const invoiceNo = (i: number) => ctx.invoices[i]?.invoice_no ?? `INV-${1038 + i}`;
  const clientCredit = (i: number, c: DemoClient, sub: number, status: string, reason: string, hasBank: boolean) => {
    const tax = round2(sub * rateFactor);
    return {
      id: String(i + 1),
      credit_note_id: String(i + 1),
      credit_note_no: `CRN-${String(i + 1).padStart(4, "0")}`,
      credit_note_date: addDaysIso([-14, -5, -2][i]),
      date: addDaysIso([-14, -5, -2][i]),
      client_id: Number(c.id),
      client_name: c.name,
      total: round2(sub + tax),
      sub_total: sub,
      gst_amount: tax,
      tax_amount: tax,
      status,
      type: "client",
      reason,
      has_complete_bank_info: hasBank,
      invoice: { id: String(i + 1), invoice_no: invoiceNo(i) },
      client: {
        id: Number(c.id),
        name: c.name,
        business_name: c.name,
        ...(hasBank ? { account_holder: c.name, ...bankFor(i + 1) } : {}),
      },
    };
  };
  const vendorCredit = (i: number, sup: DemoSupplier, sub: number, status: string, reason: string, hasBank: boolean) => {
    const tax = round2(sub * rateFactor);
    return {
      id: `vr-${i + 1}`,
      credit_note_id: `vr-${i + 1}`,
      credit_note_no: `VCR-${2001 + i}`,
      credit_note_date: addDaysIso([-18, -8, -3][i]),
      date: addDaysIso([-18, -8, -3][i]),
      total: round2(sub + tax),
      sub_total: sub,
      gst_amount: tax,
      tax_amount: tax,
      status,
      type: "vendor",
      reason,
      has_complete_bank_info: hasBank,
      related_expense_id: String(i + 1),
      client: {
        id: 201 + i,
        name: sup.name,
        business_name: sup.name,
        account_holder: `${sup.name} Ltd`,
        ...bankFor(i + 5),
      },
    };
  };
  const vendors = [s0, s1, s2];
  const creditNotes: any[] = [
    clientCredit(0, client(1), 220, "refunded", "Overpayment", true),
    clientCredit(1, client(3), 77.27, "issued", "Returned goods", false),
    clientCredit(2, client(2), 300, "refunded", "Billing adjustment", true),
    vendorCredit(0, vendors[0], 350, "refunded", "Returned goods", true),
    vendorCredit(1, vendors[1], 150, "issued", "Billing adjustment", false),
    vendorCredit(2, vendors[2], 200, "refunded", "Overpayment", true),
  ];

  /* Notifications ------------------------------------------------------- */
  const lowStock = story.inventory.find((p) => p.inventory_count < p.low_stock_threshold);
  const unpaid = bills[0];
  const notifications: any[] = [
    {
      notification_id: 1,
      id: 1,
      title: "New Online Booking Confirmed",
      message: `${people[0][0]} booked '${story.job.bookingTitle}' for tomorrow at 08:30 AM.`,
      notification_date: addDaysIso(0),
      is_read: 0,
      type: "booking",
    },
    {
      notification_id: 2,
      id: 2,
      title: "Quote Accepted",
      message: `${client(3).name} accepted quote Q-2001 (${money(1850)}). Invoice ready to generate.`,
      notification_date: addDaysIso(-1),
      is_read: 0,
      type: "quote",
    },
    {
      notification_id: 3,
      id: 3,
      title: "Bank Payment Matched",
      message: `Direct deposit of ${money(2420)} from ${client(1).name} auto-matched to ${invoiceNo(1)}.`,
      notification_date: addDaysIso(-2),
      is_read: 1,
      type: "payment",
    },
    {
      notification_id: 4,
      id: 4,
      title: "Upcoming Bill Due",
      message: `${s0.name} bill ${unpaid.bill_no} (${money(unpaid.total)}) is due in 2 days.`,
      notification_date: addDaysIso(-3),
      is_read: 1,
      type: "bill",
    },
    lowStock
      ? {
          notification_id: 5,
          id: 5,
          title: "Low Stock Alert",
          message: `${lowStock.name} is down to ${lowStock.inventory_count} units (threshold: ${lowStock.low_stock_threshold}).`,
          notification_date: addDaysIso(-4),
          is_read: 1,
          type: "inventory",
        }
      : {
          notification_id: 5,
          id: 5,
          title: "Invoice Overdue",
          message: `${invoiceNo(2)} for ${client(2).name} is now overdue. Send a reminder?`,
          notification_date: addDaysIso(-4),
          is_read: 1,
          type: "invoice",
        },
  ];

  return {
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
  } as unknown as Narrative;
}
