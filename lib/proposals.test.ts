import { describe, expect, it, vi, beforeEach } from "vitest";

import { decryptPayload } from "@/utils/encrypt";
import apiRoutes from "@/config/api-routes";
import type { EmailFile } from "@/lib/proposals";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/utils/axiosInstance", () => ({
  default: apiMock,
}));

const {
  fetchProposalsPage,
  fetchProposalDetail,
  createProposalApi,
  updateProposalApi,
  saveProposalStepApi,
  deleteProposalApi,
  markProposalPaidApi,
  sendProposalApi,
  sendProposalReminderApi,
  canSendReminder,
  reminderBlockedReason,
  defaultReminderDraft,
  defaultReminderTemplate,
  emptyReminderDraft,
  reminderFromTemplate,
  reminderIssues,
  reminderTemplateGroups,
  fetchProposalTemplates,
  createProposalFromTemplateApi,
  saveProposalTemplateApi,
  uploadProposalImageApi,
  uploadProposalDocumentApi,
  deleteProposalDocumentApi,
  fetchProposalContacts,
  fetchStripeConnected,
  builderStateFromProposal,
  DEFAULT_EMAIL_SUBJECT,
  defaultNotification,
  MERGE_TAG_GROUPS,
  SAMPLE_MERGE_VALUES,
  previewFromProposal,
  proposalReadiness,
  proposalLocks,
  stepProgress,
  computeLine,
  recalculateLine,
  serviceTotals,
  generalIssues,
  servicesIssues,
  termsIssues,
  thankYouIssues,
  documentFileIssue,
  renderMergeTags,
  mergeValues,
  videoEmbedUrl,
  splitIntoPages,
  initialIntroBlocks,
  blocksForSave,
  normalisePaymentMethod,
  paymentMethodLabel,
  sendOutcome,
  servicesStepSave,
  generalStepSave,
  documentsStepSave,
  introductionStepSave,
  thankYouStepSave,
  notificationStepSave,
  paymentStepSave,
  termsStepSave,
  emptyGeneral,
  nextStep,
  stepFromKey,
  contractLengthLabel,
  contractStartLabel,
  formatFileSize,
  nonNegative,
  isBlankHtml,
  hasBlockContent,
  proxiedImage,
  proxyHtmlImages,
  filterProposalTemplates,
  previewFromTemplate,
  fetchTemplatesOfType,
  servicePatchFromSuggestion,
  templateSummary,
  templateAsProposal,
  updateProposalTemplateApi,
  proposalTemplateSnapshot,
  TEMPLATE_KINDS,
} = await import("@/lib/proposals");

import type { ApiProposal, ProposalGeneral, ServiceLine } from "@/lib/proposals";

function decrypted(body: unknown): Record<string, unknown> {
  if (body instanceof FormData) {
    const data = body.get("data");
    if (typeof data !== "string") throw new Error("FormData had no 'data' field");
    return decryptPayload(data);
  }
  const asData = body as { data?: string };
  if (typeof asData?.data !== "string") {
    throw new Error("Body was neither FormData nor a {data} envelope");
  }
  return decryptPayload(asData.data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

const line = (overrides: Partial<ServiceLine> = {}): ServiceLine => ({
  description: "Bookkeeping",
  quantity: 2,
  price: 100,
  discount_percent: 10,
  discount_amount: 0,
  gst_percent: 10,
  gst_amount: 0,
  amount: 0,
  ...overrides,
});

const general = (overrides: Partial<ProposalGeneral> = {}): ProposalGeneral => ({
  ...emptyGeneral(),
  proposal_name: "Annual advisory",
  client_id: "7",
  contact_id: "21",
  ...overrides,
});

const rawProposal = (overrides: Partial<ApiProposal> = {}): ApiProposal => ({
  id: 42,
  title: "Annual advisory",
  status: "draft",
  client_id: 7,
  client: { id: 7, name: "Acme Pty Ltd", email: "acme@example.com" },
  currency_code: "AUD",
  service_total: "198.00",
  payment_data: { payment_required: true, pay_method: "manual", is_paid: false },
  created_at: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

describe("fetchProposalsPage", () => {
  it("sends page, limit, search and status, and maps the rows", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          rows: [
            rawProposal({
              is_multicurrency: 1,
              currency_code: "usd",
              service_total_aud: "300",
              payment_data: { payment_required: "true", pay_method: "sole_pay", is_paid: 1, paid_method: "stripe" },
            }),
          ],
          pagination: { total: 31 },
        },
      },
    });

    const page = await fetchProposalsPage(2, 25, "  advisory ", "sent");

    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.proposal.list, {
      params: { page: 2, limit: 25, search: "advisory", status: "sent" },
    });
    expect(page.total).toBe(31);
    expect(page.proposals[0]).toMatchObject({
      id: "42",
      title: "Annual advisory",
      clientName: "Acme Pty Ltd",
      status: "draft",
      amount: 198,
      currency: "USD",
      multicurrency: true,
      amountAud: 300,
      // sole-webapp's "sole_pay" is SolePay again.
      payment: { required: true, method: "solepay", paid: true, paidMethod: "stripe" },
    });
  });

  it("omits empty filters and falls back to the row count for the total", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { rows: [rawProposal()] } } });
    const page = await fetchProposalsPage(1, 50);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.proposal.list, { params: { page: 1, limit: 50 } });
    expect(page.total).toBe(1);
  });

  it("labels the client from the snapshot, then 'No client'", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          rows: [
            rawProposal({ client: null, client_snapshot: { name: "Jo Bloggs" } }),
            rawProposal({ client: null, client_snapshot: null, title: null, status: "weird" }),
          ],
        },
      },
    });
    const { proposals } = await fetchProposalsPage(1, 10);
    expect(proposals[0].clientName).toBe("Jo Bloggs");
    expect(proposals[1]).toMatchObject({ clientName: "No client", title: "Untitled Proposal", status: "draft" });
  });

  it("reads the trimmed list row the backend now sends", async () => {
    // Exactly the shape listProposals returns — no step content, no snapshot.
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          rows: [
            {
              id: 5,
              title: "Untitled Proposal",
              status: "rejected",
              currency_code: "AUD",
              service_total: "142.56",
              is_multicurrency: false,
              payment_data: { payment_required: true, pay_method: "manual", is_paid: false, paid_method: null, paid_at: null },
              client: { name: "gaurav nepali" },
              created_at: "2026-10-27T09:28:01.000Z",
            },
          ],
          pagination: { page: 1, limit: 50, total: 1, total_pages: 1 },
        },
      },
    });

    const { proposals, total } = await fetchProposalsPage(1, 50);
    expect(total).toBe(1);
    expect(proposals[0]).toEqual({
      id: "5",
      title: "Untitled Proposal",
      clientName: "gaurav nepali",
      status: "rejected",
      amount: 142.56,
      currency: "AUD",
      multicurrency: false,
      amountAud: null,
      payment: { required: true, method: "manual", paid: false, paidMethod: null, paidAt: null },
      createdAt: "2026-10-27T09:28:01.000Z",
    });
  });
});

