/**
 * Bulk transaction import — `POST /v2/bulk-transactions/bulk-insert`.
 *
 * One endpoint, called twice, exactly as sole-webapp's
 * `components/Banking/Transactions/BulkTransaction/BulkTransaction.js` calls
 * it (not `components/Migration/BulkTransactionMigrations.js`, whose
 * `uploadFile`/`columnMapping` routes don't exist in `apiRoutes.js`):
 *
 *   1. `type: "validate"` — the backend runs the user's matching rules over
 *      the rows and hands them back enriched with an account subcategory and,
 *      where the rule names one, a client and contact.
 *   2. `type: "upload"` — the enriched rows are sent back and written.
 *
 * The split matters because the two calls validate differently. `validate`
 * checks only type/date/amount/description; `upload` additionally demands a
 * client *and* contact on every row that carries an account subcategory, and
 * a name on top of that for debits — and it rejects the **entire batch** if a
 * single row fails.
 *
 * The gap between them is what the wizard's Sole Fields step is for: the
 * validate response comes back with the user's matching rules already
 * applied, the step lets them complete or clear whatever the rules left
 * half-done, and `firstSoleFieldError` refuses to post until every row would
 * survive. Earlier this module quietly stripped the account off an
 * incomplete row instead; with a step to fix it in, silently discarding the
 * categorisation someone wrote a rule for is the wrong answer.
 */
import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { buildEncryptedRequestBody } from "@/lib/encrypted-request";

/** A client/contact pair as the backend echoes it back on a matched row. */
type ApiClient = {
  id?: number;
  name?: string;
  client_id?: number;
  contact_id?: number;
} | null;

type ApiAccountSubcategory = {
  account_subcategory_id?: number;
  name?: string;
  capital?: boolean;
  disabled?: boolean;
} | null;

/** What this module sends for one row, in either mode. */
export type BulkTransactionRow = {
  type: "credit" | "debit";
  /** `yyyy-MM-dd`. The backend rejects anything it can't parse, and anything
   *  in the future. */
  transaction_date: string;
  amount: number;
  description: string;
  /** 0 means "no category" — a plain, unmatched bank transaction. */
  account_subcategory_id: number;
  account_subcategory?: ApiAccountSubcategory;
  gst_include: boolean;
  /** `normalizeBulkTransactionRow` reads the client id and contact id off
   *  this object, not off top-level fields, so a matched row has to carry
   *  them here to survive the round trip. */
  client?: ApiClient;
  name?: string;
};

/** One row of the `validate` response. */
export type ValidatedTransactionRow = BulkTransactionRow & {
  client_id?: number | null;
  contact_id?: number | null;
  errors?: string[];
  is_valid?: boolean;
};

type ValidateResponse = {
  success?: boolean;
  message?: string;
  data?: { transactions?: ValidatedTransactionRow[] };
};

type UploadResponse = {
  success?: boolean;
  message?: string;
  data?: {
    transactions?: ValidatedTransactionRow[];
    data?: {
      success_transactions?: number;
      failed_transactions?: number;
      total_transactions?: number;
    };
  };
};

export type BulkUploadResult = {
  succeeded: number;
  failed: number;
  total: number;
};

/**
 * Step one: hand the parsed rows over and get back what the matching rules
 * made of them.
 *
 * A row the backend marks `is_valid: false` here failed the same basic checks
 * the wizard already runs client-side, so in practice this comes back clean —
 * but the flag is preserved rather than assumed, because the backend also
 * rejects future dates against *its* clock, not the browser's.
 */
export async function validateBulkTransactions(
  rows: BulkTransactionRow[],
): Promise<ValidatedTransactionRow[]> {
  const response = await api.post<ValidateResponse>(
    apiRoutes.bulkTransaction.bulkInsert,
    buildEncryptedRequestBody({ type: "validate", transaction_data: rows }),
  );

  if (response.data?.success === false) {
    throw new Error(response.data?.message || "Could not validate the import.");
  }

  return response.data?.data?.transactions ?? [];
}

