/**
 * Quick Actions — every "Everything else" card except Get paid.
 *
 * Each block reproduces the matching sole-webapp Unibox component: which rows
 * it lists and in what order, what each row says, and which button it gets.
 */
import { describe, expect, it } from "vitest";

import type { ActiveTimer } from "@/lib/project-timer";
import type {
  UniboxBankTransaction,
  UniboxMatchable,
  UniboxPlannerTask,
  UniboxProject,
  UniboxTimeEntry,
  UniboxTrip,
} from "@/lib/unibox";
import {
  CARD_ROW_LIMIT,
  actionCountText,
  activityDay,
  activityDayLabel,
  KM_ROW_LIMIT,
  bankAmount,
  bankDetail,
  bankFeedRows,
  bankLabel,
  bankMatchRow,
  entryMinutes,
  formatTripDistance,
  fullTripTitle,
  isCompletedTask,
  isCreditLine,
  isLiveTimeEntry,
  isRunningTimeEntry,
  isTripInvoiced,
  isTripReadyToInvoice,
  isUnmatchedBankLine,
  kmRows,
  kmTripFor,
  matchButtonType,
  matchableId,
  matchableRows,
  matchableSub,
  matchableTitle,
  plannerTaskFor,
  progressView,
  projectName,
  projectStatusKey,
  projectSub,
  recentTimeEntries,
  remainingOf,
  selectionFromTimer,
  shortenLocation,
  taskAmount,
  taskClient,
  taskDate,
  taskWhen,
  timeEntryAction,
  timeEntryInvoice,
  timeEntrySub,
  timeEntryTitle,
  timerProjectLabel,
  totalBooked,
  totalEntryMinutes,
  totalKm,
  tripId,
  tripSub,
  tripTitle,
  tripTypeLabel,
  workComingUpRows,
} from "@/lib/unibox-rules";

const many = <T>(count: number, make: (index: number) => T) => Array.from({ length: count }, (_, index) => make(index));

/* ------------------------------------------------------------------ *
 * Bank feed — BankFeedCard.js
 * ------------------------------------------------------------------ */

