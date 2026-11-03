"use client";

import * as React from "react";

/**
 * Boots the LocatorJS click-to-source overlay (Option/Alt + click) in dev.
 *
 * The Chrome extension's bundled runtime only understands the legacy
 * `data-locatorjs-id` attributes, so it can't read the path-based
 * `data-locatorjs` ones the Turbopack loader in `next.config.ts` emits —
 * React 19 also dropped the `_debugSource` it used to fall back on. The
 * npm runtime reads them. Dynamic import keeps it out of production bundles.
 */
export function LocatorBootstrap() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    import("@locator/runtime").then(({ default: setupLocatorUI }) =>
      setupLocatorUI(),
    );
  }, []);
  return null;
}
