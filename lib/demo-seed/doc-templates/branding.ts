/* eslint-disable */
// @ts-nocheck
// Ported mechanically from sole-ocr (CommonJS -> ESM). Kept verbatim on purpose: fidelity with the real
// invoice/quote layouts matters more than style here.

/**
 * Wrap HTML content with complete document structure
 */
export const wrapWithDocumentStructure = (htmlContent, brandingData = null) => {
  const brandingCSS = generateBrandingCSS(brandingData);

  return `
      <!DOCTYPE html>
      <html lang="en">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice Template</title>
    <style>
        /* Global box-sizing */

        /*
         * Physical page margins live here, not in page.pdf(): Chromium lets a CSS
         * @page margin override Puppeteer's \`margin\` option, so the option passed
         * by every render path is ignored. Left/right are 0 because each template
         * pads its own content. Top/bottom give every continuation page breathing
         * room so rows don't print against the paper edge; the first page keeps a
         * 0 top margin so full-bleed header bars still sit flush with the top.
         * A template can override these (e.g. invoice-6 frames every page) with its
         * own @page rule, which comes later in the document.
         */
        @page { size: A4; margin: 10mm 0 10mm 0; }
        @page :first { margin-top: 0; }

        * {
            box-sizing: border-box;
        }

        /* Base body styles */
        body {
            font-family: 'Inter', 'Helvetica', Arial, sans-serif; margin: 0; padding: 0; color: #333; line-height: 1.3; background: #fff;
        }

        /*
         * Global break-inside rules — applied OUTSIDE @media print so they fire during
         * Puppeteer PDF rendering regardless of media emulation.
         */
        tr, td, th {
            break-inside: avoid;
            page-break-inside: avoid;
        }

        /* Print and pagination styles - Applied globally to all templates */
        @media print {
            body {
                margin: 0;
                padding: 0;
                padding-top: 0 !important;
                padding-bottom: 0 !important;
                background-color: white;
                /* Remove flex layout — flexbox on body disrupts PDF page flow */
                display: block !important;
            }

            /*
             * CRITICAL: overflow:hidden clips content at page boundaries in multi-page PDFs.
             * Force visible so content flows correctly across pages.
             */
            .invoice-page,
            .invoice-container {
                overflow: visible !important;
                border-radius: 0 !important;
            }

            .blue-line {
                page-break-after: avoid;
            }

            .invoice-container {
                width: 100%;
                margin: 0;
                padding: 20px;
                box-shadow: none;
                background-color: #ffffff;
            }

            /* Prevent page breaks inside important elements */
            .invoice-header,
            .info-grid,
            .participant-plan-grid,
            .payment-box,
            .payment-section,
            .totals-section,
            .payment-details,
            .paymentDetails-main {
                break-inside: avoid;
                page-break-inside: avoid;
            }

            /* Keep address and bottom layout sections together */
            .bottom-section,
            .totals-box,
            .address-section,
            .address-col {
                break-inside: avoid;
                page-break-inside: avoid;
            }

            /* Allow breaks for large tables, but keep individual rows together */
            .items-table,
            .table,
            table {
                page-break-inside: auto;
            }

            /* Universal: ALL table rows must not split across pages */
            tr, td, th {
                break-inside: avoid;
                page-break-inside: avoid;
                break-after: auto;
                page-break-after: auto;
            }

            /* Keep footer section together */
            .below-section .social-links,
            .invoice-footer-container,
            .invoice-footer {
                break-inside: avoid;
                page-break-inside: avoid;
            }

            /*
             * The closing note/social footer flows after the content. Keep it on the
             * same page as the block before it so it never ends up alone on a page.
             */
            .doc-footer,
            .doc-footer-note,
            .invoice-footer-container {
                break-inside: avoid;
                page-break-inside: avoid;
                break-before: avoid;
                page-break-before: avoid;
            }

            /*
             * These footers used to be pinned over the bottom of the sheet; now that they
             * flow, their outer 10px wrapper padding only adds height and indents the
             * footer box from the content above it, so replace it with a plain gap.
             */
            .doc-footer-flow {
                padding: 0 !important;
                margin-top: 12px !important;
            }

            /* Never leave a heading stranded at the bottom of a page */
            h1, h2, h3, h4,
            .section-title {
                break-after: avoid;
                page-break-after: avoid;
            }

            /* Small closing blocks some templates use under their own class names */
            .footer-section,
            .notes-section,
            .notes-box,
            .totals-group,
            .payment-totals,
            .ft-notes,
            .ft-bottom,
            .ft-card,
            .ft-payment-card {
                break-inside: avoid;
                page-break-inside: avoid;
            }

            /*
             * Templates size their page wrapper with min-height: 297mm so the on-screen
             * preview looks like a sheet of paper. In print the page box is already
             * A4 minus the @page margins, so that min-height overflows into an extra,
             * mostly blank page. Let the wrapper size to its content instead.
             */
            .invoice-container,
            .invoice-page,
            .ft-page {
                min-height: auto !important;
                box-shadow: none !important;
                /*
                 * The @page bottom margin already leaves room under the last block.
                 * Chromium keeps a box's bottom padding on its last page, so up to 40px
                 * of extra padding here pushed a document's final line onto a page of
                 * its own.
                 */
                padding-bottom: 0 !important;
            }

            /*
             * The grey "desk" behind the paper in the on-screen preview must not print:
             * the root background fills the whole page, so it shows below the content.
             * A template that deliberately colours the page (invoice-6) overrides this
             * with its own !important rule, which comes later in the document.
             */
            html,
            body {
                background: #ffffff !important;
            }
        }
        
        /* General page break rules for PDF generation */
        .page-break {
            page-break-before: always;
        }
        
        .avoid-break {
            page-break-inside: avoid;
        }
        
        /* Branding specific styles */
        ${brandingCSS}
     </style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>`;
};

