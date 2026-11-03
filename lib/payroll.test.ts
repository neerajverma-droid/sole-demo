import { describe, expect, it, vi, beforeEach } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
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

const {
  NO_PAYROLL_SEATS,
  addPayrollSeats,
  connectMicrokeeper,
  disconnectMicrokeeper,
  fetchPayrollOverview,
  fetchPayrollSeats,
  mapMicrokeeperConnection,
  mapPayrollSeats,
  payrollEnabled,
  payrollErrorCode,
  seatLimitReached,
  seatRecurringTotal,
  seatUnitPrice,
  updateMicrokeeperKeys,
  validateMicrokeeperKey,
  verifyMicrokeeper,
  PAYROLL_SEAT_PRICE,
} = await import("@/lib/payroll");

function decryptedBody(body: unknown): Record<string, unknown> {
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was not an encrypted {data} envelope");
  }
  return decryptPayload(asData.data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

const KEY = "A".repeat(32);

describe("seat pricing", () => {
  it("is $4.99 a month or $59.88 a year per seat", () => {
    expect(PAYROLL_SEAT_PRICE).toEqual({ monthly: 4.99, annual: 59.88 });
    expect(seatUnitPrice("MONTHLY")).toBe(4.99);
    expect(seatUnitPrice("YEARLY")).toBe(59.88);
  });

  it("reports the recurring total for the seats' own interval", () => {
    const seats = { ...NO_PAYROLL_SEATS, monthlyCost: 24.95, annualCost: 299.4 };
    expect(seatRecurringTotal(seats)).toBe(24.95);
    expect(seatRecurringTotal({ ...seats, billingInterval: "YEARLY" })).toBe(299.4);
  });
});

describe("payrollEnabled / seatLimitReached", () => {
  const active = {
    ...NO_PAYROLL_SEATS,
    status: "ACTIVE" as const,
    isActive: true,
    employeeLimit: 5,
    activeEmployees: 3,
    availableSeats: 2,
  };

  it("needs an ACTIVE, access-allowed subscription", () => {
    expect(payrollEnabled(active)).toBe(true);
    expect(payrollEnabled({ ...active, status: "PAST_DUE" })).toBe(false);
    expect(payrollEnabled({ ...active, isActive: false })).toBe(false);
    expect(payrollEnabled(null)).toBe(false);
  });

  it("is reached when no seat is free", () => {
    expect(seatLimitReached(active)).toBe(false);
    expect(seatLimitReached({ ...active, activeEmployees: 5, availableSeats: 0 })).toBe(true);
    // Not "full" when payroll isn't on at all — that's a different block.
    expect(seatLimitReached(NO_PAYROLL_SEATS)).toBe(false);
  });
});

describe("validateMicrokeeperKey", () => {
  it("gives sole-webapp's three messages in order", () => {
    expect(validateMicrokeeperKey("Dev Key", " ")).toBe("Dev Key is required.");
    expect(validateMicrokeeperKey("Dev Key", "abc")).toBe(
      "Dev Key must be exactly 32 characters.",
    );
    expect(validateMicrokeeperKey("Dev Key", `${"A".repeat(31)}!`)).toBe(
      "Dev Key can only contain letters and numbers.",
    );
    expect(validateMicrokeeperKey("Dev Key", KEY)).toBeNull();
  });
});

describe("mapPayrollSeats", () => {
  it("coerces string numbers and the legacy ANNUAL interval", () => {
    const seats = mapPayrollSeats({
      status: "ACTIVE",
      isActive: true,
      pricePerEmployee: "4.99",
      billingInterval: "ANNUAL",
      employeeLimit: "10",
      activeEmployees: "4",
      availableSeats: "6",
      monthlyCost: "49.90",
      annualCost: "598.80",
      gracePeriodEnd: null,
    });
    expect(seats.billingInterval).toBe("YEARLY");
    expect(seats.employeeLimit).toBe(10);
    expect(seats.availableSeats).toBe(6);
    expect(seats.monthlyCost).toBe(49.9);
  });

  it("treats an unknown status and a missing record as not started", () => {
    expect(mapPayrollSeats({ status: "WHATEVER" }).status).toBe("NOT_STARTED");
    expect(mapPayrollSeats(null)).toEqual(NO_PAYROLL_SEATS);
  });
});

describe("fetchPayrollSeats", () => {
  it("reads GET /payroll/subscription", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, data: { status: "ACTIVE", isActive: true, employeeLimit: 3 } },
    });
    const seats = await fetchPayrollSeats();
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.subscription);
    expect(seats.employeeLimit).toBe(3);
  });

  it("throws the server message on failure", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: false, message: "Nope" } });
    await expect(fetchPayrollSeats()).rejects.toThrow("Nope");
  });
});

