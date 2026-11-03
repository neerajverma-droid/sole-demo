/**
 * businessStorage — read and write the active business ID.
 *
 * Kept as a module so the ~100 lib modules importing it don't all have to
 * change, but it owns nothing any more: `lib/api/business-id.ts` is the single
 * implementation, and it writes both the localStorage key this module used to
 * own and the cookie `lib/api/cookies.ts` used to own separately. See that
 * file for why the two had to be merged.
 */

export {
  getBusinessId,
  setBusinessId,
  clearBusinessId,
} from "@/lib/api/business-id";
