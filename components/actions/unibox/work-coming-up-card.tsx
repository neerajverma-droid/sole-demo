"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";

import {
  CardAddButton,
  CardFigure,
  CardRow,
  CardRows,
  RowAction,
  UniboxCard,
} from "@/components/actions/unibox/unibox-ui";
import { TaskInvoiceFlow } from "@/components/task-planner/invoice-flow";
import { useRefreshUnibox, useUniboxQuery } from "@/hooks/use-unibox-query";
import type { PlannerTask } from "@/lib/task-planner";
import { isDemoRow, showSampleNotice } from "@/lib/unibox-demo";
import {
  plannerTaskFor,
  taskAmount,
  taskWhen,
  totalBooked as bookedTotal,
  uniboxMoney,
  workComingUpRows,
} from "@/lib/unibox-rules";

/** WorkComingUpCard.js: billable planner tasks not yet done, and Invoice on each. */
export function WorkComingUpCard() {
  const refresh = useRefreshUnibox();
  const query = useUniboxQuery("workComingUp");
  const [invoicing, setInvoicing] = React.useState<PlannerTask | null>(null);

  const tasks = React.useMemo(() => workComingUpRows(query.data ?? []), [query.data]);
  const totalBooked = bookedTotal(tasks);

  const finish = () => {
    setInvoicing(null);
    void refresh("workComingUp", "priorities", "invoices");
  };

  return (
    <UniboxCard
      icon={CalendarDays}
      title="Work coming up"
      tourId="quick-actions-work"
      sample={query.isDemo}
      count={tasks.length}
      loading={query.isLoading}
      action={<CardAddButton label="Open planner" icon={CalendarDays} href="/planner" />}
    >
      {!query.isLoading && totalBooked > 0 ? (
        <CardFigure value={uniboxMoney(totalBooked)} label="across upcoming tasks" />
      ) : null}
      <CardRows loading={query.isLoading} empty={tasks.length === 0} emptyText="No planner tasks">
        {tasks.map((task, index) => {
          const amount = taskAmount(task);
          const when = taskWhen(task);
          const description = task.description || task.task_details || "";
          const stage = task.stage?.name || "Backlog";
          return (
            <CardRow
              key={String(task.event_id ?? task.id ?? index)}
              icon={CalendarDays}
              title={task.task_name || task.title || "Untitled task"}
              titleExtra={
                <span
                  // The stage's own colours when the planner gave it some.
                  className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                  style={{
                    color: task.stage?.color || undefined,
                    backgroundColor: task.stage?.bg_color || undefined,
                    borderColor: task.stage?.color || undefined,
                  }}
                >
                  {stage}
                </span>
              }
              sub={description || when}
              extra={description ? when : undefined}
              amount={amount > 0 ? uniboxMoney(amount) : null}
              action={
                <RowAction
                  label="Invoice"
                  onClick={() =>
                    isDemoRow(task) ? showSampleNotice() : setInvoicing(plannerTaskFor(task, index))
                  }
                />
              }
            />
          );
        })}
      </CardRows>

      <TaskInvoiceFlow task={invoicing} onCancel={() => setInvoicing(null)} onDone={finish} />
    </UniboxCard>
  );
}
