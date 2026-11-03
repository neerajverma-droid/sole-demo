import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { isValidIsoDate, toBool, unwrap, type Envelope } from "@/lib/investment-property";
import type { OwnershipEntity } from "@/lib/investment-property";

export const USE_TYPES = [
  { value: "investment", label: "Investment (rented)" },
  { value: "ppor", label: "Main residence (PPOR)" },
  { value: "vacant", label: "Vacant" },
] as const;
export type UseType = (typeof USE_TYPES)[number]["value"];

export function usageLabel(value: string): string {
  return USE_TYPES.find((type) => type.value === value)?.label ?? value;
}

export function availableUseTypes(entity: OwnershipEntity) {
  return entity === "company" ? USE_TYPES.filter((type) => type.value !== "ppor") : USE_TYPES;
}

export type UseHistoryEntry = {
  id: string;
  useType: UseType;
  startDate: string;
  endDate: string;
  otherResidenceNominated: boolean | null;
  notes: string;
};

type ApiEntry = {
  id: number | string;
  use_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  another_main_residence_nominated?: number | boolean | string | null;
  notes?: string | null;
};

export function mapEntry(raw: ApiEntry): UseHistoryEntry {
  return {
    id: String(raw.id),
    useType: USE_TYPES.find((type) => type.value === raw.use_type)?.value ?? "investment",
    startDate: raw.start_date ?? "",
    endDate: raw.end_date ?? "",
    otherResidenceNominated:
      raw.another_main_residence_nominated == null ? null : toBool(raw.another_main_residence_nominated),
    notes: raw.notes ?? "",
  };
}

export type UseHistory = {
  entries: UseHistoryEntry[];
  reviewRequired: boolean;
  gapCount: number;
  pporWarning: string | null;
  absenceWarning: string | null;
  gapWarning: string | null;
};

type ApiHistory = {
  entries?: ApiEntry[];
  summary?: { accountant_review_required?: boolean; history_gap_count?: number | string };
  notifications?: {
    ppor_warning?: string | null;
    absence_rule_warning?: string | null;
    history_gap_warning?: string | null;
  };
};

export async function fetchUseHistory(propertyId: string): Promise<UseHistory> {
  const response = await api.get<Envelope<ApiHistory>>(
    `${apiRoutes.investment.useHistoryByProperty}${encodeURIComponent(propertyId)}/use-history`,
  );
  const data = unwrap(response, "Couldn't load the use history.");
  return {
    entries: (data.entries ?? []).map(mapEntry).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    reviewRequired: Boolean(data.summary?.accountant_review_required),
    gapCount: Number(data.summary?.history_gap_count ?? 0) || 0,
    pporWarning: data.notifications?.ppor_warning ?? null,
    absenceWarning: data.notifications?.absence_rule_warning ?? null,
    gapWarning: data.notifications?.history_gap_warning ?? null,
  };
}

export type NominationChoice = "unset" | "yes" | "no";

export type UseHistoryDraft = {
  useType: UseType;
  startDate: string;
  endDate: string;
  nomination: NominationChoice;
  notes: string;
};

export function emptyUseHistoryDraft(startDate = ""): UseHistoryDraft {
  return { useType: "investment", startDate, endDate: "", nomination: "unset", notes: "" };
}

export function draftFromEntry(entry: UseHistoryEntry): UseHistoryDraft {
  return {
    useType: entry.useType,
    startDate: entry.startDate,
    endDate: entry.endDate,
    nomination:
      entry.otherResidenceNominated === null ? "unset" : entry.otherResidenceNominated ? "yes" : "no",
    notes: entry.notes,
  };
}

export type UseHistoryIssue = { key: keyof UseHistoryDraft; message: string };

export function overlapsExisting(
  draft: { startDate: string; endDate: string },
  entries: UseHistoryEntry[],
  excludeId: string | null,
): UseHistoryEntry | null {
  const end = draft.endDate || "9999-12-31";
  return (
    entries.find(
      (entry) =>
        entry.id !== excludeId &&
        entry.startDate <= end &&
        (entry.endDate === "" || entry.endDate >= draft.startDate),
    ) ?? null
  );
}

export function usagePeriodIssues(
  draft: UseHistoryDraft,
  entity: OwnershipEntity,
  entries: UseHistoryEntry[],
  editingId: string | null,
): UseHistoryIssue[] {
  const issues: UseHistoryIssue[] = [];

  if (entity === "company" && draft.useType === "ppor") {
    issues.push({ key: "useType", message: "Main residence use doesn't apply to company-owned properties." });
  }

  if (!draft.startDate) issues.push({ key: "startDate", message: "Start date is required." });
  else if (!isValidIsoDate(draft.startDate)) {
    issues.push({ key: "startDate", message: "Enter a valid start date." });
  }

  if (draft.endDate) {
    if (!isValidIsoDate(draft.endDate)) issues.push({ key: "endDate", message: "Enter a valid end date." });
    else if (draft.startDate && draft.startDate > draft.endDate) {
      issues.push({ key: "endDate", message: "End date must be on or after the start date." });
    }
  }

  const startOk = draft.startDate && isValidIsoDate(draft.startDate);
  const endOk = !draft.endDate || isValidIsoDate(draft.endDate);
  if (startOk && endOk && !issues.some((issue) => issue.key === "endDate")) {
    const clash = overlapsExisting(draft, entries, editingId);
    if (clash) {
      issues.push({
        key: "startDate",
        message: `This overlaps an existing ${usageLabel(clash.useType).toLowerCase()} period. Periods can't overlap.`,
      });
    }
  }
  return issues;
}

export function usagePeriodWriteBody(draft: UseHistoryDraft) {
  return {
    use_type: draft.useType,
    start_date: draft.startDate,
    end_date: draft.endDate || null,
    another_main_residence_nominated:
      draft.useType === "ppor" || draft.useType === "investment"
        ? draft.nomination === "unset"
          ? null
          : draft.nomination === "yes"
        : null,
    notes: draft.notes.trim() || null,
  };
}

export async function createUseHistoryApi(propertyId: string, draft: UseHistoryDraft): Promise<void> {
  const response = await api.post<Envelope<ApiEntry>>(
    `${apiRoutes.investment.useHistoryByProperty}${encodeURIComponent(propertyId)}/use-history`,
    usagePeriodWriteBody(draft),
  );
  unwrap(response, "Couldn't add the period.");
}

export async function updateUseHistoryApi(
  propertyId: string,
  entryId: string,
  draft: UseHistoryDraft,
): Promise<void> {
  const response = await api.put<Envelope<ApiEntry>>(
    `${apiRoutes.investment.useHistoryByProperty}${encodeURIComponent(propertyId)}/use-history/${encodeURIComponent(entryId)}`,
    usagePeriodWriteBody(draft),
  );
  unwrap(response, "Couldn't save the period.");
}

export async function deleteUseHistoryApi(propertyId: string, entryId: string): Promise<void> {
  const response = await api.delete<Envelope<unknown>>(
    `${apiRoutes.investment.useHistoryByProperty}${encodeURIComponent(propertyId)}/use-history/${encodeURIComponent(entryId)}`,
  );
  if (response.data?.success === false) {
    throw new Error(response.data.message || "Couldn't delete the period.");
  }
}
