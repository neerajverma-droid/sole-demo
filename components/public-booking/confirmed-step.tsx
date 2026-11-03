"use client";

import { CalendarDays, Check, Clock, Mail, MapPin, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type HostTheme } from "@/components/public-booking/booking-shell";
import {
  hostName,
  isInPerson,
  meetingLabel,
  slotWhen,
  type PublicBookingLink,
  type PublicSlot,
} from "@/lib/public-booking";

/** Step three: it's booked — when, where, the generated Meet link, and a way to change it. */
export function ConfirmedStep({
  link,
  slot,
  email,
  meetingLink,
  rescheduled,
  theme,
  onReschedule,
  onCancel,
}: {
  link: PublicBookingLink;
  slot: PublicSlot;
  email: string;
  meetingLink: string | null;
  rescheduled: boolean;
  theme: HostTheme;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  const when = slotWhen(slot);
  const inPerson = isInPerson(link);

  return (
    <div className="mx-auto max-w-md py-4 text-center">
      <span
        className="mx-auto grid size-14 place-items-center rounded-full"
        style={{ backgroundColor: `${theme.color}1A`, color: theme.color }}
      >
        <Check className="size-7" strokeWidth={2.6} />
      </span>
      <h2 className="mt-4 text-xl font-semibold">
        {rescheduled ? "Your booking has been moved" : "You're booked in"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A calendar invitation is on its way to{" "}
        <span className="font-medium text-foreground">{email}</span>.
      </p>

      <div className="mt-6 space-y-3 rounded-lg border border-border p-4 text-left text-sm">
        <p className="font-semibold">
          {link.title}{" "}
          <span className="font-normal text-muted-foreground">with {hostName(link)}</span>
        </p>
        <p className="flex items-start gap-2.5">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {when.date}
        </p>
        <p className="flex items-start gap-2.5">
          <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {when.time}
        </p>
        <p className="flex items-start gap-2.5">
          {inPerson ? (
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <Video className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          {meetingLink ? (
            <a
              href={meetingLink}
              target="_blank"
              rel="noreferrer"
              className="break-all font-medium hover:underline"
              style={{ color: theme.color }}
            >
              {meetingLink}
            </a>
          ) : (
            <span>
              {meetingLabel(link)}
              {!inPerson && " — the link is in your invitation"}
            </span>
          )}
        </p>
        <p className="flex items-start gap-2.5">
          <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {email}
        </p>
      </div>

      <div className="mt-6 flex justify-center gap-2">
        <Button variant="outline" onClick={onReschedule}>
          Reschedule
        </Button>
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={onCancel}
        >
          Cancel booking
        </Button>
      </div>
    </div>
  );
}
