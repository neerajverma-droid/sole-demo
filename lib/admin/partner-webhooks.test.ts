import { describe, expect, it } from "vitest";

import {
  describeAttempt,
  formFromWebhook,
  isWebhookUrl,
  mapDelivery,
  mapWebhook,
  webhookBody,
  webhookFormIssues,
} from "@/lib/admin/partner-webhooks";

describe("mapWebhook", () => {
  it("maps the API shape, treating an empty event list as all events", () => {
    expect(mapWebhook({ url: "https://p.example.com/h", enabled: true, events: [], has_secret: true })).toMatchObject({
      url: "https://p.example.com/h",
      enabled: true,
      events: null,
      hasSecret: true,
    });
  });

  it("falls back safely when fields are missing", () => {
    const webhook = mapWebhook(undefined);
    expect(webhook).toMatchObject({ url: null, enabled: false, events: null, hasSecret: false });
    expect(webhook.availableEvents).toContain("referral.signed_up");
  });
});

describe("mapDelivery", () => {
  it("keeps known statuses and defaults the rest to pending", () => {
    expect(mapDelivery({ id: 3, status: "delivered", last_status_code: 202 })).toMatchObject({
      id: "3",
      status: "delivered",
      lastStatusCode: 202,
    });
    expect(mapDelivery({ id: 4, status: "weird" }).status).toBe("pending");
  });
});

describe("webhook form", () => {
  const base = { url: "https://p.example.com/hooks", enabled: false, allEvents: true, events: [] };

  it("round-trips settings into the request body", () => {
    const form = formFromWebhook(mapWebhook({ url: "https://p.example.com/hooks", enabled: true, events: ["referral.paying"] }));
    expect(form).toEqual({ url: "https://p.example.com/hooks", enabled: true, allEvents: false, events: ["referral.paying"] });
    expect(webhookBody(form)).toEqual({
      webhook_url: "https://p.example.com/hooks",
      webhook_enabled: true,
      webhook_events: ["referral.paying"],
    });
    expect(webhookBody({ ...base, url: "  " })).toEqual({ webhook_url: null, webhook_enabled: false, webhook_events: null });
  });

  it("asks for a URL and a secret before deliveries can be on", () => {
    expect(webhookFormIssues({ ...base, url: "", enabled: true }, true).enabled).toMatch(/URL/);
    expect(webhookFormIssues({ ...base, enabled: true }, false).enabled).toMatch(/secret/);
    expect(webhookFormIssues({ ...base, enabled: true }, true)).toEqual({});
  });

  it("rejects a non-https URL and an empty event choice", () => {
    expect(webhookFormIssues({ ...base, url: "http://p.example.com" }, true).url).toBeDefined();
    expect(webhookFormIssues({ ...base, allEvents: false, events: [] }, true).events).toBeDefined();
  });
});

describe("isWebhookUrl", () => {
  it("allows https, and http://localhost only while developing", () => {
    expect(isWebhookUrl("https://p.example.com/h", false)).toBe(true);
    expect(isWebhookUrl("http://localhost:8080/api/events/sole", true)).toBe(true);
    expect(isWebhookUrl("http://localhost:8080/api/events/sole", false)).toBe(false);
    expect(isWebhookUrl("https://user:pw@p.example.com/h", true)).toBe(false);
  });
});

describe("describeAttempt", () => {
  it("reads as a short sentence", () => {
    expect(describeAttempt({ delivered: true, statusCode: 202, error: null })).toBe("Delivered (202)");
    expect(describeAttempt({ delivered: false, statusCode: 500, error: "HTTP 500" })).toBe("Not delivered: HTTP 500");
  });
});
