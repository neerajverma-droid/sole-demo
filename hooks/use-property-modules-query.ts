"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { INVESTMENT_KEY } from "@/hooks/use-investment-property-query";
import {
  createAdjustmentApi,
  deleteAdjustmentApi,
  fetchCostBaseAdjustments,
  fetchCostBaseStats,
  updateAdjustmentApi,
  type AdjustmentDraft,
} from "@/lib/investment-property-cost-base";
import {
  fetchAccountantExport,
  fetchCgtBreakdown,
  fetchCgtTaxImpact,
} from "@/lib/investment-property-cgt";
import {
  deletePropertyDocumentApi,
  fetchPropertyDocuments,
  uploadPropertyDocumentApi,
} from "@/lib/investment-property-documents";
import {
  assignExpensesApi,
  fetchAllPropertyExpenses,
  fetchAssignableExpenses,
  fetchPropertyExpenses,
} from "@/lib/investment-property-expenses";
import {
  createIncomeApi,
  deleteIncomeApi,
  fetchPropertyIncome,
  updateIncomeApi,
  type IncomeDraft,
  type IncomeListParams,
} from "@/lib/investment-property-income";
import {
  deletePropertyLoanApi,
  fetchPropertyLoan,
  savePropertyLoanApi,
  type LoanDraft,
} from "@/lib/investment-property-loan";
import {
  createMaintenanceApi,
  deleteMaintenanceApi,
  fetchMaintenanceItem,
  fetchPropertyMaintenance,
  linkMaintenanceExpenseApi,
  updateMaintenanceApi,
  type MaintenanceDraft,
  type MaintenanceListParams,
} from "@/lib/investment-property-maintenance";
import {
  createScheduleApi,
  deleteScheduleApi,
  fetchRentalSchedules,
  setScheduleActiveApi,
  updateScheduleApi,
  type ScheduleDraft,
} from "@/lib/investment-property-rental";
import {
  createUseHistoryApi,
  deleteUseHistoryApi,
  fetchUseHistory,
  updateUseHistoryApi,
  type UseHistoryDraft,
} from "@/lib/investment-property-use-history";

function useInvalidateProperty() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [INVESTMENT_KEY] });
}

export function useLoanQuery(propertyId: string) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "loan", propertyId],
    queryFn: () => fetchPropertyLoan(propertyId),
  });
}

export function useSaveLoanMutation(propertyId: string) {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: (draft: LoanDraft) => savePropertyLoanApi(propertyId, draft),
    onSuccess: invalidate,
  });
}

export function useDeleteLoanMutation(propertyId: string) {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: () => deletePropertyLoanApi(propertyId),
    onSuccess: invalidate,
  });
}

export function useIncomeQuery(propertyId: string, params: IncomeListParams) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "income", propertyId, params],
    queryFn: () => fetchPropertyIncome(propertyId, params),
    placeholderData: keepPreviousData,
  });
}

export function useSaveIncomeMutation(propertyId: string) {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: IncomeDraft }) =>
      id ? updateIncomeApi(propertyId, id, draft) : createIncomeApi(propertyId, draft),
    onSuccess: invalidate,
  });
}

export function useDeleteIncomeMutation(propertyId: string) {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: (id: string) => deleteIncomeApi(propertyId, id),
    onSuccess: invalidate,
  });
}

export function usePropertyExpensesQuery(propertyId: string, page: number, limit: number) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "expenses", propertyId, page, limit],
    queryFn: () => fetchPropertyExpenses(propertyId, page, limit),
    placeholderData: keepPreviousData,
  });
}

export function useAllPropertyExpensesQuery(propertyId: string) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "expenses-all", propertyId],
    queryFn: () => fetchAllPropertyExpenses(propertyId),
  });
}

export function useAssignableExpensesQuery(
  page: number,
  limit: number,
  search: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "assignable-expenses", page, limit, search],
    queryFn: () => fetchAssignableExpenses(page, limit, search),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAssignExpensesMutation(propertyId: string) {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: (expenseIds: string[]) => assignExpensesApi(propertyId, expenseIds),
    onSuccess: invalidate,
  });
}

export function useMaintenanceQuery(propertyId: string, params: MaintenanceListParams) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "maintenance", propertyId, params],
    queryFn: () => fetchPropertyMaintenance(propertyId, params),
    placeholderData: keepPreviousData,
  });
}

