/**
 * Payroll employees — the list, the create form, the full profile, and the
 * payload builders that turn each form into the snake_case body `sole-ocr`
 * forwards to Microkeeper.
 *
 * Types here are camelCase. The real API is snake_case; phase 2 adds the
 * response mappers, and the request side is already done by the two
 * `build*Payload` functions below, which are the only place snake_case keys
 * are written.
 */

import axios from "axios";
import { z } from "zod";

import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import {
  PAYROLL_EMPTY,
  payrollEnabled,
  seatLimitReached,
  titleCase,
  type PayrollSeats,
  PAYROLL_NOT_ACTIVE_CODE,
  PAYROLL_OVERDUE_CODE,
  SEAT_LIMIT_CODE,
  payrollErrorCode,
} from "@/lib/payroll";
import api from "@/utils/axiosInstance";

/* ------------------------------------------------------------------ *
 * Option lists
 * ------------------------------------------------------------------ */

export type Option<T extends string = string> = { value: T; label: string };

export type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CASUAL"
  | "SUB_CONTRACTOR"
  | "SUB_CONTRACTOR_WITH_SUPER";

export const EMPLOYMENT_TYPE_OPTIONS: Option<EmploymentType>[] = [
  { value: "FULL_TIME", label: "Full time" },
  { value: "PART_TIME", label: "Part time" },
  { value: "CASUAL", label: "Casual" },
  { value: "SUB_CONTRACTOR", label: "Sub-contractor" },
  { value: "SUB_CONTRACTOR_WITH_SUPER", label: "Sub-contractor with super" },
];

/** Where the employee is in the Microkeeper sync — not whether they're employed. */
export type EmployeeSyncStatus = "PENDING" | "SYNCED" | "FAILED";

export const SYNC_STATUS_OPTIONS: Option<EmployeeSyncStatus>[] = [
  { value: "SYNCED", label: "Synced" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed" },
];

export const TAX_SCALE_OPTIONS: Option[] = [
  { value: "AUSTRALIAN_RESIDENT", label: "Australian resident" },
  { value: "FOREIGN_RESIDENT", label: "Foreign resident" },
  { value: "WORKING_HOLIDAY_MAKERS", label: "Working holiday maker" },
  {
    value: "FULL_MEDICARE_LEVY_EXEMPTION",
    label: "Full Medicare levy exemption",
  },
  {
    value: "HALF_MEDICARE_LEVY_EXEMPTION",
    label: "Half Medicare levy exemption",
  },
  { value: "SUB_CONTRACTOR", label: "Sub-contractor" },
];

export const STP_INCOME_STREAM_OPTIONS: Option[] = [
  { value: "SAW", label: "Salary or wages (SAW)" },
  { value: "CHP", label: "Closely held payees (CHP)" },
  { value: "LAB", label: "Labour hire (LAB)" },
  { value: "VOL", label: "Voluntary agreement (VOL)" },
  { value: "IAA", label: "Non-employee (IAA)" },
  { value: "WHM", label: "Working holiday maker (WHM)" },
];

export const SUPER_HOURS_OPTIONS: Option[] = [
  { value: "ON_ORDINARY_HOURS", label: "On ordinary hours" },
  { value: "ON_TOTAL_HOURS", label: "On total hours" },
];

export const SUPER_OVERRIDE_OPTIONS: Option[] = [
  { value: "FIXED", label: "Fixed" },
  { value: "MIN", label: "Minimum" },
  { value: "MAX", label: "Maximum" },
  { value: "PERCENTAGE", label: "Percentage" },
];

export const GENDER_OPTIONS: Option[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "INDETERMINATE", label: "Indeterminate" },
  { value: "OTHER", label: "Other" },
];

export const SALARY_TYPE_OPTIONS: Option[] = [
  { value: "TIMESHEET", label: "Timesheet" },
  { value: "SALARY", label: "Salary" },
  { value: "AUTO_OVERTIME", label: "Automatic overtime" },
];

export const EMPLOYEE_STATUS_OPTIONS: Option[] = [
  { value: "CURRENTLY_EMPLOYED", label: "Currently employed" },
  { value: "TERMINATED", label: "Terminated" },
];

export const CLOCKING_METHOD_OPTIONS: Option[] = [
  { value: "DISABLED", label: "Disabled" },
  { value: "NFC_FINGERPRINT_FACIAL", label: "NFC / fingerprint / facial" },
  { value: "PC_RESTRICTED", label: "Restricted PC" },
  { value: "GPS_LOCATION_RESTRICTED", label: "Restricted GPS location" },
  { value: "GPS_ANY_LOCATION", label: "Any GPS location" },
  { value: "ANY_INTERNET_DEVICE", label: "Any internet device" },
  { value: "SELF_MANAGED", label: "Self managed" },
];

export const CESSATION_TYPE_OPTIONS: Option[] = [
  { value: "EMPLOYED", label: "Employed" },
  { value: "RESIGNATION", label: "Resignation" },
  { value: "REDUNDANCY", label: "Redundancy" },
  { value: "DISMISSAL", label: "Dismissal" },
  { value: "CONTRACT_CESSATION", label: "Contract cessation" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "OTHER", label: "Other" },
];

export const LOCATION_ACCESS_OPTIONS: Option[] = [
  { value: "ALL", label: "All" },
  { value: "STAFF", label: "Staff" },
  { value: "CLIENTS", label: "Clients" },
];

/** Roster and timesheet access share one scale. */
export const ROSTER_ACCESS_OPTIONS: Option[] = [
  { value: "FULL_ACCESS", label: "Full access" },
  { value: "READ_ONLY", label: "Read only" },
  { value: "NO_ACCESS", label: "No access" },
];

/** Payroll's own scale has a middle step instead of read-only. */
export const PAYROLL_ACCESS_OPTIONS: Option[] = [
  { value: "FULL_ACCESS", label: "Full access" },
  { value: "MEDIUM_ACCESS", label: "Medium access" },
  { value: "NO_ACCESS", label: "No access" },
];

