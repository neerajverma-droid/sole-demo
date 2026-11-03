import { PILL_TONES, type PillTone } from "@/lib/admin/format";
import { cn } from "@/lib/utils";

/**
 * A status word in its tone — the one pill every admin table uses, so
 * "Suspended" is the same red on the dashboard, the tenant list and the
 * tenant's own page.
 */
export function StatusPill({
  label,
  tone,
  className,
}: {
  label: string;
  tone: PillTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        PILL_TONES[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}
