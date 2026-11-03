import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

// Imported after the mock so the module's own axios import resolves to it.
const km = await import("@/lib/km-tracker");
const {
  DEFAULT_KM_FILTERS,
  DEFAULT_KM_SETTINGS,
  FALLBACK_KM_RULES,
  canSelectKmTrip,
  applyKmSettingsDraft,
  createKmTripApi,
  deleteKmTripApi,
  emptyKmTripDraft,
  emptyKmVehicle,
  fetchKmReport,
  fetchKmRules,
  fetchKmSettings,
  fetchKmStats,
  fetchKmTrip,
  fetchKmTripsPage,
  formatKmDuration,
  kmExpenseRules,
  kmFilterParams,
  kmRulesMonthKey,
  kmInvoiceLines,
  kmLogbookPeriodCheck,
  kmMethodFor,
  kmMethodLabel,
  kmRangeDays,
  kmRangeWeeks,
  kmReasonLabel,
  kmReportExportRows,
  kmSettingsDraft,
  kmSettingsIssues,
  kmTripDraftFromTrip,
  kmTripFigures,
  kmTripIssues,
  kmTripPayload,
  kmTripRate,
  kmVehicleIssues,
  kmVehicleLabel,
  kmVehicleOdometer,
  linkKmTripsToInvoiceApi,
  mapKmRules,
  mapKmStats,
  mapKmTrip,
  saveKmSettingsApi,
  toKmOptions,
  updateKmTripApi,
} = km;

import type { KmRules, KmSettings, KmTrip, KmTripDraft, KmVehicle } from "@/lib/km-tracker";

/** The bundled Australian rules — what every existing business gets. */
const AU: KmRules = FALLBACK_KM_RULES;

function decrypted(body: unknown): Record<string, unknown> {
  const envelope = body as { data?: string };
  if (typeof envelope?.data !== "string") {
    throw new Error("Body wasn't a {data} envelope");
  }
  return decryptPayload(envelope.data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

function vehicle(overrides: Partial<KmVehicle> = {}): KmVehicle {
  return {
    ...emptyKmVehicle(),
    nickname: "Work ute",
    registrationNumber: "ABC123",
    make: "Toyota",
    model: "Hilux",
    year: "2022",
    fuelType: "Diesel",
    engineCapacity: "2.8L",
    logbookStartOdometer: "12000",
    currentOdometer: "12500.5",
    ...overrides,
  };
}

function settings(overrides: Partial<KmSettings> = {}): KmSettings {
  return {
    ...DEFAULT_KM_SETTINGS,
    vehicles: [vehicle()],
    isSetupComplete: true,
    ...overrides,
  };
}

function draft(overrides: Partial<KmTripDraft> = {}): KmTripDraft {
  return {
    ...emptyKmTripDraft(settings(), new Date("2026-10-15T09:00:00")),
    startLocation: "Sydney NSW",
    endLocation: "Parramatta NSW",
    endTime: "2026-10-15T09:45",
    reason: "client_meeting",
    distanceKm: "24",
    odometerStart: "12500.5",
    odometerEnd: "12524.5",
    parkingAmount: "10",
    ...overrides,
  };
}

const apiTrip = {
  id: 7,
  start_time: "2026-10-01T22:00:00.000Z",
  end_time: "2026-10-01T23:30:00.000Z",
  start_location: "Sydney",
  end_location: "Newcastle",
  start_latitude: "-33.8",
  start_longitude: "151.2",
  trip_type: "split",
  reason: "site_visit",
  calculation_method: "cents_per_kilometre",
  distance_km: "160.5",
  business_use_percentage: "75.00",
  personal_use_percentage: "25.00",
  deductible_distance_km: "120.375",
  rate_per_km: "0.8800",
  total_amount: "151.24",
  estimated_deduction: "113.43",
  total_duration_minutes: "90.0000",
  toll_amount: "10.00",
  parking_amount: "0",
  split_toll_expense: 0,
  split_parking_expense: 1,
  is_billable: true,
  is_invoiced: 0,
  invoice_id: null,
  client_id: 42,
  clientDetail: { id: 42, name: "Harper & Co", primaryContact: { id: 9, name: "Pat" } },
  projectDetail: { id: 3, project_name: "Kitchen fit-out" },
  jobDetail: null,
  vehicle: "Work ute",
  tags: '["urgent","site"]',
  notes: "Gate code 1234",
};

function trip(overrides: Partial<KmTrip> = {}): KmTrip {
  return { ...mapKmTrip(apiTrip), ...overrides };
}

/* ------------------------------------------------------------------ */

describe("mapKmTrip", () => {
  it("reads the aliased and nested fields formatTripResponse returns", () => {
    const mapped = mapKmTrip(apiTrip);
    expect(mapped).toMatchObject({
      id: "7",
      tripType: "split",
      calculationMethod: "cents_per_kilometre",
      distanceKm: 160.5,
      businessPercentage: 75,
      personalPercentage: 25,
      deductibleKm: 120.375,
      ratePerKm: 0.88,
      durationMinutes: 90,
      startLat: -33.8,
      endLat: null,
      splitToll: false,
      splitParking: true,
      splitFuel: true, // absent → default true, as sole-ocr does
      isBillable: true,
      isInvoiced: false,
      clientId: "42",
      clientName: "Harper & Co",
      contactId: "9",
      projectName: "Kitchen fit-out",
      jobName: "",
      tags: ["urgent", "site"],
    });
  });

  it("treats a trip with an invoice id as invoiced, defaulting a missing status to draft", () => {
    const mapped = mapKmTrip({ ...apiTrip, invoice_id: 55, invoice_no: "INV-0055", is_invoiced: 0 });
    expect(mapped.isInvoiced).toBe(true);
    expect(mapped.invoiceId).toBe("55");
    expect(mapped.invoiceStatus).toBe("draft");

    const sent = mapKmTrip({
      ...apiTrip,
      invoice_id: 55,
      invoiceDetail: { id: 55, invoice_no: "INV-0055", mark_as: "Sent", template_id: 2 },
    });
    expect(sent.invoiceStatus).toBe("sent");
    expect(sent.invoiceTemplateId).toBe("2");
  });

  it("derives deductible km when the server didn't send it and splits comma tags", () => {
    const mapped = mapKmTrip({
      id: 1,
      distance_km: 50,
      business_percentage: 40,
      tags: "a, b",
      calculation_method: "weird",
    });
    expect(mapped.deductibleKm).toBe(20);
    expect(mapped.personalPercentage).toBe(60);
    expect(mapped.tags).toEqual(["a", "b"]);
    expect(mapped.calculationMethod).toBeNull();
    expect(mapped.tripType).toBe("business");
  });
});

describe("kmFilterParams", () => {
  const now = new Date("2026-10-15T12:00:00");

  it("sends nothing for the defaults", () => {
    expect(kmFilterParams(DEFAULT_KM_FILTERS, now)).toEqual({});
  });

  it("resolves presets the way sole-webapp did (Monday weeks, calendar quarters)", () => {
    expect(kmFilterParams({ ...DEFAULT_KM_FILTERS, datePreset: "this_week" }, now)).toEqual({
      start_date: "2026-10-12",
      end_date: "2026-10-18",
    });
    expect(kmFilterParams({ ...DEFAULT_KM_FILTERS, datePreset: "last_month" }, now)).toEqual({
      start_date: "2026-09-01",
      end_date: "2026-09-30",
    });
    expect(kmFilterParams({ ...DEFAULT_KM_FILTERS, datePreset: "this_quarter" }, now)).toEqual({
      start_date: "2026-10-01",
      end_date: "2026-12-31",
    });
  });

  it("only applies a custom range once both ends are set and in order", () => {
    const custom = { ...DEFAULT_KM_FILTERS, datePreset: "custom" as const };
    expect(kmFilterParams({ ...custom, customStart: "2026-01-01" }, now)).toEqual({});
    expect(
      kmFilterParams({ ...custom, customStart: "2026-02-01", customEnd: "2026-01-01" }, now),
    ).toEqual({});
    expect(
      kmFilterParams({ ...custom, customStart: "2026-01-01", customEnd: "2026-01-31" }, now),
    ).toEqual({ start_date: "2026-01-01", end_date: "2026-01-31" });
  });

  it("passes reason, type and a trimmed search", () => {
    expect(
      kmFilterParams(
        { ...DEFAULT_KM_FILTERS, reason: "training", tripType: "split", search: "  zoo " },
        now,
      ),
    ).toEqual({ reason: "training", trip_type: "split", search: "zoo" });
  });
});

describe("fetchKmTripsPage", () => {
  it("requests the page with the filter params and maps rows and total", async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [apiTrip], pagination: { totalRecords: 31 } },
    });
    const page = await fetchKmTripsPage({ ...DEFAULT_KM_FILTERS, reason: "site_visit" }, 2, 25);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.kmTracker.list, {
      params: { reason: "site_visit", page: 2, limit: 25 },
    });
    expect(page.total).toBe(31);
    expect(page.trips[0].id).toBe("7");
  });

  it("throws a 200 that says it failed rather than reading it as empty", async () => {
    apiMock.get.mockResolvedValue({ data: { success: false, message: "Nope" } });
    await expect(fetchKmTripsPage(DEFAULT_KM_FILTERS, 1, 10)).rejects.toThrow("Nope");
  });
});

