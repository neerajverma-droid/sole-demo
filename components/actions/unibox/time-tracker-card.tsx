"use client";

import * as React from "react";
import { Clock, Loader2, Play } from "lucide-react";
import { toast } from "sonner";

import {
  ADD_BUTTON,
  CardFigure,
  CardRow,
  CardRows,
  RowAction,
  UniboxCard,
} from "@/components/actions/unibox/unibox-ui";
import { StopTimerDialog } from "@/components/time-tracker/time-dialogs";
import { TimeInvoiceDialog } from "@/components/time-tracker/time-invoice-dialog";
import { Button } from "@/components/ui/button";
import {
  useActiveTimerQuery,
  useStopTimerMutation,
  useTimerSeconds,
} from "@/hooks/use-project-timer";
import { useStartTimerMutation } from "@/hooks/use-time-tracker-query";
import { useRefreshUnibox, useUniboxQuery } from "@/hooks/use-unibox-query";
import { apiErrorMessage } from "@/lib/api-error";
import { timerHasClient } from "@/lib/project-timer";
import { EMPTY_SELECTION, timerDescription, type TimeInvoice } from "@/lib/time-tracker";
import { formatDuration, type UniboxTimeEntry } from "@/lib/unibox";
import { isDemoRow, showSampleNotice } from "@/lib/unibox-demo";
import {
  isLiveTimeEntry,
  isRunningTimeEntry,
  optionalMoney,
  recentTimeEntries,
  selectionFromTimer,
  timeEntryAction,
  timeEntryInvoice,
  timeEntrySub,
  timeEntryTitle,
  timerProjectLabel,
  totalEntryMinutes,
} from "@/lib/unibox-rules";

/** TimeTrackerCard.js: the five latest sessions, a timer to start, and Stop / Invoice. */
export function TimeTrackerCard() {
  const refresh = useRefreshUnibox();
  const query = useUniboxQuery("timeTracker");
  const timerQuery = useActiveTimerQuery();
  const timer = timerQuery.data ?? null;
  const seconds = useTimerSeconds(timer);
  const start = useStartTimerMutation();
  const stop = useStopTimerMutation();
  const [stopOpen, setStopOpen] = React.useState(false);
  const [invoice, setInvoice] = React.useState<TimeInvoice | null>(null);

  const entries = React.useMemo(() => recentTimeEntries(query.data ?? []), [query.data]);
  const totalMinutes = totalEntryMinutes(entries);
  /*
   * The active timer is the authority on what's running — see
   * `isLiveTimeEntry`. `undefined` until it has answered, when the rows' own
   * status is used instead, as the old card did.
   */
  const activeTimerId = timerQuery.isSuccess ? (timer?.id ?? null) : undefined;
  const running =
    activeTimerId === undefined ? entries.some(isRunningTimeEntry) : activeTimerId !== null;

  const startTimer = () =>
    start.mutate(
      { description: "", selection: { ...EMPTY_SELECTION, isBillable: true } },
      {
        onSuccess: async () => {
          toast.success("Timer started successfully");
          await refresh("timeTracker");
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Failed to start timer")),
      },
    );

  /** With a client on it the timer just stops; without one, it asks for one first. */
  const stopTimer = async () => {
    const current = timer ?? (await timerQuery.refetch()).data ?? null;
    if (!current) {
      await refresh("timeTracker");
      return;
    }
    if (!timerHasClient(current)) {
      setStopOpen(true);
      return;
    }
    stop.mutate(current, {
      onSuccess: async () => {
        toast.success("Timer stopped successfully");
        await refresh("timeTracker");
      },
      onError: (error) => toast.error(apiErrorMessage(error, "Failed to stop timer")),
    });
  };

  const invoiceEntry = (entry: UniboxTimeEntry) => {
    if (isDemoRow(entry)) {
      showSampleNotice();
      return;
    }
    const result = timeEntryInvoice(entry);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setInvoice(result);
  };

  return (
    <UniboxCard
      icon={Clock}
      title="Time tracker"
      tourId="quick-actions-time-tracker"
      sample={query.isDemo}
      count={entries.length}
      loading={query.isLoading}
      action={
        <Button size="sm" className={ADD_BUTTON} onClick={startTimer} disabled={start.isPending || running}>
          {start.isPending ? <Loader2 className="animate-spin" /> : <Play className="fill-current" />}
          {running ? "Timer running" : "Start timer"}
        </Button>
      }
    >
      {!query.isLoading && entries.length > 0 ? (
        <CardFigure value={formatDuration(totalMinutes)} label="tracked time" />
      ) : null}
      <CardRows loading={query.isLoading} empty={entries.length === 0} emptyText="No time entries">
        {entries.map((entry, index) => {
          const live = isLiveTimeEntry(entry, activeTimerId);
          const action = timeEntryAction(entry, live);
          return (
            <CardRow
              key={String(entry.id)}
              tourId={index === 0 ? "quick-actions-time-row" : undefined}
              icon={Clock}
              iconTone={live ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}
              title={timeEntryTitle(entry)}
              sub={timeEntrySub(entry, live)}
              subTone={live ? "text-success font-medium" : undefined}
              amount={live ? null : optionalMoney(entry.amount)}
              action={
                live ? (
                  <RowAction label="Stop" variant="danger" busy={stop.isPending} onClick={stopTimer} />
                ) : (
                  <RowAction
                    label={action.label}
                    disabled={action.disabled}
                    onClick={() => invoiceEntry(entry)}
                  />
                )
              }
            />
          );
        })}
      </CardRows>

      <StopTimerDialog
        timer={timer}
        open={stopOpen && timer !== null}
        seconds={seconds}
        description={timerDescription(timer?.raw)}
        selection={timer ? selectionFromTimer(timer) : EMPTY_SELECTION}
        projectLabel={timerProjectLabel(timer)}
        onOpenChange={setStopOpen}
        onDone={() => {
          setStopOpen(false);
          void refresh("timeTracker");
        }}
      />
      <TimeInvoiceDialog
        invoice={invoice}
        onClose={() => {
          setInvoice(null);
          void refresh("timeTracker");
        }}
      />
    </UniboxCard>
  );
}