/** Microkeeper's employee-management levels, as the API validates them. */
export const EMPLOYEE_ACCESS_OPTIONS: Option[] = [
  { value: "ADD_EDIT", label: "Add and edit" },
  { value: "EDIT", label: "Edit only" },
  { value: "ADD", label: "Add only" },
  { value: "NO_ACCESS", label: "No access" },
];

export const HR_ACCESS_OPTIONS: Option[] = [
  { value: "CONFIG", label: "Configure" },
  { value: "FULL", label: "Full access" },
  { value: "REVIEW", label: "Review only" },
  { value: "NO_ACCESS", label: "No access" },
];

/** Monday first, as a roster reads — but `dayOfWeek` keeps Microkeeper's 0 = Sunday. */
export const CONTRACTED_DAYS: { dayOfWeek: number; label: string }[] = [
  { dayOfWeek: 1, label: "Monday" },
  { dayOfWeek: 2, label: "Tuesday" },
  { dayOfWeek: 3, label: "Wednesday" },
  { dayOfWeek: 4, label: "Thursday" },
  { dayOfWeek: 5, label: "Friday" },
  { dayOfWeek: 6, label: "Saturday" },
  { dayOfWeek: 0, label: "Sunday" },
];

export function optionLabel(
  options: readonly Option[],
  value: string | null | undefined,
): string {
  if (!value) return PAYROLL_EMPTY;
  return (
    options.find((option) => option.value === value)?.label ?? titleCase(value)
  );
}

export function employmentTypeLabel(value: string | null | undefined): string {
  return optionLabel(EMPLOYMENT_TYPE_OPTIONS, value);
}

export function syncStatusLabel(value: string): string {
  return optionLabel(SYNC_STATUS_OPTIONS, value);
}

export function syncStatusVariant(
  status: string,
): "success" | "warning" | "danger" | "secondary" {
  switch (status) {
    case "SYNCED":
      return "success";
    case "PENDING":
      return "warning";
    case "FAILED":
      return "danger";
    default:
      return "secondary";
  }
}

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

/** One row of `GET /employees`. */
export type PayrollEmployee = {
  id: string;
  givenName: string;
  surname: string;
  /** The username typed in Sole. */
  username: string;
  /** The username Microkeeper assigned — only once the employee has synced. */
  eusername: string | null;
  email: string;
  mobileCountryCode: string;
  mobileNumber: string;
  employmentType: EmploymentType | null;
  payrollId: string;
  status: EmployeeSyncStatus;
  profilePhotoUrl: string | null;
};

/** `GET /employees/stats`. */
export type EmployeeStats = {
  totalEmployees: number;
  activeEmployees: number;
  profileIncomplete: number;
  failedSync: number;
};

export const EMPTY_EMPLOYEE_STATS: EmployeeStats = {
  totalEmployees: 0,
  activeEmployees: 0,
  profileIncomplete: 0,
  failedSync: 0,
};

export type EmploymentTypeFilter = EmploymentType | "all";
export type SyncStatusFilter = EmployeeSyncStatus | "all";

/** What `GET /employees` takes — `all` is sent as no filter at all. */
export type EmployeeListParams = {
  page: number;
  limit: number;
  search: string;
  employmentType: EmploymentTypeFilter;
  status: SyncStatusFilter;
};

export type EmployeePage = {
  employees: PayrollEmployee[];
  total: number;
  totalPages: number;
};

/** The query string the list call sends, with the empty filters left off. */
export function employeeListQuery(
  params: EmployeeListParams,
): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: params.page,
    limit: params.limit,
  };
  const search = params.search.trim();
  if (search) query.search = search;
  if (params.employmentType !== "all")
    query.employment_type = params.employmentType;
  if (params.status !== "all") query.status = params.status;
  return query;
}

export function employeeName(employee: {
  givenName: string;
  surname: string;
}): string {
  return [employee.givenName, employee.surname]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** Microkeeper's username once there is one, else the one typed in Sole. */
export function employeeHandle(employee: {
  username: string;
  eusername: string | null;
}): string {
  return employee.username || employee.eusername || "";
}

export function employeePhone(employee: {
  mobileCountryCode: string;
  mobileNumber: string;
}): string {
  if (!employee.mobileNumber) return PAYROLL_EMPTY;
  return `${employee.mobileCountryCode} ${employee.mobileNumber}`.trim();
}

/** What a stat card does to the filters when it's clicked. */
export function filtersForStatCard(
  key: "all" | "active" | "incomplete" | "failed",
): {
  employmentType: EmploymentTypeFilter;
  status: SyncStatusFilter;
} {
  return {
    employmentType: "all",
    status: key === "failed" ? "FAILED" : "all",
  };
}

/* ------------------------------------------------------------------ *
 * Adding employees — the client-side gate
 * ------------------------------------------------------------------ */

export type NewEmployeeBlock = "not-enabled" | "seat-limit" | null;

/**
 * Why a new employee can't be added right now, if they can't.
 *
 * Applies to every path that adds people — the header button, the empty-state
 * button and bulk upload — which sole-webapp missed for the empty state.
 */
export function newEmployeeBlock(
  seats: PayrollSeats | null | undefined,
): NewEmployeeBlock {
  if (!payrollEnabled(seats)) return "not-enabled";
  if (seatLimitReached(seats)) return "seat-limit";
  return null;
}

/* ------------------------------------------------------------------ *
 * Shared field rules
 * ------------------------------------------------------------------ */

export const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/** "" when blank, so the payload drops it; otherwise the number typed. */
function numberOrBlank(value: string): number | "" {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : "";
}

/**
 * An optional number field held as text: blank is fine, anything typed has to
 * be a number inside the range the input's own min/max allow.
 */
function rangeField(label: string, min: number, max?: number) {
  return z.string().superRefine((value, ctx) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: "custom", message: `${label} must be a number.` });
      return;
    }
    if (parsed < min || (max !== undefined && parsed > max)) {
      ctx.addIssue({
        code: "custom",
        message:
          max === undefined
            ? `${label} can't be less than ${min}.`
            : `${label} must be between ${min} and ${max}.`,
      });
    }
  });
}

/* ------------------------------------------------------------------ *
 * Create
 * ------------------------------------------------------------------ */

