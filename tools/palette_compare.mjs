// How far our colours are from the references, as numbers (S15).
//
//   node tools/palette_compare.mjs            all three rows
//   node tools/palette_compare.mjs town       one of them
//
// `compare_sheet.mjs` is the picture, judged by eye on purpose. This is the
// half S15 asks for first: **histogram both halves of each row with ONE rule**
// and say where ours is, so a palette move is measured rather than argued.
//
// The rule is deliberately crude and identical for both images — sky, greenery,
// water, road and roof by hue and brightness alone. It is not a segmentation;
// it is the same sieve held over two pictures, which is all a comparison needs
// (the lesson from S2's grass: match LIT pixels, not palette values, because
// the light caps what the material can ever show).
//
// It also answers S15's proportion question for free: the SHARE of the frame
// each class takes. "Is the road still the largest colour?" is a number here.

import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shoot } from "./screenshot.mjs";
import { VIEWS } from "./compare_sheet.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const only = process.argv[2];
const views = only ? VIEWS.filter((v) => v.id === only) : VIEWS;
if (views.length === 0) throw new Error(`no row called ${only} — try ${VIEWS.map((v) => v.id).join(", ")}`);

/**
 * One sieve, held over both pictures.
 *
 * Evaluated in the page over an ImageData, so the references decode through the
 * browser's PNG reader rather than through a dependency.
 */
const SIEVE = `(data, width, height) => {
  const classes = { sky: [], green: [], water: [], road: [], roof: [], other: [] };
  const push = (name, r, g, b) => classes[name].push([r, g, b]);
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const grey = max - min < 18;
      if (b > r + 25 && b > 150 && y < height * 0.55) push("sky", r, g, b);
      else if (g > r + 14 && g > b + 14) push("green", r, g, b);
      // GREY before blue. S15 made the asphalt cooler — #7d8189 has more blue
      // than green — and the water class swallowed the streets: the town row
      // reported 43.6% water on a frame with a river in it. A sieve that moves
      // when the thing it measures moves is measuring itself.
      else if (grey && max >= 40 && max <= 200) push("road", r, g, b);
      else if (b > g + 8 && g >= r && b > 90) push("water", r, g, b);
      // A roof is a LIT warm surface. Including everything dark made the class
      // "roofs and shadows", and shadow is most of an aerial frame - our roof
      // median moved three points when the whole palette moved sixty, because
      // the number was mostly shade. Both halves lose their shadows to the
      // leftover class, which is the only rule a comparison needs: the same
      // sieve, held twice. (No backticks in here: it is a template string.)
      else if (!grey && r >= g && max >= 90) push("roof", r, g, b);
      else push("other", r, g, b);
    }
  }
  const median = (list, k) => {
    if (list.length === 0) return undefined;
    const v = list.map((p) => p[k]).sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  const out = {};
  let total = 0;
  for (const name of Object.keys(classes)) total += classes[name].length;
  for (const [name, list] of Object.entries(classes)) {
    out[name] = {
      share: total ? Math.round((1000 * list.length) / total) / 10 : 0,
      rgb: [median(list, 0), median(list, 1), median(list, 2)],
      lum: list.length
        ? Math.round(list.reduce((n, p) => n + 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2], 0) / list.length)
        : undefined,
    };
  }
  return out;
}`;

const hex = (rgb) => (rgb[0] === undefined ? "—"
  : `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`);

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage();

/** Sieve one PNG, by its bytes. */
async function sieve(bytes) {
  return page.evaluate(async ({ b64, rule }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // eslint-disable-next-line no-eval
    return eval(rule)(data, canvas.width, canvas.height);
  }, { b64: Buffer.from(bytes).toString("base64"), rule: SIEVE });
}

const CLASSES = ["green", "road", "roof", "water", "sky", "other"];
const rows = [];
for (const view of views) {
  const out = `reports/.palette-${view.id}.png`;
  const shot = await shoot({
    out, seed: 1003, years: view.years, size: view.size, tier: "high", style: view.style,
    mode: view.mode, span: view.span, pitch: view.pitch, yaw: view.yaw / 360,
    fx: view.fx, fy: view.fy, time: view.time, frames: view.frames, width: 1280, height: 720,
  });
  if (!shot.ok) throw new Error(`${view.id}: the capture failed — ${shot.problems?.[0] ?? "no reason"}`);
  const ours = await sieve(await readFile(resolve(root, out)));
  const theirs = await sieve(await readFile(resolve(root, "debugging", view.reference)));
  rows.push({ view, ours, theirs });

  console.log(`\n${view.id} — ${view.note}`);
  console.log(`  ${"class".padEnd(7)} ${"ours".padEnd(22)} ${"reference".padEnd(22)} what to move`);
  for (const name of CLASSES) {
    const a = ours[name];
    const b = theirs[name];
    const dLum = a.lum !== undefined && b.lum !== undefined ? a.lum - b.lum : undefined;
    const note = dLum === undefined ? ""
      : `${Math.abs(dLum) < 8 ? "matched" : dLum < 0 ? `ours ${-dLum} darker` : `ours ${dLum} lighter`}`
        + `, share ${a.share}% vs ${b.share}%`;
    console.log(`  ${name.padEnd(7)} ${`${hex(a.rgb)} ${String(a.lum ?? "—").padStart(3)} ${String(a.share).padStart(4)}%`.padEnd(22)} `
      + `${`${hex(b.rgb)} ${String(b.lum ?? "—").padStart(3)} ${String(b.share).padStart(4)}%`.padEnd(22)} ${note}`);
  }
}

await browser.close();

// The one-line verdict S15 is about: is the road still the largest colour?
for (const { view, ours, theirs } of rows) {
  const biggest = (sieved) => CLASSES.filter((c) => c !== "sky" && c !== "other")
    .sort((a, b) => sieved[b].share - sieved[a].share)[0];
  console.log(`\n${view.id}: the largest colour on the ground is ${biggest(ours)} for us `
    + `and ${biggest(theirs)} in the reference`);
}
