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
  generateExchangeRateSection,
  generatePaidStamp,
  generateFitrecLogoBlock,
  generateFitrecTitleBadge,
  escapeHtml,
  invoiceTitle,
  customerIdLabel,
  providerIdentifiers,
  bankBranchLabel,
  bankBranch,
  formatQtyType
} from '../helper';
import { documentHasTax, taxLabel, lineHasGst } from '../helper';
const NdisFourTemplate = (invoiceData = null, brandingData = null, payLink = '', isReceipt = false, showPayment = true, showBanner = true, hasPaid = false) => {
  const data = invoiceData;

  // Deposit invoices — same rules as the general invoice templates (invoice-1..6, classic-1..4)
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
  const hasPlanManager = Boolean(data?.plan_manager?.plan_manager_name || data?.plan_manager?.plan_manager_ndis);
  // Same rule as the general layouts: a per-line GST column only when Sales Settings "Show GST" is on and a line carries GST.
  const showLineGst = branding.showGst === true && (data.invoice_item || []).some(lineHasGst);

  const paymentDetails = [
    'This invoice is for one NDIS participant only.',
    ...(documentHasTax(data) ? [] : ['No GST applies to these services under current NDIS rules.']),
    'Plan managers must include the ABN of the third-party provider if applicable.'
  ];

  return `
    <div class="invoice-container">
      <style>
        /* keep same CSS you had in your React component */
        body { font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.4; margin: 0; padding: 0; }
        .invoice-container { width: 100%; min-height: 297mm; background: white; box-sizing: border-box; position: relative; padding-bottom: 90px; }
        .invoice-header { background: ${brandColor}; padding: 14px; margin-bottom:20px; }
        .social-links.right-align { margin-left: auto;}
        .invoice-header-main { display: grid; grid-template-columns: 0.7fr 1.3fr; background: white; border-radius: 8px; padding: 10px 14px; }
        .invoice-title { font-size: 30px; font-weight: bold; margin: 0; letter-spacing: 2px; }
        .company-section { display: flex; align-items: center; justify-content:center; gap: 8px; }
        .company-img img { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; }
        .company-name { font-size: 12px; font-weight: 500; color: #0A0A0A; }
        .invoice-info { display: grid; grid-template-columns: 1fr 1fr; text-align:center; margin-top: 14px; font-size: 13px; }
        .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #e5e5e5; border-radius: 8px; margin-bottom: 20px; }
        .info-cell { padding: 12px 14px; border-right: 1px solid #e5e5e5; font-size: 13px; }
        .heading{ font-size: medium; font-weight: bold; padding: 2px;}
        .participant-plan-grid { display: grid; grid-template-columns: 1.2fr 0.8fr; border: 1px solid #e5e5e5; border-radius: 8px; margin-bottom: 20px; padding:2%; }
        .items-table { width: 100%; border-collapse: collapse; border: 1px solid #e0e0e0; margin-bottom: 20px; }
        .items-table th { background: ${brandColor}; color: white; padding: 12px 16px; }
        .items-table td { padding: 12px 16px; border: 1px solid #e0e0e0; font-size: 12px; }
        .totals-section { display: grid; grid-template-columns: 1fr 1fr; background: #fafafa; }
        .totals-main { padding: 16px; border: 1px solid #e5e5e5; border-radius: 8px; }
        .payment-section { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
        .payment-details, .paymentDetails-main { padding: 16px; border: 1px solid #e5e5e5; border-radius: 8px; }
        .payment-buttons { margin-top: 12px; display: flex; justify-content: flex-start; }
        .btn {
          padding: 10px 18px;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 12px;
          text-decoration: none;
          display: inline-block;
          text-align: center;
        }
        .btn-primary { background: {BRAND_COLOR}; color: white; }
        .btn:hover { opacity: 0.92; }
        .invoice-footer-container { position: relative; left: 0; bottom: 0; width: 100%; padding: 16px; }
        .invoice-footer { display: flex; justify-content: space-between; align-items: center; background: #fafafa; padding: 0px; border-radius: 8px; }
        .powered-by { display: flex; flex-direction: column; font-size: 14px; color: #666; }
        .social-links { display: flex; gap: 15px; }
        .social-link { width: 35px; height: 35px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .items-table th,
        .items-table td {
          border: 1px solid #e0e0e0;
          padding: 12px 16px;
          font-size: 12px;
        }

        .items-table th {
          background: {BRAND_COLOR};
          color: white;
          font-weight: 600;
          font-size: 12px;
          text-align: left;
        }

        .items-table td.total-cell {  
          font-weight: 600;
        }


        .company-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          justify-content: end;
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
          font-size: 18px;
        }

        .company-logo img {
          height: 40px;
          width: auto;
          max-width: 120px;
          object-fit: contain;
          border-radius: 4px;
        }
        
        .company-name {
          font-size: 16px;
          font-weight: 600;
          color: #333;
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

      <!-- Header -->
      <div class="invoice-header">
        <div class="invoice-header-main">
           <div style="display:flex; flex-direction:column; align-items:flex-start;">

             <h1 class="invoice-title">
            ${showDepositHeading ? `<span style="display:inline-block;background:#4D4DFF;color:#fff;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;vertical-align:middle;margin-right:6px;">${depositHeadingLabel}</span>` : ''}${invoiceTitle(data)}
          </h1>
           </div>
          <div>
             <div class="company-logo">
            ${generateFitrecLogoBlock(data)}
            <div class="company-name"></div>
          </div>
            <div class="invoice-info">
              <div><p class="detail-label">Invoice Date:</p><p class="detail-value">${formatDate(data.invoice_date)}</p></div>
              <div><p class="detail-label">Invoice Number:</p><p class="detail-value">${data.invoice_no}</p></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Provider -->
      <div class="info-grid">
        ${showSoleUserName && data.provider.provider_name ? `<div class="info-cell"><p class="heading">Provider Name</p><p>${escapeHtml(data.provider.provider_name)}</p></div>` : ''}
        ${showSoleBusinessName && data.provider.company_name ? `<div class="info-cell"><p class="heading">Business Name</p><p>${escapeHtml(data.provider.company_name)}</p></div>` : ''}
        ${
          showSoleBusinessAbn
            ? providerIdentifiers(data)
                .map((id) => `<div class="info-cell"><p class="heading">${id.label}</p><p>${id.value}</p></div>`)
                .join('')
            : ''
        }
        ${data.provider.ndis_no ? `<div class="info-cell"><p class="heading">NDIS Number</p><p>${escapeHtml(data.provider.ndis_no)}</p></div>` : ''}
        ${showSoleBusinessAddress && data.provider.address ? `<div class="info-cell"><p class="heading">Address</p><p class="address-text">${escapeHtml(data.provider.address)}</p></div>` : ''}
      </div>

      <!-- Participant & Plan Manager -->
      <div class="participant-plan-grid" style="grid-template-columns: ${hasPlanManager ? '1.2fr 0.8fr' : '1fr'};">
        <div class="info-section">
          <h4 class="heading">Participant</h4>
          ${showCustomerName && data?.participant?.participant_name ? `<p>Name: ${escapeHtml(data.participant.participant_name)}</p>` : ''}

          ${showCustomerBusiness && data?.participant?.company_name ? `<p>Company: ${escapeHtml(data.participant.company_name)}</p>` : ''}

          ${data?.participant?.ndis_no ? `<p>NDIS Number: ${escapeHtml(data.participant.ndis_no)}</p>` : ''}

          ${showCustomerAddress && data?.participant?.address ? `<p class="address-text">Address: ${escapeHtml(data.participant.address)}</p>` : ''}
          ${showCustomerPhone && data?.participant?.phone_no ? `<p>Phone: ${escapeHtml(data.participant.phone_no)}</p>` : ''}
          ${showCustomerAbn && data?.participant?.abn ? `<p>${customerIdLabel(data)}: ${escapeHtml(data.participant.abn)}</p>` : ''}
        </div>
        ${
          hasPlanManager
            ? `
        <div class="info-section">
          <h4 class="heading">Plan Manager</h4>
          ${data?.plan_manager?.plan_manager_name ? `<p>Name: ${escapeHtml(data.plan_manager.plan_manager_name)}</p>` : ''}
          ${data?.plan_manager?.plan_manager_ndis ? `<p>NDIS Number: ${escapeHtml(data.plan_manager.plan_manager_ndis)}</p>` : ''}
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

      <!-- Items Table -->
     <table class="items-table">
          <thead>
            <tr>
              <th style="text-align:left; white-space:nowrap;">Date</th>
              <th style="text-align:center;">Support Item No</th>
              <th style="text-align:center;">Description</th>
              <th style="text-align:center;">Claim Type</th>
              <th style="text-align:center;">QTY</th>
              ${branding.showQtyType ? `<th style="text-align:center;">Qty Type</th>` : ''}
              <th style="text-align:center;">Unit Price</th>
              ${data.invoice_item?.some((i) => i.discount) ? `<th style="text-align:center;">Discount</th>` : ''}
              ${showLineGst ? `<th style="text-align:center;">${taxLabel(data)}</th>` : ''}
              <th style="font-weight:500; text-align:end;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.invoice_item
                ?.map(
                  (item, idx) => `
            <tr>
              <td style="text-align:left; white-space:nowrap;">${formatDate(item.date) || '--'}</td>
              <td style="text-align:center;">${escapeHtml(item.item_support_no || '--')}</td>
              <td style="text-align:center; max-width: 250px; white-sapce:normal; overflow-wrap: anywhere;
  word-break: break-word;">${escapeHtml(item.description || '--')}</td>
              <td style="text-align:center;">${escapeHtml(item.claim_type || '--')}</td>
              <td style="text-align:center;">${item.qty || 0}</td>
              ${branding.showQtyType ? `<td style="text-align:center;">${formatQtyType(item.qty_type)}</td>` : ''}
              <td style="text-align:center;">${formatCurrency(item.unit_price || 0, data)}</td>
              ${data.invoice_item?.some((i) => i.discount) ? `<td style="text-align:center;">${typeof item.discount === 'string' ? item.discount : formatCurrency(item.discount || 0, data)}</td>` : ''}
              ${showLineGst ? `<td style="text-align:center;">${lineHasGst(item) ? formatCurrency(item.gst_amount || 0, data) : '--'}</td>` : ''}
              <td class="total-cell" style="font-weight:500; text-align:end;">${formatCurrency(item.total || 0, data)}</td>
            </tr>
            `
                )
                .join('') || ''
            }
          </tbody>
        </table>

      <!-- Totals -->
      <div class="totals-section">
        <div></div>
        <div class="totals-main">
          <div class="total-row"><span class="heading" >Subtotal: </span><span style="font-weight: 500;text-align: end;">${formatCurrency(data.sub_total, data)}</span></div>
          ${data?.extra_discount ? `<div class="total-row"><span class="heading">Extra Discount:</span><span style="font-weight: 500;text-align: end;">-${typeof data.extra_discount === 'string' ? data.extra_discount : formatCurrency(data.extra_discount, data)}</span></div>` : ''}
          ${data?.total_gst ? `<div class="total-row"><span class="heading">${data?.country?.tax_label || 'GST'}:</span><span style="font-weight: 500;text-align: end;">${formatCurrency(data.total_gst, data)}</span></div>` : ''}
          <div class="total-row final"><span class="heading ">Total Due: </span><span style="font-weight: 500;text-align: end;">${formatCurrency(data.total || 0, data)}</span></div>
            ${
              isDepositInvoice && data?.deposit_status !== 'paid'
                ? `
          <div class="total-row"><span class="heading">Deposit requested:</span><span style="font-weight: 500;text-align: end;">${formatCurrency(data.deposit_amount, data)}</span></div>
          <div class="total-row"><span class="heading">Deposit due:</span><span style="font-weight: 500;text-align: end;">${formatDate(data.deposit_due_date)}</span></div>
                  `
                : ''
            }
            ${
              showDepositSummary
                ? `
          <div class="total-row"><span class="heading">Deposit paid:</span><span style="font-weight: 500;text-align: end;">${formatCurrency(data.deposit_paid_amount, data)}</span></div>
          <div class="total-row"><span class="heading">Remaining amount:</span><span style="font-weight: 500;text-align: end;">${formatCurrency(depositRemainingAmount, data)}</span></div>
                  `
                : ''
            }
        </div>
      </div>
