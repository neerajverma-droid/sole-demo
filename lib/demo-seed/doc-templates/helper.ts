/* eslint-disable */
// @ts-nocheck
// Ported mechanically from sole-ocr (CommonJS -> ESM). Kept verbatim on purpose: fidelity with the real
// invoice/quote layouts matters more than style here.
// imports + require
// The real formatFooterPhone parses with libphonenumber; the demo prints the number as typed.
const formatFooterPhone = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return { display: raw, href: digits ? `${raw.startsWith('+') ? '+' : ''}${digits}` : '' };
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// DD MMM YYYY like the real helper, without a date library. A bare YYYY-MM-DD is read as a local date.
const formatDayMonthYear = (value) => {
  const text = String(value);
  const plain = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const date = plain ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])) : new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

/**
 * HTML-escapes a value before it's interpolated into a template. Invoice
 * notes, item descriptions, client/business names and similar free text are
 * user input, and they land in two places that matter: a Puppeteer page
 * rendered to PDF, and an outbound HTML email. Escaping every such field at
 * the point it's written into HTML is what stops a client name or a line
 * item description containing markup from being rendered as markup instead
 * of text — an unescaped <iframe src="file:///etc/passwd"> in an invoice's
 * notes would draw that file's contents into the PDF the recipient
 * downloads, and the same string reaching an email client is stored XSS.
 */
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * The unit a line is measured in, as the "Qty Type" column prints it: Hours, Items, Days, Km...
 * Returned HTML-escaped. Same wording the general invoice uses; a line with no unit reads as Items. The NDIS templates
 * show this column only when the business has "Show quantity type" switched on in Sales settings,
 * exactly like the general templates.
 */
const formatQtyType = (qtyType) => {
  const raw = String(qtyType ?? '').trim();
  if (!raw) {
    return 'Items';
  }
  const label = raw.toLowerCase() === 'km' ? 'Km' : raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return escapeHtml(label);
};

/* Helper Functions */

