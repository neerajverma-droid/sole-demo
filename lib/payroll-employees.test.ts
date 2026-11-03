import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import type { PayrollSeats } from "@/lib/payroll";
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

const { NO_PAYROLL_SEATS } = await import("@/lib/payroll");

// Imported after the mock so the lib's own `import api from
// "@/utils/axiosInstance"` resolves to the mocked module above.
const {
  CLONE_MANUAL,
  CREATE_EMPLOYEE_DEFAULTS,
  EMPLOYEE_UPLOAD_TIMEOUT_MS,
  buildCreateEmployeePayload,
  buildUpdateEmployeePayload,
  bulkUploadEmployeesApi,
  cleanPayload,
  createEmployeeApi,
  createEmployeeSchema,
  deleteEmployeeApi,
  deleteEmployeeDocumentApi,
  employeeErrorMessage,
  employeeFilesError,
  employeeHandle,
  employeeListQuery,
  employeePhone,
  employeeWriteBlock,
  emptyEmployeeProfile,
  fetchBulkTemplateApi,
  fetchEmployeeDetail,
  fetchEmployeeDocuments,
  fetchEmployeeStats,
  fetchEmployeesPage,
  filtersForStatCard,
  mapEmployee,
  mergeContractedHours,
  newEmployeeBlock,
  sendCredentialsEmailApi,
  snakeKey,
  syncStatusVariant,
  updateEmployeeApi,
  uploadEmployeeDocumentsApi,
  validateProfile,
} = await import("@/lib/payroll-employees");

import type {
  CreateEmployeeValues,
  EmployeeProfile,
} from "@/lib/payroll-employees";

/** The fields a `{ data: <cipher> }` body carried. */
function decrypted(body: unknown): Record<string, unknown> {
  const data = (body as { data?: unknown })?.data;
  if (typeof data !== "string") throw new Error("Body was not encrypted");
  return decryptPayload(data);
}

/** An axios-style rejection carrying the backend's error envelope. */
function apiError(status: number, data: Record<string, unknown>) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });
}

const ok = <T>(data: T, extra: Record<string, unknown> = {}) => ({
  data: { success: true, message: "OK", data, ...extra },
});

beforeEach(() => {
  vi.clearAllMocks();
});

/** A create form that passes validation — overridden per test. */
function createValues(
  overrides: Partial<CreateEmployeeValues> = {},
): CreateEmployeeValues {
  return {
    ...CREATE_EMPLOYEE_DEFAULTS,
    givenName: " Olivia ",
    surname: "Nguyen",
    username: "olivia.nguyen",
    email: "Olivia@Example.com.AU ",
    mobileNumber: "0412 345 678",
    employmentType: "FULL_TIME",
    ...overrides,
  };
}

/** `createValues` with the tax, super and bank details the schema requires. */
function validValues(
  overrides: Partial<CreateEmployeeValues> = {},
): CreateEmployeeValues {
  return createValues({
    tfn: "123 456 782",
    employerSuperFund: "STA0100AU",
    employerMemberNumber: "88001234",
    account1Name: "Olivia Nguyen",
    account1Bsb: "063-182",
    account1Number: "1234 5678",
    ...overrides,
  });
}

