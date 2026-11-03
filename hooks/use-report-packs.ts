"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { toast } from "sonner";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiErrorMessage } from "@/lib/api-error";

import {
  changePackStatus,
  createPack,
  createTemplate,
  deletePack,
  deleteTemplate,
  duplicatePack,
  duplicateTemplate,
  fetchCatalogue,
  fetchDownloadUrl,
  fetchGenerationState,
  type GenerationState,
  fetchPack,
  fetchPacks,
  fetchTemplate,
  fetchTemplates,
  generatePack,
  previewPack,
  sendPack,
  isGenerating,
  removeAttachment,
  updatePack,
  updateTemplate,
  uploadAttachment,
  type PackInput,
  type PackStatus,
  type TemplateInput,
} from "@/lib/report-packs";

const CATALOGUE_STALE_MS = 5 * 60 * 1000;
const GENERATION_POLL_MS = 2500;
const PREVIEW_DEBOUNCE_MS = 600;
const PREVIEW_STALE_MS = 30 * 1000;

const KEYS = {
  catalogue: ["report-pack-catalogue"] as const,
  templates: ["report-pack-templates"] as const,
  template: (id: number) => ["report-pack-template", id] as const,
  packs: (filters: { status?: PackStatus; page?: number; limit?: number }) =>
    ["report-packs", filters] as const,
  pack: (id: number) => ["report-pack", id] as const,
  generation: (id: number) => ["report-pack-generation", id] as const,
};

export function useReportCatalogue() {
  return useQuery({
    queryKey: KEYS.catalogue,
    queryFn: fetchCatalogue,
    staleTime: CATALOGUE_STALE_MS,
  });
}

export function usePackTemplates() {
  return useQuery({ queryKey: KEYS.templates, queryFn: fetchTemplates });
}

export function usePackTemplate(id: number | null) {
  return useQuery({
    queryKey: KEYS.template(id ?? 0),
    queryFn: () => fetchTemplate(id as number),
    enabled: typeof id === "number" && id > 0,
  });
}

export function useReportPacks(
  filters: { status?: PackStatus; page?: number; limit?: number } = {},
) {
  return useQuery({
    queryKey: KEYS.packs(filters),
    queryFn: () => fetchPacks(filters),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.packs.some((pack) => isGenerating(pack))
        ? GENERATION_POLL_MS
        : false,
  });
}

export function useReportPack(id: number | null) {
  return useQuery({
    queryKey: KEYS.pack(id ?? 0),
    queryFn: () => fetchPack(id as number),
    enabled: typeof id === "number" && id > 0,
  });
}

export function usePackGeneration(id: number | null, active: boolean) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: KEYS.generation(id ?? 0),
    queryFn: async () => {
      const state = await fetchGenerationState(id as number);
      if (
        state.generation_status === "succeeded" ||
        state.generation_status === "failed"
      ) {
        await queryClient.invalidateQueries({
          queryKey: KEYS.pack(id as number),
        });
      }
      return state;
    },
    enabled: typeof id === "number" && id > 0 && active,
    refetchInterval: (query) => {
      const status = query.state.data?.generation_status;
      return status === "queued" || status === "running"
        ? GENERATION_POLL_MS
        : false;
    },
  });
}

function useInvalidatePacks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["report-packs"] });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TemplateInput) => createTemplate(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: KEYS.templates }),
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: TemplateInput }) =>
      updateTemplate(id, input),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: KEYS.templates });
      queryClient.invalidateQueries({ queryKey: KEYS.template(template.id) });
    },
  });
}

export function useDuplicateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => duplicateTemplate(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: KEYS.templates }),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTemplate(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: KEYS.templates }),
  });
}

export function useCreatePack() {
  const invalidate = useInvalidatePacks();
  return useMutation({
    mutationFn: (input: PackInput) => createPack(input),
    onSuccess: invalidate,
  });
}

export function useUpdatePack() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePacks();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: PackInput }) =>
      updatePack(id, input),
    onSuccess: (pack) => {
      queryClient.setQueryData(KEYS.pack(pack.id), pack);
      invalidate();
    },
  });
}

export function useDuplicatePack() {
  const invalidate = useInvalidatePacks();
  return useMutation({
    mutationFn: (id: number) => duplicatePack(id),
    onSuccess: invalidate,
  });
}

export function useChangePackStatus() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePacks();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: PackStatus }) =>
      changePackStatus(id, status),
    onSuccess: (pack) => {
      queryClient.setQueryData(KEYS.pack(pack.id), pack);
      invalidate();
    },
  });
}

export function useDeletePack() {
  const invalidate = useInvalidatePacks();
  return useMutation({
    mutationFn: (id: number) => deletePack(id),
    onSuccess: invalidate,
  });
}

export function useGeneratePack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, publish }: { id: number; publish?: boolean }) =>
      generatePack(id, publish ?? false),
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<GenerationState>(
        KEYS.generation(variables.id),
        (current) => ({
          pdf_page_count: null,
          pdf_generated_at: null,
          status: variables.publish ? "approved" : "draft",
          ...current,
          id: variables.id,
          generation_status: "queued",
          generation_error: null,
        }),
      );
      queryClient.invalidateQueries({ queryKey: KEYS.pack(variables.id) });
      queryClient.invalidateQueries({
        queryKey: KEYS.generation(variables.id),
      });
    },
  });
}

export function useOpenPackDownload() {
  const mutation = useMutation({
    mutationFn: (id: number) => fetchDownloadUrl(id),
  });
  const open = async (id: number) => {
    try {
      const { url } = await mutation.mutateAsync(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not get the download link."));
    }
  };
  return { open, isPending: mutation.isPending };
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) =>
      uploadAttachment(id, file),
    onSuccess: (pack) => queryClient.setQueryData(KEYS.pack(pack.id), pack),
  });
}

export function useRemoveAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, attachmentId }: { id: number; attachmentId: number }) =>
      removeAttachment(id, attachmentId),
    onSuccess: (pack) => queryClient.setQueryData(KEYS.pack(pack.id), pack),
  });
}

export function usePackPreview(input: PackInput, packId: number | null) {
  const serialized = JSON.stringify(input);
  const debounced = useDebouncedValue(serialized, PREVIEW_DEBOUNCE_MS);
  const ready = Boolean(input.period_from && input.period_to);

  return useQuery({
    queryKey: ["report-pack-preview", packId, debounced],
    queryFn: () => previewPack(JSON.parse(debounced) as PackInput, packId),
    enabled: ready,
    placeholderData: keepPreviousData,
    staleTime: PREVIEW_STALE_MS,
    retry: false,
  });
}

export function useSendPack() {
  return useMutation({
    mutationFn: ({
      id,
      recipients,
      note,
    }: {
      id: number;
      recipients: string[];
      note?: string;
    }) => sendPack(id, { recipients, note }),
  });
}