describe("fetchProposalDetail", () => {
  it("returns the proposal", async () => {
    apiMock.get.mockResolvedValue({ data: { data: rawProposal() } });
    await expect(fetchProposalDetail("42")).resolves.toMatchObject({ id: 42 });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.proposal.info("42"));
  });

  it("throws when nothing comes back", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    await expect(fetchProposalDetail("42")).rejects.toThrow("Proposal not found");
  });
});

describe("create / update", () => {
  const client = {
    id: "7",
    contact_id: "21",
    name: "Jo",
    email: "jo@example.com",
    currency: "AUD",
    business_name: "Acme",
    mobile_no: "",
    ABN: "",
    company_type: "business",
    address: "",
  };

  it("creates with the encrypted General payload", async () => {
    apiMock.post.mockResolvedValue({ data: { data: { id: 99 } } });
    await createProposalApi(general({ proposal_name: "  " }), client);

    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.proposal.create);
    const sent = decrypted(body);
    expect(sent).toMatchObject({
      title: "Untitled Proposal",
      proposal_name: "Untitled Proposal",
      client_id: 7,
      currency_code: "AUD",
      current_step: "GENERAL",
      client_snapshot: client,
    });
    expect((sent.general_data as Record<string, unknown>).client_id).toBe(7);
  });

  it("throws when the backend returns no id", async () => {
    apiMock.post.mockResolvedValue({ data: { data: {} } });
    await expect(createProposalApi(general(), null)).rejects.toThrow("did not return a proposal id");
  });

  it("updates through PUT", async () => {
    apiMock.put.mockResolvedValue({ data: { data: rawProposal() } });
    await updateProposalApi("42", general(), null);
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.proposal.update("42"));
    expect(decrypted(body).title).toBe("Annual advisory");
  });
});

describe("saveProposalStepApi", () => {
  it("PATCHes the step with an encrypted body and drops undefined keys", async () => {
    apiMock.patch.mockResolvedValue({ data: { data: rawProposal() } });
    await saveProposalStepApi("42", "THANK_YOU", {
      status: "completed",
      summary: "Thank-you screen saved",
      data: { title: "Thanks" },
      next_step: undefined,
    });
    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(apiRoutes.proposal.step("42", "THANK_YOU"));
    const sent = decrypted(body);
    expect(sent).toMatchObject({ status: "completed", summary: "Thank-you screen saved", data: { title: "Thanks" } });
    expect("next_step" in sent).toBe(false);
  });
});

describe("step payloads", () => {
  it("General is in progress without a client", () => {
    expect(generalStepSave(general({ client_id: "" }), null)).toMatchObject({
      status: "in_progress",
      summary: "Proposal saved without client",
      next_step: "INTRODUCTION",
    });
    expect(generalStepSave(general(), null).status).toBe("completed");
  });

  it("Services carries the lines twice and the rate to 2dp only when multicurrency", () => {
    const save = servicesStepSave([recalculateLine(line({ description: "  Tax  " }))], {
      multicurrency: true,
      rate: 0.6543,
      edited: true,
    });
    expect(save.summary).toBe("1 service added");
    expect(save.services?.[0]).toMatchObject({ description: "Tax", amount: 198 });
    expect(save.data).toMatchObject({ is_multicurrency: true, exchange_rate: 0.65, is_exchange_rate_edited: true });

    const home = servicesStepSave([], { multicurrency: false, rate: 1.5, edited: true });
    expect(home.data).toMatchObject({ exchange_rate: null, is_exchange_rate_edited: false });
    expect(home.summary).toBe("0 services added");
  });

  it("Payments summarises the method", () => {
    expect(paymentStepSave({ payment_required: true, pay_method: "stripe" }).summary).toBe("Payment required via Stripe");
    expect(paymentStepSave({ payment_required: false, pay_method: "manual" }).summary).toBe("Payment not required");
  });

  it("Documents nulls empty fields", () => {
    const save = documentsStepSave([
      { name: " Engagement letter ", file_url: "https://x/a.pdf", mime_type: "", file_size: 10, status: "draft", fields: [] },
    ]);
    expect(save.documents?.[0]).toEqual({
      name: "Engagement letter",
      file_url: "https://x/a.pdf",
      mime_type: null,
      file_size: 10,
      status: "draft",
      fields: null,
    });
    expect(documentsStepSave([]).summary).toBe("No additional documents");
  });

  it("Terms moves on to Thank You, Thank You to Notification, and Notification is last", () => {
    expect(
      termsStepSave({ title: " T ", body: " <p>x</p> ", require_signature: false, signer_label: "" }),
    ).toMatchObject({ next_step: "THANK_YOU", data: { title: "T", body: "<p>x</p>" } });
    expect(thankYouStepSave({ title: "T", message: "M", button_label: "", button_url: "" }).next_step).toBe("NOTIFICATION");
    expect(notificationStepSave(defaultNotification()).next_step).toBeUndefined();
  });

  it("walks the steps in the preview tabs' order", () => {
    expect([
      generalStepSave(general(), null).next_step,
      introductionStepSave({ blocks: [] } as never).next_step,
      servicesStepSave([], { multicurrency: false, rate: null, edited: false }).next_step,
      documentsStepSave([]).next_step,
    ]).toEqual(["INTRODUCTION", "SERVICES", "ADD_DOCS", "PAYMENTS"]);
  });

  it("Notification builds the email channel row", () => {
    const save = notificationStepSave({
      send_notification: false,
      subject: "Your proposal",
      message_from: "me@example.com",
      email_body: "<p>Hi</p>",
      cc_emails: ["cc@example.com"],
    });
    expect(save.summary).toBe("Email notification disabled");
    expect(save.notifications?.[0]).toMatchObject({
      channel: "email",
      send_notification: false,
      recipients: ["cc@example.com"],
      content: { message_from: "me@example.com", subject: "Your proposal", email_body: "<p>Hi</p>" },
    });
  });

  it("Notification sends its attachments with the email row", () => {
    const files = [{ name: "a.pdf", url: "https://s3/a.pdf", size: 10, content_type: null }];
    const save = notificationStepSave({ ...defaultNotification(), attachments: files });
    expect(save.notifications?.[0]).toMatchObject({ content: { attachments: files } });
    expect(notificationStepSave({ ...defaultNotification(), attachments: undefined }).notifications?.[0]).toMatchObject({
      content: { attachments: [] },
    });
  });

  it("a proposal saved before subjects existed gets the default subject", () => {
    expect(defaultNotification().subject).toBe(DEFAULT_EMAIL_SUBJECT);
  });
});