// Generate social media links HTML
const generateSocialMediaLinks = (brandingData) => {
  if (!brandingData) return '';

  const iconMap = {
    website: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4d4dff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
    phone: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4d4dff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`,
    facebook: `<svg width="22" height="22" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M48 24C48 10.7453 37.2547 0 24 0C10.7453 0 0 10.7453 0 24C0 35.255 7.74912 44.6995 18.2026 47.2934V31.3344H13.2538V24H18.2026V20.8397C18.2026 12.671 21.8995 8.8848 29.9194 8.8848C31.44 8.8848 34.0637 9.18336 35.137 9.48096V16.129C34.5706 16.0694 33.5866 16.0397 32.3645 16.0397C28.4294 16.0397 26.9088 17.5306 26.9088 21.4061V24H34.7482L33.4013 31.3344H26.9088V47.8243C38.7926 46.3891 48.001 36.2707 48.001 24H48Z" fill="#0866FF"/></svg>`,
    instagram: `<svg width="22" height="22" viewBox="0 0 134 134" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M110.116 31.0217C110.116 26.599 106.531 23.028 102.125 23.028C97.7189 23.028 94.1313 26.599 94.1313 31.0217C94.1313 35.4281 97.7189 38.9991 102.125 38.9991C106.531 38.9991 110.116 35.4281 110.116 31.0217Z" fill="url(#ig1)"/><path d="M120.763 93.42C120.467 99.9079 119.382 103.433 118.481 105.774C117.271 108.878 115.828 111.098 113.486 113.426C111.171 115.754 108.952 117.194 105.848 118.391C103.506 119.305 99.9681 120.394 93.4805 120.703C86.4666 121.012 84.3883 121.078 66.602 121.078C48.8322 121.078 46.7374 121.012 39.7235 120.703C33.2359 120.394 29.7142 119.305 27.3727 118.391C24.2522 117.194 22.0492 115.754 19.7211 113.426C17.3764 111.098 15.933 108.878 14.7393 105.774C13.8382 103.433 12.7368 99.9079 12.4571 93.42C12.1153 86.4061 12.0526 84.2951 12.0526 66.545C12.0526 48.7587 12.1153 46.6639 12.4571 39.65C12.7368 33.1624 13.8382 29.6406 14.7393 27.2795C15.933 24.1787 17.3764 21.9722 19.7211 19.6441C22.0492 17.3194 24.2522 15.8757 27.3727 14.6658C29.7142 13.7484 33.2359 12.6763 39.7235 12.3673C46.7374 12.058 48.8322 11.9791 66.602 11.9791C84.3883 11.9791 86.4666 12.058 93.4805 12.3673C99.9681 12.6763 103.506 13.7484 105.848 14.6658C108.952 15.8757 111.171 17.3194 113.486 19.6441C115.828 21.9722 117.271 24.1787 118.481 27.2795C119.382 29.6406 120.467 33.1624 120.763 39.65C121.089 46.6639 121.168 48.7587 121.168 66.545C121.168 84.2951 121.089 86.4061 120.763 93.42ZM132.743 39.1042C132.417 32.0146 131.299 27.171 129.638 22.9523C127.948 18.5755 125.683 14.8663 121.973 11.1571C118.281 7.46446 114.572 5.19875 110.195 3.48894C105.96 1.84471 101.132 0.713455 94.0393 0.404434C86.9465 0.0623779 84.681 0 66.602 0C48.5395 0 46.2575 0.0623779 39.1647 0.404434C32.0881 0.713455 27.2642 1.84471 23.0093 3.48894C18.649 5.19875 14.9398 7.46446 11.2472 11.1571C7.538 14.8663 5.27229 18.5755 3.56567 22.9523C1.92145 27.171 0.803515 32.0146 0.461452 39.1042C0.152436 46.197 0.0735168 48.466 0.0735168 66.545C0.0735168 84.6075 0.152436 86.873 0.461452 93.9658C0.803515 101.042 1.92145 105.883 3.56567 110.121C5.27229 114.481 7.538 118.207 11.2472 121.9C14.9398 125.592 18.649 127.875 23.0093 129.581C27.2642 131.225 32.0881 132.343 39.1647 132.669C46.2575 132.995 48.5395 133.073 66.602 133.073C84.681 133.073 86.9465 132.995 94.0393 132.669C101.132 132.343 105.96 131.225 110.195 129.581C114.572 127.875 118.281 125.592 121.973 121.9C125.683 118.207 127.948 114.481 129.638 110.121C131.299 105.883 132.417 101.042 132.743 93.9658C133.068 86.873 133.147 84.6075 133.147 66.545C133.147 48.466 133.068 46.197 132.743 39.1042Z" fill="url(#ig2)"/><path d="M66.602 88.7046C54.3597 88.7046 44.4258 78.787 44.4258 66.5447C44.4258 54.2827 54.3597 44.3523 66.602 44.3523C78.8477 44.3523 88.7947 54.2827 88.7947 66.5447C88.7947 78.787 78.8477 88.7046 66.602 88.7046ZM66.602 32.3566C47.7305 32.3566 32.4467 47.6733 32.4467 66.5447C32.4467 85.3999 47.7305 100.7 66.602 100.7C85.4734 100.7 100.774 85.3999 100.774 66.5447C100.774 47.6733 85.4734 32.3566 66.602 32.3566Z" fill="url(#ig3)"/><defs><linearGradient id="ig1" x1="1.27" y1="131" x2="122" y2="10" gradientUnits="userSpaceOnUse"><stop stop-color="#FFD521"/><stop offset="0.5" stop-color="#F50000"/><stop offset="1" stop-color="#B900B4"/></linearGradient><linearGradient id="ig2" x1="1.27" y1="131" x2="122" y2="10" gradientUnits="userSpaceOnUse"><stop stop-color="#FFD521"/><stop offset="0.5" stop-color="#F50000"/><stop offset="1" stop-color="#B900B4"/></linearGradient><linearGradient id="ig3" x1="1.3" y1="131" x2="122" y2="11" gradientUnits="userSpaceOnUse"><stop stop-color="#FFD521"/><stop offset="0.5" stop-color="#F50000"/><stop offset="1" stop-color="#B900B4"/></linearGradient></defs></svg>`,
    linkedin: `<svg width="22" height="22" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M44.4567 0H3.54333C1.58 0 0 1.58 0 3.54333V44.4567C0 46.42 1.58 48 3.54333 48H44.4567C46.42 48 48 46.42 48 44.4567V3.54333C48 1.58 46.42 0 44.4567 0ZM14.3067 40.89H7.09V17.9667H14.3067V40.89ZM10.6933 14.79C8.42 14.79 6.58 12.94 6.58 10.65C6.58 8.36 8.42 6.51 10.6933 6.51C12.97 6.51 14.81 8.36 14.81 10.65C14.81 12.94 12.97 14.79 10.6933 14.79ZM40.9067 40.91H33.6933V28.3867C33.6933 24.6933 32.1233 23.5533 30.0967 23.5533C27.9567 23.5533 25.8567 25.1667 25.8567 28.48V40.91H18.64V17.9833H25.58V21.16H25.6733C26.37 19.75 28.81 17.34 32.5333 17.34C36.56 17.34 40.91 19.73 40.91 26.73L40.9067 40.91Z" fill="#0A66C2"/></svg>`,
    tiktok: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"></path></svg>`
  };

  const links = [];
  const addLink = (enabled, url, icon) => {
    if (enabled && url) {
      links.push(`<a href="${url}" target="_blank" class="social-link" rel="noopener noreferrer">${icon}</a>`);
    }
  };
  // The footer phone prints as text next to its icon (`+61 412 345 678`), tel: link in E.164.
  // Tolerates old stored values that kept the trunk 0 (`+610412345678`).
  const addPhone = (enabled, value) => {
    const phone = enabled ? formatFooterPhone(value) : null;
    if (!phone) return;
    const href = escapeHtml(`tel:${phone.href}`);
    links.push(`<a href="${href}" class="social-link" rel="noopener noreferrer">${iconMap.phone}</a>`);
    links.push(
      `<a href="${href}" class="social-phone-text" rel="noopener noreferrer" style="display:inline-flex;align-items:center;white-space:nowrap;color:inherit;text-decoration:none;font-size:12px;">${escapeHtml(phone.display)}</a>`
    );
  };

  addLink(brandingData.website_enabled, brandingData.website, iconMap.website);
  addPhone(brandingData.phone_enabled, brandingData.phone_no || brandingData.phone);
  addLink(brandingData.facebook_url_enabled, brandingData.facebook_url, iconMap.facebook);
  addLink(brandingData.instagram_url_enabled, brandingData.instagram_url, iconMap.instagram);
  addLink(brandingData.linkedin_url_enabled, brandingData.linkedin_url, iconMap.linkedin);
  addLink(brandingData.tiktok_url_enabled, brandingData.tiktok_url, iconMap.tiktok);

  return links.join('');
};