/** The "Clone settings from" value that means "don't clone". */
export const CLONE_MANUAL = "manual";

export const createEmployeeSchema = z
  .object({
    givenName: z.string(),
    surname: z.string(),
    username: z.string(),
    payrollId: z.string(),
    email: z.string(),
    mobileCountryCode: z.string(),
    mobileNumber: z.string(),
    clonedFromUsername: z.string(),
    employmentType: z.string(),
    weeklyOrdinaryHours: rangeField("Weekly ordinary hours", 0, 168),
    sendCredentialsEmail: z.boolean(),
    sendCredentialsSms: z.boolean(),

    tfn: z.string(),
    taxScale: z.string(),
    stpIncomeStreamType: z.string(),
    taxFreeThresholdClaimed: z.boolean(),
    helpHecs: z.boolean(),
    tradeSupportLoan: z.boolean(),
    studentFinancialSupplement: z.boolean(),
    seniorsAndPensionersTaxOffset: z.boolean(),
    taxOffsetAmount: rangeField("Tax offset amount", 0),
    taxRateFixPercent: rangeField("Tax rate fix", 0, 100),

    superOrdinaryHours: z.string(),
    additionalSuperRate: rangeField("Additional super rate", 0, 100),
    superOverrideType: z.string(),
    superOverrideAmount: rangeField("Override amount", 0),
    employerSuperFund: z.string(),
    employerMemberNumber: z.string(),

    account1Name: z.string(),
    account1Bsb: z.string(),
    account1Number: z.string(),
    account1Description: z.string(),
  })
  // sole-webapp's own rules and messages, in its order.
  .superRefine((values, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    if (!values.givenName.trim()) issue("givenName", "Given name is required.");
    if (!values.surname.trim()) issue("surname", "Surname is required.");
    if (!values.username.trim()) issue("username", "Username is required.");

    if (!values.email.trim()) issue("email", "Email is required.");
    else if (!EMAIL_PATTERN.test(values.email.trim()))
      issue("email", "Enter a valid email address.");

    const mobile = digits(values.mobileNumber);
    if (!mobile) issue("mobileNumber", "Mobile number is required.");
    else if (mobile.length < 6 || mobile.length > 15)
      issue("mobileNumber", "Use 6 to 15 digits.");

    const cloning = values.clonedFromUsername !== CLONE_MANUAL;
    if (!cloning && !values.employmentType)
      issue("employmentType", "Employment type is required.");

    // What `GET /employees/{id}/completeness` checks before a pay run — asked
    // for here, so a new employee isn't flagged on the pay list later.
    const tfn = digits(values.tfn);
    if (!tfn) issue("tfn", "Tax file number is required.");
    else if (tfn.length < 8 || tfn.length > 9) issue("tfn", "A TFN is 8 or 9 digits.");
    if (!values.taxScale) issue("taxScale", "Tax scale is required.");
    if (!values.stpIncomeStreamType)
      issue("stpIncomeStreamType", "STP income stream is required.");

    if (!values.superOrdinaryHours)
      issue("superOrdinaryHours", "Ordinary hours calculation is required.");
    if (!values.employerSuperFund.trim())
      issue("employerSuperFund", "Super fund USI is required.");
    if (!values.employerMemberNumber.trim())
      issue("employerMemberNumber", "Member number is required.");

    if (!values.account1Name.trim()) issue("account1Name", "Account name is required.");
    const bsb = digits(values.account1Bsb);
    if (!bsb) issue("account1Bsb", "BSB is required.");
    else if (bsb.length !== 6) issue("account1Bsb", "A BSB is 6 digits.");
    const account = digits(values.account1Number);
    if (!account) issue("account1Number", "Account number is required.");
    else if (account.length < 5 || account.length > 10)
      issue("account1Number", "Use 5 to 10 digits.");
  });

export type CreateEmployeeValues = z.infer<typeof createEmployeeSchema>;

export const CREATE_EMPLOYEE_DEFAULTS: CreateEmployeeValues = {
  givenName: "",
  surname: "",
  username: "",
  payrollId: "",
  email: "",
  mobileCountryCode: "+61",
  mobileNumber: "",
  clonedFromUsername: CLONE_MANUAL,
  employmentType: "",
  weeklyOrdinaryHours: "",
  sendCredentialsEmail: false,
  sendCredentialsSms: false,

  tfn: "",
  taxScale: "AUSTRALIAN_RESIDENT",
  stpIncomeStreamType: "SAW",
  taxFreeThresholdClaimed: true,
  helpHecs: false,
  tradeSupportLoan: false,
  studentFinancialSupplement: false,
  seniorsAndPensionersTaxOffset: false,
  taxOffsetAmount: "0",
  taxRateFixPercent: "0",

  superOrdinaryHours: "ON_ORDINARY_HOURS",
  additionalSuperRate: "",
  superOverrideType: "FIXED",
  superOverrideAmount: "",
  employerSuperFund: "",
  employerMemberNumber: "",

  account1Name: "",
  account1Bsb: "",
  account1Number: "",
  account1Description: "",
};

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** One level of `compact()` — drops "" and undefined, as sole-webapp's create did. */
function compact(
  value: Record<string, Json | undefined>,
): Record<string, Json> {
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, Json] =>
        entry[1] !== "" && entry[1] !== undefined,
    ),
  );
}

/**
 * `POST /employees`.
 *
 * Cloning copies Microkeeper's settings from another employee, so the
 * employment type is left off entirely rather than sent to fight the clone.
 * The two tax figures always go, as numbers — blank is 0, the same as the
 * input's default.
 */
