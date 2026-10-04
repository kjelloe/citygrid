// The street shots (slice S3; self-aiming since S20).
//
// A shopping street from the pavement of a PLAYED city: its parking bays, the
// bench and bike rack outside a shop, the bollards and the name sign at the
// corner, the wear down the lanes. Aimed at a shop with a street in front of
// it, found in NODE from the same model the renderer draws, and COUNTED before
// it is called a street.
//
//   reports/smoke-S3-street.png   along a shopping street, from its pavement
//   reports/smoke-S3-shop.png     facing the shop across its bays
//   reports/smoke-S3-corner.png   at a junction, facing its corner
//   reports/smoke-S3-city15.png   the same streets at D4's row-3 zoom (city 15, 26°)
//   reports/smoke-S3-row3.png     that view beside D4's reference row 3
//
//     node tools/street_shots.mjs
//
// **S20: the camera stands where it can see.** The shop shot used to stand ON
// the road tile in front of the shop and face it, which on seed 1003 is three
// metres from a wall — the frontage fills the frame. The subject and the camera
// now come from the model's own geometry through `tools/lib/aim.mjs`: back off
// along the frontage normal until nothing is within three metres, and use the
// photo camera, because a walker cannot stand in the middle of a carriageway
// and a tile plus a quarter-turn cannot say "four metres further back".

import { shoot } from "./screenshot.mjs";
import { setConfig, DEFAULTS } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { playedCity, standBack, frontageNormal, frontageMiddle, describe } from "./lib/aim.mjs";

const SEED = 1003;
const SIZE = 64;
const YEARS = 20;

setConfig(DEFAULTS);
const state = playedCity({ seed: SEED, size: SIZE, years: YEARS });
const model = createModel(state);
const T = model.tileM;
const middle = { x: (SIZE / 2) * T, z: (SIZE / 2) * T };

/** The standing shop nearest the middle of the map that a camera can stand back
 * from — "nearest" is not enough on its own, because the nearest one may be in
 * a corner no camera can see. */
function shopToShoot() {
  const shops = model.lots
    .filter((lot) => lot.building?.zone === 2 && (lot.building.flags & 8) === 0
      && state.tick - lot.building.builtTick > 12)
    .sort((a, b) => Math.hypot(a.cx - middle.x, a.cz - middle.z)
      - Math.hypot(b.cx - middle.x, b.cz - middle.z));
  for (const lot of shops) {
    const front = frontageMiddle(lot);
    // Far enough back that the shop is a shop rather than a wall: its own
    // frontage, fitted to 55% of the frame.
    // The FRONTAGE's own length, filled to about a frame and a quarter: at 0.55
    // the camera stood 41 m off and the shop was a dot in a streetscape; at six
    // metres it was a wall. A 20 m frontage at 1.25 is sixteen metres back,
    // which is the pavement opposite — where somebody looking at a shop stands.
    const camera = standBack(model, {
      at: front, away: frontageNormal(lot), clear: 3, max: 34, pitch: -4,
      fitWidthM: lot.frontageLen ?? Math.max(lot.x1 - lot.x0, lot.z1 - lot.z0), fitShare: 1.25,
    });
    if (camera) return { lot, front, camera };
  }
  return undefined;
}

/** A junction near the shop, and a camera standing back from it along one of
 * its arms, looking at the corner. */
function cornerNear(lot) {
  const nodes = model.nodes
    .filter((node) => node.degree >= 3)
    .sort((a, b) => Math.hypot(a.x - lot.cx, a.z - lot.cz) - Math.hypot(b.x - lot.cx, b.z - lot.cz));
  for (const node of nodes.slice(0, 6)) {
    for (const id of node.corridors) {
      const corridor = model.corridors[id];
      // Along this arm, away from the junction: the direction the camera backs
      // off in is the street itself, which is where a pavement is.
      const end = Math.hypot(corridor.points[0].x - node.x, corridor.points[0].z - node.z) < T
        ? corridor.points[Math.min(2, corridor.points.length - 1)]
        : corridor.points[Math.max(0, corridor.points.length - 3)];
      const away = { x: end.x - node.x, z: end.z - node.z };
      const camera = standBack(model, {
        at: { x: node.x, z: node.z }, away, clear: 3, start: 14, max: 32, pitch: -5,
      });
      if (camera) return { node, camera };
    }
  }
  return undefined;
}

