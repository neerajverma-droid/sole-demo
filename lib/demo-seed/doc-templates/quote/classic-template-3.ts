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
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
      
      body {
        font-family: 'Inter', Arial, sans-serif;
        font-size: 14px;
        color: #333;
        line-height: 1.4;
        margin: 0;
        padding: 0;
        background-color: #f4f4f4;
      }
      
      .invoice-container {
        // width: 210mm;
        min-height: 297mm;
        // margin: 20px auto;
        padding: 40px;
        background-color: white;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        box-sizing: border-box;
        position: relative;
        display: flex;
        flex-direction: column;
      }

      /* Header Section */
      .header-title-row {
        margin-bottom: 20px;
      }
      
      .invoice-title {
        font-size: 26px;
        font-weight: 400;
        color: ${brandColor};
        margin: 0;
        text-transform: uppercase;
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

      .address-grid {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 40px;
      }

      .addr-col {
        flex: 1;
      }
      
      .addr-col.center {
        text-align: center;
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .addr-col.right {
        text-align: right;
      }

      .addr-label {
        font-size: 14px;
        color: #111;
        margin-bottom: 5px;
        display: block;
      }

      .addr-text {
        font-size: 14px;
        color: #555;
        line-height: 1.5;
      }
      
      .company-name {
        text-transform: uppercase;
        color: #333;
        margin-bottom: 4px;
        display: block;
      }

      .logo-section img { 
      height: auto;
      width: auto;
      max-height: 80px;
      max-width: 120px;
      object-fit: contain;
      border-radius: 4px;
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


      /* Meta Row (Inv No, Dates) */
      .meta-container {
        border-top: 1px solid #e0e0e0;
        border-bottom: 1px solid #e0e0e0;
        padding: 20px 0;
        margin-bottom: 30px;
        display: flex;
        gap: 40px;
      }

      .meta-group {
        display: flex;
        flex-direction: column;
      }

      .meta-label {
        color: #777;
        font-size: 13px;
        margin-bottom: 5px;
      }

      .meta-value {
        font-size: 18px;
        color: #333;
        font-weight: 400;
      }

      /* Table */
      .items-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
      }

      .items-table th {
        background-color: ${brandColor};
        color: white;
        text-align: left;
        padding: 12px 15px;
        font-weight: 500;
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

      /* Totals */
      .totals-section {
        width: 300px;
        margin-left: auto;
        padding-right: 15px; /* Alignment fix */
      }

      .total-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        font-size: 14px;
        color: #333;
      }

      .total-row.final {
        border-top: 1px solid ${brandColor};
        margin-top: 10px;
        padding-top: 15px;
        color: ${brandColor};
      }
      
      .total-row.final span {
        font-size: 15px;
        font-weight: 500;
      }

      .total-row.meta {
        font-size: 12px;
        color: #6b7280;
      }

      .gst-note {
        border-top: 1px solid #e0e0e0;
        margin-top: 20px;
        padding-top: 15px;
        font-style: italic;
        color: #777;
        font-size: 13px;
      }

      /* Footer Payment */
      .footer-section {
        background-color: #e5e7eb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 10px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 24px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        margin-top: 40px;
        margin-bottom: 50px;
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

      .bottom-bar {
        height: 15px; /* As per previous design request, keeping consistent footer */
        background-color: white; /* Image shows clean white bottom, but I'll add padding */
      }
      
      .social-links {
        text-align: center;
        margin-top: auto;
      }
      
      .social-link {
        display: inline-block;
        margin: 0 5px;
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
        text-align: center;
      }
.company-logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .company-logo img {
          height: 40px;
          width: auto;
          max-width: 120px;
          object-fit: contain;
          border-radius: 4px;
        }
      @media print {
        body { background-color: white; }
        .invoice-container { margin: 0; box-shadow: none; width: 100%; }
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
      
      <div class="header-title-row">
        <div style="display:flex; flex-direction:column; align-items:flex-start;">

          <h1 class="invoice-title">
                ${isDepositQuote ? '<span class="deposit-title-badge">Deposit requested</span>' : ''}${quoteTitle(data)}
            </h1>
        </div>
      </div>

      <div class="address-grid">
        <div class="addr-col">
          <span class="addr-label">To</span>
          <div class="addr-text">
            ${showCustomerName && data.participant?.participant_name ? `<span class="company-name">${data.participant.participant_name}</span>` : ''}
            ${showCustomerBusiness && data.participant?.company_name ? `<div>${data.participant.company_name}</div>` : ''}
            ${showCustomerAddress && data.participant?.address ? `${data.participant.address.replace(/\n/g, '<br/>') + '<br/>'}` : ''}
            ${data.participant?.email ? data.participant.email : ''}
            ${showCustomerPhone && data.participant?.phone_no ? `<br/>${data.participant.phone_no}` : ''}
            ${showCustomerAbn && data.participant?.abn ? `<br/>${customerIdLabel(data)}: ${data.participant.abn}` : ''}
          </div>
        </div>

        <div class="addr-col company-logo center">
          ${generateFitrecLogoBlock(data)}
        </div>

        ${
          showSoleUserName || showSoleBusinessName || showSoleBusinessAddress || showSoleBusinessAbn
            ? `
        <div class="addr-col right">
          <span class="addr-label">From</span>
          <div class="addr-text">
            ${showSoleBusinessName && data.provider?.provider_name ? `<span class="company-name">${data.provider.provider_name}</span>` : ''}
            ${showSoleUserName && data.provider?.user_name ? `<span class="detail-val">${data.provider.user_name}</span>` : ''}
            ${showSoleBusinessAddress ? (data.provider?.address ? `${data.provider.address.replace(/\n/g, '<br/>') + '<br/>'}` : '') : ''}
            ${data.provider?.email ? data.provider.email + '<br/>' : ''}
            ${data.provider?.phone_no ? data.provider.phone_no + '<br/>' : ''}
            ${
              showSoleBusinessAbn
                ? providerIdentifiers(data)
                    .map((id) => `${id.label}: ${id.value}`)
                    .join('<br/>')
                : ''
            }
           </div>
        </div>
        `
            : ''
        }
      </div>

      <div class="meta-container">
        <div class="meta-group">
          <span class="meta-label">Quote Number</span>
          <span class="meta-value">${data.quote_no}</span>
        </div>
        <div class="meta-group">
          <span class="meta-label">Quote Date</span>
          <span class="meta-value">${formatDate(data.quote_date)}</span>
        </div>
        <div class="meta-group">
          <span class="meta-label">Due Date</span>
          <span class="meta-value">${formatDate(data?.valid_till || data?.due_date) || '--'}</span>
        </div>
      </div>

      ${
        data.description
          ? `
         <div style="margin: 0px 0 8px;">
          <div style="font-size: 13px; color: #111827; font-weight: 500; margin-bottom: 4px;">Quote Description:</div>
          <div style="background: #fafafa; padding: 12px; border-radius: 6px; font-size: 12px; color: #333; white-space: pre-wrap; margin-bottom:5px; ">${data.description}</div>
         </div>
        `
          : ''
      }

      ${showItemsDescription ? generateDynamicQuoteTableContent(data, branding) : ''}      

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
          <span>Total</span>
          <span>${formatCurrency(data.total, data)}</span>
        </div>
        ${
          isDepositQuote
            ? `
                <div class="total-row">
                  <span>Deposit amount</span>
                  <span>${formatCurrency(data.deposit_amount || 0, data)}</span>
                </div>
                ${
                  data.deposit_due_date
                    ? `
                <div class="total-row meta">
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
${generateExchangeRateSection(data)}
    ${documentHasTax(data) ? `<div class="gst-note">${data?.country?.tax_included_note || 'Total includes GST'}</div>` : ''}

    
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
      
    </div>
  </body>
  </html>`;
  return template
    .replace(/\{BRAND_COLOR\}/g, brandColor)
    .replace(/\{CONTENT_COLOR\}/g, contentColor)
    .replace(/\{SOCIAL_MEDIA_LINKS\}/g, socialMediaLinks);
};

export default InvoiceTemplate;
