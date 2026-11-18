/**
 * The proposal screens' own rules, kept out of the components so they can be
 * tested: which steps template mode shows and in what order, how a saved
 * template fills a step, how the preview tabs map to steps, and which actions
 * a template card offers.
 */

import { formFromTemplate } from "@/lib/proposal-templates";
import {
  DEFAULT_THANK_YOU,
  PROPOSAL_STAGES,
  generalIssues,
  hasBlockContent,
  isBlankHtml,
  nextStep,
  stepProgress,
  type ApiProposal,
  type IntroBlock,
  type IntroductionData,
  type ProposalGeneral,
  type ProposalStep,
  type ProposalTemplate,
  type StepProgress,
  type TemplateKind,
  type TermsData,
  type ThankYouData,
} from "@/lib/proposals";

/* ------------------------------------------------------------------ *
 * Template mode — building a whole-proposal template in the builder
 * ------------------------------------------------------------------ */

/** What a template can't hold yet: payment terms, and documents (their upload needs a proposal). */
export const TEMPLATE_HIDDEN_STEPS: readonly ProposalStep[] = ["Payments", "Add. Docs."];

export const isHiddenInTemplateMode = (step: ProposalStep) => TEMPLATE_HIDDEN_STEPS.includes(step);

/** The step after this one, skipping any template mode leaves out. */
export function nextVisibleStep(step: ProposalStep, templateMode: boolean): ProposalStep | null {
  let next = nextStep(step);
  while (next && templateMode && isHiddenInTemplateMode(next)) next = nextStep(next);
  return next;
}

/** The stages and their steps, as the builder lists them. */
export function visibleStages(templateMode: boolean) {
  if (!templateMode) return PROPOSAL_STAGES;
  return PROPOSAL_STAGES.map((stage) => ({
    ...stage,
    steps: stage.steps.filter((step) => !isHiddenInTemplateMode(step)),
  }));
}

/** Template mode keeps progress locally: a step is complete once its button was pressed. */
export function templateModeProgress(done: readonly ProposalStep[]): StepProgress[] {
  return stepProgress(null).map((item) =>
    done.includes(item.step) ? { ...item, status: "completed" as const } : item,
  );
}

/* ------------------------------------------------------------------ *
 * What a proposal must have
 * ------------------------------------------------------------------ */

/**
 * Why a proposal can't be created yet, or null when it can. A proposal is
 * created the first time anything is saved, and it must have General's
 * required fields — its name and client — from the start.
 */
export function draftBlocker(general: ProposalGeneral): string | null {
  const issues = generalIssues(general);
  const missing = [issues.proposal_name && "name", issues.client_id && "client"].filter(Boolean);
  if (missing.length) {
    return `Fill in the General step first — the proposal ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} required.`;
  }
  return Object.keys(issues).length ? "Fill in the General step first — some of its details are missing." : null;
}

/** The required steps not yet completed, in step order — what stands between the proposal and sending. */
export function missingRequiredSteps(raw: ApiProposal | null): ProposalStep[] {
  return stepProgress(raw)
    .filter((item) => item.isRequired && item.status !== "completed")
    .map((item) => item.step);
}

/* ------------------------------------------------------------------ *
 * Filling a step from a saved template (the steps' Template dropdown)
 * ------------------------------------------------------------------ */

/** An introduction template's blocks, with fresh ids so two fills never share one. */
export function introBlocksFromTemplate(template: ProposalTemplate, makeId: () => string): IntroBlock[] {
  return formFromTemplate(template).blocks.map((block) => ({ ...block, id: makeId() }));
}

/** A terms template's body. */
export const termsBodyFromTemplate = (template: ProposalTemplate) => template.html;

/**
 * A thank-you template's fields, or null when it has neither a heading nor a
 * message to use (an older template saved as HTML only) — so the screen
 * isn't wiped.
 */
export function thankYouFromTemplate(template: ProposalTemplate): ThankYouData | null {
  const { thankYou } = formFromTemplate(template);
  return thankYou.title || thankYou.message ? thankYou : null;
}

/** The dropdown's two groups: your own first, then the system ones, labelled. */
export function templateOptions(templates: readonly ProposalTemplate[]) {
  const option = (template: ProposalTemplate) => ({
    id: template.id,
    label: template.isSystem ? `${template.name} · System` : template.name,
  });
  return {
    mine: templates.filter((template) => !template.isSystem).map(option),
    system: templates.filter((template) => template.isSystem).map(option),
  };
}

/* ------------------------------------------------------------------ *
 * The builder's preview panel follows the steps — and back
 * ------------------------------------------------------------------ */