/**
 * Why this row can't be uploaded with the account it carries, or `null`.
 *
 * The port of sole-webapp's `validateSoleFields`. `upload` mode demands a
 * client *and* a contact on every row that names an account subcategory, and
 * an asset/expense name on top of that for debits — and it rejects the whole
 * batch if one row falls short. Capital rows are the mirror image: the
 * backend refuses them for carrying a client, contact or name, so for those
 * "complete" means carrying none.
 *
 * A row with no account at all is always fine — it imports as an ordinary
 * unmatched bank transaction, which is what leaving Account blank means.
 */
export function soleFieldIssue(row: ValidatedTransactionRow): string | null {
  if (!row.account_subcategory_id) return null;

  if (row.account_subcategory?.capital === true) {
    return row.client || row.client_id || row.contact_id || row.name?.trim()
      ? "A capital account can't carry a client, supplier or name."
      : null;
  }

  if (!row.client_id || !row.contact_id) {
    return row.type === "credit"
      ? "Select a client, or clear the account."
      : "Select a supplier, or clear the account.";
  }

  if (row.type === "debit" && !row.name?.trim()) {
    return "Enter an asset/expense name, or clear the account.";
  }

  return null;
}

/**
 * The first row the backend would reject, as a sentence naming it.
 *
 * Checked here rather than left to the server because the server answers
 * all-or-nothing: one unfixable row takes the whole file down with it, and
 * "Cannot upload: 1 transaction(s) have validation errors" doesn't say
 * which.
 */
export function firstSoleFieldError(
  rows: ValidatedTransactionRow[],
): string | null {
  for (let index = 0; index < rows.length; index += 1) {
    const issue = soleFieldIssue(rows[index]);
    if (issue) return `Row ${index + 1}: ${issue}`;
  }
  return null;
}

/**
 * Shapes the Sole Fields rows for `upload`.
 *
 * The client id and contact id have to travel *inside* `client` —
 * `normalizeBulkTransactionRow` reads `txData.client?.client_id` and ignores
 * the top-level ones the validate response puts beside it.
 */
export function toUploadRows(
  rows: ValidatedTransactionRow[],
): BulkTransactionRow[] {
  return rows.map((row) => {
    const base: BulkTransactionRow = {
      type: row.type,
      transaction_date: row.transaction_date,
      amount: row.amount,
      description: row.description,
      gst_include: row.gst_include ?? true,
      account_subcategory_id: 0,
    };

    if (!row.account_subcategory_id) return base;

    const capital = row.account_subcategory?.capital === true;

    return {
      ...base,
      account_subcategory_id: row.account_subcategory_id,
      account_subcategory: row.account_subcategory,
      client: capital
        ? null
        : {
            ...(row.client ?? {}),
            client_id: row.client_id ?? undefined,
            contact_id: row.contact_id ?? undefined,
          },
      name: capital ? "" : (row.name ?? ""),
    };
  });
}

/** Step two: write the rows. Throws with the backend's own message on a 400. */
export async function uploadBulkTransactions(
  rows: BulkTransactionRow[],
): Promise<BulkUploadResult> {
  const response = await api.post<UploadResponse>(
    apiRoutes.bulkTransaction.bulkInsert,
    buildEncryptedRequestBody({ type: "upload", transaction_data: rows }),
  );

  const body = response.data;

  if (body?.success === false) {
    // A rejected batch comes back with every row and its reasons; surfacing
    // the first few is more use than "Upload failed".
    const reasons = (body.data?.transactions ?? [])
      .map((row, index) =>
        row.is_valid === false
          ? `Row ${index + 1}: ${row.errors?.join(", ") || "invalid"}`
          : null,
      )
      .filter(Boolean)
      .slice(0, 3);

    throw new Error(
      [body.message || "Failed to import transactions.", ...reasons].join(" "),
    );
  }

  const counts = body?.data?.data;
  const total = Number(counts?.total_transactions ?? rows.length);
  const succeeded = Number(counts?.success_transactions ?? rows.length);
  const failed = Number(counts?.failed_transactions ?? total - succeeded);

  /*
   * Both halves of the result, not just the happy one. A bulk import that
   * half fails is the problem worth finding, and an event that only ever
   * reports successes makes it invisible — which is the shape of every defect
   * this instrumentation was written in response to.
   */
  track(EVENTS.TRANSACTIONS_BULK_ACTIONED, {
    action: "import",
    count: succeeded,
    failed_count: failed,
    total,
  });

  return { succeeded, failed, total };
}
