// The HUD, as DOM.
//
// The thin half of the model/view split (`plan.md` §7.1). Everything it says is
// decided by `hud-model.js`, `rci-model.js`, `alerts-model.js`,
// `inspector-model.js`, `build-model.js`, `budget-model.js` and `overlays.js`,
// all pure and all tested; this turns those objects into elements and does
// nothing else. In particular it holds no opinion about whether an action is
// allowed — that is the reducer's, and a button that greys itself out on a rule
// it invented is a rule nobody else enforces.
//
// Ruling 008: every string a player reads comes from `t()`. The models hand
// over KEYS; this file is the only place that turns a key into words.
//
// Layout follows gamedesign.md §13.1: top bar, demand indicator, alert area,
// build toolbar, budget. §13.2's mobile layout is the same DOM with a different
// stylesheet, not a fork.

import { topBar, formatMoney } from "./hud-model.js";
import { rciBars } from "./rci-model.js";
import { createAlerts, pushAlerts, expireAlerts, visibleAlerts, SEVERITY } from "./alerts-model.js";
import { inspect } from "./inspector-model.js";
import { OVERLAY_NAMES, OVERLAYS, legendFor, BAND } from "./overlays.js";
import { buildMenu } from "./build-model.js";
import { budgetPanel, fundingRows, fundingSteps } from "./budget-model.js";
import { TOOLS } from "../input/tools.js";
import { buildingCost } from "../../engine/utilities.js";
import { t } from "../i18n.js";
import { makeRoving } from "./roving.js";
import { RESULT } from "../../shared/protocol.js";

const BAND_CLASS = ["good", "fair", "severe", "none"];

/** The build toolbar, grouped as §13.1 lists it. `inspect` is not a build tool
 * — it is the absence of one — so it carries no command. The building groups
 * are appended after these, generated from the catalogue. */
