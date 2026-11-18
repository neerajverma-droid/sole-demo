import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const {
  blocksWorthSaving,
  createTemplateApi,
  deleteTemplateApi,
  duplicateTemplateApi,
  emptyTemplateForm,
  fetchTemplateApi,
  forgetTemplate,
  formFromTemplate,
  refreshTemplate,
  templateQueryKey,
  templateQueryOptions,
  kindFromSlug,
  proposalTemplateBuilderUrl,
  renameIssue,
  renameTemplateApi,
  templateContent,
  templateEditorUrl,
  templateIssues,
  templatePayload,
  templatePreviewUrl,
  attachmentProblem,
  formatFileSize,
  uploadEmailAttachmentApi,
  templatesListUrl,
  previewFromSectionTemplate,
  SECTION_PREVIEW_TAB,
  updateTemplateApi,
  uploadTemplateImageApi,
} = await import("@/lib/proposal-templates");

function decrypted(body: unknown): Record<string, unknown> {
  if (body instanceof FormData) return decryptPayload(String(body.get("data")));
  return decryptPayload((body as { data: string }).data);
}

const template = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "7",
    type: "INTRODUCTION",
    name: "Warm welcome",
    description: "",
    isSystem: false,
    serviceCount: 0,
    snapshot: {},
    html: "",
    content: null,
    updatedAt: null,
    ...overrides,
  }) as never;

beforeEach(() => {
  Object.values(apiMock).forEach((fn) => fn.mockReset());
});

describe("routes", () => {
  it("maps URL slugs to kinds, defaulting to proposals", () => {
    expect(kindFromSlug("introduction")).toBe("INTRODUCTION");
    expect(kindFromSlug("terms")).toBe("TERMS");
    expect(kindFromSlug("thank-you")).toBe("THANK_YOU");
    expect(kindFromSlug("next")).toBe("PROPOSAL");
    expect(kindFromSlug(undefined)).toBe("PROPOSAL");
  });

  it("builds list and editor URLs", () => {
    expect(templatesListUrl("PROPOSAL")).toBe("/proposals/templates");
    expect(templatesListUrl("TERMS")).toBe("/proposals/templates?type=terms");
    expect(templateEditorUrl("THANK_YOU")).toBe("/proposals/templates/editor?type=thank-you");
    expect(templateEditorUrl("INTRODUCTION", "7")).toBe("/proposals/templates/editor?type=introduction&id=7");
    expect(proposalTemplateBuilderUrl()).toBe("/proposals/new?mode=template");
    expect(proposalTemplateBuilderUrl("12")).toBe("/proposals/new?mode=template&template_id=12");
  });
});

describe("reading a template into the editor", () => {
  it("reads introduction blocks, primary first", () => {
    const form = formFromTemplate(
      template({ content: { blocks: [{ id: "a", type: "text", editorHtml: "<p>Hi</p>" }, { id: "b", type: "image", imageUrl: "u" }] } }),
    );
    expect(form.blocks.map((block) => [block.type, block.isPrimary])).toEqual([
      ["text", true],
      ["image", false],
    ]);
  });

  it("reads an older single-HTML introduction as one text block", () => {
    const form = formFromTemplate(template({ html: "<p>Hi there,</p>" }));
    expect(form.blocks).toHaveLength(1);
    expect(form.blocks[0]).toMatchObject({ type: "text", isPrimary: true, editorHtml: "<p>Hi there,</p>" });
  });

  it("reads thank-you fields, and terms from their HTML", () => {
    const thankYou = formFromTemplate(
      template({ type: "THANK_YOU", content: { title: "Thanks!", message: "Welcome", button_label: 3 } }),
    );
    expect(thankYou.thankYou).toEqual({ title: "Thanks!", message: "Welcome", button_label: "", button_url: "" });
    expect(formFromTemplate(template({ type: "TERMS", html: "<p>Terms</p>" })).body).toBe("<p>Terms</p>");
  });
});

