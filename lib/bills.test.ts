import { beforeEach, describe, expect, it, vi } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

const {
  approveBillApi,
  approveIssues,
  billBadge,
  billIssues,
  billTotals,
  createBillApi,
  deleteBillsApi,
  billDueClass,
  emptyBillDraft,
  emptyRepeatDraft,
  fetchBillPossibleMatches,
  fetchBillSchedule,
  fetchBillSummary,
  matchBillApi,
  stepRepeatDate,
  fetchBillsPage,
  fetchUpcomingBills,
  groupUpcoming,
  newBillLine,
  saveIssues,
  scheduleIssues,
  updateBillApi,
} = await import("@/lib/bills");
const { extractBillApi } = await import("@/lib/ocr-capture");

beforeEach(() => vi.clearAllMocks());

describe("billTotals", () => {
  it("taxes only ticked lines, on amounts entered excluding tax — the server's own sums", () => {
    const totals = billTotals(
      [
        newBillLine({ description: "Paper", quantity: "2", price: "50", gst: true }),
        newBillLine({ description: "Postage", quantity: "1", price: "50", gst: false }),
      ],
      10,
    );
    expect(totals).toMatchObject({ subTotal: 150, totalGst: 10, total: 160 });
    expect(totals.rows.map((row) => row.gross)).toEqual([110, 50]);
  });

  it("carries no tax at a zero rate (a business that isn't registered)", () => {
    const totals = billTotals([newBillLine({ quantity: "1", price: "100", gst: true })], 0);
    expect(totals).toMatchObject({ totalGst: 0, total: 100 });
  });
});

describe("validation", () => {
  const draft = (overrides = {}) => ({ ...emptyBillDraft("2026-10-01"), ...overrides });

  it("lets an incomplete draft save, but not a wrong one", () => {
    expect(billIssues(draft())).toEqual([]);
    expect(billIssues(draft({ lines: [newBillLine({ description: "Paper", quantity: "0", price: "5" })] }))).toHaveLength(1);
    expect(billIssues(draft({ dueDate: "2026-09-01" })).map((issue) => issue.key)).toEqual(["dueDate"]);
  });

  it("starts a new bill due on its bill date, and won't save one without a due date", () => {
    expect(emptyBillDraft("2026-10-01")).toMatchObject({ billDate: "2026-10-01", dueDate: "2026-10-01" });
    const ready = { supplierId: "100", categoryId: "55" };
    expect(saveIssues(draft({ ...ready, dueDate: "" })).map((issue) => issue.key)).toEqual(["dueDate"]);
  });

  it("needs a supplier and a category to save, and a next date once it repeats", () => {
    expect(saveIssues(draft()).map((issue) => issue.key)).toEqual(["supplier", "category"]);
    const ready = { supplierId: "100", categoryId: "55" };
    const repeat = (values = {}) => ({ repeat: { ...emptyRepeatDraft(), enabled: true, ...values } });
    expect(saveIssues(draft(ready))).toEqual([]);
    expect(saveIssues(draft({ ...ready, ...repeat() })).map((issue) => issue.key)).toEqual(["repeatNextDate"]);
    expect(saveIssues(draft({ ...ready, ...repeat({ nextDate: "2026-10-01" }) })).map((issue) => issue.key)).toEqual(["repeatNextDate"]);
    expect(saveIssues(draft({ ...ready, ...repeat({ nextDate: "2026-11-01" }) }))).toEqual([]);
    // A bill already in a series doesn't start one, so its repeat fields aren't checked.
    expect(saveIssues(draft({ ...ready, ...repeat() }), false)).toEqual([]);
  });

  it("checks when a repeat ends: a date after the next bill, or two or more bills counting this one", () => {
    const ready = { supplierId: "100", categoryId: "55" };
    const keys = (values: object) =>
      saveIssues(draft({ ...ready, repeat: { ...emptyRepeatDraft(), enabled: true, nextDate: "2026-11-01", ...values } })).map(
        (issue) => issue.key,
      );
    expect(keys({ endType: "on_date" })).toEqual(["repeatEndDate"]);
    expect(keys({ endType: "on_date", endDate: "2026-10-15" })).toEqual(["repeatEndDate"]);
    expect(keys({ endType: "on_date", endDate: "2027-06-30" })).toEqual([]);
    expect(keys({ endType: "after_count", totalCount: "1" })).toEqual(["repeatTotalCount"]);
    expect(keys({ endType: "after_count", totalCount: "12" })).toEqual([]);
  });

  it("won't let a schedule's count fall to the bills it has already made, or its next bill sit in the past", () => {
    const schedule = {
      supplierId: "100",
      supplierName: "Landlord",
      categoryId: "55",
      category: "Rent",
      notes: "",
      frequency: "monthly" as const,
      nextDate: "2026-12-01",
      dueDays: "0",
      endType: "after_count" as const,
      endDate: "",
      totalCount: "3",
      lines: [newBillLine({ description: "Rent", price: "700" })],
    };
    expect(scheduleIssues(schedule, 2, "2026-11-14")).toEqual([]);
    expect(scheduleIssues({ ...schedule, totalCount: "2" }, 2, "2026-11-14").map((issue) => issue.key)).toEqual(["repeatTotalCount"]);
    expect(scheduleIssues({ ...schedule, nextDate: "2026-11-01" }, 2, "2026-11-14").map((issue) => issue.key)).toEqual(["repeatNextDate"]);
    expect(scheduleIssues({ ...schedule, dueDays: "1.5" }, 2, "2026-11-14").map((issue) => issue.key)).toEqual(["dueDays"]);
    // Every copy needs a due date, so the gap can't be left blank.
    expect(scheduleIssues({ ...schedule, dueDays: "" }, 2, "2026-11-14").map((issue) => issue.key)).toEqual(["dueDays"]);
  });

  it("names everything converting still needs", () => {
    expect(approveIssues(draft({ billDate: "" }), 0).map((issue) => issue.key)).toEqual(["supplier", "category", "billDate", "total"]);
    expect(approveIssues(draft({ supplierId: "100", categoryId: "55" }), 160)).toEqual([]);
  });
});

