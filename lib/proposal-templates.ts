/**
 * Proposal templates — what each kind stores, the request bodies, and the
 * calls (contract: sole-ocr docs/PROPOSAL_TEMPLATES_API.md). Every write is
 * encrypted; the backend reads it with getRequestPayload.
 *
 * The content shapes match what the proposal builder already keeps, so
 * applying a template to a proposal is a straight copy:
 *   INTRODUCTION → lexical_content { blocks }        (IntroductionData.blocks)
 *   TERMS        → html_content                      (TermsData.body)
 *   THANK_YOU    → lexical_content { title, message, button_label, button_url } (ThankYouData)
 *   PROPOSAL     → snapshot_data, saved from the builder ("Save as template")
 * Every kind also sends html_content: the list cards and anything that only
 * reads HTML keep working.
 */

import type { QueryClient } from "@tanstack/react-query";

import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import {
  SAMPLE_MERGE_VALUES,
  TEMPLATE_KINDS,
  blocksForSave,
  initialIntroBlocks,
  isBlankHtml,
  mapTemplate,
  newServiceLine,
  previewFromTemplate,
  recalculateLine,
  renderMergeTags,
  type ApiTemplate,
  type ClientSnapshot,
  type EmailFile,
  type IntroBlock,
  type EmailCategory,
  type PreviewData,
  type ProposalTemplate,
  type TemplateKind,
  type ThankYouData,
} from "@/lib/proposals";
import api from "@/utils/axiosInstance";

export const TEMPLATE_NAME_MAX = 100;
/** Whole-proposal templates may use the whole name column. */
export const PROPOSAL_TEMPLATE_NAME_MAX = 191;
export const TEMPLATE_DESCRIPTION_MAX = 1000;

/** URL slug ↔ kind, and the copy each kind's screens use. */
export const TEMPLATE_KIND_META: Record<
  TemplateKind,
  { slug: string; label: string; singular: string; description: string }
> = {
  PROPOSAL: {
    slug: "proposal",
    label: "Proposal",
    singular: "Proposal",
    description: "Ready-made proposals: introduction, services and pricing, terms and thank-you in one template.",
  },
  INTRODUCTION: {
    slug: "introduction",
    label: "Introduction",
    singular: "Introduction",
    description: "The opening message of a proposal. Reuse it so every proposal starts the same way.",
  },
  TERMS: {
    slug: "terms",
    label: "Terms & Sign",
    singular: "Terms",
    description: "The terms of engagement the client reads and signs.",
  },
  THANK_YOU: {
    slug: "thank-you",
    label: "Thank You",
    singular: "Thank you",
    description: "The last page the client sees after signing: a heading, a message and an optional button.",
  },
  EMAIL: {
    slug: "email",
    label: "Email",
    singular: "Email",
    description: "The emails a proposal sends: with the proposal, as a reminder, and a thank-you once accepted.",
  },
};

export const SUBJECT_MAX = 255;

export function kindFromSlug(slug: string | null | undefined): TemplateKind {
  const match = (Object.keys(TEMPLATE_KIND_META) as TemplateKind[]).find(
    (kind) => TEMPLATE_KIND_META[kind].slug === slug,
  );
  return match ?? "PROPOSAL";
}

/** The kinds edited on the template editor screen; proposals are built in the builder. */
export type SectionKind = Exclude<TemplateKind, "PROPOSAL">;

export const templatesListUrl = (kind: TemplateKind) =>
  kind === "PROPOSAL" ? "/proposals/templates" : `/proposals/templates?type=${TEMPLATE_KIND_META[kind].slug}`;

/** Whole-proposal templates are built in the proposal builder, in template mode. */
export const proposalTemplateBuilderUrl = (id?: string) =>
  `/proposals/new?mode=template${id ? `&template_id=${id}` : ""}`;

export const templateEditorUrl = (kind: SectionKind, id?: string) =>
  `/proposals/templates/editor?type=${TEMPLATE_KIND_META[kind].slug}${id ? `&id=${id}` : ""}`;

/** Every kind previews full-page, in the same tab, as the client will see it. */
export const templatePreviewUrl = (id: string) => `/proposals/templates/${id}/preview`;

/* ------------------------------------------------------------------ *
 * Preview — a section template as the client receives it
 * ------------------------------------------------------------------ */

/** The client a template preview is addressed to — the same sample data its merge fields read as. */
export const SAMPLE_CLIENT: ClientSnapshot = {
  id: "",
  contact_id: "",
  name: SAMPLE_MERGE_VALUES.contact_addressee,
  email: SAMPLE_MERGE_VALUES.contact_email,
  currency: "AUD",
  business_name: "",
  mobile_no: SAMPLE_MERGE_VALUES.contact_phone_number,
  ABN: SAMPLE_MERGE_VALUES.client_company_number,
  company_type: "business",
  address: SAMPLE_MERGE_VALUES.client_address,
};

