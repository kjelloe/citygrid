// What a car is, in metres (slice B3a).
//
// From the pavement a car was two boxes and a smear of wheels — the least
// detailed thing in a frame that has chimneys, shutters, zebra bars and now
// curtains. Three bodies, a glazed cabin and wheels that are round, from one
// pure module so the kit that builds them and any test that prices them read
// the same numbers.
//
// The budget is the item's: **120 triangles a car**, against 76 today. That is
// not much, so it is spent deliberately and `triangleCost` says where it went.

import { jitter } from "./hash.js";

/** Metres. A car is 2.2 m wide (B8 measured the lanes against it). */
const BODIES = {
  hatchback: {
    length: 3.9, width: 1.8, wheelbase: 2.5,
    bodyH: 0.62, sill: 0.34,
    cabin: { from: 0.34, to: 0.86, height: 0.54 },
    boot: false,
  },
  saloon: {
    length: 4.6, width: 1.82, wheelbase: 2.8,
    bodyH: 0.60, sill: 0.34,
    cabin: { from: 0.30, to: 0.70, height: 0.52 },
    boot: true,
  },
  van: {
    length: 5.1, width: 2.0, wheelbase: 3.1,
    bodyH: 1.05, sill: 0.42,
    cabin: { from: 0.10, to: 0.38, height: 0.62 },
    boot: false,
  },
};

export const BODY_NAMES = Object.keys(BODIES);

/** How many cars are vans (B3b).
 *
 * A van is a truck when it comes off an industrial street: one in eight
 * anywhere, and up to five in eight where the ground around the link is all
 * factory. The item asks for trucks "in proportion to the industrial share of a
 * link's tiles", and this is that proportion.
 */
export const VAN_SHARE = Object.freeze({ base: 0.12, industry: 0.45 });

/** Sides on a wheel. Six, not eight, and the arithmetic is in `triangleCost`:
 * eight with an outer cap is 24 triangles a wheel and puts a car at 124. */
export const WHEEL_SIDES = 6;
export const WHEEL = { radius: 0.32, width: 0.22 };

/** The body this vehicle has, from its id — so one car is one car between
 * frames and between two players' cities (ruling 032). */
export function bodyOf(id) {
  return BODY_NAMES[Math.floor(jitter(id, 907) * BODY_NAMES.length) % BODY_NAMES.length];
}

/**
 * One vehicle, in metres, origin at the centre of its footprint on the ground.
 *
 * `x` runs along the car, `z` across it. Everything the kit needs to build it
 * and everything a test needs to price it.
 */
export function vehicleSpec(id, bodyName = undefined) {
  const name = bodyName ?? bodyOf(id);
  const body = BODIES[name];
  const halfL = body.length / 2;
  const cabin = {
    x0: -halfL + body.length * body.cabin.from,
    x1: -halfL + body.length * body.cabin.to,
    y0: body.bodyH,
    y1: body.bodyH + body.cabin.height,
    halfW: body.width / 2 - 0.08,
  };
  const axle = body.wheelbase / 2;
  const wheels = [];
  for (const x of [-axle, axle]) {
    for (const z of [-(body.width / 2 - WHEEL.width / 2), body.width / 2 - WHEEL.width / 2]) {
      wheels.push({ x, z, radius: WHEEL.radius, width: WHEEL.width, sides: WHEEL_SIDES });
    }
  }
  return {
    body: name,
    length: body.length,
    width: body.width,
    height: cabin.y1,
    // The body sits ON its wheels, not on the road: a box at ground level with
    // wheels beside it is a toy.
    hull: { x0: -halfL, x1: halfL, y0: body.sill, y1: body.bodyH, halfW: body.width / 2 },
    cabin,
    boot: body.boot,
    wheels,
  };
}

/** What one vehicle costs, by part — the same arithmetic the kit spends.
 *
 * A box is 12, a quad is 2, a wheel is its sides as quads plus an outer cap of
 * one triangle a side (the inner face of a wheel is never seen from a
 * pavement). Asserted against the item's 120 in `test/vehicle-spec.test.js`,
 * because the kit imports three and node cannot load it to count for itself.
 */
export function triangleCost(spec) {
  const hull = 12;
  const cabin = 12;
  const glass = 2 * 2;
  const wheels = spec.wheels.reduce((n, w) => n + w.sides * 2 + w.sides, 0);
  return hull + cabin + glass + wheels;
}
