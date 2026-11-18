"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPartnerApi,
  fetchPartner,
  fetchPartners,
  issueKeyApi,
  promoteKeyApi,
  revokeKeyApi,
  rotateKeyApi,
  updatePartnerApi,
  type IssuedSecret,
  type KeyEnv,
  type PartnerKey,
  type PartnerForm,
  type PartnerStatusFilter,
} from "@/lib/admin/partners";

/*
 * Secrets returned by issue/rotate go straight back to the caller and are never
 * written to the query cache: the only cached data is the partner and its keys'
 * public fields.
 */

export function useAdminPartnersQuery(params: { search: string; status: PartnerStatusFilter }) {
  return useQuery({
    queryKey: ["admin", "partners", "list", params],
    queryFn: () => fetchPartners(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useAdminPartnerQuery(id: string) {
  return useQuery({
    queryKey: ["admin", "partners", "detail", id],
    queryFn: () => fetchPartner(id),
    enabled: Boolean(id),
  });
}

function useInvalidatePartners() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["admin", "partners"] });
}

export function useCreatePartnerMutation() {
  const invalidate = useInvalidatePartners();
  return useMutation({ mutationFn: (form: PartnerForm) => createPartnerApi(form), onSuccess: invalidate });
}

export function useUpdatePartnerMutation(id: string) {
  const invalidate = useInvalidatePartners();
  return useMutation({ mutationFn: (body: Record<string, unknown>) => updatePartnerApi(id, body), onSuccess: invalidate });
}

export function useIssueKeyMutation(partnerId: string) {
  const invalidate = useInvalidatePartners();
  return useMutation({
    mutationFn: (input: { env: KeyEnv; scopes: string[]; label?: string }) => issueKeyApi(partnerId, input),
    onSuccess: invalidate,
  });
}

export function useKeyActionMutation(partnerId: string) {
  const invalidate = useInvalidatePartners();
  return useMutation({
    // Rotate returns the new secret (show once); promote and revoke return the key.
    mutationFn: async ({
      keyId,
      action,
    }: {
      keyId: string;
      action: "rotate" | "promote" | "revoke";
    }): Promise<IssuedSecret | PartnerKey> => {
      if (action === "rotate") return rotateKeyApi(partnerId, keyId);
      if (action === "promote") return promoteKeyApi(partnerId, keyId);
      return revokeKeyApi(partnerId, keyId);
    },
    onSuccess: invalidate,
  });
}
