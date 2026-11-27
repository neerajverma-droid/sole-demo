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
<title>Invoice</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

  body {
    font-family: 'Inter', Helvetica, Arial, sans-serif;
    font-size: 12px;
    color: #374151;
    line-height: 1.4;
    margin: 0;
    padding: 0;
    background-color: #e5e7eb;
  }

  .blue-line {
    height: 8px;
    background-color: ${brandColor};
    width: 100%;
    margin: 0;
  }

  .invoice-container {
    // width: 210mm;
    // margin: 30px auto;
    min-height: 297mm;
    padding: 28px;
    background-color: white;
    box-sizing: border-box;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    position: relative;
    overflow: hidden;
  }

  @media print {
    body {
      display: block !important;
      padding: 0 !important;
    }
    .invoice-container {
      overflow: visible !important;
      min-height: auto !important;
    }
    .below-section {
      min-height: auto !important;
    }
    tr, td, th {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }

  .invoice-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
  }

  .invoice-title {
    font-size: 28px;
    font-weight: 400;
    color: #111827;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

   .company-logo img { 
      height: auto;
      width: auto;
      max-height: 80px;
      max-width: 120px;
      object-fit: contain;
      border-radius: 4px;
    }

  .logo-icon {
    background: ${brandColor};
    color: white;
    font-weight: bold;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    height: 45px;
    width: 45px;
    font-size: 18px;
  }

  .info-grid {
    display: grid;
    grid-template-columns: 1.5fr 1.5fr 1fr;
    gap: 20px;
    margin-bottom: 32px;
  }

  .label {
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 4px;
    font-weight: 500;
    text-transform: uppercase;
  }

  .info-content {
    color: #374151;
    font-size: 12px;
    line-height: 1.4;
  }
  
  .info-content strong {
      display: block;
      color: #111827;
      font-weight: 600;
      margin-bottom: 2px;
  }

  .date-col {
    text-align: right;
  }
  
  .date-row {
    margin-bottom: 12px;
  }
  
  .date-label {
    display: block;
    color: #111827;
    font-weight: 500;
    margin-bottom: 2px;
  }
  
  .date-value {
    color: #6b7280;
  }

  .below-section {
      background-color: #f3f4f6;
      margin-left: -25px; 
      margin-right: -25px;
      margin-bottom: -25px;
      padding: 20px 25px 25px 25px; 
      min-height: 280px;
  }
  @media print {
    /* PDF: the -25px bleed put this grey panel 3px from the paper edge; align it with the page content instead */
    .below-section { margin-left: 0; margin-right: 0; }
  }

  .invoice-bar {
    margin-bottom: 2px;
    font-size: 12px;
    color: #111827;
    border-radius: 6px;
  }

  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 30px;
    table-layout: fixed;
  }

  .items-table th {
    text-align: left;
    padding: 8px 0;
    border-bottom: 1px solid #d1d5db;
    color: #4b5563;
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
  }

  .items-table td {
    padding: 12px 0;
    border-bottom: 1px solid #e5e7eb;
    color: #1f2937;
    vertical-align: top;
    font-size: 12px;
  }

  .text-right {
    text-align: right;
  }
  
  .text-center {
    text-align: center;
  }

  .totals-section {
    width: 280px;
    margin-left: auto;
    margin-bottom: 20px;
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 12px;
    color: #4b5563;
  }

  .total-row.final {
    font-weight: 600;
    font-size: 13px;
    color: #111827;
    border-top: 1px solid #d1d5db;
    margin-top: 8px;
    padding-top: 8px;
  }

  .gst-divider {
    border-top: 1px solid #9ca3af;
    margin-bottom: 10px;
  }
  .gst-note {
    font-style: italic;
    color: #4b5563;
    margin: 0 0 15px 0;
    font-size: 11px;
  }

  .payment-box {
    background-color: #e5e7eb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 8px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 18px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .payment-left {
    flex: 1;
    min-width: 0;
  }

  .payment-left h4 {
    margin: 0 0 6px 0;
    font-size: 12px;
    color: #111827;
    font-weight: 600;
    letter-spacing: -0.025em;
  }

  .payment-left p {
    font-size: 11px;
    color: #6b7280;
    margin: 0;
    line-height: 1.3;
  }

  .payment-right {
    flex: 1;
    min-width: 0;
    background-color: #f9fafb;
    border-radius: 4px;
    padding: 12px;
  }

  .payment-label {
    color: #6b7280;
    font-size: 10px;
    font-weight: 400;
    display: inline-block;
    width: 100px;
    margin-right: 12px;
  }

  .payment-value {
    color: #111827;
    font-weight: 600;
    font-size: 10px;
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

  .btn {
    display: inline-block;
    padding: 8px 16px;
    background: ${brandColor};
    color: #fff;
    border-radius: 4px;
    text-decoration: none;
    font-size: 11px;
    font-weight: 500;
    margin-top: 10px;
    text-align: center;
  }

  .payment-actions {
    margin-top: 10px;
    display: flex;
    justify-content: flex-start;
  }

  .payment-actions .btn {
    margin-top: 0;
  }
  
  .social-links {
    margin-top: 20px;
    font-size: 11px;
  }
  
  .social-links a {
    color: ${brandColor};
    text-decoration: none;
    margin-right: 12px;
    font-weight: 500;
  }
  
  .paid-stamp-container {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-top: 18px;
  }

  .paid-stamp {
    display: inline-block;
    padding: 8px 28px;
    font-size: 22px;
    font-weight: 800;
    color: #28a745;
    border: 3px solid #28a745;
    border-radius: 6px;
    text-transform: uppercase;
    letter-spacing: 3px;
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
  
  .social-links.right-align {
    margin-left: auto;
    text-align: right;
  }

  .notes-section {
    margin: 18px 0 8px;
  }
  .notes-content {
      background: #fafafa;
      padding: 6px;
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
  <div class="blue-line"></div>
  <div class="invoice-container">
  
    <div class="invoice-header">
       <div style="display:flex; flex-direction:column; align-items:flex-start;">

         <h1 class="invoice-title">
        ${showDepositHeading ? `<span style="display:inline-block;background:#4D4DFF;color:#fff;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;vertical-align:middle;margin-right:6px;">${depositHeadingLabel}</span>` : ''}${invoiceTitle(data)}
      </h1>
       </div>
      <div class="company-logo">
        ${generateFitrecLogoBlock(data)}
      </div>
    </div>

    <div class="info-grid">
      <div>
        <div class="label">To</div>
        <div class="info-content">
          ${showCustomerName && data.participant?.participant_name ? `<strong>${escapeHtml(data.participant.participant_name)}</strong>` : ''}
          ${showCustomerBusiness && data.participant?.company_name ? `<div>${escapeHtml(data.participant.company_name)}</div>` : ''}
          ${showCustomerAddress && data.participant?.address ? `<div class="address-text">${escapeHtml(data.participant.address)}</div>` : ''}
          ${data.participant?.email ? `<div>${escapeHtml(data.participant.email)}</div>` : ''}
          ${showCustomerPhone && data.participant?.phone_no ? `<div>${escapeHtml(data.participant.phone_no)}</div>` : ''}
          ${showCustomerAbn && data.participant?.abn ? `<div>${customerIdLabel(data)}: ${escapeHtml(data.participant.abn)}</div>` : ''}
        </div>
      </div>

      <div>
        <div class="label">From</div>
        <div class="info-content">
          ${showSoleBusinessName && data.provider?.provider_name ? `<strong>${escapeHtml(data.provider.provider_name)}</strong>` : ''}
          ${showSoleUserName && data.provider?.user_name ? `<span class="detail-val">${escapeHtml(data.provider.user_name)}</span>` : ''}
          ${showSoleBusinessAddress && data.provider?.address ? `<div class="address-text">${escapeHtml(data.provider.address)}</div>` : ''}
          ${data.provider?.email ? `<div>${escapeHtml(data.provider.email)}</div>` : ''}
          ${data.provider?.phone_no ? `<div>${escapeHtml(data.provider.phone_no)}</div>` : ''}
          ${
            showSoleBusinessAbn
              ? providerIdentifiers(data)
                  .map((id) => `<div>${id.label}: ${id.value}</div>`)
                  .join('')
              : ''
          }
        </div>
      </div>

      <div class="date-col">
        ${
          data?.invoice_date
            ? `
        <div class="date-row">
            <span class="date-label">Invoice Date</span>
            <span class="date-value">${formatDate(data.invoice_date)}</span>
        </div>
        `
            : ''
        }
        ${
          data?.due_date
            ? `
        <div class="date-row">
            <span class="date-label">Due Date</span>
            <span class="date-value">${formatDate(data.due_date)}</span>
        </div>
        `
            : ''
        }
      </div>
    </div>

    <div class="below-section">
        ${
          data.invoice_no
            ? `
        <div class="invoice-bar">
            <strong>Invoice Number:</strong> ${data.invoice_no}
        </div>
        `
            : ''
        }

        ${
          data.description
            ? `
         <div style="margin: 0px 0 8px;">
          <div style="font-size: 13px; color: #111827; font-weight: 500; margin-bottom: 4px;"><strong>
          Invoice Description:</strong></div>
          <div style="background: #fafafa; padding: 12px;margin-top:5px; border-radius: 6px; font-size: 12px; color: #333; white-space: pre-wrap;">${escapeHtml(data.description)}</div>
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
            showContentOnValue(data.total_discount)
              ? `
              <div class="total-row">
                <span>Discount</span>
                <span>${formatCurrency(data.total_discount || 0, data)}</span>
              </div>
            `
              : ''
          }

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

          <div class="total-row final">
            <span>Total</span>
            <span>${formatCurrency(data.total, data)}</span>
          </div>
          ${
            isDepositInvoice && data?.deposit_status !== 'paid'
              ? `
              <div class="total-row">
                <span>Deposit requested</span>
                <span>${formatCurrency(data.deposit_amount || 0, data)}</span>
              </div>
              <div class="total-row" style="font-size:11px;color:#6b7280;">
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
        <div class="gst-divider"></div>
       ${documentHasTax(data) ? `<p class="gst-note">${data?.country?.tax_included_note || 'Total includes GST'}</p>` : ''}

        ${
          showPayment || hasPaid
            ? `
        <div class="payment-box">
          <div class="payment-left">
            <h4>Payment details</h4>
             ${!isReceipt ? `<p>Please make payment before <b>${formatDate(data?.due_date)}</b></p>` : `<p>Thank you for your payment!</p>`}
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
          <div class="payment-right">
            ${
              data.payment?.account_name
                ? `
            <div class="payment-row-wrapper">
                <div class="payment-label">Account Name</div>
                <div class="payment-value">${escapeHtml(data.payment.account_name)}</div>
            </div>
            `
                : ''
            }
            ${
              bankBranch(data)
                ? `
            <div class="payment-row-wrapper">
                <div class="payment-label">${bankBranchLabel(data)} Number</div>
                <div class="payment-value">${escapeHtml(data.payment.bsb)}</div>
            </div>
            `
                : ''
            }
            ${
              data.payment?.account_number
                ? `
            <div class="payment-row-wrapper">
                <div class="payment-label">Account Number</div>
                <div class="payment-value">${escapeHtml(data.payment.account_number)}</div>
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

        ${data.isPayrix || data.ispayrix || data.isStripe ? `<div class="payment-actions"><a href="${payLink}" class="btn" target="_blank">${data.isStripe ? 'Pay via Stripe' : 'Pay via WorldPay'}</a></div>` : ''}

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

    
    <div class="doc-footer" style="${showFooter ? 'display: block;' : 'display: none;'} width: 100%;  box-sizing: border-box; margin-top: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; background-color: #fafafa; padding: 10px; border-radius: 8px;">
         ${effectiveInvoiceNote ? `<div style="font-size: 10px; font-weight: 600; color: #6b7280;">${escapeHtml(effectiveInvoiceNote)}</div>` : ''}
         ${hasSocialLinks ? `<div style="display: flex; gap: 15px; margin-left: auto;">{SOCIAL_MEDIA_LINKS}</div>` : ''}
      </div>
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