export function buildCreateEmployeePayload(
  values: CreateEmployeeValues,
): Record<string, Json> {
  const cloning = values.clonedFromUsername !== CLONE_MANUAL;
  const employmentType = cloning ? undefined : values.employmentType;

  return compact({
    given_name: values.givenName.trim(),
    surname: values.surname.trim(),
    username: values.username.trim(),
    email: values.email.trim().toLowerCase(),
    mobile_country_code: values.mobileCountryCode.trim(),
    mobile_number: digits(values.mobileNumber),
    employment_type: employmentType,
    payroll_id: values.payrollId.trim(),
    send_credentials_email: values.sendCredentialsEmail,
    send_credentials_sms: values.sendCredentialsSms,
    cloned_from_username: cloning ? values.clonedFromUsername : undefined,
    employment: compact({
      employment_type: employmentType,
      weekly_ordinary_hours: numberOrBlank(values.weeklyOrdinaryHours),
    }),
    tax: compact({
      tfn: values.tfn.trim(),
      tax_scale: values.taxScale,
      stp_income_stream_type: values.stpIncomeStreamType,
      tax_free_threshold_claimed: values.taxFreeThresholdClaimed,
      help_hecs: values.helpHecs,
      trade_support_loan: values.tradeSupportLoan,
      student_financial_supplement: values.studentFinancialSupplement,
      seniors_and_pensioners_tax_offset: values.seniorsAndPensionersTaxOffset,
      tax_offset_amount: Number(values.taxOffsetAmount.trim() || 0),
      tax_rate_fix_percent: Number(values.taxRateFixPercent.trim() || 0),
    }),
    super: compact({
      super_ordinary_hours: values.superOrdinaryHours,
      additional_super_rate: numberOrBlank(values.additionalSuperRate),
      super_override_type: values.superOverrideType,
      super_override_amount: numberOrBlank(values.superOverrideAmount),
      employer_super_fund: values.employerSuperFund.trim(),
      employer_member_number: values.employerMemberNumber.trim(),
    }),
    banking: compact({
      account1_name: values.account1Name.trim(),
      account1_bsb: digits(values.account1Bsb),
      account1_number: values.account1Number.replace(/\s/g, ""),
      account1_description: values.account1Description.trim(),
    }),
  });
}

/* ------------------------------------------------------------------ *
 * The full profile
 * ------------------------------------------------------------------ */

/**
 * `GET /employees/{id}`, held the way the profile form edits it.
 *
 * Number fields are text here, as they are in any input, and are turned back
 * into numbers by `buildUpdateEmployeePayload`. Some fields have no input
 * (sole-webapp defined them and never showed them) — they're carried through
 * unchanged so a save never blanks what Microkeeper already holds.
 */
export type ContractedHoursRow = {
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  hours: string;
};

export type OpeningBalance = {
  financialYear: string;
  preGrossEarnings: string;
  preSuperannuation: string;
  preTax: string;
  preNet: string;
  annualLeaveHours: string;
  personalLeaveHours: string;
  longServiceLeaveHours: string;
  rdoHours: string;
  /** No inputs — carried through so a save doesn't zero them. */
  toilHours: string;
  offHours: string;
  compassionateHours: string;
};

export type EmployeeProfile = {
  givenName: string;
  surname: string;
  username: string;
  email: string;
  mobileCountryCode: string;
  mobileNumber: string;
  payrollId: string;
  profilePhotoUrl: string;
  personalDetails: {
    position: string;
    employeeIdNo: string;
    primaryManagerConfig: string;
    dob: string;
    gender: string;
    altPhone: string;
    homePhone: string;
    nokName: string;
    nokNumber: string;
    abn: string;
    businessName: string;
  };
  address: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    timezone: string;
  };
  employment: {
    employmentType: string;
    salaryType: string;
    defaultHourlyRate: string;
    saturdayRate: string;
    sundayRate: string;
    weeklyOrdinaryHours: string;
    annualSalary: string;
    autoOvertimeMultiplier: string;
    startDate: string;
    terminationDate: string;
    cessationType: string;
    employeeStatus: string;
    primaryManagerUsername: string;
    contractedHoursRoster: string;
    annualLeaveLoadingPct: string;
    superOnLeaveLoading: boolean;
    entitledAnnualLeaveWeeks: string;
    entitledPersonalLeaveWeeks: string;
    longServiceLeaveOutOf: string;
    proRataType: string;
    showPersonalLeaveOnPayslip: boolean;
    showAnnualLeaveOnPayslip: boolean;
    showLongServiceLeaveOnPayslip: boolean;
    showRdoOnPayslip: boolean;
    printedPayslip: boolean;
    showRosterEndTime: boolean;
    hideTimesheet: boolean;
    clockingMethod: string;
    contractedHours: ContractedHoursRow[];
  };
  tax: {
    tfn: string;
    taxScale: string;
    stpIncomeStreamType: string;
    overrideTaxScale: string;
    medicareLevySurcharge: string;
    medicareLevyReductions: string;
    overseasCountry: string;
    taxFreeThresholdClaimed: boolean;
    helpHecs: boolean;
    tradeSupportLoan: boolean;
    studentFinancialSupplement: boolean;
    seniorsAndPensionersTaxOffset: boolean;
    tfndStatus: string;
    taxOffsetAmount: string;
    taxRateFixPercent: string;
  };
  super: {
    superOrdinaryHours: string;
    additionalSuperRate: string;
    superOverrideType: string;
    superOverrideAmount: string;
    superMinimum: string;
    employerSuperFund: string;
    employerMemberNumber: string;
    additionalSuperFund: string;
    additionalMemberNumber: string;
  };
  banking: {
    account1Name: string;
    account1Bsb: string;
    account1Number: string;
    account1Description: string;
  };
  openingBalances: OpeningBalance[];
  accessControl: {
    locationAccess: string;
    rosterAccess: string;
    displayCosts: boolean;
    timesheetAccess: string;
    leaveRequests: boolean;
    employeeAccess: string;
    nfcTagsFingerprints: boolean;
    hrAccess: string;
    payrollAccess: string;
    jobsAndClients: boolean;
    invoicing: boolean;
    activityFeed: boolean;
    groupConfig: boolean;
    reports: boolean;
    settings: boolean;
    filesAccess: boolean;
  };
};

/** The profile drawer's record: the editable profile plus who it is. */
export type EmployeeDetail = {
  id: string;
  eusername: string | null;
  status: EmployeeSyncStatus;
  profile: EmployeeProfile;
};

export function emptyContractedHours(): ContractedHoursRow[] {
  return CONTRACTED_DAYS.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    startTime: "",
    endTime: "",
    hours: "",
  }));
}

