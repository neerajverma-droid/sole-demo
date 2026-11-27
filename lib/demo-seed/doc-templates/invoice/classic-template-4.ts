/* eslint-disable */
// @ts-nocheck
// Ported mechanically from sole-ocr (CommonJS -> ESM). Kept verbatim on purpose: fidelity with the real
// invoice/quote layouts matters more than style here.
import { getInvoiceBrandingToggles } from '../branding';
import {
  generateSocialMediaLinks,
  formatCurrency,
  formatDate,
  formatDiscount,
  generateDynamicTableContent,
  showContentOnValue,
  generateExchangeRateSection,
  generateFitrecLogoBlock,
  generateFitrecTitleBadge,
  escapeHtml,
  invoiceTitle,
  customerIdLabel,
  providerIdentifiers,
  bankBranchLabel,
  bankBranch,
  documentHasTax
} from '../helper';
const InvoiceTemplate = (invoiceData = null, brandingData = null, payLink = '', isReceipt = false, showPayment = true, showBanner = false, hasPaid = false) => {
  const data = invoiceData;

  // Get standardized branding toggles
  const branding = getInvoiceBrandingToggles(brandingData);
  const {
    showCustomerName,
    showCustomerBusiness,
    showCustomerAddress,
    showCustomerAbn,
    showCustomerPhone,
    showSoleUserName,
    showSoleBusinessName,
    showSoleBusinessAddress,
    showSoleBusinessAbn,
    showItemsDescription,
    brandColor,
    contentColor,
    invoiceNote
  } = branding;
  const shouldShowShipTo = showCustomerName || showCustomerBusiness || showCustomerAddress || showCustomerPhone;

  // Generate social media links if branding data exists
  const socialMediaLinks = generateSocialMediaLinks(brandingData);
  const hasSocialLinks = Boolean(socialMediaLinks);
  // The invoice's own notes (data.notes) print in the body; the Sales Settings note is only the editor's
  // pre-fill, so it is not repeated in the footer (it would print twice and change on old invoices).
  const effectiveInvoiceNote = '';
  const showFooter = showBanner || hasSocialLinks || Boolean(effectiveInvoiceNote);
  const isDepositInvoice = Boolean(data?.is_deposit_invoice);
  const depositPaidAmount = Number(data?.deposit_paid_amount || 0);
  const paymentStatusRaw = String(data?.has_paid ?? data?.mark_as ?? data?.status ?? '')
    .trim()
    .toLowerCase();
  const isFullyPaidInvoice = ['paid', 'completed', 'complete'].includes(paymentStatusRaw);
  const isMultiCurrencyInvoice = ['1', 1, true, 'true'].includes(data?.is_multicurrency) && data?.currency_code && data.currency_code !== (data?.base_currency || 'AUD');
  const toNumericAmount = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const invoiceRemainingAmount = toNumericAmount(data?.remaining_amount);
  const depositRemainingAmount = isFullyPaidInvoice
    ? 0
    : (() => {
        if (isMultiCurrencyInvoice) {
          return data?.deposit_balance_amount ?? data?.remaining_amount ?? data?.deposit_remaining_amount ?? 0;
        }
        return (invoiceRemainingAmount > 0 ? data?.remaining_amount : null) ?? data?.deposit_balance_amount ?? data?.deposit_remaining_amount ?? 0;
      })();
  const depositHeadingLabel = data?.deposit_status_label || 'Deposit requested';
  const showDepositHeading = isDepositInvoice && data?.deposit_status !== 'paid';
  const showDepositSummary = isDepositInvoice && !isFullyPaidInvoice && (depositPaidAmount > 0 || data?.deposit_status === 'paid');

  const template = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${invoiceTitle(data)}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

      body {
        font-family: 'Inter', Arial, sans-serif;
        font-size: 14px;
        color: #555; /* Slightly darker grey text based on image */
        background-color: #f4f4f4; /* Light grey background outside the paper */
        margin: 0;
        padding: 20px;
      }
      .invoice-container {
        // width: 210mm;
        min-height: 297mm;
        // margin: auto;
        background-color: white; /* Clean white paper background */
        padding: 40px;
        box-sizing: border-box;
        position: relative;
      }

      /* HEADER SECTION (New Layout) */
      .header-section {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 30px;
      }

      .header-left-logo img { 
      height: auto;
      width: auto;
      max-height: 80px;
      max-width: 120px;
      object-fit: contain;
      border-radius: 4px;
    }

      .header-left-logo .logo-text {
          font-size: 24px; font-weight: bold; color: ${brandColor};
      }

      .header-right-block {
        text-align: right;
        width: 50%;
      }


    .logo-icon {
      width: 40px;
      height: 40px;
      background: {BRAND_COLOR}; 
      border-radius: 50%;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
    }

      .invoice-title {
        font-size: 32px;
        font-weight: 500;
        color: ${brandColor};
        margin: 0 0 15px 0;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .title-underline {
        height: 3px;
        background-color: ${brandColor};
        width: 100%;
        margin-bottom: 15px;
      }

      .meta-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .meta-item {
        margin-bottom: 5px;
        font-size: 14px;
        color: #333;
      }
      .meta-label {
        color: ${brandColor}; /* Blue labels as seen in image */
        font-weight: 500;
        margin-right: 5px;
      }

      /* DASHER DIVIDER */
      .dashed-divider {
        border-top: 2px dashed #ccc;
        margin: 0 0 30px 0;
      }

      /* ADDRESS GRID (2 Columns now) */
      .address-grid {
        display: flex;
        margin-bottom: 50px;
      }
      .addr-col {
        width: 50%;
      }
      .section-label {
        display: block;
        font-size: 14px;
        font-weight: 600;
        color: #333;
        margin-bottom: 15px;
      }
      .address-block {
        line-height: 1.6;
        color: #555;
      }
      .primary-name {
        font-weight: 500;
        color: #333;
        display: block;
      }

      /* ITEMS TABLE */
      .items-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 30px;
      }
      .items-table th {
        text-align: left;
        background-color: #f0f2f5; /* Light grey header bg */
        color: #333;
        font-weight: 500;
        padding: 12px 15px;
        font-size: 14px;
      }
      .items-table th.text-right { text-align: right; }
      
      .items-table td {
        padding: 15px;
        border-bottom: 1px solid #eee;
        color: #333;
        font-size: 14px;
      }
      .items-table td.text-right { text-align: right; }

      /* TOTALS SECTION (Redesigned final row) */
      .totals-section {
        margin-left: auto;
        width: 350px;
        margin-top: 10px;
      }
      .total-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 15px;
        font-size: 14px;
        color: #555;
      }
      .total-row span:last-child {
          color: #333; font-weight: 500;
      }
      
      /* The specific look for the final total row */
      .total-row.final {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        padding: 0;
        margin-top: 15px;
        gap: 20px; /* Gap between label and blue box */
      }
      
      .total-row.final .total-label {
          font-size: 15px;
          font-weight: 600;
          color: #333;
      }

      /* The blue value box */
      .total-row.final .total-value-box {
        background-color: ${brandColor};
        color: white;
        padding: 10px 25px;
        font-size: 16px;
        font-weight: bold;
        min-width: 100px;
        text-align: right;
      }

      .gst-note {
        text-align: left; /* Left aligned now */
        font-style: italic;
        color: #888;
        font-size: 13px;
        margin-top: 30px;
        border-top: 1px solid #eee;
        padding-top: 15px;
      }

      /* FOOTER / PAYMENT */
      .payment-section {
        background-color: #e5e7eb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 10px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 24px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        margin-top: 30px;
      }
      
      .pay-left { 
        flex: 1;
        min-width: 0;
      }
      
      .pay-left h4 {
        margin: 0 0 8px 0;
        font-size: 14px;
        color: #111827;
        font-weight: 600;
        letter-spacing: -0.025em;
      }
      
      .pay-left p { 
        font-size: 13px;
        color: #6b7280;
        margin: 0;
        line-height: 1.4;
      }

      .pay-right { 
        flex: 1;
        min-width: 0;
        background-color: #f9fafb;
        border-radius: 6px;
        padding: 16px;
      }
      
      .bank-row {
        display: block;
        margin-bottom: 8px;
        line-height: 1;
      }
      
      .bank-row:last-child {
        margin-bottom: 0;
      }
      
      .bank-row span:first-child { 
        color: #6b7280;
        font-size: 12px;
        font-weight: 400;
        display: inline-block;
        width: 120px;
        margin-right: 16px;
      }
      
      .bank-row span:last-child { 
        color: #111827;
        font-weight: 600;
        font-size: 12px;
        display: inline-block;
        word-break: break-all;
      }

      .social-area {
        text-align: center;
        margin-top: 40px;
      }
      .social-link { display: inline-block; margin: 0 5px; }
      
      .paid-stamp-container {
        display: flex;
        justify-content: center;
        align-items: center;
        margin-top: 25px;
      }

      .paid-stamp {
        display: inline-block;
        padding: 10px 35px;
        font-size: 28px;
        font-weight: 800;
        color: #28a745;
        border: 4px solid #28a745;
        border-radius: 8px;
        text-transform: uppercase;
        letter-spacing: 4px;
        transform: rotate(-8deg);
        opacity: 0.9;
        background-color: rgba(40, 167, 69, 0.05);
        box-shadow: 0 0 3px rgba(0, 0, 0, 0.15);
      }
      
      .powered-by {
        color: #666;
        font-size: 14px;
        margin: 20px 0;
        text-align: center;
      }
      
      @media print {
          body { display: block !important; background-color: white; padding: 0; }
          .invoice-container { box-shadow: none; margin: 0; overflow: visible !important; min-height: auto !important; }
          tr, td, th { break-inside: avoid; page-break-inside: avoid; }
      }
          

  .notes-section {
      margin: 24px 0 8px;
    }
    .notes-content {
      background: #fafafa;
      padding: 12px;
      border-radius: 6px;
      font-size: 12px;
      color: #333;
      white-space: pre-wrap;
    }
    .address-text,
    .address-block,
    .addr-text {
      overflow-wrap: normal;
      word-break: normal;
      line-break: auto;
      hyphens: manual;
    
    }
  </style>
  </head>
  <body>
    <div class="invoice-container">
      
      <div class="header-section">
        <div class="header-left-logo">
           ${generateFitrecLogoBlock(data)}
             
        </div>
        <div class="header-right-block">
              <div style="display:flex; flex-direction:column; align-items:flex-start;">
   
                <h1 class="invoice-title">
                ${showDepositHeading ? `<span style="display:inline-block;background:#4D4DFF;color:#fff;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;vertical-align:middle;margin-right:6px;">${depositHeadingLabel}</span>` : ''}${invoiceTitle(data)}
              </h1>
              </div>
             <div class="title-underline"></div>
             <ul class="meta-list">
                 <li class="meta-item">
                    <span class="meta-label">Invoice Number:</span> ${data.invoice_no}
                 </li>
                 <li class="meta-item">
                    <span class="meta-label">Invoice Date:</span> ${formatDate(data.invoice_date)}
                 </li>
                 <li class="meta-item">
                    <span class="meta-label">Due Date:</span> ${formatDate(data.due_date)}
                 </li>
             </ul>
        </div>
      </div>
      
      <div class="dashed-divider"></div>

      <div class="address-grid">
        <div class="addr-col">
          <span class="section-label">To</span>
          <div class="address-block">
            ${showCustomerName && data.participant?.participant_name ? `<span class="primary-name">${escapeHtml(data.participant.participant_name)}</span>` : ''}
            ${showCustomerBusiness && data.participant?.company_name ? `<div>${escapeHtml(data.participant.company_name)}</div>` : ''}
            ${showCustomerAddress && data.participant?.address ? `${escapeHtml(data.participant.address).replace(/\n/g, '<br/>') + '<br/>'}` : ''}
            ${data.participant?.email ? escapeHtml(data.participant.email) + '<br/>' : ''}
            ${data.participant?.phone_no ? escapeHtml(data.participant.phone_no) + '<br/>' : ''}
            ${showCustomerAbn && data.participant?.abn ? `${customerIdLabel(data)}: ${escapeHtml(data.participant.abn)}` : ''}
          </div>
        </div>

        <div class="addr-col">
          <span class="section-label">From</span>
          <div class="address-block">
            ${showSoleBusinessName && data.provider?.provider_name ? `<span class="primary-name">${escapeHtml(data.provider.provider_name)}</span>` : ''}
            ${showSoleUserName && data.provider?.user_name ? `<span class="detail-val">${escapeHtml(data.provider.user_name)}</span>` : ''}
            ${showSoleBusinessAddress && data.provider?.address ? `${escapeHtml(data.provider.address).replace(/\n/g, '<br/>') + '<br/>'}` : ''}
            ${data.provider?.email ? escapeHtml(data.provider.email) + '<br/>' : ''}
            ${data.provider?.phone_no ? escapeHtml(data.provider.phone_no) + '<br/>' : ''}
            ${
              showSoleBusinessAbn
                ? providerIdentifiers(data)
                    .map((id) => `${id.label}: ${id.value}`)
                    .join('<br/>')
                : ''
            }
           </div>
        </div>
      </div>

       ${
         data.description
           ? `
         <div style="margin: 0px 0 8px;">
          <div style="font-size: 13px; color: #111827; font-weight: 500; margin-bottom: 4px;">Invoice Description:</div>
          <div style="background: #fafafa; padding: 12px; border-radius: 6px; font-size: 12px; color: #333; white-space: pre-wrap; margin-bottom:10px;">${escapeHtml(data.description)}</div>
         </div>
        `
           : ''
       }

        ${showItemsDescription ? generateDynamicTableContent(data, branding) : ''}  

      <div class="totals-section">
        <div class="total-row">
          <span>Subtotal</span>
          <span>${formatCurrency(data.sub_total, data)}</span>
        </div>

        ${
          showContentOnValue(data.total_gst)
            ? `
                <div class="total-row">
                  <span>${data?.country?.tax_label || 'GST'}</span>
                  <span>${formatCurrency(data.total_gst, data)}</span>
                </div>
            `
            : ''
        }

        ${
          showContentOnValue(data.total_discount)
            ? `
                <div class="total-row">
                  <span>Discount</span>
                  <span>-${formatCurrency(data.total_discount, data)}</span>
                </div>
            `
            : ''
        }
        
        <div class="total-row final">
          <span class="total-label">Total</span>
          <span class="total-value-box">${formatCurrency(data.total, data)}</span>
        </div>
        ${
          isDepositInvoice && data?.deposit_status !== 'paid'
            ? `
                <div class="total-row">
                  <span>Deposit requested</span>
                  <span>${formatCurrency(data.deposit_amount || 0, data)}</span>
                </div>
                <div class="total-row" style="font-size:12px;color:#6b7280;">
                  <span>Deposit due</span>
                  <span>${formatDate(data.deposit_due_date)}</span>
                </div>
            `
            : ''
        }
        ${
          showDepositSummary
            ? `
                <div class="total-row">
                  <span>Deposit paid</span>
                  <span>${formatCurrency(depositPaidAmount, data)}</span>
                </div>
                <div class="total-row">
                  <span>Remaining amount</span>
                  <span>${formatCurrency(depositRemainingAmount, data)}</span>
                </div>
            `
            : ''
        }
      </div>
