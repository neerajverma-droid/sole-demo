/**
 * Proposal → PDF, in the browser — sole-webapp's `lib/proposalPdfGenerator.js`.
 *
 * Each rendered `.proposal-document-page` is rasterised with html2canvas,
 * then sliced into A4-height strips. A cut is nudged up to the nearest
 * near-white row so it never lands through a line of text.
 *
 * jsPDF and html2canvas are imported on demand.
 */

function isRowMostlyWhite(ctx: CanvasRenderingContext2D, width: number, y: number): boolean {
  const { data } = ctx.getImageData(0, y, width, 1);
  let white = 0;
  for (let x = 0; x < width; x += 1) {
    const i = x * 4;
    if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) white += 1;
  }
  return white / width > 0.98;
}

/** Looks back from the naive cut for a safe row, within `searchRange`. */
export function findSafeSliceHeight(
  canvas: HTMLCanvasElement,
  startY: number,
  naiveHeight: number,
  searchRange: number,
): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return naiveHeight;
  const cut = startY + naiveHeight;
  const range = Math.min(searchRange, naiveHeight - 10);
  for (let offset = 0; offset < range; offset += 1) {
    const y = cut - offset;
    if (y <= startY) break;
    if (isRowMostlyWhite(ctx, canvas.width, y)) return y - startY;
  }
  return naiveHeight;
}

/**
 * Saves the PDF, or — with `mode: "blob"` — hands it back instead, for the
 * client portal to upload as the signed copy.
 */
export async function generateProposalPdf(
  container: HTMLElement | null,
  fileName?: string,
): Promise<void>;
export async function generateProposalPdf(
  container: HTMLElement | null,
  fileName: string,
  options: { mode: "blob" },
): Promise<Blob | null>;
export async function generateProposalPdf(
  container: HTMLElement | null,
  fileName = "Proposal",
  options: { mode?: "save" | "blob" } = {},
): Promise<Blob | null | void> {
  if (!container) return options.mode === "blob" ? null : undefined;

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const pages = Array.from(container.querySelectorAll<HTMLElement>(".proposal-document-page"));
  if (!pages.length) return options.mode === "blob" ? null : undefined;

  // Capturing before fonts and images land is the usual cause of a blank page.
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all([
    document.fonts ? document.fonts.ready.catch(() => undefined) : Promise.resolve(),
    ...images
      .filter((img) => !img.complete)
      .map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
  ]);

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let first = true;

  for (const node of pages) {
    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const scale = canvas.width / pageWidth;
    const pageHeightPx = pageHeight * scale;
    const searchRange = 200 * (canvas.width / node.offsetWidth || 1);

    let y = 0;
    while (y < canvas.height) {
      const remaining = canvas.height - y;
      let slice = Math.min(pageHeightPx, remaining);
      if (slice < remaining) slice = findSafeSliceHeight(canvas, y, slice, searchRange);

      const strip = document.createElement("canvas");
      strip.width = canvas.width;
      strip.height = slice;
      strip.getContext("2d")?.drawImage(canvas, 0, y, canvas.width, slice, 0, 0, canvas.width, slice);

      if (!first) pdf.addPage();
      first = false;
      // JPEG: flat colour and text compress ~80% smaller than PNG at no visible cost.
      pdf.addImage(strip.toDataURL("image/jpeg", 0.85), "JPEG", 0, 0, pageWidth, slice / scale);
      y += slice;
    }
  }

  if (options.mode === "blob") return pdf.output("blob");
  pdf.save(`${fileName || "Proposal"}.pdf`);
}
