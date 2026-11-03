import { ArrowUpRight, Banknote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WARM_TILE } from "@/components/layout/page-header";
import { SHIFT_FINANCE_URL } from "@/lib/expenses";
import { cn } from "@/lib/utils";

/**
 * Partner banner, flat like the one on Expenses — same tile, same copy shape,
 * different sentence. The only outbound link on the screen, so it opens in a
 * new tab and is marked noopener.
 */
export function AssetFinanceBanner() {
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5",
          WARM_TILE,
        )}
        aria-hidden
      >
        <Banknote />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">
          Need funding for your business assets?
        </p>
        <p className="text-sm text-muted-foreground">
          Shift Finance offers fast, flexible business loans.
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <a href={SHIFT_FINANCE_URL} target="_blank" rel="noopener noreferrer">
          Apply now
          <ArrowUpRight />
        </a>
      </Button>
    </section>
  );
}