describe("Bank feed card", () => {
  const line = (over: Partial<UniboxBankTransaction>): UniboxBankTransaction => ({
    id: 1,
    amount: 100,
    ...over,
  });

  describe("which lines it lists", () => {
    it("lists an unmatched, unreconciled line", () => {
      expect(isUnmatchedBankLine(line({}))).toBe(true);
    });

    it("skips saved transactions", () => {
      expect(isUnmatchedBankLine(line({ _source: "saved_transaction" }))).toBe(false);
    });

    it.each([true, 1, "1", "true"])("skips a reconciled line (is_reconciled = %s)", (value) => {
      expect(isUnmatchedBankLine(line({ is_reconciled: value as never }))).toBe(false);
    });

    it("skips a line already matched to a Sole transaction", () => {
      expect(isUnmatchedBankLine(line({ matched_transaction_no: "TX-9" }))).toBe(false);
    });

    it("skips a line that's been partly allocated", () => {
      expect(isUnmatchedBankLine(line({ amount: 100, available_amount: 40 }))).toBe(false);
      expect(isUnmatchedBankLine(line({ amount: 100, remaining_amount: 40 }))).toBe(false);
    });

    it("keeps a line whose available amount is the whole amount, within half a cent", () => {
      expect(isUnmatchedBankLine(line({ amount: 100, available_amount: 100 }))).toBe(true);
      expect(isUnmatchedBankLine(line({ amount: 100, available_amount: 99.996 }))).toBe(true);
    });

    it("keeps a line whose amounts can't be read rather than hiding it", () => {
      expect(isUnmatchedBankLine(line({ amount: "abc" }))).toBe(true);
    });

    it("shows at most five", () => {
      expect(bankFeedRows(many(8, (index) => line({ id: index })))).toHaveLength(CARD_ROW_LIMIT);
    });
  });

  describe("what a row says", () => {
    it("labels a line by description, then name, payee, vendor, else 'Transaction'", () => {
      expect(bankLabel(line({ description: "Etsy", name: "n" }))).toBe("Etsy");
      expect(bankLabel(line({ name: "Name" }))).toBe("Name");
      expect(bankLabel(line({ payee: "Payee" }))).toBe("Payee");
      expect(bankLabel(line({ vendor_name: "Vendor" }))).toBe("Vendor");
      expect(bankLabel(line({}))).toBe("Transaction");
    });

    it("says Unmatched, or the Sole match, for a bank-feed line", () => {
      expect(bankDetail(line({ _source: "bank_transaction" }))).toBe("Unmatched");
      expect(bankDetail(line({ _source: "bank_transaction", matched_transaction_no: "TX-1" }))).toBe(
        "Sole match: TX-1",
      );
    });

    it("says the category, else the status, for anything else", () => {
      expect(bankDetail(line({ category: "Fuel", status: "x" }))).toBe("Fuel");
      expect(bankDetail(line({ status: "pending" }))).toBe("pending");
      expect(bankDetail(line({}))).toBe("");
    });

    it("reads money in from the direction first", () => {
      expect(isCreditLine(line({ direction: "Credit" }))).toBe(true);
      expect(isCreditLine(line({ direction: "debit", credit: 50 }))).toBe(false);
    });

    it("falls back to a credit figure or a credit type", () => {
      expect(isCreditLine(line({ credit: 50 }))).toBe(true);
      expect(isCreditLine(line({ transaction_type: "credit" }))).toBe(true);
      expect(isCreditLine(line({ debit: 50 }))).toBe(false);
    });

    it("shows the amount unsigned, from amount, credit, debit or total", () => {
      expect(bankAmount(line({ amount: -58 }))).toBe(58);
      expect(bankAmount({ id: 1, credit: 12 })).toBe(12);
      expect(bankAmount({ id: 1, debit: 7 })).toBe(7);
      expect(bankAmount({ id: 1, total: 3 })).toBe(3);
    });
  });

  describe("opening Match", () => {
    it("uses the transaction's own id first, then the row id, then the priority's", () => {
      expect(bankMatchRow({ bank_transacton_id: 5, id: 6 }, 7)?.bank_transacton_id).toBe(5);
      expect(bankMatchRow({ id: 6 }, 7)?.bank_transacton_id).toBe(6);
      expect(bankMatchRow({}, 7)?.bank_transacton_id).toBe(7);
    });

    it("fills transaction_id from the chosen id when the row has none", () => {
      expect(bankMatchRow({ id: 6 })).toMatchObject({ transaction_id: 6 });
      expect(bankMatchRow({ id: 6, transaction_id: 99 })).toMatchObject({ transaction_id: 99 });
    });

    it("keeps the rest of the row for the dialog", () => {
      expect(bankMatchRow({ id: 6, description: "Etsy", amount: 58 })).toMatchObject({
        description: "Etsy",
        amount: 58,
      });
    });

    it("can't open without any id", () => {
      expect(bankMatchRow({})).toBeNull();
    });
  });
});

/* ------------------------------------------------------------------ *
 * Expenses, Assets, Liabilities, Equity
 * ------------------------------------------------------------------ */