describe("API", () => {
  it("sends the lines encrypted, without blank rows", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 40, duplicate_of: 12 } } });
    const result = await createBillApi({
      ...emptyBillDraft("2026-10-01"),
      supplierId: "100",
      billNo: " INV-1042 ",
      lines: [newBillLine({ description: "Paper", quantity: "2", price: "50", gst: true }), newBillLine()],
    });

    expect(result).toEqual({ id: "40", duplicateOf: "12" });
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.bill.create);
    const payload = decryptPayload((body as { data: string }).data);
    expect(payload).toMatchObject({
      client_id: "100",
      bill_no: "INV-1042",
      bill_date: "2026-10-01",
      items: [{ description: "Paper", qty: 2, price: 50, gst: true }],
    });
    expect(payload).not.toHaveProperty("repeat");
  });

  it("sends a repeat only when the bill starts one, with just the end field its rule needs", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 41 } } });
    apiMock.put.mockResolvedValue({ data: { success: true, data: { id: 41 } } });
    const repeating = {
      ...emptyBillDraft("2026-10-01"),
      repeat: { enabled: true, frequency: "monthly" as const, nextDate: "2026-11-01", endType: "after_count" as const, endDate: "2027-01-01", totalCount: "12" },
    };
    await createBillApi(repeating);
    expect((decryptPayload((apiMock.post.mock.calls[0][1] as { data: string }).data) as { repeat?: unknown }).repeat).toEqual({
      frequency: "monthly",
      next_date: "2026-11-01",
      end_type: "after_count",
      end_date: null,
      total_count: 12,
    });

    await updateBillApi("41", repeating, false);
    expect(decryptPayload((apiMock.put.mock.calls[0][1] as { data: string }).data)).not.toHaveProperty("repeat");
  });

  it("asks the server to stop the repeats of deleted bills only when told to", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await deleteBillsApi(["1", "2"]);
    expect(decryptPayload((apiMock.post.mock.calls[0][1] as { data: string }).data)).toEqual({ bills: ["1", "2"] });
    await deleteBillsApi(["1"], { stopSchedule: true });
    // The encrypted body carries top-level flags as text; the server reads "true" as on.
    expect(decryptPayload((apiMock.post.mock.calls[1][1] as { data: string }).data)).toEqual({ bills: ["1"], stop_schedule: "true" });
  });

  it("treats the plan limit's 200 with success: false as a failure", async () => {
    apiMock.post.mockResolvedValue({ data: { success: false, message: "expense limit reached." } });
    await expect(approveBillApi("40")).rejects.toThrow("expense limit reached.");
  });

  it("asks for the status filter in the server's words", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          bills: [
            {
              bill_id: 40,
              bill_no: "INV-1042",
              bill_date: "2026-10-01",
              due_date: "2026-10-31",
              status: "approved",
              payment_status: "part_paid",
              is_overdue: true,
              amount_paid: 60,
              amount_due: 100,
              total: 160,
              expense_id: 700,
              possible_match: 2,
              occurrence_no: 3,
              schedule: { schedule_id: 9, frequency: "monthly", status: "active", next_date: "2026-11-01", end_type: "after_count", total_count: 12, occurrences_made: 3 },
              client: { client_id: 100, name: "Officeworks" },
            },
          ],
          pagination: { total: 1 },
        },
      },
    });

    const { bills, total } = await fetchBillsPage(1, 25, { status: "Overdue", search: " office ", from: "2026-10-01", to: "2026-10-31", supplierId: "100" });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.bill.list, {
      params: { page: 1, limit: 25, status: "overdue", search: "office", from: "2026-10-01", to: "2026-10-31", client_id: "100" },
    });
    expect(total).toBe(1);
    expect(bills[0]).toMatchObject({
      id: "40",
      paymentStatus: "part_paid",
      isOverdue: true,
      amountPaid: 60,
      amountDue: 100,
      possibleMatch: 2,
      expenseId: "700",
      supplierName: "Officeworks",
      total: 160,
      occurrenceNo: 3,
      schedule: { id: "9", frequency: "monthly", status: "active", endType: "after_count", totalCount: 12, occurrencesMade: 3 },
    });
  });

  it("reads the forward-looking summary buckets", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          as_of: "2026-11-14",
          paid_this_month: { amount: "1620.5", count: 2 },
          overdue: { amount: 451.35, count: 2 },
          due_7_days: { amount: "972", count: 3, expected_count: 1 },
          due_30_days: { amount: 2400.5, count: 6, expected_count: 2 },
          owed: { amount: 2851.85, count: 9 },
        },
      },
    });
    const summary = await fetchBillSummary();
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.bill.summary);
    expect(summary).toEqual({
      asOf: "2026-11-14",
      paidThisMonth: { amount: 1620.5, count: 2 },
      overdue: { amount: 451.35, count: 2, expectedCount: 0 },
      due7: { amount: 972, count: 3, expectedCount: 1 },
      due30: { amount: 2400.5, count: 6, expectedCount: 2 },
      owed: { amount: 2851.85, count: 9, expectedCount: 0 },
    });
  });

  it("looks for a bill's payments the way the expense dialog does, and matches them in one call", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          list: [{ id: 77, transaction_date: "2026-11-10", description: "BPAY ORIGIN", reference: null, amount: "130.50", available_amount: "130.50" }],
          remaining_amount: "130.50",
        },
      },
    });
    const matches = await fetchBillPossibleMatches("40", true);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.bill.possibleMatches("40"), { params: { multiple_match_mode: "true" } });
    expect(matches).toEqual({
      candidates: [{ id: "77", date: "2026-11-10", description: "BPAY ORIGIN", reference: "", amount: 130.5, availableAmount: 130.5 }],
      remainingAmount: 130.5,
    });

    apiMock.post.mockResolvedValueOnce({
      data: { success: true, data: { bill_id: 40, expense_id: 700, created_expense: true, payment_status: "paid", amount_due: 0 } },
    });
    const result = await matchBillApi("40", ["77"]);
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.bill.match("40"));
    expect(decryptPayload((body as { data: string }).data)).toEqual({ transaction_ids: ["77"] });
    expect(result).toEqual({ expenseId: "700", createdExpense: true, paymentStatus: "paid", amountDue: 0 });

    apiMock.post.mockResolvedValueOnce({ data: { success: false, message: "That transaction is already matched." } });
    await expect(matchBillApi("40", ["77"])).rejects.toThrow("That transaction is already matched.");
  });

  it("reads upcoming bills and the copies schedules will make", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          as_of: "2026-11-14",
          bills: [{ bill_id: 1, status: "draft", payment_status: "unpaid", total: 50, due_date: "2026-11-20" }],
          expected: [
            {
              schedule_id: 9,
              occurrence_no: 4,
              total_count: 12,
              frequency: "monthly",
              bill_date: "2026-12-01",
              due_date: null,
              total: 700,
              client: { client_id: 5, name: "Landlord" },
            },
          ],
        },
      },
    });
    const upcoming = await fetchUpcomingBills(60);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.bill.upcoming, { params: { days: 60 } });
    expect(upcoming.bills[0]).toMatchObject({ id: "1", amountDue: 50, paymentStatus: "unpaid" });
    expect(upcoming.expected[0]).toEqual({
      key: "9-4",
      scheduleId: "9",
      occurrenceNo: 4,
      totalCount: 12,
      frequency: "monthly",
      billDate: "2026-12-01",
      dueDate: "",
      total: 700,
      supplierId: "5",
      supplierName: "Landlord",
      category: "",
      skipped: false,
    });
  });

  it("reads a schedule with its bills and what's coming", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          schedule_id: 9,
          frequency: "fortnightly",
          status: "active",
          next_date: "2026-11-20",
          due_days: 0,
          end_type: "never",
          occurrences_made: 2,
          total: 120,
          items: [{ description: "Cleaning", qty: 1, price: 120, gst: 0 }],
          bills: [{ bill_id: 3, status: "approved", payment_status: "paid", total: 120, occurrence_no: 2 }],
          upcoming: [{ schedule_id: 9, occurrence_no: 3, bill_date: "2026-11-20", total: 120 }],
        },
      },
    });
    const schedule = await fetchBillSchedule("9");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.bill.schedule("9"));
    expect(schedule).toMatchObject({ id: "9", frequency: "fortnightly", dueDays: 0, endType: "never", totalCount: null, occurrencesMade: 2 });
    expect(schedule.lines[0]).toMatchObject({ description: "Cleaning", price: "120" });
    expect(schedule.bills[0]).toMatchObject({ id: "3", paymentStatus: "paid", occurrenceNo: 2 });
    expect(schedule.upcoming[0].key).toBe("9-3");
  });

  it("passes on a scanned bill's foreign currency, and keeps the lines' recorded rate", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        success: true,
        extractedData: {
          supplier_name: "Amazon US",
          bill_date: "2026-10-01",
          items: [{ description: "Cables", qty: 2, price: 10 }],
          items_taxed: false,
          currency: "USD",
          business_currency: "NZD",
          foreign_currency: true,
          confidence: 80,
        },
      },
    });
    const file = new File(["x"], "bill.pdf", { type: "application/pdf" });
    const { fields, confidence } = await extractBillApi(file, { identifier: "k", source: "s3" }, "2026-10-28");
    expect(apiMock.post).toHaveBeenCalledWith(apiRoutes.bill.extract, { s3Key: "k", fileType: "application/pdf" });
    expect(confidence).toBe(0.8);
    expect(fields.foreignCurrency).toEqual({ currency: "USD", businessCurrency: "NZD" });
    expect(fields.lines).toEqual([{ description: "Cables", quantity: "2", price: "10", gst: false }]);

    apiMock.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: { bill_id: 40, status: "draft", payment_status: "unpaid", items: [{ description: "Paper", qty: 1, price: 100, gst: 1, gst_percentage: 15 }] },
      },
    });
    const { fetchBillDetail } = await import("@/lib/bills");
    expect((await fetchBillDetail("40")).gstPercent).toBe(15);
  });
});