describe("fetchKmTrip", () => {
  it("reads one trip and throws when there isn't one", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: true, data: apiTrip } });
    await expect(fetchKmTrip("7")).resolves.toMatchObject({ id: "7" });
    expect(apiMock.get).toHaveBeenCalledWith(`${apiRoutes.kmTracker.detail}/7`);

    apiMock.get.mockResolvedValueOnce({ data: { success: false, message: "Trip not found" } });
    await expect(fetchKmTrip("8")).rejects.toThrow("Trip not found");
  });
});

describe("fetchKmStats", () => {
  it("maps both method summaries", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          method_summaries: [
            {
              type: "logbook",
              total_logbook_km: 200,
              total_logbook_business_km: 150,
              business_use_percentage: 75,
            },
            {
              type: "cents_per_kilometre",
              income_year_label: "2026-27",
              cents_per_km_limit: 5000,
              claimed_business_km: 4900,
              remaining_claimable_km: 100,
              capped_claimable_amount: 4312,
              toll_and_parking_total: 40,
              capped_claim_plus_toll_parking: 4352,
              vehicle_claims: [
                { vehicle: "", claimed_business_km: 4900, remaining_claimable_km: 100 },
              ],
            },
          ],
        },
      },
    });
    const stats = await fetchKmStats(DEFAULT_KM_FILTERS);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.kmTracker.stats, {
      params: { page: 1, limit: 1 },
    });
    expect(stats.logbook).toEqual({
      totalKm: 200,
      businessKm: 150,
      personalKm: 50,
      businessUsePercentage: 75,
    });
    expect(stats.cents.totalClaim).toBe(4352);
    expect(stats.cents.vehicleClaims[0]).toEqual({
      vehicle: "Unassigned vehicle",
      claimedBusinessKm: 4900,
      remainingClaimableKm: 100,
    });
  });
});

/* ------------------------------------------------------------------ */

describe("kmTripFigures", () => {
  it("charges distance at the rate under cents per km and ignores fuel/other", () => {
    const figures = kmTripFigures(
      draft({ fuelCost: "50", otherExpenses: "5", tollAmount: "4" }),
      "cents_per_kilometre",
      0.88,
    );
    // 24 × 0.88 + toll 4 + parking 10
    expect(figures.totalAmount).toBeCloseTo(35.12);
    expect(figures.estimatedDeduction).toBeCloseTo(35.12);
  });

  it("charges only actual costs under the logbook method", () => {
    const figures = kmTripFigures(draft({ fuelCost: "30" }), "logbook", 0.88);
    expect(figures.totalAmount).toBe(40);
  });

  it("splits only the expenses marked split by the business share", () => {
    const figures = kmTripFigures(
      draft({
        isSplit: true,
        businessPercentage: "25",
        tollAmount: "20",
        splitToll: false,
        parkingAmount: "10",
        splitParking: true,
      }),
      "cents_per_kilometre",
      1,
    );
    expect(figures.deductibleKm).toBe(6);
    expect(figures.personalKm).toBe(18);
    // distance 24 × 25% + toll 20 (unsplit) + parking 10 × 25%
    expect(figures.estimatedDeduction).toBeCloseTo(6 + 20 + 2.5);
    expect(figures.totalAmount).toBeCloseTo(24 + 20 + 10);
  });

  it("ignores the stored percentage while the trip isn't split", () => {
    expect(kmTripFigures(draft({ businessPercentage: "10" }), "logbook", 0).businessPercentage).toBe(
      100,
    );
  });
});

describe("kmTripIssues", () => {
  const logbook = { method: "logbook" as const, ratePerKm: 0.88, hasVehicles: true };
  const cents = { method: "cents_per_kilometre" as const, ratePerKm: 0.88, hasVehicles: true };
  const keys = (issues: { key: string }[]) => issues.map((issue) => issue.key);

  it("accepts a complete trip", () => {
    expect(kmTripIssues(draft(), logbook, AU)).toEqual([]);
  });

  it("requires locations, times, reason, vehicle and a distance over zero", () => {
    const issues = kmTripIssues(
      draft({ startLocation: " ", endLocation: "", reason: "", vehicle: "", distanceKm: "0" }),
      logbook,
      AU,
    );
    expect(keys(issues)).toEqual(
      expect.arrayContaining(["startLocation", "endLocation", "reason", "vehicle", "distanceKm"]),
    );
  });

  it("only requires a vehicle when the account has one", () => {
    expect(keys(kmTripIssues(draft({ vehicle: "" }), { ...logbook, hasVehicles: false }, AU))).not.toContain(
      "vehicle",
    );
  });

  it("rejects an end before the start, but allows them equal", () => {
    expect(keys(kmTripIssues(draft({ endTime: "2026-10-15T08:59" }), logbook, AU))).toContain("endTime");
    expect(keys(kmTripIssues(draft({ endTime: "2026-10-15T09:00" }), logbook, AU))).not.toContain(
      "endTime",
    );
  });

  it("needs logbook odometer readings with the end at least the start", () => {
    expect(keys(kmTripIssues(draft({ odometerStart: "" }), logbook, AU))).toContain("odometerStart");
    expect(
      keys(kmTripIssues(draft({ odometerStart: "100", odometerEnd: "99" }), logbook, AU)),
    ).toContain("odometerEnd");
    // Not under cents per km.
    expect(keys(kmTripIssues(draft({ odometerStart: "", odometerEnd: "" }), cents, AU))).toEqual([]);
  });

  it("refuses fuel and other running costs under cents per km", () => {
    expect(keys(kmTripIssues(draft({ fuelCost: "1", otherExpenses: "2" }), cents, AU))).toEqual([
      "fuelCost",
      "otherExpenses",
    ]);
  });

  it("keeps sole-webapp's rule that a trip must cost more than $0", () => {
    const issues = kmTripIssues(draft({ parkingAmount: "" }), logbook, AU);
    expect(keys(issues)).toEqual(["totalAmount"]);
    expect(issues[0].message).toMatch(/expense/);
  });

  it("bounds a split share to 0–100", () => {
    expect(keys(kmTripIssues(draft({ isSplit: true, businessPercentage: "101" }), logbook, AU))).toContain(
      "businessPercentage",
    );
    expect(keys(kmTripIssues(draft({ isSplit: true, businessPercentage: "0" }), logbook, AU))).not.toContain(
      "businessPercentage",
    );
  });
});

