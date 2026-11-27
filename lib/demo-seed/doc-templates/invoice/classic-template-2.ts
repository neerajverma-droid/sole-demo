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
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Invoice</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
      
      body {
        font-family: 'Inter', Arial, sans-serif;
        font-size: 12px;
        color: #333;
        background-color: #f5f5f5;
        margin: 0;
        padding: 20px;
        -webkit-print-color-adjust: exact;
      }
      
      .invoice-container {
        min-height: 297mm;
        background-color: white;
        padding: 32px;
        box-sizing: border-box;
        position: relative;
        display: flex;
        flex-direction: column;
      }

      /* Header Section */
      .header-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 20px;
      }

      .invoice-title {
        font-size: 32px;
        color: ${brandColor};
        font-weight: 400; /* Thin look as per image */
        text-transform: uppercase;
        letter-spacing: 1px;
        margin: 0;
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


       .logo-section img { 
      height: auto;
      width: auto;
      max-height: 80px;
      max-width: 120px;
      object-fit: contain;
      border-radius: 4px;
    }

      .logo-text {
        font-size: 18px;
        font-weight: bold;
        color: ${brandColor};
      }

      .header-line {
        width: 100%;
        height: 1px;
        background-color: ${brandColor};
        margin-bottom: 30px;
        opacity: 0.7;
      }

      /* Info Grid */
      .info-grid {
        display: flex;
        margin-bottom: 50px;
      }

      /* First Column: Invoice Meta */
      .info-meta {
        width: 25%;
        padding-right: 20px;
        border-right: 2px solid ${brandColor};
      }

      .meta-group {
        margin-bottom: 15px;
      }

      .label {
        display: block;
        color: #777;
        font-size: 13px;
        margin-bottom: 2px;
      }

      .value {
        display: block;
        color: #222;
        font-size: 15px;
        font-weight: 500;
      }

      /* Second Column: To */
      .info-client {
        width: 35%;
        padding-left: 30px;
      }

      /* Third Column: From */
      .info-company {
        width: 35%;
        padding-left: 10px;
      }

      .section-head {
        display: block;
        color: #222;
        font-weight: 600;
        margin-bottom: 10px;
        font-size: 14px;
      }

      .address-block {
        line-height: 1.5;
        color: #444;
      }

      .company-name {
        font-weight: 600;
        text-transform: uppercase;
        display: block;
        margin-bottom: 4px;
      }

      /* Table Section */
      .items-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 30px;
      }

      .items-table th {
        text-align: right;
        color: ${brandColor};
        font-weight: 400;
        padding: 10px 0;
        border-bottom: 1px solid #ddd;
        font-size: 15px;
      }
      
      .items-table th:first-child {
        text-align: left;
      }

      .items-table td {
        padding: 15px 0;
        border-bottom: 1px solid #eee;
        text-align: right;
        color: #333;
      }

      .items-table td:first-child {
        text-align: left;
      }

      /* Totals Section */
      .totals-wrapper {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 40px;
      }

      .totals-box {
        width: 300px;
      }

      .t-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 10px;
      }
      
      .t-row span:first-child {
        color: #555;
      }

      .t-row.total-final {
        background-color: ${brandColor};
        color: white;
        font-weight: bold;
        padding: 12px 10px;
        margin-top: 10px;
      }
      
      .t-row.total-final span:first-child {
        color: white;
      }

      .gst-note {
        text-align: right;
        font-style: italic;
        color: #888;
        font-size: 12px;
        margin-top: 5px;
        padding-right: 10px;
      }

      /* Divider before footer */
      .footer-divider {
        height: 1px;
        background-color: #eee;
        margin: 20px 0 30px 0;
      }

      /* Payment Footer */
      .payment-section {
        display: flex;
        justify-content: space-between;
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

      .payment-box {
        background-color: #e5e7eb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 10px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 24px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }

      .payment-label {
        color: #6b7280;
        font-size: 12px;
        font-weight: 400;
        display: inline-block;
        width: 120px;
        margin-right: 16px;
      }

      .payment-value {
        color: #111827;
        font-weight: 600;
        font-size: 12px;
        display: inline-block;
        word-break: break-all;
      }

      .payment-row-wrapper {
        display: block;
        margin-bottom: 8px;
        line-height: 1;
      }

      .payment-row-wrapper:last-child {
        margin-bottom: 0;
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

      /* Bottom Bar */
      .bottom-bar {
        width: 100%;
        height: 15px;
        background-color: ${brandColor};
        margin-top: auto;
      }

      .social-area {
        margin-top: auto;
        padding-bottom: 30px;
        text-align: center;
      }
      
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
        margin-bottom: 15px;
      }

      @media print {
        body { background: white; padding: 0; display: block !important; }
        .invoice-container { width: 100%; margin: 0; padding: 40px; box-shadow: none; min-height: auto !important; overflow: visible !important; }
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
      
      <div class="header-top">
         <div style="display:flex; flex-direction:column; align-items:flex-start;">
         
           <h1 class="invoice-title">
          ${showDepositHeading ? `<span style="display:inline-block;background:#4D4DFF;color:#fff;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;vertical-align:middle;margin-right:6px;">${depositHeadingLabel}</span>` : ''}${invoiceTitle(data)}
        </h1>
         </div>
        <div class="logo-section">
           ${generateFitrecLogoBlock(data)}
           
        </div>
      </div>
      
      <div class="header-line"></div>

      <div class="info-grid">
        <div class="info-meta">
          ${
            data.invoice_no
              ? `
          <div class="meta-group">
            <span class="label">Invoice Number</span>
            <span class="value">${data.invoice_no}</span>
          </div>
          `
              : ''
          }
          <div class="meta-group">
            <span class="label">Invoice Date</span>
            <span class="value">${formatDate(data.invoice_date)}</span>
          </div>
          <div class="meta-group">
            <span class="label">Due Date</span>
            <span class="value">${formatDate(data.due_date)}</span>
          </div>
        </div>

        ${
          shouldShowShipTo
            ? `
        <div class="info-client">
          <span class="section-head">To</span>
          <div class="address-block">
            ${showCustomerName && data.participant?.participant_name ? `<span class="company-name">${escapeHtml(data.participant.participant_name)}</span>` : ''}
            ${showCustomerBusiness && data.participant?.company_name ? `<div>${escapeHtml(data.participant.company_name)}</div>` : ''}
            ${showCustomerAddress && data.participant?.address ? `${escapeHtml(data.participant.address).replace(/\n/g, '<br/>') + '<br/>'}` : ''}
            ${data.participant?.email ? escapeHtml(data.participant.email) + '<br/>' : ''}
            ${data.participant?.phone_no ? escapeHtml(data.participant.phone_no) : ''}
            ${showCustomerAbn && data.participant?.abn ? `<br/>${customerIdLabel(data)}: ${escapeHtml(data.participant.abn)}` : ''}
          </div>
        </div>
        `
            : ''
        }

        ${
          showSoleUserName || showSoleBusinessName || showSoleBusinessAddress || showSoleBusinessAbn
            ? `
        <div class="info-company">
          <span class="section-head">From</span>
          <div class="address-block">
            ${showSoleBusinessName && data.provider?.provider_name ? `<span class="company-name">${escapeHtml(data.provider.provider_name)}</span>` : ''}
            ${showSoleUserName && data.provider?.user_name ? `<span class="detail-val">${escapeHtml(data.provider.user_name)}</span>` : ''}
            ${showSoleBusinessAddress && data.provider?.address ? escapeHtml(data.provider.address).replace(/\n/g, '<br/>') + '<br/>' : ''}
            ${data.provider?.email ? escapeHtml(data.provider.email) + '<br/>' : ''}
            ${data.provider?.phone_no ? escapeHtml(data.provider.phone_no) : ''}
            ${
              showSoleBusinessAbn
                ? providerIdentifiers(data)
                    .map((id) => `<br/>${id.label}: ${id.value}`)
                    .join('')
                : ''
            }
          </div>
        </div>
        `
            : ''
        }
      </div>

       ${
         data.description
           ? `
         <div style="margin: 0px 0 8px;">
          <div style="font-size: 13px; color: #111827; font-weight: 500; margin-bottom: 4px;">Invoice Description:</div>
          <div style="background: #fafafa; padding: 6px; border-radius: 6px; font-size: 12px; color: #333; white-space: pre-wrap;">${escapeHtml(data.description)}</div>
         </div>
        `
           : ''
       }

      ${showItemsDescription ? generateDynamicTableContent(data, branding) : ''}    

      <div class="totals-wrapper">
        <div class="totals-box">
          <div class="t-row">
            <span>Subtotal</span>
            <span>${formatCurrency(data.sub_total, data)}</span>
          </div>

          ${
            showContentOnValue(data.total_gst)
              ? `
              <div class="t-row">
                <span>${data?.country?.tax_label || 'GST'}</span>
                <span>${formatCurrency(data.total_gst, data)}</span>
              </div>
            `
              : ''
          }

          ${
            showContentOnValue(data.total_discount)
              ? `
              <div class="t-row">
                <span>Discount</span>
                <span>-${formatCurrency(data.total_discount, data)}</span>
              </div>
            `
              : ''
          }
          
          <div class="t-row total-final">
            <span>Total</span>
            <span>${formatCurrency(data.total, data)}</span>
          </div>
          ${
            isDepositInvoice && data?.deposit_status !== 'paid'
              ? `
              <div class="t-row">
                <span>Deposit requested</span>
                <span>${formatCurrency(data.deposit_amount || 0, data)}</span>
              </div>
              <div class="t-row" style="font-size:11px;color:#6b7280;">
                <span>Deposit due</span>
                <span>${formatDate(data.deposit_due_date)}</span>
              </div>
            `
              : ''
          }
          ${
            showDepositSummary
              ? `
              <div class="t-row">
                <span>Deposit paid</span>
                <span>${formatCurrency(depositPaidAmount, data)}</span>
              </div>
              <div class="t-row">
                <span>Remaining amount</span>
                <span>${formatCurrency(depositRemainingAmount, data)}</span>
              </div>
            `
              : ''
          }
        </div>
      </div>
${generateExchangeRateSection(data)}
      <div class="footer-divider"></div>
      <div style="text-align: right; margin-top: -25px; margin-bottom: 5px;">
         ${documentHasTax(data) ? `<span class="gst-note">${data?.country?.tax_included_note || 'Total includes GST'}</span>` : ''}
      </div>
<div class="footer-divider"></div>

      ${
        showPayment || hasPaid
          ? `
      <div class="payment-section">
        <div class="pay-left">
          <h4>Payment details</h4>
          ${!isReceipt ? `<p>Please make payment before <b>${formatDate(data?.due_date)}</b>.</p>` : `<p>Thank you for your payment!</p>`}
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
          ${
            data.payment?.account_name
              ? `
          <div class="bank-row">
            <span>Account Name</span>
            <span>${escapeHtml(data.payment.account_name)}</span>
          </div>
          `
              : ''
          }
          ${
            bankBranch(data)
              ? `
          <div class="bank-row">
            <span>${bankBranchLabel(data)} Number</span>
            <span>${escapeHtml(data.payment.bsb)}</span>
          </div>
          `
              : ''
          }
          ${
            data.payment?.account_number
              ? `
          <div class="bank-row">
            <span>Account Number</span>
            <span>${escapeHtml(data.payment.account_number)}</span>
          </div>
          `
              : ''
          }
        </div>
        `
            : ''
        }
      </div>
      `
          : ''
      }

      ${data.isPayrix || data.isStripe ? `<div style="text-align:start;margin-top:30px;"><a href="${payLink}" style="background-color:${brandColor};color:white;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold;">${data.isStripe ? 'Pay via Stripe' : 'Pay via WorldPay'}</a></div>` : ''}

     
      

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

      <div class="bottom-bar"></div>
    </div>
  </body>
</html>`;

  return template
    .replace(/\{BRAND_COLOR\}/g, brandColor)
    .replace(/\{CONTENT_COLOR\}/g, contentColor)
    .replace(/\{SOCIAL_MEDIA_LINKS\}/g, socialMediaLinks);
};

export default InvoiceTemplate;
