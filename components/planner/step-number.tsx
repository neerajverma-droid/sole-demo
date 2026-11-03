/**
 * The numbered badge on a section of a stacked form.
 *
 * Shared by the goal and expense-plan pages so "step 1" looks the same on both.
 * The numbers order the sections; they aren't a wizard — every section is on the
 * page at once and every figure updates live.
 */
export function StepNumber({ n }: { n: number }) {
  return (
    <span
      className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular"
      aria-hidden
    >
      {n}
    </span>
  );
}
