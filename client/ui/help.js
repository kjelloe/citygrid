// The controls card.
//
// A `<dialog>`, like settings and statistics. Everything in it comes from
// `help-model.js`, and the tool half of that is derived from `TOOLS` — so the
// card cannot claim a key the game does not have.

import { t } from "../i18n.js";
import { helpSections } from "./help-model.js";

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

  for (const section of helpSections()) {
    if (section.rows.length === 0) continue;
    const block = el("section", "help-section");
    block.append(el("h2", undefined, t(section.titleKey)));
    const list = el("dl");
    for (const row of section.rows) {
      const keys = el("dt");
      if (row.keys) {
        for (const key of row.keys) keys.append(el("kbd", undefined, key));
      } else {
        // A pointer gesture has no key; the description carries it.
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