// People are counted by DISTANCE FROM THE EYE, not by how many are on screen
// (B10, Q146). `stats.peds` said 122 on a high street where the nearest person
// was 137 metres away: under perspective at eye height the visible box stretches
// to the horizon, so "on screen" and "on this pavement" are different questions
// and only one of them is a picture.
const COUNT = `(state, view) => {
  const pools = view.pools ?? {};
  const cars = Object.keys(pools).filter((k) => /^car\\d+$/.test(k)).reduce((n, k) => n + (pools[k].count ?? 0), 0);
  const eye = view.view.camera.position;
  const tileM = view.model.tileM;
  let near = 0;
  let people = 0;
  for (const [name, pool] of Object.entries(pools)) {
    if (!/^ped/i.test(name) || !pool.instanceMatrix) continue;
    for (let i = 0; i < pool.count; i += 1) {
      const m = pool.instanceMatrix.array;
      const d = Math.hypot(m[i * 16 + 12] - eye.x, m[i * 16 + 14] - eye.z) * tileM;
      people += 1;
      if (d <= 40) near += 1;
    }
  }
  return { cars, people, near, live: view.stats?.streets?.live ?? 0, keys: view.stats?.streets?.keys ?? "" };
}`;

const problems = [];

const subject = shopToShoot();
if (!subject) throw new Error("no standing shop a camera can stand back from — the city, not the tool");
const corner = cornerNear(subject.lot);
console.log(describe("shop", { cx: subject.lot.cx, cz: subject.lot.cz, tileM: T }, subject.camera));
console.log(corner
  ? describe("corner", { cx: corner.node.x, cz: corner.node.z, tileM: T }, corner.camera)
  : "corner: no junction near the shop that a camera can stand back from");

// Along the street from the shop's own pavement: the same camera turned a
// quarter so the street runs away from it rather than across the frame.
const along = {
  ...subject.camera,
  photo: `${subject.camera.tile.x.toFixed(3)},${subject.camera.tile.z.toFixed(3)},`
    + `${subject.camera.eyeM},${(subject.camera.yaw + Math.PI / 2).toFixed(4)},-4`,
};

const shots = [
  ["reports/smoke-S3-street.png", { photo: along.photo }],
  ["reports/smoke-S3-shop.png", { photo: subject.camera.photo }],
];
if (corner) shots.push(["reports/smoke-S3-corner.png", { photo: corner.camera.photo }]);

for (const [out, camera] of shots) {
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high", streets: 40, frames: 60,
    width: 1280, height: 720, extra: { __ask: COUNT }, ...camera });
  console.log(`${out} ${JSON.stringify(camera)} ok=${r.ok} tri=${r.report?.triangles} ${JSON.stringify(r.answer)}`);
  if (!r.ok) problems.push(...r.problems.slice(0, 2));
  if (!(r.answer?.live > 0)) problems.push(`${out}: no street chunk baked — a picture of instanced boxes`);
  // A shopping street with nobody on it is what Q146 was: counted, posed, and
  // all of it a hundred metres away.
  if (!(r.answer?.near > 0)) {
    problems.push(`${out}: nobody within 40 m of the eye (${r.answer?.people ?? 0} posed in the whole frame)`);
  }
}

// Beside D4's reference row 3 (TERRACE): one image, the reference left, and
// the same kind of view on the right — row 3 is "close and low over a
// residential street", city at span 15 and 26° (compare_sheet.mjs), not the
// pavement. A street-level frame beside an aerial is two different questions.
await shoot({ out: "reports/smoke-S3-city15.png", seed: SEED, years: YEARS, size: SIZE, tier: "high",
  mode: "city", span: 15, pitch: 26, yaw: 0.6,
  fx: subject.lot.cx / T, fy: subject.lot.cz / T, width: 1280, height: 720, frames: 40 });
{
  const { chromium } = await import("playwright");
  const { readFileSync, writeFileSync } = await import("node:fs");
  const ref = readFileSync("debugging/transport-world-3.png").toString("base64");
  const ours = readFileSync("reports/smoke-S3-city15.png").toString("base64");
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 2000, height: 560 } });
  await page.setContent(`<body style="margin:0;background:#15171a;display:flex;gap:8px">
    <img src="data:image/png;base64,${ref}" style="height:560px;width:auto;max-width:1000px;object-fit:cover">
    <img src="data:image/png;base64,${ours}" style="height:560px;width:auto;max-width:992px;object-fit:cover"></body>`);
  await page.waitForTimeout(300);
  writeFileSync("reports/smoke-S3-row3.png", await page.screenshot());
  await browser.close();
  console.log("reports/smoke-S3-row3.png — D4's row 3 reference beside the city 15 view of the same streets");
}

if (problems.length > 0) {
  console.error(`\nFAIL  ${problems.join("\n      ")}`);
  process.exit(1);
}
console.log("\nstreet shots ok");
