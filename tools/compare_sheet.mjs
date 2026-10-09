// City Grid beside the references (slice D4).
//
//   node tools/compare_sheet.mjs   ->  reports/compare-transport-worlds.png
//
// The gate the measurement lane started from and never built: how far is the
// picture from the target? Every other instrument in this repository counts
// something. This one is a picture, and it is judged by eye on purpose — a
// number cannot say "the roofs read as one grey mass at this zoom", which is
// the kind of finding the V lane kept producing and no gate ever caught.
//
// **The captures are matched to the references as they ACTUALLY are**, not to
// the item's memory of them. `workitems-measurement.md` D4 describes "a road
// with cars, a lakeside, a hill with a road up it"; the three files in
// `debugging/` are a lake with a queue of cars on the road round it, a town
// seen from above with a river through it, and a close low view down a
// residential street. Checking what the "before" actually was is a lesson this
// project has paid for twice (R3, and V7's invisible wash).
//
// The references are Kjell's uploads. They stay in `debugging/` and the sheet
// goes no further than the repository they are already in.

import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shoot } from "./screenshot.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

/**
 * One row of the sheet: a reference, and the City Grid view aimed at the same
 * kind of thing.
 *
 * **A PLAYED city, not the saturated fixture.** D4 asked for the fixture and the
 * fixture is the wrong instrument for this one question: `saturatedCity` seeds
 * its 1,129 buildings straight into the array when zoning growth produces none,
 * and they are 1,129 copies of `res` — a monoculture with no shops, no industry
 * and no residents, which says nothing about how the game LOOKS. Forty years of
 * the deputy on a 64-tile map gives 294 buildings across five kinds and a real
 * commuter load, which is a small town, which is what the references are of
 * (Q72). Every other gate keeps the saturated fixture; it is right for cost and
 * wrong for looks.
 *
 * The focus points are tiles on that city at seed 1003, found by looking for
 * what each reference is about — a built-up shore, the densest ground, and a
 * residential grid — so they move only if the recipe does. Pure data, so
 * `test/compare-sheet.test.js` can check that every reference is matched and
 * that no camera asks for an angle the camera would clamp.
 */
export const VIEWS = [
  {
    id: "lakeside",
    reference: "transport-world-example.png",
    mode: "city", span: 26, pitch: 34, yaw: 45, fx: 49, fy: 42,
    style: "plain", time: "day", size: 64, years: 40, frames: 240,
    note: "the town, the water and the ground between them — and the zoned-but-unbuilt land that reads as a slab of asphalt (Q73)",
  },
  {
    id: "town",
    reference: "transport-world-2.png",
    mode: "city", span: 44, pitch: 42, yaw: 30, fx: 29, fy: 51,
    style: "plain", time: "day", size: 64, years: 40, frames: 240,
    note: "the town from above: roof colours, the street grid, and whether the centre reads as a centre",
  },
  {
    id: "terrace",
    reference: "transport-world-3.png",
    mode: "city", span: 15, pitch: 26, yaw: 20, fx: 29, fy: 47,
    style: "plain", time: "day", size: 64, years: 40, frames: 240,
    note: "close and low over a residential street — the zoom where facades, doors and front gardens have to carry it",
  },
  // **The same street at two more hours** (S22c, A140). The lit styles bake no
  // compass shade any more, so a facade's form comes from the light that is
  // actually in the scene — and the only way to judge that is to see one street
  // under three suns. The reference is the same picture in all three rows on
  // purpose: it is the hour the reference was drawn at, and the two rows either
  // side of it are what the sun now does to it.
  {
    id: "terrace-morning",
    reference: "transport-world-3.png",
    mode: "city", span: 15, pitch: 26, yaw: 20, fx: 29, fy: 47,
    style: "plain", time: "day", hour: 0.06, size: 64, years: 40, frames: 240,
    note: "the same street early, with the sun at the start of its arc — with nothing baked, this is the light alone (S22c)",
  },
  {
    id: "terrace-dusk",
    reference: "transport-world-3.png",
    mode: "city", span: 15, pitch: 26, yaw: 20, fx: 29, fy: 47,
    style: "plain", time: "sunset", hour: 0.58, size: 64, years: 40, frames: 240,
    note: "and at dusk, where the sun is lowest and the form is hardest to carry (S22c)",
  },
];


const commit = () => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

