"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Loader2, Square, Timer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { TimerDetailsDialog } from "@/components/projects/timer-details-dialog";
import {
  useActiveTimerQuery,
  useStopTimerMutation,
  useTimerSeconds,
} from "@/hooks/use-project-timer";
import { apiErrorMessage } from "@/lib/api-error";
import { formatTimerClock, timerHasClient } from "@/lib/project-timer";
import { cn } from "@/lib/utils";

/**
 * The running timer and a Stop button — sole-webapp's ActiveTimerControls
 * with `showWhenInactive={false}`: nothing at all is drawn while no timer
 * runs. Lives in the top bar, so a timer started on a task can be stopped
 * from any page.
 *
 * Stopping is guarded as the old top bar guarded it: a timer with no client
 * can't stop until one is picked, so the details picker opens instead.
 */
export function ActiveTimerControl({ className }: { className?: string }) {
  const timerQuery = useActiveTimerQuery();
  const timer = timerQuery.data ?? null;
  const seconds = useTimerSeconds(timer);
  const stopTimer = useStopTimerMutation();
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  // The old top bar re-read the timer on every route change, so one started
  // or stopped elsewhere (another tab, the mobile app) shows up here.
  const pathname = usePathname();
  const { refetch } = timerQuery;
  React.useEffect(() => {
    void refetch();
  }, [pathname, refetch]);

  if (!timer) return null;

  const stop = () => {
    if (!timerHasClient(timer)) {
      toast.error("Please fill contact details before stopping timer");
      setDetailsOpen(true);
      return;
    }
    stopTimer.mutate(timer, {
      onSuccess: () => toast.success("Timer stopped successfully"),
      onError: (error) => toast.error(apiErrorMessage(error, "Failed to stop timer")),
    });
  };

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-primary/40 bg-card py-1 pl-3 pr-1 shadow-sm",
          className,
        )}
      >
        <Timer className="size-4 text-primary" aria-hidden />
        <span className="min-w-[64px] text-sm font-medium tabular" aria-live="off">
          {formatTimerClock(seconds)}
        </span>
        <Button
          size="sm"
          variant="destructive"
          className="h-7"
          disabled={stopTimer.isPending}
          onClick={stop}
        >
          {stopTimer.isPending ? <Loader2 className="animate-spin" /> : <Square className="fill-current" />}
          Stop
        </Button>
      </div>
      <TimerDetailsDialog timer={timer} open={detailsOpen} onOpenChange={setDetailsOpen} />
    </>
  );
}
