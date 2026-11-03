import { describe, expect, it } from "vitest";

import {
  canEdit,
  DEFAULT_PREFERENCES,
  formatRangeLabel,
  formattingOf,
  PACK_ROUTES,
  reportTitle,
  fromStarter,
  preferencesFrom,
  presetRange,
  fromTemplate,
  isGenerating,
  isPreviewStale,
  nextStep,
  pruneOrphanedComments,
  reorder,
  statusLabel,
  toPackInput,
  type PackInput,
  type PackTemplate,
  type ReportPack,
} from "@/lib/report-packs";

const pack = (overrides: Partial<ReportPack> = {}): ReportPack => ({
  id: 10,
  name: "Monthly",
  description: null,
  access: "business",
  template_id: null,
  period_preset: "This quarter",
  period_from: "2026-07-01",
  period_to: "2026-09-30",
  status: "draft",
  generation_status: "idle",
  generation_error: null,
  orientation: "portrait",
  negative_format: "brackets",
  currency: "AUD",
  cover_enabled: 1,
  cover_title: "Board pack",
  cover_subtitle: null,
  cover_image_url: null,
  include_toc: 1,
  toc_style: "dotted",
  disclaimer_text: null,
  pdf_url: null,
  pdf_page_count: null,
  pdf_generated_at: null,
  version: 3,
  approved_at: null,
  published_at: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  reports: ["profit-loss", "balance-sheet"],
  comments: [
    {
      report_key: "profit-loss",
      body: "Margins improved.",
      display: "below_report",
    },
  ],
  attachments: [],
  ...overrides,
});

