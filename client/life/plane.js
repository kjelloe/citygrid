// The aircraft (slice T5b; D7, ruling 037).
//
// One at a time at each airport, and the whole of it is a cycle: in from
// outside the region on the runway's axis, down, roll out, turn off, taxi to
// the stand, wait, taxi back, take off, climb away, and round again.
//
// The cycle is a list of SEGMENTS with durations, and a pose is a pure function
// of how far through the cycle the clock is — `update(dt)` only advances a
// scalar. That is what makes the same seconds in two different step sizes land
// in the same place, which a per-frame integrator does not give you for free.
//
// Timed by the caller like everything in `client/life/`: nothing here asks the
// machine what time it is, and `?life=0` means the caller stops calling.

import { getConfig } from "../world/config.js";
import { airfieldOf } from "../world/airfield.js";

/** A straight leg, with a height at each end. `name` is what `fleet()` reports,
 * so a test can assert the cycle happened rather than that it moved. */
function leg(name, from, to, seconds, y0 = 0, y1 = 0) {
  return { name, from, to, seconds: Math.max(seconds, 1e-3), y0, y1 };
}

const far = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

/**
 * The flight plan for one airfield: approach, roll, taxi, stand, taxi back,
 * take off, climb.
 *
 * Both ends of the runway are used — it lands on the near threshold and takes
 * off over the far one — so the aircraft crosses the whole field rather than
 * shuttling at one end, which is the difference between an airport and a ramp.
 */
function flightFor(plan, spec) {
  const [a, b] = plan.line;
  const dir = { x: Math.sign(b.x - a.x), z: Math.sign(b.z - a.z) };
  const out = (point, metres) => ({ x: point.x - dir.x * metres, z: point.z - dir.z * metres });
  const climbTop = spec.approachM * spec.climbGrade;
  const roll = (spec.cruiseSpeed + spec.taxiSpeed) / 2;

  const touchdown = a;
  const turnoff = plan.on(plan.from + plan.length * 0.75, plan.centre);
  const onTaxi = plan.on(plan.from + plan.length * 0.75, plan.taxiMid);
  const beside = plan.on(plan.axis === "x" ? plan.stand.x : plan.stand.z, plan.taxiMid);
  const rotate = plan.on(plan.from + plan.length * 0.7, plan.centre);
  const away = { x: b.x + dir.x * spec.approachM, z: b.z + dir.z * spec.approachM };

  const legs = [
    leg("approach", out(touchdown, spec.approachM), touchdown, spec.approachM / spec.cruiseSpeed, climbTop, 0),
    leg("roll", touchdown, turnoff, far(touchdown, turnoff) / roll),
    leg("taxi", turnoff, onTaxi, far(turnoff, onTaxi) / spec.taxiSpeed),
    leg("taxi", onTaxi, beside, far(onTaxi, beside) / spec.taxiSpeed),
    leg("taxi", beside, plan.stand, far(beside, plan.stand) / spec.taxiSpeed),
    leg("stand", plan.stand, plan.stand, spec.turnaround),
    leg("taxi", plan.stand, beside, far(plan.stand, beside) / spec.taxiSpeed),
    leg("taxi", beside, onTaxi, far(beside, onTaxi) / spec.taxiSpeed),
    leg("taxi", onTaxi, touchdown, far(onTaxi, touchdown) / spec.taxiSpeed),
    leg("takeoff", touchdown, rotate, far(touchdown, rotate) / roll),
    leg("climb", rotate, away, far(rotate, away) / spec.cruiseSpeed, 0, climbTop),
  ];
  let period = 0;
  for (const l of legs) period += l.seconds;
  return { legs, period };
}

/** Where the aircraft is `t` seconds into its cycle. */
function poseAt(flight, t) {
  let left = ((t % flight.period) + flight.period) % flight.period;
  for (const l of flight.legs) {
    if (left > l.seconds) { left -= l.seconds; continue; }
    const k = l.seconds > 0 ? left / l.seconds : 0;
    const x = l.from.x + (l.to.x - l.from.x) * k;
    const z = l.from.z + (l.to.z - l.from.z) * k;
    const dx = l.to.x - l.from.x;
    const dz = l.to.z - l.from.z;
    return {
      phase: l.name, x, z,
      y: l.y0 + (l.y1 - l.y0) * k,
      // A still aircraft keeps the heading of the leg that brought it in, which
      // for the stand is the taxi it arrived on — so it does not snap north
      // while it waits.
      turn: dx === 0 && dz === 0 ? undefined : Math.atan2(dx, dz),
    };
  }
  const last = flight.legs[flight.legs.length - 1];
  return { phase: last.name, x: last.to.x, z: last.to.z, y: last.y1, turn: undefined };
}

/**
 * The aircraft of one city.
 *
 * `options.life === false` leaves them where they are — the same switch the
 * traffic, the crowd, the train and the boats take.
 */
export function createPlanes(state, model, options = {}) {
  const cfg = getConfig();
  const spec = cfg.airport;
  const tileM = model.tileM;
  const live = options.life !== false;

  const flights = [];
  for (let i = 0; i < state.buildings.length; i += 1) {
    const plan = airfieldOf(state.buildings[i]);
    if (!plan) continue;
    const flight = flightFor(plan, spec);
    // Staggered by the building's id, so two airports in one region are not
    // one aircraft seen twice.
    flights.push({ plan, flight, t: (state.buildings[i].id * 37) % flight.period, turn: 0 });
  }

  function poseOf(entry) {
    const at = poseAt(entry.flight, entry.t);
    if (at.turn !== undefined) entry.turn = at.turn;
    return { ...at, turn: entry.turn };
  }

  return {
    update(dt) {
      if (!live || !(dt > 0)) return;
      for (const entry of flights) entry.t += dt;
    },

    count() {
      return flights.length;
    },

    stats() {
      return {
        planes: flights.length,
        phases: flights.map((e) => poseOf(e).phase),
        // The cycle, and how far into it each aircraft is: a shot tool cannot
        // photograph a landing without knowing when one happens, and 56
        // seconds of cycle is 3,400 drawn frames to wait for it (T5b).
        period: flights.length > 0 ? flights[0].flight.period : 0,
        at: flights.map((e) => e.t % e.flight.period),
      };
    },

    /** Every aircraft, in METRES — the airfield's own unit, and a test's. */
    fleet() {
      return flights.map((entry) => ({ ...poseOf(entry), axis: entry.plan.axis }));
    },

    pose(pools, push, bounds) {
      let posed = 0;
      for (const entry of flights) {
        const at = poseOf(entry);
        const x = at.x / tileM;
        const z = at.z / tileM;
        if (bounds && (x < bounds.x0 - 4 || x > bounds.x1 + 4 || z < bounds.z0 - 4 || z > bounds.z1 + 4)) continue;
        const ground = model.heightAt(at.x, at.z) ?? 0;
        push(pools.plane, x, (ground + at.y + 1.6) / tileM, z, 1, 1, 1, spec.planeColour, at.turn);
        posed += 1;
      }
      return posed;
    },
  };
}