${generateExchangeRateSection(data)}
      ${documentHasTax(data) ? `<div class="gst-note">${data?.country?.tax_included_note || 'Total includes GST'}</div>` : ''}

      ${
        showPayment || hasPaid
          ? `
      <div class="payment-section">
        <div class="pay-left">
          <h4>Payment details</h4>
          ${!isReceipt ? `<p>${escapeHtml(data.payment?.payment_terms) || 'Please make payment before <b>' + `${formatDate(data?.due_date)}`}</b></p>` : `<p>Thank you for your payment!</p>`}
          ${
            isReceipt
              ? `
          <div class="paid-stamp-container">
            <div class="paid-stamp">PAID</div>
          </div>
          `
              : ''
          }
        </div>
        ${
          !isReceipt
            ? `
        <div class="pay-right">
          ${data.payment?.account_name ? `<div class="bank-row"><span>Account Name</span><span>${escapeHtml(data.payment.account_name)}</span></div>` : ''}
          ${bankBranch(data) ? `<div class="bank-row"><span>${bankBranchLabel(data)} Number</span><span>${escapeHtml(data.payment.bsb)}</span></div>` : ''}
          ${data.payment?.account_number ? `<div class="bank-row"><span>Account Number</span><span>${escapeHtml(data.payment.account_number)}</span></div>` : ''}
        </div>
        `
            : ''
        }
      </div>
      `
          : ''
      }

      ${data.isPayrix || data.isStripe ? `<div style="text-align:start;margin-top:30px;"><a href="${payLink}" style="background-color:${brandColor};color:white;padding:12px 25px;text-decoration:none;border-radius:4px;font-weight:bold;display:inline-block;">${data.isStripe ? 'Pay via Stripe' : 'Pay via WorldPay'}</a></div>` : ''}
      
      
      
      ${
        data.notes
          ? `
      <div class="notes-section">
        <div class="section-title">Invoice Notes</div>
        <div class="notes-content">${escapeHtml(data.notes)}</div>
      </div>
      `
          : ''
      }

         
    <div class="doc-footer" style="${showFooter ? 'display: block;' : 'display: none;'} width: 100%; padding: 0 0 8px 0; box-sizing: border-box; margin-top: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; background-color: #fafafa; padding: 16px; border-radius: 8px;">
         ${effectiveInvoiceNote ? `<div style="font-size: 10px; font-weight: 600; color: #6b7280;">${escapeHtml(effectiveInvoiceNote)}</div>` : ''}
         ${hasSocialLinks ? `<div style="display: flex; gap: 15px; margin-left: auto;">{SOCIAL_MEDIA_LINKS}</div>` : ''}
      </div>
    </div>

    </div>
  </body>
  </html>
  `;

  return template
    .replace(/\{BRAND_COLOR\}/g, brandColor)
    .replace(/\{CONTENT_COLOR\}/g, contentColor)
    .replace(/\{SOCIAL_MEDIA_LINKS\}/g, socialMediaLinks);
};

export default InvoiceTemplate;
