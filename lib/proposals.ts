/**
 * Proposals — a client-facing document built step by step (who it's for,
 * services, payment, an introduction, documents, terms, the email and the
 * thank-you screen) and sent as one shareable link.
 *
 * Ported from sole-webapp's `pages/proposal/*` and `components/Proposal/*`.
 * Every builder step is stored server-side exactly as sole-webapp stores it —
 * the same snake_case `section_data` blobs — so a proposal (or template)
 * started in either app opens cleanly in the other.
 *
 * Every write goes through `buildEncryptedRequestBody`. sole-ocr's proposal
 * controller decrypts a string `data` and still accepts sole-webapp's plain
 * bodies.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";

/* ------------------------------------------------------------------ *
 * Steps
 * ------------------------------------------------------------------ */

export const PROPOSAL_STEPS = [
  "General",
  "Services",
  "Payments",
  "Introduction",
  "Add. Docs.",
  "Terms & Sign",
  "Notification",
  "Thank You",
] as const;

export type ProposalStep = (typeof PROPOSAL_STEPS)[number];

export const PROPOSAL_STEP_KEYS: Record<ProposalStep, string> = {
  General: "GENERAL",
  Services: "SERVICES",
  Payments: "PAYMENTS",
  Introduction: "INTRODUCTION",
  "Add. Docs.": "ADD_DOCS",
  "Terms & Sign": "TERMS_SIGN",
  Notification: "NOTIFICATION",
  "Thank You": "THANK_YOU",
};

const STEP_BY_KEY = Object.fromEntries(
  Object.entries(PROPOSAL_STEP_KEYS).map(([label, key]) => [key, label]),
) as Record<string, ProposalStep>;

export function stepFromKey(key: string | null | undefined): ProposalStep | null {
  return key ? (STEP_BY_KEY[key] ?? null) : null;
}

export function nextStep(step: ProposalStep): ProposalStep | null {
  const index = PROPOSAL_STEPS.indexOf(step);
  return index >= 0 && index < PROPOSAL_STEPS.length - 1
    ? PROPOSAL_STEPS[index + 1]
    : null;
}

