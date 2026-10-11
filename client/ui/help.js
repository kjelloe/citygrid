// The controls card.
//
// A `<dialog>`, like settings and statistics. Everything in it comes from
// `help-model.js`, and the tool half of that is derived from `TOOLS` — so the
// card cannot claim a key the game does not have.

import { t } from "../i18n.js";
import { helpSections } from "./help-model.js";
import { isCoarsePointer } from "../capabilities.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function openHelp() {
  const dialog = el("dialog", "help");
  dialog.setAttribute("aria-label", t("menu.help"));
  const body = el("div", "help-body");
  const heading = el("h1", undefined, t("menu.help"));
  heading.tabIndex = -1;
  body.append(heading);

  // The pointer that is about to read it (the omissions round after K6a): a
  // phone gets the gesture rows and no key, the same choice the first-run card
  // makes.
  const coarse = isCoarsePointer();
  for (const section of helpSections(coarse)) {
    if (section.rows.length === 0) continue;
    const block = el("section", "help-section");
    block.append(el("h2", undefined, t(section.titleKey)));
    const list = el("dl");
    for (const row of section.rows) {
      const keys = el("dt");
      if (row.keys) {
        for (const key of row.keys) keys.append(el("kbd", undefined, key));
      } else if (row.keysKey) {
        // A gesture names itself — "Two fingers" — rather than being a bullet.
        keys.append(el("span", "help-gesture", t(row.keysKey)));
      } else if (!coarse) {
        // A pointer gesture has no key; the description carries it, and the
        // bullet holds the key column open. There is no key column on a phone
        // — the rows are one above the other — so the bullet would be a line
        // of its own above every tool name.
        keys.append(el("span", "help-gesture", "•"));
      }
      list.append(keys, el("dd", undefined, t(row.labelKey)));
    }
    block.append(list);
    body.append(block);
  }

  const close = el("button", "help-close", t("settings.close"));
  close.type = "button";
  close.id = "help-close";
  close.addEventListener("click", () => dialog.close());
  body.append(close);
  dialog.append(body);
  document.body.append(dialog);

  dialog.showModal();
  heading.focus();
  await new Promise((resolve) => dialog.addEventListener("close", resolve, { once: true }));
  dialog.remove();
}
