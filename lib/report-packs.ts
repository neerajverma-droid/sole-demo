import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { parseISO } from "date-fns";

import { toIsoDate } from "@/lib/invoices";
import {
  periodShape,
  spanLabel,
  type ReportPeriod,
} from "@/lib/report-periods";

export type PackStatus = "draft" | "approved" | "published";
export type GenerationStatus =
  "idle" | "queued" | "running" | "succeeded" | "failed";
export type TemplateAccess = "business" | "tenant";
export type PackAccess = "private" | "business";
export type Orientation = "portrait" | "landscape";
export type NegativeFormat = "brackets" | "minus";
export type TocStyle = "plain" | "dotted";
export type CommentDisplay = "below_report" | "own_page";
export type LogoPosition = "left" | "center" | "right";
export type LogoSize = "small" | "medium" | "large";

export type StoredPreferences = {
  hide_zero_balances: 0 | 1;
  show_cents: 0 | 1;
  show_currency_symbol: 0 | 1;
  logo_position: LogoPosition;
  logo_size: LogoSize;
  logo_on_every_page: 0 | 1;
  confidential: 0 | 1;
};

export type Preferences = {
  hide_zero_balances: boolean;
  show_cents: boolean;
  show_currency_symbol: boolean;
  logo_position: LogoPosition;
  logo_size: LogoSize;
  logo_on_every_page: boolean;
  confidential: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  hide_zero_balances: false,
  show_cents: true,
  show_currency_symbol: true,
  logo_position: "center",
  logo_size: "medium",
  logo_on_every_page: true,
  confidential: false,
};

export function preferencesFrom(
  row: Partial<StoredPreferences> | Partial<Preferences> | null | undefined,
): Preferences {
  const on = (value: unknown, fallback: boolean) =>
    value == null ? fallback : value === true || Number(value) === 1;
  return {
    hide_zero_balances: on(
      row?.hide_zero_balances,
      DEFAULT_PREFERENCES.hide_zero_balances,
    ),
    show_cents: on(row?.show_cents, DEFAULT_PREFERENCES.show_cents),
    show_currency_symbol: on(
      row?.show_currency_symbol,
      DEFAULT_PREFERENCES.show_currency_symbol,
    ),
    logo_position: row?.logo_position ?? DEFAULT_PREFERENCES.logo_position,
    logo_size: row?.logo_size ?? DEFAULT_PREFERENCES.logo_size,
    logo_on_every_page: on(
      row?.logo_on_every_page,
      DEFAULT_PREFERENCES.logo_on_every_page,
    ),
    confidential: on(row?.confidential, DEFAULT_PREFERENCES.confidential),
  };
}

export type StarterTemplate = {
  key: string;
  name: string;
  description: string;
  periodPreset: string;
  reports: string[];
};

export type CatalogueEntry = {
  key: string;
  title: string;
};

export const NAME_MAX = 160;
export const DISCLAIMER_PLACEHOLDER =
  "Liability limited by a scheme approved under Professional Standards Legislation.";
export const DEFAULT_PERIOD: ReportPeriod = "Last month";

export const PACK_ROUTES = {
  list: "/reports/packs",
  templates: "/reports/packs?tab=templates",
  newPack: "/reports/packs?new=1",
  newTemplate: "/reports/packs/templates/new",
  pack: (id: number) => `/reports/packs/${id}`,
  template: (id: number) => `/reports/packs/templates/${id}`,
} as const;

export const TEMPLATE_SOURCE = "template:";
export const STARTER_SOURCE = "starter:";
export type TemplateSource =
  `${typeof TEMPLATE_SOURCE}${number}` | `${typeof STARTER_SOURCE}${string}`;

export function reportTitle(catalogue: CatalogueEntry[], key: string): string {
  return catalogue.find((entry) => entry.key === key)?.title ?? key;
}

export type PackTemplateSummary = {
  id: number;
  name: string;
  description: string | null;
  access: TemplateAccess;
  orientation: Orientation;
  negative_format: NegativeFormat;
  disclaimer_text: string | null;
  disclaimer_file_url: string | null;
  cover_image_url?: string | null;
  version: number;
  report_count: number;
  created_at: string;
  updated_at: string;
} & Partial<StoredPreferences>;

export type PackTemplate = PackTemplateSummary & { reports: string[] };

export type PackComment = {
  id?: number;
  report_key: string | null;
  body: string;
  display: CommentDisplay;
};

export type PackAttachment = {
  id: number;
  file_url: string;
  file_name: string;
  content_type: string;
  byte_size: number;
};

