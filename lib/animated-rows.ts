/**
 * The bookkeeping behind `AnimatedRows`, kept apart from the component so it
 * can be tested without a DOM.
 */

/** Anything with a stable key; the component's rows carry a React node too. */
export type AnimatedRow<Node = unknown> = { key: string; node: Node };

export type RowPhase = "enter" | "idle" | "exit";

/**
 * `settled` is "finished arriving": until then the row clips its content so
 * the height fold has something to fold. After, it doesn't — a clipped row
 * would cut off anything drawn past its box, like the AI Match glow.
 */
export type ShownRow<Node = unknown> = AnimatedRow<Node> & { phase: RowPhase; settled: boolean };

/**
 * The next list: the new rows in their new order, with each departed row
 * slotted back where it was so it leaves from its own place.
 */
export function mergeRows<Node>(
  previous: ShownRow<Node>[],
  rows: AnimatedRow<Node>[],
  reduced: boolean,
): ShownRow<Node>[] {
  const before = new Map(previous.map((row) => [row.key, row]));
  const now = new Set(rows.map((row) => row.key));

  const next: ShownRow<Node>[] = rows.map((row) => {
    const prior = before.get(row.key);
    const staying = prior && prior.phase !== "exit";
    return staying
      ? { ...row, phase: prior.phase, settled: prior.settled }
      : { ...row, phase: "enter" as const, settled: false };
  });
  // No transitions to wait on, so nothing ever "arrives" — it's just there.
  if (reduced) return next.map((row) => ({ ...row, phase: "idle", settled: true }));

  previous.forEach((row, index) => {
    if (now.has(row.key)) return;
    next.splice(Math.min(index, next.length), 0, { ...row, phase: "exit" });
  });
  return next;
}