describe("labels", () => {
  const bill = (values = {}) => ({ status: "approved" as const, paymentStatus: "unpaid" as const, isOverdue: false, ...values });

  it("shows overdue over everything still owed, and Saved for a bill not converted yet", () => {
    expect(billBadge(bill()).label).toBe("Unpaid");
    expect(billBadge(bill({ status: "draft" })).label).toBe("Saved");
    expect(billBadge(bill({ status: "draft", isOverdue: true })).label).toBe("Overdue");
    expect(billBadge(bill({ paymentStatus: "part_paid" })).label).toBe("Part paid");
    expect(billBadge(bill({ paymentStatus: "part_paid", isOverdue: true })).label).toBe("Overdue");
    expect(billBadge(bill({ paymentStatus: "paid" })).variant).toBe("success");
    expect(billBadge(bill({ status: "void", paymentStatus: "void" })).label).toBe("Void");
  });

  it("colours the due date like the invoice list: red overdue, amber within a week, muted otherwise or once paid", () => {
    const today = "2026-11-14";
    const due = (dueDate: string, values = {}) => billDueClass({ ...bill(values), dueDate }, today);
    expect(due("2026-11-13")).toContain("text-destructive");
    expect(due("2026-11-14")).toContain("text-warning");
    expect(due("2026-11-21")).toContain("text-warning");
    expect(due("2026-11-22")).toBe("text-muted-foreground");
    expect(due("2026-11-01", { paymentStatus: "paid" })).toBe("text-muted-foreground");
    expect(due("")).toBe("text-muted-foreground");
  });
});

