/**
 * Quick Actions' Get paid actions — send, follow up, convert — in one place.
 *
 * The Get paid card and the "Today" deck both run them, so they share this:
 * the same API call and the same analytics event for the same action, wherever
 * it's pressed. Resolves with the server's message ("" when it sent none) or
 * throws its error.
 */
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/analytics-events";
import { sendInvoiceReminderApi } from "@/lib/invoices";
import {
  convertUniboxQuoteWithIdApi,
  sendUniboxInvoiceApi,
  sendUniboxQuoteApi,
  toNumber,
  type UniboxInvoice,
  type UniboxQuote,
} from "@/lib/unibox";
import { quoteIdOf, type GetPaidActionKey } from "@/lib/unibox-rules";

const clientIdOf = (row: UniboxInvoice | UniboxQuote) =>
  row.client?.id == null ? null : String(row.client.id);

export async function runGetPaidAction(
  key: GetPaidActionKey,
  row: UniboxInvoice | UniboxQuote,
): Promise<string> {
  switch (key) {
    case "follow_up":
      await sendInvoiceReminderApi(String(row.id));
      return "";

    case "send_invoice": {
      const message = await sendUniboxInvoiceApi(row.id);
      track(EVENTS.INVOICE_SENT, {
        invoice_id: String(row.id),
        amount: toNumber(row.total),
        client_id: clientIdOf(row),
        is_recurring: false,
        source: "quick_actions",
      });
      return message;
    }

    case "send_quote":
    case "send_quote_again": {
      const quoteId = quoteIdOf(row as UniboxQuote);
      const message = await sendUniboxQuoteApi(quoteId);
      track(EVENTS.QUOTE_SENT, {
        quote_id: String(quoteId),
        amount: toNumber(row.total),
        client_id: clientIdOf(row),
        is_recurring: false,
        source: "quick_actions",
      });
      return message;
    }

    case "convert_quote": {
      const converted = await convertUniboxQuoteWithIdApi(row as UniboxQuote);
      track(EVENTS.INVOICE_CREATED, {
        invoice_id: converted.invoiceId,
        amount: toNumber(row.total),
        client_id: clientIdOf(row),
        is_converted_from_quote: true,
        source: "quick_actions",
      });
      return converted.message;
    }
  }
}