describe("kmTripPayload", () => {
  it("builds the logbook body with both percentage aliases and the odometer", () => {
    const payload = kmTripPayload(draft({ fuelCost: "12.5" }), { method: "logbook", ratePerKm: 0.88 }, AU);
    expect(payload).toMatchObject({
      trip_type: "business",
      calculation_method: "logbook",
      distance_km: 24,
      business_percentage: 100,
      business_use_percentage: 100,
      personal_use_percentage: 0,
      rate_per_km: 0,
      fuel_cost: 12.5,
      total_amount: 22.5,
      odometer_start: 12500.5,
      odometer_end: 12524.5,
      is_billable: false,
      vehicle: "Work ute",
      tags: [],
      notes: "",
    });
    expect(payload.start_time).toBe(new Date("2026-10-15T09:00").toISOString());
  });

  it("zeroes fuel and other costs and drops the odometer under cents per km", () => {
    const payload = kmTripPayload(
      draft({ fuelCost: "9", otherExpenses: "9" }),
      { method: "cents_per_kilometre", ratePerKm: 0.88 },
      AU,
    );
    expect(payload).toMatchObject({ fuel_cost: 0, other_expenses: 0, rate_per_km: 0.88 });
    expect(payload).not.toHaveProperty("odometer_start");
    expect(payload).not.toHaveProperty("odometer_end");
  });

  it("leaves out an unset client, project and job, and a job without a project", () => {
    const payload = kmTripPayload(draft({ jobId: "5" }), { method: "logbook", ratePerKm: 0 }, AU);
    expect(payload).not.toHaveProperty("client_id");
    expect(payload).not.toHaveProperty("project_id");
    expect(payload).not.toHaveProperty("job_id");
    expect(payload).not.toHaveProperty("start_latitude");

    const linked = kmTripPayload(
      draft({ clientId: "42", projectId: "3", jobId: "5", startLat: -33.8 }),
      { method: "logbook", ratePerKm: 0 },
      AU,
    );
    expect(linked).toMatchObject({ client_id: "42", project_id: "3", job_id: "5", start_latitude: -33.8 });
  });

  it("sends a split trip as split, and a fully-personal split as personal", () => {
    const context = { method: "logbook" as const, ratePerKm: 0 };
    expect(kmTripPayload(draft({ isSplit: true, businessPercentage: "60" }), context, AU)).toMatchObject({
      trip_type: "split",
      business_percentage: 60,
      personal_percentage: 40,
      deductible_km: 14.4,
    });
    expect(
      kmTripPayload(draft({ isSplit: true, businessPercentage: "0" }), context, AU).trip_type,
    ).toBe("personal");
  });

  it("never carries invoice fields, so a duplicate isn't linked to the original's invoice", () => {
    const copy = kmTripDraftFromTrip(trip({ invoiceId: "55", invoiceNo: "INV-55", isInvoiced: true }));
    const payload = kmTripPayload(copy, { method: "cents_per_kilometre", ratePerKm: 0.88 }, AU);
    expect(payload).not.toHaveProperty("invoice_id");
    expect(payload).not.toHaveProperty("invoice_no");
    expect(payload).not.toHaveProperty("is_invoiced");
  });
});

describe("trip writes", () => {
  it("creates with an encrypted body, booleans as strings and no empty ids", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 99 } } });
    const payload = kmTripPayload(
      draft({ isBillable: true, notes: "  " }),
      { method: "logbook", ratePerKm: 0 },
      AU,
    );
    await expect(createKmTripApi(payload)).resolves.toEqual({ id: "99" });

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.kmTracker.create);
    const fields = decrypted(body);
    expect(fields.is_billable).toBe("true");
    expect(fields.split_toll_expense).toBe("true");
    expect(fields.distance_km).toBe(24);
    expect(fields.notes).toBe("");
    expect(fields.tags).toEqual([]);
    expect(fields).not.toHaveProperty("client_id");
  });

  it("updates by id and surfaces the server's message on failure", async () => {
    apiMock.put.mockResolvedValueOnce({ data: { success: true } });
    await updateKmTripApi("7", { notes: "x" });
    expect(apiMock.put.mock.calls[0][0]).toBe(`${apiRoutes.kmTracker.update}/7`);
    expect(decrypted(apiMock.put.mock.calls[0][1])).toEqual({ notes: "x" });

    apiMock.put.mockResolvedValueOnce({ data: { success: false, message: "Cap exceeded" } });
    await expect(updateKmTripApi("7", { notes: "x" })).rejects.toThrow("Cap exceeded");
  });

  it("links every trip to the invoice with is_invoiced as a number", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    await linkKmTripsToInvoiceApi(["1", "2"], { id: "55", number: "INV-0055" });
    expect(apiMock.put).toHaveBeenCalledTimes(2);
    expect(apiMock.put.mock.calls.map((call) => call[0])).toEqual([
      `${apiRoutes.kmTracker.update}/1`,
      `${apiRoutes.kmTracker.update}/2`,
    ]);
    expect(decrypted(apiMock.put.mock.calls[0][1])).toEqual({
      invoice_id: "55",
      invoice_no: "INV-0055",
      is_invoiced: 1,
    });
  });

  it("deletes by id", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await deleteKmTripApi("7");
    expect(apiMock.delete).toHaveBeenCalledWith(`${apiRoutes.kmTracker.delete}/7`);
  });
});

describe("kmTripDraftFromTrip", () => {
  it("round-trips a saved trip into the form", () => {
    const form = kmTripDraftFromTrip(trip());
    expect(form).toMatchObject({
      isSplit: true,
      tripType: "business",
      businessPercentage: "75",
      distanceKm: "160.5",
      tollAmount: "10",
      parkingAmount: "",
      clientId: "42",
      tags: "urgent, site",
      notes: "Gate code 1234",
    });
  });
});

/* ------------------------------------------------------------------ */

describe("settings", () => {
  it("defaults an account with no settings record", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: undefined } });
    await expect(fetchKmSettings()).resolves.toEqual(DEFAULT_KM_SETTINGS);
  });

  it("maps the record and drops blank vehicles", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          calculation_method: "cents_per_kilometre",
          rate_per_km: "0.8800",
          billable_rate_per_km: "1.2",
          vehicle_details: [
            { nickname: "Ute", logbook_start_odometer: 100, year: 2020 },
            { nickname: null, make: "" },
          ],
          is_setup_complete: true,
        },
      },
    });
    const mapped = await fetchKmSettings();
    expect(mapped.calculationMethod).toBe("cents_per_kilometre");
    expect(mapped.ratePerKm).toBe(0.88);
    expect(mapped.billableRatePerKm).toBe(1.2);
    expect(mapped.vehicles).toHaveLength(1);
    expect(mapped.vehicles[0]).toMatchObject({ nickname: "Ute", year: "2020", logbookStartOdometer: "100" });
  });

  it("saves the whole record encrypted, leaving out an empty logbook period", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { calculation_method: "logbook", vehicle_details: [{ nickname: "Ute" }] } },
    });
    await saveKmSettingsApi(settings({ ratePerKm: 0.88, billableRatePerKm: 1.5 }));
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.kmTracker.settings);
    const fields = decrypted(body);
    expect(fields).toMatchObject({
      calculation_method: "logbook",
      rate_per_km: 0.88,
      billable_rate_per_km: 1.5,
      cents_per_km_limit: 5000,
    });
    expect(fields).not.toHaveProperty("logbook_period_start");
    expect(fields.vehicle_details).toEqual([
      expect.objectContaining({ nickname: "Work ute", registration_number: "ABC123" }),
    ]);
  });

  it("validates rates to two decimal places and at least one vehicle", () => {
    const keys = (rate: string, billable: string, vehicles: KmVehicle[]) =>
      kmSettingsIssues(
        {
          calculationMethod: "logbook",
          ratePerKm: rate,
          billableRatePerKm: billable,
          vehicles,
          businessUseBasis: "records",
          businessUsePercentage: "100",
        },
        AU,
      ).map((issue) => issue.key);

    expect(keys("0.88", "0", [vehicle()])).toEqual([]);
    expect(keys("", "-1", [vehicle()])).toEqual(["ratePerKm", "billableRatePerKm"]);
    expect(keys("0.885", "0", [vehicle()])).toEqual(["ratePerKm"]);
    expect(keys("0.88", "0", [])).toEqual(["vehicles"]);
    expect(keys("0.88", "0", [vehicle({ make: "" })])).toEqual(["vehicle-0"]);
  });
});