describe("stepRepeatDate", () => {
  it("moves one repeat on, keeping the day where the month has it", () => {
    expect(stepRepeatDate("2026-11-14", "weekly")).toBe("2026-11-21");
    expect(stepRepeatDate("2026-12-25", "fortnightly")).toBe("2027-01-08");
    expect(stepRepeatDate("2026-11-14", "monthly")).toBe("2026-12-14");
    expect(stepRepeatDate("2027-01-31", "monthly")).toBe("2027-02-28");
    expect(stepRepeatDate("2026-11-30", "quarterly")).toBe("2027-02-28");
    expect(stepRepeatDate("2026-08-31", "half_yearly")).toBe("2027-02-28");
    expect(stepRepeatDate("2028-02-29", "yearly")).toBe("2029-02-28");
    expect(stepRepeatDate("", "monthly")).toBe("");
  });
});

describe("groupUpcoming", () => {
  const owed = (id: string, dueDate: string, amountDue: number, values = {}) =>
    ({
      ...({} as Awaited<ReturnType<typeof fetchUpcomingBills>>["bills"][number]),
      id,
      dueDate,
      amountDue,
      status: "draft",
      paymentStatus: "unpaid",
      isOverdue: false,
      ...values,
    }) as Awaited<ReturnType<typeof fetchUpcomingBills>>["bills"][number];

  it("buckets owed bills and expected copies by when they're due, soonest first, with totals", () => {
    const groups = groupUpcoming(
      [
        owed("a", "2026-11-10", 100),
        owed("b", "2026-11-20", 50.5),
        owed("c", "2026-12-10", 20),
        owed("d", "", 5),
        owed("paid", "2026-11-15", 0, { paymentStatus: "paid", status: "approved" }),
      ],
      [
        {
          key: "9-4",
          scheduleId: "9",
          occurrenceNo: 4,
          totalCount: null,
          frequency: "monthly",
          billDate: "2026-11-16",
          dueDate: "",
          total: 700,
          supplierId: null,
          supplierName: "Landlord",
          category: "",
          skipped: false,
        },
        {
          key: "9-5",
          scheduleId: "9",
          occurrenceNo: 5,
          totalCount: null,
          frequency: "monthly",
          billDate: "2027-01-16",
          dueDate: "",
          total: 700,
          supplierId: null,
          supplierName: "Landlord",
          category: "",
          skipped: false,
        },
      ],
      "2026-11-14",
    );
    expect(groups.map((group) => [group.id, group.total, group.items.length])).toEqual([
      ["overdue", 100, 1],
      ["week", 750.5, 2],
      ["month", 20, 1],
      ["later", 700, 1],
      ["undated", 5, 1],
    ]);
    // The expected copy on the 16th comes before the bill due on the 20th.
    expect(groups[1].items.map((item) => item.kind)).toEqual(["expected", "bill"]);
  });
});