function issues(values: CreateEmployeeValues): Record<string, string> {
  const parsed = createEmployeeSchema.safeParse(values);
  if (parsed.success) return {};
  return Object.fromEntries(
    parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}

const ACTIVE_SEATS: PayrollSeats = {
  ...NO_PAYROLL_SEATS,
  status: "ACTIVE",
  isActive: true,
  employeeLimit: 5,
  activeEmployees: 3,
  availableSeats: 2,
  canAddEmployee: true,
};

describe("createEmployeeSchema", () => {
  it("accepts a complete form", () => {
    expect(issues(validValues())).toEqual({});
  });

  it("requires the identity fields with sole-webapp's messages", () => {
    expect(
      issues(
        validValues({
          givenName: " ",
          surname: "",
          username: "",
          email: "",
          mobileNumber: "",
          employmentType: "",
        }),
      ),
    ).toEqual({
      givenName: "Given name is required.",
      surname: "Surname is required.",
      username: "Username is required.",
      email: "Email is required.",
      mobileNumber: "Mobile number is required.",
      employmentType: "Employment type is required.",
    });
  });

  it("requires what the pay run's profile check looks for", () => {
    expect(
      issues(
        validValues({
          tfn: "",
          employerSuperFund: " ",
          employerMemberNumber: "",
          account1Name: "",
          account1Bsb: "",
          account1Number: "",
        }),
      ),
    ).toEqual({
      tfn: "Tax file number is required.",
      employerSuperFund: "Super fund USI is required.",
      employerMemberNumber: "Member number is required.",
      account1Name: "Account name is required.",
      account1Bsb: "BSB is required.",
      account1Number: "Account number is required.",
    });
  });

  it("checks the TFN, BSB and account number lengths", () => {
    expect(
      issues(validValues({ tfn: "1234567", account1Bsb: "06318", account1Number: "1234" })),
    ).toEqual({
      tfn: "A TFN is 8 or 9 digits.",
      account1Bsb: "A BSB is 6 digits.",
      account1Number: "Use 5 to 10 digits.",
    });
  });

  it("checks the email shape", () => {
    expect(issues(validValues({ email: "olivia@example" })).email).toBe(
      "Enter a valid email address.",
    );
  });

  it("wants 6 to 15 digits in the mobile, ignoring spaces and dashes", () => {
    expect(issues(validValues({ mobileNumber: "12-3456" }))).toEqual({});
    expect(issues(validValues({ mobileNumber: "12 34" })).mobileNumber).toBe(
      "Use 6 to 15 digits.",
    );
    expect(
      issues(validValues({ mobileNumber: "1234567890123456" })).mobileNumber,
    ).toBe("Use 6 to 15 digits.");
  });

  it("doesn't need an employment type when cloning", () => {
    expect(
      issues(
        validValues({ employmentType: "", clonedFromUsername: "onguyen" }),
      ),
    ).toEqual({});
  });

  it("keeps the number fields inside the inputs' ranges", () => {
    const found = issues(
      validValues({
        weeklyOrdinaryHours: "169",
        taxRateFixPercent: "101",
        additionalSuperRate: "abc",
        superOverrideAmount: "-1",
      }),
    );
    expect(found.weeklyOrdinaryHours).toBe(
      "Weekly ordinary hours must be between 0 and 168.",
    );
    expect(found.taxRateFixPercent).toBe(
      "Tax rate fix must be between 0 and 100.",
    );
    expect(found.additionalSuperRate).toBe(
      "Additional super rate must be a number.",
    );
    expect(found.superOverrideAmount).toBe(
      "Override amount can't be less than 0.",
    );
  });
});

describe("buildCreateEmployeePayload", () => {
  it("builds the snake_case body, trimmed and normalised", () => {
    const payload = buildCreateEmployeePayload(
      createValues({
        payrollId: " TC1001 ",
        weeklyOrdinaryHours: "38",
        tfn: "123 456 782",
        additionalSuperRate: "2.5",
        employerSuperFund: "AustralianSuper",
        account1Name: "Olivia Nguyen",
        account1Bsb: "063-182",
        account1Number: "1048 2291",
        sendCredentialsEmail: true,
      }),
    );

    expect(payload).toEqual({
      given_name: "Olivia",
      surname: "Nguyen",
      username: "olivia.nguyen",
      email: "olivia@example.com.au",
      mobile_country_code: "+61",
      mobile_number: "0412345678",
      employment_type: "FULL_TIME",
      payroll_id: "TC1001",
      send_credentials_email: true,
      send_credentials_sms: false,
      employment: { employment_type: "FULL_TIME", weekly_ordinary_hours: 38 },
      tax: {
        tfn: "123 456 782",
        tax_scale: "AUSTRALIAN_RESIDENT",
        stp_income_stream_type: "SAW",
        tax_free_threshold_claimed: true,
        help_hecs: false,
        trade_support_loan: false,
        student_financial_supplement: false,
        seniors_and_pensioners_tax_offset: false,
        tax_offset_amount: 0,
        tax_rate_fix_percent: 0,
      },
      super: {
        super_ordinary_hours: "ON_ORDINARY_HOURS",
        additional_super_rate: 2.5,
        super_override_type: "FIXED",
        employer_super_fund: "AustralianSuper",
      },
      banking: {
        account1_name: "Olivia Nguyen",
        account1_bsb: "063182",
        account1_number: "10482291",
      },
    });
  });

  it("leaves blanks out rather than sending empty strings", () => {
    const payload = buildCreateEmployeePayload(createValues());
    expect(payload).not.toHaveProperty("payroll_id");
    expect(payload).not.toHaveProperty("cloned_from_username");
    expect(payload.employment).toEqual({ employment_type: "FULL_TIME" });
    expect(payload.banking).toEqual({});
  });

  it("sends the clone source and no employment type when cloning", () => {
    const payload = buildCreateEmployeePayload(
      createValues({ clonedFromUsername: "onguyen", employmentType: "CASUAL" }),
    );
    expect(payload.cloned_from_username).toBe("onguyen");
    expect(payload).not.toHaveProperty("employment_type");
    expect(payload.employment).toEqual({});
  });

  it("treats a blank tax figure as zero", () => {
    const payload = buildCreateEmployeePayload(
      createValues({ taxOffsetAmount: "", taxRateFixPercent: "12.5" }),
    );
    expect(payload.tax).toMatchObject({
      tax_offset_amount: 0,
      tax_rate_fix_percent: 12.5,
    });
  });

  it("uses the manual sentinel as 'not cloning'", () => {
    expect(CLONE_MANUAL).toBe(CREATE_EMPLOYEE_DEFAULTS.clonedFromUsername);
  });
});

describe("cleanPayload", () => {
  it("drops empty strings and undefined at every depth, keeping false, 0 and null", () => {
    expect(
      cleanPayload({
        a: "",
        b: undefined,
        c: false,
        d: 0,
        e: null,
        f: { g: "", h: "x", i: [{ j: "", k: 1 }] },
      }),
    ).toEqual({ c: false, d: 0, e: null, f: { h: "x", i: [{ k: 1 }] } });
  });
});

describe("snakeKey", () => {
  it.each([
    ["addressLine1", "address_line1"],
    ["account1Bsb", "account1_bsb"],
    ["employeeIdNo", "employee_id_no"],
    ["showRdoOnPayslip", "show_rdo_on_payslip"],
    ["tfn", "tfn"],
  ])("%s → %s", (input, output) => {
    expect(snakeKey(input)).toBe(output);
  });
});

describe("buildUpdateEmployeePayload", () => {
  function profile(): EmployeeProfile {
    const base = emptyEmployeeProfile();
    base.givenName = " Olivia ";
    base.surname = "Nguyen";
    base.email = "OLIVIA@example.com.au";
    base.mobileNumber = "0412-345-678";
    base.employment.defaultHourlyRate = "42.50";
    base.employment.contractedHours[0] = {
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "17:36",
      hours: "7.6",
    };
    base.banking.account1Bsb = "063-182";
    base.banking.account1Number = "1048 2291";
    return base;
  }

  it("builds the snake_case body and drops every blank", () => {
    const payload = buildUpdateEmployeePayload(profile());

    expect(payload).toMatchObject({
      given_name: "Olivia",
      surname: "Nguyen",
      email: "olivia@example.com.au",
      mobile_country_code: "+61",
      mobile_number: "0412345678",
      address: { country: "Australia", timezone: "Victoria" },
      banking: { account1_bsb: "063182", account1_number: "10482291" },
      access_control: { location_access: "STAFF", display_costs: false },
    });
    expect(payload).not.toHaveProperty("username");
    expect(payload).not.toHaveProperty("profile_photo_url");
    expect(payload.personal_details).toEqual({});
  });

  it("sends numbers as numbers", () => {
    const payload = buildUpdateEmployeePayload(profile()) as {
      employment: Record<string, unknown>;
    };
    expect(payload.employment.default_hourly_rate).toBe(42.5);
    expect(payload.employment).not.toHaveProperty("saturday_rate");
    expect(payload.employment.show_rdo_on_payslip).toBe(true);
  });

  it("keeps every day of contracted hours, with only what was filled", () => {
    const payload = buildUpdateEmployeePayload(profile()) as {
      employment: { contracted_hours: Record<string, unknown>[] };
    };
    expect(payload.employment.contracted_hours).toHaveLength(7);
    expect(payload.employment.contracted_hours[0]).toEqual({
      day_of_week: 1,
      start_time: "09:00",
      end_time: "17:36",
      hours: 7.6,
    });
    expect(payload.employment.contracted_hours[6]).toEqual({ day_of_week: 0 });
  });

  it("only sends opening balances that have a financial year", () => {
    const base = profile();
    base.openingBalances = [
      {
        financialYear: "2025-2026",
        preGrossEarnings: "21450",
        preSuperannuation: "",
        preTax: "4310.5",
        preNet: "",
        annualLeaveHours: "",
        personalLeaveHours: "",
        longServiceLeaveHours: "",
        rdoHours: "",
        toilHours: "",
        offHours: "",
        compassionateHours: "",
      },
      {
        financialYear: " ",
        preGrossEarnings: "100",
        preSuperannuation: "",
        preTax: "",
        preNet: "",
        annualLeaveHours: "",
        personalLeaveHours: "",
        longServiceLeaveHours: "",
        rdoHours: "",
        toilHours: "",
        offHours: "",
        compassionateHours: "",
      },
    ];
    expect(buildUpdateEmployeePayload(base).opening_balances).toEqual([
      {
        financial_year: "2025-2026",
        pre_gross_earnings: 21450,
        pre_tax: 4310.5,
      },
    ]);
  });

  it("carries fields that have no input through unchanged", () => {
    const base = profile();
    base.tax.tfndStatus = "PROVIDED";
    base.accessControl.hrAccess = "READ_ONLY";
    const payload = buildUpdateEmployeePayload(base) as {
      tax: Record<string, unknown>;
      access_control: Record<string, unknown>;
    };
    expect(payload.tax.tfnd_status).toBe("PROVIDED");
    expect(payload.access_control.hr_access).toBe("READ_ONLY");
  });
});

describe("validateProfile", () => {
  it("needs a given name, surname and a valid email", () => {
    expect(validateProfile(emptyEmployeeProfile())).toEqual({
      givenName: "Given name is required.",
      surname: "Surname is required.",
      email: "Email is required.",
    });
    const filled = emptyEmployeeProfile();
    filled.givenName = "Olivia";
    filled.surname = "Nguyen";
    filled.email = "nope";
    expect(validateProfile(filled)).toEqual({
      email: "Enter a valid email address.",
    });
    filled.email = "olivia@example.com.au";
    expect(validateProfile(filled)).toEqual({});
  });
});

describe("mergeContractedHours", () => {
  it("fills every day in roster order from whatever the API sent", () => {
    const rows = mergeContractedHours([
      { dayOfWeek: "3", startTime: "08:00", endTime: "16:00", hours: "8" },
      { dayOfWeek: 0, hours: "4" },
    ]);
    expect(rows.map((row) => row.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(rows[2]).toEqual({
      dayOfWeek: 3,
      startTime: "08:00",
      endTime: "16:00",
      hours: "8",
    });
    expect(rows[6]).toEqual({
      dayOfWeek: 0,
      startTime: "",
      endTime: "",
      hours: "4",
    });
    expect(rows[0]).toEqual({
      dayOfWeek: 1,
      startTime: "",
      endTime: "",
      hours: "",
    });
  });
});

describe("newEmployeeBlock", () => {
  it("blocks when payroll isn't on", () => {
    expect(newEmployeeBlock(NO_PAYROLL_SEATS)).toBe("not-enabled");
    expect(newEmployeeBlock(undefined)).toBe("not-enabled");
    expect(newEmployeeBlock({ ...ACTIVE_SEATS, status: "FROZEN" })).toBe(
      "not-enabled",
    );
  });

  it("blocks at the seat limit", () => {
    expect(
      newEmployeeBlock({
        ...ACTIVE_SEATS,
        activeEmployees: 5,
        availableSeats: 0,
      }),
    ).toBe("seat-limit");
  });

  it("lets an employee through when there's a free seat", () => {
    expect(newEmployeeBlock(ACTIVE_SEATS)).toBeNull();
  });
});

describe("employeeFilesError", () => {
  const mb = 1024 * 1024;

  it("allows up to ten files of 20 MB each", () => {
    expect(
      employeeFilesError(Array.from({ length: 10 }, () => ({ size: 20 * mb }))),
    ).toBeNull();
  });

  it("refuses an eleventh file", () => {
    expect(
      employeeFilesError(Array.from({ length: 11 }, () => ({ size: 1 }))),
    ).toBe("You can upload up to 10 files at once.");
  });

  it("refuses a file over 20 MB", () => {
    expect(employeeFilesError([{ size: 20 * mb + 1 }])).toBe(
      "Each employee file must be 20 MB or smaller.",
    );
  });
});

describe("list helpers", () => {
  it("sends only the filters that are set", () => {
    expect(
      employeeListQuery({
        page: 2,
        limit: 10,
        search: "  ",
        employmentType: "all",
        status: "all",
      }),
    ).toEqual({ page: 2, limit: 10 });
    expect(
      employeeListQuery({
        page: 1,
        limit: 25,
        search: " olivia ",
        employmentType: "CASUAL",
        status: "FAILED",
      }),
    ).toEqual({
      page: 1,
      limit: 25,
      search: "olivia",
      employment_type: "CASUAL",
      status: "FAILED",
    });
  });

  it("maps the stat cards to filters", () => {
    expect(filtersForStatCard("failed")).toEqual({
      employmentType: "all",
      status: "FAILED",
    });
    expect(filtersForStatCard("active")).toEqual({
      employmentType: "all",
      status: "all",
    });
  });

  it("colours sync status", () => {
    expect(syncStatusVariant("SYNCED")).toBe("success");
    expect(syncStatusVariant("PENDING")).toBe("warning");
    expect(syncStatusVariant("FAILED")).toBe("danger");
  });

  it("formats handle and phone", () => {
    expect(employeeHandle({ username: "", eusername: "onguyen" })).toBe(
      "onguyen",
    );
    expect(employeeHandle({ username: "olivia", eusername: "onguyen" })).toBe(
      "olivia",
    );
    expect(
      employeePhone({ mobileCountryCode: "+61", mobileNumber: "412 345 678" }),
    ).toBe("+61 412 345 678");
    expect(employeePhone({ mobileCountryCode: "+61", mobileNumber: "" })).toBe(
      "—",
    );
  });
});

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

const RAW_ROW = {
  id: 42,
  tenant_id: 1,
  business_id: 7,
  given_name: "Olivia",
  surname: "Nguyen",
  username: "olivia.nguyen",
  eusername: null,
  email: "olivia@example.com.au",
  mobile_country_code: "+61",
  mobile_number: "412345678",
  employment_type: "FULL_TIME",
  payroll_id: "PAY-1760000000000",
  status: "PENDING",
  profile_photo_url: null,
};

describe("fetchEmployeesPage", () => {
  it("sends the set filters and maps rows and pagination", async () => {
    apiMock.get.mockResolvedValueOnce(
      ok(
        [
          RAW_ROW,
          { ...RAW_ROW, id: 43, status: "SYNCED", eusername: "onguyen" },
        ],
        {
          pagination: { total: "23", page: 2, limit: 10, total_pages: "3" },
        },
      ),
    );

    const page = await fetchEmployeesPage({
      page: 2,
      limit: 10,
      search: " liv ",
      employmentType: "all",
      status: "SYNCED",
    });

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.employees, {
      params: { page: 2, limit: 10, search: "liv", status: "SYNCED" },
    });
    expect(page.total).toBe(23);
    expect(page.totalPages).toBe(3);
    expect(page.employees[0]).toEqual({
      id: "42",
      givenName: "Olivia",
      surname: "Nguyen",
      username: "olivia.nguyen",
      eusername: null,
      email: "olivia@example.com.au",
      mobileCountryCode: "+61",
      mobileNumber: "412345678",
      employmentType: "FULL_TIME",
      payrollId: "PAY-1760000000000",
      status: "PENDING",
      profilePhotoUrl: null,
    });
    expect(page.employees[1].eusername).toBe("onguyen");
  });

  it("throws the server's message on failure", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: false, message: "Limit must be between 1 and 100." },
    });
    await expect(
      fetchEmployeesPage({
        page: 1,
        limit: 500,
        search: "",
        employmentType: "all",
        status: "all",
      }),
    ).rejects.toThrow("Limit must be between 1 and 100.");
  });
});