describe("validation", () => {
  const form = (overrides: Record<string, unknown> = {}) => ({ ...emptyTemplateForm(), name: "Standard", ...overrides });

  it("needs a name of at most 100 characters", () => {
    expect(templateIssues("TERMS", form({ name: "  ", body: "<p>x</p>" })).name).toMatch(/required/);
    expect(templateIssues("TERMS", form({ name: "a".repeat(101), body: "<p>x</p>" })).name).toMatch(/100/);
  });

  it("needs content of the right kind", () => {
    expect(templateIssues("TERMS", form({ body: "<p><br></p>" })).content).toBeTruthy();
    expect(templateIssues("TERMS", form({ body: "<p>Pay in 14 days</p>" })).content).toBeUndefined();
    expect(templateIssues("INTRODUCTION", form()).content).toBeTruthy();
    expect(
      templateIssues("INTRODUCTION", form({ blocks: [{ id: "a", type: "text", editorHtml: "" }, { id: "b", type: "image", imageUrl: "u" }] }))
        .content,
    ).toBeUndefined();
    expect(templateIssues("THANK_YOU", form()).content).toBeTruthy();
    expect(
      templateIssues("THANK_YOU", form({ thankYou: { title: "Thanks", message: "", button_label: "", button_url: "" } })).content,
    ).toBeUndefined();
  });

  it("checks renames, allowing proposal templates longer names", () => {
    expect(renameIssue(" ", "TERMS")).toMatch(/Enter a name/);
    expect(renameIssue("a".repeat(101), "TERMS")).toMatch(/100/);
    expect(renameIssue("a".repeat(191), "PROPOSAL")).toBeNull();
    expect(renameIssue("a".repeat(192), "PROPOSAL")).toMatch(/191/);
  });
});

describe("content per kind", () => {
  it("saves introduction blocks without empties, UI flags or dangling page breaks", () => {
    const blocks = [
      { id: "a", type: "text", editorHtml: "<p>Hi</p>", isPrimary: true },
      { id: "b", type: "image", imageUrl: "", imageUploading: false, imageInputMode: "url" },
      { id: "c", type: "page_break" },
      { id: "d", type: "page_break" },
      { id: "e", type: "video", videoUrl: "https://youtu.be/x" },
      { id: "f", type: "page_break" },
    ] as never[];
    expect(blocksWorthSaving(blocks).map((block: { id: string }) => block.id)).toEqual(["a", "d", "e"]);

    const content = templateContent("INTRODUCTION", { ...emptyTemplateForm(), blocks });
    expect(content).toEqual({
      lexical_content: {
        blocks: [
          { id: "a", type: "text", editorHtml: "<p>Hi</p>", isPrimary: true },
          { id: "d", type: "page_break", isPrimary: false },
          { id: "e", type: "video", videoUrl: "https://youtu.be/x", isPrimary: false },
        ],
      },
      html_content: "<p>Hi</p>",
    });
  });

  it("saves terms as HTML", () => {
    expect(templateContent("TERMS", { ...emptyTemplateForm(), body: "<p>Terms</p>" })).toEqual({
      lexical_content: null,
      html_content: "<p>Terms</p>",
    });
  });

  it("saves thank-you as its fields, with escaped HTML for the list", () => {
    const content = templateContent("THANK_YOU", {
      ...emptyTemplateForm(),
      thankYou: { title: " Thanks <3 ", message: "A & B", button_label: "Book", button_url: " https://x.test " },
    });
    expect(content).toEqual({
      lexical_content: { title: "Thanks <3", message: "A & B", button_label: "Book", button_url: "https://x.test" },
      html_content: "<h2>Thanks &lt;3</h2><p>A &amp; B</p>",
    });
  });

  it("sends the type only on create", () => {
    const form = { ...emptyTemplateForm(), name: " Standard ", description: "  ", body: "<p>x</p>" };
    expect(templatePayload("TERMS", form, "create")).toEqual({
      template_type: "TERMS",
      template_name: "Standard",
      description: null,
      lexical_content: null,
      html_content: "<p>x</p>",
    });
    expect(templatePayload("TERMS", form, "update")).not.toHaveProperty("template_type");
  });
});

