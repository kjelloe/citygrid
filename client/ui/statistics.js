// The statistics panel.
//
// A `<dialog>`, like settings, for the same reasons: focus trapping, focus
// return and Escape without writing any of them.
//
// The sparklines are inline SVG rather than a canvas, so they scale with the
// page at 200% text and carry a text alternative. §30: a graph is not a
// statistic until somebody who cannot see it gets the same answer, so every
// chart is `role="img"` with the reading as its label, and the reading is
// printed underneath in words as well.

import { t } from "../i18n.js";
import { formatMoney } from "./hud-model.js";
import { statistics, points, WINDOW } from "./statistics-model.js";

const SVG = "http://www.w3.org/2000/svg";
const CHART = { width: 220, height: 44 };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svg(tag, attributes) {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function sparkline(samples, stat, label) {
  const chart = svg("svg", {
    viewBox: `0 0 ${CHART.width} ${CHART.height}`,
    class: `spark ${stat.reading.sign}`,
    preserveAspectRatio: "none",
    role: "img",
    "aria-label": label,
  });
  const line = points(samples, stat.field, CHART.width, CHART.height);
  if (line.length >= 2) {
    chart.append(svg("polyline", {
      points: line.map((p) => `${p.x},${p.y}`).join(" "),
      fill: "none",
      "stroke-width": 2,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      // `vector-effect` keeps the stroke even width under the non-uniform
      // scale `preserveAspectRatio="none"` applies.
      "vector-effect": "non-scaling-stroke",
    }));
    const last = line[line.length - 1];
    chart.append(svg("circle", { cx: last.x, cy: last.y, r: 2.5, class: "spark-head" }));
  }
  return chart;
}

export async function openStatistics(state) {
  const samples = state.history?.samples ?? [];
  const stats = statistics(state);

  const dialog = el("dialog", "stats");
  dialog.setAttribute("aria-label", t("menu.statistics"));
  const body = el("div", "stats-body");
  const heading = el("h1", undefined, t("menu.statistics"));
  // The list is taller than the dialog, and `showModal()` focuses the first
  // focusable thing it finds — which is the Done button at the bottom, so the
  // panel opened scrolled past every statistic in it. Focusing the heading
  // opens at the top AND is what a screen reader should announce first.
  heading.tabIndex = -1;
  body.append(heading);

  if (samples.length < 2) {
    // Honest rather than empty. A screen of flat lines reads as a broken
    // screen; a sentence reads as a young city.
    body.append(el("p", "stats-empty", t("stat.noHistory")));
  }

  const list = el("div", "stats-list");
  for (const stat of stats) {
    const row = el("section", "stat");
    row.dataset.field = stat.field;

    const head = el("div", "stat-head");
    head.append(el("h2", undefined, t(stat.labelKey)));
    const value = el("span", "stat-value", stat.money ? formatMoney(stat.value) : String(stat.value));
    head.append(value);
    const arrow = el("span", `stat-arrow ${stat.reading.sign}`,
      stat.reading.direction > 0 ? "▲" : stat.reading.direction < 0 ? "▼" : "—");
    arrow.setAttribute("aria-hidden", "true");
    head.append(arrow);
    row.append(head);

    // The sentence, built once and used twice: under the chart, and as the
    // chart's own label.
    const verdict = t(stat.reading.verdictKey, {
      change: Math.abs(stat.reading.change),
      months: WINDOW,
    });
    row.append(sparkline(samples, stat, `${t(stat.labelKey)}: ${verdict}`));
    row.append(el("p", "stat-verdict", verdict));
    row.append(el("p", "stat-about", t(stat.aboutKey)));
    list.append(row);
  }
  body.append(list);

  const close = el("button", "stats-close", t("settings.close"));
  close.type = "button";
  close.id = "stats-close";
  close.addEventListener("click", () => dialog.close());
  body.append(close);
  dialog.append(body);
  document.body.append(dialog);

  dialog.showModal();
  heading.focus();
  await new Promise((resolve) => dialog.addEventListener("close", resolve, { once: true }));
  dialog.remove();
}
