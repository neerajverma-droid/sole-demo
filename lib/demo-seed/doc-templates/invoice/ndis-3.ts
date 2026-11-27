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
  showContentOnValue,
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

const NdisThreeTemplate = (invoiceData = null, brandingData = null, payLink = '', isReceipt = false, showPayment = true, showBanner = false, hasPaid = false) => {
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

  const styles = {
    // A4 Optimization
    body: `font-family: 'Inter', 'Helvetica', Arial, sans-serif; margin: 0; padding: 0; color: #333; line-height: 1.3; background: #fff;`,
    page: ` min-height: 297mm; padding: 12px; box-sizing: border-box;`,
    topBar: `width: 100%; height: 5px; background-color: ${brandColor}; position: absolute; top: 0; left: 0;`,

    // Header
    header: `display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;`,
    title: `font-size: 24px; font-weight: 800; color: #111; margin: 0; letter-spacing: -0.5px;`,

    // Layout
    gridContainer: `display: flex; gap: 15px; margin-bottom: 15px;`,
    leftCol: `flex: 1.6; display: flex; flex-direction: column; gap: 12px;`,
    rightCol: `flex: 1; display: flex; flex-direction: column; gap: 12px;`,

    // Components
    card: `background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #e5e7eb;`,
    cardTitle: `font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #f3f4f6; padding-bottom: 4px;`,

    // Text
    label: `font-size: 10px; color: #6b7280;`,
    value: `font-size: 10px; font-weight: 600; color: #111;`,
    detailLabel: `font-size: 10px; color: #6b7280; flex: 0 0 120px;`,
    detailValue: `font-size: 10px; font-weight: 600; color: #111; flex: 1; min-width: 0;`,
    addressValue: `font-size: 10px; font-weight: 600; color: #111; flex: 1; min-width: 0; overflow-wrap: normal; word-break: normal; line-break: auto; hyphens: manual; text-align: start;`,
    infoRow: `margin-bottom: 4px; display: flex; align-items: flex-start;`,

    // Table
    table: `width: 100%; border-collapse: collapse; margin: 15px 0;`,
    th: `background-color: ${brandColor}; color: white; padding: 8px; font-size: 9px; text-transform: uppercase; border: none;`,
    td: `padding: 8px; font-size: 10px; border-bottom: 1px solid #eee; color: #333;`,

    // Totals
    totalBox: `display: flex; flex-direction: column; align-items: flex-end; margin-top: 10px;`,
    totalRow: `width: 200px; display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px;`,
    grandTotal: `width: 200px; display: flex; justify-content: space-between; padding: 8px 0; margin-top: 5px; border-top: 2px solid #333; font-size: 13px; font-weight: 800;`,

    // WorldPay button
    payrixWrap: `padding: 0 2px;`,
    payrixBtn: `display:inline-block; background-color:${brandColor}; color:white; padding:10px 16px; border-radius:6px; font-size:10px; font-weight:700; text-decoration:none;`
  };

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { box-sizing: border-box; }
        ${styles.body}
    .address-text,
    .address-block,
    .addr-text {
      overflow-wrap: normal;
      word-break: normal;
      line-break: auto;
      hyphens: manual;
     
    }
    @media print {
      /* PDF: the page box is already A4, so a 297mm min-height overflows onto a blank page; 12px also put the content against the paper edge */
      .ndis-page { min-height: auto !important; padding-left: 24px !important; padding-right: 24px !important; }
    }
  </style>
</head>
<body style="${styles.body}">
    <div style="${styles.topBar}"></div>
    
    <div class="ndis-page" style="${styles.page}">
        <div style="${styles.header}">
            <div>
                <div style="display:flex; flex-direction:column; align-items:flex-start;">
      
                  <h1 style="${styles.title}">${showDepositHeading ? `<span style="display:inline-block;background:#4D4DFF;color:#fff;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;vertical-align:middle;margin-right:6px;">${depositHeadingLabel}</span>` : ''}${invoiceTitle(data)}</h1>
                </div>
            </div>
            <div>
                ${generateFitrecLogoBlock(data)}
            </div>
        </div>

        <div style="${styles.gridContainer}">
            <div style="${styles.leftCol}">
                <div style="${styles.card}">
                    <h2 style="${styles.cardTitle}">General Information</h2>
                    <div style="display: flex; gap: 20px;">
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <span style="${styles.label}">Invoice No:</span>
                            <span style="${styles.value}">${data.invoice_no}</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <span style="${styles.label}">Issue Date:</span>
                            <span style="${styles.value}">${formatDate(data.invoice_date)}</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <span style="${styles.label}">Due Date:</span>
                            <span style="${styles.value}">${formatDate(data.due_date)}</span>
                        </div>
                    </div>
                </div>

                <div style="${styles.card}">
                    <h2 style="${styles.cardTitle}">Provider Details</h2>
                    ${showSoleUserName && data?.provider?.provider_name ? `<div style="${styles.infoRow}"><span style="${styles.detailLabel}">Trading Name:</span><span style="${styles.detailValue}">${escapeHtml(data.provider.provider_name)}</span></div>` : ''}
                    ${showSoleBusinessName && data?.provider?.company_name ? `<div style="${styles.infoRow}"><span style="${styles.detailLabel}">Company:</span><span style="${styles.detailValue}">${escapeHtml(data.provider.company_name)}</span></div>` : ''}
                    ${
                      showSoleBusinessAbn
                        ? providerIdentifiers(data)
                            .map((id) => `<div style="${styles.infoRow}"><span style="${styles.detailLabel}">${id.label}:</span><span style="${styles.detailValue}">${id.value}</span></div>`)
                            .join('')
                        : ''
                    }
                    ${data?.provider?.ndis_no ? `<div style="${styles.infoRow}"><span style="${styles.detailLabel}">NDIS Number:</span><span style="${styles.detailValue}">${escapeHtml(data.provider.ndis_no)}</span></div>` : ''}
                    ${data?.provider?.email ? `<div style="${styles.infoRow}"><span style="${styles.detailLabel}">Email:</span><span style="${styles.detailValue}">${escapeHtml(data.provider.email)}</span></div>` : ''}
                    ${showSoleBusinessAddress && data?.provider?.address ? `<div style="${styles.infoRow}"><span style="${styles.detailLabel}">Address:</span><span style="${styles.addressValue}">${escapeHtml(data.provider.address)}</span></div>` : ''}
                </div>

                <div style="${styles.card}">
                    <h2 style="${styles.cardTitle}">Participant Details</h2>
                    ${showCustomerName && data?.participant?.participant_name ? `<div style="${styles.infoRow}"><span style="${styles.detailLabel}">Name:</span><span style="${styles.detailValue}">${escapeHtml(data.participant.participant_name)}</span></div>` : ''}

                     ${showCustomerBusiness && data?.participant?.company_name ? `<div style="${styles.infoRow}"><span style="${styles.detailLabel}">Company:</span><span style="${styles.detailValue}">${escapeHtml(data.participant.company_name)}</span></div>` : ''}

                    ${data?.participant?.ndis_no ? `<div style="${styles.infoRow}"><span style="${styles.detailLabel}">NDIS Number:</span><span style="${styles.detailValue}">${escapeHtml(data.participant.ndis_no)}</span></div>` : ''}

                    ${showCustomerAddress && data?.participant?.address ? `<div style="${styles.infoRow}"><span style="${styles.detailLabel}">Address:</span><span style="${styles.addressValue}">${escapeHtml(data.participant.address)}</span></div>` : ''}

                    ${showCustomerPhone && data?.participant?.phone_no ? `<div style="${styles.infoRow}"><span style="${styles.detailLabel}">Phone:</span><span style="${styles.detailValue}">${escapeHtml(data.participant.phone_no)}</span></div>` : ''}

                    ${showCustomerAbn && data?.participant?.abn ? `<div style="${styles.infoRow}"><span style="${styles.detailLabel}">${customerIdLabel(data)}:</span><span style="${styles.detailValue}">${escapeHtml(data.participant.abn)}</span></div>` : ''}
                </div>
            </div>

            <div style="${styles.rightCol}">
                ${
                  hasPlanManager
                    ? `
                <div style="${styles.card}">
                    <h2 style="${styles.cardTitle}">Plan Manager</h2>
                    ${
                      data?.plan_manager?.plan_manager_name
                        ? `
                    <div style="margin-bottom: 8px;">
                        <div style="font-size: 9px; color: #9ca3af;">MANAGER NAME</div>
                        <div style="font-size: 10px; font-weight: 700;">${escapeHtml(data.plan_manager.plan_manager_name)}</div>
                    </div>
                    `
                        : ''
                    }
                    ${
                      data?.plan_manager?.plan_manager_ndis
                        ? `
                    <div>
                        <div style="font-size: 9px; color: #9ca3af;">NDIS NUMBER</div>
                        <div style="font-size: 10px; font-weight: 700;">${escapeHtml(data.plan_manager.plan_manager_ndis)}</div>
                    </div>
                    `
                        : ''
                    }
                </div>
                `
                    : ''
                }

                ${
                  showPayment
                    ? `
                <div style="${styles.card}">
                    <h2 style="${styles.cardTitle}">Payment Details</h2>
                    ${data?.payment?.account_name ? `<div style="${styles.infoRow}"><span style="font-size:9px; width:70px; color:#6b7280;">Bank:</span><span style="font-size:10px;">${escapeHtml(data.payment.account_name)}</span></div>` : ''}
                    ${bankBranch(data) ? `<div style="${styles.infoRow}"><span style="font-size:9px; width:70px; color:#6b7280;">${bankBranchLabel(data)}:</span><span style="font-size:10px;">${escapeHtml(data.payment.bsb)}</span></div>` : ''}
                    ${data?.payment?.account_number ? `<div style="${styles.infoRow}"><span style="font-size:9px; width:70px; color:#6b7280;">Account:</span><span style="font-size:10px;">${escapeHtml(data.payment.account_number)}</span></div>` : ''}
                </div>
                `
                    : ''
                }

                ${
                  data.isPayrix || data.ispayrix || data.isStripe
                    ? `
                <div style="${styles.payrixWrap}">
                    <a href="${payLink}" target="_blank" style="${styles.payrixBtn}">${data.isStripe ? 'Pay via Stripe' : 'Pay via WorldPay'}</a>
                </div>
                `
                    : ''
                }

                ${
                  showPayment
                    ? `
                <div style="padding: 5px 10px;">
                    ${paymentDetails?.map((item) => `<p style="font-size:9px; color:#9ca3af; margin:0; line-height:1.4;">• ${item}</p>`).join('') || ''}
                </div>
                `
                    : ''
                }
            </div>
        </div>

         ${
           data.description
             ? `
         <div style="margin: 0px 0 8px;">
          <div style="font-size: 12px; color: #111827; font-weight: 500; margin-bottom: 4px;">Invoice Description:</div>
          <div style="background: #fafafa; padding: 6px; border-radius: 6px; font-size: 10px; color: #333; white-space: pre-wrap;">${escapeHtml(data.description)}</div>
         </div>
        `
             : ''
         }

        <table style="${styles.table}">
            <thead>
                <tr>
                    <th style="${styles.th}; text-align: left; border-radius: 4px 0 0 4px;">Date</th>
                    <th style="${styles.th}">Support Item No</th>
                    <th style="${styles.th}">Claim Type</th>
                    <th style="${styles.th}; text-align: left; width: 40%;">Description</th>
                    <th style="${styles.th}">Qty</th>
                    ${branding.showQtyType ? `<th style="${styles.th}">Qty Type</th>` : ''}
                    <th style="${styles.th}">Rate</th>
                    ${data.invoice_item?.some((i) => i.discount) ? `<th style="${styles.th}">Discount</th>` : ''}
                    ${showLineGst ? `<th style="${styles.th}">${taxLabel(data)}</th>` : ''}
                    <th style="${styles.th}; text-align: right; border-radius: 0 4px 4px 0;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${data.invoice_item
                  ?.map(
                    (item) => `
                <tr>
                    <td style="${styles.td}">${formatDate(item.date)}</td>
                    <td style="${styles.td}; text-align: center; color: #6b7280;">${escapeHtml(item.item_support_no || '--')}</td>
                    <td style="${styles.td}; text-align:center; padding:10px;">${escapeHtml(item.claim_type || '--')}</td>
                    <td style="${styles.td}">${escapeHtml(item.description)}</td>
                    <td style="${styles.td}; text-align: center;">${item.qty}</td>
                    ${branding.showQtyType ? `<td style="${styles.td}; text-align: center;">${formatQtyType(item.qty_type)}</td>` : ''}
                    <td style="${styles.td}; text-align: center;">${formatCurrency(item.unit_price, data)}</td>
                    ${data.invoice_item?.some((i) => i.discount) ? `<td style="${styles.td}; text-align: center;">${typeof item.discount === 'string' ? item.discount : formatCurrency(item.discount || 0, data)}</td>` : ''}
                    ${showLineGst ? `<td style="${styles.td}; text-align: center;">${lineHasGst(item) ? formatCurrency(item.gst_amount || 0, data) : '--'}</td>` : ''}
                    <td style="${styles.td}; text-align: right; font-weight: 700;">${formatCurrency(item.total, data)}</td>
                </tr>
                `
                  )
                  .join('')}
            </tbody>
        </table>

        <div style="${styles.totalBox}">
            <div style="${styles.totalRow}">
                <span style="color: #6b7280;">Subtotal:</span>
                <span>${formatCurrency(data?.sub_total, data)}</span>
            </div>

            ${
              showContentOnValue(data?.total_gst)
                ? `
                    <div style="${styles.totalRow}">
                        <span style="color: #6b7280;">${taxLabel(data)}:</span>
                        <span class="total-value">${formatCurrency(data.total_gst, data)}</span>
                    </div>
                  `
                : ''
            }

            ${
              showContentOnValue(data?.extra_discount)
                ? `
                    <div style="${styles.totalRow}">
                        <span class="total-label">Extra Discount</span>
                        <span class="total-value">${formatCurrency(data.extra_discount, data)}</span>
                    </div>
                  `
                : ''
            }

            <div style="${styles.grandTotal}">
                <span>TOTAL DUE</span>
                <span style="color: ${brandColor};">${formatCurrency(data.total, data)}</span>
            </div>
            ${
              isDepositInvoice && data?.deposit_status !== 'paid'
                ? `
            <div style="${styles.totalRow}">
                <span class="total-label">Deposit requested</span>
                <span class="total-value">${formatCurrency(data.deposit_amount, data)}</span>
            </div>
            <div style="${styles.totalRow}">
                <span class="total-label">Deposit due</span>
                <span class="total-value">${formatDate(data.deposit_due_date)}</span>
            </div>
                  `
                : ''
            }
            ${
              showDepositSummary
                ? `
            <div style="${styles.totalRow}">
                <span class="total-label">Deposit paid</span>
                <span class="total-value">${formatCurrency(data.deposit_paid_amount, data)}</span>
            </div>
            <div style="${styles.totalRow}">
                <span class="total-label">Remaining amount</span>
                <span class="total-value">${formatCurrency(depositRemainingAmount, data)}</span>
            </div>
                  `
                : ''
            }
        </div>
