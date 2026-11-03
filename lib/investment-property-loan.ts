import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import {
  MAX_MONEY,
  isValidIsoDate,
  parseMoney,
  toNullableNumber,
  toNumber,
  unwrap,
  type Envelope,
} from "@/lib/investment-property";
import { toIsoDate } from "@/lib/invoices";

export const LOAN_TYPES = [
  { value: "principal_and_interest", label: "Principal & interest" },
  { value: "interest_only", label: "Interest only" },
] as const;
export type LoanType = (typeof LOAN_TYPES)[number]["value"];

export const INTEREST_TYPES = [
  { value: "variable", label: "Variable" },
  { value: "fixed", label: "Fixed" },
  { value: "split", label: "Split" },
] as const;
export type InterestType = (typeof INTEREST_TYPES)[number]["value"];

export const REPAYMENT_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
] as const;
export type RepaymentFrequency = (typeof REPAYMENT_FREQUENCIES)[number]["value"];

export const LOAN_TERM_UNITS = [
  { value: "years", label: "Years" },
  { value: "months", label: "Months" },
] as const;
export type LoanTermUnit = (typeof LOAN_TERM_UNITS)[number]["value"];

export const SPLIT_TYPES = [
  { value: "percentage", label: "Percentage" },
  { value: "dollar", label: "Dollar amount" },
] as const;
export type SplitType = (typeof SPLIT_TYPES)[number]["value"];

function labelOf(
  list: readonly { value: string; label: string }[],
  value: string | null | undefined,
): string {
  return list.find((item) => item.value === value)?.label ?? "—";
}

export const loanTypeLabel = (value: string | null | undefined) => labelOf(LOAN_TYPES, value);
export const interestTypeLabel = (value: string | null | undefined) => labelOf(INTEREST_TYPES, value);
export const repaymentFrequencyLabel = (value: string | null | undefined) =>
  labelOf(REPAYMENT_FREQUENCIES, value);

export type PropertyLoan = {
  lenderName: string;
  startDate: string;
  originalAmount: number;
  currentBalance: number;
  hasCurrentBalance: boolean;
  interestRate: number | null;
  fixedRate: number | null;
  variableRate: number | null;
  repaymentFrequency: RepaymentFrequency | null;
  repaymentAmount: number | null;
  termValue: number | null;
  termUnit: LoanTermUnit | null;
  loanType: LoanType;
  interestType: InterestType | null;
  fixedPortion: number | null;
  splitType: SplitType;
  interestOnlyEndDate: string;
  notes: string;
};

type ApiLoan = {
  lender_name?: string | null;
  loan_start_date?: string | null;
  original_loan_amount?: number | string | null;
  current_loan_balance?: number | string | null;
  effective_loan_amount?: number | string | null;
  interest_rate?: number | string | null;
  fixed_interest_rate?: number | string | null;
  variable_interest_rate?: number | string | null;
  repayment_frequency?: string | null;
  repayment_amount?: number | string | null;
  loan_term_value?: number | string | null;
  loan_term_unit?: string | null;
  loan_type?: string | null;
  interest_type?: string | null;
  fixed_portion_percentage?: number | string | null;
  split_type?: string | null;
  interest_only_end_date?: string | null;
  notes?: string | null;
};

function pick<T extends string>(
  list: readonly { value: T }[],
  value: unknown,
): T | null {
  return list.find((item) => item.value === value)?.value ?? null;
}

export function mapLoan(raw: ApiLoan): PropertyLoan {
  const hasBalance = raw.current_loan_balance != null && raw.current_loan_balance !== "";
  return {
    lenderName: raw.lender_name ?? "",
    startDate: raw.loan_start_date ?? "",
    originalAmount: toNumber(raw.original_loan_amount),
    currentBalance: toNumber(raw.effective_loan_amount ?? raw.current_loan_balance ?? raw.original_loan_amount),
    hasCurrentBalance: hasBalance,
    interestRate: toNullableNumber(raw.interest_rate),
    fixedRate: toNullableNumber(raw.fixed_interest_rate),
    variableRate: toNullableNumber(raw.variable_interest_rate),
    repaymentFrequency: pick(REPAYMENT_FREQUENCIES, raw.repayment_frequency),
    repaymentAmount: toNullableNumber(raw.repayment_amount),
    termValue: toNullableNumber(raw.loan_term_value),
    termUnit: pick(LOAN_TERM_UNITS, raw.loan_term_unit),
    loanType: pick(LOAN_TYPES, raw.loan_type) ?? "principal_and_interest",
    interestType: pick(INTEREST_TYPES, raw.interest_type),
    fixedPortion: toNullableNumber(raw.fixed_portion_percentage),
    splitType: pick(SPLIT_TYPES, raw.split_type) ?? "percentage",
    interestOnlyEndDate: raw.interest_only_end_date ?? "",
    notes: raw.notes ?? "",
  };
}