export const EMPTY_OPENING_BALANCE: OpeningBalance = {
  financialYear: "",
  preGrossEarnings: "",
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
};

/** sole-webapp's `initialForm`, defaults and all. */
export function emptyEmployeeProfile(): EmployeeProfile {
  return {
    givenName: "",
    surname: "",
    username: "",
    email: "",
    mobileCountryCode: "+61",
    mobileNumber: "",
    payrollId: "",
    profilePhotoUrl: "",
    personalDetails: {
      position: "",
      employeeIdNo: "",
      primaryManagerConfig: "",
      dob: "",
      gender: "",
      altPhone: "",
      homePhone: "",
      nokName: "",
      nokNumber: "",
      abn: "",
      businessName: "",
    },
    address: {
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postcode: "",
      country: "Australia",
      timezone: "Victoria",
    },
    employment: {
      employmentType: "FULL_TIME",
      salaryType: "TIMESHEET",
      defaultHourlyRate: "",
      saturdayRate: "",
      sundayRate: "",
      weeklyOrdinaryHours: "",
      annualSalary: "",
      autoOvertimeMultiplier: "",
      startDate: "",
      terminationDate: "",
      cessationType: "EMPLOYED",
      employeeStatus: "CURRENTLY_EMPLOYED",
      primaryManagerUsername: "",
      contractedHoursRoster: "Default Roster",
      annualLeaveLoadingPct: "",
      superOnLeaveLoading: false,
      entitledAnnualLeaveWeeks: "",
      entitledPersonalLeaveWeeks: "",
      longServiceLeaveOutOf: "",
      proRataType: "PRO_RATA_LEAVE_ACCRUAL",
      showPersonalLeaveOnPayslip: true,
      showAnnualLeaveOnPayslip: true,
      showLongServiceLeaveOnPayslip: true,
      showRdoOnPayslip: true,
      printedPayslip: false,
      showRosterEndTime: true,
      hideTimesheet: false,
      clockingMethod: "NFC_FINGERPRINT_FACIAL",
      contractedHours: emptyContractedHours(),
    },
    tax: {
      tfn: "",
      taxScale: "AUSTRALIAN_RESIDENT",
      stpIncomeStreamType: "SAW",
      overrideTaxScale: "",
      medicareLevySurcharge: "",
      medicareLevyReductions: "",
      overseasCountry: "",
      taxFreeThresholdClaimed: true,
      helpHecs: false,
      tradeSupportLoan: false,
      studentFinancialSupplement: false,
      seniorsAndPensionersTaxOffset: false,
      tfndStatus: "",
      taxOffsetAmount: "",
      taxRateFixPercent: "",
    },
    super: {
      superOrdinaryHours: "ON_ORDINARY_HOURS",
      additionalSuperRate: "",
      superOverrideType: "FIXED",
      superOverrideAmount: "",
      superMinimum: "",
      employerSuperFund: "",
      employerMemberNumber: "",
      additionalSuperFund: "",
      additionalMemberNumber: "",
    },
    banking: {
      account1Name: "",
      account1Bsb: "",
      account1Number: "",
      account1Description: "",
    },
    openingBalances: [],
    accessControl: {
      locationAccess: "STAFF",
      rosterAccess: "NO_ACCESS",
      displayCosts: false,
      timesheetAccess: "NO_ACCESS",
      leaveRequests: false,
      employeeAccess: "NO_ACCESS",
      nfcTagsFingerprints: false,
      hrAccess: "NO_ACCESS",
      payrollAccess: "NO_ACCESS",
      jobsAndClients: false,
      invoicing: false,
      activityFeed: false,
      groupConfig: false,
      reports: false,
      settings: false,
      filesAccess: false,
    },
  };
}

/** The profile's sections, in the order the drawer shows and the nav lists them. */
export const PROFILE_SECTIONS = [
  { id: "files", label: "Personal files" },
  { id: "personal", label: "Personal details" },
  { id: "address", label: "Address" },
  { id: "employment", label: "Payment & employment" },
  { id: "hours", label: "Contracted hours" },
  { id: "entitlements", label: "Entitlements" },
  { id: "tax", label: "Employee tax" },
  { id: "super", label: "Super fund details" },
  { id: "opening", label: "Opening balances" },
  { id: "payslip", label: "Payslip config" },
  { id: "status", label: "Status & clocking" },
  { id: "access", label: "Access control" },
  { id: "banking", label: "Banking" },
] as const;

export type ProfileSectionId = (typeof PROFILE_SECTIONS)[number]["id"];

export type ProfileErrors = Partial<
  Record<"givenName" | "surname" | "email", string>
>;

/** The three fields a profile can't be saved without. */
export function validateProfile(profile: EmployeeProfile): ProfileErrors {
  const errors: ProfileErrors = {};
  if (!profile.givenName.trim()) errors.givenName = "Given name is required.";
  if (!profile.surname.trim()) errors.surname = "Surname is required.";
  if (!profile.email.trim()) errors.email = "Email is required.";
  else if (!EMAIL_PATTERN.test(profile.email.trim()))
    errors.email = "Enter a valid email address.";
  return errors;
}

/**
 * Drops empty strings and undefined at every depth — sole-webapp's
 * `cleanPayload`. An empty string means "not filled in", and sending it would
 * blank whatever Microkeeper already has.
 */
export function cleanPayload<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cleanPayload) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== "" && child !== undefined)
      .map(([key, child]) => [key, cleanPayload(child)]),
  ) as T;
}

/** addressLine1 → address_line1, account1Bsb → account1_bsb. */
export function snakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Every field the profile holds as text that the API wants as a number. */
const NUMERIC_PROFILE_FIELDS = new Set([
  "defaultHourlyRate",
  "saturdayRate",
  "sundayRate",
  "weeklyOrdinaryHours",
  "annualSalary",
  "autoOvertimeMultiplier",
  "annualLeaveLoadingPct",
  "entitledAnnualLeaveWeeks",
  "entitledPersonalLeaveWeeks",
  "longServiceLeaveOutOf",
  "hours",
  "taxOffsetAmount",
  "taxRateFixPercent",
  "additionalSuperRate",
  "superOverrideAmount",
  "superMinimum",
  "preGrossEarnings",
  "preSuperannuation",
  "preTax",
  "preNet",
  "annualLeaveHours",
  "personalLeaveHours",
  "longServiceLeaveHours",
  "rdoHours",
  "toilHours",
  "offHours",
  "compassionateHours",
]);

