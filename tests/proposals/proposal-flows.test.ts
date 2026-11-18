import { beforeEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "@/config/api-routes";
import { decryptPayload } from "@/utils/encrypt";

/**
 * The proposal module's main journeys, end to end against a mocked API:
 * each step's request, in order, with the body the backend will decrypt.
 */

const apiMock = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
vi.mock("@/utils/axiosInstance", () => ({ default: apiMock }));

const P = await import("@/lib/proposals");
const T = await import("@/lib/proposal-templates");
const { invalidateContactLists } = await import("@/hooks/use-contacts-query");

const decrypted = (body: unknown): Record<string, unknown> => {
  if (body instanceof FormData) return decryptPayload(String(body.get("data")));
  return decryptPayload((body as { data: string }).data);
};

const CLIENT = {
  id: "37058",
  contact_id: "33287",
  name: "Laxmi Client",
  email: "laxmi@example.com",
  currency: "AUD",
  business_name: "",
  mobile_no: "",
  ABN: "",
  company_type: "individual",
  address: "",
};

beforeEach(() => {
  Object.values(apiMock).forEach((fn) => fn.mockReset());
});

describe("creating and sending a proposal", () => {
  it("creates the draft, saves every step, then sends — each body encrypted", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: true, data: { id: 101 } } });
    apiMock.patch.mockResolvedValue({ data: { success: true, data: { id: 101, steps: [] } } });

    const general = { ...P.emptyGeneral(), proposal_name: "Website build", client_id: "37058", contact_id: "33287" };
    const created = await P.createProposalApi(general, CLIENT);
    expect(String(created.id)).toBe("101");
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.proposal.create);
    expect(decrypted(apiMock.post.mock.calls[0][1])).toMatchObject({ title: "Website build", client_id: 37058 });

    const services = [
      P.recalculateLine({
        description: "Bookkeeping",
        quantity: 2,
        price: 250,
        discount_percent: 10,
        discount_amount: 0,
        gst_percent: 10,
        gst_amount: 0,
        amount: 0,
      }),
    ];
    const steps: [string, ReturnType<typeof P.generalStepSave>][] = [
      ["GENERAL", P.generalStepSave(general, CLIENT)],
      ["SERVICES", P.servicesStepSave(services, { multicurrency: false, rate: null, edited: false })],
      ["PAYMENTS", P.paymentStepSave({ payment_required: true, pay_method: "manual" })],
      [
        "INTRODUCTION",
        P.introductionStepSave({
          message_from: "demo@soleapp.com.au",
          blocks: [{ id: "a", type: "text", isPrimary: true, editorHtml: "<p>Hi Laxmi</p>" }],
          signature: P.DEFAULT_SIGNATURE,
        }),
      ],
      ["ADD_DOCS", P.documentsStepSave([])],
      ["TERMS_SIGN", P.termsStepSave({ ...P.DEFAULT_TERMS, body: "<p>Terms</p>" })],
      ["NOTIFICATION", P.notificationStepSave({ ...P.defaultNotification(), message_from: "demo@soleapp.com.au" })],
      ["THANK_YOU", P.thankYouStepSave(P.DEFAULT_THANK_YOU)],
    ];
    for (const [key, save] of steps) await P.saveProposalStepApi("101", key, save);

    const stepCalls = apiMock.patch.mock.calls.map(([url, body]) => ({ url, body: decrypted(body) }));
    expect(stepCalls.map((call) => call.url)).toEqual(steps.map(([key]) => apiRoutes.proposal.step("101", key)));
    // Every step save is the encrypted envelope, and says whether it's complete.
    for (const call of stepCalls) expect(call.body).toHaveProperty("is_complete");
    expect(JSON.stringify(stepCalls[1].body)).toContain("Bookkeeping");

    apiMock.post.mockResolvedValueOnce({
      data: { data: { response_url: "http://localhost:3000/client-portal?token=abc", email_sent: true } },
    });
    const sent = await P.sendProposalApi("101");
    expect(apiMock.post.mock.calls[1][0]).toBe(apiRoutes.proposal.send("101"));
    expect(decrypted(apiMock.post.mock.calls[1][1])).toEqual({});
    expect(sent).toMatchObject({ outcome: "emailed", responseUrl: "http://localhost:3000/client-portal?token=abc" });
  });

  it("marks paid and unpaid, then deletes", async () => {
    apiMock.patch.mockResolvedValue({ data: { data: { payment_data: { payment_required: true, is_paid: true } } } });
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    await P.markProposalPaidApi("101", true);
    await P.markProposalPaidApi("101", false);
    expect(apiMock.patch.mock.calls.map(([url]) => url)).toEqual([
      apiRoutes.proposal.markPaid("101"),
      apiRoutes.proposal.markPaid("101"),
    ]);
    expect(apiMock.patch.mock.calls.map(([, body]) => decrypted(body).paid)).toEqual(["true", "false"]);

    await P.deleteProposalApi("101");
    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.proposal.delete("101"));
  });
});

describe("finding proposals", () => {
  it("filters the list by status and searches it on the server", async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, data: { rows: [], pagination: { total: 0 } } } });
    await P.fetchProposalsPage(1, 50, "website", "accepted");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.proposal.list, {
      params: { page: 1, limit: 50, search: "website", status: "accepted" },
    });
  });

  it("offers every status as a filter", () => {
    expect([...P.PROPOSAL_STATUSES]).toEqual(["draft", "sent", "viewed", "accepted", "rejected", "lost", "expired"]);
  });
});