export type LoanDraft = {
  lenderName: string;
  startDate: string;
  originalAmount: string;
  currentBalance: string;
  loanType: LoanType;
  interestType: InterestType;
  interestRate: string;
  fixedRate: string;
  variableRate: string;
  splitType: SplitType;
  fixedPortion: string;
  repaymentFrequency: RepaymentFrequency | "";
  repaymentAmount: string;
  termValue: string;
  termUnit: LoanTermUnit;
  interestOnlyEndDate: string;
  notes: string;
};

export function emptyLoanDraft(): LoanDraft {
  return {
    lenderName: "",
    startDate: "",
    originalAmount: "",
    currentBalance: "",
    loanType: "principal_and_interest",
    interestType: "variable",
    interestRate: "",
    fixedRate: "",
    variableRate: "",
    splitType: "percentage",
    fixedPortion: "",
    repaymentFrequency: "",
    repaymentAmount: "",
    termValue: "",
    termUnit: "years",
    interestOnlyEndDate: "",
    notes: "",
  };
}

function numText(value: number | null): string {
  return value === null ? "" : String(value);
}

export function draftFromLoan(loan: PropertyLoan): LoanDraft {
  return {
    lenderName: loan.lenderName,
    startDate: loan.startDate,
    originalAmount: numText(loan.originalAmount),
    currentBalance: loan.hasCurrentBalance ? numText(loan.currentBalance) : "",
    loanType: loan.loanType,
    interestType: loan.interestType ?? "variable",
    interestRate: numText(loan.interestRate),
    fixedRate: numText(loan.fixedRate),
    variableRate: numText(loan.variableRate),
    splitType: loan.splitType,
    fixedPortion: numText(loan.fixedPortion),
    repaymentFrequency: loan.repaymentFrequency ?? "",
    repaymentAmount: numText(loan.repaymentAmount),
    termValue: numText(loan.termValue),
    termUnit: loan.termUnit ?? "years",
    interestOnlyEndDate: loan.interestOnlyEndDate,
    notes: loan.notes,
  };
}

export function parseRate(text: string): number | null {
  const cleaned = text.trim().replace(/%/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,4})?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

export type LoanIssue = { key: keyof LoanDraft; message: string };