describe("vehicles", () => {
  it("labels a vehicle the way sole-ocr does", () => {
    expect(kmVehicleLabel(vehicle())).toBe("Work ute");
    expect(kmVehicleLabel(vehicle({ nickname: " " }))).toBe("Toyota Hilux");
    expect(kmVehicleLabel(vehicle({ nickname: "", make: "", model: "" }))).toBe("ABC123");
  });

  it("starts the odometer from the current reading, then the logbook start", () => {
    expect(kmVehicleOdometer(vehicle())).toBe(12500.5);
    expect(kmVehicleOdometer(vehicle({ currentOdometer: "" }))).toBe(12000);
    expect(kmVehicleOdometer(null)).toBeNull();
  });

  it("validates a vehicle's required fields, year and odometer, and its name", () => {
    const keys = (value: KmVehicle, others: string[] = []) =>
      kmVehicleIssues(value, others, AU).map((issue) => issue.key);
    expect(keys(vehicle())).toEqual([]);
    expect(keys(vehicle({ year: "22" }))).toEqual(["year"]);
    expect(keys(vehicle({ logbookStartOdometer: "-1" }))).toEqual(["logbookStartOdometer"]);
    expect(keys(vehicle({ fuelType: "" }))).toEqual(["fuelType"]);
    expect(keys(vehicle(), ["work UTE"])).toEqual(["nickname"]);
  });
});

/* ------------------------------------------------------------------ */

describe("kmInvoiceLines", () => {
  it("bills business km at the billable rate, then each cost split where marked", () => {
    const lines = kmInvoiceLines([trip({ tollAmount: 10, splitToll: true, parkingAmount: 8, splitParking: false })], 2);
    expect(lines.map((line) => [line.description, line.quantity, line.price, line.qtyType, line.gst])).toEqual([
      ["Sydney - Newcastle", "120.38", "2", "km", false],
      ["Sydney - Newcastle - Toll", "1", "7.5", "items", false],
      ["Sydney - Newcastle - Parking", "1", "8", "items", false],
    ]);
  });

  it("drops trailing zeros from prices too", () => {
    const price = (tollAmount: number) =>
      kmInvoiceLines([trip({ calculationMethod: "logbook", tollAmount, splitToll: false })], 0)[0]
        .price;
    expect(price(5)).toBe("5");
    expect(price(5.55)).toBe("5.55");
    expect(price(5.556)).toBe("5.56");
  });

  it("drops trailing zeros from quantities but keeps real decimals", () => {
    const quantities = (deductibleKm: number) =>
      kmInvoiceLines([trip({ deductibleKm, tollAmount: 0 })], 1)[0].quantity;
    expect(quantities(60)).toBe("60");
    expect(quantities(50.55)).toBe("50.55");
    expect(quantities(50.5)).toBe("50.5");
    expect(quantities(120.375)).toBe("120.38");
  });

  it("falls back to the trip's own rate without a billable one", () => {
    expect(kmInvoiceLines([trip({ tollAmount: 0 })], 0)[0].price).toBe("0.88");
    expect(
      kmInvoiceLines([trip({ tollAmount: 0, ratePerKm: 0, estimatedDeduction: 60, deductibleKm: 120 })], 0)[0]
        .price,
    ).toBe("0.5");
  });

  it("bills a logbook trip's costs only", () => {
    const lines = kmInvoiceLines(
      [trip({ calculationMethod: "logbook", tollAmount: 0, fuelCost: 30, splitFuel: false })],
      2,
    );
    expect(lines.map((line) => line.description)).toEqual(["Sydney - Newcastle - Fuel Cost"]);
  });
});

describe("canSelectKmTrip", () => {
  it("only lets billable, uninvoiced trips for one client share a selection", () => {
    const harper = trip();
    expect(canSelectKmTrip(harper, [])).toBe(true);
    expect(canSelectKmTrip(trip({ id: "8", clientId: "43" }), [harper])).toBe(false);
    expect(canSelectKmTrip(trip({ id: "9", clientId: null }), [harper])).toBe(true);
    expect(canSelectKmTrip(trip({ isBillable: false }), [])).toBe(false);
    expect(canSelectKmTrip(trip({ isInvoiced: true }), [])).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe("fetchKmReport", () => {
  it("asks for the method and range and maps the summary", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          calculation_method: "logbook",
          filters: { start_date: "2026-07-01", end_date: "2026-09-30" },
          summary: { trip_count: 1, total_distance_km: 160.5, total_estimated_deduction: 12.3 },
          rows: [apiTrip],
        },
      },
    });
    const report = await fetchKmReport({ method: "logbook", startDate: "2026-07-01", endDate: "2026-09-30" });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.kmTracker.reports, {
      params: { calculation_method: "logbook", start_date: "2026-07-01", end_date: "2026-09-30" },
    });
    expect(report.summary).toMatchObject({ tripCount: 1, totalDistanceKm: 160.5, totalEstimatedDeduction: 12.3 });
    expect(report.rows).toHaveLength(1);
  });

  it("counts inclusive weeks for the logbook minimum", () => {
    expect(kmRangeWeeks("2026-07-01", "2026-09-22")).toBe(12);
    expect(kmRangeWeeks("2026-07-01", "2026-09-21")).toBe(11.9);
    expect(kmRangeWeeks("2026-07-02", "2026-07-01")).toBeNull();
    expect(kmRangeWeeks("", "2026-07-01")).toBeNull();
  });
});

