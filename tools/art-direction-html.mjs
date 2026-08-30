// Builds specs/art-direction.html from the real palettes and the real renders.
//
// A generator rather than a hand-written page, because an art-direction
// document that disagrees with the code is worse than none: it is a brief
// somebody would follow. Swatches come from client/render/palettes.js, the
// colour-vision rows are simulated at build time, and the style comparison is
// whatever tools/style-sheet.mjs last rendered.
//
// Usage: node tools/art-direction-html.mjs

import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PALETTES } from "../client/render/palettes.js";
import { PLAYER_COLOURS, TERRAIN_COLOURS } from "../client/render/palette.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

const TERRAIN_NAMES = ["grass", "dirt", "forest", "water", "shallow", "rock", "sand", "marsh"];
const ZONE_NAMES = ["—", "residential", "commercial", "industrial"];

// --- colour-vision simulation (same maths as test/render.test.js) -----------

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);

function simulate(hex, kind) {
  if (kind === "normal") return hex;
  const R = lin(((hex >> 16) & 0xff) / 255);
  const G = lin(((hex >> 8) & 0xff) / 255);
  const B = lin((hex & 0xff) / 255);
  const L = 0.31399 * R + 0.63951 * G + 0.04649 * B;
  const M = 0.15537 * R + 0.75789 * G + 0.08670 * B;
  const S = 0.01775 * R + 0.10944 * G + 0.87262 * B;
  let l = L; let m = M; let s = S;
  if (kind === "protan") l = 1.05118294 * M - 0.05116099 * S;
  if (kind === "deutan") m = 0.9513092 * L + 0.04866992 * S;
  if (kind === "tritan") s = -0.86744736 * L + 1.86727089 * M;
  const to = (v) => Math.max(0, Math.min(255, Math.round(gam(v) * 255)));
  return (to(5.47221206 * l - 4.6419601 * m + 0.16963708 * s) << 16)
    | (to(-1.1252419 * l + 2.29317094 * m - 0.1678952 * s) << 8)
    | to(0.02980165 * l - 0.19318073 * m + 1.16364789 * s);
}

const hex = (n) => "#" + (n >>> 0).toString(16).padStart(6, "0");

function swatches(colours, labels, size = 46) {
  return colours.map((c, i) => `<figure class="sw" style="--c:${hex(c)}">
    <div class="chip" style="width:${size}px;height:${size}px"></div>
    <figcaption>${labels?.[i] ?? ""}<code>${hex(c)}</code></figcaption>
  </figure>`).join("");
}

async function embed(path) {
  try {
    const data = await readFile(join(root, path));
    return `data:image/png;base64,${data.toString("base64")}`;
  } catch {
    return "";
  }
}

