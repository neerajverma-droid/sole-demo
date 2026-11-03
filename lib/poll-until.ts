/**
 * Calls `check` until it answers true, gives up after `timeoutMs`, or stops
 * when `signal` aborts — whichever comes first.
 *
 * A check that throws counts as "not yet" rather than ending the wait: what's
 * being waited on is usually a server catching up, and one failed request in
 * the middle of that says nothing about whether it has.
 */
export function pollUntil(
  check: () => Promise<boolean>,
  {
    intervalMs,
    timeoutMs,
    signal,
  }: { intervalMs: number; timeoutMs: number; signal?: AbortSignal },
): Promise<"done" | "timeout" | "aborted"> {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      clearTimeout(timer);
      resolve("aborted");
    };
    if (signal?.aborted) return resolve("aborted");
    signal?.addEventListener("abort", onAbort, { once: true });

    const finish = (outcome: "done" | "timeout") => {
      signal?.removeEventListener("abort", onAbort);
      resolve(outcome);
    };

    const attempt = async () => {
      let ok = false;
      try {
        ok = await check();
      } catch {
        ok = false;
      }
      if (signal?.aborted) return;
      if (ok) return finish("done");
      if (Date.now() >= deadline) return finish("timeout");
      timer = setTimeout(() => void attempt(), intervalMs);
    };

    void attempt();
  });
}