describe("mapEmployee", () => {
  it("survives nulls and unknown values", () => {
    expect(
      mapEmployee({
        id: 1,
        given_name: null,
        employment_type: "INTERN",
        status: null,
      }),
    ).toMatchObject({
      id: "1",
      givenName: "",
      employmentType: null,
      status: "PENDING",
      eusername: null,
    });
  });
});

describe("fetchEmployeeStats", () => {
  it("maps the four figures, string numbers included", async () => {
    apiMock.get.mockResolvedValueOnce(
      ok({
        total_employees: "14",
        active_employees: 13,
        inactive_employees: 1,
        profile_incomplete: "3",
        failed_sync: null,
      }),
    );
    expect(await fetchEmployeeStats()).toEqual({
      totalEmployees: 14,
      activeEmployees: 13,
      profileIncomplete: 3,
      failedSync: 0,
    });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.employeeStats);
  });
});

describe("fetchEmployeeDetail", () => {
  const RAW_DETAIL = {
    ...RAW_ROW,
    status: "SYNCED",
    eusername: "onguyen",
    personal_details: {
      id: 9,
      employee_id: 42,
      position: "Consultant",
      dob: "1991-04-18",
      gender: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    address: null,
    employment: {
      employment_type: "PART_TIME",
      default_hourly_rate: "42.50",
      weekly_ordinary_hours: "38.00",
      start_date: "2024-02-05T00:00:00.000Z",
      termination_date: null,
      super_on_leave_loading: 1,
      printed_payslip: false,
      contracted_hours:
        '[{"day_of_week":1,"start_time":"09:00:00","end_time":"17:36:00","hours":7.6}]',
    },
    tax: { tfn: "123456782", help_hecs: true, tax_offset_amount: "0.00" },
    super: { employer_super_fund: "AustralianSuper", super_fund2: "Ignored" },
    banking: { account1_bsb: "063182" },
    opening_balances: [
      {
        financial_year: "2025-2026",
        pre_gross_earnings: "21450.00",
        toil_hours: "3.50",
      },
    ],
    access_control: { hr_access: "REVIEW", reports: true },
  };

  it("fills the profile from every block, keeping defaults for what's missing", async () => {
    apiMock.get.mockResolvedValueOnce(ok(RAW_DETAIL));

    const detail = await fetchEmployeeDetail("42");

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.payroll.employee("42"));
    expect(detail.id).toBe("42");
    expect(detail.eusername).toBe("onguyen");
    expect(detail.status).toBe("SYNCED");

    const { profile } = detail;
    expect(profile.givenName).toBe("Olivia");
    expect(profile.personalDetails.position).toBe("Consultant");
    expect(profile.personalDetails.dob).toBe("1991-04-18");
    expect(profile.personalDetails.gender).toBe("");
    expect(profile.address.country).toBe("Australia");
    expect(profile.employment.employmentType).toBe("PART_TIME");
    expect(profile.employment.defaultHourlyRate).toBe("42.50");
    expect(profile.employment.startDate).toBe("2024-02-05");
    expect(profile.employment.terminationDate).toBe("");
    expect(profile.employment.superOnLeaveLoading).toBe(true);
    expect(profile.employment.showRdoOnPayslip).toBe(true);
    expect(profile.employment.contractedHours[0]).toEqual({
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "17:36",
      hours: "7.6",
    });
    expect(profile.employment.contractedHours).toHaveLength(7);
    expect(profile.tax.helpHecs).toBe(true);
    expect(profile.tax.taxOffsetAmount).toBe("0.00");
    expect(profile.super.employerSuperFund).toBe("AustralianSuper");
    expect(profile.banking.account1Bsb).toBe("063182");
    expect(profile.openingBalances).toEqual([
      expect.objectContaining({
        financialYear: "2025-2026",
        preGrossEarnings: "21450.00",
        toilHours: "3.50",
        preTax: "",
      }),
    ]);
    expect(profile.accessControl.hrAccess).toBe("REVIEW");
    expect(profile.accessControl.reports).toBe(true);
  });

  it("falls back to the employee's own type when there's no employment block", async () => {
    apiMock.get.mockResolvedValueOnce(
      ok({ ...RAW_ROW, employment_type: "CASUAL" }),
    );
    const { profile } = await fetchEmployeeDetail("42");
    expect(profile.employment.employmentType).toBe("CASUAL");
    expect(profile.employment.contractedHours).toHaveLength(7);
  });
});