export type ReportPack = {
  id: number;
  name: string;
  description: string | null;
  access: PackAccess;
  template_id: number | null;
  period_preset: string | null;
  period_from: string;
  period_to: string;
  status: PackStatus;
  generation_status: GenerationStatus;
  generation_error: string | null;
  orientation: Orientation;
  negative_format: NegativeFormat;
  currency: string;
  cover_enabled: 0 | 1;
  cover_title: string | null;
  cover_subtitle: string | null;
  cover_image_url: string | null;
  include_toc: 0 | 1;
  toc_style: TocStyle;
  disclaimer_text: string | null;
  pdf_url: string | null;
  pdf_page_count: number | null;
  pdf_generated_at: string | null;
  version: number;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  reports: string[];
  comments: PackComment[];
  attachments: PackAttachment[];
  report_count?: number;
} & Partial<StoredPreferences>;

export type PackListItem = Omit<
  ReportPack,
  "reports" | "comments" | "attachments"
>;

export type TemplateInput = {
  name: string;
  description?: string | null;
  access?: TemplateAccess;
  orientation?: Orientation;
  negative_format?: NegativeFormat;
  disclaimer_text?: string | null;
  disclaimer_file_url?: string | null;
  cover_image_url?: string | null;
  reports: string[];
  version?: number;
} & Partial<Preferences>;

export type PackInput = {
  name: string;
  description?: string | null;
  template_id?: number | null;
  period_preset?: string | null;
  period_from: string;
  period_to: string;
  orientation?: Orientation;
  negative_format?: NegativeFormat;
  cover_enabled?: boolean;
  cover_title?: string | null;
  cover_subtitle?: string | null;
  cover_image_url?: string | null;
  include_toc?: boolean;
  toc_style?: TocStyle;
  disclaimer_text?: string | null;
  reports: string[];
  comments?: Array<Pick<PackComment, "report_key" | "body" | "display">>;
  version?: number;
} & Partial<Preferences>;

type Envelope<T> = { success?: boolean; message?: string; data?: T };

function unwrap<T>(payload: Envelope<T> | undefined, fallback: string): T {
  if (!payload?.data) {
    throw new Error(payload?.message || fallback);
  }
  return payload.data;
}

const packUrl = (id: number, suffix = "") =>
  `${apiRoutes.reporting.packs}/${id}${suffix}`;
const templateUrl = (id: number, suffix = "") =>
  `${apiRoutes.reporting.packTemplates}/${id}${suffix}`;

export type PackCatalogue = {
  reports: CatalogueEntry[];
  defaultLogoUrl: string | null;
  starterTemplates: StarterTemplate[];
};

export async function fetchCatalogue(): Promise<PackCatalogue> {
  const response = await api.get<Envelope<PackCatalogue>>(
    apiRoutes.reporting.packCatalogue,
  );
  const data = unwrap(response.data, "Could not load the report list.");

  return {
    reports: data.reports ?? [],
    defaultLogoUrl: data.defaultLogoUrl ?? null,
    starterTemplates: data.starterTemplates ?? [],
  };
}