/**
 * Apply branding customizations to rendered HTML content
 */
export const applyBrandingToHtml = (htmlContent, brandingData) => {
  if (!brandingData) return htmlContent;

  // Replace placeholder tokens with actual branding values
  htmlContent = htmlContent.replace(/\{BRAND_COLOR\}/g, brandingData?.brand_color || '#4d4dff');
  htmlContent = htmlContent.replace(/\{CONTENT_COLOR\}/g, brandingData?.content_color || '#000000');

  // Replace social media links placeholder
  if (
    (brandingData?.facebook_url_enabled && brandingData?.facebook_url) ||
    (brandingData?.tiktok_url_enabled && brandingData?.tiktok_url) ||
    (brandingData?.instagram_url_enabled && brandingData?.instagram_url) ||
    (brandingData?.linkedin_url_enabled && brandingData?.linkedin_url) ||
    (brandingData?.website_enabled && brandingData?.website)
  ) {
    const socialLinksHtml = generateSocialLinksHtml(brandingData);
    // htmlContent = htmlContent.replace(/\{SOCIAL_MEDIA_LINKS\}/g, socialLinksHtml);
  } else {
    // Remove placeholder if no social media links
    htmlContent = htmlContent.replace(/\{SOCIAL_MEDIA_LINKS\}/g, '');
  }

  // Replace brand color placeholders in rendered HTML (legacy support)
  htmlContent = htmlContent.replace(/#4d4dff/g, brandingData?.brand_color || '#4d4dff');
  htmlContent = htmlContent.replace(/brand-primary/g, brandingData?.brand_color || '#4d4dff');

  // Replace content color placeholders (legacy support)
  htmlContent = htmlContent.replace(/#000000/g, brandingData?.content_color || '#000000');

  return htmlContent;
};

/**
 * Generate CSS for branding colors
 */
export const generateBrandingCSS = (brandingData) => {
  if (!brandingData) return '';

  return `
        .brand-primary {
            color: ${brandingData?.brand_color || '#4d4dff'} !important;
        }
        .bg-brand-primary {
            background-color: ${brandingData?.brand_color || '#4d4dff'} !important;
        }
        .border-brand-primary {
            border-color: ${brandingData?.brand_color || '#4d4dff'} !important;
        }
        .text-brand-content {
            color: ${brandingData?.content_color || '#000000'} !important;
        }
    `;
};

/**
 * Generate social media links HTML
 */
export const generateSocialLinksHtml = (brandingData) => {
  const links = [];

  if (brandingData?.facebook_url_enabled && brandingData?.facebook_url) {
    links.push(`<a href="${brandingData?.facebook_url}" target="_blank">Facebook</a>`);
  }
  if (brandingData?.tiktok_url_enabled && brandingData?.tiktok_url) {
    links.push(`<a href="${brandingData?.tiktok_url}" target="_blank">TikTok</a>`);
  }
  if (brandingData?.instagram_url_enabled && brandingData?.instagram_url) {
    links.push(`<a href="${brandingData?.instagram_url}" target="_blank">Instagram</a>`);
  }
  if (brandingData?.linkedin_url_enabled && brandingData?.linkedin_url) {
    links.push(`<a href="${brandingData?.linkedin_url}" target="_blank">LinkedIn</a>`);
  }
  if (brandingData?.website_enabled && brandingData?.website) {
    links.push(`<a href="${brandingData?.website}" target="_blank">Website</a>`);
  }
  if (brandingData?.phone_enabled && brandingData?.phone) {
    links.push(`<span>Phone: ${brandingData?.phone}</span>`);
  }

  if (links.length === 0) return '';

  return `
        <div class="social-links">
            ${links.join(' | ')}
        </div>
    `;
};


/**
 * Utility function to resolve branding toggles - used across all templates
 * Maps 1/0 or true/false to booleans, defaulting to show when branding is absent
 */
export const resolveBrandingToggle = (flag, defaultValue = true) => {
  if (flag === null || flag === undefined) return defaultValue;
  return flag === true || flag === 1 || flag === '1';
};

/**
 * Get standardized branding toggles for invoice templates
 */
export const getInvoiceBrandingToggles = (brandingData) => {
  return {
    showCustomerName: resolveBrandingToggle(brandingData?.inv_customer_name),
    showCustomerBusiness: resolveBrandingToggle(brandingData?.inv_customer_business_name),
    showCustomerAddress: resolveBrandingToggle(brandingData?.inv_customer_address),
    showCustomerAbn: resolveBrandingToggle(brandingData?.inv_customer_abn),
    // The client's phone is always shown; the footer phone_enabled toggle only controls the business's own footer phone.
    showCustomerPhone: true,
    showSoleUserName: resolveBrandingToggle(brandingData?.inv_sole_user_name),
    showSoleBusinessName: resolveBrandingToggle(brandingData?.inv_sole_business_name),
    showSoleBusinessAddress: resolveBrandingToggle(brandingData?.inv_sole_business_address),
    showSoleBusinessAbn: resolveBrandingToggle(brandingData?.inv_sole_business_abn),
    showItemsDescription: resolveBrandingToggle(brandingData?.inv_display_desc),
    showQtyType: resolveBrandingToggle(brandingData?.show_quantity_type),
    showGst: resolveBrandingToggle(brandingData?.show_gst),
    brandColor: brandingData?.brand_color || '#4d4dff',
    contentColor: brandingData?.content_color || '#000000',
    invoiceNote: brandingData?.invoice_note || '',
    quoteNote: brandingData?.quote_note || ''
  };
};

/**
 * Get standardized branding toggles for quote templates
 */
export const getQuoteBrandingToggles = (brandingData) => {
  return {
    showCustomerName: resolveBrandingToggle(brandingData?.quo_customer_name),
    showCustomerBusiness: resolveBrandingToggle(brandingData?.quo_customer_business_name),
    showCustomerAddress: resolveBrandingToggle(brandingData?.quo_customer_address),
    showCustomerAbn: resolveBrandingToggle(brandingData?.quo_customer_abn),
    // The client's phone is always shown; the footer phone_enabled toggle only controls the business's own footer phone.
    showCustomerPhone: true,
    showSoleUserName: resolveBrandingToggle(brandingData?.quo_sole_user_name),
    showSoleBusinessName: resolveBrandingToggle(brandingData?.quo_sole_business_name),
    showSoleBusinessAddress: resolveBrandingToggle(brandingData?.quo_sole_business_address),
    showSoleBusinessAbn: resolveBrandingToggle(brandingData?.quo_sole_business_abn),
    showItemsDescription: resolveBrandingToggle(brandingData?.inv_display_desc),
    brandColor: brandingData?.brand_color || '#4d4dff',
    contentColor: brandingData?.content_color || '#000000',
    invoiceNote: brandingData?.invoice_note || '',
    quoteNote: brandingData?.quote_note || '',
    showGst: resolveBrandingToggle(brandingData?.quo_show_gst),
    showQtyType: resolveBrandingToggle(brandingData?.quo_show_quantity_type)
  };
};

