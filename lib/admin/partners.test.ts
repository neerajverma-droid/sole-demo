import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/axiosInstance", () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock("@/config/api-routes", () => ({
  default: {
    superAdmin: {
      partners: "/super/partners",
      partner: (id: string) => `/super/partners/${id}`,
      partnerKeys: (id: string) => `/super/partners/${id}/keys`,
      partnerKeyAction: (id: string, keyId: string, action: string) => `/super/partners/${id}/keys/${keyId}/${action}`,
    },
  },
}));

import api from "@/utils/axiosInstance";
import {
  EMPTY_PARTNER_FORM,
  formFromPartner,
  issueKeyApi,
  mapPartner,
  partnerBody,
  partnerErrorMessage,
  partnerFieldErrors,
  partnerFormIssues,
  partnerSlugify,
  toOrigin,
  type PartnerForm,
} from "@/lib/admin/partners";

const form = (patch: Partial<PartnerForm> = {}): PartnerForm => ({ ...EMPTY_PARTNER_FORM, name: "Acme", slug: "acme", ...patch });
const axiosError = (data: unknown) => Object.assign(new Error("Request failed"), { response: { data } });

describe("partnerSlugify", () => {
  it("makes a backend-valid slug from a name", () => {
    expect(partnerSlugify("Sole Practice Manager")).toBe("sole_practice_manager");
    expect(partnerSlugify("  Acme & Co. ")).toBe("acme_co");
    expect(partnerSlugify("123 Accounting")).toBe("accounting");
    expect(partnerSlugify("x".repeat(60))).toHaveLength(32);
  });
});

describe("toOrigin", () => {
  it("accepts https origins only (localhost http when allowed)", () => {
    expect(toOrigin("https://app.acme.com/path?q=1")).toBe("https://app.acme.com");
    expect(toOrigin("http://acme.com")).toBeNull();
    expect(toOrigin("javascript:alert(1)")).toBeNull();
    expect(toOrigin("http://localhost:3000/cb", true)).toBe("http://localhost:3000");
    expect(toOrigin("http://localhost:3000/cb", false)).toBeNull();
  });
});

describe("partnerFormIssues", () => {
  it("checks each step on its own", () => {
    expect(partnerFormIssues(form({ name: "", slug: "9bad" }), "details")).toEqual({
      name: expect.any(String),
      slug: expect.any(String),
    });
    expect(partnerFormIssues(form({ name: "", slug: "" }), "plans")).toEqual({});
  });

  it("requires a return address when accountant-paid billing is on (no plan choice)", () => {
    const issues = partnerFormIssues(form({ billingEnabled: true }));
    expect(issues.returnUrls).toBeTruthy();
    expect(partnerFormIssues(form({ billingEnabled: true, returnUrls: "https://a.com" }))).toEqual({});
    expect(partnerBody(form())).not.toHaveProperty("allowed_plans");
  });

  it("validates the cap, return addresses and branding", () => {
    expect(partnerFormIssues(form({ maxSponsored: "abc" })).maxSponsored).toBeTruthy();
    expect(partnerFormIssues(form({ maxSponsored: "" })).maxSponsored).toBeUndefined();
    expect(partnerFormIssues(form({ returnUrls: "https://ok.com\nhttp://bad.com" })).returnUrls).toContain("http://bad.com");
    const branding = { displayName: "", logoUrl: "http://x.com/l.png", supportEmail: "nope", website: "ftp://x" };
    expect(partnerFormIssues(form({ branding }))).toMatchObject({ logoUrl: expect.any(String), supportEmail: expect.any(String), website: expect.any(String) });
  });
});

describe("partnerBody", () => {
  it("normalises origins, drops empty branding and turns an empty cap into null", () => {
    const body = partnerBody(
      form({
        returnUrls: "https://app.acme.com/cb\nhttps://app.acme.com/other, https://b.com",
        maxSponsored: "",
        branding: { displayName: " Acme ", logoUrl: "", supportEmail: "", website: "" },
      }),
    );
    expect(body).toMatchObject({
      slug: "acme",
      return_url_allowlist: ["https://app.acme.com", "https://b.com"],
      max_sponsored_subscriptions: null,
      branding: { display_name: "Acme" },
    });
  });

  it("never sends the slug on update", () => {
    expect(partnerBody(form(), { includeSlug: false })).not.toHaveProperty("slug");
  });
});

describe("mapping", () => {
  it("round-trips a partner through the form", () => {
    const partner = mapPartner({
      id: 4,
      slug: "spm",
      name: "SPM",
      status: "live",
      billing_enabled: 1,
      max_sponsored_subscriptions: 20,
      return_url_allowlist: ["https://spm.app"],
      branding: { display_name: "SPM" },
    });
    expect(partner).toMatchObject({ id: "4", status: "live", billingEnabled: true, maxSponsoredSubscriptions: 20 });
    // No per-partner plans: every partner sells the whole subscription system.
    expect(partner).not.toHaveProperty("plans");
    expect(partner).not.toHaveProperty("allowedPlans");
    expect(formFromPartner(partner)).toMatchObject({ maxSponsored: "20", returnUrls: "https://spm.app" });
  });

  it("falls back to sandbox for an unknown status", () => {
    expect(mapPartner({ id: 1, status: "deleted" }).status).toBe("sandbox");
  });
});

describe("errors", () => {
  it("translates backend codes and field errors", () => {
    expect(partnerErrorMessage(axiosError({ code: "slug_taken", message: "raw" }), "x")).toBe("That slug is already used by another partner.");
    expect(partnerErrorMessage(axiosError({ code: "invalid_partner", details: { slug: "Bad slug." } }), "x")).toBe("Bad slug.");
    expect(partnerErrorMessage(new Error("boom"), "x")).toBe("boom");
    expect(partnerFieldErrors(axiosError({ details: { max_sponsored_subscriptions: "Too big.", other: "ignored" } }))).toEqual({
      maxSponsored: "Too big.",
    });
  });
});

describe("issueKeyApi", () => {
  it("returns the secret to the caller and nothing else keeps it", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { success: true, data: { client_id: "acme_sandbox_x", client_secret: "sps_test", key: { id: 1, client_id: "acme_sandbox_x", env: "sandbox", status: "active", scopes: ["plans:read"] } } },
    });
    const issued = await issueKeyApi("2", { env: "sandbox", scopes: ["plans:read"], label: " Test " });
    expect(issued).toMatchObject({ clientId: "acme_sandbox_x", clientSecret: "sps_test" });
    expect(issued.key).not.toHaveProperty("clientSecret");
    expect(vi.mocked(api.post).mock.calls[0]).toEqual(["/super/partners/2/keys", { env: "sandbox", scopes: ["plans:read"], label: "Test" }]);
  });

  it("refuses a response without a secret", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { success: true, data: { client_id: "x" } } });
    await expect(issueKeyApi("2", { env: "sandbox", scopes: ["plans:read"] })).rejects.toThrow();
  });
});