export async function uploadCoverImage(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("file", file);

  const response = await api.post<Envelope<{ url: string }>>(
    apiRoutes.reporting.packCoverImage,
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return unwrap(response.data, "Could not upload that logo.");
}

export async function fetchTemplates(): Promise<{
  templates: PackTemplateSummary[];
}> {
  const response = await api.get<
    Envelope<{
      templates: PackTemplateSummary[];
    }>
  >(apiRoutes.reporting.packTemplates);
  return unwrap(response.data, "Could not load the templates.");
}

export async function fetchTemplate(id: number): Promise<PackTemplate> {
  const response = await api.get<Envelope<PackTemplate>>(templateUrl(id));
  return unwrap(response.data, "Could not load that template.");
}

export async function createTemplate(
  input: TemplateInput,
): Promise<PackTemplate> {
  const response = await api.post<Envelope<PackTemplate>>(
    apiRoutes.reporting.packTemplates,
    input,
  );
  return unwrap(response.data, "Could not create the template.");
}

export async function updateTemplate(
  id: number,
  input: TemplateInput,
): Promise<PackTemplate> {
  const response = await api.put<Envelope<PackTemplate>>(
    templateUrl(id),
    input,
  );
  return unwrap(response.data, "Could not save the template.");
}

export async function duplicateTemplate(id: number): Promise<PackTemplate> {
  const response = await api.post<Envelope<PackTemplate>>(
    templateUrl(id, "/duplicate"),
  );
  return unwrap(response.data, "Could not duplicate the template.");
}

export async function deleteTemplate(id: number): Promise<void> {
  await api.delete(templateUrl(id));
}

export async function fetchPacks(
  params: { status?: PackStatus; page?: number; limit?: number } = {},
): Promise<{
  packs: PackListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}> {
  const response = await api.get<
    Envelope<{
      packs: PackListItem[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
      };
    }>
  >(apiRoutes.reporting.packs, { params });
  return unwrap(response.data, "Could not load your report packs.");
}

export async function fetchPack(id: number): Promise<ReportPack> {
  const response = await api.get<Envelope<ReportPack>>(packUrl(id));
  return unwrap(response.data, "Could not load that report pack.");
}

export async function createPack(input: PackInput): Promise<ReportPack> {
  const response = await api.post<Envelope<ReportPack>>(
    apiRoutes.reporting.packs,
    input,
  );
  return unwrap(response.data, "Could not create the report pack.");
}

export async function updatePack(
  id: number,
  input: PackInput,
): Promise<ReportPack> {
  const response = await api.put<Envelope<ReportPack>>(packUrl(id), input);
  return unwrap(response.data, "Could not save the report pack.");
}

export async function duplicatePack(id: number): Promise<ReportPack> {
  const response = await api.post<Envelope<ReportPack>>(
    packUrl(id, "/duplicate"),
  );
  return unwrap(response.data, "Could not duplicate the report pack.");
}

export async function changePackStatus(
  id: number,
  status: PackStatus,
): Promise<ReportPack> {
  const response = await api.patch<Envelope<ReportPack>>(
    packUrl(id, "/status"),
    { status },
  );
  return unwrap(response.data, "Could not change the status.");
}

export async function deletePack(id: number): Promise<void> {
  await api.delete(packUrl(id));
}

export async function generatePack(
  id: number,
  publish = false,
): Promise<{ id: number; generation_status: GenerationStatus }> {
  const response = await api.post<
    Envelope<{ id: number; generation_status: GenerationStatus }>
  >(packUrl(id, "/generate"), {
    publish,
  });
  return unwrap(response.data, "Could not start generating the pack.");
}

export type GenerationState = {
  id: number;
  status: PackStatus;
  generation_status: GenerationStatus;
  generation_error: string | null;
  pdf_page_count: number | null;
  pdf_generated_at: string | null;
};

export async function fetchGenerationState(
  id: number,
): Promise<GenerationState> {
  const response = await api.get<Envelope<GenerationState>>(
    packUrl(id, "/generation"),
  );
  return unwrap(response.data, "Could not check the pack status.");
}

export async function fetchDownloadUrl(
  id: number,
): Promise<{ url: string; expires_in: number; page_count: number | null }> {
  const response = await api.get<
    Envelope<{ url: string; expires_in: number; page_count: number | null }>
  >(packUrl(id, "/download"));
  return unwrap(response.data, "Could not get the download link.");
}

export async function uploadAttachment(
  id: number,
  file: File,
): Promise<ReportPack> {
  const form = new FormData();
  form.append("file", file);

  const response = await api.post<Envelope<ReportPack>>(
    packUrl(id, "/attachments"),
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return unwrap(response.data, "Could not attach that file.");
}

export async function removeAttachment(
  id: number,
  attachmentId: number,
): Promise<ReportPack> {
  const response = await api.delete<Envelope<ReportPack>>(
    packUrl(id, `/attachments/${attachmentId}`),
  );
  return unwrap(response.data, "Could not remove that attachment.");
}

export function isGenerating(
  state: Pick<ReportPack, "generation_status">,
): boolean {
  return (
    state.generation_status === "queued" ||
    state.generation_status === "running"
  );
}

export function canEdit(
  pack: Pick<ReportPack, "status" | "generation_status">,
): boolean {
  return pack.status === "draft" && !isGenerating(pack);
}

export function isPreviewStale(
  pack: Pick<ReportPack, "pdf_url" | "pdf_generated_at" | "updated_at">,
): boolean {
  if (!pack.pdf_url || !pack.pdf_generated_at) return true;
  const generated = Date.parse(pack.pdf_generated_at);
  const updated = Date.parse(pack.updated_at);
  if (Number.isNaN(generated) || Number.isNaN(updated)) return false;
  return updated > generated;
}

export type PackStep =
  "save" | "preview" | "regenerate" | "approve" | "publish" | "published";

export function nextStep(
  pack: Pick<
    ReportPack,
    "status" | "pdf_url" | "pdf_generated_at" | "updated_at"
  > | null,
  dirty: boolean,
): PackStep {
  if (!pack) return "save";
  if (pack.status === "published") return "published";
  if (pack.status === "approved") return "publish";
  if (dirty) return "save";
  if (!pack.pdf_url) return "preview";
  if (isPreviewStale(pack)) return "regenerate";
  return "approve";
}

export function statusLabel(status: PackStatus): string {
  if (status === "draft") return "Draft";
  if (status === "approved") return "Approved";
  return "Published";
}

export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (!Array.isArray(items)) {
    return [];
  }
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function pruneOrphanedComments(draft: PackInput): PackInput {
  const keys = new Set(draft.reports);
  const comments = draft.comments ?? [];
  const kept = comments.filter(
    (comment) => comment.report_key === null || keys.has(comment.report_key),
  );

  return kept.length === comments.length ? draft : { ...draft, comments: kept };
}

export function toPackInput(pack: ReportPack): PackInput {
  return {
    name: pack.name,
    description: pack.description,
    template_id: pack.template_id,
    period_preset: pack.period_preset,
    period_from: pack.period_from,
    period_to: pack.period_to,
    orientation: pack.orientation,
    negative_format: pack.negative_format,
    cover_enabled: pack.cover_enabled === 1,
    cover_title: pack.cover_title,
    cover_subtitle: pack.cover_subtitle,
    cover_image_url: pack.cover_image_url,
    include_toc: pack.include_toc === 1,
    toc_style: pack.toc_style,
    disclaimer_text: pack.disclaimer_text,
    reports: pack.reports,
    comments: pack.comments.map((comment) => ({
      report_key: comment.report_key,
      body: comment.body,
      display: comment.display,
    })),
    version: pack.version,
    ...preferencesFrom(pack),
  };
}

export function fromTemplate(
  template: PackTemplate,
  period: { from: string; to: string; preset?: string },
): PackInput {
  return {
    name: `${template.name} — ${period.preset || period.from}`.slice(
      0,
      NAME_MAX,
    ),
    template_id: template.id,
    period_preset: period.preset ?? null,
    period_from: period.from,
    period_to: period.to,
    orientation: template.orientation,
    negative_format: template.negative_format,
    disclaimer_text: template.disclaimer_text,
    cover_image_url: template.cover_image_url ?? null,
    reports: template.reports ?? [],
    cover_enabled: true,
    include_toc: true,
    toc_style: "dotted",
    ...preferencesFrom(template),
  };
}

export function fromStarter(
  starter: StarterTemplate,
  period: { from: string; to: string; preset?: string },
): PackInput {
  return {
    name: `${starter.name} — ${period.preset || period.from}`.slice(
      0,
      NAME_MAX,
    ),
    template_id: null,
    period_preset: period.preset ?? null,
    period_from: period.from,
    period_to: period.to,
    orientation: "portrait",
    negative_format: "brackets",
    reports: starter.reports,
    cover_enabled: true,
    include_toc: true,
    toc_style: "dotted",
    ...DEFAULT_PREFERENCES,
  };
}

export type PreviewPage = {
  key: string;
  kind: "cover" | "contents" | "section" | "commentary" | "disclaimer";
  title: string;
  html: string;
};

export type PackPreview = { pages: PreviewPage[]; skipped: string[] };

export async function previewPack(
  input: PackInput,
  packId?: number | null,
): Promise<PackPreview> {
  const response = await api.post<Envelope<PackPreview>>(
    apiRoutes.reporting.packPreview,
    {
      ...input,
      pack_id: packId ?? undefined,
    },
  );
  const data = unwrap(response.data, "Could not build the preview.");
  return { pages: data.pages ?? [], skipped: data.skipped ?? [] };
}

export async function sendPack(
  id: number,
  payload: { recipients: string[]; note?: string },
): Promise<{ id: number; recipients: string[]; attached: boolean }> {
  const response = await api.post<
    Envelope<{ id: number; recipients: string[]; attached: boolean }>
  >(packUrl(id, "/send"), payload);
  return unwrap(response.data, "Could not send the pack.");
}

export const CUSTOM_PERIOD: ReportPeriod = "Custom range";

export function presetRange(preset: ReportPeriod): {
  from: string;
  to: string;
} {
  const shape = periodShape(preset, null);
  return {
    from: toIsoDate(shape.current.from),
    to: toIsoDate(shape.current.to),
  };
}

export function formatRangeLabel(from: string, to: string): string {
  if (!from || !to) return "";
  return spanLabel({ from: parseISO(from), to: parseISO(to) });
}

export type FormattingValue = Preferences & {
  negative_format: NegativeFormat;
  orientation: Orientation;
};

export function formattingOf(
  row: Partial<Preferences> & {
    negative_format?: NegativeFormat;
    orientation?: Orientation;
  },
): FormattingValue {
  return {
    ...preferencesFrom(row),
    negative_format: row.negative_format ?? "brackets",
    orientation: row.orientation ?? "portrait",
  };
}