describe("reorder", () => {
  it("moves an item down", () => {
    expect(reorder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("moves an item up", () => {
    expect(reorder(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("moves an item one step", () => {
    expect(reorder(["a", "b", "c"], 1, 0)).toEqual(["b", "a", "c"]);
  });

  it("returns the same order when nothing moves", () => {
    const items = ["a", "b", "c"];
    expect(reorder(items, 1, 1)).toBe(items);
  });

  it("ignores an index outside the list", () => {
    const items = ["a", "b"];
    expect(reorder(items, -1, 1)).toBe(items);
    expect(reorder(items, 0, 5)).toBe(items);
    expect(reorder(items, 5, 0)).toBe(items);
  });

  it("does not mutate the original", () => {
    const items = ["a", "b", "c"];
    reorder(items, 0, 2);
    expect(items).toEqual(["a", "b", "c"]);
  });
});

describe("isGenerating", () => {
  it("is true while queued or running", () => {
    expect(isGenerating({ generation_status: "queued" })).toBe(true);
    expect(isGenerating({ generation_status: "running" })).toBe(true);
  });

  it("is false once it settles", () => {
    expect(isGenerating({ generation_status: "idle" })).toBe(false);
    expect(isGenerating({ generation_status: "succeeded" })).toBe(false);
    expect(isGenerating({ generation_status: "failed" })).toBe(false);
  });
});

describe("canEdit", () => {
  it("allows a settled draft", () => {
    expect(canEdit({ status: "draft", generation_status: "idle" })).toBe(true);
  });

  it("locks an approved pack until it's reopened", () => {
    expect(
      canEdit({ status: "approved", generation_status: "succeeded" }),
    ).toBe(false);
  });

  it("locks a published pack", () => {
    expect(
      canEdit({ status: "published", generation_status: "succeeded" }),
    ).toBe(false);
  });

  it("locks a pack mid-generation", () => {
    expect(canEdit({ status: "draft", generation_status: "running" })).toBe(
      false,
    );
  });
});

describe("statusLabel", () => {
  it("names each status", () => {
    expect(statusLabel("draft")).toBe("Draft");
    expect(statusLabel("approved")).toBe("Approved");
    expect(statusLabel("published")).toBe("Published");
  });
});

describe("toPackInput", () => {
  it("carries the version, so a save can detect a lost race", () => {
    expect(toPackInput(pack()).version).toBe(3);
  });

  it("turns the 0/1 flags into booleans the form can bind to", () => {
    const input = toPackInput(pack({ cover_enabled: 0, include_toc: 1 }));
    expect(input.cover_enabled).toBe(false);
    expect(input.include_toc).toBe(true);
  });

  it("keeps the report order", () => {
    expect(toPackInput(pack()).reports).toEqual([
      "profit-loss",
      "balance-sheet",
    ]);
  });

  it("strips comment ids, which the server assigns", () => {
    expect(toPackInput(pack()).comments).toEqual([
      {
        report_key: "profit-loss",
        body: "Margins improved.",
        display: "below_report",
      },
    ]);
  });
});

describe("fromTemplate", () => {
  const template: PackTemplate = {
    id: 5,
    name: "Month end",
    description: null,
    access: "business",
    orientation: "landscape",
    negative_format: "minus",
    disclaimer_text: "Liability limited.",
    disclaimer_file_url: null,
    version: 1,
    report_count: 2,
    reports: ["profit-loss", "cash-flow"],
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };

  it("copies the reports and formatting", () => {
    const input = fromTemplate(template, {
      from: "2026-07-01",
      to: "2026-09-30",
      preset: "This quarter",
    });

    expect(input.reports).toEqual(["profit-loss", "cash-flow"]);
    expect(input.orientation).toBe("landscape");
    expect(input.negative_format).toBe("minus");
    expect(input.disclaimer_text).toBe("Liability limited.");
  });

  it("links the pack back to its template", () => {
    expect(
      fromTemplate(template, { from: "2026-07-01", to: "2026-09-30" })
        .template_id,
    ).toBe(5);
  });

  it("names the pack from the template and the period", () => {
    const input = fromTemplate(template, {
      from: "2026-07-01",
      to: "2026-09-30",
      preset: "This quarter",
    });
    expect(input.name).toBe("Month end — This quarter");
  });

  it("falls back to the start date when there is no preset", () => {
    const input = fromTemplate(template, {
      from: "2026-07-01",
      to: "2026-09-30",
    });
    expect(input.name).toBe("Month end — 2026-07-01");
    expect(input.period_preset).toBeNull();
  });

  it("keeps the name inside the column limit", () => {
    const input = fromTemplate(
      { ...template, name: "x".repeat(200) },
      { from: "2026-07-01", to: "2026-09-30" },
    );
    expect(input.name.length).toBeLessThanOrEqual(160);
  });
});

describe("fromTemplate hardening", () => {
  const bare = {
    id: 5,
    name: "Month end",
    description: null,
    access: "business" as const,
    orientation: "portrait" as const,
    negative_format: "brackets" as const,
    disclaimer_text: null,
    disclaimer_file_url: null,
    version: 1,
    report_count: 0,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };

  it("yields an empty report list rather than undefined when a template arrives without one", () => {
    const input = fromTemplate(
      { ...bare, reports: undefined as unknown as string[] },
      {
        from: "2026-07-01",
        to: "2026-09-30",
      },
    );

    expect(input.reports).toEqual([]);
  });
});

describe("reorder hardening", () => {
  it("returns an empty list when handed something that is not an array", () => {
    expect(reorder(undefined as unknown as string[], 0, 1)).toEqual([]);
  });
});

describe("isPreviewStale", () => {
  it("is stale when there is no preview at all", () => {
    expect(
      isPreviewStale(pack({ pdf_url: null, pdf_generated_at: null })),
    ).toBe(true);
  });

  it("is fresh when the pack has not changed since it was generated", () => {
    const at = "2026-10-21T10:00:00Z";
    expect(
      isPreviewStale(
        pack({
          pdf_url: "https://s3/p.pdf",
          pdf_generated_at: at,
          updated_at: at,
        }),
      ),
    ).toBe(false);
  });

  it("is stale once the pack is saved after generating", () => {
    expect(
      isPreviewStale(
        pack({
          pdf_url: "https://s3/p.pdf",
          pdf_generated_at: "2026-10-21T10:00:00Z",
          updated_at: "2026-10-21T10:05:00Z",
        }),
      ),
    ).toBe(true);
  });

  it("does not claim staleness from timestamps it cannot read", () => {
    expect(
      isPreviewStale(
        pack({
          pdf_url: "https://s3/p.pdf",
          pdf_generated_at: "garbage",
          updated_at: "garbage",
        }),
      ),
    ).toBe(false);
  });
});

describe("nextStep", () => {
  const fresh = {
    pdf_url: "https://s3/p.pdf",
    pdf_generated_at: "2026-10-21T10:00:00Z",
    updated_at: "2026-10-21T10:00:00Z",
  };

  it("asks to save a pack that does not exist yet", () => {
    expect(nextStep(null, false)).toBe("save");
  });

  it("asks to save before anything else when there are unsaved edits", () => {
    expect(nextStep(pack(fresh), true)).toBe("save");
  });

  it("asks for a preview when none has been generated", () => {
    expect(
      nextStep(pack({ pdf_url: null, pdf_generated_at: null }), false),
    ).toBe("preview");
  });

  it("asks for a fresh preview when the pack changed after the last one", () => {
    expect(
      nextStep(pack({ ...fresh, updated_at: "2026-10-21T11:00:00Z" }), false),
    ).toBe("regenerate");
  });

  it("offers approval once a current preview exists", () => {
    expect(nextStep(pack(fresh), false)).toBe("approve");
  });

  it("offers publishing once approved", () => {
    expect(nextStep(pack({ ...fresh, status: "approved" }), false)).toBe(
      "publish",
    );
  });

  it("has nothing left to do once published", () => {
    expect(nextStep(pack({ ...fresh, status: "published" }), false)).toBe(
      "published",
    );
  });
});

describe("pruneOrphanedComments", () => {
  const draft = (overrides: Partial<PackInput> = {}): PackInput => ({
    name: "Monthly",
    period_from: "2026-07-01",
    period_to: "2026-09-30",
    reports: ["profit-loss", "balance-sheet"],
    comments: [],
    ...overrides,
  });

  it("drops a comment naming a report that was removed from the pack", () => {
    const next = pruneOrphanedComments(
      draft({
        reports: ["balance-sheet"],
        comments: [
          { report_key: "profit-loss", body: "Stale", display: "below_report" },
        ],
      }),
    );

    expect(next.comments).toEqual([]);
  });

  it("keeps a comment for a report that's still in the pack", () => {
    const next = pruneOrphanedComments(
      draft({
        comments: [
          {
            report_key: "profit-loss",
            body: "Still here",
            display: "below_report",
          },
        ],
      }),
    );

    expect(next.comments).toEqual([
      {
        report_key: "profit-loss",
        body: "Still here",
        display: "below_report",
      },
    ]);
  });

  it("keeps a pack-level comment regardless of which reports remain", () => {
    const next = pruneOrphanedComments(
      draft({
        reports: [],
        comments: [
          { report_key: null, body: "Overall note", display: "below_report" },
        ],
      }),
    );

    expect(next.comments).toEqual([
      { report_key: null, body: "Overall note", display: "below_report" },
    ]);
  });

  it("drops only the orphan, keeping comments that still belong", () => {
    const next = pruneOrphanedComments(
      draft({
        reports: ["balance-sheet"],
        comments: [
          { report_key: "profit-loss", body: "Stale", display: "below_report" },
          { report_key: "balance-sheet", body: "Kept", display: "own_page" },
        ],
      }),
    );

    expect(next.comments).toEqual([
      { report_key: "balance-sheet", body: "Kept", display: "own_page" },
    ]);
  });

  it("is exactly what a removed-then-reapplied report scenario needs: nothing survives an empty report list", () => {
    const next = pruneOrphanedComments(
      draft({
        reports: [],
        comments: [
          {
            report_key: "profit-loss",
            body: "Orphaned",
            display: "below_report",
          },
        ],
      }),
    );

    expect(next.comments).toEqual([]);
  });

  it("returns the same object when nothing needed pruning, so it never marks an untouched draft as changed", () => {
    const input = draft({
      comments: [
        { report_key: "profit-loss", body: "Fine", display: "below_report" },
      ],
    });
    expect(pruneOrphanedComments(input)).toBe(input);
  });

  it("treats a missing comments array as empty rather than throwing", () => {
    const input = draft();
    delete (input as { comments?: unknown }).comments;

    expect(() => pruneOrphanedComments(input)).not.toThrow();
  });
});

describe("preferencesFrom", () => {
  it("turns stored 0/1 flags into booleans", () => {
    expect(
      preferencesFrom({
        hide_zero_balances: 1,
        show_cents: 0,
        show_currency_symbol: 1,
        logo_on_every_page: 1,
        confidential: 0,
      }),
    ).toMatchObject({
      hide_zero_balances: true,
      show_cents: false,
      show_currency_symbol: true,
      logo_on_every_page: true,
      confidential: false,
    });
  });

  it("falls back to the defaults for fields the server has not sent yet", () => {
    expect(preferencesFrom({})).toEqual(DEFAULT_PREFERENCES);
    expect(preferencesFrom(null)).toEqual(DEFAULT_PREFERENCES);
  });

  it("passes booleans from a form draft straight through", () => {
    expect(
      preferencesFrom({
        show_cents: false,
        logo_position: "center",
        logo_size: "large",
      }),
    ).toMatchObject({
      show_cents: false,
      logo_position: "center",
      logo_size: "large",
    });
  });
});

describe("fromStarter", () => {
  const starter = {
    key: "monthly-management",
    name: "Monthly management pack",
    description: "P&L and Balance Sheet.",
    periodPreset: "Last month",
    reports: ["profit-loss", "balance-sheet"],
  };

  it("builds a pack with the starter's reports and the default look", () => {
    const input = fromStarter(starter, {
      from: "2026-09-01",
      to: "2026-09-30",
      preset: "Last month",
    });

    expect(input.reports).toEqual(["profit-loss", "balance-sheet"]);
    expect(input.template_id).toBeNull();
    expect(input).toMatchObject({
      cover_enabled: true,
      include_toc: true,
      ...DEFAULT_PREFERENCES,
    });
    expect(input.name).toBe("Monthly management pack — Last month");
  });
});

describe("fromTemplate carries the template's styling", () => {
  it("copies the logo choice and preferences", () => {
    const input = fromTemplate(
      {
        id: 5,
        name: "Board",
        description: null,
        access: "business",
        orientation: "portrait",
        negative_format: "brackets",
        disclaimer_text: null,
        disclaimer_file_url: null,
        cover_image_url: "https://s3.example.com/board-logo.png",
        version: 1,
        report_count: 1,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z",
        reports: ["profit-loss"],
        confidential: 1,
        show_cents: 0,
      },
      { from: "2026-07-01", to: "2026-09-30" },
    );

    expect(input.cover_image_url).toBe("https://s3.example.com/board-logo.png");
    expect(input).toMatchObject({ confidential: true, show_cents: false });
  });
});

describe("period helpers", () => {
  it("resolves a preset to ISO dates", () => {
    const range = presetRange("Last month");
    expect(range.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(range.to > range.from).toBe(true);
  });

  it("formats a range the way the report screens do", () => {
    expect(formatRangeLabel("2026-07-01", "2026-09-30")).toBe(
      "1 Jul 2026 – 30 Sep 2026",
    );
  });

  it("gives an empty label rather than a broken one when a date is missing", () => {
    expect(formatRangeLabel("", "2026-09-30")).toBe("");
  });
});

describe("shared helpers", () => {
  it("fills formatting defaults from whatever a row is missing", () => {
    expect(formattingOf({})).toMatchObject({
      negative_format: "brackets",
      orientation: "portrait",
      logo_position: "center",
      logo_on_every_page: true,
      show_cents: true,
    });
  });

  it("reads stored 0/1 flags as booleans", () => {
    expect(
      formattingOf({
        show_cents: 0 as unknown as boolean,
        confidential: 1 as unknown as boolean,
      }),
    ).toMatchObject({
      show_cents: false,
      confidential: true,
    });
  });

  it("names a report by its catalogue title, falling back to its key", () => {
    const catalogue = [{ key: "profit-loss", title: "Profit & Loss" }];
    expect(reportTitle(catalogue, "profit-loss")).toBe("Profit & Loss");
    expect(reportTitle(catalogue, "unknown")).toBe("unknown");
  });

  it("builds pack and template routes from one place", () => {
    expect(PACK_ROUTES.pack(7)).toBe("/reports/packs/7");
    expect(PACK_ROUTES.template(3)).toBe("/reports/packs/templates/3");
  });
});
