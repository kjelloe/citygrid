// The motion shots (slice S6).
//
// Two things the item asks, and one this slice needs:
//
//   1. Frozen is frozen. Two shots under `?life=0` are the same BYTES — V1's
//      gate, kept: ambient motion must not make a screenshot depend on when it
//      was taken.
//   2. Alive is alive. The same view with life on, at two times, is not the same
//      picture — `reports/smoke-S6-{wind,smoke}-{t1,t2}.png`.
//   3. And the things that move were actually drawn: a turbine's rotor, a
//      coal plant's smoke, a hospital's flag. A still picture of nothing proves
//      nothing (aim-a-shot-at-the-subject).
//
// The buildings are placed through the reducer (`place=`), backdated so they
// are standing rather than building sites, and FOUND by asking the page.
//
//     node tools/motion_shots.mjs

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { shoot } from "./screenshot.mjs";

const SEED = 1003;
const SIZE = 64;
const YEARS = 20;
// A police station for the flag: the hospital's placement was refused on this
// map (it did not fit where the row puts it), and a flag nobody placed proves
// nothing.
const PLACE = { place: "windTurbine,coalPlant,policeStation", age: 400 };

const FIND = `(state) => {
  const at = (def) => {
    const b = state.buildings.find((x) => x.def === def);
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : undefined;
  };
  return { turbine: at("windTurbine"), coal: at("coalPlant"), police: at("policeStation") };
}`;
const COUNT = `(state, view) => {
  const n = (k) => view.pools?.[k]?.count ?? 0;
  return { rotor: n("rotor"), smoke: n("smoke"), flag: n("flag"), crane: n("crane"),
    px: view.stats.tilePixels, lod: view.stats.lod };
}`;

const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16);
const problems = [];

const probe = await shoot({ out: "reports/.motion-probe.png", seed: SEED, years: YEARS, size: SIZE,
  width: 320, height: 240, extra: { ...PLACE, __ask: FIND } });
const { turbine, coal } = probe.answer ?? {};
if (!turbine || !coal) throw new Error(`the placed buildings were not found: ${JSON.stringify(probe.answer)}`);
console.log(`turbine at (${turbine.x}, ${turbine.y}), coal plant at (${coal.x}, ${coal.y})`);

const view = (at, extra) => ({
  seed: SEED, years: YEARS, size: SIZE, tier: "high", mode: "city", span: 7, pitch: 24, yaw: 0,
  fx: at.x, fy: at.y, width: 1280, height: 720, extra: { ...PLACE, __ask: COUNT, ...extra },
});

// 1. Frozen twice.
const frozen = [];
for (const k of [1, 2]) {
  const out = `reports/.motion-frozen-${k}.png`;
  const r = await shoot({ out, ...view(turbine), life: false, frames: 30 });
  frozen.push({ out, hash: sha(out), answer: r.answer, ok: r.ok, problems: r.problems });
}
console.log(`frozen: ${frozen[0].hash} and ${frozen[1].hash} ${frozen[0].hash === frozen[1].hash ? "— identical" : "— DIFFERENT"}`);
if (frozen[0].hash !== frozen[1].hash) problems.push("two frozen shots differ");

// 2 and 3. Alive, at two times, at the turbine and at the coal plant.
for (const [name, at] of [["wind", turbine], ["smoke", coal]]) {
  const hashes = [];
  for (const [tag, frames] of [["t1", 30], ["t2", 240]]) {
    const out = `reports/smoke-S6-${name}-${tag}.png`;
    const r = await shoot({ out, ...view(at), life: true, frames });
    hashes.push(sha(out));
    console.log(`${out} ok=${r.ok} ${JSON.stringify(r.answer)}`);
    if (!r.ok) problems.push(...r.problems.slice(0, 2));
    const a = r.answer ?? {};
    if (name === "wind" && !(a.rotor > 0)) problems.push(`no rotor drawn at the turbine (${tag})`);
    if (name === "smoke" && !(a.smoke > 0)) problems.push(`no smoke drawn at the coal plant (${tag})`);
  }
  if (hashes[0] === hashes[1]) problems.push(`the ${name} view did not move between two times`);
}

// Flags and a crane. Placed on a YOUNG city: after twenty years the harness's
// row is built on and a police station comes back `needsBulldoze` — only the
// one-tile turbine fits. Backdated, the station is standing and flies its flag;
// placed today, it is a building site and has a crane.
for (const [name, extra, pool] of [
  ["flag", { place: "policeStation,fireStation", age: 400 }, "flag"],
  ["crane", { place: "policeStation", age: 0 }, "crane"],
]) {
  const found = await shoot({ out: "reports/.motion-probe.png", seed: SEED, years: 2, size: SIZE,
    width: 320, height: 240, extra: { ...extra, __ask: `(state) => { const b = state.buildings.find((x) => x.def === "policeStation"); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : undefined; }` } });
  const at = found.answer;
  if (!at) { problems.push(`the ${name} shot's police station was not placed: ${found.report?.placed}`); continue; }
  const out = `reports/smoke-S6-${name}.png`;
  const r = await shoot({ out, seed: SEED, years: 2, size: SIZE, tier: "high", mode: "city", span: 5, pitch: 24, yaw: 0,
    fx: at.x, fy: at.y, width: 1280, height: 720, life: true, frames: 60, extra: { ...extra, __ask: COUNT } });
  console.log(`${out} ok=${r.ok} ${JSON.stringify(r.answer)}`);
  if (!(r.answer?.[pool] > 0)) problems.push(`no ${pool} drawn in the ${name} shot`);
}

if (problems.length > 0) {
  console.error(`\nFAIL  ${problems.join("\n      ")}`);
  process.exit(1);
}
console.log("\nmotion shots ok");
