"use client";

import * as React from "react";
import { ChevronDown, Folder, Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StopTimerDialog } from "@/components/time-tracker/time-dialogs";
import { TimeDetailsFields } from "@/components/time-tracker/time-fields";
import { useActiveTimerQuery, useTimerSeconds } from "@/hooks/use-project-timer";
import { useProjectSettingsQuery } from "@/hooks/use-projects-query";
import {
  useStartTimerMutation,
  useUpdateActiveTimerMutation,
} from "@/hooks/use-time-tracker-query";
import { apiErrorMessage } from "@/lib/api-error";
import { formatTimerClock, type ActiveTimer } from "@/lib/project-timer";
import { num, str } from "@/lib/projects";
import {
  EMPTY_SELECTION,
  timerDescription,
  type DraftErrors,
  type TimerSelection,
} from "@/lib/time-tracker";
import { cn } from "@/lib/utils";

type Raw = Record<string, unknown>;

/** What a running timer already carries, for the bar to show and the dialog to start from. */
function selectionFromTimer(timer: ActiveTimer): TimerSelection {
  const task = (timer.raw.taskDetail ?? {}) as Raw;
  const rate = num(task.rate);
  return {
    client: timer.clientId
      ? { clientId: timer.clientId, contactId: timer.contactId, name: timer.clientName, email: "" }
      : null,
    assignProject: !!timer.projectId,
    projectId: timer.projectId ?? "",
    jobId: timer.jobId ?? "",
    isBillable: timer.isBillable,
    hourlyRate: timer.hourlyRate || (rate ? String(rate) : ""),
  };
}

function timerProjectLabel(timer: ActiveTimer | null): string {
  if (!timer) return "";
  const task = (timer.raw.taskDetail ?? {}) as Raw;
  const project = str(((task.projectDetail ?? {}) as Raw).project_name);
  const job = str(((task.jobDetail ?? {}) as Raw).job_name);
  return [project, job].filter(Boolean).join(" · ");
}

/**
 * The design's timer strip: what you're working on, whose time it is, the
 * clock and Start/Stop. Backed by the same running timer the top bar shows,
 * so one started here can be stopped there and the other way round.
 */