/** A camelCase group as the snake_case object the API reads, numbers as numbers. */
function toApiGroup(group: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(group).map(([key, value]) => {
      if (Array.isArray(value)) {
        return [snakeKey(key), value.map((row: object) => toApiGroup(row))];
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        return [
          snakeKey(key),
          NUMERIC_PROFILE_FIELDS.has(key) ? numberOrBlank(trimmed) : trimmed,
        ];
      }
      return [snakeKey(key), value];
    }),
  );
}

/**
 * `PUT /employees/{id}`.
 *
 * Opening balances go only where a financial year was entered — a row without
 * one has nothing to attach to. Everything else is sent whole and then
 * cleaned, so a field left blank is left alone rather than cleared.
 */
export function buildUpdateEmployeePayload(
  profile: EmployeeProfile,
): Record<string, unknown> {
  return cleanPayload({
    given_name: profile.givenName.trim(),
    surname: profile.surname.trim(),
    username: profile.username.trim(),
    email: profile.email.trim().toLowerCase(),
    mobile_country_code: profile.mobileCountryCode.trim(),
    mobile_number: digits(profile.mobileNumber),
    payroll_id: profile.payrollId.trim(),
    profile_photo_url: profile.profilePhotoUrl,
    // The list reads the employee row's own type, which the profile's
    // employment block doesn't update — sent at both levels so the table
    // and the profile can't disagree after a change.
    employment_type: profile.employment.employmentType,
    personal_details: toApiGroup(profile.personalDetails),
    address: toApiGroup(profile.address),
    employment: toApiGroup(profile.employment),
    tax: toApiGroup(profile.tax),
    super: toApiGroup(profile.super),
    banking: toApiGroup({
      ...profile.banking,
      account1Bsb: digits(profile.banking.account1Bsb),
      account1Number: profile.banking.account1Number.replace(/\s/g, ""),
    }),
    opening_balances: profile.openingBalances
      .filter((row) => row.financialYear.trim())
      .map((row) => toApiGroup(row)),
    access_control: toApiGroup(profile.accessControl),
  });
}

/* ------------------------------------------------------------------ *
 * Personal files
 * ------------------------------------------------------------------ */

/** `GET /employees/{id}/documents`. */
export type EmployeeDocument = {
  id: string;
  fileName: string;
  /** Bytes; null when the backend didn't record it. */
  fileSize: number | null;
  contentType: string;
  fileUrl: string;
};

export const EMPLOYEE_FILE_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt";
export const EMPLOYEE_FILE_MAX_COUNT = 10;
export const EMPLOYEE_FILE_MAX_BYTES = 20 * 1024 * 1024;

/** Why a batch can't be uploaded, or null when it can — the same two limits the API enforces. */
export function employeeFilesError(
  files: readonly { size: number }[],
): string | null {
  if (files.length > EMPLOYEE_FILE_MAX_COUNT) {
    return `You can upload up to ${EMPLOYEE_FILE_MAX_COUNT} files at once.`;
  }
  if (files.some((file) => file.size > EMPLOYEE_FILE_MAX_BYTES)) {
    return "Each employee file must be 20 MB or smaller.";
  }
  return null;
}

export function isImageDocument(document: EmployeeDocument): boolean {
  return (
    document.contentType.startsWith("image/") ||
    /\.(png|jpe?g|webp)$/i.test(document.fileName)
  );
}

/* ------------------------------------------------------------------ *
 * Bulk upload
 * ------------------------------------------------------------------ */

/** `POST /employees/bulk/upload`. */
export type BulkUploadResult = {
  validCount: number;
  failedCount: number;
  errors: { row: number; error: string }[];
};

export const BULK_TEMPLATE_FILENAME = "employee_bulk_template.csv";

/**
 * One row per day, in roster order, whatever the API sent — sole-webapp's
 * `hydrate` did the same, so a day Microkeeper has no hours for still gets a
 * blank row to fill in.
 */
export function mergeContractedHours(
  rows: readonly (Omit<Partial<ContractedHoursRow>, "dayOfWeek"> & {
    dayOfWeek: number | string;
  })[],
): ContractedHoursRow[] {
  return emptyContractedHours().map((blank) => ({
    ...blank,
    ...rows.find((row) => Number(row.dayOfWeek) === blank.dayOfWeek),
    dayOfWeek: blank.dayOfWeek,
  }));
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
  pagination?: Partial<{
    total: number | string;
    page: number | string;
    limit: number | string;
    total_pages: number | string;
  }>;
};

function unwrap<T>(response: { data?: ApiEnvelope<T> }, fallback: string): T {
  if (!response.data?.success || response.data.data === undefined) {
    throw new Error(response.data?.message || fallback);
  }
  return response.data.data;
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const str = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

type Raw = Record<string, unknown>;

const asRecord = (value: unknown): Raw =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Raw)
    : {};

const EMPLOYMENT_TYPES = EMPLOYMENT_TYPE_OPTIONS.map((option) => option.value);
const SYNC_STATUSES = SYNC_STATUS_OPTIONS.map((option) => option.value);

/** One row of `GET /employees`, as the backend sends it. */
export function mapEmployee(raw: unknown): PayrollEmployee {
  const row = asRecord(raw);
  const type = str(row.employment_type) as EmploymentType;
  const status = str(row.status) as EmployeeSyncStatus;
  return {
    id: str(row.id),
    givenName: str(row.given_name),
    surname: str(row.surname),
    username: str(row.username),
    eusername: strOrNull(row.eusername),
    email: str(row.email),
    mobileCountryCode: str(row.mobile_country_code),
    mobileNumber: str(row.mobile_number),
    employmentType: EMPLOYMENT_TYPES.includes(type) ? type : null,
    payrollId: str(row.payroll_id),
    // A row that hasn't been through the queue yet has no status of its own.
    status: SYNC_STATUSES.includes(status) ? status : "PENDING",
    profilePhotoUrl: strOrNull(row.profile_photo_url),
  };
}

