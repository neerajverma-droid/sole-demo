/**
 * Script loading for the 4 public "pay this invoice" routes
 * (card / bank-transfer / payto / wallet), scoped to just this route group
 * rather than the whole `(public)` layout -- only these pages need
 * Worldpay/IntegraPay's hosted tokenization widget.
 *
 * Mirrors spm's own loading order (`apps/biz-client/src/app/layout.tsx`):
 * jQuery first (the tokenize script depends on it), then the tokenize
 * script itself, both deferred so they don't block the page shell from
 * rendering while the invoice-payment session is still loading.
 */
import Script from "next/script";

export default function PublicInvoicePaymentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Script
        src="https://code.jquery.com/jquery-3.2.1.min.js"
        strategy="beforeInteractive"
      />
      <Script src="/js/worldpay-tokenize.js" strategy="afterInteractive" />
      {children}
    </>
  );
}
