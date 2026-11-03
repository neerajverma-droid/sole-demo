/**
 * Real invoice/quote layout templates for the Sales settings Styling tabs.
 *
 * Ported from sole-webapp's `Branding.js` (`fetchTemplateList`,
 * `categorizeTemplates`, `fetchTemplateDetails`) — a flat `/template/list`
 * response split by `category_name` (GEN, CLASSIC, NDIS) and `type`
 * (invoice, quote). GEN and CLASSIC both feed the same `invoiceStyle` /
 * `quoteStyle` slot; NDIS is its own slot, offered only to NDIS businesses.
 *
 * Unlike the fictional `lib/document-styles.ts` catalog the Styling tabs
 * previously rendered, a `SalesTemplate` here carries a real numeric id and a
 * server thumbnail rather than a locally-drawn preview.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";

export type SalesTemplateGroup = "General" | "Classic" | "NDIS";
export type SalesTemplateKind = "invoice" | "quote";

export type SalesTemplate = {
  id: string;
  name: string;
  group: SalesTemplateGroup;
  kind: SalesTemplateKind;
  /** Server thumbnail when the API has one; falls back to a static sample by group/kind. */
  image: string;
  isDefault: boolean;
};

type ApiTemplate = {
  id: number | string;
  name?: string;
  category_name?: string;
  type?: string;
  thumbnail?: string;
  is_default?: number | boolean;
};

type ApiTemplateListResponse = {
  success: boolean;
  data?: ApiTemplate[] | Record<string, ApiTemplate[]>;
};

function fallbackImage(template: ApiTemplate, index: number): string {
  if (template.thumbnail) return template.thumbnail;
  if (template.category_name === "NDIS") {
    return `/images/template/NDISTemplate-${(index % 6) + 1}.jpg`;
  }
  if (template.type === "quote") {
    return `/images/template/quote-${(Number(template.id) % 6) + 1}.png`;
  }
  return `/images/template/Invoice-${(index % 6) + 1}.jpg`;
}

function toGroup(categoryName: string | undefined): SalesTemplateGroup | null {
  if (categoryName === "GEN") return "General";
  if (categoryName === "CLASSIC") return "Classic";
  if (categoryName === "NDIS") return "NDIS";
  return null;
}

function mapTemplate(raw: ApiTemplate, index: number): SalesTemplate | null {
  const group = toGroup(raw.category_name);
  const kind: SalesTemplateKind = raw.type === "quote" ? "quote" : "invoice";
  if (!group) return null;
  return {
    id: String(raw.id),
    name: raw.name?.trim() || "Template",
    group,
    kind,
    image: fallbackImage(raw, index),
    isDefault: raw.is_default === 1 || raw.is_default === true,
  };
}

/** Every invoice and quote template the account can choose from, across all three groups. */
export async function fetchSalesTemplates(): Promise<SalesTemplate[]> {
  const response = await api.get<ApiTemplateListResponse>(
    apiRoutes.templates.getList,
  );
  const data = response.data?.data;
  if (!data) return [];

  const raw: ApiTemplate[] = Array.isArray(data)
    ? data
    : Object.values(data).flat();

  return raw
    .map((template, index) => mapTemplate(template, index))
    .filter((template): template is SalesTemplate => template !== null);
}

export function templatesFor(
  templates: SalesTemplate[],
  group: SalesTemplateGroup,
  kind: SalesTemplateKind,
): SalesTemplate[] {
  return templates.filter((t) => t.group === group && t.kind === kind);
}

/** Server-rendered HTML preview — same endpoints Branding.js's "Preview" button hits. */
export async function fetchTemplatePreviewHtml(
  templateId: string,
  kind: SalesTemplateKind,
): Promise<string> {
  const url =
    kind === "invoice"
      ? `${apiRoutes.templates.getDetails}/${templateId}/details?invoiceId=&useDemo=false`
      : `${apiRoutes.quote.preview(templateId)}?quoteId=`;

  const response = await api.get<{
    success: boolean;
    data?: { html?: string } | string;
    html?: string;
  }>(url);

  const result = response.data;
  const html =
    (typeof result?.data === "object" ? result.data?.html : undefined) ??
    result?.html ??
    (typeof result?.data === "string" ? result.data : undefined);

  return html || "<p>Template preview not available</p>";
}
