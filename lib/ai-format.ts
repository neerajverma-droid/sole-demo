import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { apiErrorMessage } from "@/lib/api-error";
import type { BulkImportSpec } from "@/lib/bulk-import";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";
import {
  isSupportedImportFile,
  parseSpreadsheet,
  type ParsedSheet,
} from "@/lib/file-parser";
import type { MigrationStepId } from "@/lib/migrations";

/**
 * AI formatting for the Migration Center importers.
 *
 * Every importer reads its file through `readImportFile` instead of parsing it
 * directly. The file goes to sole-ocr's one endpoint with the importer's own
 * field list; Claude rewrites whatever layout the file came in (a Xero export,
 * a bank statement, a hand-made sheet) into rows keyed by exactly those field
 * labels. What comes back is a `ParsedSheet` like the local parser's, so the
 * auto-mapper matches every column 1:1 and Map → Review → Import run
 * unchanged.
 *
 * If the AI call fails, the file is parsed locally instead — the importer
 * still works, and the user maps columns by hand as before.
 */

/** One target column, as the backend's prompt describes it to Claude. */
export type AiFormatField = {
  label: string;
  required?: boolean;
  description?: string;
  /** Allowed values, for a field that only takes a fixed set. */
  options?: readonly string[];
};

/** What an importer tells `readImportFile` about itself. */
export type AiFormatTarget = {
  /** Which migration this is. Sent as the endpoint's `type`. */
  type: MigrationStepId;
  fields: readonly AiFormatField[];
};

/** A BulkImportDialog spec's fields, as the AI endpoint takes them. */
export function aiTargetFromBulkSpec(spec: BulkImportSpec): AiFormatTarget {
  return {
    type: spec.migrationStep,
    fields: spec.fields.map((field) => ({
      label: field.label,
      required: field.required,
      description: field.desc,
      options:
        field.review?.editor.kind === "select"
          ? field.review.editor.options
          : undefined,
    })),
  };
}

type AiFormatResponse = {
  success?: boolean;
  message?: string;
  data?: {
    columns?: string[];
    rows?: Record<string, string>[];
    notes?: string[];
  };
};

async function aiFormatFile(
  file: File,
  target: AiFormatTarget,
): Promise<{ sheet: ParsedSheet; notes: string[] }> {
  const response = await api.post<AiFormatResponse>(
    apiRoutes.migration.aiFormat,
    buildEncryptedRequestBody(
      { type: target.type, fields: target.fields },
      { file },
    ),
  );

  const body = response.data;
  if (body?.success === false || !body?.data) {
    throw new Error(body?.message || "AI formatting failed.");
  }

  return {
    sheet: {
      columns: body.data.columns ?? target.fields.map((field) => field.label),
      rows: body.data.rows ?? [],
    },
    notes: body.data.notes ?? [],
  };
}

export type ImportFileResult =
  | {
      ok: true;
      sheet: ParsedSheet;
      /** True when Claude formatted it; false when it fell back to a local parse. */
      aiFormatted: boolean;
      /** Claude's notes about the file (rows skipped, ambiguous values…). */
      notes: string[];
      /** Why AI formatting was skipped, when it was. */
      aiError?: string;
    }
  | { ok: false; error: string };

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Why a file can't be imported, or `null` if it can. Checked the moment a
 * file is picked, so a wrong file is turned away before anything is sent.
 */
export function importFileError(file: File): string | null {
  if (!isSupportedImportFile(file)) {
    return "Upload a CSV or Excel file (.csv, .xls, .xlsx).";
  }
  if (file.size > MAX_BYTES) {
    return "That file is over 5 MB. Split it and try again.";
  }
  return null;
}

/**
 * Reads an importer's chosen file: validates it, has Claude put it in the
 * importer's format, and falls back to parsing it as-is if that fails.
 */
export async function readImportFile(
  file: File,
  target: AiFormatTarget,
): Promise<ImportFileResult> {
  const invalid = importFileError(file);
  if (invalid) return { ok: false, error: invalid };

  let aiError: string | undefined;
  try {
    const { sheet, notes } = await aiFormatFile(file, target);
    if (sheet.rows.length > 0) {
      return { ok: true, sheet, aiFormatted: true, notes };
    }
    aiError = "AI formatting found no rows to import.";
  } catch (error) {
    aiError = apiErrorMessage(error, "AI formatting failed.");
  }

  try {
    const sheet = await parseSpreadsheet(file);
    if (sheet.rows.length === 0) {
      return {
        ok: false,
        error: "That file has no data rows below the header.",
      };
    }
    return { ok: true, sheet, aiFormatted: false, notes: [], aiError };
  } catch {
    return { ok: false, error: "That file could not be read." };
  }
}