describe("delete, mark paid, send", () => {
  it("deletes", async () => {
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await deleteProposalApi("42");
    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.proposal.delete("42"));
  });

  it("marks unpaid with an encrypted paid:false", async () => {
    apiMock.patch.mockResolvedValue({ data: { data: { payment_data: { payment_required: true, is_paid: false } } } });
    const payment = await markProposalPaidApi("42", false);
    const [url, body] = apiMock.patch.mock.calls[0];
    expect(url).toBe(apiRoutes.proposal.markPaid("42"));
    // The encryptor stringifies booleans — the backend parses "false".
    expect(decrypted(body).paid).toBe("false");
    expect(payment).toMatchObject({ required: true, paid: false });
  });

  it("reads the send outcome", async () => {
    apiMock.post.mockResolvedValue({
      data: { data: { response_url: "https://app/client-portal?token=x", email_sent: true } },
    });
    const result = await sendProposalApi("42");
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.proposal.send("42"));
    // Even an empty send travels as the encrypted envelope.
    expect(typeof apiMock.post.mock.calls[0][1].data).toBe("string");
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({});
    expect(result).toMatchObject({ responseUrl: "https://app/client-portal?token=x", outcome: "emailed" });
  });

  it("maps every email error to its outcome", () => {
    expect(sendOutcome({ email_sent: true })).toBe("emailed");
    expect(sendOutcome({ email_error: "Email notification disabled for this proposal" })).toBe("notification_disabled");
    expect(sendOutcome({ email_error: "No client email on file for this proposal" })).toBe("missing_email");
    expect(sendOutcome({ email_error: "SMTP down" })).toBe("email_failed");
    expect(sendOutcome({})).toBe("sent");
  });
});

describe("templates", () => {
  it("lists PROPOSAL templates, split into mine and system, with service counts", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: [
          { id: 3, user_id: 493, template_name: "Standard", description: null, snapshot_data: { services: [{}, {}] } },
          { id: 9, user_id: null, template_name: "AML Designated Services", snapshot_data: null },
        ],
      },
    });
    await expect(fetchProposalTemplates()).resolves.toMatchObject([
      { id: "3", name: "Standard", description: "", isSystem: false, serviceCount: 2 },
      { id: "9", name: "AML Designated Services", isSystem: true, serviceCount: 0, snapshot: {} },
    ]);
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.proposal.templates, { params: { template_type: "PROPOSAL" } });
  });

  it("creates from a template", async () => {
    apiMock.post.mockResolvedValue({ data: { data: { id: 77 } } });
    await expect(createProposalFromTemplateApi("3")).resolves.toBe("77");
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({ template_id: 3 });
  });

  it("saves a snapshot without editor-only flags", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    const state = builderStateFromProposal(rawProposal());
    state.introduction.blocks = [{ id: "a", type: "image", imageUploading: true, imageInputMode: "url", imageUrl: "u" }];
    await saveProposalTemplateApi(" Standard ", "", state);
    const sent = decrypted(apiMock.post.mock.calls[0][1]);
    expect(sent).toMatchObject({ template_type: "PROPOSAL", template_name: "Standard", description: "" });
    const snapshot = sent.snapshot_data as { introduction: { blocks: unknown[] }; thank_you: unknown };
    expect(snapshot.introduction.blocks).toEqual([{ id: "a", type: "image", imageUrl: "u" }]);
    expect(snapshot.thank_you).toBeDefined();
  });

  it("never saves the client into a template", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    const state = builderStateFromProposal(
      // Numbers, as the backend stores them.
      rawProposal({
        client_id: 37058,
        general_data: { client_id: 37058, contact_id: 33287, proposal_name: "Bookkeeping" } as never,
      }),
    );
    expect(state.general.client_id).toBe("37058");

    await saveProposalTemplateApi("Bookkeeping", "", state);
    const general = (decrypted(apiMock.post.mock.calls[0][1]).snapshot_data as { general: Record<string, unknown> }).general;
    expect(general.client_id).toBe("");
    expect(general.contact_id).toBe("");
    expect(general.proposal_name).toBe(state.general.proposal_name);
  });
});

describe("uploads", () => {
  it("uploads an image as FormData with the encrypted proposal id", async () => {
    apiMock.post.mockResolvedValue({ data: { data: "https://cdn/img.png" } });
    const file = new File(["x"], "logo.png", { type: "image/png" });
    await expect(uploadProposalImageApi("42", file)).resolves.toBe("https://cdn/img.png");
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.proposal.contentUpload);
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("file")).toBeInstanceOf(File);
    expect(decrypted(body).proposal_id).toBe("42");
  });

  it("returns the persisted document row, filling gaps from the file", async () => {
    apiMock.post.mockResolvedValue({ data: { data: { id: 5, file_url: "https://cdn/a.pdf" } } });
    const file = new File(["%PDF"], "letter.pdf", { type: "application/pdf" });
    const document = await uploadProposalDocumentApi("42", file);
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.proposal.documentUpload);
    const body = apiMock.post.mock.calls[0][1] as FormData;
    expect(body.get("file")).toBeInstanceOf(File);
    expect(decrypted(body).proposal_id).toBe("42");
    expect(document).toMatchObject({ id: "5", name: "letter.pdf", mime_type: "application/pdf", file_size: 4 });
  });

  it("throws when the upload has no file url", async () => {
    apiMock.post.mockResolvedValue({ data: { data: { id: 5 } } });
    await expect(uploadProposalDocumentApi("42", new File(["x"], "a.pdf"))).rejects.toThrow("Failed to upload a.pdf");
  });

  it("deletes a document", async () => {
    apiMock.delete.mockResolvedValue({});
    await deleteProposalDocumentApi("42", "5");
    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.proposal.documentDelete("42", "5"));
  });

  it("validates PDF type and the 10MB limit", () => {
    expect(documentFileIssue({ name: "a.PDF", size: 10 * 1024 * 1024 })).toBeNull();
    expect(documentFileIssue({ name: "a.pdf", size: 10 * 1024 * 1024 + 1 })).toMatch("10MB");
    expect(documentFileIssue({ name: "a.docx", size: 1 })).toMatch("only PDF");
  });
});