export function loanIssues(draft: LoanDraft, today: Date = new Date()): LoanIssue[] {
  const issues: LoanIssue[] = [];
  const add = (key: keyof LoanDraft, message: string) => issues.push({ key, message });

  if (!draft.lenderName.trim()) add("lenderName", "Lender name is required.");
  else if (draft.lenderName.trim().length > 255) add("lenderName", "Lender name must be 255 characters or fewer.");

  if (!draft.startDate) add("startDate", "Loan start date is required.");
  else if (!isValidIsoDate(draft.startDate)) add("startDate", "Enter a valid start date.");
  else if (draft.startDate > toIsoDate(today)) add("startDate", "Loan start date can't be in the future.");

  const original = parseMoney(draft.originalAmount);
  if (original === null) add("originalAmount", "Original loan amount is required.");
  else if (Number.isNaN(original) || original <= 0) add("originalAmount", "Original loan amount must be greater than zero.");
  else if (original > MAX_MONEY) add("originalAmount", "Original loan amount is too large.");

  const balance = parseMoney(draft.currentBalance);
  if (balance !== null && (Number.isNaN(balance) || balance > MAX_MONEY)) {
    add("currentBalance", "Current balance must be a dollar amount, up to 2 decimals.");
  }

  const rateKeys: (keyof LoanDraft)[] =
    draft.interestType === "split" ? ["fixedRate", "variableRate"] : ["interestRate"];
  for (const key of rateKeys) {
    const text = draft[key] as string;
    const rate = parseRate(text);
    const label =
      key === "fixedRate" ? "Fixed rate" : key === "variableRate" ? "Variable rate" : "Interest rate";
    if (rate === null) {
      if (draft.interestType === "split") add(key, `${label} is required for split loans.`);
    } else if (Number.isNaN(rate)) {
      add(key, `${label} must be a percentage, up to 4 decimals.`);
    } else if (rate > 100) {
      add(key, `${label} can't be more than 100%.`);
    }
  }

  if (draft.interestType === "split") {
    const portion = parseMoney(draft.fixedPortion);
    if (portion === null) {
      add("fixedPortion", draft.splitType === "percentage" ? "Fixed portion percentage is required." : "Fixed portion amount is required.");
    } else if (Number.isNaN(portion) || portion <= 0) {
      add("fixedPortion", "Fixed portion must be greater than 0.");
    } else if (draft.splitType === "percentage" && portion >= 100) {
      add("fixedPortion", "Fixed portion percentage must be between 0 and 100.");
    } else if (portion > MAX_MONEY) {
      add("fixedPortion", "Fixed portion is too large.");
    }
  }

  const repayment = parseMoney(draft.repaymentAmount);
  if (repayment !== null && (Number.isNaN(repayment) || repayment > MAX_MONEY)) {
    add("repaymentAmount", "Repayment must be a dollar amount, up to 2 decimals.");
  } else if (repayment !== null && repayment > 0 && !draft.repaymentFrequency) {
    add("repaymentFrequency", "Choose how often repayments are made.");
  }

  const term = draft.termValue.trim();
  if (term !== "" && !/^\d{1,4}$/.test(term)) add("termValue", "Loan term must be a whole number.");

  if (draft.loanType === "interest_only" && draft.interestOnlyEndDate) {
    if (!isValidIsoDate(draft.interestOnlyEndDate)) add("interestOnlyEndDate", "Enter a valid date.");
    else if (draft.startDate && draft.interestOnlyEndDate < draft.startDate) {
      add("interestOnlyEndDate", "Interest-only end date can't be before the loan start date.");
    }
  }

  return issues;
}

export function loanWriteBody(draft: LoanDraft) {
  const split = draft.interestType === "split";
  const interestOnly = draft.loanType === "interest_only";
  return {
    lender_name: draft.lenderName.trim(),
    loan_start_date: draft.startDate,
    original_loan_amount: parseMoney(draft.originalAmount) ?? 0,
    current_loan_balance: parseMoney(draft.currentBalance),
    loan_type: draft.loanType,
    interest_type: draft.interestType,
    interest_rate: split ? null : parseRate(draft.interestRate),
    fixed_interest_rate: split ? parseRate(draft.fixedRate) : null,
    variable_interest_rate: split ? parseRate(draft.variableRate) : null,
    split_type: split ? draft.splitType : "percentage",
    fixed_portion_percentage: split ? parseMoney(draft.fixedPortion) : null,
    repayment_frequency: draft.repaymentFrequency || null,
    repayment_amount: parseMoney(draft.repaymentAmount),
    loan_term_value: draft.termValue.trim() === "" ? null : Number(draft.termValue),
    loan_term_unit: draft.termValue.trim() === "" ? null : draft.termUnit,
    interest_only_end_date: interestOnly && draft.interestOnlyEndDate ? draft.interestOnlyEndDate : null,
    notes: draft.notes.trim() || null,
  };
}

export async function fetchPropertyLoan(propertyId: string): Promise<PropertyLoan | null> {
  const response = await api.get<Envelope<{ loan: ApiLoan | null }>>(
    `${apiRoutes.investment.loan}${encodeURIComponent(propertyId)}`,
  );
  const data = unwrap(response, "Couldn't load the loan.");
  return data.loan ? mapLoan(data.loan) : null;
}

export async function savePropertyLoanApi(propertyId: string, draft: LoanDraft): Promise<void> {
  const response = await api.put<Envelope<ApiLoan>>(
    `${apiRoutes.investment.loan}${encodeURIComponent(propertyId)}`,
    loanWriteBody(draft),
  );
  unwrap(response, "Couldn't save the loan.");
}

export async function deletePropertyLoanApi(propertyId: string): Promise<void> {
  const response = await api.delete<Envelope<unknown>>(
    `${apiRoutes.investment.loan}${encodeURIComponent(propertyId)}`,
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't delete the loan.");
  }
}
