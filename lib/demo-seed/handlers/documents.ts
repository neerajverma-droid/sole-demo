/* eslint-disable @typescript-eslint/no-explicit-any -- seed rows and request bodies are loosely typed */
import {
  isNdisCapable,
  previewErrorHtml,
  renderInvoiceHtml,
  renderQuoteHtml,
  resolveTemplateFile,
  templateCatalogue,
  type RenderOptions,
} from "../doc-templates/render";
import type { DemoHandler, HandlerCtx, HandlerResponse } from "./types";

/**
 * Invoice and quote previews, rendered as HTML from the real Sole layouts (see
 * ../doc-templates). The app asks for a PDF; the demo answers with the page itself, which the
 * preview dialogs show in their frame. Pure: nothing here changes the books.
 */

const html = (markup: string): HandlerResponse => ({
  status: 200,
  data: new Blob([markup], { type: "text/html" }),
  headers: { "content-type": "text/html; charset=utf-8" },
});

const json = (data: unknown): HandlerResponse => ({ status: 200, data });

const toId = (value: unknown) => String(value ?? "").trim();
const hasId = (value: unknown) => toId(value) !== "";

/** The row a preview is of: the one asked for, else the most recent (a sample for the Styling tab). */
function pickRecord(rows: any[], idKeys: string[], wanted: unknown): any {
  const id = toId(wanted);
  if (id) {
    const found = rows.find((row) => idKeys.some((key) => toId(row?.[key]) === id));
    if (found) return found;
  }
  return rows.find((row) => (row?.status ?? "") !== "draft") ?? rows[0];
}

function invoiceOptions(ctx: HandlerCtx, templateId: unknown): RenderOptions {
  const { seed, story, cfg, today, params } = ctx;
  const record = pickRecord(seed.invoices as any[], ["invoice_id", "id"], params.invoiceId ?? params.invoice_id);
  return {
    story,
    cfg,
    seed,
    today,
    record,
    templateId: hasId(templateId) ? toId(templateId) : undefined,
    receipt: params.type === "invoice-receipt",
  };
}

function quoteOptions(ctx: HandlerCtx, templateId: unknown): RenderOptions {
  const { seed, story, cfg, today, params } = ctx;
  const record = pickRecord(seed.quotes as any[], ["quote_id", "id"], params.quoteId ?? params.quote_id);
  return {
    story,
    cfg,
    seed,
    today,
    record,
    templateId: hasId(templateId) ? toId(templateId) : undefined,
  };
}

/** A GET asked for as a PDF (the preview dialogs) gets the page; anything else (Styling tab) gets JSON with `html`. */
const wantsDocument = (ctx: HandlerCtx) => String(ctx.params.render_type ?? "").toLowerCase() === "pdf";

function safely(render: () => string): string {
  try {
    return render();
  } catch {
    return previewErrorHtml("This preview couldn't be drawn. Try again, or reopen the document.");
  }
}

function previewResponse(ctx: HandlerCtx, markup: string, info: Record<string, unknown>): HandlerResponse {
  if (wantsDocument(ctx)) return html(markup);
  return json({ success: true, data: { ...info, html: markup } });
}

export const handle: DemoHandler = (ctx) => {
  const { method, path } = ctx;

  /* ---- Template catalogue (Sales settings -> Styling) -------------------- */
  if (method === "GET" && path === "/template/list") {
    const items = templateCatalogue(ctx.story, ctx.cfg);
    const grouped: Record<string, typeof items> = {};
    for (const item of items) (grouped[item.category_name] ??= []).push(item);
    return json({ success: true, data: grouped, total: items.length });
  }

  /* ---- Saved invoice: preview / details ---------------------------------- */
  const invoiceRoute = /^\/template\/([^/]+)\/(preview|details)$/.exec(path);
  if (method === "GET" && invoiceRoute) {
    const templateId = decodeURIComponent(invoiceRoute[1]);
    const markup = safely(() => renderInvoiceHtml(invoiceOptions(ctx, templateId)));
    const file = resolveTemplateFile("invoice", templateId, isNdisCapable(ctx.story, ctx.cfg));
    return previewResponse(ctx, markup, {
      templateId,
      template_info: { id: templateId, type: "invoice", file_path: `${file}.js` },
    });
  }

  /* ---- Saved quote preview ------------------------------------------------ */
  const quoteRoute = /^\/quote\/preview\/([^/]+)$/.exec(path);
  if (method === "GET" && quoteRoute) {
    const templateId = decodeURIComponent(quoteRoute[1]);
    const markup = safely(() => renderQuoteHtml(quoteOptions(ctx, templateId)));
    const file = resolveTemplateFile("quote", templateId, isNdisCapable(ctx.story, ctx.cfg));
    return previewResponse(ctx, markup, {
      templateId,
      template_info: { id: templateId, type: "quote", file_path: `${file}.js` },
    });
  }

  /* ---- Drafts: the editors' Preview button -------------------------------- */
  if (method === "POST" && path === "/template/runtime-preview") {
    const markup = safely(() => {
      const payload = ctx.fields();
      const saved = hasId(payload.invoiceId)
        ? (ctx.seed.invoices as any[]).find((row) => [row.invoice_id, row.id].some((id) => toId(id) === toId(payload.invoiceId)))
        : undefined;
      return renderInvoiceHtml({
        story: ctx.story,
        cfg: ctx.cfg,
        seed: ctx.seed,
        today: ctx.today,
        record: saved,
        payload,
        templateId: payload.template_id ?? payload.templateId,
        receipt: payload.type === "invoice-receipt",
      });
    });
    return html(markup);
  }

  if (method === "POST" && path === "/quote/runtime-preview") {
    const markup = safely(() => {
      const payload = ctx.fields();
      const saved = hasId(payload.quoteId)
        ? (ctx.seed.quotes as any[]).find((row) => [row.quote_id, row.id].some((id) => toId(id) === toId(payload.quoteId)))
        : undefined;
      return renderQuoteHtml({
        story: ctx.story,
        cfg: ctx.cfg,
        seed: ctx.seed,
        today: ctx.today,
        record: saved,
        payload,
        templateId: payload.template_id ?? payload.templateId,
      });
    });
    return html(markup);
  }

  return null;
};
