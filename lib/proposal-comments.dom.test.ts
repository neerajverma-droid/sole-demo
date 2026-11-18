// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { locateQuote, offsetsOfRange, placementOf, rangeFromOffsets, textMapOf } from "@/lib/proposal-comments";

/**
 * Selecting text on the public link and highlighting it again later: the page's
 * text nodes are mapped to whitespace-squashed text and back to DOM Ranges.
 */
const page = (html: string) => {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.replaceChildren(container);
  return container;
};

describe("highlighting a thread's quote on the page", () => {
  it("finds a quote that spans elements and odd spacing, and ranges over exactly those words", () => {
    const container = page("<h1>Services</h1>\n  <p>Monthly   <strong>bookkeeping</strong> for $440</p>");
    const map = textMapOf(container);
    const at = locateQuote(map.text, "Monthly bookkeeping", null);
    expect(at).not.toBeNull();
    const range = rangeFromOffsets(map, at!.start, at!.end);
    expect(range?.toString().replace(/\s+/g, " ")).toBe("Monthly bookkeeping");
  });

  it("turns a client's selection into the stored quote and context, which finds it again", () => {
    const container = page("<p>Annual returns $900.</p><p>Monthly bookkeeping $440.</p><p>Monthly bookkeeping later.</p>");
    const second = container.querySelectorAll("p")[2].firstChild as Text;
    const selection = document.createRange();
    selection.setStart(second, 0);
    selection.setEnd(second, "Monthly bookkeeping".length);

    const map = textMapOf(container);
    const offsets = offsetsOfRange(map, selection)!;
    const { quote, anchor } = placementOf(map.text, offsets.start, offsets.end);
    expect(quote).toBe("Monthly bookkeeping");

    // The same words earlier on the page don't steal the highlight.
    const again = locateQuote(map.text, quote, anchor)!;
    expect(again.start).toBe(offsets.start);
    expect(rangeFromOffsets(map, again.start, again.end)?.startContainer).toBe(second);
  });

  it("ignores a selection outside the page", () => {
    const container = page("<p>Inside</p>");
    const outside = document.createTextNode("Outside");
    document.body.append(outside);
    const selection = document.createRange();
    selection.setStart(outside, 0);
    selection.setEnd(outside, 3);
    expect(offsetsOfRange(textMapOf(container), selection)).toBeNull();
  });
});
