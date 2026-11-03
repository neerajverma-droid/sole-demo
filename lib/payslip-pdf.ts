/**
 * Payslip HTML → PDF, in the browser.
 *
 * `GET /payruns/{id}/download` answers with an HTML document holding one
 * payslip per top-level `<body>` child. Each is rendered off-screen at A4 width
 * (794px), rasterised with html2canvas at 2× and laid onto an A4 jsPDF page,
 * running onto further pages when a payslip is taller than one — the same
 * approach as sole-webapp's `lib/payslipPdf.js`.
 *
 * sole-webapp pointed html2canvas at a `/api/payslip-images-proxy` route that
 * never existed. There's no proxy here: remote images (an employer's logo on
 * S3) are requested with CORS, and one that refuses is simply left out rather
 * than tainting the canvas.
 *
 * jsPDF and html2canvas are imported on demand — together they're a few
 * hundred kilobytes nobody needs until they press Download.
 */

/** The Sole mark this app actually ships. */
const SOLE_LOGO_PATH = "/sole-logo.svg";
const A4_WIDTH_PX = 794;
const IMAGE_LOAD_TIMEOUT_MS = 15000;

/**
 * The payslip template names Sole's logo by sole-webapp's paths
 * (`/images/logo.svg`, `logo-spm`, `logo-sole`), none of which exist in this
 * app's `public/` — so any same-origin reference to one is pointed at ours.
 */
export function isSoleLogoPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return (
    path.includes("logo-spm") ||
    path.includes("logo-sole") ||
    path === "/images/logo.svg"
  );
}

function normaliseImage(img: HTMLImageElement): void {
  const src = img.getAttribute("src")?.trim();
  if (!src) return;
  try {
    const url = new URL(src, window.location.origin);
    if (url.origin === window.location.origin && isSoleLogoPath(url.pathname)) {
      img.src = SOLE_LOGO_PATH;
      // Ours is a wordmark, not a square glyph — let it keep its proportions,
      // and drop the "Sole" text beside it that would now say it twice.
      img.style.setProperty("width", "auto", "important");
      img.style.setProperty("height", "16px", "important");
      img.style.setProperty("border-radius", "0", "important");
      const next = img.nextElementSibling as HTMLElement | null;
      if (next && next.textContent?.trim() === "Sole") {
        next.style.setProperty("display", "none", "important");
      }
      return;
    }
    if (url.origin !== window.location.origin) img.crossOrigin = "anonymous";
    img.src = url.href;
  } catch {
    // An unparseable src is left as it was.
  }
}

function waitForImage(img: HTMLImageElement): Promise<void> {
  return new Promise((resolve) => {
    if (img.complete) {
      resolve();
      return;
    }
    const done = () => {
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, IMAGE_LOAD_TIMEOUT_MS);
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
}

/** Each payslip in the download, as its own element. */
export function splitPayslips(html: string): Element[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.body.children).filter(
    (element) => !["SCRIPT", "STYLE", "LINK", "META"].includes(element.tagName),
  );
}

export async function savePayslipPdfFromHtml(html: string, fileName: string): Promise<void> {
  const payslips = splitPayslips(html);
  if (payslips.length === 0) throw new Error("No payslip data found.");

  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let index = 0; index < payslips.length; index += 1) {
    const container = document.createElement("div");
    container.style.cssText = `position:absolute;left:-9999px;top:0;width:${A4_WIDTH_PX}px;background:#ffffff;`;
    container.appendChild(document.importNode(payslips[index], true));
    document.body.appendChild(container);

    try {
      const images = Array.from(container.querySelectorAll("img"));
      images.forEach(normaliseImage);
      await Promise.all(images.map(waitForImage));

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        imageTimeout: IMAGE_LOAD_TIMEOUT_MS,
        logging: false,
        backgroundColor: "#ffffff",
      });

      if (index > 0) pdf.addPage();
      const image = canvas.toDataURL("image/jpeg", 0.98);
      const imageHeight = (canvas.height * pageWidth) / canvas.width;
      let remaining = imageHeight;
      let offset = 0;
      pdf.addImage(image, "JPEG", 0, offset, pageWidth, imageHeight);
      remaining -= pageHeight;
      while (remaining > 0) {
        offset -= pageHeight;
        pdf.addPage();
        pdf.addImage(image, "JPEG", 0, offset, pageWidth, imageHeight);
        remaining -= pageHeight;
      }
    } finally {
      container.remove();
    }
  }

  pdf.save(fileName);
}
