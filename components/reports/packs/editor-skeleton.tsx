import { Skeleton } from "@/components/ui/skeleton";
import { A4_WIDTH_PX, EDITOR_LAYOUT, PREVIEW_GRID } from "./editor-section";

export function PageSkeleton({ message }: { message?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto w-full space-y-6 rounded-sm bg-card p-10 shadow-sm ring-1 ring-border"
      style={{ maxWidth: A4_WIDTH_PX }}
    >
      <div className="flex items-start justify-between gap-6">
        <Skeleton className="h-10 w-28" />
        <div className="w-40 space-y-2">
          <Skeleton className="ml-auto h-3 w-full" />
          <Skeleton className="ml-auto h-3 w-3/4" />
          <Skeleton className="ml-auto h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-px w-full" />
      <Skeleton className="h-5 w-40" />
      <div className="space-y-3">
        {Array.from({ length: 11 }).map((_, index) => (
          <div key={index} className="flex gap-6">
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
      {message && (
        <p className="pt-2 text-center text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-4 w-32" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-24" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-40" />
        </div>
      </div>
      <div className={EDITOR_LAYOUT}>
        <div className="space-y-4">
          <SectionSkeleton rows={3} />
          <SectionSkeleton rows={2} />
          <SectionSkeleton rows={1} />
        </div>
        <div className={PREVIEW_GRID}>
          <PageSkeleton />
          <div className="hidden space-y-3 lg:block">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[210/297] w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
