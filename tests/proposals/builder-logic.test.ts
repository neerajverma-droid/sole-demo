import { describe, expect, it, vi } from "vitest";

import {
  STEP_TAB,
  TAB_STEP,
  TEMPLATE_HIDDEN_STEPS,
  DEFAULT_SECTION_TEMPLATES,
  autoFillSection,
  defaultSectionTemplate,
  draftBlocker,
  introductionIsBlank,
  termsIsBlank,
  thankYouIsUntouched,
  introBlocksFromTemplate,
  missingRequiredSteps,
  nextVisibleStep,
  templateHoverAction,
  templateMenuItems,
  templateModeProgress,
  templateOptions,
  termsBodyFromTemplate,
  thankYouFromTemplate,
  visibleStages,
} from "@/lib/proposal-builder-logic";
import {
  DEFAULT_SIGNATURE,
  DEFAULT_TERMS,
  DEFAULT_THANK_YOU,
  PROPOSAL_STAGES,
  PROPOSAL_STEPS,
  emptyGeneral,
  initialIntroBlocks,
  type ProposalTemplate,
} from "@/lib/proposals";

const template = (overrides: Partial<ProposalTemplate> = {}): ProposalTemplate => ({
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
  summary: "",
  full: true,
  subject: "",
  emailCategory: null,
  attachments: [],
  attachmentCount: 0,
  ...overrides,
});

describe("building a proposal: step order", () => {
  it("walks every step in order, Payments and Add. Docs. included", () => {
    const order: string[] = [];
    let step: (typeof PROPOSAL_STEPS)[number] | null = "General";
    while (step) {
      order.push(step);
      step = nextVisibleStep(step, false);
    }
    expect(order).toEqual([...PROPOSAL_STEPS]);
    expect(order).toEqual(expect.arrayContaining(["Payments", "Add. Docs."]));
  });

  it("lists every stage as is outside template mode", () => {
    expect(visibleStages(false)).toBe(PROPOSAL_STAGES);
  });
});

describe("building a template (template mode)", () => {
  it("leaves out Payments and Add. Docs.", () => {
    expect(TEMPLATE_HIDDEN_STEPS).toEqual(["Payments", "Add. Docs."]);
    const steps = visibleStages(true).flatMap((stage) => stage.steps);
    expect(steps).not.toContain("Payments");
    expect(steps).not.toContain("Add. Docs.");
    expect(steps).toEqual(["General", "Introduction", "Services", "Terms & Sign", "Thank You", "Notification"]);
  });

  it("moves past the steps it leaves out", () => {
    expect(nextVisibleStep("General", true)).toBe("Introduction");
    expect(nextVisibleStep("Services", true)).toBe("Terms & Sign");
    expect(nextVisibleStep("Thank You", true)).toBe("Notification");
  });

  it("ends on Notification, the step whose button saves the template", () => {
    expect(nextVisibleStep("Notification", true)).toBeNull();
    const stages = visibleStages(true);
    expect(stages.at(-1)?.steps.at(-1)).toBe("Notification");
  });

  it("keeps progress locally — a step is complete once its button is pressed", () => {
    const progress = templateModeProgress(["General", "Services"]);
    const status = Object.fromEntries(progress.map((item) => [item.step, item.status]));
    expect(status.General).toBe("completed");
    expect(status.Services).toBe("completed");
    expect(status.Introduction).toBe("not_started");
    expect(progress.map((item) => item.step)).toEqual([...PROPOSAL_STEPS]);
  });
});

describe("filling a step from a saved template", () => {
  it("copies an introduction's blocks with fresh ids, primary first", () => {
    let next = 0;
    const blocks = introBlocksFromTemplate(
      template({
        content: {
          blocks: [
            { id: "a", type: "text", editorHtml: "<p>Hi {{contact_addressee}}</p>" },
            { id: "b", type: "image", imageUrl: "https://s3/x.png" },
          ],
        },
      }),
      () => `fresh-${++next}`,
    );
    expect(blocks.map((block) => block.id)).toEqual(["fresh-1", "fresh-2"]);
    expect(blocks[0]).toMatchObject({ type: "text", isPrimary: true, editorHtml: "<p>Hi {{contact_addressee}}</p>" });
    expect(blocks[1]).toMatchObject({ type: "image", imageUrl: "https://s3/x.png", isPrimary: false });
  });

  it("reads an older single-HTML introduction as one text block", () => {
    const blocks = introBlocksFromTemplate(template({ html: "<p>Hello</p>" }), () => "x");
    expect(blocks).toEqual([expect.objectContaining({ type: "text", isPrimary: true, editorHtml: "<p>Hello</p>" })]);
  });

  it("takes a terms template's HTML as the body", () => {
    expect(termsBodyFromTemplate(template({ type: "TERMS", html: "<p>Terms</p>" }))).toBe("<p>Terms</p>");
  });

  it("takes a thank-you template's fields", () => {
    expect(
      thankYouFromTemplate(
        template({ type: "THANK_YOU", content: { title: "Thanks!", message: "Welcome", button_label: "Book", button_url: "https://x" } }),
      ),
    ).toEqual({ title: "Thanks!", message: "Welcome", button_label: "Book", button_url: "https://x" });
  });

  it("refuses a thank-you template with nothing to use, so the screen isn't wiped", () => {
    expect(thankYouFromTemplate(template({ type: "THANK_YOU", html: "<h2>Old</h2>", content: null }))).toBeNull();
  });

  it("offers your own templates first, then the system ones, labelled", () => {
    const options = templateOptions([
      template({ id: "1", name: "Standard Welcome", isSystem: true }),
      template({ id: "2", name: "Mine" }),
      template({ id: "3", name: "Proposal Introduction", isSystem: true }),
    ]);
    expect(options.mine).toEqual([{ id: "2", label: "Mine" }]);
    expect(options.system).toEqual([
      { id: "1", label: "Standard Welcome · System" },
      { id: "3", label: "Proposal Introduction · System" },
    ]);
  });
});