describe("contacts and stripe", () => {
  it("maps company contacts", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: [
          {
            contact_id: 21,
            client_id: 7,
            name: " Jo ",
            email: "jo@example.com",
            phone_number: "400111222",
            country_calling_code: "+61",
            client: { currency: "nzd", ABN: "123", company_type: "business", address: "1 St", business_name: "Acme" },
          },
          { contact_id: null, client_id: 1 },
        ],
      },
    });
    const contacts = await fetchProposalContacts();
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.companyContact.list, { params: { page: 1, limit: 1000, type: 1 } });
    expect(contacts).toEqual([
      {
        contactId: "21",
        clientId: "7",
        name: "Jo",
        email: "jo@example.com",
        currency: "NZD",
        businessName: "Acme",
        mobile: "+61400111222",
        abn: "123",
        companyType: "business",
        address: "1 St",
      },
    ]);
  });

  it("treats a failed Stripe lookup as not connected", async () => {
    apiMock.get.mockRejectedValueOnce(new Error("404"));
    await expect(fetchStripeConnected()).resolves.toBe(false);
    apiMock.get.mockResolvedValueOnce({ data: { data: { account: { onboarding_complete: true } } } });
    await expect(fetchStripeConnected()).resolves.toBe(true);
  });
});

describe("builder state", () => {
  it("seeds every step from a saved proposal", () => {
    const state = builderStateFromProposal(
      rawProposal({
        current_step: "TERMS_SIGN",
        general_data: { contact_id: "21", contract_length: "custom", contract_custom_length: "18", is_auto_expire: 1 } as never,
        services: [{ description: "Tax", quantity: "1", price: "50", gst_percent: null }],
        steps: [{ step_key: "SERVICES", section_data: { is_exchange_rate_edited: true, exchange_rate: "0.66" } }],
        introduction_data: { blocks: [{ id: "", type: "text", editorHtml: "<p>Hi</p>" }] as never },
        terms_data: { title: "Ours" },
        notification_data: { cc_emails: "bad" as never },
        payment_data: { payment_required: 1, pay_method: "sole_pay" },
      }),
    );
    expect(state.currentStep).toBe("Terms & Sign");
    expect(state.general).toMatchObject({
      proposal_name: "Annual advisory",
      client_id: "7",
      contact_id: "21",
      contract_length: "custom",
      contract_custom_length: "18",
      is_auto_expire: true,
    });
    expect(state.services[0]).toMatchObject({ quantity: 1, price: 50, gst_percent: 10 });
    expect(state.customRate).toBe(0.66);
    expect(state.introduction.blocks[0]).toMatchObject({ type: "text", isPrimary: true });
    expect(state.introduction.blocks[0].id).not.toBe("");
    expect(state.terms).toMatchObject({ title: "Ours", require_signature: true });
    expect(state.notification.cc_emails).toEqual([]);
    expect(state.payment).toEqual({ payment_required: true, pay_method: "solepay" });
    expect(state.client).toMatchObject({ id: "7", contact_id: "21", name: "Acme Pty Ltd" });
  });

  it("prefers the stored client snapshot", () => {
    const state = builderStateFromProposal(
      rawProposal({ client_snapshot: { id: "7", contact_id: "21", name: "Jo", email: "jo@x.com" } }),
    );
    expect(state.client).toMatchObject({ name: "Jo", email: "jo@x.com" });
  });

  it("builds the preview with payment state and bank", () => {
    const preview = previewFromProposal(
      rawProposal({
        sent_at: "2026-10-05",
        is_multicurrency: true,
        exchange_rate: "1.5",
        business: { name: "Firm", bank: { bsb: "062000", account_holder: "Firm", account_number: "1" } },
        payment_data: { payment_required: true, pay_method: "stripe", is_paid: true, paid_method: "stripe" },
      }),
    );
    expect(preview.general.issued_at).toBe("2026-10-05");
    expect(preview.exchange).toEqual({ is_multicurrency: true, exchange_rate: 1.5 });
    expect(preview.business.bank).toEqual({ account_holder: "Firm", bsb: "062000", account_number: "1" });
    expect(preview.payment).toMatchObject({ pay_method: "stripe", is_paid: true });
  });

  it("starts with a single primary text block and strips editor flags on save", () => {
    const [block] = initialIntroBlocks();
    expect(block).toMatchObject({ type: "text", isPrimary: true, editorHtml: "" });
    expect(blocksForSave([{ id: "a", type: "image", imageUploading: true, imageInputMode: "none" }])).toEqual([
      { id: "a", type: "image" },
    ]);
  });
});

describe("readiness and locks", () => {
  it("is 'Not saved' before a draft exists", () => {
    expect(proposalReadiness(null)).toMatchObject({ label: "Not saved", ready: false });
  });

  it("counts required steps still open", () => {
    const readiness = proposalReadiness(
      rawProposal({
        steps: [
          { step_key: "GENERAL", status: "completed", is_required: true },
          { step_key: "SERVICES", status: "in_progress", is_required: true },
          { step_key: "ADD_DOCS", status: "not_started", is_required: false },
        ],
      }),
    );
    expect(readiness).toMatchObject({ label: "In progress · 50%", ready: false, issues: 1 });
  });

  it("is ready with no issues, and reports a sent status as ready", () => {
    expect(proposalReadiness(rawProposal({ issue_count: 0, completion_percent: 100 }))).toMatchObject({
      label: "Ready to send",
      ready: true,
    });
    expect(proposalReadiness(rawProposal({ status: "accepted", issue_count: 0 }))).toMatchObject({
      label: "Accepted",
      tone: "success",
    });
  });

  it("lists progress in builder order", () => {
    const progress = stepProgress(rawProposal({ steps: [{ step_key: "PAYMENTS", status: "completed", summary: "Done" }] }));
    expect(progress.map((item) => item.step)).toEqual([
      "General",
      "Introduction",
      "Services",
      "Add. Docs.",
      "Payments",
      "Terms & Sign",
      "Thank You",
      "Notification",
    ]);
    expect(progress[4]).toMatchObject({ status: "completed", summary: "Done", isRequired: true });
    expect(progress[0].status).toBe("not_started");
  });

  it("locks edit on accepted or paid, delete only on paid", () => {
    const base = { required: true, method: "manual", paid: false, paidMethod: null, paidAt: null };
    expect(proposalLocks({ status: "accepted", payment: base })).toMatchObject({ lockEdit: true, lockDelete: false });
    expect(proposalLocks({ status: "sent", payment: { ...base, paid: true } })).toMatchObject({
      lockEdit: true,
      lockDelete: true,
      editReason: "Can't edit a paid proposal",
    });
    expect(proposalLocks({ status: "draft", payment: base })).toMatchObject({ lockEdit: false, lockDelete: false });
  });
});

