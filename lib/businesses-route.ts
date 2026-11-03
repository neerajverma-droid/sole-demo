/**
 * Where adding a business happens.
 *
 * Its own module so the switcher can link to the page without importing the
 * screen that renders it — a client component reaching for a route constant
 * shouldn't pull a whole form into its bundle.
 */

/** The add-business page. Step 1 unless the query says otherwise. */
export const NEW_BUSINESS_HREF = "/businesses/new";

/** The Businesses & subscriptions page. */
export const MANAGE_BUSINESSES_HREF = "/businesses";
