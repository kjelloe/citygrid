// The service vehicles (slice B3b).
//
// A fire engine answering a fire, a patrol on its beat, and a street with the
// vans that come off an industrial estate. COUNTED before any of it is called
// a service: the fleet is a handful of vehicles in a city of hundreds of cars,
// and "there is traffic in the picture" is exactly how a fleet of zero looks.
//
//   reports/smoke-B3-engine.png   the engine, from the pavement by the fire
//   reports/smoke-B3-patrol.png   the patrol, on its beat
//   reports/smoke-B12-ambulance.png  the ambulance, on its way to a sick block
//   reports/smoke-B3-trucks.png   an industrial street and its vans
//
//     node tools/service_shots.mjs

import { shoot } from "./screenshot.mjs";

const SEED = 1003;
const SIZE = 64;
const YEARS = 25;

const ASK = `(state, view) => {
  const services = view.services;
  const stats = services ? services.stats() : { engines: 0, patrols: 0, atTheFire: 0 };
  const fleet = services ? services.fleet() : [];
  const traffic = view.traffic;
  const cars = traffic ? traffic.cars() : [];
  const vans = cars.filter((c) => c.variant === 2).length;
  return {
    ...stats,
    fleet: fleet.slice(0, 3),
    // Where the AMBULANCE is, not where it is going: a shot aimed at the sick
    // block had three ambulances in its count and none a reader could find
    // (S20's lesson, in the gate that was written after it).
    ambulanceAt: (fleet.find((v) => v.kind === "ambulance") ?? undefined),
    cars: cars.length,
    vans,
    fire: globalThis.SHOT_DAMAGE ? globalThis.SHOT_DAMAGE.fire : undefined,
    police: globalThis.SHOT_POLICE,
    sick: globalThis.SHOT_SICK,
  };
}`;

const problems = [];
async function frame(out, opts, want, aim) {
  const probe = await shoot({ out: `reports/.service-probe.png`, seed: SEED, years: YEARS, size: SIZE,
    width: 320, height: 240, life: true, frames: 60, extra: { __ask: ASK, ...(opts.extra ?? {}) } });
  const a0 = probe.answer ?? {};
  const at = aim(a0) ?? { x: 32, y: 32 };
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high",
    fx: at.x + 0.5, fy: at.y + 0.5, width: 1600, height: 900, streets: 60, frames: 90, life: true,
    ...opts, extra: { __ask: ASK, ...(opts.extra ?? {}) } });
  const a = r.answer ?? {};
  console.log(`${out} ok=${r.ok} engines=${a.engines} atTheFire=${a.atTheFire} patrols=${a.patrols} `
    + `ambulances=${a.ambulances ?? 0} cars=${a.cars} vans=${a.vans}`);
  if (!r.ok) for (const p of r.problems.slice(0, 3)) console.log("   ", p);
  for (const [key, min] of Object.entries(want)) {
    if ((a[key] ?? 0) < min) problems.push(`${out}: ${key} is ${a[key] ?? 0}, wanted ${min} or more`);
  }
  return a;
}

await frame("reports/smoke-B3-engine.png",
  { mode: "city", span: 9, pitch: 30, extra: { damage: "burn" } },
  { engines: 1 },
  (a) => a.fire);

await frame("reports/smoke-B3-patrol.png",
  { mode: "city", span: 9, pitch: 28, extra: { police: "1" } },
  { patrols: 1 },
  (a) => a.police);

// The ambulance (B12). `sick=1` raises `healthRisk` beside a clinic the deputy
// built, because a played city has the answerer and never the call.
// **The photo camera, not the city camera** (S20, and the `shot-camera-limits`
// lesson): a city span floors at eight tiles, so an ambulance photographed from
// the orbit is four pixels of white in a street grid — the count said three and
// the frame showed none. This stands twenty-five metres off at ten metres up
// and looks down at the vehicle itself.
{
  const probe = await shoot({ out: "reports/.ambulance-probe.png", seed: SEED, years: YEARS, size: SIZE,
    width: 320, height: 240, life: true, frames: 60, extra: { __ask: ASK, sick: "1" } });
  const at = probe.answer?.ambulanceAt;
  if (!at) {
    problems.push("no ambulance turned out at all, so there is nothing to photograph");
  } else {
    // Back off along the diagonal, which is never along the street the vehicle
    // is driving down — a camera on the carriageway sees the back of a van.
    const back = 1.25;
    const photo = `${(at.x + back).toFixed(3)},${(at.y + back).toFixed(3)},10,`
      + `${Math.atan2(back, back).toFixed(4)},-28`;
    const r = await shoot({ out: "reports/smoke-B12-ambulance.png", seed: SEED, years: YEARS, size: SIZE,
      tier: "high", photo, width: 1600, height: 900, streets: 60, frames: 90, life: true,
      extra: { __ask: ASK, sick: "1" } });
    const a = r.answer ?? {};
    console.log(`reports/smoke-B12-ambulance.png ok=${r.ok} ambulances=${a.ambulances ?? 0} `
      + `at ${at.x.toFixed(1)},${at.y.toFixed(1)} — camera ${back} tiles back, 10 m up`);
    if (!r.ok) for (const p of r.problems.slice(0, 3)) console.log("   ", p);
    if ((a.ambulances ?? 0) < 1) problems.push("the ambulance shot has no ambulance in the city");
  }
}

await frame("reports/smoke-B3-trucks.png",
  { mode: "city", span: 10, pitch: 26, extra: {} },
  { vans: 3, cars: 20 },
  (a) => (a.fleet[0] ? { x: a.fleet[0].x, y: a.fleet[0].y } : { x: 32, y: 32 }));

if (problems.length > 0) {
  for (const p of problems) console.error("FAIL —", p);
  process.exit(1);
}
console.log("\nservice shots ok");