export function mapEmployeeStats(raw: unknown): EmployeeStats {
  const stats = asRecord(raw);
  return {
    totalEmployees: num(stats.total_employees),
    activeEmployees: num(stats.active_employees),
    profileIncomplete: num(stats.profile_incomplete),
    failedSync: num(stats.failed_sync),
  };
}

/** Dates arrive as DATEONLY, but an ISO timestamp is trimmed to its day. */
const DATE_FIELDS = new Set(["dob", "startDate", "terminationDate"]);

/**
 * One profile block, filled from the API's snake_case object over the form's
 * defaults: a null or missing value keeps the default, numbers and decimals
 * ("42.50") become the text an input holds, booleans stay booleans.
 */
function hydrateGroup<T extends object>(defaults: T, raw: unknown): T {
  const source = asRecord(raw);
  const next = { ...defaults } as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(defaults)) {
    if (Array.isArray(fallback)) continue;
    const value = source[snakeKey(key)];
    if (value === null || value === undefined) continue;
    if (typeof fallback === "boolean") {
      next[key] =
        value === true || value === 1 || value === "1" || value === "true";
    } else {
      const text = String(value);
      next[key] = DATE_FIELDS.has(key) ? text.slice(0, 10) : text;
    }
  }
  return next as T;
}

/** `contracted_hours` is a JSON column — some drivers hand it back as a string. */
function parseContractedHours(raw: unknown): ContractedHoursRow[] {
  let rows: unknown = raw;
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows);
    } catch {
      rows = [];
    }
  }
  if (!Array.isArray(rows)) return emptyContractedHours();
  return mergeContractedHours(
    rows
      .map(asRecord)
      .filter(
        (row) => row.day_of_week !== undefined && row.day_of_week !== null,
      )
      .map((row) => ({
        dayOfWeek: num(row.day_of_week),
        startTime: str(row.start_time).slice(0, 5),
        endTime: str(row.end_time).slice(0, 5),
        hours: str(row.hours),
      })),
  );
}

/** `GET /employees/{id}` — the row plus every profile block it includes. */
export function mapEmployeeDetail(raw: unknown): EmployeeDetail {
  const row = asRecord(raw);
  const base = emptyEmployeeProfile();
  const employment = asRecord(row.employment);

  const profile: EmployeeProfile = {
    ...base,
    givenName: str(row.given_name),
    surname: str(row.surname),
    username: str(row.username),
    email: str(row.email),
    mobileCountryCode: str(row.mobile_country_code) || base.mobileCountryCode,
    mobileNumber: str(row.mobile_number),
    payrollId: str(row.payroll_id),
    profilePhotoUrl: str(row.profile_photo_url),
    personalDetails: hydrateGroup(base.personalDetails, row.personal_details),
    address: hydrateGroup(base.address, row.address),
    employment: {
      ...hydrateGroup(base.employment, employment),
      // The employment block is created with the employee, but a row from
      // before profiles existed only has the type on the employee itself.
      employmentType:
        str(employment.employment_type || row.employment_type) ||
        base.employment.employmentType,
      contractedHours: parseContractedHours(employment.contracted_hours),
    },
    tax: hydrateGroup(base.tax, row.tax),
    super: hydrateGroup(base.super, row.super),
    banking: hydrateGroup(base.banking, row.banking),
    openingBalances: (Array.isArray(row.opening_balances)
      ? row.opening_balances
      : []
    )
      .map((balance) => hydrateGroup(EMPTY_OPENING_BALANCE, balance))
      .filter((balance) => balance.financialYear),
    accessControl: hydrateGroup(base.accessControl, row.access_control),
  };

  return {
    id: str(row.id),
    eusername: strOrNull(row.eusername),
    status: mapEmployee(row).status,
    profile,
  };
}

export function mapEmployeeDocument(raw: unknown): EmployeeDocument {
  const doc = asRecord(raw);
  const size = doc.file_size;
  return {
    id: str(doc.id),
    fileName: str(doc.file_name),
    fileSize:
      size === null || size === undefined || size === "" ? null : num(size),
    contentType: str(doc.content_type),
    fileUrl: str(doc.file_url),
  };
}

export function mapBulkUploadResult(raw: unknown): BulkUploadResult {
  const result = asRecord(raw);
  return {
    validCount: num(result.validCount),
    failedCount: num(result.failedCount),
    errors: (Array.isArray(result.errors) ? result.errors : []).map((entry) => {
      const error = asRecord(entry);
      return { row: num(error.row), error: str(error.error) };
    }),
  };
}

export async function fetchEmployeesPage(
  params: EmployeeListParams,
): Promise<EmployeePage> {
  const response = await api.get<ApiEnvelope<unknown[]>>(
    apiRoutes.payroll.employees,
    {
      params: employeeListQuery(params),
    },
  );
  const rows = unwrap(response, "Failed to load employees");
  const pagination = response.data?.pagination ?? {};
  const total = num(pagination.total);
  return {
    employees: (Array.isArray(rows) ? rows : []).map(mapEmployee),
    total,
    totalPages: Math.max(
      1,
      num(pagination.total_pages) || Math.ceil(total / params.limit),
    ),
  };
}

export async function fetchEmployeeStats(): Promise<EmployeeStats> {
  const response = await api.get<ApiEnvelope<unknown>>(
    apiRoutes.payroll.employeeStats,
  );
  return mapEmployeeStats(unwrap(response, "Failed to load employee figures"));
}

export async function fetchEmployeeDetail(id: string): Promise<EmployeeDetail> {
  const response = await api.get<ApiEnvelope<unknown>>(
    apiRoutes.payroll.employee(id),
  );
  return mapEmployeeDetail(unwrap(response, "Failed to load this employee"));
}