describe("the preview panel follows the steps, and back", () => {
  it("maps every step to its tab", () => {
    expect(STEP_TAB).toEqual({
      General: "Cover",
      Services: "Services",
      "Add. Docs.": "Documents",
      Payments: "Pricing",
      Introduction: "Introduction",
      "Terms & Sign": "Terms",
      Notification: "Email",
      "Thank You": "Thank You",
    });
  });

  it("opens the step behind a tab", () => {
    expect(TAB_STEP.Cover).toBe("General");
    expect(TAB_STEP.Pricing).toBe("Payments");
    expect(TAB_STEP.Terms).toBe("Terms & Sign");
    expect(TAB_STEP.Email).toBe("Notification");
  });

  it("gives Add. Docs. its own Documents tab, between Services and Pricing", () => {
    expect(STEP_TAB["Add. Docs."]).toBe("Documents");
    expect(TAB_STEP.Documents).toBe("Add. Docs.");
  });

  it("round-trips every mapped step", () => {
    for (const [step, tab] of Object.entries(STEP_TAB)) {
      expect(TAB_STEP[tab as keyof typeof TAB_STEP]).toBe(step);
    }
  });
});

describe("template cards", () => {
  it("hover: Create proposal on any proposal template", () => {
    expect(templateHoverAction(template({ type: "PROPOSAL" }))).toEqual({ action: "create", label: "Create proposal" });
    expect(templateHoverAction(template({ type: "PROPOSAL", isSystem: true }))).toEqual({
      action: "create",
      label: "Create proposal",
    });
  });

  it("hover: Edit your own section template, Duplicate a system one", () => {
    expect(templateHoverAction(template({ type: "TERMS" }))).toEqual({ action: "edit", label: "Edit" });
    expect(templateHoverAction(template({ type: "TERMS", isSystem: true }))).toEqual({
      action: "duplicate",
      label: "Duplicate",
    });
  });

  it("menu: your own proposal template — preview, use, edit, duplicate, rename, delete", () => {
    expect(templateMenuItems(template({ type: "PROPOSAL" }))).toEqual([
      "preview",
      "use",
      "edit",
      "duplicate",
      "rename",
      "delete",
    ]);
  });

  it("menu: a system proposal template can't be changed, only copied", () => {
    expect(templateMenuItems(template({ type: "PROPOSAL", isSystem: true }))).toEqual([
      "preview",
      "use",
      "duplicate",
      "duplicate-edit",
    ]);
  });

  it("menu: section templates have no 'use'", () => {
    expect(templateMenuItems(template({ type: "INTRODUCTION" }))).toEqual(["preview", "edit", "duplicate", "rename", "delete"]);
    expect(templateMenuItems(template({ type: "THANK_YOU", isSystem: true }))).toEqual([
      "preview",
      "duplicate",
      "duplicate-edit",
    ]);
  });
});

