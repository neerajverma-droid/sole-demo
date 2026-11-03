import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import {
  MAX_MONEY,
  fetchAllPages,
  isValidIsoDate,
  parseMoney,
  toBool,
  toNullableNumber,
  toNumber,
  unwrap,
  unwrapPage,
  type Envelope,
} from "@/lib/investment-property";

export const RENT_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
] as const;
export type RentFrequency = (typeof RENT_FREQUENCIES)[number]["value"];

export function rentFrequencyLabel(value: string | null | undefined): string {
  return RENT_FREQUENCIES.find((frequency) => frequency.value === value)?.label ?? "—";
}

export function frequencyShort(value: string | null | undefined): string {
  switch (value) {
    case "weekly":
      return "per week";
    case "fortnightly":
      return "per fortnight";
    case "monthly":
      return "per month";
    default:
      return "";
  }
}

export type RentalSchedule = {
  id: string;
  rentAmount: number;
  frequency: RentFrequency;
  startDate: string;
  endDate: string;
  paymentDay: number | null;
  agentManaged: boolean;
  agentName: string;
  increaseDate: string;
  notes: string;
  active: boolean;
};

type ApiSchedule = {
  id: number | string;
  rent_amount?: number | string | null;
  rent_frequency?: string | null;
  rent_start_date?: string | null;
  rent_end_date?: string | null;
  expected_payment_day?: number | string | null;
  agent_managed?: number | boolean | string | null;
  agent_name?: string | null;
  rent_increase_date?: string | null;
  notes?: string | null;
  is_active?: number | boolean | string | null;
};

export function mapSchedule(raw: ApiSchedule): RentalSchedule {
  return {
    id: String(raw.id),
    rentAmount: toNumber(raw.rent_amount),
    frequency: RENT_FREQUENCIES.find((item) => item.value === raw.rent_frequency)?.value ?? "weekly",
    startDate: raw.rent_start_date ?? "",
    endDate: raw.rent_end_date ?? "",
    paymentDay: toNullableNumber(raw.expected_payment_day),
    agentManaged: toBool(raw.agent_managed),
    agentName: raw.agent_name ?? "",
    increaseDate: raw.rent_increase_date ?? "",
    notes: raw.notes ?? "",
    active: toBool(raw.is_active),
  };
}

export async function fetchRentalSchedules(propertyId: string): Promise<RentalSchedule[]> {
  const rows = await fetchAllPages(async (page, limit) => {
    const response = await api.get<Envelope<ApiSchedule[]>>(
      `${apiRoutes.investment.rentalScheduleByProperty}${encodeURIComponent(propertyId)}/rental-schedule`,
      { params: { page, limit } },
    );
    const result = unwrapPage(response, "Couldn't load rental schedules.");
    return { rows: result.rows, total: result.total };
  });
  return rows.map(mapSchedule);
}

export type ScheduleDraft = {
  rentAmount: string;
  frequency: RentFrequency;
  startDate: string;
  endDate: string;
  paymentDay: string;
  agentManaged: boolean;
  agentName: string;
  increaseDate: string;
  notes: string;
  active: boolean;
};

export function emptyScheduleDraft(): ScheduleDraft {
  return {
    rentAmount: "",
    frequency: "weekly",
    startDate: "",
    endDate: "",
    paymentDay: "",
    agentManaged: false,
    agentName: "",
    increaseDate: "",
    notes: "",
    active: true,
  };
}

export function draftFromSchedule(schedule: RentalSchedule): ScheduleDraft {
  return {
    rentAmount: String(schedule.rentAmount),
    frequency: schedule.frequency,
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    paymentDay: schedule.paymentDay === null ? "" : String(schedule.paymentDay),
    agentManaged: schedule.agentManaged,
    agentName: schedule.agentName,
    increaseDate: schedule.increaseDate,
    notes: schedule.notes,
    active: schedule.active,
  };
}

export type ScheduleIssue = { key: keyof ScheduleDraft; message: string };

export function scheduleIssues(draft: ScheduleDraft): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];
  const add = (key: keyof ScheduleDraft, message: string) => issues.push({ key, message });

  const amount = parseMoney(draft.rentAmount);
  if (amount === null) add("rentAmount", "Rent amount is required.");
  else if (Number.isNaN(amount) || amount <= 0) add("rentAmount", "Rent amount must be greater than zero.");
  else if (amount > MAX_MONEY) add("rentAmount", "Rent amount is too large.");

  if (!draft.startDate) add("startDate", "Rent start date is required.");
  else if (!isValidIsoDate(draft.startDate)) add("startDate", "Enter a valid start date.");

  if (draft.endDate) {
    if (!isValidIsoDate(draft.endDate)) add("endDate", "Enter a valid end date.");
    else if (draft.startDate && draft.endDate < draft.startDate) {
      add("endDate", "Rent end date can't be before the start date.");
    }
  }

  if (draft.increaseDate && !isValidIsoDate(draft.increaseDate)) {
    add("increaseDate", "Enter a valid date.");
  }

  const day = draft.paymentDay.trim();
  if (day !== "") {
    const parsed = Number(day);
    if (!/^\d{1,2}$/.test(day) || parsed < 1 || parsed > 31) {
      add("paymentDay", "Payment day must be a whole number from 1 to 31.");
    }
  }

  if (draft.agentManaged && draft.agentName.length > 255) {
    add("agentName", "Agent name must be 255 characters or fewer.");
  }
  return issues;
}

export function scheduleWriteBody(draft: ScheduleDraft) {
  return {
    rent_amount: parseMoney(draft.rentAmount) ?? 0,
    rent_frequency: draft.frequency,
    rent_start_date: draft.startDate,
    rent_end_date: draft.endDate || null,
    expected_payment_day: draft.paymentDay.trim() === "" ? null : Number(draft.paymentDay),
    agent_managed: draft.agentManaged,
    agent_name: draft.agentManaged ? draft.agentName.trim() || null : null,
    rent_increase_date: draft.increaseDate || null,
    notes: draft.notes.trim() || null,
    is_active: draft.active,
  };
}

export async function createScheduleApi(propertyId: string, draft: ScheduleDraft): Promise<void> {
  const response = await api.post<Envelope<ApiSchedule>>(
    `${apiRoutes.investment.rentalScheduleByProperty}${encodeURIComponent(propertyId)}/rental-schedule`,
    scheduleWriteBody(draft),
  );
  unwrap(response, "Couldn't create the rental schedule.");
}

export async function updateScheduleApi(scheduleId: string, draft: ScheduleDraft): Promise<void> {
  const response = await api.patch<Envelope<ApiSchedule>>(
    `${apiRoutes.investment.rentalScheduleItem}${encodeURIComponent(scheduleId)}`,
    scheduleWriteBody(draft),
  );
  unwrap(response, "Couldn't save the rental schedule.");
}

export async function setScheduleActiveApi(scheduleId: string, active: boolean): Promise<void> {
  const response = await api.patch<Envelope<ApiSchedule>>(
    `${apiRoutes.investment.rentalScheduleItem}${encodeURIComponent(scheduleId)}`,
    { is_active: active },
  );
  unwrap(response, "Couldn't update the rental schedule.");
}

export async function deleteScheduleApi(scheduleId: string): Promise<void> {
  const response = await api.delete<Envelope<unknown>>(
    `${apiRoutes.investment.rentalScheduleItem}${encodeURIComponent(scheduleId)}`,
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't delete the rental schedule.");
  }
}
