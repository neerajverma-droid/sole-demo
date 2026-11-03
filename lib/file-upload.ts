import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";

/**
 * File attachment, sole-webapp's way — two mechanisms, not one, and which
 * applies depends on whether the record already exists:
 *
 *  - Creating: there's no id yet for a file to attach to, so it travels
 *    embedded in the record's own create request instead — see
 *    `buildEncryptedRequestBody` (lib/encrypted-request.ts), which folds a
 *    `remove_<field>` sentinel in the same way when there's no new file.
 *  - Editing: the record already has an id, so the file is *also* uploaded
 *    (or deleted) immediately against the generic documents endpoint —
 *    `uploadSourceDocument` / `deleteSourceDocument` below, read from
 *    `components/Common/UploadMulipleShadcn.js` — live as soon as it's
 *    picked or removed, not deferred to the record's own save. That's not
 *    redundant with the field on save: one saves the file as a document,
 *    the other as the record's own field.
 */
export type FileFieldUpdate = {
  /** A newly chosen file, ready to upload in place of whatever's saved. */
  file?: File | null;
  /** Clears the saved file — only meaningful when `file` is absent. */
  remove?: boolean;
};

type UploadDocumentResponse = {
  document_id?: string | number;
  data?: { document_id?: string | number };
};

/**
 * Uploads one file against an existing record right away — only usable once
 * that record has an id, which is exactly sole-webapp's "edit mode" (there's
 * no `source_id` for something still being created). Returns the new
 * document's id, for a later `deleteSourceDocument` if the file is replaced
 * or removed before the record itself is saved.
 */
export async function uploadSourceDocument(
  sourceType: string,
  sourceId: string | number,
  file: File,
): Promise<string | null> {
  const form = new FormData();
  form.append("files[]", file);
  form.append("source_type", sourceType);
  form.append("source_id", String(sourceId));

  const response = await api.post<UploadDocumentResponse>(
    apiRoutes.fileUpload.document,
    form,
  );
  const documentId =
    response.data?.document_id ?? response.data?.data?.document_id;
  return documentId === undefined || documentId === null
    ? null
    : String(documentId);
}

export async function deleteSourceDocument(documentId: string): Promise<void> {
  await api.delete(`${apiRoutes.fileUpload.document}/${documentId}`);
}
