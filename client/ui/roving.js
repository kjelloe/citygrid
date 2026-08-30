// Arrow-key navigation for a toolbar.
//
// The HUD has carried `role="toolbar"` on four rows since slice N4. That role
// is a promise: a toolbar is ONE tab stop, and the arrow keys move between its
// controls. None of that existed, so a keyboard user met thirty-odd separate
// tab stops in a row that claimed to be one — a promise that is worse than the
// absence, because assistive technology announces it (§30, P21 audit).
//
// The pattern (roving tabindex): exactly one control in the container has
// `tabindex="0"` and the rest have `-1`, so Tab enters and leaves the whole
// toolbar in one press. The arrows move focus and move the tab stop with it, so
// coming back lands where you left.

/** Where an arrow key goes from here. Pure, so the wrapping — which is the part
 * that is always subtly wrong — is testable without a browser.
 *
 * Returns -1 for a key this pattern does not handle, so the caller knows to
 * leave the event alone rather than swallowing it. */
export function nextIndex(current, count, key) {
  if (count <= 0) return -1;
  switch (key) {
    // Both axes, because a toolbar that wraps to two rows on a phone is read
    // vertically and horizontally by different people.
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return -1;
  }
}

/** Makes one container behave like its `role="toolbar"` claims.
 *
 * @returns a `dispose()`; the HUD is rebuilt on a language change, and a
 *   listener left on a detached node is a leak that survives the rebuild.
 */
export function makeRoving(container) {
  const items = () => [...container.querySelectorAll("button")].filter((b) => !b.disabled);

  function setStop(target) {
    for (const button of items()) button.tabIndex = button === target ? 0 : -1;
  }

  function onKeyDown(event) {
    const buttons = items();
    const current = buttons.indexOf(event.target);
    if (current < 0) return;
    const next = nextIndex(current, buttons.length, event.key);
    if (next < 0) return;
    // Only once we know the key is ours. Swallowing Tab or Enter here would
    // break the toolbar in the name of fixing it.
    event.preventDefault();
    setStop(buttons[next]);
    buttons[next].focus();
  }

  // Clicking or tabbing to a control makes it the way back in.
  function onFocusIn(event) {
    if (items().includes(event.target)) setStop(event.target);
  }

  container.addEventListener("keydown", onKeyDown);
  container.addEventListener("focusin", onFocusIn);
  setStop(items()[0]);

  return {
    /** Called after buttons are added or removed. */
    refresh() {
      if (!items().some((b) => b.tabIndex === 0)) setStop(items()[0]);
    },
    dispose() {
      container.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("focusin", onFocusIn);
    },
  };
}