export async function build() {
  const sheet = await embed("reports/style-sheet.png");
  // The comparison sheet is embedded so the page travels on its own; the
  // reference screenshot is linked, because embedding both put the file at
  // 3.6 MB and the reference already lives in the repo.
  const reference = "../debugging/transport-world-example.png";

  const seats = PLAYER_COLOURS.slice(1);
  const visionRows = ["normal", "protan", "deutan", "tritan"].map((kind) => `
    <tr><th>${kind === "normal" ? "as seen" : kind + "opia"}</th>
    <td>${seats.map((c) => `<span class="dot" style="background:${hex(simulate(c, kind))}"></span>`).join("")}</td></tr>`).join("");

  const styleBlocks = Object.entries(PALETTES).map(([name, p]) => `
    <section class="style">
      <h3>${name}</h3>
      <div class="row"><span class="k">terrain</span>${swatches(p.terrain, TERRAIN_NAMES, 34)}</div>
      <div class="row"><span class="k">zones</span>${swatches(p.zone.slice(1), ZONE_NAMES.slice(1), 34)}</div>
      <div class="row"><span class="k">world</span>${swatches(
    [p.sky, p.road, p.roadMark, p.tree, p.wire, p.lamp, p.civic],
    ["sky", "road", "markings", "tree", "pole", "lamp", "civic"], 34)}</div>
    </section>`).join("");

  const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>City Grid — art direction</title>
<style>
  :root{--bg:#14161a;--panel:#1c1f25;--fg:#e9e7e2;--muted:#9aa0a8;--line:#2c3038;--accent:#6bbf92}
  @media (prefers-color-scheme: light){:root{--bg:#f6f4ef;--panel:#fff;--fg:#1d1f24;--muted:#61656d;--line:#e0ddd5;--accent:#2f7f57}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  main{max-width:1080px;margin:0 auto;padding:2.5rem 1.25rem 5rem}
  h1{font-size:2rem;margin:0 0 .3rem;letter-spacing:-.02em}
  h2{font-size:1.35rem;margin:2.75rem 0 .75rem;padding-bottom:.35rem;border-bottom:1px solid var(--line)}
  h3{font-size:1rem;margin:1.5rem 0 .6rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
  p,li{color:var(--fg)}
  .lede{color:var(--muted);margin:0 0 2rem;font-size:1.05rem}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:1.1rem 1.25rem;margin:1rem 0}
  .card.warn{border-left:3px solid #d8a13f}
  .card.open{border-left:3px solid var(--accent)}
  img{max-width:100%;border-radius:10px;display:block;border:1px solid var(--line)}
  figure{margin:0}
  .sw{display:inline-block;margin:0 .55rem .8rem 0;text-align:center;vertical-align:top}
  .chip{background:var(--c);border-radius:7px;border:1px solid rgba(128,128,128,.35)}
  .sw figcaption{font-size:.68rem;color:var(--muted);margin-top:.25rem;max-width:76px;line-height:1.35}
  .sw code{display:block;font-size:.62rem;opacity:.75}
  .row{display:flex;align-items:flex-start;gap:.5rem;flex-wrap:wrap;margin:.5rem 0 1rem}
  .row .k{width:70px;flex:none;color:var(--muted);font-size:.74rem;text-transform:uppercase;letter-spacing:.07em;padding-top:.7rem}
  .dot{display:inline-block;width:26px;height:26px;border-radius:5px;margin-right:5px;border:1px solid rgba(128,128,128,.3)}
  table{border-collapse:collapse;width:100%;margin:.75rem 0}
  th,td{text-align:left;padding:.5rem .6rem;border-bottom:1px solid var(--line);vertical-align:top}
  th{color:var(--muted);font-weight:600;font-size:.82rem;white-space:nowrap}
  .rules li{margin:.4rem 0}
  code{background:rgba(128,128,128,.14);padding:.1em .35em;border-radius:4px;font-size:.88em}
  .meta{color:var(--muted);font-size:.85rem}
  .style{border-top:1px dashed var(--line);padding-top:.9rem;margin-top:1.2rem}
  .style h3{margin-top:0;color:var(--fg);text-transform:none;letter-spacing:0;font-size:1.05rem}
</style></head><body><main>

<h1>City Grid — art direction</h1>
<p class="lede">Generated from the code. Swatches are the real palettes in
<code>client/render/palettes.js</code>; the colour-vision rows are simulated at build time; the
comparison is the last render from <code>tools/style-sheet.mjs</code>. Regenerate with
<code>node tools/art-direction-html.mjs</code>.</p>

<div class="card warn"><strong>The style is not chosen yet.</strong> Three candidates are built and
rendered. Section 3 of <code>specs/art-direction.md</code> stays empty until one is picked, and the
content lane does not start before it — deliberately.</div>

<h2>The three candidates</h2>
<p>Same city, same seed, same camera. A decision needs them side by side.</p>
${sheet ? `<img src="${sheet}" alt="The three styles compared">` : "<p class=meta>No style sheet rendered yet.</p>"}

<table>
<tr><th>plain</th><td>Soft cool light, bright cosy palette, shadows. The cheapest to produce and the most legible.</td></tr>
<tr><th>pixel</th><td><strong>Unlit</strong> — face shading baked into vertex colours, limited palette, ordered dither, low-resolution target. Lighting gives smooth gradients across a face, which is the one thing pixel art does not have.</td></tr>
<tr><th>painted</th><td>Low warm sun against a deep cool fill, richer palette, <strong>no post-process</strong>. The temperature split between lit and unlit faces is what separates an illustration from a photograph.</td></tr>
</table>

<h2>Rules that hold whichever style wins</h2>
<ul class="rules">
<li><strong>A style is geometry, shading and palette — the filter is last.</strong> The first three candidates differed only in post-process and were indistinguishable. A screen-space outline also fights detail: the more windows and roof clutter a building has, the more the edge test fires, until the image is mud.</li>
<li><strong>Detail is flat panels, not boxes.</strong> A window quad is two triangles where a window box is twelve, and at this camera they are indistinguishable. That is what makes a city of detailed buildings affordable.</li>
<li><strong>Roofing is dark whatever the walls are.</strong> A cream house with a cream roof reads as one lump.</li>
<li><strong>Windows need a frame.</strong> Full-cell windows turn a wall into a bookcase.</li>
<li><strong>Silhouette first.</strong> A building must be identifiable at phone size, at default zoom, from all four angles, with the territory overlay on. Category reads from silhouette, level from height, value tier from roof and material.</li>
<li><strong>Four-angle rotation is a hard requirement</strong>, which is what selects the mesh pipeline. A drawn-sprite style would need four sprite sets per building state.</li>
<li><strong>Never colour alone.</strong> Overlays pair colour with icon, pattern or label; player identity is colour <em>plus</em> pattern <em>plus</em> name.</li>
</ul>

<h2>Player colours</h2>
<p>Sixteen seats, chosen by farthest-point search scored on the worst pair across three colour-vision
deficiencies at once — not by eye. A hand-picked set failed its own test with seven collapsing pairs,
the worst at a separation of 0.018. This set's worst pair is 0.18.</p>
<div class="row"><span class="k">seats</span>${swatches(seats, seats.map((_, i) => `seat ${i + 1}`), 40)}</div>
<table>${visionRows}</table>
<div class="card"><strong>Sixteen genuinely distinguishable colours do not exist.</strong> This palette
makes the colour carry as much as a colour can, and no more — which is why identity always also
carries a pattern and a name. Any replacement must pass
<code>test/render.test.js</code>.</div>

<h2>Style palettes</h2>
${styleBlocks}

<h2>Terrain reference</h2>
<div class="row"><span class="k">base</span>${swatches(TERRAIN_COLOURS, TERRAIN_NAMES, 40)}</div>

<h2>The target</h2>
<p class="meta">Kjell's reference: a friend's three.js transport game. Pitched roofs, chimneys,
faceted tree canopies, vivid grass, soft shadows, colour accents on vehicles.</p>
${reference ? `<img src="${reference}" alt="Reference: transport world">` : ""}

<h2>What still needs drawing</h2>
<p>Full list with counts and priority in <code>specs/asset-list.md</code>. Everything currently in
the game is procedurally generated placeholder geometry.</p>
<table>
<tr><th>Zoned buildings</th><td>~48 models — 3 categories × 4 footprints × 4 levels, value tier by material</td></tr>
<tr><th>Civic &amp; utility</th><td>12 distinct silhouettes: fire, police, hospital, four power, four water, park</td></tr>
<tr><th>Props</th><td>Trees, rocks, shoreline, rubble, street furniture, 8 vehicle types</td></tr>
<tr><th>Characters</th><td>Advisor with ~6 expressions, 10 supporting cast with ~3 each</td></tr>
<tr><th>Interface</th><td>~80 icons, legible at 24px and in high contrast</td></tr>
</table>

<h2>Open</h2>
<div class="card open">
<p><strong>The style choice itself.</strong> Everything downstream — the asset list, the content
lane, the palette work — waits on it.</p>
<p><strong>Q2</strong> — the advisor's visual character, alongside their voice.<br>
<strong>Q13</strong> — whether a drawn-sprite pipeline is ever funded post-v1.</p>
</div>

<p class="meta">Companion to <code>specs/art-direction.md</code>. Rulings 005, 006, 013, 017, 018.</p>
</main></body></html>`;

  await writeFile(join(root, "specs/art-direction.html"), page);
  return page.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const size = await build();
  console.log(`wrote specs/art-direction.html (${(size / 1024).toFixed(0)} KB)`);
}
