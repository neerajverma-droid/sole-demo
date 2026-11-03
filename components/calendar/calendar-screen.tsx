"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { CalendarControls, FilterChips } from "@/components/calendar/calendar-controls";
import { CalendarProvider } from "@/components/calendar/calendar-context";
import { CalendarSearch } from "@/components/calendar/calendar-search";
import { CalendarSkeleton } from "@/components/calendar/calendar-skeleton";
import {
  CalendarConnectResultDialog,
  CalendarsDialog,
} from "@/components/calendar/calendars-dialog";
import { DayView } from "@/components/calendar/day-view";
import { EventDetailsDialog } from "@/components/calendar/event-details-dialog";
import { MonthView } from "@/components/calendar/month-view";
import { TaskForm } from "@/components/calendar/task-form";
import { WeekView } from "@/components/calendar/week-view";
import { YearView } from "@/components/calendar/year-view";
import {
  useCalendarEventsCache,
  useCalendarEventsQuery,
  useInvalidateCalendarEvents,
  useLinkedCalendarsQuery,
} from "@/hooks/use-calendar-query";
import { apiErrorMessage } from "@/lib/api-error";
import {
  deleteLinkedCalendar,
  requestGoogleCalendarAuthUrl,
  setDefaultCalendar,
  updateCalendarTask,
} from "@/lib/calendar-api";
import {
  buildMovePayload,
  connectedCalendarName,
  eventSaveId,
  eventsInView,
  getEventsCount,
  movedEvent,
  normalizeEvents,
  splitByDuration,
  type CalendarEvent,
  type CalendarFilters,
  type CalendarUser,
  type CalendarView,
  type LinkedCalendar,
  type RawCalendarEvent,
} from "@/lib/calendar";

type FormState = {
  mode: "create" | "edit";
  taskData: RawCalendarEvent | null;
  initialDateTime: Date | null;
};

type ConnectResult = {
  status: "success" | "failed";
  email: string;
  errorMessage: string;
};

/** The query params this screen owns; everything else in the URL is left alone. */
const GOOGLE_RETURN_PARAMS = ["google_cal_status", "email", "error_msg"];

function filtersFromParams(params: URLSearchParams): CalendarFilters {
  const ids = params.get("calendar_ids");
  return {
    calendar_ids: ids ? ids.split(",").filter(Boolean) : [],
    billable: params.get("billable") === "true",
  };
}

