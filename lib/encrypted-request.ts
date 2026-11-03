import { encryptPayload } from "@/utils/encrypt";

/**
 * The shape sole-webapp's generic authenticated `post`/`patch` helper builds
 * (hooks/useService.js) — used by calls like `user.updateUserProfile`, not by
 * every write (business and invoice creation both send a plain unencrypted
 * FormData instead, bypassing this). Where it does apply: every field that
 * isn't a File gets folded into one object, AES-encrypted into a single
 * `data` string; any files travel raw, under their own field name in
 * FormData when there's one, or `files[]` when there's more than one. With
 * no files at all, the encrypted object is sent as plain JSON instead of
 * FormData — there's nothing for FormData to carry.
 */
export function buildEncryptedRequestBody(
  fields: Record<string, unknown>,
  /**
   * Either named file fields (`{ profile_pic: file }`), or a plain array for
   * a document that just carries attachments — an array always travels as
   * `files[]`, including when there is only one of them, because that's the
   * field name the endpoints reading a list expect.
   */
  files: Record<string, File | null | undefined> | File[] = {},
): FormData | { data: string } {
  const present: [string, File][] = Array.isArray(files)
    ? files.filter((file): file is File => file instanceof File).map((file) => ["files[]", file])
    : Object.entries(files).filter(
        (entry): entry is [string, File] => entry[1] instanceof File,
      );

  const encrypted = encryptPayload(fields);

  if (present.length === 0) {
    return encrypted;
  }

  const form = new FormData();
  form.append("data", encrypted.data);
  if (Array.isArray(files) || present.length > 1) {
    present.forEach(([, file]) => form.append("files[]", file));
  } else {
    present.forEach(([key, file]) => form.append(key, file));
  }
  return form;
}