describe("formatting and options", () => {
  it("formats durations from minutes or the two times", () => {
    expect(formatKmDuration(90)).toBe("1h 30m");
    expect(formatKmDuration(45)).toBe("45m");
    expect(formatKmDuration(120)).toBe("2h");
    expect(formatKmDuration(null, "2026-10-01T10:00:00Z", "2026-10-01T10:20:00Z")).toBe("20m");
    expect(formatKmDuration(null)).toBe("—");
  });

  it("labels known reasons and shows custom ones as typed", () => {
    expect(kmReasonLabel("client_meeting")).toBe("Client meeting");
    expect(kmReasonLabel("commute")).toBe("Commute");
    expect(kmReasonLabel("Bank run")).toBe("Bank run");
    expect(kmReasonLabel("")).toBe("—");
  });

  it("reads project and job options from either envelope and de-duplicates", () => {
    expect(
      toKmOptions({ data: [{ id: 1, project_name: "A" }, { id: 1, project_name: "A" }, { id: 2 }] }, ["project_name"]),
    ).toEqual([{ value: "1", label: "A" }]);
    expect(toKmOptions({ data: { data: [{ id: 3, job_name: "Fit-out" }] } }, ["job_name"])).toEqual([
      { value: "3", label: "Fit-out" },
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * Country rules (AU → NZ)
 * ------------------------------------------------------------------ */

/** `/km-tracker/rules` for an Australian business — the contract's AU example. */
const rawAuRules = {
  country_iso2: "AU",
  country_name: "Australia",
  engine: "au_cents_per_km",
  authority: "ATO",
  currency: "AUD",
  locale: "en-AU",
  income_year: { label: "2026-27", start_date: "2026-07-01", end_date: "2027-06-30" },
  statutory_method: "cents_per_kilometre",
  methods: [
    {
      key: "cents_per_kilometre",
      label: "Cents per kilometre",
      statutory: true,
      description: "Use a rate per business kilometre.",
      guidance_url: "https://www.ato.gov.au/cents-per-kilometre-method",
      guidance_label: "ATO guidance",
    },
    {
      key: "logbook",
      label: "Logbook",
      statutory: false,
      description: "Use actual car expenses.",
      guidance_url: "https://www.ato.gov.au/logbook-method",
      guidance_label: "ATO guidance",
    },
  ],
  vehicle_types: null,
  vehicle_type_required: false,
  rates: {
    provisional: false,
    rate_year: "2026-27",
    per_km: 0.91,
    max_km: 5000,
    tier1_max_km: null,
    by_vehicle_type: null,
    source: "country",
    follows_country: true,
    allow_custom_rate: true,
  },
  business_use: { bases: null, no_logbook_max_pct: null },
  logbook: { min_days: 84, valid_years: 5, odometer_per_trip: true, odometer_at_year_end: true },
  expense_rules: {
    cents_per_kilometre: { tolls: true, parking: true, fuel: false, other: false, notes: ["Fuel is in the rate."] },
    logbook: { tolls: true, parking: true, fuel: true, other: true, notes: ["Actual costs."] },
  },
  map: { center: [-25.27, 133.78], bounds: [[-44, 112], [-10, 154]], region: "au", place_restrictions: ["au"] },
  copy: {
    rate_label: "Cents per kilometre (ATO)",
    rate_hint: "Used for cents-per-km claims. The ATO sets this each financial year.",
    cap_tip: "The ATO caps the cents-per-kilometre method at 5,000 business km per car each financial year.",
    rate_tooltip: "The ATO cents-per-kilometre rate.",
    provisional_note: null,
  },
};

/** …and for a New Zealand one — the contract's NZ example. */
const rawNzRules = {
  country_iso2: "NZ",
  country_name: "New Zealand",
  engine: "nz_tiered_km",
  authority: "Inland Revenue",
  currency: "NZD",
  locale: "en-NZ",
  income_year: { label: "2026-27", start_date: "2026-04-01", end_date: "2027-03-31" },
  statutory_method: "kilometre_rate",
  methods: [
    {
      key: "kilometre_rate",
      label: "Kilometre rate",
      statutory: true,
      description: "Business km at Inland Revenue's rate.",
      guidance_url: "https://www.ird.govt.nz/vehicle-expenses",
      guidance_label: "Inland Revenue guidance",
    },
    {
      key: "logbook",
      label: "Actual costs",
      statutory: false,
      description: "Running costs × business use.",
      guidance_url: "https://www.ird.govt.nz/vehicle-expenses",
      guidance_label: "Inland Revenue guidance",
    },
  ],
  vehicle_types: [
    { key: "petrol", label: "Petrol", statutory: true },
    { key: "diesel", label: "Diesel", statutory: true },
    { key: "petrol_hybrid", label: "Petrol hybrid (incl. plug-in)", statutory: true },
    { key: "electric", label: "Electric", statutory: true },
    { key: "other", label: "Other (motorcycle, LPG…)", statutory: false },
  ],
  vehicle_type_required: true,
  rates: {
    provisional: true,
    rate_year: "2025-26",
    per_km: null,
    max_km: null,
    tier1_max_km: 14000,
    by_vehicle_type: {
      petrol: { tier1: 1.2, tier2: 0.37 },
      diesel: { tier1: 1.3, tier2: 0.38 },
      petrol_hybrid: { tier1: 0.9, tier2: 0.24 },
      electric: { tier1: 1.22, tier2: 0.23 },
    },
    source: "country",
    follows_country: true,
    allow_custom_rate: false,
  },
  business_use: { bases: ["records", "logbook", "estimate"], no_logbook_max_pct: 25 },
  logbook: { min_days: 90, valid_years: 3, odometer_per_trip: false, odometer_at_year_end: true },
  expense_rules: {
    kilometre_rate: { tolls: true, parking: true, fuel: false, other: false, notes: ["Covered by the rate."] },
    logbook: { tolls: true, parking: true, fuel: true, other: true, notes: ["Actual costs × business use."] },
  },
  map: { center: [-41.0, 174.0], bounds: [[-47.5, 166.0], [-34.0, 179.0]], region: "nz", place_restrictions: ["nz"] },
  copy: {
    rate_label: "Kilometre rate (Inland Revenue)",
    rate_hint: "Inland Revenue publishes these rates after 31 March each year.",
    cap_tip: "Tier 1 covers a vehicle's first 14,000 km in the year.",
    rate_tooltip: "Inland Revenue's kilometre rate for this vehicle type.",
    provisional_note: "Estimate using 2025-26 rates — Inland Revenue publishes 2026-27 rates around June 2027.",
  },
};

const NZ: KmRules = mapKmRules(rawNzRules);

describe("mapKmRules", () => {
  it("reads an Australian answer into the same shape as the fallback", () => {
    const au = mapKmRules(rawAuRules);
    expect(au).toMatchObject({
      countryIso2: "AU",
      engine: "au_cents_per_km",
      authority: "ATO",
      currency: "AUD",
      statutoryMethod: "cents_per_kilometre",
      vehicleTypes: null,
      vehicleTypeRequired: false,
      incomeYear: { label: "2026-27", startDate: "2026-07-01", endDate: "2027-06-30" },
      rates: { perKm: 0.91, maxKm: 5000, provisional: false, allowCustomRate: true, byVehicleType: null },
      businessUse: { bases: null, noLogbookMaxPct: null },
      logbook: { minDays: 84, validYears: 5, odometerPerTrip: true, odometerAtYearEnd: true },
      map: { center: [-25.27, 133.78], bounds: [[-44, 112], [-10, 154]], region: "au", placeRestrictions: ["au"] },
    });
    expect(au.methods.map((method) => [method.key, method.label, method.statutory])).toEqual([
      ["cents_per_kilometre", "Cents per kilometre", true],
      ["logbook", "Logbook", false],
    ]);
    expect(au.methods[0].guidanceLabel).toBe("ATO guidance");
    expect(au.expenseRules.cents_per_kilometre).toEqual({
      allowTolls: true,
      allowParking: true,
      allowFuel: false,
      allowOther: false,
      notes: ["Fuel is in the rate."],
    });
  });

  it("reads New Zealand's tiers, vehicle types, business-use bases and provisional copy", () => {
    expect(NZ).toMatchObject({
      countryIso2: "NZ",
      countryName: "New Zealand",
      engine: "nz_tiered_km",
      authority: "Inland Revenue",
      currency: "NZD",
      locale: "en-NZ",
      statutoryMethod: "kilometre_rate",
      vehicleTypeRequired: true,
      rates: {
        provisional: true,
        rateYear: "2025-26",
        perKm: null,
        maxKm: null,
        tier1MaxKm: 14000,
        allowCustomRate: false,
      },
      businessUse: { bases: ["records", "logbook", "estimate"], noLogbookMaxPct: 25 },
      logbook: { minDays: 90, validYears: 3, odometerPerTrip: false, odometerAtYearEnd: true },
      map: { region: "nz", placeRestrictions: ["nz"], center: [-41, 174] },
    });
    expect(NZ.methods.map((method) => method.key)).toEqual(["kilometre_rate", "logbook"]);
    expect(NZ.vehicleTypes?.map((type) => type.key)).toEqual([
      "petrol",
      "diesel",
      "petrol_hybrid",
      "electric",
      "other",
    ]);
    expect(NZ.vehicleTypes?.find((type) => type.key === "other")?.statutory).toBe(false);
    expect(NZ.rates.byVehicleType?.diesel).toEqual({ tier1: 1.3, tier2: 0.38 });
    expect(NZ.copy.provisionalNote).toMatch(/2025-26/);
  });

  it("leaves gaps empty rather than filling them from Australia, and keeps a logbook method", () => {
    const none = mapKmRules({ country_iso2: "ZA", engine: "none", statutory_method: null, methods: [] });
    expect(none.engine).toBe("none");
    expect(none.statutoryMethod).toBeNull();
    expect(none.methods.map((method) => method.key)).toEqual(["logbook"]);
    expect(none.rates.perKm).toBeNull();
    expect(none.rates.maxKm).toBeNull();
    expect(none.copy.capTip).toBe("");
    expect(none.map.region).toBe("za");
  });

  it("fetches the rules for a date and throws on a failed answer", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { success: true, data: rawNzRules } });
    await expect(fetchKmRules("2026-10-23")).resolves.toMatchObject({ countryIso2: "NZ" });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.kmTracker.rules, {
      params: { date: "2026-10-23" },
    });

    apiMock.get.mockResolvedValueOnce({ data: { success: false, message: "Nope" } });
    await expect(fetchKmRules()).rejects.toThrow("Nope");
  });
});

describe("FALLBACK_KM_RULES", () => {
  it("is Australia, with the screens' existing copy and the 2026-27 rate", () => {
    expect(AU).toMatchObject({
      countryIso2: "AU",
      countryName: "Australia",
      engine: "au_cents_per_km",
      authority: "ATO",
      currency: "AUD",
      locale: "en-AU",
      statutoryMethod: "cents_per_kilometre",
      vehicleTypes: null,
      rates: { perKm: 0.91, maxKm: 5000, allowCustomRate: true, provisional: false },
      logbook: { minDays: 84, odometerPerTrip: true },
      // The bounds the route map has always used.
      map: { center: [-25.2744, 133.7751], bounds: [[-44.5, 112], [-9, 154.5]], region: "au", placeRestrictions: ["au"] },
    });
    expect(AU.methods.map((method) => [method.key, method.label, method.guidanceLabel])).toEqual([
      ["cents_per_kilometre", "Cents per kilometre", "ATO guidance"],
      ["logbook", "Logbook", "ATO guidance"],
    ]);
    expect(AU.methods[0].guidanceUrl).toMatch(/^https:\/\/www\.ato\.gov\.au\/.*cents-per-kilometre-method$/);
    expect(AU.copy.capTip).toBe(
      "The ATO caps the cents-per-kilometre method at 5,000 business km per car each financial year. The rate is all-inclusive: it already covers fuel, insurance, rego and depreciation.",
    );
    expect(AU.copy.rateHint).toBe("Used for cents-per-km claims. The ATO sets this each financial year.");
    expect(DEFAULT_KM_SETTINGS.ratePerKm).toBe(0.91);
    expect(DEFAULT_KM_SETTINGS.centsPerKmLimit).toBe(5000);
  });
});

describe("methods by country", () => {
  it("keeps Australia's short names and uses New Zealand's own", () => {
    expect(kmMethodLabel("cents_per_kilometre", AU)).toBe("Cents per KM");
    expect(kmMethodLabel("logbook", AU)).toBe("Logbook");
    expect(kmMethodLabel(null, AU)).toBe("—");
    expect(kmMethodLabel("kilometre_rate", NZ)).toBe("Kilometre rate");
    expect(kmMethodLabel("logbook", NZ)).toBe("Actual costs");
  });

  it("maps a saved method onto one the country offers", () => {
    expect(kmMethodFor(AU, "cents_per_kilometre")).toBe("cents_per_kilometre");
    expect(kmMethodFor(NZ, "cents_per_kilometre")).toBe("kilometre_rate");
    expect(kmMethodFor(AU, "kilometre_rate")).toBe("cents_per_kilometre");
    expect(kmMethodFor(mapKmRules({ engine: "none", methods: [] }), "cents_per_kilometre")).toBe("logbook");
  });

  it("caches rules by month, which always sits inside one statutory year", () => {
    expect(kmRulesMonthKey("2026-06-30")).toBe("2026-06");
    expect(kmRulesMonthKey("2026-07-01T09:00")).toBe("2026-07");
    expect(kmRulesMonthKey(undefined, new Date("2027-02-01T12:00:00"))).toBe("2027-02");
  });
});

describe("kmExpenseRules", () => {
  it("gives Australia exactly the rules the screens showed before", () => {
    expect(kmExpenseRules(AU, "cents_per_kilometre")).toEqual({
      allowTolls: true,
      allowParking: true,
      allowFuel: false,
      allowOther: false,
      notes: [
        "Fuel cost is already included in the cents per kilometre rate and must not be claimed separately.",
        "Tolls and parking can be claimed separately when they are work or business related.",
        "Other running costs must not be separately claimed if they are already covered by the cents per kilometre rate.",
      ],
    });
    expect(kmExpenseRules(AU, "logbook")).toEqual({
      allowTolls: true,
      allowParking: true,
      allowFuel: true,
      allowOther: true,
      notes: [
        "Under the logbook method, actual vehicle expenses can be claimed when they are work or business related.",
        "Claims should be adjusted using the business use percentage from the logbook.",
      ],
    });
  });

  it("uses New Zealand's rules, and falls back on a method's kind when the rules leave it out", () => {
    expect(kmExpenseRules(NZ, "kilometre_rate")).toMatchObject({ allowFuel: false, allowOther: false, allowTolls: true });
    expect(kmExpenseRules(NZ, "logbook").notes).toEqual(["Actual costs × business use."]);
    const bare = mapKmRules({ engine: "nz_tiered_km", methods: [] });
    expect(kmExpenseRules(bare, "kilometre_rate")).toMatchObject({ allowFuel: false, notes: [] });
    expect(kmExpenseRules(bare, "logbook")).toMatchObject({ allowFuel: true, notes: [] });
  });
});

describe("kmTripIssues by country", () => {
  const keys = (issues: { key: string }[]) => issues.map((issue) => issue.key);

  it("keeps Australia's wording word for word", () => {
    const cents = { method: "cents_per_kilometre" as const, ratePerKm: 0.91, hasVehicles: true };
    expect(kmTripIssues(draft({ fuelCost: "1", otherExpenses: "2" }), cents, AU)).toEqual([
      { key: "fuelCost", message: "Fuel is already covered by the cents per kilometre rate" },
      { key: "otherExpenses", message: "Running costs are already covered by the cents per kilometre rate" },
    ]);
    expect(
      kmTripIssues(draft({ parkingAmount: "" }), { ...cents, ratePerKm: 0 }, AU)[0].message,
    ).toBe("Total cost must be greater than $0");
    expect(
      kmTripIssues(draft({ parkingAmount: "" }), { ...cents, method: "logbook" }, AU)[0].message,
    ).toBe("Add at least one expense — under the logbook method a trip's cost is its actual expenses");
  });

  it("doesn't ask a New Zealand logbook trip for odometer readings", () => {
    const actual = { method: "logbook" as const, ratePerKm: 0, hasVehicles: true };
    expect(kmTripIssues(draft({ odometerStart: "", odometerEnd: "" }), actual, NZ)).toEqual([]);
    expect(keys(kmTripIssues(draft({ odometerStart: "", odometerEnd: "" }), actual, AU))).toEqual([
      "odometerStart",
      "odometerEnd",
    ]);
    expect(
      kmTripIssues(draft({ parkingAmount: "" }), actual, NZ)[0].message,
    ).toBe("Add at least one expense — under the actual costs method a trip's cost is its actual expenses");
  });

  it("blocks fuel and running costs under the kilometre rate, and writes $0 in the country's symbol", () => {
    const tiered = { method: "kilometre_rate" as const, ratePerKm: 1.2, hasVehicles: true };
    expect(kmTripIssues(draft({ fuelCost: "5", otherExpenses: "1" }), tiered, NZ)).toEqual([
      { key: "fuelCost", message: "Fuel is already covered by the kilometre rate" },
      { key: "otherExpenses", message: "Running costs are already covered by the kilometre rate" },
    ]);
    expect(
      kmTripIssues(draft({ parkingAmount: "" }), { ...tiered, ratePerKm: 0, currencySymbol: "R" }, NZ)[0]
        .message,
    ).toBe("Total cost must be greater than R0");
  });

  it("only sends odometer readings where the country asks for them", () => {
    const context = { method: "logbook" as const, ratePerKm: 0 };
    expect(kmTripPayload(draft(), context, AU)).toMatchObject({ odometer_start: 12500.5 });
    expect(kmTripPayload(draft(), context, NZ)).not.toHaveProperty("odometer_start");
    const tiered = kmTripPayload(draft({ fuelCost: "9" }), { method: "kilometre_rate", ratePerKm: 1.2 }, NZ);
    expect(tiered).toMatchObject({ calculation_method: "kilometre_rate", rate_per_km: 1.2, fuel_cost: 0 });
  });
});

describe("kmTripRate and the New Zealand preview", () => {
  const nzSettings = settings({
    calculationMethod: "kilometre_rate",
    ratePerKm: 0,
    vehicles: [vehicle({ vehicleType: "petrol" })],
  });

  it("previews a kilometre-rate trip at the vehicle type's tier 1 rate", () => {
    const rate = kmTripRate(NZ, {
      method: "kilometre_rate",
      settings: nzSettings,
      vehicle: nzSettings.vehicles[0],
      rulesReady: true,
    });
    expect(rate).toBe(1.2);
    // Business km × tier 1, plus parking: 24 × 1.20 + 10.
    const figures = kmTripFigures(draft({ fuelCost: "30" }), "kilometre_rate", rate);
    expect(figures.totalAmount).toBeCloseTo(38.8);
    expect(figures.estimatedDeduction).toBeCloseTo(38.8);
    const split = kmTripFigures(draft({ isSplit: true, businessPercentage: "50", parkingAmount: "" }), "kilometre_rate", rate);
    expect(split.estimatedDeduction).toBeCloseTo(12 * 1.2);
  });

  it("has no preview rate for a vehicle without a covered type, and keeps a saved trip's own rate", () => {
    const base = { method: "kilometre_rate" as const, settings: nzSettings, rulesReady: true };
    expect(kmTripRate(NZ, { ...base, vehicle: vehicle({ vehicleType: "other" }) })).toBe(0);
    expect(kmTripRate(NZ, { ...base, vehicle: null })).toBe(0);
    expect(kmTripRate(NZ, { ...base, vehicle: null, savedRate: 0.97 })).toBe(0.97);
  });

  it("prices an Australian trip at the country rate only once the server has answered", () => {
    const auSettings = settings({ calculationMethod: "cents_per_kilometre", ratePerKm: 0.88 });
    const base = { method: "cents_per_kilometre" as const, settings: auSettings, vehicle: null };
    expect(kmTripRate(AU, { ...base, rulesReady: false })).toBe(0.88);
    expect(kmTripRate(mapKmRules(rawAuRules), { ...base, rulesReady: true })).toBe(0.91);
    expect(
      kmTripRate(mapKmRules(rawAuRules), {
        ...base,
        settings: { ...auSettings, followCountryRate: false },
        rulesReady: true,
      }),
    ).toBe(0.88);
  });
});

describe("settings by country", () => {
  it("maps and posts the new settings and vehicle fields in snake_case", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          calculation_method: "kilometre_rate",
          rate_per_km: null,
          cents_per_km_limit: null,
          follow_country_rate: true,
          business_use_basis: "estimate",
          business_use_percentage: "20",
          vehicle_details: [
            {
              nickname: "Hilux",
              vehicle_type: "diesel",
              odometer_readings: [{ date: "2026-03-31", reading: 81234 }],
            },
          ],
        },
      },
    });
    const mapped = await fetchKmSettings();
    expect(mapped).toMatchObject({
      calculationMethod: "kilometre_rate",
      centsPerKmLimit: null,
      followCountryRate: true,
      businessUseBasis: "estimate",
      businessUsePercentage: 20,
    });
    expect(mapped.vehicles[0]).toMatchObject({
      vehicleType: "diesel",
      odometerReadings: [{ date: "2026-03-31", reading: "81234" }],
    });

    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await saveKmSettingsApi(mapped);
    const fields = decrypted(apiMock.post.mock.calls[0][1]);
    expect(fields).toMatchObject({
      calculation_method: "kilometre_rate",
      follow_country_rate: "true",
      business_use_basis: "estimate",
      business_use_percentage: 20,
    });
    expect(fields).not.toHaveProperty("cents_per_km_limit");
    expect(fields.vehicle_details).toEqual([
      expect.objectContaining({
        vehicle_type: "diesel",
        odometer_readings: [{ date: "2026-03-31", reading: 81234 }],
      }),
    ]);
  });

  it("defaults the new fields for an older record", () => {
    expect(DEFAULT_KM_SETTINGS).toMatchObject({ followCountryRate: true, businessUseBasis: null });
  });

  it("follows the country's rate unless an Australian business types a different one", () => {
    const saved = settings({ calculationMethod: "cents_per_kilometre", ratePerKm: 0.91 });
    const draftOf = (over: Partial<ReturnType<typeof kmSettingsDraft>> = {}) => ({
      ...kmSettingsDraft(saved, AU),
      ...over,
    });
    expect(applyKmSettingsDraft(saved, draftOf(), AU).followCountryRate).toBe(true);
    expect(applyKmSettingsDraft(saved, draftOf({ ratePerKm: "0.95" }), AU)).toMatchObject({
      ratePerKm: 0.95,
      followCountryRate: false,
    });
    const pinned = { ...saved, ratePerKm: 0.95, followCountryRate: false };
    expect(
      applyKmSettingsDraft(pinned, { ...kmSettingsDraft(pinned, AU), ratePerKm: "0.91" }, AU)
        .followCountryRate,
    ).toBe(true);
    // New Zealand has no custom rate to pin.
    expect(applyKmSettingsDraft(saved, draftOf({ ratePerKm: "2" }), NZ)).toMatchObject({
      ratePerKm: 0.91,
      followCountryRate: true,
    });
  });

  it("maps a method the country doesn't offer and keeps New Zealand's business-use basis", () => {
    const saved = settings({ calculationMethod: "cents_per_kilometre", businessUseBasis: null });
    expect(kmSettingsDraft(saved, NZ)).toMatchObject({
      calculationMethod: "kilometre_rate",
      businessUseBasis: "records",
    });
    const applied = applyKmSettingsDraft(
      saved,
      { ...kmSettingsDraft(saved, NZ), businessUseBasis: "estimate", businessUsePercentage: "20" },
      NZ,
    );
    expect(applied).toMatchObject({ businessUseBasis: "estimate", businessUsePercentage: 20 });
    // Australia has no basis to set.
    expect(
      applyKmSettingsDraft(saved, { ...kmSettingsDraft(saved, AU), businessUseBasis: "estimate" }, AU)
        .businessUseBasis,
    ).toBeNull();
  });

  it("caps an estimate at New Zealand's no-logbook limit and skips the rate it can't set", () => {
    const keys = (over: Partial<ReturnType<typeof kmSettingsDraft>>) =>
      kmSettingsIssues(
        {
          ...kmSettingsDraft(settings({ vehicles: [vehicle({ vehicleType: "petrol" })] }), NZ),
          ...over,
        },
        NZ,
      ).map((issue) => issue.key);
    expect(keys({ ratePerKm: "" })).toEqual([]);
    expect(keys({ businessUseBasis: "estimate", businessUsePercentage: "30" })).toEqual([
      "businessUsePercentage",
    ]);
    expect(keys({ businessUseBasis: "estimate", businessUsePercentage: "25" })).toEqual([]);
  });

  it("asks a New Zealand vehicle for a type instead of a fuel type, and checks its readings", () => {
    const keys = (value: KmVehicle) => kmVehicleIssues(value, [], NZ).map((issue) => issue.key);
    expect(keys(vehicle({ fuelType: "", vehicleType: "diesel" }))).toEqual([]);
    expect(keys(vehicle({ vehicleType: "" }))).toEqual(["vehicleType"]);
    expect(keys(vehicle({ vehicleType: "hovercraft" }))).toEqual(["vehicleType"]);
    expect(
      keys(vehicle({ vehicleType: "petrol", odometerReadings: [{ date: "2027-03-31", reading: "" }] })),
    ).toEqual(["odometerReadings"]);
    // Australia: unchanged — fuel type required, no vehicle type.
    expect(kmVehicleIssues(vehicle({ fuelType: "" }), [], AU).map((issue) => issue.key)).toEqual(["fuelType"]);
  });
});

