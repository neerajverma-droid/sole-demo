"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchWebhook,
  fetchWebhookDeliveries,
  generateWebhookSecretApi,
  redeliverWebhookApi,
  sendTestWebhookApi,
  updateWebhookApi,
  type WebhookForm,
} from "@/lib/admin/partner-webhooks";

/*
 * The signing secret from generateWebhookSecretApi goes straight back to the
 * caller and is never written to the query cache.
 */

const webhookKey = (partnerId: string) => ["admin", "partners", "webhook", partnerId] as const;
const deliveriesKey = (partnerId: string) => ["admin", "partners", "webhook-deliveries", partnerId] as const;

export function usePartnerWebhookQuery(partnerId: string) {
  return useQuery({ queryKey: webhookKey(partnerId), queryFn: () => fetchWebhook(partnerId), enabled: Boolean(partnerId) });
}

export function usePartnerWebhookDeliveriesQuery(partnerId: string) {
  return useQuery({
    queryKey: deliveriesKey(partnerId),
    queryFn: () => fetchWebhookDeliveries(partnerId),
    enabled: Boolean(partnerId),
    // Retries happen in the background on the server; keep the log fresh while it's open.
    refetchInterval: 30_000,
  });
}

function useInvalidate(partnerId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: webhookKey(partnerId) }),
      queryClient.invalidateQueries({ queryKey: deliveriesKey(partnerId) }),
      queryClient.invalidateQueries({ queryKey: ["admin", "partners", "detail", partnerId] }),
    ]);
}

export function useUpdatePartnerWebhookMutation(partnerId: string) {
  const invalidate = useInvalidate(partnerId);
  return useMutation({ mutationFn: (form: WebhookForm) => updateWebhookApi(partnerId, form), onSuccess: invalidate });
}

export function useGenerateWebhookSecretMutation(partnerId: string) {
  const invalidate = useInvalidate(partnerId);
  return useMutation({ mutationFn: () => generateWebhookSecretApi(partnerId), onSuccess: invalidate });
}

export function useSendTestWebhookMutation(partnerId: string) {
  const invalidate = useInvalidate(partnerId);
  return useMutation({ mutationFn: () => sendTestWebhookApi(partnerId), onSettled: invalidate });
}

export function useRedeliverWebhookMutation(partnerId: string) {
  const invalidate = useInvalidate(partnerId);
  return useMutation({ mutationFn: (deliveryId: string) => redeliverWebhookApi(partnerId, deliveryId), onSettled: invalidate });
}