${generateExchangeRateSection(data)}
        ${generatePaidStamp(isReceipt || hasPaid || isFullyPaidInvoice)}
      <!-- Payment -->
      ${
        showPayment
          ? `
    <div class="payment-section">
      <div class="payment-details">
      <h4 class="heading" style="margin-bottom:2px;">Payment Details</h4>
        ${data?.payment?.account_name ? `<p>Account Name: ${escapeHtml(data.payment.account_name)}</p>` : ''}
        ${bankBranch(data) ? `<p>${bankBranchLabel(data)}: ${escapeHtml(data.payment.bsb)}</p>` : ''}
        ${data?.payment?.account_number ? `<p>Account: ${escapeHtml(data.payment.account_number)}</p>` : ''}
        <p>${escapeHtml(data?.payment?.last_date_desc || data?.payment?.payment_terms) || 'Please make payment by the invoice due date.'}</p>
      </div>

      <div class="paymentDetails-main">
        <p class="heading" style="margin-bottom:2px;">Payment Notes:</p>
        ${paymentDetails?.map((note) => `<p>• ${note}</p>`).join('') || ''}
      </div>
    </div>
  `
          : `
          <div class="paymentDetails-section"></div>
        `
      }

      ${
        data.isPayrix || data.ispayrix || data.isStripe
          ? `
      <div class="payment-buttons">
        <a href="${payLink}" class="btn btn-primary" target="_blank">${data.isStripe ? 'Pay via Stripe' : 'Pay via WorldPay'}</a>
      </div>
      `
          : ''
      }
        <!-- Notes Section -->
         ${
           data.notes
             ? `
          <div style="background:#fafafa; padding:20px; border-radius:8px; font-size:13px; margin-bottom:16px;">
           <strong>Notes:</strong><br/>
               ${escapeHtml(data.notes)}
          </div>
         `
             : ''
         }  

        <!-- Footer -->
        <div class="doc-footer" style="${showFooter ? 'display: block;' : 'display: none;'} width: 100%; padding: 10px; margin-top: 16px; box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center; background-color: #fafafa; padding: 16px; border-radius: 8px;">
            ${effectiveInvoiceNote ? `<div style="font-size: 10px; font-weight: 600; color: #6b7280;">${escapeHtml(effectiveInvoiceNote)}</div>` : ''}
            ${hasSocialLinks ? `<div style="display: flex; gap: 15px; margin-left: auto;">{SOCIAL_MEDIA_LINKS}</div>` : ''}
        </div>
    </div>
    
     
    </div>
  `
    .replace(/\{BRAND_COLOR\}/g, brandColor)
    .replace(/\{CONTENT_COLOR\}/g, contentColor)
    .replace(/\{SOCIAL_MEDIA_LINKS\}/g, socialMediaLinks);
};

export default NdisFourTemplate;