describe("mapKmStats by country", () => {
  it("leaves Australia's summary as it was, with no kilometre-rate block", () => {
    const stats = mapKmStats({
      currency: "AUD",
      country_iso2: "AU",
      method_summaries: [
        { type: "cents_per_kilometre", cents_per_km_limit: 5000, claimed_business_km: 100, vehicle_claims: [] },
      ],
    });
    expect(stats.kilometreRate).toBeNull();
    expect(stats.currency).toBe("AUD");
    expect(stats.cents).toMatchObject({ limit: 5000, claimedBusinessKm: 100 });
  });

  it("maps New Zealand's kilometre-rate year, vehicle by vehicle", () => {
    const stats = mapKmStats({
      currency: "NZD",
      country_iso2: "NZ",
      method_summaries: [
        { type: "logbook", total_logbook_km: 0, total_logbook_business_km: 0, business_use_percentage: 0 },
        {
          type: "kilometre_rate",
          income_year_label: "2026-27",
          income_year: { label: "2026-27", start_date: "2026-04-01", end_date: "2027-03-31" },
          currency: "NZD",
          provisional: true,
          rate_year: "2025-26",
          tier1_max_km: 14000,
          total_km: 18000,
          claimed_business_km: 9000,
          total_claim_amount: 10287.0,
          toll_and_parking_total: 40.0,
          claim_plus_toll_parking: 10327.0,
          vehicle_claims: [
            {
              vehicle: "Hilux",
              vehicle_type: "diesel",
              total_km: 18000,
              total_km_source: "odometer",
              business_km: 9000,
              business_use_percentage: 50,
              business_use_basis: "records",
              tier1_km: 7000,
              tier2_km: 2000,
              tier1_rate: 1.3,
              tier2_rate: 0.38,
              claim_amount: 9860.0,
              tier1_usage_percentage: 100,
              warnings: [{ code: "odometer_missing", message: "Add the odometer reading at 31 March 2027." }],
            },
          ],
          warnings: [{ code: "provisional_rates", message: "These are last year's rates." }],
        },
      ],
    });
    expect(stats.currency).toBe("NZD");
    expect(stats.countryIso2).toBe("NZ");
    expect(stats.kilometreRate).toMatchObject({
      incomeYearLabel: "2026-27",
      provisional: true,
      rateYear: "2025-26",
      tier1MaxKm: 14000,
      totalKm: 18000,
      claimedBusinessKm: 9000,
      claimAmount: 10287,
      tollAndParking: 40,
      totalClaim: 10327,
      warnings: [{ code: "provisional_rates", message: "These are last year's rates." }],
    });
    expect(stats.kilometreRate?.vehicleClaims[0]).toEqual({
      vehicle: "Hilux",
      vehicleType: "diesel",
      totalKm: 18000,
      totalKmSource: "odometer",
      businessKm: 9000,
      businessUsePercentage: 50,
      businessUseBasis: "records",
      tier1Km: 7000,
      tier2Km: 2000,
      tier1Rate: 1.3,
      tier2Rate: 0.38,
      claimAmount: 9860,
      tier1UsagePercentage: 100,
      warnings: [{ code: "odometer_missing", message: "Add the odometer reading at 31 March 2027." }],
    });
  });

  it("reads a trip's rate year, provisional flag and source", () => {
    const mapped = mapKmTrip({
      ...apiTrip,
      calculation_method: "kilometre_rate",
      rate_year: "2025-26",
      rate_provisional: 1,
      rate_source: "country",
    });
    expect(mapped).toMatchObject({
      calculationMethod: "kilometre_rate",
      rateYear: "2025-26",
      rateProvisional: true,
      rateSource: "country",
    });
    expect(mapKmTrip(apiTrip)).toMatchObject({ rateYear: "", rateProvisional: false, rateSource: null });
  });
});