describe("addPayrollSeats", () => {
  it("posts the seat count and recurrence encrypted", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: { success: true, data: { status: "ACTIVE", isActive: true, employeeLimit: 7 } },
    });
    const seats = await addPayrollSeats({ additionalSeats: 2, isRecurring: false });

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.payroll.addSeats);
    const fields = decryptedBody(body);
    expect(fields.additionalSeats).toBe(2);
    // Top-level booleans travel as strings in the envelope; the backend reads
    // "false" as false.
    expect(fields.isRecurring).toBe("false");
    expect(seats.employeeLimit).toBe(7);
  });
});

describe("fetchPayrollOverview", () => {
  it("maps the overview, folding both sub-contractor kinds together", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          business: { name: "Turner Consulting" },
          connection: {
            status: "CONNECTED",
            connected: true,
            microkeeper_business_name: "Turner Pty Ltd",
            last_verified_at: "2026-10-11T09:12:00Z",
            last_sync_at: null,
            last_error: null,
          },
          stats: {
            total_employees: 4,
            active_employees: "3",
            sub_contractor: 1,
            sub_contractor_with_super: 2,
            total_payment_amount: "1234.50",
          },
          latest_payrun: {
            id: 9,
            mk_run_id: 14,
            mk_year: 2026,
            status: "COMPLETED",
            period: "fortnightly",
            payment_total: "8124.40",
            expense_total: null,
            deduction_total: "62",
          },
        },
      },
    });

    const overview = await fetchPayrollOverview();
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.overview);
    expect(overview.businessName).toBe("Turner Consulting");
    expect(overview.connection.businessName).toBe("Turner Pty Ltd");
    expect(overview.stats.activeEmployees).toBe(3);
    expect(overview.stats.subContractor).toBe(3);
    expect(overview.stats.totalPaymentAmount).toBe(1234.5);
    expect(overview.latestPayrun).toMatchObject({
      mkRunId: "14",
      mkYear: "2026",
      paymentTotal: 8124.4,
      expenseTotal: 0,
      deductionTotal: 62,
    });
  });

  it("leaves the latest run empty when there isn't one", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, data: { business: { name: "B" }, stats: {}, latest_payrun: null } },
    });
    const overview = await fetchPayrollOverview();
    expect(overview.latestPayrun).toBeNull();
    expect(overview.connection.connected).toBe(false);
  });
});

describe("Microkeeper", () => {
  it("derives `connected` from the status when the endpoint doesn't send it", () => {
    expect(mapMicrokeeperConnection({ status: "CONNECTED" }).connected).toBe(true);
    expect(mapMicrokeeperConnection({ status: "NOT_CONNECTED" }).connected).toBe(false);
  });

  it("connects with trimmed, encrypted keys", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: true, data: { status: "CONNECTED" } } });
    await connectMicrokeeper({ businessName: " Turner ", devKey: ` ${KEY} `, bizKey: KEY });

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.payroll.microkeeperConnect);
    expect(decryptedBody(body)).toEqual({
      microkeeper_business_name: "Turner",
      mk_dev_key: KEY,
      mk_biz_key: KEY,
    });
  });

  it("replaces keys with PATCH /microkeeper/connection", async () => {
    apiMock.patch.mockResolvedValueOnce({ data: { success: true, data: { status: "CONNECTED" } } });
    await updateMicrokeeperKeys({ businessName: "", devKey: KEY, bizKey: KEY });
    expect(apiMock.patch.mock.calls[0][0]).toBe(apiRoutes.payroll.microkeeperConnection);
  });

  it("verifies and disconnects", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: true, data: { status: "ERROR", last_error: "Bad key" } } });
    const verified = await verifyMicrokeeper();
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.payroll.microkeeperVerify);
    expect(verified.lastError).toBe("Bad key");

    apiMock.delete.mockResolvedValueOnce({ data: { success: true } });
    await disconnectMicrokeeper();
    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.payroll.microkeeperConnection);
  });

  it("throws the server message when disconnecting fails", async () => {
    apiMock.delete.mockResolvedValueOnce({ data: { success: false, message: "Locked" } });
    await expect(disconnectMicrokeeper()).rejects.toThrow("Locked");
  });
});

describe("payrollErrorCode", () => {
  it("reads the code off a payroll 402", () => {
    expect(
      payrollErrorCode({ response: { data: { code: "SEAT_LIMIT_REACHED" } } }),
    ).toBe("SEAT_LIMIT_REACHED");
    expect(payrollErrorCode(new Error("network"))).toBeNull();
  });
});