// Format date to 'DD MMM YYYY'
const formatDate = (dateString) => {
  if (!dateString) return '--';
  return formatDayMonthYear(dateString);
};

// Format amount to currency string
const CURRENCY_SYMBOLS = {
  AUD: '$',
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
  CNY: '¥',
  CAD: 'C$',
  NZD: 'NZ$',
  SGD: 'S$',
  HKD: 'HK$',
  AED: 'د.إ',
  MYR: 'RM',
  PHP: '₱',
  KRW: '₩',
  THB: '฿',
  IDR: 'Rp',
  ZAR: 'R',
  PKR: '₨'
};

const normalizeCurrencyCode = (code) =>
  String(code || '')
    .trim()
    .toUpperCase();

/** The symbol a currency has in its own country's usage: "$" for AUD in en-AU and NZD in en-NZ, "R" for ZAR. */
const localCurrencySymbol = (currencyCode, locale = 'en-AU') => {
  try {
    const parts = new Intl.NumberFormat(locale || 'en-AU', { style: 'currency', currency: currencyCode, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value || `${currencyCode} `;
  } catch {
    return `${currencyCode} `;
  }
};

/**
 * What goes before a figure in `currencyCode` on a document of a business whose books are in
 * `baseCurrency`. The business's own currency gets its local symbol ("$" in AU, "NZ$" in NZ,
 * "R" in ZA); AUD anywhere else says whose dollar it is; every other currency keeps its glyph
 * or code. Australian output is unchanged: AUD is its base, so it stays "$".
 *
 * `registrySymbol` is what a super admin set on the country, and it wins for the business's OWN
 * currency. It is the only source every surface shares — the worksheet, the spreadsheet and this
 * PDF all read it — and without it the three disagreed: Intl gives a bare "$" for NZD in en-NZ
 * while the map below says "NZ$". It applies to the base currency only; a foreign-currency line
 * still falls back, because a super admin sets what their own country calls its money, not what
 * every currency on earth looks like.
 */
const currencyPrefix = (currencyCode, baseCurrency = 'AUD', locale = 'en-AU', registrySymbol = null) => {
  const base = normalizeCurrencyCode(baseCurrency) || 'AUD';
  const code = normalizeCurrencyCode(currencyCode) || base;
  if (code === base) return String(registrySymbol || '').trim() || localCurrencySymbol(code, locale);
  if (code === 'AUD') return 'A$';
  return CURRENCY_SYMBOLS[code] || `${code} `;
};

/** The totals-section prefix, which has always spelled US dollars out as "USD $". */
const totalSectionPrefix = (currencyCode, baseCurrency = 'AUD', locale = 'en-AU', registrySymbol = null) => {
  const code = normalizeCurrencyCode(currencyCode);
  if (code === 'USD' && code !== normalizeCurrencyCode(baseCurrency)) return 'USD $';
  return currencyPrefix(code, baseCurrency, locale, registrySymbol);
};

const formatWithPrefix = (amount, prefix) => {
  if (typeof amount === 'string') {
    const trimmedAmount = amount.trim();
    const isPlainNumeric = /^-?\d[\d,]*(\.\d+)?$/.test(trimmedAmount);
    if (trimmedAmount && !isPlainNumeric) {
      return trimmedAmount;
    }
  }

  const parsedAmount = parseFloat(amount || 0);
  const safeAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  return `${prefix}${safeAmount.toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const formatCurrencyByCode = (amount, currencyCode = 'AUD') => formatWithPrefix(amount, CURRENCY_SYMBOLS[currencyCode] || `${currencyCode} `);

/**
 * A figure in the business's own currency. `data.base_currency` and `data.country.locale` are set
 * from the business's country before every render, so a South African document prints "R".
 * Already-formatted strings (a multi-currency document's figures) pass through untouched.
 */
const formatCurrency = (amount, data = null) => formatWithPrefix(amount, currencyPrefix(data?.base_currency, data?.base_currency, data?.country?.locale));

const parseAmountForComparison = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9.-]/g, '');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getDisplayInvoiceTotals = (data = {}) => {
  // The business's own currency (set from its country before every render). A document in any other
  // currency — including AUD, for a New Zealand business — is a multi-currency one.
  const baseCurrency = data?.base_currency || 'AUD';
  const isMultiCurrency = Number(data?.is_multicurrency) === 1 && data?.currency_code && data.currency_code !== baseCurrency;

  if (!isMultiCurrency) {
    return {
      currencyCode: 'AUD',
      subtotal: Number(data?.sub_total ?? 0),
      discount: Number(data?.total_discount ?? 0),
      extraDiscount: Number(data?.extra_discount ?? 0),
      gst: Number(data?.total_gst ?? 0),
      total: Number(data?.total ?? 0),
      audTotal: Number(data?.total ?? 0),
      isMultiCurrency: false,
      exchangeRate: null
    };
  }

  return {
    currencyCode: data.currency_code,
    subtotal: Number(data?.exchange_sub_total ?? data?.sub_total ?? 0),
    discount: Number(data?.exchange_total_discount ?? data?.total_discount ?? 0),
    extraDiscount: Number(data?.exchange_extra_discount ?? data?.extra_discount ?? 0),
    gst: Number(data?.exchange_total_gst ?? data?.total_gst ?? 0),
    total: Number(data?.exchange_total ?? data?.total_after_exchange ?? data?.total ?? 0),
    audTotal: Number(data?.total ?? 0),
    baseCurrency,
    isMultiCurrency: true,
    exchangeRate: data?.exchange_rate != null ? Number(data.exchange_rate) : null
  };
};

const buildAmountLine = (label, value, options = {}) => {
  const { rowClass = 'total-row', rowStyle = '', labelClass = '', labelStyle = '', valueClass = '', valueStyle = '', labelSuffix = '', negative = false } = options;

  const prefix = negative ? '-' : '';

  return `
    <div class="${rowClass}" style="${rowStyle}">
      <span class="${labelClass}" style="${labelStyle}">${label}${labelSuffix}</span>
      <span class="${valueClass}" style="${valueStyle}">${prefix}${value}</span>
    </div>
  `;
};

const generateCommonTotalsRows = (data = {}, options = {}) => {
  const totals = getDisplayInvoiceTotals(data);
  const {
    subtotalLabel = 'Subtotal',
    discountLabel = 'Discount',
    extraDiscountLabel = 'Extra Discount',
    taxLabel = 'Tax',
    totalLabel = 'Total',
    showDiscount = true,
    showExtraDiscount = true,
    showTax = true,
    rowClass,
    rowStyle,
    labelClass,
    labelStyle,
    valueClass,
    valueStyle,
    finalRowClass = rowClass ? `${rowClass} final` : 'total-row final',
    finalRowStyle = '',
    finalLabelClass = labelClass,
    finalLabelStyle = labelStyle,
    finalValueClass = valueClass,
    finalValueStyle = valueStyle,
    noteStyle = 'margin-top:8px; font-size:11px; color:#6b7280; text-align:right;',
    extraDiscountNegative = false
  } = options;

  const formatForDisplay = (amount) => formatCurrencyByCode(amount, totals.currencyCode);

  let html = '';
  html += buildAmountLine(subtotalLabel, formatForDisplay(totals.subtotal), {
    rowClass,
    rowStyle,
    labelClass,
    labelStyle,
    valueClass,
    valueStyle
  });

  if (showDiscount && Number(totals.discount) > 0) {
    html += buildAmountLine(discountLabel, formatForDisplay(totals.discount), {
      rowClass,
      rowStyle,
      labelClass,
      labelStyle,
      valueClass,
      valueStyle
    });
  }

  if (showExtraDiscount && Number(totals.extraDiscount) > 0) {
    html += buildAmountLine(extraDiscountLabel, formatForDisplay(totals.extraDiscount), {
      rowClass,
      rowStyle,
      labelClass,
      labelStyle,
      valueClass,
      valueStyle,
      negative: extraDiscountNegative
    });
  }

  if (showTax && Number(totals.gst) > 0) {
    html += buildAmountLine(taxLabel, formatForDisplay(totals.gst), {
      rowClass,
      rowStyle,
      labelClass,
      labelStyle,
      valueClass,
      valueStyle
    });
  }

  html += buildAmountLine(totalLabel, formatForDisplay(totals.total), {
    rowClass: finalRowClass,
    rowStyle: finalRowStyle,
    labelClass: finalLabelClass,
    labelStyle: finalLabelStyle,
    valueClass: finalValueClass,
    valueStyle: finalValueStyle
  });

  if (totals.isMultiCurrency) {
    html += `
      <div style="${noteStyle}">
        Approx. ${totals.baseCurrency} ${totals.baseCurrency === 'AUD' ? formatCurrencyByCode(totals.audTotal, 'AUD').replace(/^\\$/, '') : Number(totals.audTotal).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        ${totals.exchangeRate ? ` at 1 ${totals.baseCurrency} = ${totals.exchangeRate.toFixed(2)} ${totals.currencyCode}` : ''}
      </div>
    `;
  }

  return html;
};

/**
 * The currency a document's own figures are written in, when that isn't the
 * business's base — null otherwise, which keeps the plain "$" a base-currency
 * document has always printed. A flat-amount line discount is in the document's
 * currency, so a rupee quote must not show it as "$500".
 */
const documentCurrencyCode = (data = {}) => (['1', 1, true, 'true'].includes(data?.is_multicurrency) && data?.currency_code ? String(data.currency_code).trim().toUpperCase() : null);

// Format discount based on criteria
const formatDiscount = (criteria, amount, currencyCode = null, data = null) => {
  if (!amount) return '-';

  if (criteria === 'percent' || criteria === '%' || criteria === 'percentage') {
    return `${parseFloat(amount)}%`;
  }
  if (criteria === 'currency') return `${currencyPrefix(currencyCode || data?.base_currency, data?.base_currency, data?.country?.locale)}${parseFloat(amount)}`;
  return formatCurrency(amount, data);
};

// Generate dynamic table content based on discount and GST presence
const generateDynamicTableContent = (data, branding) => {
  if (!data || !data?.invoice_item || data?.invoice_item?.length === 0) {
    return '';
  }

  // Check if any item has a discount
  const hasDiscount = data?.invoice_item?.some((item) => item.discount && parseFloat(item.discount) > 0);

  // Check if any item has GST enabled
  const hasGst = data?.invoice_item?.some((item) => item.isGstEnabled);
  const showGst = hasGst && branding?.showGst === true;
  const showSoleBusinessAddress = branding?.showSoleBusinessAddress;

  // Show qty_type column only when branding flag is enabled
  const hasQtyType = branding?.showQtyType === true;

  // Define column widths based on discount, GST, and qty_type presence
  const columns = {
    description: '30%',
    qty: '10%',
    qtyType: hasQtyType ? '10%' : '0%',
    rate: '10%',
    discount: hasDiscount ? '10%' : '0%',
    gst: showGst ? '10%' : '0%',
    total: '15%'
  };

  // Adjust column widths based on what's hidden
  if (!hasDiscount && !showGst && !hasQtyType) {
    columns.description = '40%';
    columns.qty = '20%';
    columns.rate = '20%';
    columns.total = '20%';
  } else if (!hasDiscount && !showGst && hasQtyType) {
    columns.description = '35%';
    columns.qty = '15%';
    columns.qtyType = '15%';
    columns.rate = '15%';
    columns.total = '20%';
  } else if (!hasQtyType && (!hasDiscount || !showGst)) {
    columns.description = '35%';
    columns.qty = '16%';
    columns.rate = '16%';
    columns.total = '16%';
  } else if (hasQtyType && (!hasDiscount || !showGst)) {
    columns.description = '32%';
    columns.qty = '12%';
    columns.qtyType = '12%';
    columns.rate = '12%';
    columns.total = '17%';
  }

  // Generate table header
  const headerCells = [`<th style="text-align:left; font-weight:800;  width: ${columns.description};">Items</th>`, `<th style="text-align:center; font-weight:800; width: ${columns.qty};">Qty</th>`];

  if (hasQtyType) {
    headerCells.push(`<th style="text-align:center; font-weight:800; width: ${columns.qtyType};">Qty Type</th>`);
  }

  headerCells.push(`<th style="text-align:center; font-weight:800; width: ${columns.rate};">Rate</th>`);

  if (hasDiscount) {
    headerCells.push(`<th style="text-align:center; font-weight:800; width: ${columns.discount};">Discount</th>`);
  }

  if (showGst) {
    headerCells.push(`<th style="text-align:center;font-weight:800; width: ${columns.gst};">${taxLabel(data)}</th>`);
  }

  headerCells.push(`<th style="text-align:end;font-weight:800; width: ${columns.total};">Total</th>`);

  const tableHeader = `
        <thead>
          <tr>
            ${headerCells.join('')}
          </tr>
        </thead>`;

  // Generate table body
  const tableRows = data.invoice_item
    .map((item) => {
      const rowCells = [
        `<td style="text-align:left; width: ${columns.description}; word-wrap: break-word; word-break: break-word; max-width: 250px; white-space: normal; line-height: 1.4;">${escapeHtml(item.description)}</td>`,
        `<td style="text-align:center; width: ${columns.qty};">${item.qty}</td>`
      ];

      if (hasQtyType) {
        rowCells.push(`<td style="text-align:center; width: ${columns.qtyType};">${escapeHtml(item.qty_type || 'items')}</td>`);
      }

      rowCells.push(`<td style="text-align:center; width: ${columns.rate};">${formatCurrency(item.unit_price, data)}</td>`);

      if (hasDiscount) {
        rowCells.push(`<td style="text-align:center; width: ${columns.discount};">${formatDiscount(item.discount_criteria, item.discount, documentCurrencyCode(data), data)}</td>`);
      }

      if (showGst) {
        rowCells.push(`<td style="text-align:center; width: ${columns.gst};">${item.isGstEnabled ? formatCurrency(item.gst_amount, data) : '--'}</td>`);
      }

      rowCells.push(`<td style="font-weight:500; text-align:end; width: ${columns.total};">${formatCurrency(item.total, data)}</td>`);

      return `
          <tr>
            ${rowCells.join('')}
          </tr>`;
    })
    .join('');

  const tableBody = `
        <tbody>
          ${tableRows}
        </tbody>`;

  return `
      <table class="items-table">
        ${tableHeader}
        ${tableBody}
      </table>`;
};
const generateDynamicQuoteTableContent = (data, branding) => {
  if (!data || !data?.quote_items || data?.quote_items?.length === 0) {
    return '';
  }

  // Check if any item has a discount
  const hasDiscount = data?.quote_items?.some((item) => parseFloat(item.discount_amount) > 0 || parseInt(item.discount_percentage) > 0);
  const hasQtyType = branding?.showQtyType === true;
  const hasGst = data?.quote_items?.some((item) => {
    const isGstEnabled = item?.isGstEnabled === true || item?.isGstEnabled === 1 || item?.isGstEnabled === '1';
    return isGstEnabled || parseAmountForComparison(item?.gst_amount) > 0 || Number.parseFloat(item?.gst_percentage || 0) > 0;
  });
  const showGst = hasGst && branding?.showGst === true;
  // Check if any item has GST enabled

  // Define column widths based on discount and GST presence
  const columns = {
    description: '35%',
    qty: '12%',
    qtyType: hasQtyType ? '12%' : '0%',
    gst: showGst ? '12%' : '0%',
    rate: '12%',
    discount: hasDiscount ? '12%' : '0%',
    gst: hasGst ? '12%' : '0%',
    total: '16%'
  };

  // Adjust total column width if discount or GST is hidden
  if (!hasDiscount && !hasGst) {
    columns.qty = '20%';
    columns.rate = '20%';
    columns.total = '20%';
    columns.description = '40%';
  } else if (!hasDiscount || !hasGst) {
    columns.qty = '16%';
    columns.qty_type = '16%';
    columns.rate = '16%';
    columns.total = '16%';
    columns.description = '40%';
  }

  // Generate table header
  const headerCells = [`<th style="text-align:left; width: ${columns.description};">Items</th>`, `<th style="text-align:center; width: ${columns.qty};">Qty</th>`];

  headerCells.push(`<th style="text-align:center; width:${columns.rate};">Rate</th>`);
  if (hasQtyType) {
    headerCells.push(`<th style="text-align:center; width:${columns.qtyType};">Qty Type</th>`);
  }

  if (hasDiscount) {
    headerCells.push(`<th style="text-align:center; width: ${columns.discount};">Discount</th>`);
  }

  if (showGst) {
    headerCells.push(`<th style="text-align:center; width: ${columns.gst};">${taxLabel(data)}</th>`);
  }

  headerCells.push(`<th style="font-weight:500; text-align:end; width: ${columns.total};">Total</th>`);

  const tableHeader = `
        <thead>
          <tr>
            ${headerCells.join('')}
          </tr>
        </thead>`;

  // Generate table body
  const tableRows = data.quote_items
    .map((item) => {
      const rowCells = [
        `<td style="text-align:left; width: ${columns.description}; word-wrap: break-word; word-break: break-word; max-width: 250px; white-space: normal; line-height: 1.4;">${escapeHtml(item.description)}</td>`,
        `<td style="text-align:center; width: ${columns.qty};">${item.qty}</td>`,
        `<td style="text-align:center; width: ${columns.rate};">${formatCurrency(item.unit_price, data)}</td>`
      ];
      if (hasQtyType) {
        rowCells.push(
          `<td style="text-align:center; width:${columns.qtyType};">
      ${escapeHtml(item.qty_type ? item.qty_type.charAt(0).toUpperCase() + item.qty_type.slice(1) : 'Items')}
    </td>`
        );
      }

      if (hasDiscount) {
        const criteria = String(item.discount_criteria || '').toLowerCase();
        const isPercentDiscount = ['percent', '%', 'percentage'].includes(criteria);
        const discountPercentage = parseFloat(item.discount_percentage || 0);
        const discountAmount = parseFloat(item.discount_amount || 0);
        const discountValue = isPercentDiscount ? (discountPercentage > 0 ? discountPercentage : discountAmount) : discountAmount;
        rowCells.push(`<td style="text-align:center; width: ${columns.discount};">${formatDiscount(item.discount_criteria, discountValue, documentCurrencyCode(data), data)}</td>`);
      }

      if (showGst) {
        const itemHasGst =
          item?.isGstEnabled === true || item?.isGstEnabled === 1 || item?.isGstEnabled === '1' || parseAmountForComparison(item?.gst_amount) > 0 || Number.parseFloat(item?.gst_percentage || 0) > 0;
        rowCells.push(`<td style="text-align:center; width: ${columns.gst};">${itemHasGst ? formatCurrency(item.gst_amount, data) : '--'}</td>`);
      }

      rowCells.push(`<td style="font-weight:500; text-align:end; width: ${columns.total};">${formatCurrency(item.total, data)}</td>`);

      return `
          <tr>
            ${rowCells.join('')}
          </tr>`;
    })
    .join('');

  const tableBody = `
        <tbody>
          ${tableRows}
        </tbody>`;

  return `
      <table class="items-table">
        ${tableHeader}
        ${tableBody}
      </table>`;
};

const showContentOnValue = (val = 0) => {
  const numericValue = typeof val === 'string' ? parseFloat(String(val).replace(/[^0-9.-]/g, '')) : Number(val);

  if (numericValue > 0) {
    return true;
  }
  return false;
};

/**
 * Generates the multi-currency exchange rate section HTML.
 * Returns an empty string if the invoice is not a multi-currency invoice.
 *
 * Conditions for display:
 *   - data.exchange_rate must be present and non-null
 *   - data.total_after_exchange must be present and non-null
 *
 * @param {object} data - The invoiceData object passed to each template
 * @returns {string} HTML string or empty string
 */
const generateExchangeRateSection = () => '';

// ─── Fitrec constants ─────────────────────────────────────────────────────────
const FT_LOGO_URL = 'https://fitrec.org/assets/images/Logo-FITREC-BlackBlue.png';
const DUMMY_AVATAR_SVG = `<svg width="80" height="80" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="4" fill="#f0f0f0"/><circle cx="40" cy="30" r="14" fill="#bbb"/><path d="M12 72c0-15.464 12.536-28 28-28s28 12.536 28 28" fill="#bbb"/></svg>`;

/**
 * Renders the logo area in the header for all invoice/quote templates.
 * - Non-fitrec: returns plain logo img (or empty string if no logo).
 * - Fitrec: returns the FitRec branded card with blue strip, logo/profile/dummy, and fitrec_number tag.
 */
const generateFitrecLogoBlock = (data) => {
  if (!data?.is_fitrec) {
    return data?.logo_url ? `<img src="${data.logo_url}" alt="Company Logo" style="height:75px; width:auto; object-fit:contain;" />` : '';
  }

  const logoSrc = data.logo_url || data.fitrec_profile_pic_url;
  const imgContent = logoSrc
    ? `<img crossorigin="anonymous" src="${logoSrc}" alt="Logo"
      style="width:80px; height:80px; object-fit:contain; display:block;" />`
    : DUMMY_AVATAR_SVG;
  const fitrecNumber = data.fitrec_number ? `#${data.fitrec_number}` : '';
  const fitrecUrl = data.fitrec_url || null;
  const displayUrl = fitrecUrl ? fitrecUrl.replace(/^https?:\/\//i, '') : '';
  const truncatedUrl = displayUrl.length > 22 ? displayUrl.slice(0, 22) + '' : displayUrl;

  return `
  <div style="display:inline-flex; flex-direction:column; align-items:center;">
    
    <div style="display:inline-flex; flex-direction:column; align-items:center; border:1px solid #019cdf; border-radius:10px; overflow:hidden; background:#fff; width:90px;">
      
      <div style="width:100%; background:#019cdf; display:flex; align-items:center; justify-content:center; padding:4px 8px;">
        <span style="font-size:7px; font-weight:700; color:#fff; letter-spacing:0.5px;">
          FITREC MEMBER
        </span>
      </div>

      <div style="width:80px; height:80px; display:flex; align-items:center; justify-content:center; background:#fff;">
        ${imgContent}
      </div>

      ${
        fitrecNumber
          ? `
        <div style="width:100%; text-align:center; font-size:9px; font-weight:700; letter-spacing:1px; color:#019cdf; padding:3px 0; border-top:1px solid rgba(1,156,223,0.2); background:rgba(1,156,223,0.05);">
          ${fitrecNumber}
        </div>`
          : ''
      }

    </div>

    <div style="margin-top:2px; padding:3px 6px; border:0.5px solid #019cdf; border-radius:6px; display:flex; align-items:center; gap:4px; max-width:100px; overflow:hidden;">
      
      <!-- SVG Icon -->
      

${
  fitrecUrl
    ? `
      <a href="${fitrecUrl}" target="_blank"
        style="font-size:9px; color:#019cdf; text-decoration:underline; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">
        ${truncatedUrl}
      </a>
`
    : ''
}
    </div>

  </div>
`;
};

/**
 * Returns a small FitRec logo badge to display above the INVOICE/QUOTE title
 * when the document belongs to a FitRec member. Returns '' otherwise.
 */
const generateFitrecTitleBadge = (data) => {
  if (!data?.is_fitrec) return '';
  return `<img src="${FT_LOGO_URL}" alt="Fitrec" style="height:14px; width:auto; display:block; margin-bottom:4px;" />`;
};

/*
 * Country wording. `data.country`, `data.has_tax`, `data.provider.identifiers`
 * and `data.payment.bank_branch_label` are set by
 * services/country/documentRenderData.js before every render; each helper
 * falls back to the Australian wording for data built without them.
 * Every string returned here is already HTML-escaped.
 */

/** True when the document charges tax, even if its totals are display strings like "NZ$15.00". */
const documentHasTax = (data) => (typeof data?.has_tax === 'boolean' ? data.has_tax : parseAmountForComparison(data?.total_gst) > 0);

/** "TAX INVOICE" when tax is charged by a registered business, otherwise "INVOICE". */
const invoiceTitle = (data) => escapeHtml(documentHasTax(data) ? data?.country?.tax_invoice_title || 'TAX INVOICE' : 'INVOICE');

/** "TAX QUOTE" when tax is charged by a registered business, otherwise "QUOTE". */
const quoteTitle = (data) => escapeHtml(documentHasTax(data) ? data?.country?.tax_quote_title || 'TAX QUOTE' : 'QUOTE');

/** True when a line carries GST: the flag, a GST amount or a GST percentage (invoice and quote lines alike). */
const lineHasGst = (item) =>
  item?.isGstEnabled === true || item?.isGstEnabled === 1 || item?.isGstEnabled === '1' || parseAmountForComparison(item?.gst_amount) > 0 || Number.parseFloat(item?.gst_percentage || 0) > 0;

/** GST / VAT */
const taxLabel = (data) => escapeHtml(data?.country?.tax_label || 'GST');

/** ABN / NZBN / Company registration number */
const businessIdLabel = (data) => escapeHtml(data?.country?.business_id_label || 'ABN');

/** The label printed beside the customer's number. */
const customerIdLabel = (data) => escapeHtml(data?.participant?.identifier_label || data?.country?.customer_id_label || data?.country?.business_id_label || 'ABN');

/**
 * The business's numbers as [{ label, value }]: ABN in Australia, NZBN and GST
 * number in New Zealand, company registration and VAT number in South Africa.
 */
const providerIdentifiers = (data) => {
  const list = Array.isArray(data?.provider?.identifiers) ? data.provider.identifiers : data?.provider?.abn ? [{ label: data?.country?.business_id_label || 'ABN', value: data.provider.abn }] : [];
  return list.filter((item) => item && String(item.value ?? '').trim()).map((item) => ({ label: escapeHtml(item.label), value: escapeHtml(item.value) }));
};

/** "ABN No." / "NZBN No.", but "GST number" rather than "GST number No.". */
const withNumberSuffix = (label, suffix) => (/^[A-Z]{2,6}$/.test(String(label)) ? `${label}${suffix}` : label);

/**
 * BSB / Branch code, or null when the country has no branch field (New
 * Zealand's account number carries its bank and branch) and the row is left out.
 */
const bankBranchLabel = (data) => {
  const country = data?.country;
  const label = data?.payment && 'bank_branch_label' in data.payment ? data.payment.bank_branch_label : country && 'bank_branch_label' in country ? country.bank_branch_label : 'BSB';
  return label ? escapeHtml(label) : null;
};

/** The branch row's { label, value }, or null when there is nothing to print. */
const bankBranch = (data) => {
  const label = bankBranchLabel(data);
  const value = data?.payment?.bsb;
  return label && value ? { label, value: escapeHtml(value) } : null;
};

/**
 * "PAID" stamp for invoices that are paid / receipts. Inline-styled so every template
 * (including ones that build styles as JS objects) can drop it in without CSS changes.
 */
const generatePaidStamp = (show = false) =>
  show
    ? `<div style="display:flex;justify-content:center;align-items:center;margin:18px 0;">
  <div style="display:inline-block;padding:8px 28px;font-size:22px;font-weight:800;color:#28a745;border:3px solid #28a745;border-radius:6px;text-transform:uppercase;letter-spacing:3px;transform:rotate(-8deg);opacity:0.9;">PAID</div>
</div>`
    : '';

export {
  formatQtyType,
  documentHasTax,
  lineHasGst,
  invoiceTitle,
  quoteTitle,
  taxLabel,
  businessIdLabel,
  customerIdLabel,
  providerIdentifiers,
  withNumberSuffix,
  bankBranchLabel,
  bankBranch,
  generateSocialMediaLinks,
  formatDate,
  formatCurrency,
  currencyPrefix,
  totalSectionPrefix,
  formatDiscount,
  documentCurrencyCode,
  generateDynamicTableContent,
  generateDynamicQuoteTableContent,
  showContentOnValue,
  generateCommonTotalsRows,
  generateExchangeRateSection,
  generatePaidStamp,
  generateFitrecLogoBlock,
  generateFitrecTitleBadge,
  escapeHtml
};
