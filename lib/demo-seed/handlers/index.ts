import { handle as defaults } from "./defaults";
import { handle as documents } from "./documents";
import { handle as ndis } from "./ndis";
import { handle as planner } from "./planner";
import { handle as projects } from "./projects";
import { handle as quickActions } from "./quick-actions";
import { handle as sales } from "./sales";
import { handle as templates } from "./templates";
import type { DemoHandler } from "./types";

export type { DemoHandler, HandlerCtx, HandlerResponse } from "./types";

// Consulted in order, before mock-server.ts's generic handlers. First non-null answer wins.
const HANDLERS: DemoHandler[] = [documents, ndis, templates, sales, planner, projects, defaults, quickActions];

export const runHandlers: DemoHandler = (ctx) => {
  for (const handler of HANDLERS) {
    const response = handler(ctx);
    if (response) return response;
  }
  return null;
};