export const PROPOSAL_STAGES: {
  name: string;
  steps: ProposalStep[];
}[] = [
  { name: "Agreement", steps: ["General", "Services", "Payments"] },
  {
    name: "Proposal",
    steps: [
      "Introduction",
      "Add. Docs.",
      "Terms & Sign",
      "Notification",
      "Thank You",
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Status and payment methods
 * ------------------------------------------------------------------ */

export const PROPOSAL_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "rejected",
  "lost",
  "expired",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export function normaliseProposalStatus(value: unknown): ProposalStatus {
  const status = String(value ?? "draft").toLowerCase();
  return (PROPOSAL_STATUSES as readonly string[]).includes(status)
    ? (status as ProposalStatus)
    : "draft";
}

export function proposalStatusLabel(status: ProposalStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export const PAYMENT_METHODS = [
  { value: "manual", label: "Manual payment", requiresStripe: false },
  { value: "stripe", label: "Stripe", requiresStripe: true },
] as const;

export const DEFAULT_PAYMENT_METHOD = "manual";

export function paymentMethodLabel(value: string | null | undefined): string {
  if (!value) return "";
  return PAYMENT_METHODS.find((method) => method.value === value)?.label ?? value;
}

/** A removed method (sole-webapp's old "sole_pay") falls back to the default. */
export function normalisePaymentMethod(value: unknown): string {
  const method = String(value ?? "");
  return PAYMENT_METHODS.some((entry) => entry.value === method)
    ? method
    : DEFAULT_PAYMENT_METHOD;
}

/* ------------------------------------------------------------------ *
 * Builder data — the same shapes sole-webapp stores
 * ------------------------------------------------------------------ */

export const CONTRACT_LENGTHS = [
  { label: "1 Month", value: "1" },
  { label: "3 Months", value: "3" },
  { label: "6 Months", value: "6" },
  { label: "12 Months", value: "12" },
  { label: "24 Months", value: "24" },
  { label: "36 Months", value: "36" },
  { label: "Custom", value: "custom" },
] as const;

export type ContractStartType = "ON_ACCEPTANCE" | "ON_SPECIFIC_DATE";

export type ProposalGeneral = {
  proposal_name: string;
  client_id: string;
  contact_id: string;
  currency_code: string;
  contract_start_type: ContractStartType;
  contract_start_date: string;
  contract_length: string;
  contract_custom_length: string;
  is_auto_expire: boolean;
  expire_in_days: string;
  notes: string;
};

export const emptyGeneral = (): ProposalGeneral => ({
  proposal_name: "Untitled Proposal",
  client_id: "",
  contact_id: "",
  currency_code: "AUD",
  contract_start_type: "ON_ACCEPTANCE",
  contract_start_date: "",
  contract_length: "1",
  contract_custom_length: "",
  is_auto_expire: false,
  expire_in_days: "30",
  notes: "",
});

/** Who the proposal is addressed to, emailed to and signed by. */
export type ClientSnapshot = {
  id: string;
  contact_id: string;
  name: string;
  email: string;
  currency: string;
  business_name: string;
  mobile_no: string;
  ABN: string;
  company_type: string;
  address: string;
};

export type ServiceLine = {
  description: string;
  quantity: number | string;
  price: number | string;
  discount_percent: number | string;
  discount_amount: number;
  gst_percent: number;
  gst_amount: number;
  amount: number;
  notes?: string;
};

export type PaymentData = {
  payment_required: boolean;
  pay_method: string;
};

export type IntroBlockType = "text" | "image" | "video" | "page_break";

export type IntroBlock = {
  id: string;
  type: IntroBlockType;
  isPrimary?: boolean;
  editorHtml?: string;
  imageUrl?: string;
  imageName?: string;
  imageUploading?: boolean;
  imageInputMode?: "url" | "none";
  videoUrl?: string;
};

export type SignatureSize = "small" | "medium" | "large";

export type IntroSignature = {
  showing: boolean;
  name: string;
  size: SignatureSize;
};

export type IntroductionData = {
  message_from: string;
  blocks: IntroBlock[];
  signature: IntroSignature;
};

export type ProposalDocument = {
  id?: string;
  name: string;
  file_url: string;
  mime_type: string;
  file_size: number | string;
  status: string;
  fields?: unknown[] | null;
};

export type TermsData = {
  title: string;
  body: string;
  require_signature: boolean;
  signer_label: string;
};

export type ThankYouData = {
  title: string;
  message: string;
  button_label: string;
  button_url: string;
};

export type NotificationData = {
  send_notification: boolean;
  message_from: string;
  email_body: string;
  cc_emails: string[];
};

export const DEFAULT_SIGNATURE: IntroSignature = {
  showing: true,
  name: "",
  size: "medium",
};

export const DEFAULT_TERMS: TermsData = {
  title: "Terms & Conditions",
  body: "",
  require_signature: true,
  signer_label: "Client signature",
};

export const DEFAULT_THANK_YOU: ThankYouData = {
  title: "Thank you",
  message: "Thanks for accepting this proposal.",
  button_label: "",
  button_url: "",
};

/** The plain starter email sole-webapp seeds, merge tags resolved at edit time. */
export const DEFAULT_EMAIL_BODY =
  "<p>Hi {{contact_addressee}},</p>" +
  "<p>Thank you for considering {{firm_name}} to support your business and professional service needs. This proposal has been prepared based on our discussion and includes a summary of services and fees.</p>" +
  "<p>If you have any questions or would like changes before signing, feel free to reply directly to this email.</p>" +
  "<p>Thank you!</p>";

export const defaultNotification = (): NotificationData => ({
  send_notification: true,
  message_from: "",
  email_body: DEFAULT_EMAIL_BODY,
  cc_emails: [],
});

export const newBlockId = () => Math.random().toString(36).slice(2);

/** The first block is always the primary text block. */
export function initialIntroBlocks(saved?: unknown): IntroBlock[] {
  if (Array.isArray(saved) && saved.length) {
    return (saved as IntroBlock[]).map((block, index) => ({
      ...block,
      id: block.id || newBlockId(),
      type: block.type || "text",
      isPrimary:
        block.isPrimary ?? (index === 0 && (block.type || "text") === "text"),
    }));
  }
  return [{ id: newBlockId(), type: "text", isPrimary: true, editorHtml: "" }];
}

/** Drops the editor-only flags before a block is saved. */
export function blocksForSave(blocks: IntroBlock[]): IntroBlock[] {
  return blocks.map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ imageUploading, imageInputMode, ...block }) => block,
  );
}

/* ------------------------------------------------------------------ *
 * Raw API shapes
 * ------------------------------------------------------------------ */

type ApiClient = {
  id?: string | number;
  name?: string | null;
  business_name?: string | null;
  email?: string | null;
  mobile_no?: string | null;
  ABN?: string | null;
  company_type?: string | null;
};

type ApiPaymentData = {
  payment_required?: boolean | number | string;
  pay_method?: string | null;
  is_paid?: boolean | number | string;
  paid_method?: string | null;
  paid_at?: string | null;
  stripe_paid_at?: string | null;
};

type ApiStep = {
  step_key?: string;
  label?: string;
  status?: string;
  is_required?: boolean | number;
  summary?: string | null;
  section_data?: Record<string, unknown> | null;
};

type ApiDocument = {
  id?: string | number;
  name?: string | null;
  file_url?: string | null;
  mime_type?: string | null;
  file_size?: number | string | null;
  status?: string | null;
  fields?: unknown[] | null;
};

type ApiService = Partial<Record<keyof ServiceLine, unknown>>;

export type ApiProposal = {
  id: string | number;
  title?: string | null;
  proposal_number?: string | null;
  status?: string | null;
  client_id?: string | number | null;
  client?: ApiClient | null;
  client_snapshot?: Partial<ClientSnapshot> | null;
  currency_code?: string | null;
  service_total?: number | string | null;
  service_total_aud?: number | string | null;
  is_multicurrency?: boolean | number | null;
  exchange_rate?: number | string | null;
  payment_data?: ApiPaymentData | null;
  created_at?: string | null;
  updated_at?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  signature_name?: string | null;
  signed_pdf_url?: string | null;
  current_step?: string | null;
  completion_percent?: number | string | null;
  issue_count?: number | string | null;
  steps?: ApiStep[] | null;
  general_data?: Partial<ProposalGeneral> & Record<string, unknown>;
  services?: ApiService[] | null;
  documents?: ApiDocument[] | null;
  introduction_data?: Partial<IntroductionData> | null;
  terms_data?: Partial<TermsData> | null;
  thank_you_data?: Partial<ThankYouData> | null;
  notification_data?: Partial<NotificationData> | null;
  business?: {
    name?: string | null;
    logo?: string | null;
    bank?: {
      bank_name?: string;
      bsb?: string;
      account_holder?: string;
      account_number?: string;
    } | null;
  } | null;
};

const truthy = (value: unknown) =>
  value === true || value === 1 || value === "1" || value === "true";

const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/* ------------------------------------------------------------------ *
 * Listing
 * ------------------------------------------------------------------ */

export type ProposalPayment = {
  required: boolean;
  method: string;
  paid: boolean;
  paidMethod: string | null;
  paidAt: string | null;
};

export type ProposalRow = {
  id: string;
  title: string;
  clientName: string;
  status: ProposalStatus;
  amount: number;
  currency: string;
  multicurrency: boolean;
  amountAud: number | null;
  payment: ProposalPayment;
  createdAt: string | null;
};

export function mapPayment(raw: ApiPaymentData | null | undefined): ProposalPayment {
  return {
    required: truthy(raw?.payment_required),
    method: normalisePaymentMethod(raw?.pay_method),
    paid: truthy(raw?.is_paid),
    paidMethod: raw?.paid_method ?? null,
    paidAt: raw?.paid_at ?? null,
  };
}

export function proposalClientName(raw: ApiProposal): string {
  return (
    raw.client?.name ||
    raw.client?.business_name ||
    raw.client_snapshot?.name ||
    "No client"
  );
}

export function mapProposalRow(raw: ApiProposal): ProposalRow {
  return {
    id: String(raw.id),
    title: raw.title || "Untitled Proposal",
    clientName: proposalClientName(raw),
    status: normaliseProposalStatus(raw.status),
    amount: num(raw.service_total),
    currency: (raw.currency_code || "AUD").toUpperCase(),
    multicurrency: truthy(raw.is_multicurrency),
    amountAud:
      raw.service_total_aud != null ? num(raw.service_total_aud) : null,
    payment: mapPayment(raw.payment_data),
    createdAt: raw.created_at ?? null,
  };
}

export type ProposalsPage = { proposals: ProposalRow[]; total: number };

export async function fetchProposalsPage(
  page: number,
  pageSize: number,
  search = "",
  status: ProposalStatus | "all" = "all",
): Promise<ProposalsPage> {
  const params: Record<string, string | number> = { page, limit: pageSize };
  if (search.trim()) params.search = search.trim();
  if (status !== "all") params.status = status;

  const response = await api.get<{
    success: boolean;
    data?: {
      rows?: ApiProposal[];
      pagination?: { total?: number };
    };
  }>(apiRoutes.proposal.list, { params });

  const data = response.data?.data;
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return {
    proposals: rows.map(mapProposalRow),
    total: num(data?.pagination?.total, rows.length),
  };
}

/**
 * Locks, as sole-webapp has them: once money has moved a proposal can be
 * neither edited nor deleted; an accepted one can't be edited.
 */
export function proposalLocks(row: Pick<ProposalRow, "status" | "payment">) {
  const paid = row.payment.paid;
  const accepted = row.status === "accepted";
  return {
    lockEdit: paid || accepted,
    lockDelete: paid,
    editReason: paid
      ? "Can't edit a paid proposal"
      : accepted
        ? "Can't edit an accepted proposal"
        : null,
    deleteReason: paid ? "Can't delete a paid proposal" : null,
  };
}

/* ------------------------------------------------------------------ *
 * Detail
 * ------------------------------------------------------------------ */

export async function fetchProposalDetail(id: string): Promise<ApiProposal> {
  const response = await api.get<{ success: boolean; data?: ApiProposal }>(
    apiRoutes.proposal.info(id),
  );
  const proposal = response.data?.data;
  if (!proposal) throw new Error("Proposal not found");
  return proposal;
}

export function mapServices(raw: ApiService[] | null | undefined): ServiceLine[] {
  return (raw ?? []).map((service) => ({
    description: String(service.description ?? ""),
    quantity: num(service.quantity),
    price: num(service.price),
    discount_percent: num(service.discount_percent),
    discount_amount: num(service.discount_amount),
    gst_percent: num(service.gst_percent ?? 10, 10),
    gst_amount: num(service.gst_amount),
    amount: num(service.amount),
    notes: String(service.notes ?? ""),
  }));
}

export function mapDocuments(
  raw: ApiDocument[] | null | undefined,
): ProposalDocument[] {
  return (raw ?? []).map((document) => ({
    id: document.id != null ? String(document.id) : undefined,
    name: document.name || "",
    file_url: document.file_url || "",
    mime_type: document.mime_type || "",
    file_size: document.file_size ?? "",
    status: document.status || "draft",
    fields: document.fields || [],
  }));
}

/** The client snapshot, rebuilt from the joined client when none was stored. */
export function snapshotFromProposal(raw: ApiProposal): ClientSnapshot | null {
  if (raw.client_snapshot && raw.client_snapshot.id) {
    return {
      id: String(raw.client_snapshot.id),
      contact_id: String(raw.client_snapshot.contact_id ?? ""),
      name: raw.client_snapshot.name || "Unnamed Client",
      email: raw.client_snapshot.email || "",
      currency: raw.client_snapshot.currency || raw.currency_code || "AUD",
      business_name: raw.client_snapshot.business_name || "",
      mobile_no: raw.client_snapshot.mobile_no || "",
      ABN: raw.client_snapshot.ABN || "",
      company_type: raw.client_snapshot.company_type || "",
      address: raw.client_snapshot.address || "",
    };
  }
  if (!raw.client) return null;
  return {
    id: String(raw.client.id ?? raw.client_id ?? ""),
    contact_id: raw.general_data?.contact_id
      ? String(raw.general_data.contact_id)
      : "",
    name: raw.client.name || raw.client.business_name || "Unnamed Client",
    email: raw.client.email || "",
    currency: raw.currency_code || "AUD",
    business_name: raw.client.business_name || "",
    mobile_no: raw.client.mobile_no || "",
    ABN: raw.client.ABN || "",
    company_type: raw.client.company_type || "",
    address: "",
  };
}

/** Everything the builder holds, seeded from a saved proposal. */
export type BuilderState = {
  general: ProposalGeneral;
  client: ClientSnapshot | null;
  services: ServiceLine[];
  /** Only a rate the user overrode is restored — the published one is fetched fresh. */
  customRate: number | null;
  payment: PaymentData;
  introduction: IntroductionData;
  documents: ProposalDocument[];
  terms: TermsData;
  thankYou: ThankYouData;
  notification: NotificationData;
  currentStep: ProposalStep;
};

export function builderStateFromProposal(raw: ApiProposal): BuilderState {
  const saved = raw.general_data ?? {};
  const intro = raw.introduction_data ?? {};
  const servicesStep = (raw.steps ?? []).find(
    (step) => step.step_key === "SERVICES",
  )?.section_data;
  const customRate =
    truthy(servicesStep?.is_exchange_rate_edited) &&
    num(servicesStep?.exchange_rate) > 0
      ? num(servicesStep?.exchange_rate)
      : null;
  // The client is whatever client_id says. Without one, any contact still in
  // general_data is a leftover (a template carries its source's contact) and
  // must not show as selected.
  const clientId = raw.client_id ? String(raw.client_id) : saved.client_id ? String(saved.client_id) : "";
  const snapshot = clientId ? snapshotFromProposal(raw) : null;

  return {
    general: {
      ...emptyGeneral(),
      ...saved,
      proposal_name:
        raw.title || saved.proposal_name || emptyGeneral().proposal_name,
      client_id: clientId,
      contact_id: !clientId
        ? ""
        : saved.contact_id
          ? String(saved.contact_id)
          : snapshot?.contact_id || "",
      currency_code: raw.currency_code || saved.currency_code || "AUD",
      contract_length: String(saved.contract_length ?? "1"),
      contract_custom_length: String(saved.contract_custom_length ?? ""),
      expire_in_days: String(saved.expire_in_days ?? "30"),
      is_auto_expire: truthy(saved.is_auto_expire),
    } as ProposalGeneral,
    client: snapshot,
    services: mapServices(raw.services),
    customRate,
    payment: {
      payment_required: truthy(raw.payment_data?.payment_required),
      pay_method: normalisePaymentMethod(raw.payment_data?.pay_method),
    },
    introduction: {
      message_from: intro.message_from ?? "",
      blocks: initialIntroBlocks(intro.blocks),
      signature: { ...DEFAULT_SIGNATURE, ...(intro.signature ?? {}) },
    },
    documents: mapDocuments(raw.documents),
    terms: { ...DEFAULT_TERMS, ...(raw.terms_data ?? {}) },
    thankYou: { ...DEFAULT_THANK_YOU, ...(raw.thank_you_data ?? {}) },
    notification: {
      ...defaultNotification(),
      ...(raw.notification_data ?? {}),
      cc_emails: Array.isArray(raw.notification_data?.cc_emails)
        ? raw.notification_data.cc_emails
        : [],
    },
    currentStep: stepFromKey(raw.current_step) ?? "General",
  };
}

export type StepProgress = {
  step: ProposalStep;
  status: "completed" | "in_progress" | "not_started";
  isRequired: boolean;
  summary: string | null;
};

export function stepProgress(raw: ApiProposal | null): StepProgress[] {
  const byStep = new Map<ProposalStep, ApiStep>();
  for (const step of raw?.steps ?? []) {
    const label = stepFromKey(step.step_key);
    if (label) byStep.set(label, step);
  }
  return PROPOSAL_STEPS.map((step) => {
    const saved = byStep.get(step);
    const status =
      saved?.status === "completed" || saved?.status === "in_progress"
        ? saved.status
        : "not_started";
    return {
      step,
      status,
      isRequired: saved?.is_required == null ? true : truthy(saved.is_required),
      summary: saved?.summary ?? null,
    };
  });
}

export type Readiness = {
  label: string;
  tone: "muted" | "success" | "warning" | "info" | "danger";
  ready: boolean;
  issues: number;
  completion: number;
};

/** How "done" the proposal is, for the builder's header. */
export function proposalReadiness(raw: ApiProposal | null): Readiness {
  if (!raw?.id) {
    return { label: "Not saved", tone: "muted", ready: false, issues: 0, completion: 0 };
  }
  const required = (raw.steps ?? []).filter((step) => truthy(step.is_required));
  const done = required.filter((step) => step.status === "completed").length;
  const completion =
    raw.completion_percent != null
      ? Math.round(num(raw.completion_percent))
      : required.length
        ? Math.round((done / required.length) * 100)
        : 0;
  const issues =
    raw.issue_count != null
      ? num(raw.issue_count)
      : Math.max(0, required.length - done);
  const status = normaliseProposalStatus(raw.status);

  if (status !== "draft") {
    const tone =
      status === "accepted"
        ? "success"
        : status === "rejected" || status === "lost"
          ? "danger"
          : status === "expired"
            ? "warning"
            : "info";
    return { label: proposalStatusLabel(status), tone, ready: true, issues, completion };
  }
  if (issues === 0) {
    return { label: "Ready to send", tone: "success", ready: true, issues, completion };
  }
  return {
    label: `In progress · ${completion}%`,
    tone: "warning",
    ready: false,
    issues,
    completion,
  };
}

/* ------------------------------------------------------------------ *
 * Services maths — mirrors the server's own calculation
 * ------------------------------------------------------------------ */

export const round2 = (value: number) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function computeLine(service: ServiceLine) {
  const quantity = num(service.quantity);
  const price = num(service.price);
  const discountPercent = Math.min(Math.max(num(service.discount_percent), 0), 100);
  const gstPercent = Math.max(num(service.gst_percent), 0);

  const subtotal = quantity * price;
  const discountAmount = round2(subtotal * (discountPercent / 100));
  const netAmount = subtotal - discountAmount;
  const gstAmount = round2(netAmount * (gstPercent / 100));
  const amount = round2(netAmount + gstAmount);
  return { subtotal, discountAmount, netAmount, gstAmount, amount };
}

/** A line with its derived amounts brought up to date. */
export function recalculateLine(service: ServiceLine): ServiceLine {
  const { discountAmount, gstAmount, amount } = computeLine(service);
  return {
    ...service,
    discount_amount: discountAmount,
    gst_amount: gstAmount,
    amount,
  };
}

/**
 * A numeric field's typed value with any minus removed and clamped to `max`.
 * An empty field stays empty so it can be cleared and retyped.
 */
export function nonNegative(raw: string, max?: number): string {
  const value = raw.replace(/-/g, "");
  if (value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return max != null && number > max ? String(max) : value;
}

export function newServiceLine(gstPercent: number): ServiceLine {
  return {
    description: "",
    quantity: 1,
    price: 0,
    discount_percent: 0,
    discount_amount: 0,
    gst_percent: gstPercent,
    gst_amount: 0,
    amount: 0,
  };
}

export function serviceTotals(services: ServiceLine[]) {
  return services.reduce(
    (acc, service) => {
      const line = computeLine(service);
      return {
        subtotal: acc.subtotal + line.subtotal,
        discount: acc.discount + line.discountAmount,
        net: acc.net + line.netAmount,
        gst: acc.gst + line.gstAmount,
        total: acc.total + line.amount,
      };
    },
    { subtotal: 0, discount: 0, net: 0, gst: 0, total: 0 },
  );
}

export function formatProposalMoney(value: number, currency = "AUD"): string {
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: currency || "AUD",
    }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

export function formatProposalDate(
  value: string | null | undefined,
  withWeekday = false,
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    ...(withWeekday ? { weekday: "short" as const } : {}),
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/* ------------------------------------------------------------------ *
 * Validation — ported exactly from each sole-webapp step
 * ------------------------------------------------------------------ */

export type Issues = Record<string, string>;

export function generalIssues(general: ProposalGeneral): Issues {
  const issues: Issues = {};
  if (!general.proposal_name.trim()) issues.proposal_name = "Proposal name is required.";
  if (!general.client_id) issues.client_id = "Client is required.";
  if (
    general.contract_start_type === "ON_SPECIFIC_DATE" &&
    !general.contract_start_date
  ) {
    issues.contract_start_date = "Start date is required.";
  }
  if (
    general.contract_length === "custom" &&
    (!general.contract_custom_length || num(general.contract_custom_length) <= 0)
  ) {
    issues.contract_custom_length = "Enter a valid custom month count.";
  }
  if (
    general.is_auto_expire &&
    (!general.expire_in_days || num(general.expire_in_days) <= 0)
  ) {
    issues.expire_in_days = "Enter a valid expiry day count.";
  }
  return issues;
}

export type ServiceIssues = {
  services?: string;
  rows: Record<number, Partial<Record<"description" | "quantity" | "price" | "discount_percent", string>>>;
};

export function servicesIssues(services: ServiceLine[]): ServiceIssues {
  const result: ServiceIssues = { rows: {} };
  if (services.length === 0) result.services = "Add at least one service.";
  services.forEach((service, index) => {
    const row: ServiceIssues["rows"][number] = {};
    if (!String(service.description ?? "").trim()) row.description = "Description is required.";
    if (num(service.quantity) <= 0) row.quantity = "Qty must be greater than 0.";
    if (num(service.price) < 0) row.price = "Price cannot be negative.";
    const discount = num(service.discount_percent);
    if (discount < 0 || discount > 100) row.discount_percent = "Discount must be 0–100%.";
    if (Object.keys(row).length) result.rows[index] = row;
  });
  return result;
}

export function hasServiceIssues(issues: ServiceIssues): boolean {
  return Boolean(issues.services) || Object.keys(issues.rows).length > 0;
}

export function isBlankHtml(html: string | null | undefined): boolean {
  const source = String(html ?? "");
  // An image (or embed) on its own is content — it just has no text.
  if (/<(img|video|iframe)\b/i.test(source)) return false;
  return !source
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, "")
    .trim();
}

export function termsIssues(terms: TermsData): Issues {
  const issues: Issues = {};
  if (!terms.title.trim()) issues.title = "Terms title is required.";
  if (isBlankHtml(terms.body)) issues.body = "Terms content is required.";
  if (terms.require_signature && !terms.signer_label.trim()) {
    issues.signer_label = "Signer label is required.";
  }
  return issues;
}

export function thankYouIssues(data: ThankYouData): Issues {
  const issues: Issues = {};
  if (!data.title.trim()) issues.title = "Thank-you title is required.";
  if (!data.message.trim()) issues.message = "Thank-you message is required.";
  if (data.button_url && !data.button_label.trim()) {
    issues.button_label = "Button label is required when URL is added.";
  }
  return issues;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Why a picked file can't be attached, or null when it can. */
export function documentFileIssue(file: { name: string; size: number }): string | null {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return `${file.name}: only PDF files are supported`;
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `${file.name}: file exceeds the 10MB limit`;
  }
  return null;
}

export function formatFileSize(bytes: number | string): string {
  const size = Number(bytes) || 0;
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ *
 * Merge tags and embeds
 * ------------------------------------------------------------------ */

export type MergeValues = Record<string, string>;

export const MERGE_TAG_GROUPS: {
  label: string;
  tags: { label: string; key: string }[];
}[] = [
  {
    label: "Contact",
    tags: [
      { label: "Contact Name", key: "contact_addressee" },
      { label: "Contact Email", key: "contact_email" },
      { label: "Contact phone number", key: "contact_phone_number" },
    ],
  },
  {
    label: "Client",
    tags: [
      { label: "Client Address", key: "client_address" },
      { label: "Business Structure", key: "client_business_structure" },
      { label: "Company Number", key: "client_company_number" },
    ],
  },
  {
    label: "Firm",
    tags: [
      { label: "Firm Name", key: "firm_name" },
      { label: "Firm Email", key: "firm_email" },
      { label: "Firm Phone", key: "firm_phone" },
    ],
  },
];

export function mergeValues(
  client: ClientSnapshot | null,
  firm: { name: string; email: string; phone: string },
): MergeValues {
  return {
    contact_addressee: client?.name || "",
    contact_email: client?.email || "",
    client_address: client?.address || "",
    client_business_structure:
      client?.company_type === "business"
        ? "Business"
        : client?.company_type === "individual"
          ? "Individual"
          : "",
    client_company_number: client?.ABN || "",
    contact_phone_number: client?.mobile_no || "",
    firm_name: firm.name,
    firm_email: firm.email,
    firm_phone: firm.phone,
  };
}

/** Known `{{tags}}` are replaced; unknown or empty ones are left intact. */
export function renderMergeTags(html: string, values: MergeValues): string {
  if (!html) return "";
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
    const value = values[key];
    return value ? value : match;
  });
}

export function videoEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    let id = "";
    if (url.includes("v=")) id = url.split("v=")[1]?.split("&")[0] ?? "";
    else if (url.includes("youtu.be/")) id = url.split("youtu.be/")[1]?.split("?")[0] ?? "";
    else if (url.includes("/shorts/")) id = url.split("/shorts/")[1]?.split("?")[0] ?? "";
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (url.includes("vimeo.com")) {
    const id = url.split("vimeo.com/")[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (url.includes("loom.com")) {
    const id = url.split("/share/")[1];
    return id ? `https://www.loom.com/embed/${id}` : null;
  }
  return null;
}

export function hasBlockContent(block: IntroBlock): boolean {
  if (block.type === "text") return !isBlankHtml(block.editorHtml);
  if (block.type === "image") return Boolean(block.imageUrl);
  if (block.type === "video") return Boolean(block.videoUrl);
  return block.type === "page_break";
}

/** Splits the introduction into pages at each page break. */
export function splitIntoPages(blocks: IntroBlock[]): IntroBlock[][] {
  const pages: IntroBlock[][] = [[]];
  for (const block of blocks) {
    if (block.type === "page_break") pages.push([]);
    else pages[pages.length - 1].push(block);
  }
  return pages.filter((page) => page.length > 0);
}

/* ------------------------------------------------------------------ *
 * Preview data — what the client-facing renderer reads
 * ------------------------------------------------------------------ */

export type PreviewBusiness = {
  name: string;
  logo: string;
  bank: { account_holder: string; bsb: string; account_number: string } | null;
};

export type PreviewPayment = PaymentData & {
  is_paid?: boolean;
  paid_method?: string | null;
  paid_at?: string | null;
};

export type PreviewData = {
  general: ProposalGeneral & { issued_at?: string | null };
  business: PreviewBusiness;
  services: ServiceLine[];
  payment: PreviewPayment;
  introduction: IntroductionData;
  documents: ProposalDocument[];
  terms: TermsData;
  thankYou: ThankYouData;
  notification: NotificationData;
  client: ClientSnapshot | null;
  exchange: { is_multicurrency: boolean; exchange_rate: number | null };
};

export function previewFromProposal(raw: ApiProposal): PreviewData {
  const state = builderStateFromProposal(raw);
  const payment = mapPayment(raw.payment_data);
  const bank = raw.business?.bank;
  return {
    general: { ...state.general, issued_at: raw.sent_at || raw.created_at },
    business: {
      name: raw.business?.name || "",
      logo: raw.business?.logo || "",
      bank: bank
        ? {
            account_holder: bank.account_holder || "",
            bsb: bank.bsb || "",
            account_number: bank.account_number || "",
          }
        : null,
    },
    services: state.services,
    payment: {
      ...state.payment,
      is_paid: payment.paid,
      paid_method: payment.paidMethod,
      paid_at: payment.paidAt,
    },
    introduction: state.introduction,
    documents: state.documents,
    terms: state.terms,
    thankYou: state.thankYou,
    notification: state.notification,
    client: state.client,
    exchange: {
      is_multicurrency: truthy(raw.is_multicurrency),
      exchange_rate: raw.exchange_rate ? num(raw.exchange_rate) : null,
    },
  };
}

export function contractStartLabel(general: Partial<ProposalGeneral>): string {
  if (general.contract_start_type === "ON_ACCEPTANCE") return "On acceptance";
  return general.contract_start_date
    ? formatProposalDate(general.contract_start_date, true)
    : "—";
}

export function contractLengthLabel(general: Partial<ProposalGeneral>): string {
  if (general.contract_length === "custom") {
    return `${general.contract_custom_length || "—"} months`;
  }
  if (!general.contract_length) return "—";
  const months = Number(general.contract_length);
  return `${general.contract_length} month${months === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------ *
 * Writes — all encrypted
 * ------------------------------------------------------------------ */

/** Undefined keys are dropped — the encryptor would turn them into "". */
function clean(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
}

function encrypted(fields: Record<string, unknown>) {
  return buildEncryptedRequestBody(clean(fields));
}

/** The General-step payload sole-webapp sends on create and on update. */
export function generalPayload(
  general: ProposalGeneral,
  client: ClientSnapshot | null,
) {
  const name = general.proposal_name.trim() || "Untitled Proposal";
  const clientId = general.client_id ? Number(general.client_id) : null;
  return {
    title: name,
    proposal_name: name,
    client_id: clientId,
    currency_code: general.currency_code || "AUD",
    current_step: "GENERAL",
    general_data: { ...general, proposal_name: name, client_id: clientId },
    client_snapshot: client,
  };
}

export async function createProposalApi(
  general: ProposalGeneral,
  client: ClientSnapshot | null,
): Promise<ApiProposal> {
  const response = await api.post<{ success: boolean; data?: ApiProposal }>(
    apiRoutes.proposal.create,
    encrypted(generalPayload(general, client)),
  );
  const proposal = response.data?.data;
  if (!proposal?.id) throw new Error("Backend did not return a proposal id");
  return proposal;
}

export async function updateProposalApi(
  id: string,
  general: ProposalGeneral,
  client: ClientSnapshot | null,
): Promise<ApiProposal | null> {
  const response = await api.put<{ success: boolean; data?: ApiProposal }>(
    apiRoutes.proposal.update(id),
    encrypted(generalPayload(general, client)),
  );
  return response.data?.data ?? null;
}

export type StepSave = {
  status: "completed" | "in_progress";
  summary: string;
  data: unknown;
  next_step?: string;
  services?: unknown[];
  documents?: unknown[];
  notifications?: unknown[];
};

export async function saveProposalStepApi(
  id: string,
  stepKey: string,
  save: StepSave,
): Promise<ApiProposal | null> {
  const response = await api.patch<{ success: boolean; data?: ApiProposal }>(
    apiRoutes.proposal.step(id, stepKey),
    encrypted({ ...save, is_complete: save.status === "completed" }),
  );
  return response.data?.data ?? null;
}

/* Step payloads — exactly what sole-webapp's create page sends per step. */

export function generalStepSave(
  general: ProposalGeneral,
  client: ClientSnapshot | null,
): StepSave {
  const complete = Boolean(general.client_id);
  return {
    status: complete ? "completed" : "in_progress",
    summary: complete
      ? "Client and proposal details saved"
      : "Proposal saved without client",
    data: generalPayload(general, client).general_data,
    next_step: PROPOSAL_STEP_KEYS.Services,
  };
}

export function servicesStepSave(
  services: ServiceLine[],
  exchange: { multicurrency: boolean; rate: number | null; edited: boolean },
): StepSave {
  const lines = services.map((service) => ({
    description: String(service.description ?? "").trim(),
    quantity: num(service.quantity),
    price: num(service.price),
    discount_percent: num(service.discount_percent),
    discount_amount: num(service.discount_amount),
    gst_percent: num(service.gst_percent),
    gst_amount: num(service.gst_amount),
    amount: num(service.amount),
    notes: service.notes || "",
  }));
  return {
    status: "completed",
    summary: `${services.length} service${services.length === 1 ? "" : "s"} added`,
    next_step: PROPOSAL_STEP_KEYS.Payments,
    // Prices are in the client's currency; the rate (1 AUD = rate <currency>)
    // converts the totals back to AUD.
    data: {
      services: lines,
      is_multicurrency: exchange.multicurrency,
      exchange_rate:
        exchange.multicurrency && exchange.rate
          ? Number(Number(exchange.rate).toFixed(2))
          : null,
      is_exchange_rate_edited: exchange.multicurrency && exchange.edited,
    },
    services: lines,
  };
}

export function paymentStepSave(payment: PaymentData): StepSave {
  return {
    status: "completed",
    summary: payment.payment_required
      ? `Payment required via ${paymentMethodLabel(payment.pay_method)}`
      : "Payment not required",
    data: payment,
    next_step: PROPOSAL_STEP_KEYS.Introduction,
  };
}

export function introductionStepSave(intro: IntroductionData): StepSave {
  return {
    status: "completed",
    summary: "Introduction content saved",
    data: {
      message_from: intro.message_from || "",
      blocks: blocksForSave(intro.blocks),
      signature: intro.signature,
    },
    next_step: PROPOSAL_STEP_KEYS["Add. Docs."],
  };
}

export function documentsStepSave(documents: ProposalDocument[]): StepSave {
  const rows = documents.map((document) => ({
    name: document.name.trim(),
    file_url: document.file_url || null,
    mime_type: document.mime_type || null,
    file_size: document.file_size || null,
    status: document.status || "draft",
    fields: document.fields?.length ? document.fields : null,
  }));
  return {
    status: "completed",
    summary: rows.length
      ? `${rows.length} document${rows.length === 1 ? "" : "s"} added`
      : "No additional documents",
    data: { documents: rows },
    documents: rows,
    next_step: PROPOSAL_STEP_KEYS["Terms & Sign"],
  };
}

export function termsStepSave(terms: TermsData): StepSave {
  return {
    status: "completed",
    summary: terms.require_signature
      ? "Terms saved with signature required"
      : "Terms saved without signature requirement",
    data: { ...terms, title: terms.title.trim(), body: terms.body.trim() },
    next_step: PROPOSAL_STEP_KEYS.Notification,
  };
}

export function notificationStepSave(notification: NotificationData): StepSave {
  const enabled = notification.send_notification !== false;
  return {
    status: "completed",
    summary: enabled ? "Email notification configured" : "Email notification disabled",
    data: notification,
    notifications: [
      {
        channel: "email",
        send_notification: enabled,
        recipients: notification.cc_emails || [],
        content: {
          message_from: notification.message_from,
          email_body: notification.email_body,
        },
        status: "draft",
      },
    ],
    next_step: PROPOSAL_STEP_KEYS["Thank You"],
  };
}

export function thankYouStepSave(data: ThankYouData): StepSave {
  return {
    status: "completed",
    summary: "Thank-you screen saved",
    data: { ...data, title: data.title.trim(), message: data.message.trim() },
  };
}

export async function deleteProposalApi(id: string): Promise<void> {
  await api.delete(apiRoutes.proposal.delete(id));
}

export async function markProposalPaidApi(
  id: string,
  paid: boolean,
): Promise<ProposalPayment | null> {
  const response = await api.patch<{ success: boolean; data?: ApiProposal }>(
    apiRoutes.proposal.markPaid(id),
    encrypted({ paid }),
  );
  return response.data?.data?.payment_data
    ? mapPayment(response.data.data.payment_data)
    : null;
}

export type SendOutcome =
  | "emailed"
  | "sent"
  | "notification_disabled"
  | "missing_email"
  | "email_failed";

export type SendResult = {
  proposal: ApiProposal | null;
  responseUrl: string | null;
  outcome: SendOutcome;
};

export function sendOutcome(result: {
  email_sent?: boolean;
  email_error?: string | null;
}): SendOutcome {
  if (result.email_sent) return "emailed";
  if (result.email_error === "Email notification disabled for this proposal") {
    return "notification_disabled";
  }
  if (result.email_error === "No client email on file for this proposal") {
    return "missing_email";
  }
  if (result.email_error) return "email_failed";
  return "sent";
}

export const SEND_MESSAGES: Record<SendOutcome, { warning: boolean; message: string }> = {
  emailed: { warning: false, message: "Proposal emailed to your client" },
  sent: { warning: false, message: "Proposal marked as sent" },
  notification_disabled: {
    warning: false,
    message: "Proposal marked as sent. Email notification is disabled.",
  },
  missing_email: {
    warning: true,
    message: "Proposal marked as sent, but this client has no email on file.",
  },
  email_failed: {
    warning: true,
    message: "Proposal marked as sent, but the email failed to deliver.",
  },
};

/** Sends (or re-sends) the proposal — a fresh client link each time. */
export async function sendProposalApi(id: string): Promise<SendResult> {
  const response = await api.post<{
    success: boolean;
    data?: {
      proposal?: ApiProposal;
      response_url?: string;
      email_sent?: boolean;
      email_error?: string | null;
    };
  }>(apiRoutes.proposal.send(id), encrypted({}));
  const data = response.data?.data ?? {};
  return {
    proposal: data.proposal ?? null,
    responseUrl: data.response_url ?? null,
    outcome: sendOutcome(data),
  };
}

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

/** What a whole-proposal template stores — the builder's state, minus the client. */
export type TemplateSnapshot = {
  general?: Partial<ProposalGeneral>;
  services?: ServiceLine[];
  payment?: Partial<PaymentData>;
  introduction?: Partial<IntroductionData>;
  documents?: ProposalDocument[];
  terms?: Partial<TermsData>;
  thank_you?: Partial<ThankYouData>;
  notification?: Partial<NotificationData>;
};

export type ProposalTemplate = {
  id: string;
  name: string;
  description: string;
  /** Shipped by Sole for everyone (no owner), rather than saved by this user. */
  isSystem: boolean;
  serviceCount: number;
  snapshot: TemplateSnapshot;
};

export async function fetchProposalTemplates(): Promise<ProposalTemplate[]> {
  const response = await api.get<{
    success: boolean;
    data?: Array<{
      id: string | number;
      user_id?: string | number | null;
      template_name?: string | null;
      description?: string | null;
      snapshot_data?: TemplateSnapshot | null;
    }>;
  }>(apiRoutes.proposal.templates, { params: { template_type: "PROPOSAL" } });
  return (response.data?.data ?? []).map((template) => {
    const snapshot = template.snapshot_data ?? {};
    return {
      id: String(template.id),
      name: template.template_name || "Untitled template",
      description: template.description || "",
      isSystem: template.user_id == null,
      serviceCount: Array.isArray(snapshot.services) ? snapshot.services.length : 0,
      snapshot,
    };
  });
}

/** Search across a template's name and description. */
export function filterProposalTemplates(
  templates: ProposalTemplate[],
  query: string,
): ProposalTemplate[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return templates;
  return templates.filter((template) =>
    `${template.name} ${template.description}`.toLowerCase().includes(needle),
  );
}

/**
 * A template exactly as a client would see the proposal made from it — run
 * through the same mapping as a real proposal, with the firm's own details
 * and its merge fields filled in. There's no client yet, so client fields
 * stay as their tags and the cover reads "Your client".
 */
export function previewFromTemplate(
  template: ProposalTemplate,
  business: PreviewData["business"],
  firm: { name: string; email: string; phone: string },
): PreviewData {
  const { snapshot } = template;
  const preview = previewFromProposal({
    id: template.id,
    title: snapshot.general?.proposal_name || template.name,
    currency_code: snapshot.general?.currency_code || "AUD",
    general_data: { ...(snapshot.general ?? {}), client_id: "", contact_id: "" },
    services: (snapshot.services ?? []) as ApiService[],
    payment_data: snapshot.payment ?? null,
    introduction_data: snapshot.introduction ?? null,
    documents: (snapshot.documents ?? []) as ApiDocument[],
    terms_data: snapshot.terms ?? null,
    thank_you_data: snapshot.thank_you ?? null,
    notification_data: snapshot.notification ?? null,
  } as ApiProposal);
  const values = mergeValues(null, firm);
  const resolve = (html: string) => renderMergeTags(html, values);
  return {
    ...preview,
    business,
    introduction: {
      ...preview.introduction,
      blocks: preview.introduction.blocks.map((block) =>
        block.type === "text" ? { ...block, editorHtml: resolve(block.editorHtml ?? "") } : block,
      ),
    },
    terms: { ...preview.terms, body: resolve(preview.terms.body) },
    notification: { ...preview.notification, email_body: resolve(preview.notification.email_body) },
  };
}

export async function createProposalFromTemplateApi(templateId: string): Promise<string> {
  const response = await api.post<{ success: boolean; data?: { id?: string | number } }>(
    apiRoutes.proposal.fromTemplate,
    encrypted({ template_id: Number(templateId) }),
  );
  const id = response.data?.data?.id;
  if (!id) throw new Error("Backend did not return a proposal id");
  return String(id);
}

export async function saveProposalTemplateApi(
  name: string,
  description: string,
  state: Omit<BuilderState, "client" | "customRate" | "currentStep">,
): Promise<void> {
  await api.post(
    apiRoutes.proposal.templates,
    encrypted({
      template_type: "PROPOSAL",
      template_name: name.trim(),
      description: description.trim() || null,
      snapshot_data: {
        // A template is client-free — the next proposal picks its own.
        general: { ...state.general, client_id: "", contact_id: "" },
        services: state.services,
        payment: state.payment,
        introduction: {
          ...state.introduction,
          blocks: blocksForSave(state.introduction.blocks),
        },
        documents: state.documents,
        terms: state.terms,
        thank_you: state.thankYou,
        notification: state.notification,
      },
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Uploads and documents
 * ------------------------------------------------------------------ */

/** An introduction image — answers with its public URL. */
export async function uploadProposalImageApi(
  proposalId: string,
  file: File,
): Promise<string | null> {
  const response = await api.post<{ success: boolean; data?: string }>(
    apiRoutes.proposal.contentUpload,
    buildEncryptedRequestBody({ proposal_id: proposalId }, { file }),
  );
  return typeof response.data?.data === "string" ? response.data.data : null;
}

/** A supporting PDF — persisted at once, answering with the full row. */
export async function uploadProposalDocumentApi(
  proposalId: string,
  file: File,
): Promise<ProposalDocument> {
  const response = await api.post<{ success: boolean; data?: ApiDocument }>(
    apiRoutes.proposal.documentUpload,
    buildEncryptedRequestBody({ proposal_id: proposalId }, { file }),
  );
  const [document] = mapDocuments(response.data?.data ? [response.data.data] : []);
  if (!document?.file_url) throw new Error(`Failed to upload ${file.name}`);
  return {
    ...document,
    name: document.name || file.name,
    mime_type: document.mime_type || file.type || "application/pdf",
    file_size: document.file_size || file.size,
  };
}

/** Removes the S3 object and its row straight away. */
export async function deleteProposalDocumentApi(
  proposalId: string,
  documentId: string,
): Promise<void> {
  await api.delete(apiRoutes.proposal.documentDelete(proposalId, documentId));
}

/**
 * The PDF's bytes, through the backend's authenticated proxy — the bucket's
 * CORS policy won't let the browser read it directly.
 */
export async function fetchProposalDocumentBlob(
  proposalId: string,
  document: Pick<ProposalDocument, "file_url" | "mime_type">,
): Promise<Blob> {
  const response = await api.get<ArrayBuffer>(
    apiRoutes.proposal.documentPreview(proposalId),
    { params: { file_url: document.file_url }, responseType: "arraybuffer" },
  );
  return new Blob([response.data], {
    type: document.mime_type || "application/pdf",
  });
}

/* ------------------------------------------------------------------ *
 * Client contacts — the proposal is addressed to one person
 * ------------------------------------------------------------------ */

export type ProposalContact = {
  contactId: string;
  clientId: string;
  name: string;
  email: string;
  currency: string;
  businessName: string;
  mobile: string;
  abn: string;
  companyType: string;
  address: string;
};

type ApiCompanyContact = {
  contact_id?: string | number | null;
  client_id?: string | number | null;
  name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  country_calling_code?: string | null;
  business_name?: string | null;
  client?: {
    currency?: string | null;
    mobile_no?: string | null;
    ABN?: string | null;
    company_type?: string | null;
    address?: string | null;
    business_name?: string | null;
  } | null;
};

export async function fetchProposalContacts(): Promise<ProposalContact[]> {
  const response = await api.get<{ success: boolean; data?: ApiCompanyContact[] }>(
    apiRoutes.companyContact.list,
    { params: { page: 1, limit: 1000, type: 1 } },
  );
  return (response.data?.data ?? [])
    .filter((raw) => raw.contact_id != null && raw.client_id != null)
    .map((raw) => ({
      contactId: String(raw.contact_id),
      clientId: String(raw.client_id),
      name: raw.name?.trim() || "Unnamed contact",
      email: raw.email?.trim() || "",
      currency: (raw.client?.currency || "AUD").toUpperCase(),
      businessName: raw.business_name || raw.client?.business_name || "",
      mobile: raw.phone_number
        ? `${raw.country_calling_code ?? ""}${raw.phone_number}`
        : raw.client?.mobile_no || "",
      abn: raw.client?.ABN || "",
      companyType: raw.client?.company_type || "",
      address: raw.client?.address || "",
    }));
}

export function snapshotFromContact(contact: ProposalContact): ClientSnapshot {
  return {
    id: contact.clientId,
    contact_id: contact.contactId,
    name: contact.name,
    email: contact.email,
    currency: contact.currency,
    business_name: contact.businessName,
    mobile_no: contact.mobile,
    ABN: contact.abn,
    company_type: contact.companyType,
    address: contact.address,
  };
}

/* ------------------------------------------------------------------ *
 * Stripe readiness — offered as a pay method only once onboarded
 * ------------------------------------------------------------------ */

export async function fetchStripeConnected(): Promise<boolean> {
  try {
    const response = await api.get<{
      success: boolean;
      data?: { account?: { onboarding_complete?: boolean } };
    }>(apiRoutes.stripeConnect.account);
    return Boolean(response.data?.data?.account?.onboarding_complete);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Images — through our own origin, so the PDF capture can read them
 * ------------------------------------------------------------------ */

/**
 * Remote images go through our own origin: the logo bucket sends no CORS
 * headers, which blocks them for a CORS image and for the PDF capture alike.
 */
export function proxiedImage(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("/") || url.startsWith("data:") || url.startsWith("blob:")) return url;
  return `/api/proxy-image?src=${encodeURIComponent(url)}`;
}

/**
 * Editor images are saved with their raw S3 URL; route them through the
 * proxy too, or html2canvas drops them from the PDF.
 */
export function proxyHtmlImages(html: string): string {
  return html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2/gi,
    (_match, prefix: string, quote: string, src: string) =>
      `${prefix}${quote}${proxiedImage(src.replace(/&amp;/g, "&"))}${quote}`,
  );
}