export type PreviewTabName =
  | "Cover"
  | "Introduction"
  | "Services"
  | "Documents"
  | "Pricing"
  | "Terms"
  | "Thank You"
  | "Email";

export const STEP_TAB: Partial<Record<ProposalStep, PreviewTabName>> = {
  General: "Cover",
  Services: "Services",
  "Add. Docs.": "Documents",
  Payments: "Pricing",
  Introduction: "Introduction",
  "Terms & Sign": "Terms",
  Notification: "Email",
  "Thank You": "Thank You",
};

export const TAB_STEP = Object.fromEntries(
  Object.entries(STEP_TAB).map(([step, tab]) => [tab, step]),
) as Partial<Record<PreviewTabName, ProposalStep>>;

/* ------------------------------------------------------------------ *
 * Template cards — the hover action and the ⋯ menu
 * ------------------------------------------------------------------ */

export type TemplateCardAction = "create" | "edit" | "duplicate";

/** The second hover button: Create proposal, Edit (your own) or Duplicate (system, read-only). */
export function templateHoverAction(template: ProposalTemplate): { action: TemplateCardAction; label: string } {
  if (template.type === "PROPOSAL") return { action: "create", label: "Create proposal" };
  return template.isSystem ? { action: "duplicate", label: "Duplicate" } : { action: "edit", label: "Edit" };
}

export type TemplateMenuItem = "preview" | "use" | "edit" | "duplicate" | "duplicate-edit" | "rename" | "delete";

/** The ⋯ menu, in order. System templates are read-only: copy them, never change them. */
export function templateMenuItems(template: ProposalTemplate): TemplateMenuItem[] {
  const items: TemplateMenuItem[] = ["preview"];
  if (template.type === "PROPOSAL") items.push("use");
  if (!template.isSystem) items.push("edit");
  items.push("duplicate");
  if (template.isSystem) items.push("duplicate-edit");
  if (!template.isSystem) items.push("rename", "delete");
  return items;
}

/* ------------------------------------------------------------------ *
 * Auto-fill — a new proposal starts with Sole's own wording, as sole-pm's
 * ------------------------------------------------------------------ */

/** The sections auto-filled from a system template (the email has its own default text). */
export type SectionKind = Exclude<TemplateKind, "PROPOSAL" | "EMAIL">;

/** The system template each section starts from (seeded by migration 0161). */
export const DEFAULT_SECTION_TEMPLATES: Record<SectionKind, string> = {
  INTRODUCTION: "Proposal Introduction",
  TERMS: "Industry Standard Engagement Terms (AU)",
  THANK_YOU: "Standard Thank You",
};

/** The template a section is filled from: the named system one, else the first system one, else none. */
export function defaultSectionTemplate(
  kind: SectionKind,
  templates: readonly ProposalTemplate[],
): ProposalTemplate | null {
  const system = templates.filter((template) => template.isSystem);
  return system.find((template) => template.name === DEFAULT_SECTION_TEMPLATES[kind]) ?? system[0] ?? null;
}

/** Nothing written yet: no text in any block, and no image or video. */
export const introductionIsBlank = (introduction: IntroductionData) =>
  !introduction.blocks.some(hasBlockContent);

export const termsIsBlank = (terms: TermsData) => isBlankHtml(terms.body);

/** Still the built-in placeholder (or empty) — nobody has written a thank-you yet. */
export const thankYouIsUntouched = (thankYou: ThankYouData) =>
  (!thankYou.title.trim() && !thankYou.message.trim()) ||
  (thankYou.title === DEFAULT_THANK_YOU.title &&
    thankYou.message === DEFAULT_THANK_YOU.message &&
    !thankYou.button_label &&
    !thankYou.button_url);

/**
 * Fills one section from its default system template — the steps the
 * builder runs for each section once it opens. Checks the section is still
 * blank before fetching anything and again before applying, so a section the
 * user starts writing meanwhile is left alone. Returns the template used, or
 * null when nothing was filled (not blank, no default, or a request failed —
 * a section that can't be filled just stays empty).
 */
export async function autoFillSection(
  kind: SectionKind,
  deps: {
    isBlank: () => boolean;
    fetchList: (kind: SectionKind) => Promise<readonly ProposalTemplate[]>;
    fetchTemplate: (id: string) => Promise<ProposalTemplate>;
    apply: (template: ProposalTemplate) => boolean;
  },
): Promise<ProposalTemplate | null> {
  if (!deps.isBlank()) return null;
  try {
    const choice = defaultSectionTemplate(kind, await deps.fetchList(kind));
    if (!choice || !deps.isBlank()) return null;
    const template = await deps.fetchTemplate(choice.id);
    if (!deps.isBlank()) return null;
    return deps.apply(template) ? template : null;
  } catch {
    return null;
  }
}
