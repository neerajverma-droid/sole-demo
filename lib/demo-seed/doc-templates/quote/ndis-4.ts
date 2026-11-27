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
  generateExchangeRateSection,
  generateFitrecLogoBlock,
  generateFitrecTitleBadge,
  quoteTitle,
  customerIdLabel,
  providerIdentifiers,
  bankBranchLabel,
  bankBranch,
  formatQtyType
} from '../helper';
import { documentHasTax, taxLabel, lineHasGst } from '../helper';
// Line text is the user's own (or a client's) — escaped per cell, since this layout
// is also rendered from paths that don't run escapeQuoteRenderData.
import { escapeHtml as escapeCell } from '../helper';
const NdisFourTemplate = (invoiceData = null, brandingData = null, payLink = '', isReceipt = false, showPayment = true, showBanner = true) => {
  const data = invoiceData;

  // Deposit quotes — same rule as the general quote templates (quotes-1..6, classic-1..4)
  const isDepositQuote = Boolean(data?.is_deposit) || data?.payment_structure === 'deposit_balance';

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

  // Generate social media links if branding data exists
  const socialMediaLinks = generateSocialMediaLinks(brandingData);
  const hasSocialLinks = Boolean(socialMediaLinks);
  // Each document prints only its own notes (data.notes, escaped upstream by escapeQuoteRenderData) once; the Sales Settings note is not repeated in the footer.
  const effectiveInvoiceNote = '';
  const showFooter = showBanner || hasSocialLinks || Boolean(effectiveInvoiceNote);
  const hasPlanManager = Boolean(data?.plan_manager?.plan_manager_name || data?.plan_manager?.plan_manager_ndis);
  // Same rule as the general layouts: a per-line GST column only when Sales Settings "Show GST" is on and a line carries GST.
  const showLineGst = branding.showGst === true && (data.quote_items || []).some(lineHasGst);

  const paymentDetails = [
    'This quote is for one NDIS participant only.',
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
            ${isDepositQuote ? '<span style="display:inline-block;background:#4D4DFF;color:#fff;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;vertical-align:middle;margin-right:6px;">Deposit requested</span>' : ''}${quoteTitle(data)}
          </h1>
           </div>
          <div>
             <div class="company-logo">
            ${generateFitrecLogoBlock(data)}
            <div class="company-name"></div>
          </div>
            <div class="invoice-info">
              <div><p class="detail-label">Quote Date:</p><p class="detail-value">${formatDate(data.quote_date)}</p></div>
              <div><p class="detail-label">Quote Number:</p><p class="detail-value">${data.quote_no}</p></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Provider -->
      <div class="info-grid">
        ${showSoleUserName && data.provider.provider_name ? `<div class="info-cell"><p class="heading">Provider Name</p><p>${data.provider.provider_name}</p></div>` : ''}
        ${showSoleBusinessName && data.provider.company_name ? `<div class="info-cell"><p class="heading">Business Name</p><p>${data.provider.company_name}</p></div>` : ''}
        ${
          showSoleBusinessAbn
            ? providerIdentifiers(data)
                .map((id) => `<div class="info-cell"><p class="heading">${id.label}</p><p>${id.value}</p></div>`)
                .join('')
            : ''
        }
        ${data.provider.ndis_no ? `<div class="info-cell"><p class="heading">NDIS Number</p><p>${data.provider.ndis_no}</p></div>` : ''}
        ${showSoleBusinessAddress && data.provider.address ? `<div class="info-cell"><p class="heading">Address</p><p class="address-text">${data.provider.address}</p></div>` : ''}
      </div>

      <!-- Participant & Plan Manager -->
      <div class="participant-plan-grid" style="grid-template-columns: ${hasPlanManager ? '1.2fr 0.8fr' : '1fr'};">
        <div class="info-section">
          <h4 class="heading">Participant</h4>
          ${showCustomerName && data?.participant?.participant_name ? `<p>Name: ${data.participant.participant_name}</p>` : ''}

          ${showCustomerBusiness && data?.participant?.company_name ? `<p>Company: ${data.participant.company_name}</p>` : ''}

          ${data?.participant?.ndis_no ? `<p>NDIS Number: ${data.participant.ndis_no}</p>` : ''}

          ${showCustomerAddress && data?.participant?.address ? `<p class="address-text">Address: ${data.participant.address}</p>` : ''}
          ${showCustomerPhone && data?.participant?.phone_no ? `<p>Phone: ${data.participant.phone_no}</p>` : ''}
          ${showCustomerAbn && data?.participant?.abn ? `<p>${customerIdLabel(data)}: ${data.participant.abn}</p>` : ''}
        </div>
        ${
          hasPlanManager
            ? `
        <div class="info-section">
          <h4 class="heading">Plan Manager</h4>
          ${data?.plan_manager?.plan_manager_name ? `<p>Name: ${data.plan_manager.plan_manager_name}</p>` : ''}
          ${data?.plan_manager?.plan_manager_ndis ? `<p>NDIS Number: ${data.plan_manager.plan_manager_ndis}</p>` : ''}
        </div>
        `
            : ''
        }
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
              ${data.quote_items?.some((i) => i.discount) ? `<th style="text-align:center;">Discount</th>` : ''}
              ${showLineGst ? `<th style="text-align:center;">${taxLabel(data)}</th>` : ''}
              <th style="font-weight:500; text-align:end;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.quote_items
                ?.map(
                  (item, idx) => `
            <tr>
              <td style="text-align:left; white-space:nowrap;">${formatDate(item.date) || '--'}</td>
              <td style="text-align:center;">${escapeCell(item.item_support_no) || '--'}</td>
              <td style="text-align:center; max-width: 250px; white-sapce:normal; overflow-wrap: anywhere;
  word-break: break-word;">${escapeCell(item.description) || '--'}</td>
              <td style="text-align:center;">${escapeCell(item.claim_type) || '--'}</td>
              <td style="text-align:center;">${item.qty || 0}</td>
              ${branding.showQtyType ? `<td style="text-align:center;">${formatQtyType(item.qty_type)}</td>` : ''}
              <td style="text-align:center;">${formatCurrency(item.unit_price || 0, data)}</td>
              ${data.quote_items?.some((i) => i.discount) ? `<td style="text-align:center;">${typeof item.discount === 'string' ? item.discount : formatCurrency(item.discount || 0, data)}</td>` : ''}
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
              isDepositQuote
                ? `
          <div class="total-row"><span class="heading">Deposit amount:</span><span style="font-weight: 500;text-align: end;">${formatCurrency(data.deposit_amount || 0, data)}</span></div>
                  ${
                    data.deposit_due_date
                      ? `
          <div class="total-row"><span class="heading">Deposit due:</span><span style="font-weight: 500;text-align: end;">${formatDate(data.deposit_due_date)}</span></div>`
                      : ''
                  }
                  `
                : ''
            }
        </div>
      </div>
${generateExchangeRateSection(data)}
      <!-- Payment -->
      ${
        showPayment
          ? `
    <div class="payment-section">
      <div class="payment-details">
      <h4 class="heading" style="margin-bottom:2px;">Payment Details</h4>
        ${data?.payment?.account_name ? `<p>Account Name: ${data.payment.account_name}</p>` : ''}
        ${bankBranch(data) ? `<p>${bankBranchLabel(data)}: ${data.payment.bsb}</p>` : ''}
        ${data?.payment?.account_number ? `<p>Account: ${data.payment.account_number}</p>` : ''}
        <p>${data?.payment?.last_date_desc || data?.payment?.payment_terms || 'Payment is requested once this quote is accepted.'}</p>
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
        data.isPayrix || data.ispayrix
          ? `
      <div class="payment-buttons">
        <a href="${payLink}" class="btn btn-primary" target="_blank">Pay via WorldPay</a>
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
               ${data.notes}
          </div>
         `
             : ''
         }  

        <!-- Footer -->
        <div class="doc-footer" style="${showFooter ? 'display: block;' : 'display: none;'} width: 100%; padding: 10px; margin-top: 16px; box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center; background-color: #fafafa; padding: 16px; border-radius: 8px;">
            ${effectiveInvoiceNote ? `<div style="font-size: 10px; font-weight: 600; color: #6b7280;">${effectiveInvoiceNote}</div>` : ''}
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