describe("createEmployeeApi", () => {
  it("posts the encrypted create body", async () => {
    apiMock.post.mockResolvedValueOnce(ok(RAW_ROW));

    const created = await createEmployeeApi(
      createValues({ sendCredentialsEmail: true, account1Bsb: "063-182" }),
    );

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.payroll.employees);
    const fields = decrypted(body);
    expect(fields).toMatchObject({
      given_name: "Olivia",
      email: "olivia@example.com.au",
      mobile_number: "0412345678",
      employment_type: "FULL_TIME",
      // Top-level booleans travel as strings; Joi.boolean() converts them.
      send_credentials_email: "true",
      send_credentials_sms: "false",
      banking: { account1_bsb: "063182" },
      tax: {
        tax_scale: "AUSTRALIAN_RESIDENT",
        tax_free_threshold_claimed: true,
      },
    });
    // Blank keys are left off rather than sent as "".
    expect(fields).not.toHaveProperty("payroll_id");
    expect(fields).not.toHaveProperty("cloned_from_username");
    expect(created.id).toBe("42");
  });

  it("rejects with the seat-limit envelope intact", async () => {
    const error = apiError(402, {
      success: false,
      code: "SEAT_LIMIT_REACHED",
      message:
        "Employee seat limit reached (5/5). Please add employee seats to continue.",
    });
    apiMock.post.mockRejectedValueOnce(error);
    await expect(createEmployeeApi(createValues())).rejects.toBe(error);
    expect(employeeWriteBlock(error)).toBe("seat-limit");
  });
});

