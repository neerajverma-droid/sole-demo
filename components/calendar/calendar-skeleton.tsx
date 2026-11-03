import { Skeleton } from "@/components/ui/skeleton";
import type { CalendarView } from "@/lib/calendar";

/** The shape of each view while its range loads, so nothing jumps when it lands. */
export function CalendarSkeleton({ view }: { view: CalendarView }) {
  if (view === "year") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="rounded-lg border border-border bg-card p-3 shadow-sm">
            <Skeleton className="mx-auto mb-3 h-5 w-24" />
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 35 }, (__, day) => (
                <Skeleton key={day} className="h-5" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (view === "month") {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }, (_, index) => (
            <div key={index} className="min-h-[112px] space-y-2 border-l border-t border-border p-2 [&:nth-child(7n+1)]:border-l-0">
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-4/5" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const grid = (columns: number) => (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/40 px-4 py-2.5">
        <Skeleton className="mx-auto h-5 w-24" />
      </div>
      {Array.from({ length: 7 }, (_, row) => (
        <div key={row} className="flex h-24 border-b border-border last:border-b-0">
          <div className="w-16 shrink-0 p-2">
            <Skeleton className="ml-auto h-3 w-10" />
          </div>
          <div
            className="grid flex-1 gap-2 border-l border-border p-2"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }, (__, col) => (
              <Skeleton key={col} className={(row + col) % 3 === 0 ? "h-12" : "h-0"} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (view === "week") return grid(7);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      {grid(1)}
      <div className="flex flex-col gap-6">
        <Skeleton className="h-72 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </div>
  );
}