describe("email templates", () => {
  const email = (overrides: Record<string, unknown> = {}) => ({
    ...emptyTemplateForm(),
    name: "Friendly Reminder",
    subject: "Reminder: {{proposal_name}}",
    emailCategory: "PROPOSAL_REMINDER" as const,
    body: "<p>Hi {{contact_addressee}},</p>",
    ...overrides,
  });

  it("has its own tab and editor URL", () => {
    expect(kindFromSlug("email")).toBe("EMAIL");
    expect(templatesListUrl("EMAIL")).toBe("/proposals/templates?type=email");
    expect(templateEditorUrl("EMAIL", "9")).toBe("/proposals/templates/editor?type=email&id=9");
  });

  it("starts a new email as a proposal-sent email with no subject", () => {
    expect(emptyTemplateForm()).toMatchObject({ subject: "", emailCategory: "PROPOSAL_SENT" });
  });

  it("reads the subject, use and body back into the editor", () => {
    const form = formFromTemplate(
      template({ type: "EMAIL", subject: "Hi", emailCategory: "PROPOSAL_THANK_YOU", html: "<p>Thanks</p>" }),
    );
    expect(form).toMatchObject({ subject: "Hi", emailCategory: "PROPOSAL_THANK_YOU", body: "<p>Thanks</p>" });
    // An email saved before categories existed reads as a proposal-sent one.
    expect(formFromTemplate(template({ type: "EMAIL", emailCategory: null })).emailCategory).toBe("PROPOSAL_SENT");
  });

  it("needs a subject of at most 255 characters and a body", () => {
    expect(templateIssues("EMAIL", email())).toEqual({});
    expect(templateIssues("EMAIL", email({ subject: "  " })).subject).toMatch(/required/);
    expect(templateIssues("EMAIL", email({ subject: "a".repeat(256) })).subject).toMatch(/255/);
    expect(templateIssues("EMAIL", email({ body: "<p><br></p>" })).content).toBeTruthy();
  });

  it("sends the subject and use with the body as HTML", () => {
    expect(templatePayload("EMAIL", email({ subject: "  Reminder  " }), "create")).toEqual({
      template_type: "EMAIL",
      template_name: "Friendly Reminder",
      description: null,
      subject: "Reminder",
      email_category: "PROPOSAL_REMINDER",
      attachments: [],
      lexical_content: null,
      html_content: "<p>Hi {{contact_addressee}},</p>",
    });
    expect(templatePayload("EMAIL", email(), "update")).toMatchObject({ subject: "Reminder: {{proposal_name}}" });
  });

  it("sends no subject or use for other kinds", () => {
    const payload = templatePayload("TERMS", email(), "create");
    expect(payload).not.toHaveProperty("subject");
    expect(payload).not.toHaveProperty("email_category");
  });

  it("creates encrypted", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 50 } } });
    await expect(createTemplateApi("EMAIL", email())).resolves.toBe("50");
    expect(decrypted(apiMock.post.mock.calls[0][1])).toMatchObject({
      template_type: "EMAIL",
      subject: "Reminder: {{proposal_name}}",
      email_category: "PROPOSAL_REMINDER",
    });
  });
});

describe("full-page preview, as the client receives it", () => {
  const business = { name: "Joshi PVT LTD", logo: "", bank: null };

  it("opens every kind on one same-tab URL", () => {
    expect(templatePreviewUrl("7")).toBe("/proposals/templates/7/preview");
    expect(SECTION_PREVIEW_TAB).toEqual({ INTRODUCTION: "Introduction", TERMS: "Terms", THANK_YOU: "Thank You", EMAIL: "Email" });
  });

  it("addresses a sample client and proposal", () => {
    const preview = previewFromSectionTemplate(template({ type: "TERMS", html: "<p>x</p>" }), business);
    expect(preview.client).toMatchObject({ name: "Alex Taylor", email: "alex.taylor@example.com" });
    expect(preview.general.proposal_name).toBe("Sample Proposal");
    expect(preview.business).toBe(business);
  });

  it("fills the introduction, merge fields as sample data", () => {
    const preview = previewFromSectionTemplate(
      template({ content: { blocks: [{ id: "a", type: "text", editorHtml: "<p>Hi {{contact_addressee}}</p>" }] } }),
      business,
    );
    expect(preview.introduction.blocks[0].editorHtml).toBe("<p>Hi Alex Taylor</p>");
  });

  it("fills terms and thank-you", () => {
    expect(
      previewFromSectionTemplate(template({ type: "TERMS", html: "<p>{{firm_name}} terms</p>" }), business).terms.body,
    ).toBe("<p>Your Firm Pty Ltd terms</p>");
    const thankYou = previewFromSectionTemplate(
      template({ type: "THANK_YOU", content: { title: "Thanks {{contact_addressee}}", message: "From {{firm_name}}" } }),
      business,
    ).thankYou;
    expect(thankYou).toMatchObject({ title: "Thanks Alex Taylor", message: "From Your Firm Pty Ltd" });
  });

  it("fills the email with its subject and body, always as sent", () => {
    const { notification } = previewFromSectionTemplate(
      template({
        type: "EMAIL",
        subject: "Reminder: {{proposal_name}}",
        emailCategory: "PROPOSAL_REMINDER",
        html: "<p>Hi {{contact_addressee}}, from {{firm_name}} ({{firm_email}})</p>",
      }),
      business,
    );
    expect(notification).toMatchObject({
      send_notification: true,
      cc_emails: [],
      subject: "Reminder: Sample Proposal",
      email_body: "<p>Hi Alex Taylor, from Your Firm Pty Ltd (hello@yourfirm.com.au)</p>",
    });
  });
});

