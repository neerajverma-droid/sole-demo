"use client";

import * as React from "react";

import { fetchInvoicePdfBlob, type Invoice } from "@/lib/invoices";

/**
 * The real, server-rendered PDF for an invoice — mirrors sole-webapp's
 * InvoiceInfo.js, which loads this once per invoice and reuses the same
 * blob for both the on-screen preview and the download, rather than
 * fetching (or reconstructing) the document twice.
 */
export function useInvoicePdf(
  invoice: Pick<Invoice, "id" | "templateId"> | undefined,
  receipt = false,
) {
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const [blob, setBlob] = React.useState<Blob | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!invoice) {
      setPdfUrl(null);
      setBlob(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setPdfUrl(null);
    setBlob(null);

    fetchInvoicePdfBlob(invoice, receipt)
      .then((result) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(result);
        setBlob(result);
        setPdfUrl(objectUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load the PDF.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, receipt]);

  return { pdfUrl, blob, loading, error };
}
