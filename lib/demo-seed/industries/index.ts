import type { IndustryTemplate } from "./types";
import { electrical } from "./templates/electrical";
import { templates as business } from "./templates/business";
import { templates as commerce } from "./templates/commerce";
import { templates as services } from "./templates/services";
import { templates as trades } from "./templates/trades";

/**
 * Every industry template, by slug. To add or change an industry, edit its
 * template file (and its row in `catalog.ts` for a new one) — nothing else.
 */
export const TEMPLATES: Record<string, IndustryTemplate> = Object.fromEntries(
  [electrical, ...trades, ...services, ...business, ...commerce].map((t) => [t.slug, t]),
);

export function getTemplate(slug: string): IndustryTemplate | undefined {
  return TEMPLATES[slug];
}

export * from "./catalog";
export * from "./types";
