"use client";

import * as React from "react";
import { format, isSameDay, isValid, parseISO } from "date-fns";
import {
  BadgeDollarSign,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FileText,
  FolderKanban,
  Loader2,
  Mail,
  Pencil,
  StickyNote,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EventSourceMark, eventTone } from "@/components/calendar/event-chip";
import { useCalendarEventDetailQuery } from "@/hooks/use-calendar-query";
import { apiErrorMessage } from "@/lib/api-error";
import { deleteCalendarEvent } from "@/lib/calendar-api";
import {
  detailIdFor,
  eventDocumentsSource,
  isFinalizedEvent,
  isImageUrl,
  linkedName,
  mapEventDocuments,
  type CalendarEvent,
  type RawCalendarEvent,
} from "@/lib/calendar";
import { cn } from "@/lib/utils";

const PRIORITY_BADGE: Record<string, string> = {
  high: "border-destructive/20 bg-destructive/10 text-destructive",
  medium: "border-warning/20 bg-warning/10 text-warning",
  low: "border-success/20 bg-success/10 text-success",
};

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-transparent px-2 py-0.5 text-[11px] font-semibold capitalize",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Row({
  icon: Icon,
  label,
  children,
  secondary,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-border py-2.5 first:border-t-0">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="break-words text-sm font-medium">{children}</div>
        {secondary ? (
          <p className="mt-0.5 text-xs capitalize text-muted-foreground">{secondary}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * An event's details, read fresh from `GET /calendar/:id` each time it opens.
 * The card's own data shows first; the fetched record replaces it, and an
 * empty response means the event has gone ("No records found"). Done and
 * finalised tasks can be looked at but not edited or deleted.
 */
export function EventDetailsDialog({
  event,
  onClose,
  onEdit,
  onDeleted,
  locked = false,
}: {
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: (event: RawCalendarEvent) => void;
  onDeleted: () => void | Promise<void>;
  /** Read-only regardless of stage — the planner's Done column. */
  locked?: boolean;
}) {
  const open = event !== null;
  const eventId = event ? detailIdFor(event) : undefined;
  const detailQuery = useCalendarEventDetailQuery(eventId, open);
  const [isDeleting, setIsDeleting] = React.useState(false);

  React.useEffect(() => {
    if (detailQuery.error) {
      toast.error(apiErrorMessage(detailQuery.error, "Couldn't load that event."));
    }
  }, [detailQuery.error]);

  const details = detailQuery.isSuccess ? detailQuery.data : undefined;
  const isLoading = detailQuery.isLoading;
  const noRecords = open && !isLoading && Boolean(eventId) && (details === null || detailQuery.isError);

  const resolved = React.useMemo(() => {
    const source: RawCalendarEvent = details ?? event ?? {};
    const fallback: RawCalendarEvent = event ?? {};
    return {
      ...fallback,
      ...source,
      id: source.id ?? fallback.id,
      task_id: source.task_id ?? fallback.task_id,
      task_name: source.task_name || fallback.task_name || fallback.title || "",
      task_description:
        source.task_description || fallback.task_description || fallback.description || "",
      priority: source.priority || fallback.priority || null,
      is_billable: source.is_billable !== undefined ? source.is_billable : fallback.is_billable,
      amount: source.amount !== undefined ? source.amount : (fallback.amount ?? null),
      stage_name:
        source.stage_name ||
        (typeof source.stage === "object" ? source.stage?.name : undefined) ||
        fallback.stage_name ||
        (typeof fallback.stage === "object" ? fallback.stage?.name : undefined) ||
        null,
      project: source.project || fallback.project || null,
      job: source.job || fallback.job || null,
      contact: source.contact || fallback.contact || null,
      start_date: source.start_date || fallback.start_date || fallback.startDate || null,
      end_date: source.end_date || fallback.end_date || fallback.endDate || null,
      completed_at: source.completed_at || fallback.completed_at || null,
      notes: source.notes || fallback.notes || "",
      label: source.label || fallback.label || "personal",
      border_color: source.border_color || fallback.border_color || "#64748b",
      color: source.color || fallback.color,
      calendar: source.calendar || fallback.calendar || null,
      documents: eventDocumentsSource(source) || eventDocumentsSource(fallback) || [],
    } as RawCalendarEvent;
  }, [details, event]);

  const allowChanges = !locked && !isFinalizedEvent(event);
  const documents = mapEventDocuments(resolved.documents);
  const start = resolved.start_date ? parseISO(String(resolved.start_date)) : null;
  const end = resolved.end_date ? parseISO(String(resolved.end_date)) : null;
  const completed = resolved.completed_at ? parseISO(String(resolved.completed_at)) : null;

  const schedule =
    start && end && isValid(start) && isValid(end)
      ? isSameDay(start, end)
        ? `${format(start, "EEEE, MMMM d")} · ${format(start, "h:mm a")} – ${format(end, "h:mm a")}`
        : `${format(start, "MMM d, yyyy, h:mm a")} – ${format(end, "MMM d, yyyy, h:mm a")}`
      : "";

  const projectName = linkedName(resolved.project, "name", "title", "project_name");
  const jobName = linkedName(resolved.job, "name", "title", "job_name");
  const contactName = linkedName(resolved.contact, "name", "full_name");
  const contactEmail =
    resolved.contact && typeof resolved.contact === "object" ? resolved.contact.email : undefined;

  const handleDelete = async () => {
    if (!allowChanges || resolved.id === undefined) return;
    setIsDeleting(true);
    try {
      await deleteCalendarEvent(resolved.id);
      toast.success("Event deleted successfully");
      await onDeleted();
      onClose();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to delete event"));
    } finally {
      setIsDeleting(false);
    }
  };

  const toneEvent = { ...(event as CalendarEvent), border_color: String(resolved.border_color) };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-6 sm:max-w-[520px]">
        {isLoading ? (
          <>
            <DialogTitle className="sr-only">Loading event</DialogTitle>
            <div className="flex min-h-64 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          </>
        ) : noRecords ? (
          <>
            <DialogTitle className="sr-only">Event not found</DialogTitle>
            <div className="flex min-h-64 items-center justify-center text-center">
              <p className="text-sm font-medium text-muted-foreground">No records found</p>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 pr-8">
              <span
                className={cn("mt-1.5 size-3.5 shrink-0 rounded-sm border-l-4", eventTone(toneEvent).className)}
                style={eventTone(toneEvent).style}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex items-center gap-2 text-lg font-semibold leading-snug">
                  {event && <EventSourceMark event={event} />}
                  <span className="min-w-0 break-words">{resolved.task_name || "Untitled event"}</span>
                </DialogTitle>
                {schedule && <p className="mt-0.5 text-sm text-muted-foreground">{schedule}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {resolved.priority ? (
                    <Badge className={PRIORITY_BADGE[String(resolved.priority).toLowerCase()] ?? "bg-secondary text-secondary-foreground"}>
                      {resolved.priority}
                    </Badge>
                  ) : null}
                  <Badge
                    className={
                      resolved.is_billable
                        ? "border-primary/20 bg-primary/10 text-primary"
                        : "bg-secondary text-secondary-foreground"
                    }
                  >
                    {resolved.is_billable ? "Billable" : "Non-billable"}
                  </Badge>
                  {resolved.stage_name ? (
                    <Badge className="border-warning/20 bg-warning/10 text-warning">
                      {resolved.stage_name}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <Row icon={Clock3} label="When">
                <span className="block tabular-nums">
                  {start && isValid(start) ? format(start, "MMM d, yyyy, h:mm a") : "–"}
                </span>
                <span className="block tabular-nums">
                  {end && isValid(end) ? format(end, "MMM d, yyyy, h:mm a") : "–"}
                </span>
              </Row>
              {completed && isValid(completed) ? (
                <Row icon={CheckCircle2} label="Completed at">
                  <span className="tabular-nums">{format(completed, "MMM d, yyyy, h:mm a")}</span>
                </Row>
              ) : null}
              {resolved.task_description ? (
                <Row icon={StickyNote} label="Description">
                  <span className="font-normal">{String(resolved.task_description)}</span>
                </Row>
              ) : null}
              {resolved.notes ? (
                <Row icon={StickyNote} label="Notes">
                  <span className="font-normal">{resolved.notes}</span>
                </Row>
              ) : null}
              {resolved.amount !== null && resolved.amount !== undefined ? (
                <Row icon={BadgeDollarSign} label="Amount">
                  <span className="tabular-nums">{String(resolved.amount)}</span>
                </Row>
              ) : null}
              {projectName ? (
                <Row icon={FolderKanban} label="Project">
                  {projectName}
                </Row>
              ) : null}
              {jobName ? (
                <Row icon={BriefcaseBusiness} label="Job">
                  {jobName}
                </Row>
              ) : null}
              {contactName ? (
                <Row icon={UserRound} label="Contact" secondary={contactEmail}>
                  {contactName}
                </Row>
              ) : null}
              {resolved.calendar?.email ? (
                <Row
                  icon={Mail}
                  label="Calendar"
                  secondary={resolved.calendar.provider || resolved.calendar.calendar_id}
                >
                  {resolved.calendar.email}
                </Row>
              ) : null}
            </div>

            {documents.length > 0 ? (
              <div className="border-t border-border pt-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <FileText className="size-4 text-muted-foreground" />
                  Attachments
                </p>
                <div className="space-y-1.5">
                  {documents.map((doc, index) => (
                    <div
                      key={`${doc.documentId || doc.name}-${index}`}
                      className="flex items-center gap-2 rounded-md border border-border bg-background p-2"
                    >
                      {isImageUrl(doc.url) ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a remote thumbnail
                        <img src={doc.url} alt={doc.name} className="size-10 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="grid size-10 shrink-0 place-items-center rounded bg-muted">
                          <FileText className="size-4 text-muted-foreground" />
                        </span>
                      )}
                      <p className="min-w-0 flex-1 truncate text-xs font-medium">{doc.name}</p>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto px-1"
                        onClick={() => window.open(doc.url, "_blank", "noopener,noreferrer")}
                      >
                        Open
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {allowChanges ? (
              <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={isDeleting}
                  onClick={handleDelete}
                >
                  {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Delete
                </Button>
                <Button
                  onClick={() => {
                    onClose();
                    onEdit(resolved);
                  }}
                >
                  <Pencil />
                  Edit task
                </Button>
              </div>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