/** `POST /employees` — queues the new employee for Microkeeper. */
export async function createEmployeeApi(
  values: CreateEmployeeValues,
): Promise<PayrollEmployee> {
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.payroll.employees,
    buildEncryptedRequestBody(buildCreateEmployeePayload(values)),
  );
  return mapEmployee(unwrap(response, "Failed to create employee."));
}

/** `PUT /employees/{id}` — the whole profile, blanks left out. */
export async function updateEmployeeApi(
  id: string,
  profile: EmployeeProfile,
): Promise<EmployeeDetail> {
  const response = await api.put<ApiEnvelope<unknown>>(
    apiRoutes.payroll.employee(id),
    buildEncryptedRequestBody(buildUpdateEmployeePayload(profile)),
  );
  return mapEmployeeDetail(unwrap(response, "Failed to update employee."));
}

export async function deleteEmployeeApi(id: string): Promise<void> {
  const response = await api.delete<ApiEnvelope<unknown>>(
    apiRoutes.payroll.employee(id),
  );
  unwrap(response, "Failed to remove employee.");
}

/** Returns the server's own confirmation ("Credentials email sent to …"). */
export async function sendCredentialsEmailApi(id: string): Promise<string> {
  const response = await api.post<ApiEnvelope<{ message?: string }>>(
    apiRoutes.payroll.employeeSendEmail(id),
    buildEncryptedRequestBody({}),
  );
  const data = unwrap(response, "Failed to send the credentials email.");
  return data?.message || response.data?.message || "Credentials email sent";
}

/** The CSV the backend builds — its columns are the ones its importer reads. */
export async function fetchBulkTemplateApi(): Promise<Blob> {
  const response = await api.get<Blob>(apiRoutes.payroll.employeeBulkTemplate, {
    responseType: "blob",
  });
  return response.data instanceof Blob
    ? response.data
    : new Blob([response.data as BlobPart], { type: "text/csv" });
}

/** Multipart, field `file` — multer reads the raw upload, so nothing is encrypted. */
export async function bulkUploadEmployeesApi(
  file: File,
): Promise<{ result: BulkUploadResult; message: string }> {
  const form = new FormData();
  form.append("file", file);
  const response = await api.post<ApiEnvelope<unknown>>(
    apiRoutes.payroll.employeeBulkUpload,
    form,
  );
  const data = unwrap(response, "Failed to upload the CSV file.");
  return {
    result: mapBulkUploadResult(data),
    message: response.data?.message || "Employees uploaded",
  };
}

export async function fetchEmployeeDocuments(
  id: string,
): Promise<EmployeeDocument[]> {
  const response = await api.get<ApiEnvelope<unknown[]>>(
    apiRoutes.payroll.employeeDocuments(id),
  );
  const rows = unwrap(response, "Failed to load employee files");
  return (Array.isArray(rows) ? rows : []).map(mapEmployeeDocument);
}

/** Two minutes, as sole-webapp allowed — ten 20 MB files take a while. */
export const EMPLOYEE_UPLOAD_TIMEOUT_MS = 120_000;

/** Multipart, `files` repeated (not `files[]`); answers with the whole new list. */
export async function uploadEmployeeDocumentsApi(
  id: string,
  files: File[],
): Promise<EmployeeDocument[]> {
  const form = new FormData();
  files.forEach((file) => form.append("files", file, file.name));
  const response = await api.post<ApiEnvelope<unknown[]>>(
    apiRoutes.payroll.employeeDocuments(id),
    form,
    { timeout: EMPLOYEE_UPLOAD_TIMEOUT_MS },
  );
  const rows = unwrap(response, "Failed to upload employee files.");
  return (Array.isArray(rows) ? rows : []).map(mapEmployeeDocument);
}

/** Returns the server's message — it says so when the stored file outlived the record. */
export async function deleteEmployeeDocumentApi(
  id: string,
  documentId: string,
): Promise<string> {
  const response = await api.delete<ApiEnvelope<unknown>>(
    apiRoutes.payroll.employeeDocument(id, documentId),
  );
  unwrap(response, "Failed to remove employee file.");
  return response.data?.message || "Employee file removed";
}

/* ------------------------------------------------------------------ *
 * Write errors
 * ------------------------------------------------------------------ */

/**
 * The most specific reason the server gave. A Joi failure's `message` is just
 * "Employee validation failed." — the field that failed is in `explanation`,
 * which is what sole-webapp showed.
 */
export function employeeErrorMessage(error: unknown, fallback: string): string {
  const response = (error as { response?: { status?: number; data?: unknown } })
    ?.response;
  if (!response) {
    // A request that never got an answer has nothing better than the
    // fallback; `unwrap` throws a plain Error carrying the server's message.
    if (axios.isAxiosError(error)) return fallback;
    return error instanceof Error && error.message ? error.message : fallback;
  }
  const body = asRecord(response.data);
  const explanation = Array.isArray(body.explanation)
    ? body.explanation
    : asRecord(body.error).explanation;
  const first = Array.isArray(explanation) ? explanation[0] : undefined;
  // Only a 400 names the field; elsewhere `explanation` can be an internal
  // detail (a queue error) where the message is the sentence meant for people.
  if (response.status === 400 && typeof first === "string" && first)
    return first;
  if (typeof body.message === "string" && body.message) return body.message;
  return fallback;
}

/**
 * What a refused add means for the person. `POST /employees` says so with a
 * `code`; bulk upload and re-employing someone send a bare 402, so those are
 * read from the message — the seat-limit wording is the only one that asks
 * for more seats.
 */
export type EmployeeWriteBlock = "seat-limit" | "billing";

export function employeeWriteBlock(error: unknown): EmployeeWriteBlock | null {
  const code = payrollErrorCode(error);
  if (code === SEAT_LIMIT_CODE) return "seat-limit";
  if (code === PAYROLL_NOT_ACTIVE_CODE || code === PAYROLL_OVERDUE_CODE)
    return "billing";
  const response = (error as { response?: { status?: number; data?: unknown } })
    ?.response;
  if (response?.status !== 402) return null;
  const message = str(asRecord(response.data).message);
  return /seat limit|seat\(s\) are available|add employee seats/i.test(message)
    ? "seat-limit"
    : "billing";
}
