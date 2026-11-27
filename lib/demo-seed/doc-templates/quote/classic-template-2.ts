/* eslint-disable */
// @ts-nocheck
// Ported mechanically from sole-ocr (CommonJS -> ESM). Kept verbatim on purpose: fidelity with the real
// invoice/quote layouts matters more than style here.
import { getQuoteBrandingToggles } from '../branding';
import {
  generateSocialMediaLinks,
  formatCurrency,
  formatDate,
  formatDiscount,
  generateDynamicQuoteTableContent,
  showContentOnValue,
  generateExchangeRateSection,
  generateFitrecLogoBlock,
  generateFitrecTitleBadge,
  quoteTitle,
  customerIdLabel,
  providerIdentifiers,
  documentHasTax
} from '../helper';
const InvoiceTemplate = (invoiceData = null, brandingData = null, payLink = '', isReceipt = false, showPayment = true, showBanner = false, hasPaid = false) => {
  const data = invoiceData;

  // Get standardized branding toggles
  const branding = getQuoteBrandingToggles(brandingData);
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
  const isDepositQuote = Boolean(data?.is_deposit) || data?.payment_structure === 'deposit_balance';

  // Generate social media links if branding data exists
  const socialMediaLinks = generateSocialMediaLinks(brandingData);
  const hasSocialLinks = Boolean(socialMediaLinks);
  const showFooter = showBanner || hasSocialLinks;

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

      .deposit-title-badge {
        display: inline-block;
        background: #4D4DFF;
        color: #fff;
        border-radius: 999px;
        padding: 4px 9px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        vertical-align: middle;
        margin-right: 6px;
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

      .t-row.meta {
        font-size: 11px;
        color: #6b7280;
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
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 15px;
        background-color: ${brandColor};
      }
      @media print {
        /* PDF: the wrapper no longer has a fixed 297mm height or bottom padding, so pin-to-bottom
           would draw this bar over the last line; let it follow the content instead */
        .bottom-bar { position: static; margin-top: 4px; break-before: avoid; page-break-before: avoid; }
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
        body { background: white; padding: 0; }
        .invoice-container { width: 100%; margin: 0; padding: 40px; box-shadow: none; }
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
                ${isDepositQuote ? '<span class="deposit-title-badge">Deposit requested</span>' : ''}${quoteTitle(data)}
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
            <span class="label">Quote Number</span>
            <span class="value">${data.quote_no}</span>
          </div>
          `
              : ''
          }
          <div class="meta-group">
            <span class="label">Quote Date</span>
            <span class="value">${formatDate(data.quote_date)}</span>
          </div>
          <div class="meta-group">
            <span class="label">Due Date</span>
            <span class="value">${formatDate(data?.valid_till || data?.due_date) || '--'}</span>
          </div>
        </div>

        <div class="info-client">
          <span class="section-head">To</span>
          <div class="address-block">
            ${showCustomerName && data.participant?.participant_name ? `<span class="company-name">${data.participant.participant_name}</span>` : ''}
            ${showCustomerBusiness && data.participant?.company_name ? `<div>${data.participant.company_name}</div>` : ''}
            ${showCustomerAddress && data.participant?.address ? `${data.participant.address.replace(/\n/g, '<br/>') + '<br/>'}` : ''}
            ${data.participant?.email ? data.participant.email + '<br/>' : ''}
            ${data.participant?.phone_no ? data.participant.phone_no : ''}
            ${showCustomerAbn && data.participant?.abn ? `<br/>${customerIdLabel(data)}: ${data.participant.abn}` : ''}
          </div>
        </div>

        <div class="info-company">
          <span class="section-head">From</span>
          <div class="address-block">
            ${showSoleBusinessName && data.provider?.provider_name ? `<span class="company-name">${data.provider.provider_name}</span>` : ''}
            ${showSoleUserName && data.provider?.user_name ? `<span class="detail-val">${data.provider.user_name}</span>` : ''}
            ${showSoleBusinessAddress ? (data.provider?.address ? data.provider.address.replace(/\n/g, '<br/>') + '<br/>' : '') : ''}
            ${data.provider?.email ? data.provider.email + '<br/>' : ''}
            ${data.provider?.phone_no ? data.provider.phone_no : ''}
            ${
              showSoleBusinessAbn
                ? providerIdentifiers(data)
                    .map((id) => `<br/>${id.label}: ${id.value}`)
                    .join('')
                : ''
            }
          </div>
        </div>
      </div>

       ${
         data.description
           ? `
         <div style="margin: 0px 0 8px;">
          <div style="font-size: 13px; color: #111827; font-weight: 500; margin-bottom: 4px;">Quote Description:</div>
          <div style="background: #fafafa; padding: 6px; border-radius: 6px; font-size: 12px; color: #333; white-space: pre-wrap;">${data.description}</div>
         </div>
        `
           : ''
       }

      ${showItemsDescription ? generateDynamicQuoteTableContent(data, branding) : ''}    

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
            isDepositQuote
              ? `
              <div class="t-row">
                <span>Deposit amount</span>
                <span>${formatCurrency(data.deposit_amount || 0, data)}</span>
              </div>
              ${
                data.deposit_due_date
                  ? `
              <div class="t-row meta">
                <span>Deposit due</span>
                <span>${formatDate(data.deposit_due_date)}</span>
              </div>
              `
                  : ''
              }
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
      data.notes
        ? `
    <div class="notes-section">
      <div class="section-title">Quote Notes</div>
      <div class="notes-content">${data.notes}</div>
    </div>
    `
        : ''
    }

    
    <div class="doc-footer doc-footer-flow" style="${showFooter ? 'display: block;' : 'display: none;'} position: relative; width: 100%; padding: 10px; box-sizing: border-box;">
      <div style="display: flex; justify-content: space-between; align-items: center; background-color: #fafafa; padding: 16px; border-radius: 8px;">
         
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
