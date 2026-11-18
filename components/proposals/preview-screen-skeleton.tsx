import { Shimmer } from "@/components/ui/shimmer";

/**
 * The client-preview screen's own shape while it loads — header with the
 * section steps, the banner, a page, Back / Next — rather than a spinner.
 */
export function PreviewScreenSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-dvh flex-col" role="status" aria-label={label}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
        <Shimmer className="h-4 w-40" />
        <div className="hidden items-center gap-4 md:flex">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-2">
              <Shimmer className="size-5 rounded-full" />
              <Shimmer className="h-3 w-14" />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Shimmer className="h-8 w-28" />
          <Shimmer className="size-8" />
        </div>
      </div>
      <div className="shrink-0 border-b border-border px-5 py-2">
        <Shimmer className="h-4 w-80 max-w-full" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-primary/10 p-4 sm:p-8">
        <div className="mx-auto flex max-w-[760px] flex-col items-center gap-4 rounded-3xl bg-card px-6 py-14 shadow-lg sm:px-14">
          <Shimmer className="size-24 rounded-full" />
          <Shimmer className="h-3.5 w-32" />
          <Shimmer className="mt-8 h-4 w-44" />
          <Shimmer className="h-12 w-72 max-w-full" />
          <Shimmer className="h-4 w-48" />
          <Shimmer className="mt-6 h-11 w-56 rounded-full" />
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-3">
        <Shimmer className="h-9 w-24" />
        <Shimmer className="h-9 w-24" />
      </div>
    </div>
  );
}
