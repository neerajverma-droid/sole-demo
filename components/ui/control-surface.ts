/**
 * The one background treatment every form control shares.
 *
 * A field is a hole you type into, not a raised surface: a border, the surface
 * it sits on showing through, and a hairline shadow. Transparent rather than a
 * colour, so a control inherits whatever it's placed on — the same field reads
 * correctly on a card, inside a dialog and on the page background, without
 * anyone picking a token per context.
 *
 * This exists because `bg-background` and `bg-transparent` are the same colour
 * in light mode and different in dark: --background is 3.9% while --card is
 * 7.5%, so a control built from the outline Button variant sat two shades
 * darker than its card, and only in dark mode. Two controls side by side on one
 * form disagreed, and nothing in light mode showed it.
 *
 * Applies to Input, Textarea and the Select trigger, and to the click-to-open
 * field triggers — the client combobox, the industry combobox and the date
 * picker — which are built on Button and would otherwise inherit `outline`'s
 * `bg-background` and its accent hover fill.
 */
export const CONTROL_SURFACE = "border border-input bg-transparent shadow-sm";

/**
 * For controls built on Button. Adds the hover override: `outline` fills with
 * the accent colour on hover, which the Select trigger — the same kind of
 * click-to-open field — doesn't do. Left in, the two would still disagree, just
 * only while the pointer was over them.
 */
export const CONTROL_SURFACE_TRIGGER = `${CONTROL_SURFACE} hover:bg-transparent`;