/** The reference's own aspect, so the two halves of a row frame the same shape.
 * A 16:9 capture beside a 2.14:1 reference compares two croppings. */
async function referenceAspect(page, file) {
  const src = `data:image/png;base64,${(await readFile(join(root, "debugging", file))).toString("base64")}`;
  return page.evaluate(async (source) => {
    const img = new Image();
    img.src = source;
    await img.decode();
    return { width: img.width, height: img.height, src: source };
  }, src);
}

/**
 * The same views, shot from a worktree at another commit (S8's `--before`).
 *
 * A worktree and the OLD tree's own harness, not this one pointed at old
 * files: the renderer, the kit and the world model all moved, and a sheet that
 * mixes today's `screenshot.mjs` with yesterday's `instances.js` is a
 * comparison of neither. R3 spent an hour on exactly that mistake.
 */
async function shootBefore(sha, views, width) {
  const dir = join(root, "reports", `.before-${sha}`);
  const shots = join(root, "reports", `.before-shots-${sha}`);
  execFileSync("git", ["worktree", "add", "--detach", "--force", dir, sha], { cwd: root, stdio: "pipe" });
  try {
    await mkdir(shots, { recursive: true });
    // RELATIVE to the worktree: the old harness joins `out` onto its own root,
    // and an absolute path joined onto a base lands inside the worktree with
    // the whole path repeated under it.
    const plan = views.map((view, i) => ({
      out: `reports/.before-${view.id}.png`,
      seed: 1003, years: view.years, size: view.size, style: view.style, mode: view.mode,
      span: view.span, pitch: view.pitch, yaw: view.yaw, fx: view.fx, fy: view.fy,
      time: view.time, life: true, frames: view.frames, width, height: view.height ?? 619, index: i,
    }));
    const runner = join(dir, "tools", ".compare-before.mjs");
    await writeFile(runner, `import { shoot } from "./screenshot.mjs";
const plan = ${JSON.stringify(plan)};
for (const shot of plan) {
  const r = await shoot(shot);
  console.log(JSON.stringify({ id: shot.out, ok: r.ok, report: r.report ?? {} }));
}
`);
    execFileSync("node", [runner], { cwd: dir, stdio: "inherit", timeout: 20 * 60 * 1000 });
    const out = new Map();
    for (const view of views) {
      const file = join(dir, "reports", `.before-${view.id}.png`);
      out.set(view.id, `data:image/png;base64,${(await readFile(file)).toString("base64")}`);
    }
    return out;
  } finally {
    execFileSync("git", ["worktree", "remove", "--force", dir], { cwd: root, stdio: "pipe" });
  }
}

