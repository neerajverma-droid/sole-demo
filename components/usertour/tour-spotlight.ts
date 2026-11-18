/**
 * A stand-in for the Usertour spotlight that lives across steps.
 *
 * The SDK throws its spotlight away on every step and builds a new one at the
 * next target, with a frame or two of nothing in between. So the cut-out jumps
 * from one section to the next, the dimming blinks off and on as it does, and
 * the hole hugs the target's edges with no room around it. None of that is
 * reachable from the theme: there is no padding setting, and the element it
 * would animate doesn't survive the step.
 *
 * This keeps one element of its own for the life of the tour and copies the
 * SDK's spotlight onto it — position from its box, ring and dim from its
 * computed box-shadow, so the theme still decides the colours. Moving between
 * steps it glides; while the page merely scrolls it follows exactly. The SDK's
 * own spotlight stays in the DOM for its click-blocking curtains and is only
 * hidden, and only while this is mounted (see globals.css), so if this ever
 * stops running the stock spotlight is what's left rather than nothing.
 */

const SOURCE = ".usertour-widget-spotlight";
/** Room between the target's edge and the ring. */
const PAD = 8;
/** How long a move between steps takes — the curve the SDK slides its card on. */
const GLIDE_MS = 450;
const EASE = "cubic-bezier(0.25, 0.8, 0.5, 1)";
/**
 * How long a glide keeps easing after a step change. Long enough to cover the
 * smooth scroll to the next target, which moves the source the whole time.
 */
const GLIDE_WINDOW_MS = 1000;
/** Grace for the gap between one step's spotlight and the next. */
const LINGER_MS = 250;
/**
 * The same grace once Next or Back has been pressed. The SDK tears the whole
 * step down and takes a few hundred milliseconds to mount the next — longer
 * than LINGER_MS — so the dimming used to fade out mid-step and the ring snap
 * to the new target instead of gliding there.
 */
const STEP_GAP_MS = 900;
/**
 * Card buttons that move within the tour rather than end it. `usertour.on()`
 * is a stub in this SDK, so a press on the card is the only signal that a new
 * step is coming rather than the tour closing; anything else keeps the short
 * linger, so Skip tour and Got it still clear the page straight away.
 */
const STEP_BUTTON = /^(next|back)$/i;

/**
 * Stand-ins a step can ask for just by pointing at them. A step whose
 * spotlight lands on `target` switches `data-tour-demo="<value>"` on for as
 * long as it is up, and CSS (globals.css) reveals the matching hidden element.
 * Scripts can't be authored into a tour through the API, and the page can't
 * otherwise tell which step is showing.
 */
const DEMOS = [
  {
    value: "recurring",
    target: 'tbody tr:first-child [data-usertour="invoice-number"]',
  },
];
const DEMO_ATTR = "data-tour-demo";
/** How far the spotlight may sit from the target and still count as on it. */
const DEMO_TOLERANCE = 12;

/** How far the SDK's own box may sit from the real target and still be taken for it. */
const TARGET_SLACK = 48;

/** Hands the spotlight the live target of the current step, once mounted. */
let announceTarget: ((el: Element | null) => void) | null = null;

/**
 * Tells the spotlight which element the current step points at. The SDK hands
 * it to `setCustomScrollIntoView` for every tooltip step, so this is the real
 * element rather than a box the SDK measured once: that box is taken as soon
 * as the target exists and isn't taken again if a button grows when the web
 * font lands or a header re-wraps, which left the ring narrower than the
 * button it was meant to wrap (and the right-hand button of a pair half
 * outside it). Measuring the element itself keeps the ring on it.
 */
export function setTourTarget(el: Element | null) {
  announceTarget?.(el);
}

