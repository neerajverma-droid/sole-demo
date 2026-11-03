import { Suspense } from "react";

import { CalendarScreen } from "@/components/calendar/calendar-screen";

/**
 * Suspense because the screen reads its filters from the URL, and
 * `?google_cal_status=` is how the backend hands back after Google's consent
 * screen.
 */
export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarScreen />
    </Suspense>
  );
}