export function CalendarScreen() {
  const pathname = usePathname() ?? "/calendar";
  const rawSearchParams = useSearchParams();
  const searchParams = React.useMemo(
    () => new URLSearchParams(rawSearchParams?.toString() ?? ""),
    [rawSearchParams],
  );
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = React.useState(() => new Date());
  const [view, setView] = React.useState<CalendarView>("month");
  // `?search=` narrows the whole calendar, as it did before; it's only ever
  // set from a link, the search box opens results rather than filtering.
  const [search] = React.useState(() => searchParams.get("search") ?? "");
  const [filters, setFilters] = React.useState<CalendarFilters>(() =>
    filtersFromParams(searchParams),
  );

  const [form, setForm] = React.useState<FormState | null>(null);
  const [detailEvent, setDetailEvent] = React.useState<CalendarEvent | null>(null);
  const [calendarsOpen, setCalendarsOpen] = React.useState(false);
  const [isAddingCalendar, setIsAddingCalendar] = React.useState(false);
  const [pendingDefaultId, setPendingDefaultId] = React.useState<string | number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | number | null>(null);
  const [connectResult, setConnectResult] = React.useState<ConnectResult | null>(null);
  const dragging = React.useRef<CalendarEvent | null>(null);

  /* --- URL --- */

  const replaceParams = React.useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(window.location.search);
      mutate(params);
      const query = params.toString();
      // The browser's own history, not router.replace: Next keeps useSearchParams
      // in step with it, without re-requesting the page (an `_rsc` fetch) on
      // every keystroke.
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [pathname],
  );

  // Filters live in the URL so a filtered calendar can be linked to and reloaded.
  React.useEffect(() => {
    replaceParams((params) => {
      if (search) params.set("search", search);
      else params.delete("search");
      if (filters.calendar_ids.length > 0) params.set("calendar_ids", filters.calendar_ids.join(","));
      else params.delete("calendar_ids");
      if (filters.billable) params.set("billable", "true");
      else params.delete("billable");
    });
  }, [filters, search, replaceParams]);

  // Back from Google's consent screen.
  const googleStatus = searchParams.get("google_cal_status");
  React.useEffect(() => {
    if (googleStatus !== "success" && googleStatus !== "failed") return;
    setConnectResult({
      status: googleStatus,
      email: searchParams.get("email") || "",
      errorMessage: googleStatus === "failed" ? searchParams.get("error_msg") || "" : "",
    });
  }, [googleStatus, searchParams]);

  const clearConnectResult = () => {
    setConnectResult(null);
    replaceParams((params) => GOOGLE_RETURN_PARAMS.forEach((key) => params.delete(key)));
  };

  /* --- Data --- */

  const calendarsQuery = useLinkedCalendarsQuery();
  const calendars = React.useMemo(() => calendarsQuery.data ?? [], [calendarsQuery.data]);
  const calendarName = connectedCalendarName(calendars);

  const eventsQuery = useCalendarEventsQuery(selectedDate, view, filters, search);
  const updateEventsCache = useCalendarEventsCache();
  const invalidateEvents = useInvalidateCalendarEvents();

  React.useEffect(() => {
    if (eventsQuery.error) {
      toast.error(apiErrorMessage(eventsQuery.error, "Couldn't load your calendar."));
    }
  }, [eventsQuery.error]);
  React.useEffect(() => {
    if (calendarsQuery.error) {
      toast.error(apiErrorMessage(calendarsQuery.error, "Couldn't load your calendars."));
    }
  }, [calendarsQuery.error]);

  const events = React.useMemo(
    () => normalizeEvents(eventsQuery.data ?? [], calendarName),
    [eventsQuery.data, calendarName],
  );

  const users = React.useMemo<CalendarUser[]>(() => {
    const byId = new Map<string, CalendarUser>();
    events.forEach((event) => {
      if (!byId.has(event.user.id)) byId.set(event.user.id, event.user);
    });
    if (byId.size === 0) {
      byId.set("calendar-user", { id: "calendar-user", name: calendarName, picturePath: null });
    }
    return Array.from(byId.values());
  }, [events, calendarName]);

  const visibleEvents = React.useMemo(
    () => eventsInView(events, selectedDate, view),
    [events, selectedDate, view],
  );
  const { singleDayEvents, multiDayEvents } = React.useMemo(
    () => splitByDuration(visibleEvents),
    [visibleEvents],
  );
  const eventCount = getEventsCount(visibleEvents, selectedDate, view);

  /* --- Connected calendars --- */

  // Straight to Google's consent screen; the backend sends the browser back
  // here with `?google_cal_status=`, which the result dialog picks up. Left
  // "Connecting..." while the page goes — only an error turns it back off.
  const handleAddCalendar = async () => {
    setIsAddingCalendar(true);
    try {
      window.location.href = await requestGoogleCalendarAuthUrl();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't start the Google Calendar connection."));
      setIsAddingCalendar(false);
    }
  };

  const handleSelectDefault = async (calendar: LinkedCalendar) => {
    if (calendar.is_default) return;
    const previous = calendars;
    queryClient.setQueryData<LinkedCalendar[]>(["calendar", "linked"], (rows) =>
      (rows ?? []).map((item) => ({ ...item, is_default: item.id === calendar.id })),
    );
    setPendingDefaultId(calendar.id);
    try {
      await setDefaultCalendar(calendar.id);
      toast.success("Default calendar updated successfully.");
    } catch (error) {
      queryClient.setQueryData(["calendar", "linked"], previous);
      toast.error(
        apiErrorMessage(
          error,
          "Default calendar change is not available until the backend endpoint is added.",
        ),
      );
    } finally {
      setPendingDefaultId(null);
    }
  };

  const handleDeleteCalendar = async (calendar: LinkedCalendar) => {
    if (!calendar.id) return;
    setPendingDeleteId(calendar.id);
    try {
      await deleteLinkedCalendar(calendar.id);
      toast.success("Calendar removed successfully.");
      setCalendarsOpen(false);
      await Promise.all([calendarsQuery.refetch(), invalidateEvents()]);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't remove that calendar."));
    } finally {
      setPendingDeleteId(null);
    }
  };

  /* --- Tasks --- */

  const openCreate = React.useCallback((dateTime?: Date) => {
    setForm({ mode: "create", taskData: null, initialDateTime: dateTime ?? null });
  }, []);

  const openEdit = React.useCallback((taskData: RawCalendarEvent) => {
    setForm({ mode: "edit", taskData, initialDateTime: null });
  }, []);

  const closeForm = () => {
    setForm(null);
    window.scrollTo({ top: 0 });
  };

  // Dropped on a slot or a day: moved there straight away, saved in the
  // background, and put straight back if the save is refused — as the old
  // calendar's use-update-event did.
  const handleMoveEvent = React.useCallback(
    (event: CalendarEvent, target: { date: Date; hour?: number; minute?: number }) => {
      const moved = movedEvent(event, target);
      if (moved.startDate === event.startDate) return;
      const saveId = eventSaveId(moved);
      const snapshot = queryClient.getQueriesData<RawCalendarEvent[]>({
        queryKey: ["calendar", "events"],
      });
      updateEventsCache((rows) =>
        rows.map((row) =>
          String(row.task_id || row.id) === saveId || String(row.id) === event.id
            ? { ...row, startDate: moved.startDate, endDate: moved.endDate }
            : row,
        ),
      );
      void updateCalendarTask(saveId, buildMovePayload(moved))
        .then(() => invalidateEvents())
        .catch((error) => {
          snapshot.forEach(([key, rows]) => queryClient.setQueryData(key, rows));
          toast.error(apiErrorMessage(error, "Failed to update task"));
        });
    },
    [invalidateEvents, queryClient, updateEventsCache],
  );

  const contextValue = React.useMemo(
    () => ({
      selectedDate,
      setSelectedDate,
      view,
      setView,
      users,
      onAddTask: openCreate,
      onOpenEvent: setDetailEvent,
      onMoveEvent: handleMoveEvent,
      dragging,
    }),
    [selectedDate, view, users, openCreate, handleMoveEvent],
  );

  const dialogs = (
    <>
      <EventDetailsDialog
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onEdit={openEdit}
        onDeleted={() => invalidateEvents()}
      />
      <CalendarsDialog
        open={calendarsOpen}
        onOpenChange={setCalendarsOpen}
        calendars={calendars}
        isLoading={calendarsQuery.isLoading}
        pendingDefaultId={pendingDefaultId}
        pendingDeleteId={pendingDeleteId}
        isAddingCalendar={isAddingCalendar}
        onSelectDefault={(calendar) => void handleSelectDefault(calendar)}
        onDeleteCalendar={(calendar) => void handleDeleteCalendar(calendar)}
        onAddCalendar={() => void handleAddCalendar()}
      />
      <CalendarConnectResultDialog
        status={connectResult?.status ?? null}
        email={connectResult?.email ?? ""}
        errorMessage={connectResult?.errorMessage ?? ""}
        onClose={clearConnectResult}
        onTryAgain={() => {
          clearConnectResult();
          void handleAddCalendar();
        }}
      />
    </>
  );

  if (form) {
    return (
      <>
        <TaskForm
          key={`${form.mode}-${form.taskData?.id ?? "new"}`}
          mode={form.mode}
          taskData={form.taskData}
          initialDateTime={form.initialDateTime}
          fallbackUser={users[0]}
          onClose={closeForm}
          onSaved={async () => {
            closeForm();
            await invalidateEvents();
          }}
        />
        {dialogs}
      </>
    );
  }

  return (
    <CalendarProvider value={contextValue}>
      <div className="space-y-6">
        <PageHeader
          icon={CalendarDays}
          title="Calendar"
          titleTip="View events by day, week, month, or year, and manage schedules by adding, editing, or reviewing event details."
          description="See the week ahead, with the work behind each booking attached."
        >
          <CalendarSearch
            selectedDate={selectedDate}
            view={view}
            filters={filters}
            fallbackUserName={calendarName}
            onPick={setDetailEvent}
          />
          <Button onClick={() => openCreate()} data-usertour="scheduling-calendar-add-task">
            <Plus />
            Add task
          </Button>
        </PageHeader>

        <CalendarControls
          selectedDate={selectedDate}
          onSelectedDateChange={setSelectedDate}
          view={view}
          onViewChange={setView}
          eventCount={eventCount}
          calendars={calendars}
          loadingCalendars={calendarsQuery.isLoading}
          filters={filters}
          onApplyFilters={setFilters}
          onOpenCalendars={() => setCalendarsOpen(true)}
        />

        <FilterChips filters={filters} calendars={calendars} onApply={setFilters} />

        {eventsQuery.isPending ? (
          <CalendarSkeleton view={view} />
        ) : view === "day" ? (
          <DayView singleDayEvents={singleDayEvents} multiDayEvents={multiDayEvents} />
        ) : view === "week" ? (
          <WeekView singleDayEvents={singleDayEvents} multiDayEvents={multiDayEvents} />
        ) : view === "month" ? (
          <MonthView singleDayEvents={singleDayEvents} multiDayEvents={multiDayEvents} />
        ) : (
          <YearView events={visibleEvents} />
        )}
      </div>
      {dialogs}
    </CalendarProvider>
  );
}