describe("clients", () => {
  it("refreshes the proposal client list whenever a client changes anywhere", async () => {
    const keys: unknown[] = [];
    await invalidateContactLists({
      invalidateQueries: async ({ queryKey }: { queryKey: unknown }) => {
        keys.push(queryKey);
      },
    } as never);
    expect(keys).toContainEqual(["proposal-contacts"]);
  });

  it("opens with no client when the proposal has no client id", () => {
    const state = P.builderStateFromProposal({
      id: 12,
      client_id: null,
      general_data: { client_id: null, contact_id: 33287 },
      client_snapshot: {},
    } as never);
    expect(state.general.client_id).toBe("");
    expect(state.client).toBeNull();
  });
});

describe("templates, start to finish", () => {
  it("saves the builder as a new template, client-free", async () => {
    apiMock.post.mockResolvedValue({ data: { success: true } });
    const state = P.builderStateFromProposal({
      id: 101,
      client_id: 37058,
      title: "Website build",
      general_data: { client_id: 37058, contact_id: 33287 },
    } as never);
    await P.saveProposalTemplateApi("Website build", "", state);

    const body = decrypted(apiMock.post.mock.calls[0][1]);
    expect(apiMock.post.mock.calls[0][0]).toBe(apiRoutes.proposal.templates);
    expect(body).toMatchObject({ template_type: "PROPOSAL", template_name: "Website build" });
    expect((body.snapshot_data as { general: Record<string, unknown> }).general).toMatchObject({
      client_id: "",
      contact_id: "",
    });
  });

  it("edits your own proposal template in template mode and saves it back over itself", async () => {
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          id: 12,
          user_id: 493,
          template_type: "PROPOSAL",
          template_name: "Bookkeeping",
          snapshot_data: {
            general: { proposal_name: "Bookkeeping" },
            services: [{ description: "Books", quantity: 1, price: 100, amount: 110, gst_percent: 10 }],
            terms: { title: "Terms & Conditions", body: "<p>T</p>", require_signature: true, signer_label: "Client" },
          },
        },
      },
    });
    apiMock.put.mockResolvedValue({ data: { success: true } });

    const loaded = await T.fetchTemplateApi("12");
    expect(loaded).toMatchObject({ type: "PROPOSAL", isSystem: false, full: true });
    const state = P.builderStateFromProposal(P.templateAsProposal(loaded));
    expect(state.services[0]).toMatchObject({ description: "Books", price: 100 });
    expect(state.terms.body).toBe("<p>T</p>");

    await P.updateProposalTemplateApi("12", "Bookkeeping v2", "Monthly", state);
    expect(apiMock.put.mock.calls[0][0]).toBe(apiRoutes.proposal.template("12"));
    expect(decrypted(apiMock.put.mock.calls[0][1])).toMatchObject({
      template_name: "Bookkeeping v2",
      description: "Monthly",
    });
  });

  it("creates a proposal from a template", async () => {
    apiMock.post.mockResolvedValue({ data: { data: { id: 202 } } });
    await expect(P.createProposalFromTemplateApi("12")).resolves.toBe("202");
    expect(decrypted(apiMock.post.mock.calls[0][1])).toEqual({ template_id: 12 });
  });

  it("creates, renames, duplicates and deletes a section template", async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: true, data: { id: 60 } } });
    apiMock.put.mockResolvedValue({ data: { success: true } });
    apiMock.post.mockResolvedValueOnce({ data: { success: true, data: { id: 61 } } });
    apiMock.delete.mockResolvedValue({ data: { success: true } });

    const form = { ...T.emptyTemplateForm(), name: "Standard terms", body: "<p>Pay in 14 days</p>" };
    await expect(T.createTemplateApi("TERMS", form)).resolves.toBe("60");
    await T.renameTemplateApi("60", "Standard terms v2");
    await expect(T.duplicateTemplateApi("60")).resolves.toBe("61");
    await T.deleteTemplateApi("61");

    expect(decrypted(apiMock.post.mock.calls[0][1])).toMatchObject({ template_type: "TERMS", html_content: "<p>Pay in 14 days</p>" });
    expect(decrypted(apiMock.put.mock.calls[0][1])).toEqual({ template_name: "Standard terms v2" });
    expect(apiMock.post.mock.calls[1][0]).toBe(apiRoutes.proposal.templateDuplicate("60"));
    expect(apiMock.delete).toHaveBeenCalledWith(apiRoutes.proposal.template("61"));
  });

  it("lists one kind per tab, light — the content comes per template", async () => {
    apiMock.get.mockResolvedValue({
      data: { data: [{ id: 53, user_id: null, template_name: "Proposal Introduction", summary: "A warm opening", services_count: 0 }] },
    });
    const [row] = await P.fetchTemplatesOfType("INTRODUCTION");
    expect(apiMock.get).toHaveBeenCalledWith(apiRoutes.proposal.templates, { params: { template_type: "INTRODUCTION" } });
    expect(row).toMatchObject({ full: false, html: "", summary: "A warm opening", isSystem: true });
  });
});