describe("updateEmployeeApi", () => {
  it("puts the encrypted profile body to the employee", async () => {
    apiMock.put.mockResolvedValueOnce(ok({ ...RAW_ROW, employment: {} }));
    const profile = emptyEmployeeProfile();
    profile.givenName = "Olivia";
    profile.surname = "Nguyen";
    profile.email = "olivia@example.com.au";
    profile.employment.employmentType = "CASUAL";
    profile.employment.defaultHourlyRate = "30";

    await updateEmployeeApi("42", profile);

    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.payroll.employee("42"));
    const fields = decrypted(body);
    expect(fields).toMatchObject({
      given_name: "Olivia",
      employment_type: "CASUAL",
      employment: { employment_type: "CASUAL", default_hourly_rate: 30 },
      access_control: { payroll_access: "NO_ACCESS" },
    });
    expect(fields.opening_balances).toEqual([]);
  });

  it("throws the server's message", async () => {
    apiMock.put.mockResolvedValueOnce({
      data: { success: false, message: "Employee not found." },
    });
    await expect(
      updateEmployeeApi("9", emptyEmployeeProfile()),
    ).rejects.toThrow("Employee not found.");
  });
});

describe("deleteEmployeeApi and sendCredentialsEmailApi", () => {
  it("deletes by id", async () => {
    apiMock.delete.mockResolvedValueOnce(ok({}));
    await deleteEmployeeApi("42");
    expect(apiMock.delete).toHaveBeenCalledWith(
      apiRoutes.payroll.employee("42"),
    );
  });

  it("returns the server's confirmation for the credentials email", async () => {
    apiMock.post.mockResolvedValueOnce(
      ok(
        {
          success: true,
          message: "Credentials email sent to olivia@example.com.au",
        },
        { message: "Credentials email sent to olivia@example.com.au" },
      ),
    );
    expect(await sendCredentialsEmailApi("42")).toBe(
      "Credentials email sent to olivia@example.com.au",
    );
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.payroll.employeeSendEmail("42"));
    expect(decrypted(body)).toEqual({});
  });
});