describe("email attachments", () => {
  const MB = 1024 * 1024;
  const pdf = (name: string, size = 1000) => ({ name, url: `https://s3/${name}`, size });

  it("allows documents and images, up to 10 files and 10 MB, each once", () => {
    expect(attachmentProblem([], [{ name: "Fees.PDF", size: 10 }])).toBeNull();
    expect(attachmentProblem([], [{ name: "run.exe", size: 10 }])).toMatch(/can’t be attached/);
    const ten = Array.from({ length: 10 }, (_, i) => pdf(`${i}.pdf`));
    expect(attachmentProblem(ten, [{ name: "x.pdf", size: 1 }])).toMatch(/up to 10 files/);
    expect(attachmentProblem([pdf("a.pdf", 6 * MB)], [{ name: "b.pdf", size: 5 * MB }])).toMatch(/10 MB/);
    expect(attachmentProblem([pdf("a.pdf", 10)], [{ name: "a.pdf", size: 10 }])).toMatch(/already attached/);
    expect(attachmentProblem([], [{ name: "a.pdf", size: 10 }, { name: "a.pdf", size: 10 }])).toMatch(/already attached/);
  });

  it("shows sizes as KB or MB", () => {
    expect(formatFileSize(200)).toBe("1 KB");
    expect(formatFileSize(5 * 1024)).toBe("5 KB");
    expect(formatFileSize(2.5 * MB)).toBe("2.5 MB");
    expect(formatFileSize(null)).toBe("");
  });

  it("uploads one file, encrypted as FormData, and returns it ready to list", async () => {
    apiMock.post.mockResolvedValue({
      data: { success: true, data: { name: "Fees.pdf", url: "https://s3/fees.pdf", size: 1200, content_type: "application/pdf" } },
    });
    const file = new File(["x"], "Fees.pdf", { type: "application/pdf" });
    await expect(uploadEmailAttachmentApi(file)).resolves.toEqual({
      name: "Fees.pdf",
      url: "https://s3/fees.pdf",
      size: 1200,
      content_type: "application/pdf",
    });
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.proposal.emailAttachmentUpload);
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("fails when the upload returns no url", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: {} } });
    await expect(uploadEmailAttachmentApi(new File(["x"], "a.pdf"))).rejects.toThrow(/a\.pdf/);
  });

  it("reads, saves and previews an email's attachments", () => {
    const files = [{ name: "Fees.pdf", url: "https://s3/fees.pdf", size: 1200, content_type: "application/pdf" }];
    const saved = template({ type: "EMAIL", subject: "Hi", html: "<p>x</p>", attachments: files });
    const form = formFromTemplate(saved);
    expect(form.attachments).toEqual(files);
    expect(templatePayload("EMAIL", { ...form, name: "With files" }, "update")).toMatchObject({ attachments: files });
    expect(templatePayload("TERMS", { ...form, name: "T" }, "update")).not.toHaveProperty("attachments");
    const preview = previewFromSectionTemplate(saved, { name: "", logo: "", bank: null });
    expect(preview.notification.attachments).toEqual(files);
    expect(preview.emailKind).toBe("proposal");
    // A sample line gives the email's total card an amount: $1,200 + 10% tax.
    expect(preview.services.reduce((sum, line) => sum + Number(line.amount), 0)).toBe(1320);
    expect(
      previewFromSectionTemplate(template({ type: "EMAIL", emailCategory: "PROPOSAL_REMINDER", subject: "R", html: "<p>r</p>" }), {
        name: "",
        logo: "",
        bank: null,
      }).emailKind,
    ).toBe("reminder");
  });
});

