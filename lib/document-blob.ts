/**
 * What the invoice and quote preview endpoints hand back, as a Blob the dialogs can show.
 *
 * The real API answers with PDF bytes, which are labelled `application/pdf` here whatever
 * the transport called them. The demo has no PDF renderer: its mock answers with the page
 * itself as an HTML Blob, and that type is kept so the frame shows it as a page.
 */
export function asDocumentBlob(data: unknown): Blob {
  if (data instanceof Blob && data.type.toLowerCase().startsWith("text/html")) {
    return data;
  }
  return new Blob([data as BlobPart], { type: "application/pdf" });
}

/** The file name for saving `blob`: `.pdf` becomes `.html` when the blob is an HTML page. */
export function documentFileName(blob: Blob, filename: string): string {
  return blob.type.toLowerCase().startsWith("text/html")
    ? filename.replace(/\.pdf$/i, ".html")
    : filename;
}