describe("services maths", () => {
  it("applies discount before GST and rounds to cents", () => {
    expect(computeLine(line())).toEqual({
      subtotal: 200,
      discountAmount: 20,
      netAmount: 180,
      gstAmount: 18,
      amount: 198,
    });
  });

  it("clamps discount to 0–100 and GST at 0", () => {
    expect(computeLine(line({ discount_percent: 150, gst_percent: -5 })).amount).toBe(0);
    expect(computeLine(line({ discount_percent: -10, gst_percent: 0 })).amount).toBe(200);
  });

  it("totals every line", () => {
    const totals = serviceTotals([line(), line({ quantity: 1, discount_percent: 0, gst_percent: 0 })]);
    expect(totals).toEqual({ subtotal: 300, discount: 20, net: 280, gst: 18, total: 298 });
  });
});

describe("validation", () => {
  it("General — name, client, start date, custom length, expiry", () => {
    expect(generalIssues(general())).toEqual({});
    expect(
      generalIssues(
        general({
          proposal_name: " ",
          client_id: "",
          contract_start_type: "ON_SPECIFIC_DATE",
          contract_length: "custom",
          contract_custom_length: "0",
          is_auto_expire: true,
          expire_in_days: "0",
        }),
      ),
    ).toEqual({
      proposal_name: "Proposal name is required.",
      client_id: "Client is required.",
      contract_start_date: "Start date is required.",
      contract_custom_length: "Enter a valid custom month count.",
      expire_in_days: "Enter a valid expiry day count.",
    });
  });

  it("Services — at least one, qty > 0, price >= 0, discount 0–100", () => {
    expect(servicesIssues([]).services).toBe("Add at least one service.");
    expect(servicesIssues([line({ price: 0, discount_percent: 100 })]).rows).toEqual({});
    expect(
      servicesIssues([line({ description: " ", quantity: 0, price: -1, discount_percent: 101 })]).rows[0],
    ).toEqual({
      description: "Description is required.",
      quantity: "Qty must be greater than 0.",
      price: "Price cannot be negative.",
      discount_percent: "Discount must be 0–100%.",
    });
  });

  it("Terms — blank HTML counts as empty; signer label only when signing", () => {
    expect(termsIssues({ title: "T", body: "<p>&nbsp;</p>", require_signature: true, signer_label: " " })).toEqual({
      body: "Terms content is required.",
      signer_label: "Signer label is required.",
    });
    expect(termsIssues({ title: "T", body: "<p>x</p>", require_signature: false, signer_label: "" })).toEqual({});
  });

  it("Thank you — label needed only with a URL", () => {
    expect(thankYouIssues({ title: "T", message: "M", button_label: "", button_url: "https://x" })).toEqual({
      button_label: "Button label is required when URL is added.",
    });
    expect(thankYouIssues({ title: "", message: "", button_label: "", button_url: "" })).toEqual({
      title: "Thank-you title is required.",
      message: "Thank-you message is required.",
    });
  });
});