describe("calls", () => {
  const form = { ...emptyTemplateForm(), name: "Standard", body: "<p>x</p>" };

  it("creates through the existing endpoint, encrypted", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 41 } } });
    await expect(createTemplateApi("TERMS", form)).resolves.toBe("41");
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.proposal.templates);
    expect(decrypted(body)).toMatchObject({ template_type: "TERMS", template_name: "Standard", html_content: "<p>x</p>" });
  });

  it("updates and renames with PUT /proposal/templates/:id", async () => {
    apiMock.put.mockResolvedValue({ data: { success: true } });
    await updateTemplateApi("41", "TERMS", form);
    await renameTemplateApi("41", "  New name ");
    expect(apiMock.put.mock.calls[0][0]).toBe(apiRoutes.proposal.template("41"));
    expect(decrypted(apiMock.put.mock.calls[0][1])).toMatchObject({ template_name: "Standard", html_content: "<p>x</p>" });
    expect(decrypted(apiMock.put.mock.calls[1][1])).toEqual({ template_name: "New name" });
  });

  it("duplicates and deletes", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 42 } } });
    apiMock.delete.mockResolvedValue({ data: { success: true } });
    await expect(duplicateTemplateApi("41")).resolves.toBe("42");
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.proposal.templateDuplicate("41"));
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({});
    await deleteTemplateApi("41");
    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.proposal.template("41"));
  });

  it("uploads an introduction image without a proposal", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true, data: "https://s3/img.png" } });
    const file = new File(["x"], "logo.png", { type: "image/png" });
    await expect(uploadTemplateImageApi(file)).resolves.toBe("https://s3/img.png");
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(apiRoutes.proposal.contentUpload);
    expect((body as FormData).get("file")).toBeInstanceOf(File);
    expect(decrypted(body)).toEqual({});
  });

  it("gets one template by id", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { id: 41, user_id: 493, template_type: "TERMS", template_name: "Standard", html_content: "<p>x</p>" },
      },
    });
    await expect(fetchTemplateApi("41")).resolves.toMatchObject({
      id: "41",
      type: "TERMS",
      name: "Standard",
      isSystem: false,
      html: "<p>x</p>",
      full: true,
      subject: "",
      emailCategory: null,
      attachments: [],
      attachmentCount: 0,
    });
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.proposal.template("41"));
  });

  it("fails when the template isn't there", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true } });
    await expect(fetchTemplateApi("404")).rejects.toThrow("Template not found.");
  });

  it("fails an upload that returns no URL", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    await expect(uploadTemplateImageApi(new File(["x"], "a.png"))).rejects.toThrow("Failed to upload a.png");
  });
});

describe("one template, cached for the session", () => {
  const row = { id: 41, user_id: 493, template_type: "TERMS", template_name: "Standard", html_content: "<p>x</p>" };

  it("asks the API once, however many times it's opened", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: row } });
    const queryClient = new QueryClient();

    const first = await queryClient.fetchQuery(templateQueryOptions("41"));
    const second = await queryClient.fetchQuery(templateQueryOptions("41"));

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("asks again after it's edited or renamed", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: row } });
    const queryClient = new QueryClient();
    await queryClient.fetchQuery(templateQueryOptions("41"));

    await refreshTemplate(queryClient, "41");
    await queryClient.fetchQuery(templateQueryOptions("41"));

    expect(apiMock.get).toHaveBeenCalledTimes(2);
  });

  it("forgets it once deleted", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: row } });
    const queryClient = new QueryClient();
    await queryClient.fetchQuery(templateQueryOptions("41"));

    forgetTemplate(queryClient, "41");
    expect(queryClient.getQueryData(templateQueryKey("41"))).toBeUndefined();
  });
});