/** The page of the proposal (or the email) each section template is shown as. */
export const SECTION_PREVIEW_TAB = {
  INTRODUCTION: "Introduction",
  TERMS: "Terms",
  THANK_YOU: "Thank You",
  EMAIL: "Email",
} as const satisfies Record<SectionKind, string>;

/**
 * A sample proposal with this one section filled from the template, merge
 * fields read as sample data — so the section template's preview is the
 * very page (or email) a client receives, drawn by the same components.
 */
export function previewFromSectionTemplate(template: ProposalTemplate, business: PreviewData["business"]): PreviewData {
  const base = previewFromTemplate({ ...template, snapshot: {} }, business);
  const form = formFromTemplate(template);
  const resolve = (text: string) => renderMergeTags(text, SAMPLE_MERGE_VALUES);
  const preview: PreviewData = {
    ...base,
    general: { ...base.general, proposal_name: SAMPLE_MERGE_VALUES.proposal_name },
    client: SAMPLE_CLIENT,
  };

  switch (template.type) {
    case "INTRODUCTION":
      return {
        ...preview,
        introduction: {
          ...base.introduction,
          blocks: form.blocks.map((block) =>
            block.type === "text" ? { ...block, editorHtml: resolve(block.editorHtml ?? "") } : block,
          ),
        },
      };
    case "TERMS":
      return { ...preview, terms: { ...base.terms, body: resolve(form.body) } };
    case "THANK_YOU":
      return {
        ...preview,
        thankYou: { ...form.thankYou, title: resolve(form.thankYou.title), message: resolve(form.thankYou.message) },
      };
    case "EMAIL":
      return {
        ...preview,
        emailKind: template.emailCategory === "PROPOSAL_REMINDER" ? "reminder" : "proposal",
        // A sample line, so the email's total card shows an amount as a real one does.
        services: [recalculateLine({ ...newServiceLine(10), description: "Sample service", price: 1200 })],
        notification: {
          ...base.notification,
          send_notification: true,
          cc_emails: [],
          subject: resolve(form.subject),
          email_body: resolve(form.body),
          attachments: form.attachments,
        },
      };
    default:
      return preview;
  }
}

/* ------------------------------------------------------------------ *
 * Content
 * ------------------------------------------------------------------ */

export type TemplateForm = {
  name: string;
  description: string;
  /** INTRODUCTION */
  blocks: IntroBlock[];
  /** TERMS */
  body: string;
  /** THANK_YOU */
  thankYou: ThankYouData;
  /** EMAIL — its body is `body` */
  subject: string;
  emailCategory: EmailCategory;
  attachments: EmailFile[];
};

export const EMPTY_THANK_YOU: ThankYouData = { title: "", message: "", button_label: "", button_url: "" };

export function emptyTemplateForm(): TemplateForm {
  return {
    name: "",
    description: "",
    blocks: initialIntroBlocks(),
    body: "",
    thankYou: { ...EMPTY_THANK_YOU },
    subject: "",
    emailCategory: "PROPOSAL_SENT",
    attachments: [],
  };
}

const asText = (value: unknown) => (typeof value === "string" ? value : "");