describe("skipping a repeat's bill", () => {
  it("reads a skipped date with no number and its own key, and sends skip / undo with the date", async () => {
    const { skipBillScheduleApi, unskipBillScheduleApi } = await import("@/lib/bills");
    apiMock.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          schedule_id: 9,
          frequency: "monthly",
          status: "active",
          next_date: "2027-01-14",
          occurrences_made: 1,
          upcoming: [
            { schedule_id: 9, occurrence_no: null, skipped: true, bill_date: "2027-01-14", due_date: "2027-01-15", total: 30.5 },
            { schedule_id: 9, occurrence_no: 2, bill_date: "2027-02-14", due_date: "2027-02-15", total: 30.5 },
          ],
        },
      },
    });
    const schedule = await fetchBillSchedule("9");
    expect(schedule.upcoming.map((entry) => [entry.key, entry.skipped, entry.occurrenceNo])).toEqual([
      ["9-skipped-2027-01-14", true, 0],
      ["9-2", false, 2],
    ]);

    apiMock.post.mockResolvedValue({ data: { success: true } });
    await skipBillScheduleApi("9");
    expect(decryptPayload((apiMock.post.mock.calls[0][1] as { data: string }).data)).toEqual({});
    await skipBillScheduleApi("9", "2027-02-14");
    expect(apiMock.post.mock.calls[1][0]).toBe(apiRoutes.bill.scheduleSkip("9"));
    expect(decryptPayload((apiMock.post.mock.calls[1][1] as { data: string }).data)).toEqual({ bill_date: "2027-02-14" });
    await unskipBillScheduleApi("9", "2027-01-14");
    expect(apiMock.post.mock.calls[2][0]).toBe(apiRoutes.bill.scheduleUnskip("9"));
    expect(decryptPayload((apiMock.post.mock.calls[2][1] as { data: string }).data)).toEqual({ bill_date: "2027-01-14" });
  });
});

