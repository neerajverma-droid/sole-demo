"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  readImportFile,
  type AiFormatTarget,
  type ImportFileResult,
} from "@/lib/ai-format";

/**
 * The Import step's file read, shared by every Migration Center importer.
 *
 * Wraps `readImportFile` (AI formatting with a local-parse fallback) with the
 * two things a dialog needs around it: a `formatting` flag while Claude works,
 * and a toast saying which path the file took. A file picked while an earlier
 * one is still formatting wins — the earlier result resolves to `null`.
 */
export function useImportFileReader(target: AiFormatTarget) {
  const [formatting, setFormatting] = React.useState(false);
  const latest = React.useRef(0);

  const read = React.useCallback(
    async (file: File): Promise<ImportFileResult | null> => {
      const id = ++latest.current;
      setFormatting(true);
      try {
        const result = await readImportFile(file, target);
        if (id !== latest.current) return null;

        // Kept to one line each — Claude's notes and the raw AI error can run
        // to a paragraph, which buries the Map step under the toast.
        if (result.ok && result.aiFormatted) {
          toast.success(`Formatted ${result.sheet.rows.length} rows with AI`, {
            description: "Check them on the Review step before importing.",
          });
        } else if (result.ok) {
          toast.warning("Couldn't format this file with AI", {
            description: "Map the columns yourself on the next step.",
          });
        }
        return result;
      } finally {
        if (id === latest.current) setFormatting(false);
      }
    },
    [target],
  );

  /** Drops any read still in flight, e.g. when the dialog resets. */
  const cancel = React.useCallback(() => {
    latest.current += 1;
    setFormatting(false);
  }, []);

  return { read, cancel, formatting };
}
