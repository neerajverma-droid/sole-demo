"use client";

import * as React from "react";

import { track, type AnalyticsProps } from "@/lib/analytics";
import type { EventName } from "@/lib/analytics-events";

export function useTrackOnce(
  event: EventName,
  enabled = true,
  props?: AnalyticsProps,
): void {
  const sent = React.useRef(false);
  const propsRef = React.useRef(props);
  propsRef.current = props;

  React.useEffect(() => {
    if (!enabled || sent.current) return;
    sent.current = true;
    track(event, propsRef.current);
  }, [enabled, event]);
}

export function useTrackOnOpen(
  event: EventName,
  open: boolean,
  props?: AnalyticsProps,
): void {
  const wasOpen = React.useRef(false);
  const propsRef = React.useRef(props);
  propsRef.current = props;

  React.useEffect(() => {
    if (open && !wasOpen.current) track(event, propsRef.current);
    wasOpen.current = open;
  }, [open, event]);
}