describe("the form's date rules", () => {
  it("fills the next bill date one repeat on when the repeat is switched on, and follows the frequency until picked", async () => {
    const { withRepeatChange } = await import("@/lib/bills");
    const draft = { ...emptyBillDraft("2026-11-14"), billDate: "2026-11-14" };
    const on = withRepeatChange(draft, { enabled: true }, false, "2026-11-14");
    expect(on).toMatchObject({ enabled: true, frequency: "monthly", nextDate: "2026-12-14" });

    const weekly = withRepeatChange({ ...draft, repeat: on }, { frequency: "weekly" }, false, "2026-11-14");
    expect(weekly.nextDate).toBe("2026-11-21");

    // Picked by hand: kept, and a later frequency change leaves it alone.
    const picked = withRepeatChange({ ...draft, repeat: weekly }, { nextDate: "2027-01-05" }, true, "2026-11-14");
    expect(picked.nextDate).toBe("2027-01-05");
    expect(withRepeatChange({ ...draft, repeat: picked }, { frequency: "quarterly" }, true, "2026-11-14").nextDate).toBe("2027-01-05");
  });

  it("moves the due date and the next bill date with the bill date until each is picked", async () => {
    const { withBillDate } = await import("@/lib/bills");
    const draft = {
      ...emptyBillDraft("2026-11-14"),
      repeat: { ...emptyRepeatDraft(), enabled: true, nextDate: "2026-12-14" },
    };
    expect(withBillDate(draft, "2026-11-20", { duePicked: false, nextPicked: false }, "2026-11-14")).toEqual({
      billDate: "2026-11-20",
      dueDate: "2026-11-20",
      repeat: expect.objectContaining({ nextDate: "2026-12-20" }),
    });
    // A due date picked by hand, or already a different day, stays put; so does a picked next date.
    expect(withBillDate(draft, "2026-11-20", { duePicked: true, nextPicked: true }, "2026-11-14")).toEqual({ billDate: "2026-11-20" });
    expect(withBillDate({ ...draft, dueDate: "2026-12-01" }, "2026-11-20", { duePicked: false, nextPicked: true }, "2026-11-14")).toEqual({
      billDate: "2026-11-20",
    });
  });
});