/** A saved template, read back into the editor. Anything unexpected reads as empty. */
export function formFromTemplate(template: ProposalTemplate): TemplateForm {
  const content = (template.content ?? {}) as Record<string, unknown>;
  return {
    name: template.name,
    description: template.description,
    blocks: Array.isArray(content.blocks)
      ? initialIntroBlocks(content.blocks)
      : // Older introduction templates are a single HTML document.
        initialIntroBlocks([{ id: "", type: "text", editorHtml: template.html }]),
    body: template.html,
    thankYou: {
      title: asText(content.title),
      message: asText(content.message),
      button_label: asText(content.button_label),
      button_url: asText(content.button_url),
    },
    subject: template.subject ?? "",
    emailCategory: template.emailCategory ?? "PROPOSAL_SENT",
    attachments: template.attachments ?? [],
  };
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const blockHasContent = (block: IntroBlock) =>
  block.type === "text"
    ? !isBlankHtml(block.editorHtml)
    : block.type === "image"
      ? Boolean(block.imageUrl)
      : block.type === "video"
        ? Boolean(block.videoUrl)
        : false;

/** Empty blocks and dangling page breaks aren't worth saving; the first text block always is. */
export function blocksWorthSaving(blocks: IntroBlock[]): IntroBlock[] {
  const kept = blocks.filter((block, index) => index === 0 || block.type === "page_break" || blockHasContent(block));
  // A page break with nothing after it, or straight after another, leads nowhere.
  return kept.filter(
    (block, index) =>
      block.type !== "page_break" || (index < kept.length - 1 && kept[index + 1].type !== "page_break"),
  );
}

/** What each kind needs before it can be saved. */
export function templateIssues(
  kind: SectionKind,
  form: TemplateForm,
): { name?: string; content?: string; subject?: string } {
  const issues: { name?: string; content?: string; subject?: string } = {};
  const name = form.name.trim();
  if (!name) issues.name = "Template name is required.";
  else if (name.length > TEMPLATE_NAME_MAX) issues.name = `Name can be at most ${TEMPLATE_NAME_MAX} characters.`;

  if (kind === "EMAIL") {
    const subject = form.subject.trim();
    if (!subject) issues.subject = "Subject is required.";
    else if (subject.length > SUBJECT_MAX) issues.subject = `Subject can be at most ${SUBJECT_MAX} characters.`;
  }

  const hasContent =
    kind === "INTRODUCTION"
      ? form.blocks.some(blockHasContent)
      : kind === "TERMS" || kind === "EMAIL"
        ? !isBlankHtml(form.body)
        : Boolean(form.thankYou.title.trim() || form.thankYou.message.trim());
  if (!hasContent) issues.content = "Add some content to the template.";
  return issues;
}

/** The content fields of the request body, per kind. */
export function templateContent(kind: SectionKind, form: TemplateForm): {
  lexical_content: unknown;
  html_content: string;
} {
  if (kind === "INTRODUCTION") {
    const blocks = blocksForSave(blocksWorthSaving(form.blocks)).map((block, index) => ({
      ...block,
      isPrimary: index === 0 && block.type === "text",
    }));
    const firstText = blocks.find((block) => block.type === "text" && !isBlankHtml(block.editorHtml));
    return { lexical_content: { blocks }, html_content: firstText?.editorHtml || "<p></p>" };
  }
  if (kind === "TERMS" || kind === "EMAIL") {
    return { lexical_content: null, html_content: form.body };
  }
  const thankYou = {
    title: form.thankYou.title.trim(),
    message: form.thankYou.message.trim(),
    button_label: form.thankYou.button_label.trim(),
    button_url: form.thankYou.button_url.trim(),
  };
  const html = [
    thankYou.title && `<h2>${escapeHtml(thankYou.title)}</h2>`,
    thankYou.message && `<p>${escapeHtml(thankYou.message)}</p>`,
  ]
    .filter(Boolean)
    .join("");
  return { lexical_content: thankYou, html_content: html || "<p></p>" };
}

/** `POST /proposal/templates` (create) and `PUT /proposal/templates/:id` (edit) bodies. */
export function templatePayload(kind: SectionKind, form: TemplateForm, mode: "create" | "update") {
  return {
    ...(mode === "create" ? { template_type: kind } : {}),
    template_name: form.name.trim(),
    description: form.description.trim() || null,
    ...(kind === "EMAIL"
      ? { subject: form.subject.trim(), email_category: form.emailCategory, attachments: form.attachments }
      : {}),
    ...templateContent(kind, form),
  };
}

/* ------------------------------------------------------------------ *
 * Calls — all writes encrypted, like every other proposal call
 * ------------------------------------------------------------------ */

type ApiTemplateResponse = { success?: boolean; data?: { id?: string | number } };

const idOf = (response: { data?: ApiTemplateResponse }, fallback = "") => String(response.data?.data?.id ?? fallback);

export async function createTemplateApi(kind: SectionKind, form: TemplateForm): Promise<string> {
  const response = await api.post<ApiTemplateResponse>(
    apiRoutes.proposal.templates,
    buildEncryptedRequestBody(templatePayload(kind, form, "create")),
  );
  return idOf(response);
}

/** `GET /proposal/templates/:id` — one template, yours or system, with its full content. */
export async function fetchTemplateApi(id: string): Promise<ProposalTemplate> {
  const response = await api.get<{ success?: boolean; data?: ApiTemplate }>(apiRoutes.proposal.template(id));
  const raw = response.data?.data;
  if (!raw) throw new Error("Template not found.");
  const type = TEMPLATE_KINDS.find((kind) => kind.type === raw.template_type)?.type ?? "PROPOSAL";
  return mapTemplate(raw, type);
}

/**
 * One template's full content, cached for the session: opening the same
 * template again — preview, editor, a step's dropdown — reads the cache and
 * makes no request. The cache is refreshed only when the template changes
 * here (`refreshTemplate` after an edit or rename, `forgetTemplate` after a
 * delete), which is the only way it can go stale in this app.
 */
export const templateQueryKey = (id: string | null) => ["proposal-template", id] as const;

export const templateQueryOptions = (id: string) => ({
  queryKey: templateQueryKey(id),
  queryFn: () => fetchTemplateApi(id),
  staleTime: Infinity,
  retry: false as const,
});

/** After an edit or rename: the cached copy is out of date. */
export const refreshTemplate = (queryClient: QueryClient, id: string) =>
  queryClient.invalidateQueries({ queryKey: templateQueryKey(id) });

/** After a delete: drop the cached copy. */
export const forgetTemplate = (queryClient: QueryClient, id: string) =>
  queryClient.removeQueries({ queryKey: templateQueryKey(id) });

/** `PUT /proposal/templates/:id` — one of your own. */
export async function updateTemplateApi(id: string, kind: SectionKind, form: TemplateForm): Promise<void> {
  await api.put(apiRoutes.proposal.template(id), buildEncryptedRequestBody(templatePayload(kind, form, "update")));
}

/** `PUT /proposal/templates/:id` with the name alone — works for every kind. */
export async function renameTemplateApi(id: string, name: string): Promise<void> {
  await api.put(apiRoutes.proposal.template(id), buildEncryptedRequestBody({ template_name: name.trim() }));
}

/** `POST /proposal/templates/:id/duplicate` — an editable copy of yours or a system one. */
export async function duplicateTemplateApi(id: string): Promise<string> {
  const response = await api.post<ApiTemplateResponse>(
    apiRoutes.proposal.templateDuplicate(id),
    buildEncryptedRequestBody({}),
  );
  return idOf(response);
}

/** `DELETE /proposal/templates/:id` — your own only; proposals made from it keep their content. */
export async function deleteTemplateApi(id: string): Promise<void> {
  await api.delete(apiRoutes.proposal.template(id));
}

/** An image for an introduction template — there's no proposal yet, so none is sent. */
export async function uploadTemplateImageApi(file: File): Promise<string> {
  const response = await api.post<{ success?: boolean; data?: string }>(
    apiRoutes.proposal.contentUpload,
    buildEncryptedRequestBody({}, { file }),
  );
  const url = response.data?.data;
  if (!url) throw new Error(`Failed to upload ${file.name}`);
  return url;
}

/* ------------------------------------------------------------------ *
 * Email attachments — as sole-pm's: uploaded straight away, then listed
 * ------------------------------------------------------------------ */

export const MAX_EMAIL_FILES = 10;
/** In total: email encoding adds a third, and inboxes refuse much bigger mail. The backend allows the same. */
export const MAX_EMAIL_BYTES = 10 * 1024 * 1024;
/** What the backend accepts (POST /proposal/email-attachments/upload). */
export const EMAIL_FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.rtf,.jpg,.jpeg,.png,.gif,.webp";

/** Why these files can't be added (null = fine): a type not allowed, too many, over 10 MB together, or attached already. */
export function attachmentProblem(current: EmailFile[], files: { name: string; size: number }[]): string | null {
  const allowed = EMAIL_FILE_ACCEPT.split(",");
  const wrongType = files.find((file) => !allowed.includes(`.${file.name.split(".").pop()?.toLowerCase()}`));
  if (wrongType) return `“${wrongType.name}” can’t be attached — use a PDF, Office document, text file or image.`;
  if (current.length + files.length > MAX_EMAIL_FILES) return `You can attach up to ${MAX_EMAIL_FILES} files.`;
  const same = (a: { name: string; size?: number | null }, b: { name: string; size?: number | null }) =>
    a.name === b.name && (a.size ?? null) === (b.size ?? null);
  const twice = files.find(
    (file, index) => current.some((other) => same(other, file)) || files.findIndex((other) => same(other, file)) !== index,
  );
  if (twice) return `“${twice.name}” is already attached.`;
  const total = [...current.map((file) => file.size ?? 0), ...files.map((file) => file.size)].reduce((sum, n) => sum + n, 0);
  if (total > MAX_EMAIL_BYTES) return "Attachments can be up to 10 MB in total, or the client’s inbox may refuse the email.";
  return null;
}

export const formatFileSize = (bytes?: number | null) =>
  bytes == null ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Upload one file for a proposal email; returns it ready to list on a template or proposal. */
export async function uploadEmailAttachmentApi(file: File): Promise<EmailFile> {
  const response = await api.post<{ success?: boolean; data?: Partial<EmailFile> }>(
    apiRoutes.proposal.emailAttachmentUpload,
    buildEncryptedRequestBody({}, { file }),
  );
  const uploaded = response.data?.data;
  if (!uploaded?.url) throw new Error(`Could not upload ${file.name}`);
  return {
    name: uploaded.name || file.name,
    url: uploaded.url,
    size: uploaded.size ?? file.size,
    content_type: uploaded.content_type ?? (file.type || null),
  };
}

export function renameIssue(name: string, kind: TemplateKind): string | null {
  const trimmed = name.trim();
  const max = kind === "PROPOSAL" ? PROPOSAL_TEMPLATE_NAME_MAX : TEMPLATE_NAME_MAX;
  if (!trimmed) return "Enter a name.";
  if (trimmed.length > max) return `Name can be at most ${max} characters.`;
  return null;
}