describe("Match cards (Expenses, Assets, Liabilities, Equity)", () => {
  const row = (over: Partial<UniboxMatchable>): UniboxMatchable => ({ id: 1, ...over });

  it("lists up to five records not yet reconciled", () => {
    const rows = [
      row({ id: 1 }),
      row({ id: 2, is_reconciled: 1 }),
      row({ id: 3, is_reconciled: true }),
      row({ id: 4, is_reconciled: 0 }),
      ...many(6, (index) => row({ id: 10 + index })),
    ];
    const shown = matchableRows(rows);
    expect(shown).toHaveLength(CARD_ROW_LIMIT);
    expect(shown.map((each) => each.id)).toEqual([1, 4, 10, 11, 12]);
  });

  it("offers AI Match when the feed found candidates, plain Match otherwise", () => {
    expect(matchButtonType(row({ possible_match: 2 }))).toBe("ai");
    expect(matchButtonType(row({ possible_match: "1" }))).toBe("ai");
    expect(matchButtonType(row({ possible_match: 0 }))).toBe("normal");
    expect(matchButtonType(row({}))).toBe("normal");
  });

  describe("Expenses", () => {
    it("titles by name, then the client, else 'Expense'", () => {
      expect(matchableTitle("expense", row({ name: "Fuel" }))).toBe("Fuel");
      expect(matchableTitle("expense", row({ client: { name: "Ampol" } }))).toBe("Ampol");
      expect(matchableTitle("expense", row({}))).toBe("Expense");
    });

    it("says it needs matching, with its date", () => {
      expect(matchableSub("expense", row({ date: "2026-09-08T12:00:00" }))).toBe("Needs matching · 8 Sept");
    });

    it("matches by expense_id where the row has one", () => {
      expect(matchableId("expense", row({ id: 1, expense_id: 77 }))).toBe("77");
      expect(matchableId("expense", row({ id: 1 }))).toBe("1");
    });
  });

  describe("Assets", () => {
    it("titles by name, else 'Asset'", () => {
      expect(matchableTitle("asset", row({ name: "Car" }))).toBe("Car");
      expect(matchableTitle("asset", row({}))).toBe("Asset");
    });

    it("says its status (Active by default) and purchase date", () => {
      expect(matchableSub("asset", row({ status: "active", date_of_purchase: "2026-10-15T12:00:00" }))).toBe(
        "active · 15 Oct",
      );
      expect(matchableSub("asset", row({}))).toBe("Active · ");
    });

    it("matches by asset_id where the row has one", () => {
      expect(matchableId("asset", row({ asset_id: 5 }))).toBe("5");
    });
  });

  describe("Liabilities and Equity", () => {
    it("say their kind, contact and date, skipping what's missing", () => {
      expect(matchableSub("liability", row({ contact: "NAB", date: "2026-10-12T12:00:00" }))).toBe(
        "Liability · NAB · 12 Oct",
      );
      expect(matchableSub("liability", row({}))).toBe("Liability");
      expect(matchableSub("equity", row({ date: "2026-06-30T12:00:00" }))).toBe("Equity · 30 June");
    });

    it("fall back to their kind as a title", () => {
      expect(matchableTitle("liability", row({}))).toBe("Liability");
      expect(matchableTitle("equity", row({}))).toBe("Equity");
    });

    it("match by their own id field", () => {
      expect(matchableId("liability", row({ liability_id: 8 }))).toBe("8");
      expect(matchableId("equity", row({ equity_id: 9 }))).toBe("9");
    });
  });

  it("opens the match dialog on the remaining amount, else the price", () => {
    expect(remainingOf(row({ remainingAmount: 20, remaining_amount: 30, price: 40 }))).toBe(20);
    expect(remainingOf(row({ remaining_amount: 30, price: 40 }))).toBe(30);
    expect(remainingOf(row({ price: 40 }))).toBe(40);
    expect(remainingOf(row({}))).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Time tracker — TimeTrackerCard.js
 * ------------------------------------------------------------------ */

describe("Time tracker card", () => {
  const entry = (over: Partial<UniboxTimeEntry>): UniboxTimeEntry => ({ id: 1, ...over });

  describe("what counts as running", () => {
    it("is a timer entry whose status is running", () => {
      expect(isRunningTimeEntry(entry({ entry_type: "timer", status: "running" }))).toBe(true);
      expect(isRunningTimeEntry(entry({ entry_type: "timer", status: "Running" }))).toBe(true);
    });

    it("is never a manual entry, even with a start time and no end time", () => {
      // The bug that disabled "Start timer" with nothing running.
      expect(isRunningTimeEntry(entry({ entry_type: "manual", status: "running" }))).toBe(false);
      expect(isRunningTimeEntry(entry({ start_time: "2026-03-10T09:00:00", end_time: null }))).toBe(false);
    });

    it("is not a stopped timer", () => {
      expect(isRunningTimeEntry(entry({ entry_type: "timer", status: "completed" }))).toBe(false);
    });
  });

  describe("after a timer is stopped", () => {
    // The card's own list, fetched while the timer was running.
    const stale = entry({ id: 900, entry_type: "timer", status: "running" });

    it("stops showing Stop as soon as the app's active timer is gone, before the list refetches", () => {
      expect(isLiveTimeEntry(stale, null)).toBe(false);
      expect(timeEntryAction(stale, isLiveTimeEntry(stale, null)).label).toBe("Invoice");
      expect(timeEntrySub({ ...stale, duration_minutes: 30 }, false)).toBe("30 min · not yet invoiced");
    });

    it("shows Stop only on the row that is the active timer", () => {
      expect(isLiveTimeEntry(stale, "900")).toBe(true);
      expect(isLiveTimeEntry(stale, "901")).toBe(false);
    });

    it("shows a timer started elsewhere as running before the list catches up", () => {
      const listed = entry({ id: 901, entry_type: "timer", status: "completed" });
      expect(isLiveTimeEntry(listed, "901")).toBe(true);
    });

    it("falls back to the row's own status until the active timer is known", () => {
      expect(isLiveTimeEntry(stale, undefined)).toBe(true);
      expect(isLiveTimeEntry(entry({ id: 1, entry_type: "manual", status: "running" }), undefined)).toBe(false);
    });
  });

  describe("which entries it lists", () => {
    it("shows the five most recently active, newest first", () => {
      const entries = [
        entry({ id: 1, created_at: "2026-03-01" }),
        entry({ id: 2, created_at: "2026-03-01", updated_at: "2026-03-09" }),
        entry({ id: 3, created_at: "2026-03-05" }),
        entry({ id: 4, created_at: "2026-03-02" }),
        entry({ id: 5, created_at: "2026-03-03" }),
        entry({ id: 6, created_at: "2026-03-04" }),
      ];
      expect(recentTimeEntries(entries).map((each) => each.id)).toEqual([2, 3, 6, 5, 4]);
    });

    it("breaks ties by creation date, then by the order they arrived", () => {
      const entries = [
        entry({ id: 1, updated_at: "2026-03-09", created_at: "2026-03-01" }),
        entry({ id: 2, updated_at: "2026-03-09", created_at: "2026-03-02" }),
        entry({ id: 3 }),
        entry({ id: 4 }),
      ];
      expect(recentTimeEntries(entries).map((each) => each.id)).toEqual([2, 1, 3, 4]);
    });
  });

  describe("what a row says", () => {
    it("titles by task and project, else 'General task'", () => {
      expect(timeEntryTitle(entry({ task_name: "Design", project_name: "Fitout" }))).toBe("Design — Fitout");
      expect(timeEntryTitle(entry({ task_name: "Design" }))).toBe("Design");
      expect(timeEntryTitle(entry({}))).toBe("General task");
    });

    it("says Running now while running", () => {
      expect(timeEntrySub(entry({ entry_type: "timer", status: "running" }))).toBe("Running now");
    });

    it("says the duration and whether it's been invoiced", () => {
      expect(timeEntrySub(entry({ duration_minutes: 90 }))).toBe("1.5 hrs · not yet invoiced");
      expect(timeEntrySub(entry({ duration: 45, is_invoiced: 1 }))).toBe("45 min · invoiced");
      expect(timeEntrySub(entry({}))).toBe("0 min · not yet invoiced");
    });

    it("totals the listed minutes for the headline figure", () => {
      expect(entryMinutes(entry({ duration_minutes: "30.4" }))).toBe(30);
      expect(totalEntryMinutes([entry({ duration_minutes: 30 }), entry({ duration: 60 }), entry({})])).toBe(90);
    });
  });

  describe("the row's button", () => {
    it("is Stop on a running timer", () => {
      expect(timeEntryAction(entry({ entry_type: "timer", status: "running" }))).toEqual({
        label: "Stop",
        disabled: false,
      });
    });

    it("is Invoice on an entry not yet invoiced", () => {
      expect(timeEntryAction(entry({}))).toEqual({ label: "Invoice", disabled: false });
    });

    it("is a disabled Invoiced on one that has been", () => {
      expect(timeEntryAction(entry({ is_invoiced: true }))).toEqual({ label: "Invoiced", disabled: true });
    });
  });

  describe("Invoice", () => {
    const billable = entry({
      id: 501,
      task_id: 40,
      task_name: "Design",
      project_id: 7,
      project_name: "Fitout",
      client_id: 12,
      client_name: "Acme",
      rate: 100,
      is_billable: 1,
      duration_minutes: 90,
      amount: 150,
      status: "completed",
      log_date: "2026-03-09",
    });

    it("builds one line at the task's rate, billed to its client", () => {
      const result = timeEntryInvoice(billable);
      if ("error" in result) throw new Error(result.error);

      expect(result.logIds).toEqual(["501"]);
      expect(result.seed.clientId).toBe("12");
      expect(result.seed.clientName).toBe("Acme");
      expect(result.seed.items).toHaveLength(1);
      expect(result.seed.items[0]).toMatchObject({ description: "Design", quantity: "1.5", price: "100" });
      expect(result.amount).toBe(150);
    });

    it("refuses an entry that's been invoiced already", () => {
      expect(timeEntryInvoice({ ...billable, is_invoiced: 1 })).toEqual({
        error: "Select at least one time entry that isn't invoiced yet.",
      });
    });

    it("refuses a non-billable entry", () => {
      expect(timeEntryInvoice({ ...billable, is_billable: 0 })).toEqual({
        error: "These entries are non-billable. Mark the task billable to invoice it.",
      });
    });

    it("treats an entry with no billable flag as billable, as the old flow did", () => {
      expect("error" in timeEntryInvoice({ ...billable, is_billable: undefined })).toBe(false);
    });
  });

  describe("Stop on a timer with no client", () => {
    const timer = (over: Partial<ActiveTimer>): ActiveTimer => ({
      id: "t1",
      taskId: "40",
      clientId: null,
      contactId: null,
      clientName: "",
      projectId: null,
      jobId: null,
      isBillable: true,
      hourlyRate: "",
      elapsedSeconds: 0,
      isPaused: false,
      raw: {},
      ...over,
    });

    it("seeds the save-and-stop dialog from what the timer already carries", () => {
      expect(
        selectionFromTimer(
          timer({ clientId: "12", contactId: "3", clientName: "Acme", projectId: "7", jobId: "8", hourlyRate: "120" }),
        ),
      ).toEqual({
        client: { clientId: "12", contactId: "3", name: "Acme", email: "" },
        assignProject: true,
        projectId: "7",
        jobId: "8",
        isBillable: true,
        hourlyRate: "120",
      });
    });

    it("leaves the client empty for the dialog to ask for, and falls back to the task's rate", () => {
      expect(selectionFromTimer(timer({ raw: { taskDetail: { rate: 95 } } }))).toMatchObject({
        client: null,
        assignProject: false,
        hourlyRate: "95",
      });
    });

    it("labels the timer's project and job", () => {
      expect(
        timerProjectLabel(
          timer({ raw: { taskDetail: { projectDetail: { project_name: "Fitout" }, jobDetail: { job_name: "Stage 1" } } } }),
        ),
      ).toBe("Fitout · Stage 1");
      expect(timerProjectLabel(timer({}))).toBe("");
      expect(timerProjectLabel(null)).toBe("");
    });
  });
});

/* ------------------------------------------------------------------ *
 * Projects — ProjectsCard.js
 * ------------------------------------------------------------------ */

describe("Projects card", () => {
  const project = (over: Partial<UniboxProject>): UniboxProject => ({ id: 1, ...over });

  it("names a project, falling back to project_name, else 'Untitled project'", () => {
    expect(projectName(project({ name: "Fitout" }))).toBe("Fitout");
    expect(projectName(project({ project_name: "Reno" }))).toBe("Reno");
    expect(projectName(project({}))).toBe("Untitled project");
  });

  it("says the client, status (Active by default) and due date", () => {
    expect(projectSub(project({ client_name: "Acme", status: "On hold", end_date: "2026-12-01T12:00:00" }))).toBe(
      "Acme · On hold · Due 1 Dec",
    );
    expect(projectSub(project({}))).toBe("Active");
  });

  it("keys the tile colour by status", () => {
    expect(projectStatusKey(project({ status: "On hold" }))).toBe("on_hold");
    expect(projectStatusKey(project({ status: "Completed" }))).toBe("completed");
    expect(projectStatusKey(project({}))).toBe("active");
  });
});

/* ------------------------------------------------------------------ *
 * Work coming up — WorkComingUpCard.js
 * ------------------------------------------------------------------ */

describe("Work coming up card", () => {
  const task = (over: Partial<UniboxPlannerTask>): UniboxPlannerTask => ({ id: 1, is_billable: 1, ...over });

  describe("what counts as done", () => {
    it.each([
      ["is_completed", { is_completed: true }],
      ["completed_at", { completed_at: "2026-03-01" }],
      ["a closed stage", { stage: { category: "Closed" } }],
      ["a Done stage", { stage: { name: "Done" } }],
      ["a done status", { status: "done" }],
      ["a completed status", { status: "Completed" }],
    ])("a task with %s is done", (_label, over) => {
      expect(isCompletedTask(task(over as Partial<UniboxPlannerTask>))).toBe(true);
    });

    it("a task in progress isn't", () => {
      expect(isCompletedTask(task({ stage: { name: "In progress" }, status: "open" }))).toBe(false);
    });
  });

  it("lists billable tasks that aren't done, up to five", () => {
    const tasks = [
      task({ id: 1 }),
      task({ id: 2, is_billable: 0 }),
      task({ id: 3, is_billable: "true" }),
      task({ id: 4, status: "done" }),
      ...many(5, (index) => task({ id: 10 + index })),
    ];
    expect(workComingUpRows(tasks).map((each) => each.id)).toEqual([1, 3, 10, 11, 12]);
  });

  it("reads a task's value from amount, total or value", () => {
    expect(taskAmount(task({ amount: 100 }))).toBe(100);
    expect(taskAmount(task({ total: "50" }))).toBe(50);
    expect(taskAmount(task({ value: 25 }))).toBe(25);
    expect(taskAmount(task({}))).toBe(0);
  });

  it("totals what's booked across the listed tasks", () => {
    expect(totalBooked([task({ amount: 100 }), task({ total: 50 }), task({})])).toBe(150);
  });

  it("says Not scheduled without a valid start", () => {
    expect(taskDate(null)).toBe("Not scheduled");
    expect(taskDate("not a date")).toBe("Not scheduled");
  });

  it("formats a start with day, date and time", () => {
    const text = taskDate("2026-03-09T09:30:00");
    expect(text).toContain("9 Mar");
    expect(text).toMatch(/9:30/);
  });

  it("names the client from the contact first, then the client", () => {
    expect(taskClient(task({ contact: { name: "Sam" }, client: { name: "Acme" } }))).toBe("Sam");
    expect(taskClient(task({ contact: { label: "Sam L" } }))).toBe("Sam L");
    expect(taskClient(task({ client: { business_name: "Acme Pty", name: "Acme" } }))).toBe("Acme Pty");
    expect(taskClient(task({ client: { name: "Acme" } }))).toBe("Acme");
    expect(taskClient(task({}))).toBe("");
  });

  it("puts when and for whom together", () => {
    expect(taskWhen(task({ client: { name: "Acme" } }))).toBe("Not scheduled · Acme");
  });

  it("hands the invoice flow the event, its times and its stage", () => {
    const planner = plannerTaskFor(
      task({
        event_id: 568,
        task_name: "Install",
        start_at: "2026-03-09T09:00:00",
        end_at: "2026-03-09T11:00:00",
        is_billable: true,
        stage: { name: "Booked", color: "#123456" },
      }),
      0,
    );
    expect(planner).toMatchObject({
      id: "568",
      event_id: "568",
      task_name: "Install",
      start_time: "2026-03-09T09:00:00",
      end_time: "2026-03-09T11:00:00",
      is_billable: true,
      stage_name: "Booked",
    });
  });

  it("uses the row id as the event when there's no event id", () => {
    expect(plannerTaskFor(task({ id: 77 }), 0).event_id).toBe("77");
  });
});

/* ------------------------------------------------------------------ *
 * KM tracker — KmTrackerCard.js
 * ------------------------------------------------------------------ */

describe("KM tracker card", () => {
  const trip = (over: Partial<UniboxTrip>): UniboxTrip => ({ id: 1, ...over });

  it("reads the trip id from id, else _id", () => {
    expect(tripId(trip({ id: 5 }))).toBe("5");
    expect(tripId({ _id: "abc" })).toBe("abc");
  });

  it("counts a trip as invoiced by flag or by invoice id", () => {
    expect(isTripInvoiced(trip({ is_invoiced: 1 }))).toBe(true);
    expect(isTripInvoiced(trip({ invoice_id: 9 }))).toBe(true);
    expect(isTripInvoiced(trip({}))).toBe(false);
  });

  it("is ready to invoice when billable and not yet invoiced", () => {
    expect(isTripReadyToInvoice(trip({ is_billable: 1 }))).toBe(true);
    expect(isTripReadyToInvoice(trip({ isBillable: true }))).toBe(true);
    expect(isTripReadyToInvoice(trip({ is_billable: 1, invoice_id: 9 }))).toBe(false);
    expect(isTripReadyToInvoice(trip({ is_billable: 0 }))).toBe(false);
  });

  it("lists three, ready-to-invoice trips first", () => {
    const trips = [
      trip({ id: 1 }),
      trip({ id: 2, is_billable: 1 }),
      trip({ id: 3 }),
      trip({ id: 4, is_billable: 1 }),
      trip({ id: 5 }),
    ];
    const shown = kmRows(trips);
    expect(shown).toHaveLength(KM_ROW_LIMIT);
    expect(shown.map((each) => each.id)).toEqual([2, 4, 1]);
  });

  it("totals the listed kilometres", () => {
    expect(totalKm([trip({ distance: "12.5" }), trip({ distance: 7 }), trip({})])).toBe(19.5);
  });

  it("labels the trip type, else Unclassified", () => {
    expect(tripTypeLabel("business")).toBe("Business");
    expect(tripTypeLabel("personal")).toBe("Personal");
    expect(tripTypeLabel("split")).toBe("Split");
    expect(tripTypeLabel(undefined)).toBe("Unclassified");
  });

  it("shows distances to two places", () => {
    expect(formatTripDistance(12.5)).toBe("12.50");
    expect(formatTripDistance("3")).toBe("3.00");
  });

  it("shortens a location to its first part, with an ellipsis past 24 characters", () => {
    expect(shortenLocation("1 George St, Sydney NSW")).toBe("1 George St");
    expect(shortenLocation("A very long street name that goes on")).toBe("A very long street name…");
    expect(shortenLocation(null)).toBe("");
  });

  it("titles a trip by reason and route, else reason and distance, else the reason", () => {
    expect(tripTitle(trip({ reason: "Site visit", start_location: "Home, Sydney", end_location: "Office, Parramatta" }))).toBe(
      "Site visit (Home → Office)",
    );
    expect(tripTitle(trip({ reason: "Site visit", distance: 12 }))).toBe("Site visit · 12.00 km");
    expect(tripTitle(trip({}))).toBe("Trip");
  });

  it("keeps the whole route for the tooltip", () => {
    expect(fullTripTitle(trip({ reason: "Visit", start_location: "Home, Sydney", end_location: "Office" }))).toBe(
      "Visit (Home, Sydney → Office)",
    );
    expect(fullTripTitle(trip({}))).toBe("Trip");
  });

  it("says the date, distance and type", () => {
    expect(tripSub(trip({ date: "2026-03-09T12:00:00", distance: 12.5, trip_type: "business" }))).toBe(
      "9 Mar · 12.50 km · Business",
    );
    expect(tripSub(trip({}))).toBe("Unclassified");
  });

  it("hands the invoice dialog the trip with its distance and billing state", () => {
    const km = kmTripFor(trip({ id: 5, distance: 12.5, is_billable: 1, client_id: 12, reason: "Visit" }));
    expect(km).toMatchObject({ id: "5", distanceKm: 12.5, isBillable: true, isInvoiced: false, clientId: "12" });
  });
});

/* ------------------------------------------------------------------ *
 * Your progress — YourProgressCard.js
 * ------------------------------------------------------------------ */

describe("Your progress card", () => {
  it("falls back sensibly with no data", () => {
    expect(progressView(null)).toMatchObject({
      score: 0,
      level: "Regular",
      nextLevelText: "Top tier!",
      percent: 0,
      counts: [],
      days: [],
      totalThisWeek: 0,
      comparison: { direction: "same", label: "Same as last week" },
      recent: [],
    });
  });

  it("says how many more to the next level", () => {
    expect(progressView({ streak: { level: "Pro", next_level: "Expert", to_next_level: 4 } }).nextLevelText).toBe(
      "4 more to Expert",
    );
  });

  it("says Top tier! with nothing left to reach", () => {
    expect(progressView({ streak: { next_level: "Expert", to_next_level: 0 } }).nextLevelText).toBe("Top tier!");
  });

  it("clamps the level bar between 0 and 100", () => {
    expect(progressView({ streak: { progress_percent: 140 } }).percent).toBe(100);
    expect(progressView({ streak: { progress_percent: -5 } }).percent).toBe(0);
  });

  it("uses the server's day labels when they line up with the counts", () => {
    const view = progressView({ activity: { counts: [1, 2], days: ["M", "T"] } });
    expect(view.days).toEqual(["M", "T"]);
  });

  it("falls back to its own labels when they don't", () => {
    const view = progressView({ activity: { counts: [0, 1, 0, 0, 0, 0, 3], days: ["x"] } });
    expect(view.days).toEqual(["S", "S", "M", "T", "W", "T", "Today"]);
    expect(view.max).toBe(3);
  });

  it("scales bars against at least one, so an empty week doesn't divide by zero", () => {
    expect(progressView({ activity: { counts: [0, 0] } }).max).toBe(1);
  });

  it("shows the five most recent actions", () => {
    const recent = many(8, (index) => ({ id: index, title: `Action ${index}` }));
    expect(progressView({ recent_actions: recent }).recent).toHaveLength(5);
  });

  it("passes the week's comparison through", () => {
    expect(
      progressView({ activity: { comparison: { direction: "behind", label: "Behind last week" } } }).comparison,
    ).toEqual({ direction: "behind", label: "Behind last week" });
  });

  describe("hovering a bar", () => {
    // Wednesday 11 March 2026, mid-afternoon.
    const NOW = new Date("2026-03-11T15:00:00").getTime();

    it("says the count in full", () => {
      expect(actionCountText(0)).toBe("0 actions");
      expect(actionCountText(1)).toBe("1 action");
      expect(actionCountText(3)).toBe("3 actions");
    });

    it("calls the last bar Today", () => {
      expect(activityDayLabel(6, 7, NOW)).toBe("Today");
    });

    it("dates each earlier bar a day further back", () => {
      expect(activityDayLabel(5, 7, NOW)).toBe("Tue 10 Mar");
      expect(activityDayLabel(0, 7, NOW)).toBe("Thu 5 Mar");
    });

    it("tells the two S bars apart", () => {
      // The server labels both weekend days "S".
      expect(activityDayLabel(2, 7, NOW)).toBe("Sat 7 Mar");
      expect(activityDayLabel(3, 7, NOW)).toBe("Sun 8 Mar");
    });

    it("crosses a month boundary", () => {
      const first = new Date("2026-04-02T09:00:00").getTime();
      expect(activityDayLabel(4, 7, first)).toBe("Tue 31 Mar");
    });

    it("lands on the right calendar day whatever the time", () => {
      const lateNight = new Date("2026-03-11T23:59:00").getTime();
      expect(activityDay(5, 7, lateNight).getDate()).toBe(10);
    });
  });
});
