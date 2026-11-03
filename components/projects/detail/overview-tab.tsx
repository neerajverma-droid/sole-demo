"use client";

import type { Project } from "@/lib/projects";

import { FinancialSections } from "./overview/financial-sections";
import {
  BillableSplitSection,
  OverdueSection,
  TaskStatusSection,
  TimeSummarySection,
  TimeTrackedSection,
} from "./overview/time-sections";

/**
 * sole-webapp's ProjectOverview in the design's order: the whole-of-project
 * financials first, then the period-scoped time and task widgets in pairs.
 * Every widget fetches on its own, so one slow or failing endpoint holds up
 * only its own card.
 */
export function ProjectOverviewTab({ project }: { project: Project }) {
  return (
    <div className="space-y-[15px]">
      <FinancialSections projectId={project.id} />
      <TimeSummarySection projectId={project.id} />
      {/* Two thirds and one third, as sole-webapp laid these rows out — the
          side cards hold a gauge or a short list and don't need half the row. */}
      <div className="grid grid-cols-1 gap-[15px] lg:grid-cols-3">
        <TimeTrackedSection projectId={project.id} className="lg:col-span-2" />
        <BillableSplitSection projectId={project.id} />
      </div>
      <div className="grid grid-cols-1 gap-[15px] lg:grid-cols-3">
        <TaskStatusSection projectId={project.id} className="lg:col-span-2" />
        <OverdueSection projectId={project.id} />
      </div>
    </div>
  );
}
