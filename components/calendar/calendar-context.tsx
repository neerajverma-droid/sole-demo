"use client";

import * as React from "react";

import type { CalendarEvent, CalendarUser, CalendarView } from "@/lib/calendar";

/**
 * What every view needs from the screen: where the calendar is, how to move
 * it, and what to do with an event. The old calendar's CalendarProvider,
 * minus the badge-variant and working-hours knobs nothing ever changed.
 */
type CalendarContextValue = {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  view: CalendarView;
  setView: (view: CalendarView) => void;
  users: CalendarUser[];
  /** Opens the add form, starting at this time when a slot was clicked. */
  onAddTask: (dateTime?: Date) => void;
  /** Opens an event's details. */
  onOpenEvent: (event: CalendarEvent) => void;
  /** Saves a drag-and-drop move. */
  onMoveEvent: (
    event: CalendarEvent,
    target: { date: Date; hour?: number; minute?: number },
  ) => void;
  /** The event being dragged right now, so a drop target knows what landed. */
  dragging: React.MutableRefObject<CalendarEvent | null>;
};

const CalendarContext = React.createContext<CalendarContextValue | null>(null);

export function CalendarProvider({
  value,
  children,
}: {
  value: CalendarContextValue;
  children: React.ReactNode;
}) {
  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}

export function useCalendar() {
  const context = React.useContext(CalendarContext);
  if (!context) throw new Error("useCalendar must be used within a CalendarProvider.");
  return context;
}

/** Drag handlers for an event — native HTML5 drag, no library. */
export function useDraggableEvent(event: CalendarEvent, disabled = false) {
  const { dragging } = useCalendar();
  const [isDragging, setIsDragging] = React.useState(false);

  if (disabled) return { draggable: false as const, isDragging: false };

  return {
    draggable: true as const,
    isDragging,
    onDragStart: (e: React.DragEvent) => {
      dragging.current = event;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", event.id);
      // Defer, or the browser snapshots the faded state as the drag image.
      requestAnimationFrame(() => setIsDragging(true));
    },
    onDragEnd: () => {
      dragging.current = null;
      setIsDragging(false);
    },
  };
}

/** Drop handlers for a day cell or a time slot. */
export function useDropTarget(target: { date: Date; hour?: number; minute?: number }) {
  const { dragging, onMoveEvent } = useCalendar();
  const [isOver, setIsOver] = React.useState(false);

  return {
    isOver,
    onDragOver: (e: React.DragEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (!isOver) setIsOver(true);
    },
    onDragLeave: () => setIsOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setIsOver(false);
      const event = dragging.current;
      dragging.current = null;
      if (event) onMoveEvent(event, target);
    },
  };
}