describe("template preview values", () => {
  it("has sample data for every merge tag", () => {
    const allTags = MERGE_TAG_GROUPS.flatMap((group) => group.tags.map((tag) => `{{${tag.key}}}`)).join(" ");
    expect(renderMergeTags(allTags, SAMPLE_MERGE_VALUES)).not.toMatch(/\{\{/);
  });
});

describe("helpers", () => {
  it("resolves known merge tags and leaves empty ones", () => {
    const values = mergeValues(
      { id: "7", contact_id: "", name: "Jo", email: "", currency: "AUD", business_name: "", mobile_no: "", ABN: "", company_type: "individual", address: "" },
      { name: "Firm", email: "f@x.com", phone: "" },
    );
    expect(values.client_business_structure).toBe("Individual");
    expect(values.proposal_name).toBe("");
    expect(mergeValues(null, { name: "", email: "", phone: "" }, { name: "Bookkeeping" }).proposal_name).toBe("Bookkeeping");
    expect(renderMergeTags("Hi {{ contact_addressee }} from {{firm_name}} {{firm_phone}} {{nope}}", values)).toBe(
      "Hi Jo from Firm {{firm_phone}} {{nope}}",
    );
  });

  it("embeds YouTube, Vimeo and Loom", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=abc&t=1")).toBe("https://www.youtube.com/embed/abc");
    expect(videoEmbedUrl("https://youtu.be/xyz?si=1")).toBe("https://www.youtube.com/embed/xyz");
    expect(videoEmbedUrl("https://youtube.com/shorts/s1?x")).toBe("https://www.youtube.com/embed/s1");
    expect(videoEmbedUrl("https://vimeo.com/123")).toBe("https://player.vimeo.com/video/123");
    expect(videoEmbedUrl("https://www.loom.com/share/l1")).toBe("https://www.loom.com/embed/l1");
    expect(videoEmbedUrl("https://example.com/v.mp4")).toBeNull();
  });

  it("splits the introduction at page breaks, dropping empty pages", () => {
    const pages = splitIntoPages([
      { id: "1", type: "text" },
      { id: "2", type: "page_break" },
      { id: "3", type: "page_break" },
      { id: "4", type: "image" },
    ]);
    expect(pages.map((page) => page.map((block) => block.id))).toEqual([["1"], ["4"]]);
  });

  it("walks the steps and maps keys", () => {
    expect(nextStep("General")).toBe("Introduction");
    expect(nextStep("Payments")).toBe("Terms & Sign");
    expect(nextStep("Thank You")).toBe("Notification");
    expect(nextStep("Notification")).toBeNull();
    expect(stepFromKey("ADD_DOCS")).toBe("Add. Docs.");
    expect(stepFromKey("NPS")).toBeNull();
  });

  it("reads SolePay (old and new spelling), and falls back to manual for anything unknown", () => {
    expect(normalisePaymentMethod("stripe")).toBe("stripe");
    expect(normalisePaymentMethod("solepay")).toBe("solepay");
    expect(normalisePaymentMethod("sole_pay")).toBe("solepay");
    expect(normalisePaymentMethod("bitcoin")).toBe("manual");
    expect(normalisePaymentMethod(undefined)).toBe("manual");
    expect(paymentMethodLabel("solepay")).toBe("SolePay");
  });

  it("labels contract start and length", () => {
    expect(contractStartLabel({ contract_start_type: "ON_ACCEPTANCE" })).toBe("On acceptance");
    expect(contractStartLabel({ contract_start_type: "ON_SPECIFIC_DATE" })).toBe("—");
    expect(contractLengthLabel({ contract_length: "1" })).toBe("1 month");
    expect(contractLengthLabel({ contract_length: "12" })).toBe("12 months");
    expect(contractLengthLabel({ contract_length: "custom", contract_custom_length: "18" })).toBe("18 months");
  });

  it("formats file sizes", () => {
    expect(formatFileSize(0)).toBe("");
    expect(formatFileSize(100)).toBe("1 KB");
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});

describe("nonNegative", () => {
  it("strips a minus, keeps decimals and an empty field", () => {
    expect(nonNegative("-5")).toBe("5");
    expect(nonNegative("12.50")).toBe("12.50");
    expect(nonNegative("")).toBe("");
    expect(nonNegative("-")).toBe("");
    expect(nonNegative("0")).toBe("0");
  });

  it("clamps to the max", () => {
    expect(nonNegative("150", 100)).toBe("100");
    expect(nonNegative("-20", 100)).toBe("20");
    expect(nonNegative("100", 100)).toBe("100");
  });
});

describe("isBlankHtml / hasBlockContent", () => {
  it("treats an image-only editor block as content", () => {
    const html = '<p><img src="https://s3.example.com/a.jpg" alt="a"></p>';
    expect(isBlankHtml(html)).toBe(false);
    expect(hasBlockContent({ id: "1", type: "text", editorHtml: html } as never)).toBe(true);
  });

  it("still treats empty paragraphs as blank", () => {
    expect(isBlankHtml("<p><br></p>")).toBe(true);
    expect(isBlankHtml("<p>&nbsp;</p>")).toBe(true);
  });
});

describe("builderStateFromProposal client id", () => {
  it("shows no client when the proposal has no client id", () => {
    // A proposal made from a template keeps the template's contact_id.
    const state = builderStateFromProposal({
      id: 12,
      client_id: null,
      general_data: { client_id: null, contact_id: 33287 },
      client_snapshot: {},
    } as never);
    expect(state.general.client_id).toBe("");
    expect(state.general.contact_id).toBe("");
    expect(state.client).toBeNull();
  });

  it("keeps the client when client_id is set", () => {
    const state = builderStateFromProposal({
      id: 13,
      client_id: 37058,
      general_data: { client_id: 37058, contact_id: 33287 },
      client_snapshot: { id: "37058", contact_id: "33287", name: "laxmi client", email: "l@example.com" },
    } as never);
    expect(state.general.client_id).toBe("37058");
    expect(state.general.contact_id).toBe("33287");
    expect(state.client?.name).toBe("laxmi client");
  });
});

describe("images through the proxy", () => {
  const S3 = "https://s3.ap-southeast-2.amazonaws.com/assets.soleapp.com.au/proposals/content/493/6/a b.jpeg";

  it("routes remote URLs through /api/proxy-image", () => {
    expect(proxiedImage(S3)).toBe(`/api/proxy-image?src=${encodeURIComponent(S3)}`);
  });

  it("leaves local, data and blob URLs, and empties, alone", () => {
    expect(proxiedImage("/logo.png")).toBe("/logo.png");
    expect(proxiedImage("data:image/png;base64,AA")).toBe("data:image/png;base64,AA");
    expect(proxiedImage("blob:http://localhost/1")).toBe("blob:http://localhost/1");
    expect(proxiedImage(null)).toBe("");
  });

  it("rewrites every editor image, keeping its other attributes", () => {
    const html = `<p><img src="${S3}" alt="a" style="width:117px"></p><p>text</p><img alt='b' src='https://x.test/b.png?w=1&amp;h=2'>`;
    const out = proxyHtmlImages(html);

    expect(out).toContain(`<img src="/api/proxy-image?src=${encodeURIComponent(S3)}" alt="a" style="width:117px">`);
    // &amp; is decoded before encoding, so the proxy fetches the real URL.
    expect(out).toContain(`<img alt='b' src='/api/proxy-image?src=${encodeURIComponent("https://x.test/b.png?w=1&h=2")}'>`);
    expect(out).toContain("<p>text</p>");
  });

  it("leaves HTML without images unchanged", () => {
    expect(proxyHtmlImages("<p>Hello <a href=\"https://x.test\">link</a></p>")).toBe(
      "<p>Hello <a href=\"https://x.test\">link</a></p>",
    );
  });
});

describe("template picker", () => {
  const template = (overrides: Record<string, unknown> = {}) => ({
    id: "9",
    name: "Bookkeeping Services (Hourly)",
    description: "Monthly books",
    isSystem: true,
    serviceCount: 1,
    snapshot: {
      general: { proposal_name: "Bookkeeping", currency_code: "AUD", contract_length: "12" },
      services: [{ description: "Bookkeeping", quantity: 10, price: 80, discount_percent: 0, discount_amount: 0, gst_percent: 10, gst_amount: 80, amount: 880 }],
      payment: { payment_required: true, pay_method: "manual" },
      introduction: { message_from: "", blocks: [{ id: "a", type: "text", editorHtml: "<p>Hi {{contact_addressee}}, from {{firm_name}}</p>" }] },
      terms: { title: "Terms", body: "<p>{{firm_name}} terms</p>", require_signature: true, signer_label: "Client" },
      thank_you: { title: "Thanks!", message: "Welcome" },
    },
    ...overrides,
  });

  it("searches name and description, ignoring case", () => {
    const list = [template(), template({ id: "10", name: "SEO Scope of Work", description: "" })] as never[];
    expect(filterProposalTemplates(list, "  seo ")).toHaveLength(1);
    expect(filterProposalTemplates(list, "MONTHLY")).toHaveLength(1);
    expect(filterProposalTemplates(list, "")).toHaveLength(2);
  });

  it("previews a template as the client will see it", () => {
    const business = { name: "Joshi PVT LTD", logo: "", bank: null };
    const preview = previewFromTemplate(template() as never, business);

    expect(preview.business).toBe(business);
    expect(preview.general.proposal_name).toBe("Bookkeeping");
    expect(preview.client).toBeNull();
    expect(preview.services).toHaveLength(1);
    expect(preview.services[0]).toMatchObject({ description: "Bookkeeping", amount: 880 });
    expect(preview.payment).toMatchObject({ payment_required: true, pay_method: "manual" });
    expect(preview.thankYou.title).toBe("Thanks!");
    // Every merge field reads as sample data, the firm's included.
    expect(preview.introduction.blocks[0].editorHtml).toBe("<p>Hi Alex Taylor, from Your Firm Pty Ltd</p>");
    expect(preview.terms.body).toBe("<p>Your Firm Pty Ltd terms</p>");
  });

  it("previews an empty system template without failing", () => {
    const preview = previewFromTemplate(template({ snapshot: {} }) as never, { name: "", logo: "", bank: null });
    expect(preview.general.proposal_name).toBe("Bookkeeping Services (Hourly)");
    expect(preview.services).toEqual([]);
  });
});

describe("templates page", () => {
  it("tabs exactly Proposal, Introduction, Terms & Sign, Thank You and Email", () => {
    expect(TEMPLATE_KINDS.map((kind) => kind.label)).toEqual(["Proposal", "Introduction", "Terms & Sign", "Thank You", "Email"]);
  });

  it("fetches one kind, with its content and updated date", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 1,
            user_id: null,
            template_type: "INTRODUCTION",
            template_name: "Standard Welcome",
            description: null,
            html_content: "<p>Hi there,</p>",
            updated_at: "2026-10-12T00:00:00.000Z",
          },
        ],
      },
    });
    const [intro] = await fetchTemplatesOfType("INTRODUCTION");
    expect(intro).toMatchObject({ subject: "", emailCategory: null, attachments: [], attachmentCount: 0 });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.proposal.templates, { params: { template_type: "INTRODUCTION" } });
    expect(intro).toMatchObject({
      id: "1",
      type: "INTRODUCTION",
      name: "Standard Welcome",
      isSystem: true,
      html: "<p>Hi there,</p>",
      updatedAt: "2026-10-12T00:00:00.000Z",
    });
  });

  it("summarises a card from its description, else its content", () => {
    const base = { id: "1", type: "INTRODUCTION", name: "x", isSystem: true, serviceCount: 0, snapshot: {}, content: null, updatedAt: null, full: true, summary: "", subject: "", emailCategory: null, attachments: [] as EmailFile[], attachmentCount: 0 } as const;
    expect(templateSummary({ ...base, description: "Short intro", html: "<p>ignored</p>" })).toBe("Short intro");
    expect(templateSummary({ ...base, description: "", html: "<p>Hi&nbsp;there,</p><p>Thank you &amp; welcome.</p>" })).toBe(
      "Hi there, Thank you & welcome.",
    );
    expect(templateSummary({ ...base, description: "", html: `<p>${"a".repeat(200)}</p>` }, 20)).toHaveLength(20);
    expect(templateSummary({ ...base, description: "", html: "<p><br></p>" })).toBe("");
  });
});