export function TimerBar() {
  const timerQuery = useActiveTimerQuery();
  const timer = timerQuery.data ?? null;
  const seconds = useTimerSeconds(timer);
  const running = !!timer;

  const settingsQuery = useProjectSettingsQuery();
  const defaultRate = settingsQuery.data?.defaultHourlyRate ?? "";

  const start = useStartTimerMutation();
  const updateTimer = useUpdateActiveTimerMutation();

  const [description, setDescription] = React.useState("");
  const [selection, setSelection] = React.useState<TimerSelection>(EMPTY_SELECTION);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [panelDraft, setPanelDraft] = React.useState<TimerSelection>(EMPTY_SELECTION);
  const [panelErrors, setPanelErrors] = React.useState<DraftErrors>({});
  const [stopOpen, setStopOpen] = React.useState(false);

  // Seed the bar from a timer started elsewhere (another tab, a project task,
  // the mobile app) — once per timer, so typing isn't overwritten by refetches.
  // A timer started from this bar is left alone: the bar already holds what
  // was picked, and `/active` doesn't echo all of it back — the rate went
  // missing that way, and the save dialog opened with it blank.
  const seededFor = React.useRef<string | null>(null);
  const startedHere = React.useRef(false);
  React.useEffect(() => {
    const id = timer?.id ?? null;
    if (id === seededFor.current) return;
    const wasRunning = seededFor.current !== null;
    seededFor.current = id;
    if (timer && startedHere.current) {
      startedHere.current = false;
    } else if (timer) {
      const seeded = selectionFromTimer(timer);
      setDescription(timerDescription(timer.raw));
      setSelection({ ...seeded, hourlyRate: seeded.hourlyRate || defaultRate });
    } else if (wasRunning) {
      // Stopped somewhere else — the top bar, another tab.
      setDescription("");
      setSelection(EMPTY_SELECTION);
    }
    // Only a new timer reseeds; a late default rate is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer]);

  // An idle bar picks up the business's default rate.
  React.useEffect(() => {
    if (!running && defaultRate) {
      setSelection((current) => (current.hourlyRate ? current : { ...current, hourlyRate: defaultRate }));
    }
  }, [running, defaultRate]);

  // Typing while the clock runs renames the timer's task, half a second after
  // the last keystroke — sole-webapp's debounced `handleUpdateTimer`.
  const pending = React.useRef<number | null>(null);
  React.useEffect(() => () => {
    if (pending.current) window.clearTimeout(pending.current);
  }, []);
  const changeDescription = (value: string) => {
    setDescription(value);
    if (!running) return;
    if (pending.current) window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => {
      pending.current = null;
      if (!value.trim()) return;
      updateTimer.mutate(
        { description: value, selection: { ...selection, assignProject: false } },
        { onError: (error) => toast.error(apiErrorMessage(error, "Failed to update timer")) },
      );
    }, 500);
  };

  const openPanel = (open: boolean) => {
    if (open) {
      setPanelDraft(selection);
      setPanelErrors({});
    }
    setPanelOpen(open);
  };

  const savePanel = () => {
    const errors: DraftErrors = {};
    if (!panelDraft.client) errors.client = "Select a client.";
    if (!running && panelDraft.assignProject) {
      if (!panelDraft.projectId) errors.project = "Select a project.";
      if (!panelDraft.jobId) errors.job = "Select a job.";
    }
    if (Object.keys(errors).length > 0) {
      setPanelErrors(errors);
      return;
    }
    setSelection(panelDraft);
    setPanelOpen(false);
    if (running) {
      // A running timer's job was fixed at start; only client, billable and
      // rate can still change.
      updateTimer.mutate(
        { description, selection: { ...panelDraft, assignProject: false } },
        {
          onSuccess: () => toast.success("Timer details updated"),
          onError: (error) => toast.error(apiErrorMessage(error, "Failed to update timer")),
        },
      );
    }
  };

  const startTimer = () => {
    startedHere.current = true;
    start.mutate(
      { description, selection },
      {
        onSuccess: () => toast.success("Timer started"),
        onError: (error) => {
          startedHere.current = false;
          toast.error(apiErrorMessage(error, "Failed to start timer"));
        },
      },
    );
  };

  const resetBar = () => {
    seededFor.current = null;
    setDescription("");
    setSelection({ ...EMPTY_SELECTION, hourlyRate: defaultRate });
    setStopOpen(false);
  };

  const projectLabel = timerProjectLabel(timer);
  const clientLabel = selection.client?.name || (selection.client ? "Unnamed client" : "");

  return (
    <>
      <section
        aria-label="Timer"
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-2.5 shadow-sm",
          running ? "border-primary/40" : "border-border",
        )}
      >
        <input
          aria-label="What are you working on?"
          className="min-w-[200px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="What are you working on?"
          value={description}
          onChange={(event) => changeDescription(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !running && !start.isPending) startTimer();
          }}
        />

        <Popover open={panelOpen} onOpenChange={openPanel}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="max-w-[260px] justify-start gap-2 pl-1.5">
              <span className="grid size-6 shrink-0 place-items-center rounded bg-primary/10 text-primary">
                <Folder className="size-4" />
              </span>
              <span className="min-w-0 truncate">
                {clientLabel || "Select Client & Project"}
                {clientLabel && (projectLabel || (selection.assignProject && !running)) && (
                  <span className="text-muted-foreground"> · {projectLabel || "Project"}</span>
                )}
              </span>
              <ChevronDown className="size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[380px] max-w-[92vw] p-5">
            <TimeDetailsFields
              idPrefix="timer"
              value={panelDraft}
              onChange={(next) => {
                setPanelErrors({});
                setPanelDraft(next);
              }}
              errors={panelErrors}
              projectReadOnly={
                running ? (
                  <p className="text-xs text-muted-foreground">
                    {projectLabel
                      ? `Project: ${projectLabel}. It's set when the timer starts.`
                      : "A project is set when the timer starts — edit the entry after stopping to add one."}
                  </p>
                ) : undefined
              }
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPanelErrors({});
                  setPanelDraft({ ...EMPTY_SELECTION, hourlyRate: defaultRate });
                }}
              >
                Reset
              </Button>
              <Button onClick={savePanel} disabled={updateTimer.isPending}>
                Save
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <span className="min-w-[72px] text-center text-base font-semibold tabular" aria-live="off">
          {formatTimerClock(seconds)}
        </span>

        {running ? (
          <Button variant="destructive" onClick={() => setStopOpen(true)}>
            <Square className="fill-current" />
            Stop
          </Button>
        ) : (
          <Button onClick={startTimer} disabled={start.isPending || timerQuery.isLoading}>
            {start.isPending ? <Loader2 className="animate-spin" /> : <Play className="fill-current" />}
            Start
          </Button>
        )}
      </section>

      <StopTimerDialog
        timer={timer}
        open={stopOpen}
        seconds={seconds}
        description={description}
        selection={selection}
        projectLabel={projectLabel}
        onOpenChange={setStopOpen}
        onDone={resetBar}
      />
    </>
  );
}
