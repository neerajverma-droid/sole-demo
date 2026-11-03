import { cn } from "@/lib/utils"

/**
 * A loading block with light sweeping across it, rather than the flatter
 * opacity pulse `Skeleton` uses — for content shaped enough (a card, a row)
 * that a still pulse reads as "stalled" rather than "loading".
 *
 * Bare, it's a flat placeholder block. Given children — bars laid out to echo
 * the real content's shape (an avatar square, a title line, a body block) —
 * the sweep passes over that shape instead, one sweep for the whole card
 * rather than one per bar.
 */
function Shimmer({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-md bg-primary/10", className)}
      {...props}
    >
      {children}
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
    </div>
  )
}

export { Shimmer }