describe("bulk upload", () => {
  it("downloads the template as a blob", async () => {
    const blob = new Blob(["GivenName,Surname"], { type: "text/csv" });
    apiMock.get.mockResolvedValueOnce({ data: blob });
    expect(await fetchBulkTemplateApi()).toBe(blob);
    expect(apiMock.get).toHaveBeenCalledWith(
      apiRoutes.payroll.employeeBulkTemplate,
      {
        responseType: "blob",
      },
    );
  });

  it("uploads the file raw under `file` and maps the result", async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        success: true,
        message: "Processed 3 rows: 2 created, 1 failed",
        data: {
          totalRows: 3,
          validCount: "2",
          failedCount: 1,
          errors: [{ row: "3", error: "Invalid email." }],
        },
      },
    });
    const file = new File(["GivenName\nOlivia"], "team.csv", {
      type: "text/csv",
    });

    const { result, message } = await bulkUploadEmployeesApi(file);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.payroll.employeeBulkUpload);
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("file")).toBeInstanceOf(File);
    expect((body as FormData).get("data")).toBeNull();
    expect(result).toEqual({
      validCount: 2,
      failedCount: 1,
      errors: [{ row: 3, error: "Invalid email." }],
    });
    expect(message).toBe("Processed 3 rows: 2 created, 1 failed");
  });

  it("reads a bare 402 by its message", () => {
    expect(
      employeeWriteBlock(
        apiError(402, {
          message:
            "This adds 4 employees but only 1 seat(s) are available (4/5 in use). Please add employee seats to continue.",
        }),
      ),
    ).toBe("seat-limit");
    expect(
      employeeWriteBlock(
        apiError(402, {
          message:
            "Your payroll seat payment is overdue. Update your payment method before adding employees.",
        }),
      ),
    ).toBe("billing");
    expect(
      employeeWriteBlock(
        apiError(402, { code: "PAYROLL_NOT_ACTIVE", message: "x" }),
      ),
    ).toBe("billing");
    expect(employeeWriteBlock(apiError(400, { message: "Bad" }))).toBeNull();
  });
});