export async function compareSheet({ out = "reports/compare-transport-worlds.png", width = 1100, before = undefined } = {}) {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const sha = commit();
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
    const rows = [];
    for (const view of VIEWS) {
      const reference = await referenceAspect(page, view.reference);
      const height = Math.round(width * reference.height / reference.width);
      const file = `reports/.compare-${view.id}.png`;
      const result = await shoot({
        out: file, seed: 1003, years: view.years, size: view.size,
        style: view.style, mode: view.mode, span: view.span, pitch: view.pitch,
        yaw: view.yaw, fx: view.fx, fy: view.fy, time: view.time,
        // **The hour, where a row names one** (S22c). `time` is a PRESET name —
        // `day`, `sunset`, `night`, `rain` — and the sun's direction comes from
        // `hour`, which `shoot()` forwards through `extra`. The first version of
        // the three terrace rows passed `time: "dawn"` and `time: "dusk"`, which
        // are not presets at all: the renderer fell back to `day` and the sheet
        // showed the same street three times in the same light
        // (`a-knob-you-turned-is-not-a-knob-it-read`, and only the picture said
        // so).
        ...(view.hour === undefined ? {} : { extra: { hour: view.hour } }),
        // `life=1` so the cars are where the traffic put them, and four seconds
        // of frames so they have somewhere to have got to: the local sim fills a
        // road at one car per link per frame, and a first-frame shot of a busy
        // street is a shot of an empty one. Until D4 the harness passed no delta
        // at all, so `life=1` and `life=0` drew the same empty roads.
        life: true, frames: view.frames, width, height,
      });
      rows.push({
        view: { ...view, height },
        reference,
        shot: `data:image/png;base64,${(await readFile(join(root, file))).toString("base64")}`,
        report: result.report ?? {},
        problems: result.problems ?? [],
      });
    }

    // The same views at another commit, as a middle column (S8).
    if (before) {
      const shots = await shootBefore(before, rows.map((r) => r.view), width);
      for (const row of rows) row.before = shots.get(row.view.id);
    }

    const png = await page.evaluate(async ({ rows: data, sha: head }) => {
      const load = async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        return img;
      };
      const pad = 20;
      const bar = 62;
      const cellW = 1100;
      const loaded = [];
      const hasBefore = data.some((row) => row.before);
      for (const row of data) {
        loaded.push([await load(row.reference.src), await load(row.shot),
          row.before ? await load(row.before) : undefined]);
      }

      const heights = loaded.map(([reference]) => Math.round(cellW * reference.height / reference.width));
      const canvas = document.createElement("canvas");
      const columns = hasBefore ? 3 : 2;
      canvas.width = columns * cellW + (columns + 1) * pad;
      canvas.height = heights.reduce((total, h) => total + h + bar + pad, pad) + 40;
      const c = canvas.getContext("2d");
      c.fillStyle = "#14161a";
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.textBaseline = "middle";

      let y = pad;
      loaded.forEach(([reference, shot, earlier], i) => {
        const h = heights[i];
        const row = data[i];
        c.fillStyle = "#e8e6e1";
        c.font = "600 20px system-ui, sans-serif";
        const afterX = (columns - 1) * (cellW + pad) + pad;
        c.fillText(`${row.view.id.toUpperCase()} — reference`, pad, y + bar / 2 - 10);
        if (earlier) c.fillText(`before — ${row.beforeSha}`, cellW + 2 * pad, y + bar / 2 - 10);
        c.fillText(earlier ? "after — this tree" : "City Grid", afterX, y + bar / 2 - 10);
        c.fillStyle = "#8f9299";
        c.font = "400 14px system-ui, sans-serif";
        c.fillText(row.view.note, pad, y + bar / 2 + 14);
        const r = row.report;
        c.fillText(
          `${row.view.mode} · span ${row.view.span} · pitch ${row.view.pitch}° · ${row.view.style} · `
          + `${r.triangles ?? "?"} triangles · ${r.drawCalls ?? "?"} draw calls · ${head}`,
          afterX, y + bar / 2 + 14,
        );
        c.drawImage(reference, pad, y + bar, cellW, h);
        if (earlier) c.drawImage(earlier, cellW + 2 * pad, y + bar, cellW, h);
        c.drawImage(shot, afterX, y + bar, cellW, h);
        y += bar + h + pad;
      });

      c.fillStyle = "#8f9299";
      c.font = "400 14px system-ui, sans-serif";
      c.fillText("Judged by eye. The references are behavioural targets, never a source of code or constants "
        + "(CLAUDE.md, specs/referencedata.md).", pad, canvas.height - 22);
      return canvas.toDataURL("image/png");
    }, { rows: rows.map((r) => ({ view: r.view, reference: r.reference, shot: r.shot,
      before: r.before, beforeSha: before ?? "", report: r.report })), sha });

    await mkdir(dirname(join(root, out)), { recursive: true });
    await writeFile(join(root, out), Buffer.from(png.split(",")[1], "base64"));

    for (const row of rows) {
      const r = row.report ?? {};
      console.log(`${row.view.id.padEnd(10)} ${String(r.triangles ?? "?").padStart(7)} triangles  `
        + `${String(r.drawCalls ?? "?").padStart(3)} calls  ${r.buildings ?? "?"} buildings  `
        + `${r.population ?? "?"} residents`);
      for (const problem of row.problems) console.error(`  ${row.view.id}: ${problem}`);
    }
    console.log(`\nwrote ${out} — ${VIEWS.length} rows at ${sha}. Look at it.`);
    return { out, rows };
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // `--before <sha>` adds a middle column shot from a worktree at that commit
  // (S8), so a row says what MOVED rather than only what it is.
  const args = process.argv.slice(2);
  const at = args.indexOf("--before");
  const before = at >= 0 ? args[at + 1] : undefined;
  const out = args.filter((a, i) => !a.startsWith("--") && i !== at + 1)[0]
    ?? "reports/compare-transport-worlds.png";
  await compareSheet({ out, before });
}