describe("servicePatchFromSuggestion", () => {
  const line = {
    description: "",
    quantity: "",
    price: "",
    discount_percent: 0,
    discount_amount: 0,
    gst_percent: 10,
    gst_amount: 0,
    amount: 0,
  } as never;

  it("takes the product's name and price, with a quantity of 1", () => {
    expect(servicePatchFromSuggestion({ name: "Bookkeeping", price: "250" }, line, 10)).toEqual({
      description: "Bookkeeping",
      price: "250",
      quantity: 1,
    });
  });

  it("keeps a quantity and price already set when the product has none", () => {
    const filled = { ...(line as object), quantity: 3, price: 99 } as never;
    expect(servicePatchFromSuggestion({ name: "Advisory", price: "" }, filled, 10)).toEqual({
      description: "Advisory",
      price: 99,
      quantity: 3,
    });
  });

  it("follows the product's own GST setting", () => {
    expect(servicePatchFromSuggestion({ name: "x", price: "1", gst: false }, line, 10)).toMatchObject({ gst_percent: 0 });
    expect(servicePatchFromSuggestion({ name: "x", price: "1", gst: true }, line, 15)).toMatchObject({ gst_percent: 15 });
  });
});

describe("proposal templates from the builder", () => {
  it("saves a template over itself with PUT, client-free", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    const state = builderStateFromProposal(
      rawProposal({ client_id: 37058, general_data: { client_id: 37058, contact_id: 33287 } as never }),
    );
    await updateProposalTemplateApi("12", " Bookkeeping ", "", state);
    const [url, body] = apiMock.put.mock.calls[0];
    expect(url).toBe(apiRoutes.proposal.template("12"));
    const sent = decrypted(body);
    // The encryptor sends null as ""; the backend stores an empty description as null.
    expect(sent).toMatchObject({ template_name: "Bookkeeping", description: "" });
    const snapshot = sent.snapshot_data as { general: Record<string, unknown> };
    expect(snapshot.general).toMatchObject({ client_id: "", contact_id: "" });
  });

  it("round-trips: a template read back into the builder keeps its content", () => {
    const state = builderStateFromProposal(rawProposal());
    const snapshot = proposalTemplateSnapshot(state);
    const reloaded = builderStateFromProposal(
      templateAsProposal({
        id: "12",
        type: "PROPOSAL",
        name: "Bookkeeping",
        description: "",
        isSystem: false,
        serviceCount: 0,
        snapshot,
        html: "",
        content: null,
        updatedAt: null,
        full: true,
        subject: "",
        emailCategory: null,
        attachments: [],
        attachmentCount: 0,
        summary: "",
      }),
    );
    expect(reloaded.services).toEqual(state.services);
    expect(reloaded.terms).toEqual(state.terms);
    expect(reloaded.thankYou).toEqual(state.thankYou);
    expect(reloaded.general.client_id).toBe("");
    expect(reloaded.client).toBeNull();
  });
});