export function useMaintenanceItemQuery(propertyId: string, maintenanceId: string | null) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "maintenance-item", propertyId, maintenanceId],
    queryFn: () => fetchMaintenanceItem(propertyId, maintenanceId as string),
    enabled: !!maintenanceId,
    refetchOnMount: "always",
  });
}

export function useSaveMaintenanceMutation(propertyId: string) {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: MaintenanceDraft }) =>
      id ? updateMaintenanceApi(propertyId, id, draft) : createMaintenanceApi(propertyId, draft),
    onSuccess: invalidate,
  });
}

export function useLinkMaintenanceExpenseMutation(propertyId: string) {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: ({ id, expenseId }: { id: string; expenseId: string }) =>
      linkMaintenanceExpenseApi(propertyId, id, expenseId),
    onSuccess: invalidate,
  });
}

export function useDeleteMaintenanceMutation(propertyId: string) {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: (id: string) => deleteMaintenanceApi(propertyId, id),
    onSuccess: invalidate,
  });
}

export function useRentalSchedulesQuery(propertyId: string) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "rental-schedules", propertyId],
    queryFn: () => fetchRentalSchedules(propertyId),
  });
}

export function useSaveScheduleMutation(propertyId: string) {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: ScheduleDraft }) =>
      id ? updateScheduleApi(id, draft) : createScheduleApi(propertyId, draft),
    onSuccess: invalidate,
  });
}

export function useSetScheduleActiveMutation() {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setScheduleActiveApi(id, active),
    onSuccess: invalidate,
  });
}

export function useDeleteScheduleMutation() {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: (id: string) => deleteScheduleApi(id),
    onSuccess: invalidate,
  });
}

export function useCostBaseStatsQuery(propertyId: string) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "cost-base-stats", propertyId],
    queryFn: () => fetchCostBaseStats(propertyId),
  });
}

export function useCostBaseAdjustmentsQuery(propertyId: string, page: number, limit: number) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "cost-base", propertyId, page, limit],
    queryFn: () => fetchCostBaseAdjustments(propertyId, page, limit),
    placeholderData: keepPreviousData,
  });
}

export function useSaveAdjustmentMutation(propertyId: string) {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: AdjustmentDraft }) =>
      id ? updateAdjustmentApi(propertyId, id, draft) : createAdjustmentApi(propertyId, draft),
    onSuccess: invalidate,
  });
}

export function useDeleteAdjustmentMutation(propertyId: string) {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: (id: string) => deleteAdjustmentApi(propertyId, id),
    onSuccess: invalidate,
  });
}

export function useDocumentsQuery(propertyId: string) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "documents", propertyId],
    queryFn: () => fetchPropertyDocuments(propertyId),
  });
}

export function useUploadDocumentMutation(propertyId: string) {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) =>
      uploadPropertyDocumentApi(propertyId, name, file),
    onSuccess: invalidate,
  });
}

export function useDeleteDocumentMutation() {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: (id: string) => deletePropertyDocumentApi(id),
    onSuccess: invalidate,
  });
}

export function useUseHistoryQuery(propertyId: string) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "use-history", propertyId],
    queryFn: () => fetchUseHistory(propertyId),
  });
}

export function useSaveUseHistoryMutation(propertyId: string) {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: UseHistoryDraft }) =>
      id ? updateUseHistoryApi(propertyId, id, draft) : createUseHistoryApi(propertyId, draft),
    onSuccess: invalidate,
  });
}

export function useDeleteUseHistoryMutation(propertyId: string) {
  const invalidate = useInvalidateProperty();
  return useMutation({
    mutationFn: (id: string) => deleteUseHistoryApi(propertyId, id),
    onSuccess: invalidate,
  });
}

export function useCgtBreakdownQuery(propertyId: string, enabled: boolean) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "cgt", propertyId],
    queryFn: () => fetchCgtBreakdown(propertyId),
    enabled,
  });
}

export function useCgtTaxImpactQuery(propertyId: string, enabled: boolean) {
  return useQuery({
    queryKey: [INVESTMENT_KEY, "cgt-impact", propertyId],
    queryFn: () => fetchCgtTaxImpact(propertyId),
    enabled,
    retry: false,
  });
}

export function useAccountantExportMutation(propertyId: string) {
  return useMutation({ mutationFn: () => fetchAccountantExport(propertyId) });
}
