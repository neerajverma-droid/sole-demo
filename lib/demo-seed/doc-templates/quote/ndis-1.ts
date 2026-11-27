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
  formatQtyType
} from '../helper';
import { documentHasTax, taxLabel, lineHasGst } from '../helper';
// Line text is the user's own (or a client's) — escaped per cell, since this layout
// is also rendered from paths that don't run escapeQuoteRenderData.
import { escapeHtml as escapeCell } from '../helper';

const NdisInvoiceTemplate = (invoiceData = null, brandingData = null, payLink = '', isReceipt = false, showPayment = true, showBanner = false) => {
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
          font-size: 14px;
          color: #333;
          line-height: 1.4;
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
          // margin: 0 auto;
          background: white;
          padding: 10px 10px 90px 10px;
          box-sizing: border-box;
          position: relative;
        }
        @media print {
          /* PDF: 10px put the content against the paper edge */
          .invoice-container { padding-left: 24px; padding-right: 24px; }
        }
        
        .invoice-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
        }
        
        .invoice-title {
          font-size: 36px;
          font-weight: bold;
          color: #333;
          margin: 0;
          letter-spacing: 2px;
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
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }
        
        .provider-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 30px;
        }
        
        .section-title {
          font-size: 14px;
          font-weight: 600;
          color: #333;
          margin-bottom: 10px;
        }
        
        .detail-row {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 10px;
          margin-bottom: 8px;
          font-size: 12px;
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
          margin-bottom: 30px;
        }
        
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin: 30px 0;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .items-table th {
          background: {BRAND_COLOR};
          color: white;
          padding: 15px 20px;
          text-align: left;
          font-weight: 600;
          font-size: 12px;
        }
        
        .items-table td {
          border-bottom: 1px solid #f0f0f0;
          padding: 15px 20px;
          font-size: 12px;
          text-align: left;
        }
        
        /* The Qty Type column makes this an eight-column table: trim the side padding so the
           Description column keeps room instead of wrapping to five lines. */
        .items-table.has-qty-type th,
        .items-table.has-qty-type td {
          padding-left: 10px;
          padding-right: 10px;
        }

        .items-table td.total-cell {  
          font-weight: 600;
        }
        
        .items-table tbody tr:last-child td {
          border-bottom: none;
        }
        
        .payment-section {
        
          border-radius: 8px;
          padding: 10px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
         
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .payment-details {
          background-color: #ffffff;
          border-radius: 6px;
          padding: 16px;
        }
        
        .payment-details .detail-row {
          display: block;
          margin-bottom: 8px;
          line-height: 1;
        }
        
        .payment-details .detail-row:last-child {
          margin-bottom: 0;
        }
        
        .payment-details .detail-label {
          color: #6b7280;
          font-size: 12px;
          font-weight: 400;
          display: inline-block;
          width: 120px;
          margin-right: 16px;
        }
        
        .payment-details .detail-value {
          color: #111827;
          font-weight: 600;
          font-size: 12px;
          display: inline-block;
          word-break: break-all;
        }
        
        .payment-buttons {
          display: flex;
          gap: 15px;
          margin-top: 10px;
        }
        
        .btn {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 14px;
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
          padding: 20px;
          border-radius: 8px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
        }
        
        .total-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
          font-size: 13px;
          font-weight: 600;
        }

        .total-row.second {
          border-top: 1.5px solid #CDD0D5;
          padding-top: 10px;
        }
        
        .total-row.final {
          border-top: 2px solid #31353F;
          padding-top: 10px;
          margin-top: 10px;
          font-weight: bold;
          font-size: 16px;
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

        .social-links.right-align {
          margin-left: auto;
        }

        .paymentDetails-section {
          background-color: #ffffff;
          border-radius: 6px;
          padding: 16px;
        }
        
        .paymentDetails {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
          font-weight: 500;
          color: #374151;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        
        .paymentDetails-value {
          margin-bottom: 4px;
          line-height: 1.4;
        }

        .last-day-info {
          margin-top: 12px;
          display: flex;
          align-items: flex-start;
          gap: 4px;
          color: #6b7280;
          font-size: 12px;
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

        <!-- Invoice Info -->
        <div class="invoice-info">
          <div>
            <p class="detail-label">Quote #</p>
            <p class="detail-value">${data.quote_no}</p>
          </div>
          <div>
            <p class="detail-label">Quote Date</p>
            <p class="detail-value">${formatDate(data.quote_date)}</p>
          </div>
        </div>

        <!-- Provider Details -->
        <div class="provider-details">
          <div class="provider-info">
            <div class="section-title">Provider</div>
            ${
              showSoleUserName && data.provider?.user_name
                ? `
            <div class="detail-row">
              <span class="detail-label">Name :</span>
              <span class="detail-value">${data.provider.user_name}</span>
            </div>
            `
                : ''
            }
            ${
              showSoleBusinessName && data.provider?.company_name
                ? `
            <div class="detail-row">
              <span class="detail-label">Company :</span>
              <span class="detail-value">${data.provider.company_name}</span>
            </div>
            `
                : ''
            }
            ${
              showSoleBusinessAbn
                ? providerIdentifiers(data)
                    .map(
                      (id) => `
            <div class="detail-row">
              <span class="detail-label">${id.label} :</span>
              <span class="detail-value">${id.value}</span>
            </div>
            `
                    )
                    .join('')
                : ''
            }
            ${
              showSoleBusinessAbn && data.provider?.ndis_no
                ? `
            <div class="detail-row">
              <span class="detail-label">NDIS Number :</span>
              <span class="detail-value">${data.provider.ndis_no}</span>
            </div>
            `
                : ''
            }
            ${
              showSoleBusinessAddress && data.provider?.address
                ? `
            <div class="detail-row">
              <span class="detail-label">Address :</span>
              <span class="detail-value address-text">${data.provider.address}</span>
            </div>
            `
                : ''
            }
            ${
              data.provider?.email
                ? `
            <div class="detail-row">
              <span class="detail-label">Email :</span>
              <span class="detail-value">${data.provider.email}</span>
            </div>
            `
                : ''
            }
            ${
              data.provider?.phone_no
                ? `
            <div class="detail-row">
              <span class="detail-label">Phone Number :</span>
              <span class="detail-value">${data.provider.phone_no}</span>
            </div>
            `
                : ''
            }
          </div>

          <div class="participant-info">
            <div class="section-title">Participant</div>
            ${
              showCustomerName && data.participant?.participant_name
                ? `
            <div class="detail-row">
              <span class="detail-label">Name :</span>
              <span class="detail-value">${data.participant.participant_name}</span>
            </div>
            `
                : ''
            }

            ${
              showCustomerBusiness && data.participant?.company_name
                ? `
            <div class="detail-row">
              <span class="detail-label">Company :</span>
              <span class="detail-value">${data.participant.company_name}</span>
            </div>
            `
                : ''
            }

            ${
              data.participant?.ndis_no
                ? `
            <div class="detail-row">
              <span class="detail-label">NDIS Number :</span>
              <span class="detail-value">${data.participant.ndis_no}</span>
            </div>
            `
                : ''
            }

            ${
              showCustomerAddress && data.participant?.address
                ? `
            <div class="detail-row">
              <span class="detail-label">Address :</span>
              <span class="detail-value address-text">${data.participant.address}</span>
            </div>
            `
                : ''
            }
            ${
              showCustomerPhone && data.participant?.phone_no
                ? `
            <div class="detail-row">
              <span class="detail-label">Phone :</span>
              <span class="detail-value">${data.participant.phone_no}</span>
            </div>
            `
                : ''
            }
            ${
              showCustomerAbn && data.participant?.abn
                ? `
            <div class="detail-row">
              <span class="detail-label">${customerIdLabel(data)} :</span>
              <span class="detail-value">${data.participant.abn}</span>
            </div>
            `
                : ''
            }

            ${
              hasPlanManager
                ? `
            <div class="section-title" style="margin-top: 14px;">Plan Manager</div>
            ${
              data?.plan_manager?.plan_manager_name
                ? `
            <div class="detail-row">
              <span class="detail-label">Name :</span>
              <span class="detail-value">${data.plan_manager.plan_manager_name}</span>
            </div>
            `
                : ''
            }
            ${
              data?.plan_manager?.plan_manager_ndis
                ? `
            <div class="detail-row">
              <span class="detail-label">NDIS Number :</span>
              <span class="detail-value">${data.plan_manager.plan_manager_ndis}</span>
            </div>
            `
                : ''
            }
            `
                : ''
            }
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

        <!-- Items Table -->
        <table class="items-table${branding.showQtyType ? ' has-qty-type' : ''}">
          <thead>
            <tr>
              <th style="text-align:left;white-space: nowrap;">Date</th>
              <th style="text-align:center;">Support Item No</th>
              <th style="text-align:center;">Description</th>
              <th style="text-align:center;">Claim Type</th>
              <th style="text-align:center;">QTY</th>
              ${branding.showQtyType ? `<th style="text-align:center;">Qty Type</th>` : ''}
              <th style="text-align:center;">Unit Price</th>
              ${data.quote_items?.some((i) => i.discount) ? `<th style="text-align:center;">Discount</th>` : ''}
              ${showLineGst ? `<th style="text-align:center;">${taxLabel(data)}</th>` : ''}
              <th style="text-align:end;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${
              data.quote_items
                ?.map(
                  (item, idx) => `
            <tr>
              <td style="text-align:left; white-space: nowrap;">${formatDate(item.date) || '--'}</td>
              <td style="text-align:center;">${escapeCell(item.item_support_no) || '--'}</td>
              <td style="text-align:center; max-width: 250px; white-sapce:normal; overflow-wrap: anywhere;
  word-break: break-word;">${escapeCell(item.description) || '--'}</td>
              <td style="text-align:center;">${escapeCell(item.claim_type) || '--'}</td>
              <td style="text-align:center;">${item.qty || 0}</td>
              ${branding.showQtyType ? `<td style="text-align:center;">${formatQtyType(item.qty_type)}</td>` : ''}
              <td style="text-align:center;">${formatCurrency(item.unit_price || 0, data)}</td>
              ${data.quote_items?.some((i) => i.discount) ? `<td style="text-align:center;">${typeof item.discount === 'string' ? item.discount : formatCurrency(item.discount || 0, data)}</td>` : ''}
              ${showLineGst ? `<td style="text-align:center;">${lineHasGst(item) ? formatCurrency(item.gst_amount || 0, data) : '--'}</td>` : ''}
              <td class="total-cell" style="text-align:end;">${formatCurrency(item.total || 0, data)}</td>
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
          <div>
            <div class="total-row">
              <span class="total-label">Total Amount</span>
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
                    <div class="total-row second">
                      <span class="total-label">${taxLabel(data)}</span>
                      <span class="total-value">${formatCurrency(data.total_gst || 0, data)}</span>
                    </div>
                  `
                : `<div></div>`
            }

            <div class="total-row final">
              <span class="total-label">Total Quote Amount</span>
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
          ${
            showPayment
              ? `
          <div class="payment-details">
            <div class="section-title">Payment Details</div>
            <div class="detail-row">
              <span class="detail-label">Account Name</span>
              <span class="detail-value">${data.payment?.account_name || '--'}</span>
            </div>
            ${
              bankBranchLabel(data)
                ? `<div class="detail-row">
              <span class="detail-label">${bankBranchLabel(data)}</span>
              <span class="detail-value">${data.payment?.bsb || '--'}</span>
            </div>`
                : ''
            }
            <div class="detail-row">
              <span class="detail-label">Account</span>
              <span class="detail-value">${data.payment?.account_number || '--'}</span>
            </div>

            <div class="last-day-info">
              <svg width="15" height="15" viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0; margin-top: 2px;">
                <path d="M6 12.9824C2.6862 12.9824 0 10.2962 0 6.98242C0 3.66862 2.6862 0.982422 6 0.982422C9.3138 0.982422 12 3.66862 12 6.98242C12 10.2962 9.3138 12.9824 6 12.9824ZM5.4 6.38242V9.98242H6.6V6.38242H5.4ZM5.4 3.98242V5.18242H6.6V3.98242H5.4Z" fill="#6b7280"/>
              </svg>
              <span>${data.payment?.last_date_desc || data.payment?.payment_terms || 'Payment is requested once this quote is accepted.'}</span>
            </div>

           
          </div>

          <div class="paymentDetails-section">
            <div class="section-title">Payment Notes</div>
            <ul class="paymentDetails">
              ${
                paymentDetails
                  ?.map(
                    (item) => `
                  <li class="paymentDetails-value">• ${item}</li>
                `
                  )
                  .join('') || ''
              }
            </ul>
          </div>
        `
              : `
          <div class="payment-details"></div>
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
         ${hasSocialLinks ? `<div style="display: flex; gap: 15px; margin-left: auto;">{SOCIAL_MEDIA_LINKS}</div>` : `<div></div>`}
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

export default NdisInvoiceTemplate;
