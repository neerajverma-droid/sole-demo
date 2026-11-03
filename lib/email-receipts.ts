/**
 * Email receipts — the address a business forwards receipts to.
 *
 * `GET /inbound-email/receipt-address` is the same endpoint sole-webapp's
 * `EmailReceiptCard` reads. It answers `{ success, receiptEmail }` at the top
 * level (no `data` wrapper, unlike the expense endpoints), and only for a
 * business the signed-in user owns — anyone else gets a 404 rather than
 * another account's address. `business_id` is stamped on the request by the
 * axios client, so nothing here passes it.
 */

import api from "@/utils/axiosInstance";
import apiRoutes from "@/config/api-routes";

type ReceiptAddressResponse = {
  success?: boolean;
  message?: string;
  receiptEmail?: string;
};

export async function fetchReceiptAddress(): Promise<string> {
  const response = await api.get<ReceiptAddressResponse>(
    apiRoutes.inboundEmail.receiptAddress,
  );
  const address = response.data?.receiptEmail?.trim();
  if (!response.data?.success || !address) {
    throw new Error(
      response.data?.message || "Could not load your receipt address.",
    );
  }
  return address;
}
