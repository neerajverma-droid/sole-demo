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
  showContentOnValue,
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

const NdisTwoInvoiceTemplate = (invoiceData = null, brandingData = null, payLink = '', isReceipt = false, showPayment = true, showBanner = false) => {
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

  const template = `
    <div>
      <style>
        body {
          font-family: Arial, sans-serif;
          font-size: 12px;
          color: #333;
          line-height: 1.3;
          margin: 0;
          padding: 0;
        }
        .center {
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .center-start {
          display: flex;
          justify-content: start;
          align-items: center;
        }
        .invoice-container {
          // width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background: white;
          padding: 8px 8px 90px 8px;
          box-sizing: border-box;
          position: relative;
        }
        
        .invoice-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 15px;
        }
        
        .invoice-title {
          font-size: 28px;
          font-weight: bold;
          color: #333;
          margin: 0;
          letter-spacing: 1.5px;
        }
        
        .company-logo {
          display: flex;
          align-items: center;
          gap: 12px;
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
          font-size: 13px;
          font-weight: 600;
          color: #333;
        }
        
        .provider-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          margin-bottom: 20px;
        }
        
        .section-title {
          font-size: 12px;
          font-weight: 600;
          color: #333;
          margin-bottom: 8px;
        }
        
        .detail-row {
          display: grid;
          grid-template-columns: 0.9fr 1.1fr;
          gap: 8px;
          margin-bottom: 6px;
          font-size: 10px;
        }
        
        .detail-label {
          color: #666;
          font-weight: 500;
        }
        
        .detail-value {
          color: {CONTENT_COLOR};
          font-weight: 600;
        }
        
        .ship-to-section {
          margin-bottom: 20px;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          overflow: hidden;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
        }

        .items-table th,
        .items-table td {
          border: 1px solid #e0e0e0;
          padding: 8px 12px;
          font-size: 10px;
        }

        .items-table th {
          background: {BRAND_COLOR};
          color: white;
          font-weight: 600;
          font-size: 10px;
          text-align: left;
        }

        .items-table td.total-cell {  
          font-weight: 600;
        }
        
        .payment-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 15px;
        }

        .payment-details {
          padding: 12px;
          border-radius: 6px;
          border: 1px solid #e5e5e5;
        }

        .paymentDetails-main {
          padding: 12px;
          border-radius: 6px;
          border: 1px solid #e5e5e5;
        }
        
        .payment-details .detail-row {
          margin-bottom: 8px;
        }
        
        .payment-buttons {
          display: flex;
          gap: 15px;
          margin-top: 20px;
        }
        
        .btn {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          font-weight: 600;
          cursor: pointer;
          font-size: 11px;
          text-decoration: none;
          display: inline-block;
          text-align: center;
        }
        
        .btn-primary {
          background: {BRAND_COLOR};
          color: white;
        }
        
        .btn-secondary {
          background-color: #ff5722;
          color: white;
        }
        
        .totals-section {
          background-color: #fafafa;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .totals-main {
          padding: 12px 12px 4px 12px;
          border: 1px solid #e5e5e5;
          border-radius: 6px;
          font-size: 10px;
        }
        
        .total-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 10px;
          font-weight: 600;
        }

        .total-row.second {
          border-top: 1.5px solid #CDD0D5;
          padding-top: 10px;
        }
        
        .total-row.final {
          border-top: 2px solid #31353F;
          padding-top: 8px;
          margin-top: 8px;
          font-weight: bold;
          font-size: 12px;
          color: #333;
        }
        
        .total-label {
          color: #666;
        }
        
        .total-value {
          color: #333;
          font-weight: 600;
        }

        .invoice-footer-container {
          position: relative;
          left: 0;
          bottom: 0;
          width: 100%;
        }

        .invoice-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: #fafafa;
          padding: 30px;
          border-radius: 8px;
        }
        
        .powered-by {
          display: flex;
          gap: 10px;
          color: #666;
          font-size: 14px;
          flex-direction: column;
        }
        
        .sole-logo {
          font-weight: bold;
          color: {BRAND_COLOR};
          font-size: 18px;
        }
        
        .social-links {
          display: flex;
          gap: 15px;
        }
        
        .social-link {
          width: 35px;
          height: 35px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          font-size: 16px;
          color: white;
          background: white;
        }

        .invoice-info {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
          margin-bottom: 25px;
          padding-bottom: 25px;
          border-bottom: 1.5px solid #E2E4E9;
        }

        .paymentDetails {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 10px;
          font-weight: 600;
          color: #333;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          border: 1px solid #e5e5e5;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 20px;
        }

        .info-cell {
          padding: 8px 10px;
          border-right: 1px solid #e5e5e5;
          display: flex;
          flex-direction: column;    
          justify-content: center; 
          gap: 1px;
          font-size: 10px;
        }

        .info-cell:last-child {
          border-right: none;
        }

        .participant-plan-grid {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          border: 1px solid #e5e5e5;
          border-radius: 6px;
          overflow: hidden;
          font-size: 10px;
          background: #fcf9f9;
          margin-bottom: 15px;
        }

        .info-section {
          padding: 12px;
          border-right: 1px solid #e5e5e5;
        }

        .info-section:last-child {
          border-right: none;
        }

        .section-title {
          font-weight: 600;
          margin-bottom: 8px;
          font-size: 11px;
          color: #111;
        }
             .social-links.right-align {
      margin-left: auto;
    }

        .info-row {
          display: grid;
          grid-template-columns: 100px 8px 1fr;
          margin-bottom: 4px;
          font-size: 10px;
        }

        .label {
          color: #555;
          font-weight: 500;
        }

        .colon {
          text-align: center;
          color: #666;
        }

        .value {
          font-weight: 600;
          color: #111;
        }

        @media print {
          .invoice-container {
            width: 100%;
            margin: 0;
            padding: 20px;
          }
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

      <div class="invoice-container">
        <!-- Header -->
        <div class="invoice-header">
           <div style="display:flex; flex-direction:column; align-items:flex-start;">
          
             <h1 class="invoice-title">
            ${isDepositQuote ? '<span style="display:inline-block;background:#4D4DFF;color:#fff;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;vertical-align:middle;margin-right:6px;">Deposit requested</span>' : ''}${quoteTitle(data)}
          </h1>
           </div>
          <div class="company-logo">
            ${generateFitrecLogoBlock(data)}
            <div class="company-name"></div>
          </div>
        </div>

        <!-- Provider Info -->
        <div class="info-grid">
          ${
            showSoleUserName && data.provider?.user_name
              ? `
          <div class="info-cell">
            <p class="detail-label">Provider</p>
            <p class="detail-value">${data.provider.user_name}</p>
          </div>
          `
              : ''
          }
          ${
            showSoleBusinessName && data.provider?.company_name
              ? `
          <div class="info-cell">
            <p class="detail-label">Business Name</p>
            <p class="detail-value">${data.provider.company_name}</p>
          </div>
          `
              : ''
          }
          ${
            showSoleBusinessAbn
              ? providerIdentifiers(data)
                  .map(
                    (id) => `
          <div class="info-cell">
            <p class="detail-label">${id.label}</p>
            <p class="detail-value">${id.value}</p>
          </div>
          `
                  )
                  .join('')
              : ''
          }
           ${
             showSoleBusinessAbn && data.provider?.ndis_no
               ? `
          <div class="info-cell">
            <p class="detail-label">NDIS Number :</p>
            <p class="detail-value">${data.provider.ndis_no}</p>
          </div>
          `
               : ''
           }
          ${
            showSoleBusinessAddress && data.provider?.address
              ? `
          <div class="info-cell">
            <p class="detail-label">Address</p>
            <p class="detail-value address-text">${data.provider.address}</p>
          </div>
          `
              : ''
          }
          ${
            data.provider?.quote_no || data.quote_no
              ? `
          <div class="info-cell">
            <p class="detail-label">Quote Number</p>
            <p class="detail-value">${data.provider?.quote_no || data.quote_no}</p>
          </div>
          `
              : ''
          }
          <div class="info-cell">
            <p class="detail-label">Quote Date</p>
            <p class="detail-value">${formatDate(data.provider?.quote_date || data.quote_date)}</p>
          </div>
        </div>

        <!-- Participant and Plan -->
        <div class="participant-plan-grid" style="grid-template-columns: ${hasPlanManager ? '1.2fr 0.8fr' : '1fr'};">
          <!-- Participant -->
          <div class="info-section">
            <h4 class="section-title">Participant</h4>
            ${
              showCustomerName && data.participant?.participant_name
                ? `
            <div class="info-row">
              <span class="label">Name :</span>
              <span class="colon"></span>
              <span class="value">${data.participant.participant_name}</span>
            </div>
            `
                : ''
            }

            ${
              showCustomerBusiness && data.participant?.company_name
                ? `
            <div class="info-row">
              <span class="label">Company :</span>
              <span class="colon"></span>
              <span class="value">${data.participant.company_name}</span>
            </div>
            `
                : ''
            }

            ${
              data.participant?.ndis_no
                ? `
            <div class="info-row">
              <span class="label">NDIS Number :</span>
              <span class="colon"></span>
              <span class="value">${data.participant.ndis_no}</span>
            </div>
            `
                : ''
            }

            ${
              showCustomerAddress && data.participant?.address
                ? `
            <div class="info-row">
              <span class="label">Address :</span>
              <span class="colon"></span>
              <span class="value address-text">${data.participant.address}</span>
            </div>
            `
                : ''
            }
            ${
              showCustomerPhone && data.participant?.phone_no
                ? `
            <div class="info-row">
              <span class="label">Phone :</span>
              <span class="colon"></span>
              <span class="value">${data.participant.phone_no}</span>
            </div>
            `
                : ''
            }
            ${
              showCustomerAbn && data.participant?.abn
                ? `
            <div class="info-row">
              <span class="label">${customerIdLabel(data)} :</span>
              <span class="colon"></span>
              <span class="value">${data.participant.abn}</span>
            </div>
            `
                : ''
            }
          </div>

          ${
            hasPlanManager
              ? `
          <!-- Plan Manager -->
          <div class="info-section">
            <h4 class="section-title">Plan Manager</h4>
            ${
              data?.plan_manager?.plan_manager_name
                ? `
            <div class="info-row">
              <span class="label">Name :</span>
              <span class="colon"></span>
              <span class="value">${data.plan_manager.plan_manager_name}</span>
            </div>
            `
                : ''
            }
            ${
              data?.plan_manager?.plan_manager_ndis
                ? `
            <div class="info-row">
              <span class="label">NDIS Number :</span>
              <span class="colon"></span>
              <span class="value">${data.plan_manager.plan_manager_ndis}</span>
            </div>
            `
                : ''
            }
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
              <th style="text-align:left; white-space: nowrap;">Date</th>
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
              <td style="text-align:left; white-space: nowrap;">${formatDate(item.date)}</td>
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

        <!-- Total Section -->
        <div class="totals-section">
          <div></div>
          <div class="totals-main">

            <div class="total-row">
              <span class="total-label">Subtotal${documentHasTax(data) ? '' : ' (GST-free)'}</span>
              <span class="total-value">${formatCurrency(data.sub_total || 0, data)}</span>
            </div>

            ${
              data?.extra_discount
                ? `
                    <div class="total-row">
                      <span class="total-label">Extra Discount</span>
                      <span class="total-value">-${typeof data.extra_discount === 'string' ? data.extra_discount : formatCurrency(data.extra_discount, data)}</span>
                    </div>
                  `
                : ''
            }

            ${
              showContentOnValue(data?.total_gst)
                ? `
                    <div class="total-row">
                      <span class="total-label">${taxLabel(data)}</span>
                      <span class="total-value">${formatCurrency(data.total_gst || 0, data)}</span>
                    </div>
                  `
                : ''
            }

            <div class="total-row final">
              <span class="total-label">Total Due</span>
              <span class="total-value">${formatCurrency(data.total || 0, data)}</span>
            </div>
            ${
              isDepositQuote
                ? `
            <div class="total-row">
              <span class="total-label">Deposit amount</span>
              <span class="total-value">${formatCurrency(data.deposit_amount || 0, data)}</span>
            </div>
                  ${
                    data.deposit_due_date
                      ? `
            <div class="total-row">
              <span class="total-label">Deposit due</span>
              <span class="total-value">${formatDate(data.deposit_due_date)}</span>
            </div>`
                      : ''
                  }
                  `
                : ''
            }
          </div>
        </div>
${generateExchangeRateSection(data)}
        <!-- Payment Section -->
        <div class="payment-section">
         
          <!-- Payment Details -->
          ${
            showPayment
              ? `
               <div class="payment-details">
            <div class="section-title">Payment Details</div>
            ${
              data.payment?.account_name
                ? `
            <div class="detail-row">
              <span class="detail-label">Account Name :</span>
              <span class="detail-value">${data.payment.account_name}</span>
            </div>
            `
                : ''
            }
            ${
              bankBranch(data)
                ? `
            <div class="detail-row">
              <span class="detail-label">${bankBranchLabel(data)} :</span>
              <span class="detail-value">${data.payment.bsb}</span>
            </div>
            `
                : ''
            }
            ${
              data.payment?.account_number
                ? `
            <div class="detail-row">
              <span class="detail-label">Account :</span>
              <span class="detail-value">${data.payment.account_number}</span>
            </div>
            `
                : ''
            }
           
          </div>

    <div class="paymentDetails-section">
      <div class="paymentDetails-main">
        <div class="section-title">Payment Notes</div>
        <div class="paymentDetails">
          ${
            paymentDetails
              ?.map(
                (item) => `
              <p class="paymentDetails-value">• ${item}</p>
            `
              )
              .join('') || ''
          }
        </div>
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
        </div>

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
    </div>
  `;

  // Apply branding replacements
  return template
    .replace(/\{BRAND_COLOR\}/g, brandColor)
    .replace(/\{CONTENT_COLOR\}/g, contentColor)
    .replace(/\{SOCIAL_MEDIA_LINKS\}/g, socialMediaLinks);
};

export default NdisTwoInvoiceTemplate;