describe("employee documents", () => {
  const RAW_DOC = {
    id: 5,
    source_type: "payroll_employee",
    file_name: "TFN declaration.pdf",
    file_path: "documents/abc.pdf",
    file_url: "https://cdn.example.com/abc.pdf",
    file_size: "184320",
    content_type: "application/pdf",
  };

  it("lists and maps documents, with an unknown size as null", async () => {
    apiMock.get.mockResolvedValueOnce(
      ok([RAW_DOC, { ...RAW_DOC, id: 6, file_size: null }]),
    );
    const docs = await fetchEmployeeDocuments("42");
    expect(apiMock.get).toHaveBeenCalledWith(
      apiRoutes.payroll.employeeDocuments("42"),
    );
    expect(docs[0]).toEqual({
      id: "5",
      fileName: "TFN declaration.pdf",
      fileSize: 184320,
      contentType: "application/pdf",
      fileUrl: "https://cdn.example.com/abc.pdf",
    });
    expect(docs[1].fileSize).toBeNull();
  });

  it("uploads under a repeated `files` field with a two-minute timeout", async () => {
    apiMock.post.mockResolvedValueOnce(ok([RAW_DOC]));
    const files = [
      new File(["a"], "a.pdf", { type: "application/pdf" }),
      new File(["b"], "b.png", { type: "image/png" }),
    ];

    const docs = await uploadEmployeeDocumentsApi("42", files);

    const [url, body, config] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.payroll.employeeDocuments("42"));
    expect((body as FormData).getAll("files")).toHaveLength(2);
    expect((body as FormData).getAll("files[]")).toHaveLength(0);
    expect(config).toEqual({ timeout: EMPLOYEE_UPLOAD_TIMEOUT_MS });
    expect(docs).toHaveLength(1);
  });

  it("deletes one document and returns the server's message", async () => {
    apiMock.delete.mockResolvedValueOnce({
      data: {
        success: true,
        message:
          "Document record removed, but the S3 file could not be deleted.",
        data: { deleted: true },
      },
    });
    expect(await deleteEmployeeDocumentApi("42", "5")).toMatch(
      /could not be deleted/,
    );
    expect(apiMock.delete).toHaveBeenCalledWith(
      apiRoutes.payroll.employeeDocument("42", "5"),
    );
  });
});

describe("employeeErrorMessage", () => {
  it("names the failing field on a validation error", () => {
    expect(
      employeeErrorMessage(
        apiError(400, {
          message: "Employee validation failed.",
          error: {
            statusCode: 400,
            explanation: ['"email" must be a valid email'],
          },
        }),
        "Failed",
      ),
    ).toBe('"email" must be a valid email');
  });

  it("prefers the message elsewhere, and the fallback with no response", () => {
    expect(
      employeeErrorMessage(
        apiError(503, {
          message:
            "Employee was saved locally but could not be queued for Microkeeper sync.",
          error: { explanation: ["ECONNREFUSED 127.0.0.1:6379"] },
        }),
        "Failed",
      ),
    ).toBe(
      "Employee was saved locally but could not be queued for Microkeeper sync.",
    );
    expect(
      employeeErrorMessage(
        Object.assign(new Error("Network Error"), { isAxiosError: true }),
        "Failed to create employee.",
      ),
    ).toBe("Failed to create employee.");
    expect(
      employeeErrorMessage(new Error("Employee not found."), "Failed"),
    ).toBe("Employee not found.");
  });
});