const GROUPS = [
  { labelKey: "group.inspect", items: [{ tool: undefined, id: "inspect", labelKey: "tool.inspect" }] },
  {
    labelKey: "group.zones",
    items: [
      { tool: "zoneResidential", labelKey: "zone.residential" },
      { tool: "zoneCommercial", labelKey: "zone.commercial" },
      { tool: "zoneIndustrial", labelKey: "zone.industrial" },
      { tool: "dezone", labelKey: "tool.dezone" },
    ],
  },
  { labelKey: "group.roads", items: [{ tool: "road", labelKey: "tool.road" }] },
  { labelKey: "group.electricity", items: [{ tool: "wire", labelKey: "tool.wire" }] },
  { labelKey: "group.water", items: [{ tool: "pipe", labelKey: "tool.pipe" }] },
  { labelKey: "group.bulldoze", items: [{ tool: "bulldoze", labelKey: "tool.bulldoze" }] },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createHud(root, {
  state, seat, controller, onOverlay, onSpeed, onUndo,
  onSave, onLoad, onExport, onImport, slots,
  onQuestChoice, quests, onTax, onFunding, onNewCity, onSettings, onStatistics, minimap,
}) {
  root.innerHTML = "";
  const alerts = createAlerts();
  let previous = {};
  let overlay;

  // --- top bar --------------------------------------------------------------
  const top = el("div", "hud-top");
  const money = el("span", "hud-money");
  const trend = el("span", "hud-trend");
  const pop = el("span", "hud-pop");
  const date = el("span", "hud-date");
  const speedButton = el("button", "hud-speed", t("speed.paused"));
  speedButton.type = "button";
  speedButton.id = "speed";
  speedButton.addEventListener("click", () => onSpeed?.());
  top.append(money, trend, pop, date, speedButton);
  // Leaving a city is how you start another one. Without it the only way to
  // play a second region was to edit the address bar (P18 audit).
  if (onNewCity) {
    const newCity = el("button", "hud-newcity", t("menu.newCity"));
    newCity.type = "button";
    newCity.id = "new-city";
    newCity.addEventListener("click", () => {
      // Confirmed, because it throws away everything since the last save and
      // the button sits next to the one that pauses.
      if (globalThis.confirm?.(t("menu.newCity.confirm")) === false) return;
      onNewCity();
    });
    top.append(newCity);
  }
  if (onStatistics) {
    const stats = el("button", "hud-stats", t("menu.statistics"));
    stats.type = "button";
    stats.id = "statistics";
    stats.addEventListener("click", () => onStatistics());
    top.append(stats);
  }
  if (onSettings) {
    const settings = el("button", "hud-settings", t("menu.settings"));
    settings.type = "button";
    settings.id = "settings";
    settings.addEventListener("click", () => onSettings());
    top.append(settings);
  }

  // --- demand ---------------------------------------------------------------
  const rci = el("div", "hud-rci");
  rci.setAttribute("aria-label", t("hud.demand"));
  const bars = new Map();
  for (const bar of rciBars(state)) {
    const wrap = el("div", "rci-bar");
    wrap.dataset.key = bar.key;
    const fill = el("i");
    const tag = el("span", undefined, bar.short);
    wrap.append(fill, tag);
    wrap.title = t(bar.labelKey);
    bars.set(bar.key, { wrap, fill });
    rci.append(wrap);
  }

  // --- alerts ---------------------------------------------------------------
  const alertList = el("ul", "hud-alerts");
  alertList.setAttribute("aria-live", "polite");
  alertList.setAttribute("aria-label", t("hud.alerts"));

  // --- toolbar --------------------------------------------------------------
  const toolbar = el("div", "hud-toolbar");
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", t("hud.tools"));
  const buttons = [];

  function addToolButton(wrap, { tool, def, id, labelKey, cost, size }) {
    const button = el("button", def ? "tool build" : "tool");
    button.type = "button";
    button.dataset.tool = tool ?? "";
    button.dataset.id = id ?? def ?? tool;
    if (def) button.dataset.def = def;
    button.append(el("span", undefined, t(labelKey)));
    if (cost !== undefined) {
      button.append(el("small", undefined, formatMoney(cost)));
      button.title = `${t(labelKey)} · ${formatMoney(cost)} · ${size}`;
    }
    button.addEventListener("click", () => {
      // Clicking the tool that is already held puts it down. With a building
      // tool the DEF has to match too, or picking a second plant would look
      // like a toggle and clear the toolbar instead.
      const same = controller.tool === tool && (def === undefined || controller.def === def);
      controller.setTool(same ? undefined : tool, def);
      refresh();
    });
    buttons.push(button);
    wrap.append(button);
  }

  for (const group of GROUPS) {
    const wrap = el("div", "tool-group");
    wrap.setAttribute("aria-label", t(group.labelKey));
    for (const item of group.items) {
      if (item.tool !== undefined && !TOOLS[item.tool]) continue;
      addToolButton(wrap, item);
    }
    toolbar.append(wrap);
  }

  const undoButton = el("button", "tool", t("hud.undo"));
  undoButton.type = "button";
  undoButton.id = "undo";
  undoButton.addEventListener("click", () => { onUndo?.(); refresh(); });
  toolbar.append(undoButton);

  // The buildings, on a row of their own.
  //
  // Without these the toolbar could zone and pave and nothing else, and since
  // development needs power AND water a city could never grow through the
  // interface — the failure this row exists to end. It is a SEPARATE row
  // because appending twelve buttons to the tool row pushed them off the right
  // edge of a 1280px screen, which is its own way of not being in the game.
  //
  // It carries the `hud-toolbar` class too, so a selector written against the
  // toolbar covers the buildings as well.
  const buildBar = el("div", "hud-toolbar hud-build");
  buildBar.setAttribute("role", "toolbar");
  buildBar.setAttribute("aria-label", t("group.build"));
  for (const group of buildMenu()) {
    const wrap = el("div", "tool-group build-group");
    wrap.setAttribute("aria-label", t(group.labelKey));
    wrap.dataset.category = group.category;
    for (const item of group.items) {
      addToolButton(wrap, {
        tool: "building",
        def: item.def,
        labelKey: item.labelKey,
        // Quoted at the difficulty this game is played on, not at the list
        // price, so the button and the reducer agree.
        cost: buildingCost(state, item.def),
        size: `${item.w}×${item.h}`,
      });
    }
    buildBar.append(wrap);
  }

  // --- overlays -------------------------------------------------------------
  const overlayBar = el("div", "hud-overlays");
  overlayBar.setAttribute("role", "toolbar");
  overlayBar.setAttribute("aria-label", t("hud.overlays"));
  const overlayButtons = [];
  for (const name of OVERLAY_NAMES) {
    const button = el("button", "overlay", t(OVERLAYS[name].labelKey));
    button.type = "button";
    button.dataset.overlay = name;
    button.addEventListener("click", () => {
      overlay = overlay === name ? undefined : name;
      onOverlay?.(overlay);
      refresh();
    });
    overlayButtons.push(button);
    overlayBar.append(button);
  }

  // --- budget ---------------------------------------------------------------
  //
  // §13.1's budget, reduced to the one control that matters: the rate. The
  // command has existed since the economy slice with nothing to send it, so
  // until now the tax rate was a constant the player could read about in the
  // design document and never touch.
  const budgetBar = el("div", "hud-budget");
  const opening = budgetPanel(state, seat);
  const taxLabel = el("label", "budget-label", t("budget.tax"));
  taxLabel.htmlFor = "tax";
  const taxInput = el("input");
  taxInput.type = "range";
  taxInput.id = "tax";
  taxInput.min = String(opening.min);
  taxInput.max = String(opening.max);
  taxInput.step = "1";
  taxInput.value = String(opening.rate);
  const taxValue = el("output", "budget-rate");
  taxValue.htmlFor = "tax";
  const books = el("span", "budget-books");
  taxInput.addEventListener("input", () => {
    // Say the new rate immediately; the reducer decides whether it sticks, and
    // `refresh()` reports back what it actually said.
    onTax?.(Number(taxInput.value));
    refresh();
  });
  budgetBar.append(taxLabel, taxInput, taxValue, books);

  // §9.4. A `<select>` per department rather than nine buttons: it is compact,
  // it is a native keyboard control, and it scales at 200% text without the
  // budget row becoming a second toolbar.
  const fundingSelects = new Map();
  if (onFunding) {
    for (const row of fundingRows(state)) {
      const wrap = el("label", "budget-funding");
      wrap.append(el("span", undefined, t(row.labelKey)));
      const select = document.createElement("select");
      select.dataset.service = row.service;
      select.id = `funding-${row.service}`;
      for (const step of fundingSteps()) {
        const option = document.createElement("option");
        option.value = String(step.value);
        option.textContent = t(step.labelKey, { percent: step.value });
        select.append(option);
      }
      select.value = String(row.percent);
      select.addEventListener("change", () => {
        onFunding(row.service, Number(select.value));
        refresh();
      });
      fundingSelects.set(row.service, select);
      wrap.append(select);
      budgetBar.append(wrap);
    }
  }

  // --- saving ---------------------------------------------------------------
  //
  // Three manual slots and the autosave, each a button that saves on click and
  // loads on shift-click. Deliberately plain: a save dialog is a screen the
  // player has to learn, and slice N5's job is that a session survives a closed
  // tab, not that it has a file manager.
  const saveBar = el("div", "hud-saves");
  saveBar.setAttribute("role", "toolbar");
  saveBar.setAttribute("aria-label", t("hud.saves"));
  const slotButtons = [];
  for (const slot of [...(slots?.manual ?? []), slots?.auto].filter(Boolean)) {
    const name = slot === slots.auto
      ? t("hud.slot.auto")
      : t("hud.slot.numbered", { number: slot.replace("slot", "") });
    const button = el("button", "slot", name);
    button.type = "button";
    button.dataset.slot = slot;
    button.title = t("hud.slot.hint");
    button.addEventListener("click", (event) => {
      if (event.shiftKey || slot === slots.auto) onLoad?.(slot);
      else onSave?.(slot);
    });
    slotButtons.push(button);
    saveBar.append(button);
  }
  const exportButton = el("button", "slot", t("hud.export"));
  exportButton.type = "button";
  exportButton.id = "export";
  exportButton.addEventListener("click", () => {
    const text = onExport?.();
    if (!text) return;
    // A data: URL rather than a Blob, so this works in a sandboxed frame too.
    const link = document.createElement("a");
    link.href = `data:application/json;charset=utf-8,${encodeURIComponent(text)}`;
    link.download = `citygrid-${Date.now()}.json`;
    link.click();
  });
  const importInput = el("input");
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.id = "import";
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    onImport?.(await file.text());
    importInput.value = "";
  });
  const importLabel = el("label", "slot", t("hud.import"));
  importLabel.append(importInput);
  saveBar.append(exportButton, importLabel);

  // --- the advisor ----------------------------------------------------------
  //
  // §11.2: short dialogue panels rather than scenes that interrupt play. So the
  // advisor is a card that sits in the corner saying one thing, with the
  // objective under it — never a modal, never something to dismiss before you
  // can build again.
  const advisor = el("div", "hud-advisor");
  advisor.hidden = true;

  const status = el("div", "hud-status");
  status.setAttribute("aria-live", "polite");

  const legend = el("div", "hud-legend");
  const readout = el("div", "hud-readout");
  readout.setAttribute("aria-live", "polite");

  // --- inspector ------------------------------------------------------------
  const inspector = el("div", "hud-inspector");
  inspector.hidden = true;

  // The minimap (§13.3, "optional minimap" — so it toggles, and remembers).
  const minimapBox = el("div", "hud-minimap");
  let minimapCanvas;
  if (minimap) {
    minimapCanvas = el("canvas", "minimap-canvas");
    minimapCanvas.id = "minimap";
    // A picture, so it is not a tab stop and handles no keys (ruling 028).
    minimapCanvas.setAttribute("role", "img");
    minimapCanvas.setAttribute("aria-label", t("hud.minimap"));
    const toggle = el("button", "minimap-toggle", t("hud.minimap.hide"));
    toggle.type = "button";
    toggle.id = "minimap-toggle";
    toggle.setAttribute("aria-expanded", "true");
    toggle.addEventListener("click", () => {
      const showing = minimapCanvas.hidden;
      minimapCanvas.hidden = !showing;
      toggle.textContent = t(showing ? "hud.minimap.hide" : "hud.minimap.show");
      toggle.setAttribute("aria-expanded", String(showing));
    });
    minimapBox.append(minimapCanvas, toggle);
  }

  const panel = el("div", "hud-panel");
  panel.append(rci, alertList, toolbar, buildBar, overlayBar, budgetBar, saveBar, legend, readout, status);
  root.append(top, inspector, advisor, minimapBox, panel);

  function renderAdvisor() {
    if (!quests) { advisor.hidden = true; return; }
    const active = quests.active();
    const catalogue = quests.catalogue();
    if (active.length === 0) { advisor.hidden = true; return; }
    // The oldest active quest is the one being spoken about. A panel that
    // switched every time a background quest appeared would be unreadable.
    const entry = active.reduce((a, b) => (a.startedTick <= b.startedTick ? a : b));
    const definition = catalogue.find((q) => q.id === entry.id);
    if (!definition) { advisor.hidden = true; return; }
    advisor.hidden = false;
    advisor.innerHTML = "";
    advisor.append(el("h2", undefined, t(definition.titleKey)));
    advisor.append(el("p", "says", t(definition.textKey)));
    if (definition.choices && entry.choice < 0) {
      const options = el("div", "choices");
      definition.choices.forEach((choice, index) => {
        const button = el("button", "choice", t(choice.textKey));
        button.type = "button";
        button.dataset.choice = String(index);
        button.addEventListener("click", () => { onQuestChoice?.(definition.id, index); });
        options.append(button);
      });
      advisor.append(options);
    }
    if (active.length > 1) {
      advisor.append(el("p", "tracker", t("advisor.more", { count: active.length - 1 })));
    }
  }

  function renderLegend() {
    legend.innerHTML = "";
    if (!overlay) return;
    for (const entry of legendFor(overlay)) {
      const item = el("span", `legend ${BAND_CLASS[entry.band]}`);
      // Colour AND a mark AND the word. Any one of the three is enough to read
      // the map, which is the point of all three being here.
      item.append(el("i", `swatch mark-${BAND_CLASS[entry.band]}`), el("span", undefined, t(entry.textKey)));
      legend.append(item);
    }
  }

  function renderAlerts() {
    expireAlerts(alerts, state.tick);
    alertList.innerHTML = "";
    for (const alert of visibleAlerts(alerts)) {
      const item = el("li", alert.severity === SEVERITY.URGENT ? "urgent" : alert.severity === SEVERITY.WARNING ? "warning" : "info");
      const text = t(alert.textKey, alert.disasterKey ? { disaster: t(alert.disasterKey) } : undefined);
      item.textContent = alert.count > 1 ? `${text} ×${alert.count}` : text;
      alertList.append(item);
    }
  }

  function renderBudget() {
    const budget = budgetPanel(state, seat);
    // Read the rate back from state rather than from the slider: if the reducer
    // refused the command the slider is showing a rate the city is not charging.
    taxInput.value = String(budget.rate);
    taxValue.textContent = t("budget.rate", { rate: budget.rate });
    books.textContent = t("budget.books", {
      income: formatMoney(budget.income),
      expenses: formatMoney(budget.expenses),
      net: formatMoney(budget.net),
    });
    books.dataset.sign = budget.net > 0 ? "positive" : budget.net < 0 ? "negative" : "flat";
    // Read back from state, like the tax rate: if the reducer refused, the
    // control must not keep showing a level the city is not funding.
    for (const row of fundingRows(state)) {
      const select = fundingSelects.get(row.service);
      if (select) select.value = String(row.percent);
    }
  }

  function refresh() {
    const bar = topBar(state, seat, previous);
    money.textContent = bar.money;
    trend.textContent = bar.trend > 0 ? "▲" : bar.trend < 0 ? "▼" : "—";
    trend.className = `hud-trend ${bar.trend > 0 ? "up" : bar.trend < 0 ? "down" : "flat"}`;
    pop.textContent = t("hud.residents", { count: bar.population });
    date.textContent = t("hud.date", { year: bar.year, month: bar.month });

    for (const b of rciBars(state)) {
      const node = bars.get(b.key);
      node.fill.style.height = `${Math.abs(b.value) * 100}%`;
      node.wrap.dataset.sign = b.value >= 0 ? "positive" : "negative";
      node.wrap.title = `${t(b.labelKey)}: ${b.raw}`;
    }

    for (const button of buttons) {
      const sameTool = (button.dataset.tool || undefined) === controller.tool;
      const held = sameTool && (button.dataset.def === undefined || button.dataset.def === controller.def);
      button.setAttribute("aria-pressed", String(held));
    }
    for (const button of overlayButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.overlay === overlay));
    }
    renderAlerts();
    renderLegend();
    renderBudget();
    renderAdvisor();
  }

  function showInspection(tile) {
    if (!tile) { inspector.hidden = true; return; }
    const report = inspect(state, tile.x, tile.y);
    if (!report) { inspector.hidden = true; return; }
    inspector.hidden = false;
    inspector.innerHTML = "";
    const title = report.building
      ? t(`building.${report.building.def}`)
      : t(report.zoneKey ?? report.terrainKey);
    inspector.append(el("h2", undefined, `${title} — ${report.x}, ${report.y}`));
    const list = el("dl");
    const add = (label, value) => { list.append(el("dt", undefined, label), el("dd", undefined, String(value))); };
    const yesNo = (value) => t(value ? "inspect.yes" : "inspect.no");
    add(t("inspect.terrain"), t(report.terrainKey));
    if (report.zoneKey) add(t("inspect.zone"), t(report.zoneKey));
    add(t("inspect.road"), yesNo(report.road));
    add(t("inspect.power"), t(report.wire ? (report.powered ? "inspect.supplied" : "inspect.unsupplied") : "inspect.noWire"));
    add(t("inspect.water"), t(report.pipe ? (report.watered ? "inspect.supplied" : "inspect.dry") : "inspect.noPipe"));
    if (report.building) {
      add(t("inspect.level"), report.building.level);
      add(t("inspect.condition"), report.building.condition);
      if (report.building.occupancy !== undefined) add(t("inspect.occupancy"), report.building.occupancy);
    }
    for (const row of report.rows) add(t(row.labelKey), row.value);
    inspector.append(list);
    // The bands in words, so the inspector answers the same question the
    // overlay does for anyone who cannot separate the two shades.
    const words = el("p", "bands");
    words.textContent = report.bands
      .filter((b) => b.band !== BAND.NONE)
      .map((b) => `${t(b.labelKey)}: ${t(b.wordKey)}`)
      .join(" · ");
    inspector.append(words);
  }

  /** What the stroke would do, or why it will not.
   *
   * The seven `result.*` strings have been in both catalogues since the first
   * commit and nothing ever rendered one: a refused build showed the player
   * "0 tiles" and no reason, which is the most common feedback moment in the
   * game saying nothing at all. */
  function setPreview(preview) {
    if (!preview) { readout.textContent = ""; delete readout.dataset.result; return; }
    const cost = preview.cost === undefined ? "" : ` · ${formatMoney(-preview.cost)}`;
    const refused = preview.result !== undefined && preview.result !== RESULT.OK;
    readout.textContent = refused
      ? `${t(`result.${preview.result}`)}${cost}`
      : `${t("hud.tiles", { count: preview.tiles })}${cost}`;
    if (refused) readout.dataset.result = preview.result;
    else delete readout.dataset.result;
  }

  /** The reducer's answer to a command that was actually issued. Kept until the
   * next stroke, rather than faded on a timer, so a refusal that happens while
   * the player is looking elsewhere is still there when they look back. */
  function setResult(result) {
    if (result === RESULT.OK) return;
    readout.textContent = t(`result.${result}`);
    readout.dataset.result = result;
  }

  function tick(events) {
    pushAlerts(alerts, events, state.tick);
    // Refresh FIRST, against last tick's treasury, then remember this one.
    // The other order compares the treasury with itself and the trend arrow is
    // permanently flat.
    refresh();
    previous = { lastTreasury: topBar(state, seat).treasury };
  }

  function setStatus(text) {
    status.textContent = text ?? "";
  }

  function setSlots(summaries) {
    for (const button of slotButtons) {
      const summary = summaries.find((s) => s?.slot === button.dataset.slot);
      button.dataset.used = String(Boolean(summary));
      button.title = summary
        ? `${t("hud.slot.summary", { year: summary.year, count: summary.population })} · ${t("hud.slot.hint")}`
        : t("hud.slot.empty");
    }
  }

  // `role="toolbar"` promises one tab stop and arrow-key navigation. It has
  // been on these rows since slice N4 and neither was true.
  const roving = [toolbar, buildBar, overlayBar, saveBar].map(makeRoving);

  // The minimap sits above the panel, and the panel's height changes with its
  // contents and with the language. Published as a custom property rather than
  // guessed at in the stylesheet, because a guess is wrong in Norwegian.
  let panelWatch;
  if (globalThis.ResizeObserver) {
    panelWatch = new globalThis.ResizeObserver(() => {
      root.style.setProperty("--panel-height", `${panel.getBoundingClientRect().height}px`);
    });
    panelWatch.observe(panel);
  }

  refresh();
  return {
    refresh, tick, showInspection, setPreview, setResult, setStatus, setSlots,
    dispose() { for (const r of roving) r.dispose(); panelWatch?.disconnect(); },
    get minimapCanvas() { return minimapCanvas; },
    /** The draw loop skips a hidden minimap rather than drawing under a
     * `hidden` attribute; the toggle is the HUD's, the drawing is the
     * renderer's, and neither owns the other. */
    get minimapVisible() { return Boolean(minimapCanvas) && !minimapCanvas.hidden; },
    setSpeedLabel(key) { speedButton.textContent = t(key); },
    get overlay() { return overlay; },
  };
}