describe("what a proposal must have", () => {
  it("can't be created without a client", () => {
    expect(draftBlocker({ ...emptyGeneral(), proposal_name: "Website build" })).toBe(
      "Fill in the General step first — the proposal client is required.",
    );
  });

  it("can't be created without a name or a client", () => {
    expect(draftBlocker({ ...emptyGeneral(), proposal_name: "  " })).toBe(
      "Fill in the General step first — the proposal name and client are required.",
    );
  });

  it("can't be created with General's other required details missing", () => {
    expect(
      draftBlocker({
        ...emptyGeneral(),
        client_id: "37058",
        contract_start_type: "ON_SPECIFIC_DATE",
        contract_start_date: "",
      }),
    ).toMatch(/General step first/);
  });

  it("can be created once General's required fields are in", () => {
    expect(draftBlocker({ ...emptyGeneral(), client_id: "37058", contact_id: "33287" })).toBeNull();
  });

  const proposalWith = (statuses: Record<string, string>, optional: string[] = ["ADD_DOCS"]) =>
    ({
      id: 101,
      steps: Object.entries(statuses).map(([step_key, status]) => ({
        step_key,
        status,
        is_required: !optional.includes(step_key),
      })),
    }) as never;

  it("lists the required steps still to do, in step order", () => {
    const missing = missingRequiredSteps(
      proposalWith({
        GENERAL: "completed",
        SERVICES: "in_progress",
        PAYMENTS: "completed",
        INTRODUCTION: "not_started",
        ADD_DOCS: "not_started",
        TERMS_SIGN: "completed",
        NOTIFICATION: "completed",
        THANK_YOU: "completed",
      }),
    );
    expect(missing).toEqual(["Introduction", "Services"]);
  });

  it("ignores optional steps, so a complete proposal has nothing missing", () => {
    expect(
      missingRequiredSteps(
        proposalWith({
          GENERAL: "completed",
          SERVICES: "completed",
          PAYMENTS: "completed",
          INTRODUCTION: "completed",
          ADD_DOCS: "not_started",
          TERMS_SIGN: "completed",
          NOTIFICATION: "completed",
          THANK_YOU: "completed",
        }),
      ),
    ).toEqual([]);
  });
});

describe("a brand-new proposal (nothing saved yet)", () => {
  it("still treats Add. Docs. as optional", () => {
    expect(missingRequiredSteps(null)).toEqual([
      "General",
      "Introduction",
      "Services",
      "Payments",
      "Terms & Sign",
      "Thank You",
      "Notification",
    ]);
  });
});

describe("auto-filling a new proposal's sections", () => {
  it("starts each section from Sole's system template", () => {
    expect(DEFAULT_SECTION_TEMPLATES).toEqual({
      INTRODUCTION: "Proposal Introduction",
      TERMS: "Industry Standard Engagement Terms (AU)",
      THANK_YOU: "Standard Thank You",
    });
  });

  it("picks the named system template, never one of yours", () => {
    const list = [
      template({ id: "1", name: "My own intro" }),
      template({ id: "2", name: "Standard Welcome", isSystem: true }),
      template({ id: "3", name: "Proposal Introduction", isSystem: true }),
    ];
    expect(defaultSectionTemplate("INTRODUCTION", list)?.id).toBe("3");
  });

  it("falls back to the first system template, else nothing", () => {
    expect(defaultSectionTemplate("TERMS", [template({ id: "9", name: "Other terms", isSystem: true })])?.id).toBe("9");
    expect(defaultSectionTemplate("TERMS", [template({ id: "1", name: "Mine" })])).toBeNull();
    expect(defaultSectionTemplate("THANK_YOU", [])).toBeNull();
  });

  it("only fills an introduction nobody has written", () => {
    const blank = { message_from: "", blocks: initialIntroBlocks(), signature: DEFAULT_SIGNATURE };
    expect(introductionIsBlank(blank)).toBe(true);
    expect(
      introductionIsBlank({ ...blank, blocks: [{ id: "a", type: "text", isPrimary: true, editorHtml: "<p>Hi</p>" }] }),
    ).toBe(false);
    expect(introductionIsBlank({ ...blank, blocks: [...blank.blocks, { id: "b", type: "image", imageUrl: "u" }] })).toBe(
      false,
    );
  });

  it("only fills empty terms", () => {
    expect(termsIsBlank(DEFAULT_TERMS)).toBe(true);
    expect(termsIsBlank({ ...DEFAULT_TERMS, body: "<p><br></p>" })).toBe(true);
    expect(termsIsBlank({ ...DEFAULT_TERMS, body: "<p>Pay in 14 days</p>" })).toBe(false);
  });

  it("only replaces the built-in thank-you placeholder", () => {
    expect(thankYouIsUntouched(DEFAULT_THANK_YOU)).toBe(true);
    expect(thankYouIsUntouched({ title: "", message: "", button_label: "", button_url: "" })).toBe(true);
    expect(thankYouIsUntouched({ ...DEFAULT_THANK_YOU, title: "Welcome aboard!" })).toBe(false);
    expect(thankYouIsUntouched({ ...DEFAULT_THANK_YOU, button_label: "Book a call" })).toBe(false);
  });
});

