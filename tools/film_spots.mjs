import { DEFAULTS, setConfig } from "../client/world/config.js";
import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { CMD_TICK, CMD_JOIN } from "../engine/commands.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/disasters.js";
import "../engine/fire.js";
import "../engine/quests.js";
import "../engine/requests.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import { TICKS_PER_YEAR } from "../engine/constants.js";
import { createModel } from "../client/world/model.js";
setConfig(DEFAULTS);

const SIZE = 96;
const world = generateWorld(defaultOptions({ seed: 1003, width: SIZE, height: SIZE, seats: 1, waterStyle: "river" }));
const state = world.state;
apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
const d = makeDeputy(1, "expand");
for (let t = 1; t <= 20 * TICKS_PER_YEAR; t += 1) {
  apply(state, { type: CMD_TICK });
  if (t % 6 === 0) deputyTurn(state, d);
}
const m = createModel(state);
const T = DEFAULTS.tileM;
let sx = 0; let sy = 0;
for (const b of state.buildings) { sx += b.x; sy += b.y; }
const cx = sx / state.buildings.length;
const cy = sy / state.buildings.length;
console.log(`${state.buildings.length} buildings, centre ${cx.toFixed(1)},${cy.toFixed(1)}, population ${state.population}`);
// A street for a WALK shot, ranked by what stands on it rather than by how long
// it is. The first list's "high street at dusk" was the longest straight
// corridor near the centre of mass, and the storyboard showed an industrial
// strip: sawtooth roofs, no shopfronts, nobody on the pavement. A proxy for a
// subject is not the subject (F2).
const near = (c, b) => {
  // Distance from the building's centre to the corridor's segment, in tiles.
  const a = c.points[0];
  const z = c.points[c.points.length - 1];
  const vx = z.x - a.x; const vz = z.z - a.z;
  const wx = (b.x + 0.5) * T - a.x; const wz = (b.y + 0.5) * T - a.z;
  const len2 = vx * vx + vz * vz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wz * vz) / len2)) : 0;
  return Math.hypot(wx - vx * t, wz - vz * t) / T;
};
const ZONES = ["civic", "homes", "shops", "works"];
const streets = m.corridors
  .filter((c) => c.points.length >= 2)
  .map((c) => {
    const a = c.points[0];
    const b = c.points[c.points.length - 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z) / T;
    const mx = (a.x + b.x) / 2 / T;
    const my = (a.z + b.z) / 2 / T;
    const on = state.buildings.filter((q) => near(c, q) < 1.6);
    const by = [0, 0, 0, 0];
    for (const q of on) by[q.zone] += 1;
    return { id: c.id, len, by, on: on.length,
      from: { x: a.x / T, z: a.z / T }, to: { x: b.x / T, z: b.z / T },
      d: Math.hypot(mx - cx, my - cy) };
  })
  .filter((c) => c.len > 6 && c.d < 24);
const show = (c) => `corridor ${c.id}: ${c.len.toFixed(1)} tiles `
  + `${c.from.x.toFixed(1)},${c.from.z.toFixed(1)} -> ${c.to.x.toFixed(1)},${c.to.z.toFixed(1)}  `
  + ZONES.map((n, i) => `${n} ${c.by[i]}`).join(" ");
console.log("longest:");
for (const c of [...streets].sort((a, b) => b.len - a.len).slice(0, 3)) console.log(`  ${show(c)}`);
console.log("most shopfronts (a high street):");
for (const c of [...streets].sort((a, b) => b.by[2] - a.by[2] || b.len - a.len).slice(0, 4)) console.log(`  ${show(c)}`);
console.log("most buildings of any kind:");
for (const c of [...streets].sort((a, b) => b.on - a.on).slice(0, 3)) console.log(`  ${show(c)}`);
// A junction with four arms near the centre.
const cross = m.nodes.filter((n) => n.kind === "junction" && n.corridors.length >= 4)
  .map((n) => ({ x: n.x / T, y: n.z / T, d: Math.hypot(n.x / T - cx, n.z / T - cy) }))
  .sort((a, b) => a.d - b.d)[0];
console.log(`crossroads at ${cross.x.toFixed(1)},${cross.y.toFixed(1)}`);
// The civic block: the densest cluster of zone-0 buildings.
const civic = state.buildings.filter((b) => b.zone === 0);
console.log(`civic: ${civic.map((b) => `${b.def}@${b.x},${b.y}`).slice(0, 6).join(" ")}`);
// The densest patch of HOUSES, for a suburb shot: a pan that ends at the
// furthest house ends in a forest, which is what the first list did.
function densest(zone, win) {
  const of = state.buildings.filter((b) => b.zone === zone);
  let best = null;
  for (const a of of) {
    const near = of.filter((b) => Math.abs(b.x - a.x) <= win && Math.abs(b.y - a.y) <= win);
    const mx = near.reduce((n, b) => n + b.x, 0) / near.length;
    const my = near.reduce((n, b) => n + b.y, 0) / near.length;
    if (!best || near.length > best.n) best = { n: near.length, x: mx, y: my };
  }
  return best;
}
for (const [zone, name] of [[0, "civic"], [1, "homes"], [2, "shops"], [3, "works"]].slice(0, 4)) {
  const d = densest(zone, 5);
  if (d) console.log(`densest ${name}: ${d.n} within 5 tiles, centred ${d.x.toFixed(1)},${d.y.toFixed(1)}`);
}
// A residential patch away from the middle.
const homes = state.buildings.filter((b) => b.zone === 1);
const far = homes.map((b) => ({ b, d: Math.hypot(b.x - cx, b.y - cy) })).sort((a, z) => z.d - a.d)[0];
console.log(`a far suburb at ${far.b.x},${far.b.y}`);