export function mountTourSpotlight(): () => void {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const ghost = document.createElement("div");
  ghost.className = "sole-tour-spotlight";
  ghost.setAttribute("aria-hidden", "true");
  document.body.appendChild(ghost);
  document.documentElement.setAttribute("data-sole-tour-spotlight", "");

  let source: HTMLElement | null = null;
  let showing = false;
  let glideUntil = 0;
  /** Until when a missing spotlight is taken as a step change, not the end. */
  let stepExpectedUntil = 0;
  const watchedFrames = new WeakSet<HTMLIFrameElement>();
  /** The spotlight whose demo was last decided — once per step, so showing a demo can't flip it back off. */
  let demoDecidedFor: HTMLElement | null = null;
  let lingerTimer: ReturnType<typeof setTimeout> | undefined;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const setDemo = (box: DOMRect | null) => {
    const match = box
      ? DEMOS.find((demo) => {
          const el = document.querySelector(demo.target);
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          return (
            Math.abs(rect.left - box.left) < DEMO_TOLERANCE &&
            Math.abs(rect.top - box.top) < DEMO_TOLERANCE &&
            Math.abs(rect.width - box.width) < DEMO_TOLERANCE &&
            Math.abs(rect.height - box.height) < DEMO_TOLERANCE
          );
        })
      : undefined;
    if (match) document.documentElement.setAttribute(DEMO_ATTR, match.value);
    else document.documentElement.removeAttribute(DEMO_ATTR);
  };

  /** The step's real target, from `setTourTarget`. */
  let target: Element | null = null;
  let lastKey = "";
  let frame = 0;

  const boxKey = (rect: DOMRect) =>
    `${Math.round(rect.left)}|${Math.round(rect.top)}|${Math.round(rect.width)}|${Math.round(rect.height)}`;

  /**
   * The box to ring: the live target when it is the one the SDK is pointing
   * at, otherwise the SDK's own box. "The one the SDK is pointing at" is
   * checked by the SDK box's centre landing on it, so a target left over from
   * an earlier step (or one that is hidden) can't pull the ring away.
   */
  const measure = (from: HTMLElement): DOMRect => {
    const sdkBox = from.getBoundingClientRect();
    if (!target || !target.isConnected) return sdkBox;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return sdkBox;
    const cx = sdkBox.left + sdkBox.width / 2;
    const cy = sdkBox.top + sdkBox.height / 2;
    const onIt =
      cx >= rect.left - TARGET_SLACK &&
      cx <= rect.right + TARGET_SLACK &&
      cy >= rect.top - TARGET_SLACK &&
      cy <= rect.bottom + TARGET_SLACK;
    if (!onIt) return sdkBox;
    return target.hasAttribute("data-tour-scroll")
      ? clipToScrollers(target, rect)
      : rect;
  };

  /**
   * A block taller than the panel it scrolls in runs on under the panel's
   * footer, and a ring drawn at its full height would be laid over the Save
   * and Cancel buttons. Keeps the ring to what is showing, inset by PAD so the
   * ring itself lands on the panel's edge rather than past it.
   */
  const clipToScrollers = (el: Element, rect: DOMRect): DOMRect => {
    let top = rect.top;
    let bottom = rect.bottom;
    for (let node = el.parentElement; node; node = node.parentElement) {
      const { overflowY } = getComputedStyle(node);
      if (overflowY !== "auto" && overflowY !== "scroll") continue;
      const frame = node.getBoundingClientRect();
      top = Math.max(top, frame.top + PAD);
      bottom = Math.min(bottom, frame.bottom - PAD);
    }
    if (bottom <= top) return rect;
    return new DOMRect(rect.left, top, rect.width, bottom - top);
  };

  const sync = () => {
    if (!source) return;
    // A new step's spotlight is mounted before the SDK has placed it — no
    // inset yet, so it sits wherever the stage happens to be — and then
    // starts out invisible until its target is measured. Copying either would
    // blink the dimming off or send the ring off to the bottom of the page, so
    // the previous step's spotlight holds until this one has somewhere to be.
    const placed = source.style.inset !== "" || source.style.top !== "";
    // Never copy an unplaced one: its box is wherever the stage happens to
    // be, which sent the ring to the bottom of the screen for a frame.
    if (!placed) return;
    const hidden = source.style.opacity === "0";
    if (hidden && performance.now() < glideUntil) return;

    const box = measure(source);
    lastKey = boxKey(box);
    if (!hidden && demoDecidedFor !== source) {
      demoDecidedFor = source;
      setDemo(box);
    }
    const gliding = !reducedMotion && performance.now() < glideUntil;
    ghost.style.transition = gliding
      ? ["top", "left", "width", "height"]
          .map((prop) => `${prop} ${GLIDE_MS}ms ${EASE}`)
          .concat("opacity 200ms linear")
          .join(", ")
      : "opacity 200ms linear";
    // In page coordinates, not the viewport's like the source: scrolling then
    // carries the ring along with the page for free, and only a real move —
    // a new target — changes these numbers and gets eased. Fixed coordinates
    // would ease every scroll frame too, and the ring would trail the page.
    ghost.style.top = `${box.top + window.scrollY - PAD}px`;
    ghost.style.left = `${box.left + window.scrollX - PAD}px`;
    ghost.style.width = `${box.width + PAD * 2}px`;
    ghost.style.height = `${box.height + PAD * 2}px`;
    ghost.style.zIndex = source.style.zIndex;
    ghost.style.boxShadow = getComputedStyle(source).boxShadow;
    // Otherwise follow it: the SDK also hides its spotlight while the target
    // is scrolled out of reach.
    ghost.style.opacity = hidden ? "0" : "1";
  };

  // The source's inline style is rewritten as the page scrolls or the step's
  // target resizes; follow every change.
  const sourceObserver = new MutationObserver(sync);

  // The target can change size or move without the SDK noticing (a font
  // swapping in, a header re-wrapping, a dialog's own scroll), and none of
  // that touches the source's style. Look at the target every frame while a
  // step is up and re-ring only when its box actually moved.
  const follow = () => {
    frame = requestAnimationFrame(follow);
    if (!showing || !source || !target) return;
    if (boxKey(measure(source)) !== lastKey) sync();
  };
  frame = requestAnimationFrame(follow);

  announceTarget = (el) => {
    target = el;
    lastKey = "";
    if (source) sync();
  };

  const adopt = (next: HTMLElement | null) => {
    if (next === source) return;
    sourceObserver.disconnect();
    source = next;

    if (!next) {
      demoDecidedFor = null;
      setDemo(null);
      // Probably just the gap between steps. Hold the dimming over it, and
      // only fade out if nothing takes its place.
      const stepping = performance.now() < stepExpectedUntil;
      lingerTimer = setTimeout(
        () => {
          ghost.style.transition = "opacity 200ms linear";
          ghost.style.opacity = "0";
          showing = false;
        },
        stepping ? STEP_GAP_MS : LINGER_MS,
      );
      return;
    }

    clearTimeout(lingerTimer);
    // Arriving from another step glides; the first step of a tour lands where
    // it is, at full strength, so it doesn't fade up after a modal's backdrop
    // has already gone.
    glideUntil = showing ? performance.now() + GLIDE_WINDOW_MS : 0;
    showing = true;
    sync();
    // Once the hold is over, look again: if the new spotlight is still hidden
    // and the SDK doesn't touch it again, nothing else would.
    clearTimeout(settleTimer);
    if (glideUntil) settleTimer = setTimeout(sync, GLIDE_WINDOW_MS + 20);
    sourceObserver.observe(next, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  };

  // A card's content is a same-origin iframe, so its button presses can be
  // heard from here. Hooked again on load, which replaces the document.
  const onCardClick = (event: Event) => {
    const button = (event.target as Element | null)?.closest?.("button");
    if (button && STEP_BUTTON.test(button.textContent?.trim() ?? "")) {
      stepExpectedUntil = performance.now() + STEP_GAP_MS;
    }
  };
  const listen = (frame: HTMLIFrameElement) => {
    frame.contentDocument?.addEventListener("click", onCardClick, true);
  };
  const watchCardFrames = () => {
    document
      .querySelectorAll<HTMLIFrameElement>(".usertour-widget-surface iframe")
      .forEach((frame) => {
        if (watchedFrames.has(frame)) return;
        watchedFrames.add(frame);
        listen(frame);
        frame.addEventListener("load", () => listen(frame));
      });
  };

  // One class lookup per batch of DOM changes, rather than inspecting every
  // node the app adds or removes.
  const domObserver = new MutationObserver(() => {
    adopt(document.querySelector<HTMLElement>(SOURCE));
    watchCardFrames();
  });
  domObserver.observe(document.body, { childList: true, subtree: true });
  adopt(document.querySelector<HTMLElement>(SOURCE));

  return () => {
    cancelAnimationFrame(frame);
    announceTarget = null;
    clearTimeout(lingerTimer);
    clearTimeout(settleTimer);
    domObserver.disconnect();
    sourceObserver.disconnect();
    ghost.remove();
    document.documentElement.removeAttribute("data-sole-tour-spotlight");
    document.documentElement.removeAttribute(DEMO_ATTR);
  };
}