describe("auto-fill, step by step", () => {
  const SYSTEM_INTRO = template({ id: "53", name: "Proposal Introduction", isSystem: true, full: false });
  const FULL_INTRO = template({
    id: "53",
    name: "Proposal Introduction",
    isSystem: true,
    content: { blocks: [{ id: "intro-1", type: "text", editorHtml: "<p>Hi {{contact_addressee}}</p>" }] },
  });

  const setup = (overrides: Partial<Parameters<typeof autoFillSection>[1]> = {}) => {
    const deps = {
      isBlank: vi.fn(() => true),
      fetchList: vi.fn(async () => [template({ id: "1", name: "Mine" }), SYSTEM_INTRO]),
      fetchTemplate: vi.fn(async () => FULL_INTRO),
      apply: vi.fn(() => true),
      ...overrides,
    };
    return deps;
  };

  it("fills a blank section from its default system template", async () => {
    const deps = setup();
    await expect(autoFillSection("INTRODUCTION", deps)).resolves.toBe(FULL_INTRO);
    expect(deps.fetchList).toHaveBeenCalledWith("INTRODUCTION");
    expect(deps.fetchTemplate).toHaveBeenCalledWith("53");
    expect(deps.apply).toHaveBeenCalledWith(FULL_INTRO);
  });

  it("asks for nothing when the section is already written", async () => {
    const deps = setup({ isBlank: vi.fn(() => false) });
    await expect(autoFillSection("INTRODUCTION", deps)).resolves.toBeNull();
    expect(deps.fetchList).not.toHaveBeenCalled();
    expect(deps.fetchTemplate).not.toHaveBeenCalled();
    expect(deps.apply).not.toHaveBeenCalled();
  });

  it("leaves a section the user starts writing while it loads", async () => {
    // Blank when it starts, written by the time the template arrives.
    const isBlank = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
    const deps = setup({ isBlank });
    await expect(autoFillSection("INTRODUCTION", deps)).resolves.toBeNull();
    expect(deps.fetchTemplate).toHaveBeenCalled();
    expect(deps.apply).not.toHaveBeenCalled();
  });

  it("doesn't fetch a template when there's no system one to use", async () => {
    const deps = setup({ fetchList: vi.fn(async () => [template({ id: "1", name: "Mine" })]) });
    await expect(autoFillSection("TERMS", deps)).resolves.toBeNull();
    expect(deps.fetchTemplate).not.toHaveBeenCalled();
  });

  it("reports nothing filled when the template has nothing to use", async () => {
    const deps = setup({ apply: vi.fn(() => false) });
    await expect(autoFillSection("THANK_YOU", deps)).resolves.toBeNull();
  });

  it("stays quiet when a request fails — the section just stays empty", async () => {
    const failingList = setup({ fetchList: vi.fn(async () => Promise.reject(new Error("offline"))) });
    await expect(autoFillSection("INTRODUCTION", failingList)).resolves.toBeNull();
    const failingTemplate = setup({ fetchTemplate: vi.fn(async () => Promise.reject(new Error("404"))) });
    await expect(autoFillSection("INTRODUCTION", failingTemplate)).resolves.toBeNull();
    expect(failingTemplate.apply).not.toHaveBeenCalled();
  });
});

describe("Save & finish waits for the required steps", () => {
  const stepsBeforeFinish = (statuses: Record<string, string>) =>
    missingRequiredSteps({
      id: 101,
      steps: Object.entries(statuses).map(([step_key, status]) => ({
        step_key,
        status,
        is_required: step_key !== "ADD_DOCS",
      })),
    } as never).filter((step) => step !== "Thank You");

  it("stays disabled while a required step before it is open", () => {
    expect(
      stepsBeforeFinish({
        GENERAL: "completed",
        SERVICES: "completed",
        PAYMENTS: "not_started",
        INTRODUCTION: "completed",
        ADD_DOCS: "not_started",
        TERMS_SIGN: "in_progress",
        NOTIFICATION: "completed",
        THANK_YOU: "not_started",
      }),
    ).toEqual(["Payments", "Terms & Sign"]);
  });

  it("is enabled once every required step but Thank You itself is done", () => {
    expect(
      stepsBeforeFinish({
        GENERAL: "completed",
        SERVICES: "completed",
        PAYMENTS: "completed",
        INTRODUCTION: "completed",
        ADD_DOCS: "not_started",
        TERMS_SIGN: "completed",
        NOTIFICATION: "completed",
        THANK_YOU: "not_started",
      }),
    ).toEqual([]);
  });
});

describe("the step checklist's Required / Optional tags", () => {
  it("tags Add. Docs. optional and every other step required, before anything is saved", () => {
    const tags = Object.fromEntries(templateModeProgress([]).map((item) => [item.step, item.isRequired]));
    expect(tags).toEqual({
      General: true,
      Services: true,
      Payments: true,
      Introduction: true,
      "Add. Docs.": false,
      "Terms & Sign": true,
      Notification: true,
      "Thank You": true,
    });
  });
});
