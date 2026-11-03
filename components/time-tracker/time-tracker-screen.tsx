"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, Clock, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { ManualLogDialog } from "@/components/time-tracker/time-dialogs";
import { TimeEntriesTable } from "@/components/time-tracker/time-entries-table";
import { TimeSummary } from "@/components/time-tracker/time-summary";
import { TimerBar } from "@/components/time-tracker/timer-bar";
import { useTimeTasksQuery } from "@/hooks/use-time-tracker-query";
import { TIME_PAGE_SIZE, TIME_TRACKER_ROOT } from "@/lib/time-tracker";

/**
 * Time Tracker, laid out as the design has it: the timer strip, this week's
 * hours beside who they went to, then every entry grouped by task.
 */
export function TimeTrackerScreen() {
  const [manualOpen, setManualOpen] = React.useState(false);
  /*
   * Whether there's any time logged at all. The table's own first page, under
   * its own key, so this is the same request rather than a second one. Only a
   * settled answer counts: while it loads the summary keeps its skeleton, and
   * a failed load shows its error in the table rather than an empty page.
   */
  const firstPage = useTimeTasksQuery(1, TIME_PAGE_SIZE);
  const isEmpty =
    firstPage.isSuccess &&
    !firstPage.isPlaceholderData &&
    firstPage.data.total === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Clock}
        title="Time Tracker"
        description="Track time against clients and projects and turn it into billable entries."
      >
        <Button onClick={() => setManualOpen(true)}>
          <Plus />
          Add manual time entry
        </Button>
        <Button variant="outline" asChild>
          <Link href={`${TIME_TRACKER_ROOT}/weekly`}>
            <CalendarDays />
            Weekly log
          </Link>
        </Button>
      </PageHeader>

      <TimerBar />
      {/* The timer stays — it's how the first entry gets made — but a week of
          zeroes says nothing the empty state doesn't. */}
      {!isEmpty && <TimeSummary />}
      <TimeEntriesTable
        empty={isEmpty}
        onAddManual={() => setManualOpen(true)}
      />

      <ManualLogDialog open={manualOpen} onOpenChange={setManualOpen} />
    </div>
  );
}