describe("the slim template list", () => {
  it("reads the card fields the list now sends instead of the content", async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 52,
            user_id: null,
            template_type: "PROPOSAL",
            template_name: "Bookkeeping Services (Hourly)",
            description: null,
            updated_at: "2026-10-28T07:12:00.000Z",
            services_count: 5,
            summary: "",
          },
        ],
      },
    });
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 9,
            user_id: 493,
            template_type: "INTRODUCTION",
            template_name: "Warm welcome",
            services_count: "0",
            summary: "Hi there, thank you",
          },
        ],
      },
    });
    const [proposal] = await fetchTemplatesOfType("PROPOSAL");
    expect(proposal).toMatchObject({ id: "52", isSystem: true, serviceCount: 5, html: "", full: false, snapshot: {} });

    const [intro] = await fetchTemplatesOfType("INTRODUCTION");
    // No HTML in a list row — the card's line comes ready-made as plain text.
    expect(intro).toMatchObject({ serviceCount: 0, html: "", summary: "Hi there, thank you", full: false });
    expect(templateSummary(intro)).toBe("Hi there, thank you");
  });

  it("marks a template from GET /templates/:id as full", async () => {
    apiMock.get.mockResolvedValue({
      data: { data: [{ id: 3, template_type: "TERMS", template_name: "T", html_content: "<p>x</p>", lexical_content: null }] },
    });
    const [terms] = await fetchTemplatesOfType("TERMS");
    expect(terms.full).toBe(true);
  });
});

describe("reminders", () => {
  const email = (id: string, name: string, overrides: Record<string, unknown> = {}) =>
    ({
      id,
      type: "EMAIL",
      name,
      description: "",
      isSystem: true,
      serviceCount: 0,
      snapshot: {},
      html: `<p>${name}</p>`,
      content: null,
      updatedAt: null,
      full: true,
      summary: "",
      subject: `${name} subject`,
      emailCategory: "PROPOSAL_REMINDER",
      attachments: [],
      attachmentCount: 0,
      ...overrides,
    }) as Parameters<typeof reminderFromTemplate>[1];

  it("offers a reminder only while the client still has to answer", () => {
    expect(canSendReminder("sent")).toBe(true);
    expect(canSendReminder("viewed")).toBe(true);
    for (const status of ["draft", "accepted", "rejected", "lost", "expired"] as const) {
      expect(canSendReminder(status)).toBe(false);
    }
  });

  it("says why a reminder can't go yet", () => {
    expect(reminderBlockedReason("sent")).toBeNull();
    expect(reminderBlockedReason("viewed")).toBeNull();
    expect(reminderBlockedReason("draft")).toMatch(/Send the proposal first/);
    expect(reminderBlockedReason("accepted")).toMatch(/accepted/);
    expect(reminderBlockedReason("rejected")).toMatch(/declined/);
    expect(reminderBlockedReason("expired")).toMatch(/expired/);
    expect(reminderBlockedReason("lost")).toBeTruthy();
  });

  it("starts from Sole's Friendly Reminder, else any system reminder, else yours", () => {
    const mine = email("1", "My nudge", { isSystem: false });
    const checking = email("2", "Checking In");
    const friendly = email("3", "Friendly Reminder");
    const sent = email("4", "New Proposal Email", { emailCategory: "PROPOSAL_SENT" });
    expect(defaultReminderTemplate([mine, checking, friendly, sent])?.id).toBe("3");
    expect(defaultReminderTemplate([mine, checking, sent])?.id).toBe("2");
    expect(defaultReminderTemplate([mine, sent])?.id).toBe("1");
    expect(defaultReminderTemplate([sent])).toBeNull();
  });

  it("lists reminders first — yours, then Sole's — then every other email", () => {
    const groups = reminderTemplateGroups([
      email("1", "Checking In"),
      email("2", "My nudge", { isSystem: false }),
      email("3", "Thanks", { emailCategory: "PROPOSAL_THANK_YOU", isSystem: false }),
    ]);
    expect(groups).toEqual([
      { label: "My reminder templates", options: [{ id: "2", label: "My nudge" }] },
      { label: "System reminder templates", options: [{ id: "1", label: "Checking In · System" }] },
      { label: "Other email templates", options: [{ id: "3", label: "Thanks" }] },
    ]);
  });

  it("fills subject, message and files from a template, keeping the CCs", () => {
    const file = { name: "a.pdf", url: "https://s3/a.pdf", size: 1, content_type: null };
    const draft = reminderFromTemplate(
      { ...emptyReminderDraft(), cc_emails: ["cc@x.com"] },
      email("3", "Friendly Reminder", { attachments: [file] }),
    );
    expect(draft).toEqual({
      templateId: "3",
      subject: "Friendly Reminder subject",
      email_body: "<p>Friendly Reminder</p>",
      cc_emails: ["cc@x.com"],
      attachments: [file],
    });
  });

  it("has built-in reminder text for when there's no Reminder template", () => {
    const draft = defaultReminderDraft();
    expect(draft.templateId).toBeNull();
    expect(draft.subject).toContain("{{firm_name}}");
    expect(draft.email_body).toContain("{{contact_addressee}}");
    expect(draft.email_body).toContain("{{proposal_name}}");
    expect(reminderIssues(draft)).toEqual({});
  });

  it("needs a subject, a message and valid CCs", () => {
    const ok = { ...emptyReminderDraft(), subject: "Hi", email_body: "<p>x</p>" };
    expect(reminderIssues(ok)).toEqual({});
    expect(reminderIssues({ ...ok, subject: " " }).subject).toMatch(/required/);
    expect(reminderIssues({ ...ok, subject: "a".repeat(256) }).subject).toMatch(/255/);
    expect(reminderIssues({ ...ok, email_body: "<p><br></p>" }).email_body).toMatch(/required/);
    expect(reminderIssues({ ...ok, cc_emails: ["nope"] }).cc).toMatch(/nope/);
  });

  it("sends it encrypted to POST /proposal/:id/remind", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { client_email: "alex@example.com" } } });
    const file = { name: "a.pdf", url: "https://s3/a.pdf", size: 1, content_type: "application/pdf" };
    const result = await sendProposalReminderApi("12", {
      templateId: "3",
      subject: "  Reminder ",
      email_body: "<p>Hi</p>",
      cc_emails: ["cc@x.com"],
      attachments: [file],
    });
    expect(result).toEqual({ clientEmail: "alex@example.com" });
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.proposal.remind("12"));
    expect(decrypted(body)).toEqual({
      template_id: "3",
      subject: "Reminder",
      email_body: "<p>Hi</p>",
      cc_emails: ["cc@x.com"],
      attachments: [file],
    });
  });
});
