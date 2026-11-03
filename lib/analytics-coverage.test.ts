import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ALL_EVENT_NAMES, EVENTS } from "@/lib/analytics-events";

/**
 * Every declared event has somewhere that fires it.
 *
 * This is the check that stops dead tracking, and it exists because the old
 * integration shipped four tracker functions that were written, exported, and
 * never called once — `trackSubscription`, which is the only thing that would
 * have emitted `plan_upgraded`, among them. Nothing failed. The functions were
 * right there in the file, so reading the code suggested the events existed,
 * and the dashboards built on them simply read zero forever.
 *
 * A declared-but-unfired name is worse than no name at all: it looks like
 * coverage. Someone builds a funnel on it, the funnel reads nothing, and the
 * natural conclusion is that nobody is doing the thing — not that nobody is
 * measuring it.
 *
 * So: add a name here only when you add the call that fires it.
 */

const ROOT = path.resolve(__dirname, "..");
const SEARCHED = ["app", "components", "hooks", "lib", "stores", "utils"];
const EXTENSIONS = new Set([".ts", ".tsx"]);

/** The contract itself and this test obviously mention every name. */
const NOT_A_CALL_SITE = new Set([
  path.join(ROOT, "lib", "analytics-events.ts"),
  path.join(ROOT, "lib", "analytics-coverage.test.ts"),
  path.join(ROOT, "lib", "analytics.test.ts"),
]);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry))) continue;
    if (NOT_A_CALL_SITE.has(full)) continue;
    found.push(full);
  }
  return found;
}

const corpus = SEARCHED.flatMap((dir) => sourceFiles(path.join(ROOT, dir)))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

/**
 * A name counts as fired when the corpus references it either through its
 * `EVENTS.X` constant or as the bare string — the second because the nine
 * events that predate the contract are still written as literals at their
 * call sites, and rewriting working code purely to satisfy a test would be
 * the test wagging the codebase.
 */
function isFired(key: string, value: string): boolean {
  return corpus.includes(`EVENTS.${key}`) || corpus.includes(`"${value}"`);
}

describe("event coverage", () => {
  it("fires every event it declares", () => {
    const dead = Object.entries(EVENTS)
      .filter(([key, value]) => !isFired(key, value))
      .map(([, value]) => value);

    expect(dead).toEqual([]);
  });

  it("searched a corpus that actually exists", () => {
    // Guards the check above against quietly passing on an empty read — a
    // coverage test that scans nothing reports perfect coverage.
    expect(corpus.length).toBeGreaterThan(100_000);
    expect(ALL_EVENT_NAMES.length).toBeGreaterThan(50);
  });
});