${generateExchangeRateSection(data)}
        ${generatePaidStamp(isReceipt || hasPaid || isFullyPaidInvoice)}
        <!-- Notes Section -->
         ${
           data.notes
             ? `
          <div style="background:#fafafa; padding:20px; border-radius:8px; font-size:12px; margin-bottom:16px;">
           <span style="font-weight: 500;">Notes:</span><br/>
               ${escapeHtml(data.notes)}
          </div>
         `
             : ''
         }  



      <div class="doc-footer doc-footer-flow" style="${showFooter ? 'display: block;' : 'display: none;'} position: relative; width: 100%; padding: 10px; box-sizing: border-box;">
      <div style="display: flex; justify-content: space-between; align-items: center; background-color: #fafafa; padding: 16px; border-radius: 8px;">
         ${effectiveInvoiceNote ? `<div style="font-size: 10px; font-weight: 600; color: #6b7280;">${escapeHtml(effectiveInvoiceNote)}</div>` : ''}
         ${hasSocialLinks ? `<div style="display: flex; gap: 15px; margin-left: auto;">{SOCIAL_MEDIA_LINKS}</div>` : ''}
      </div>
    </div>
    
    </div>
</body>
</html>`
    .replace(/\{BRAND_COLOR\}/g, brandColor)
    .replace(/\{CONTENT_COLOR\}/g, contentColor)
    .replace(/\{SOCIAL_MEDIA_LINKS\}/g, socialMediaLinks);
};

export default NdisThreeTemplate;