describe("logbook minimum by country", () => {
  it("says Australia's 12 weeks exactly as before", () => {
    expect(kmLogbookPeriodCheck(AU, "2026-07-01", "2026-09-22")).toEqual({
      meets: true,
      message: "12 weeks — meets the ATO's minimum of 12 continuous weeks.",
    });
    expect(kmLogbookPeriodCheck(AU, "2026-07-01", "2026-09-21")).toEqual({
      meets: false,
      message: "11.9 weeks — below the ATO's minimum. A valid logbook covers at least 12 continuous weeks.",
    });
    expect(kmLogbookPeriodCheck(AU, "", "2026-09-21")).toBeNull();
  });

  it("counts New Zealand's 90 consecutive days", () => {
    expect(kmRangeDays("2026-04-01", "2026-06-29")).toBe(90);
    expect(kmLogbookPeriodCheck(NZ, "2026-04-01", "2026-06-29")).toEqual({
      meets: true,
      message: "90 days — meets Inland Revenue's minimum of 90 consecutive days.",
    });
    expect(kmLogbookPeriodCheck(NZ, "2026-04-01", "2026-06-28")?.meets).toBe(false);
  });
});

describe("report export by country", () => {
  it("keeps Australia's columns exactly, and labels money and the rate year elsewhere", () => {
    const row = trip({ rateYear: "2025-26", rateProvisional: true });
    expect(Object.keys(kmReportExportRows([row])[0])).toEqual([
      "Start Date Time",
      "End Date Time",
      "Vehicle",
      "Trip Type",
      "Purpose",
      "Start Location",
      "End Location",
      "Client",
      "Project",
      "Job",
      "Distance (KM)",
      "Business %",
      "Deductible KM",
      "Rate per KM",
      "Total Amount",
      "Estimated Deduction",
      "Start Odometer",
      "End Odometer",
      "Tolls",
      "Parking",
      "Fuel",
      "Other Expenses",
      "Notes",
    ]);
    const nz = kmReportExportRows([row], { currency: "NZD" })[0];
    expect(nz).toMatchObject({
      "Rate per KM (NZD)": 0.88,
      "Rate Year": "2025-26",
      Provisional: "Yes",
      "Total Amount (NZD)": 151.24,
      "Tolls (NZD)": 10,
    });
    expect(nz).not.toHaveProperty("Total Amount");
  });

  it("reads the report's currency and year summary", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          calculation_method: "kilometre_rate",
          currency: "NZD",
          year_summary: { income_year_label: "2026-27", provisional: true, vehicle_claims: [] },
          rows: [],
        },
      },
    });
    const report = await fetchKmReport({ method: "kilometre_rate", startDate: "2026-04-01", endDate: "2027-03-31" });
    expect(report.method).toBe("kilometre_rate");
    expect(report.currency).toBe("NZD");
    expect(report.yearSummary).toMatchObject({ incomeYearLabel: "2026-27", provisional: true });
  });
});

describe("kmInvoiceLines tax", () => {
  it("leaves tax off unless the convert dialog's option is ticked", () => {
    const trips = [trip({ tollAmount: 10, splitToll: false })];
    expect(kmInvoiceLines(trips, 2).every((line) => line.gst === false)).toBe(true);
    expect(kmInvoiceLines(trips, 2, true).every((line) => line.gst === true)).toBe(true);
  });
});
