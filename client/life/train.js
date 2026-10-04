// The train (slice T3; workitems-transport.md §T3, ruling 037).
//
// One train a LINE — a rail corridor — shuttling between its two ends and
// standing at the platform in between. Renderer-local and timed by the caller
// like everything else in `client/life/`: `update(dt)` takes a delta in
// seconds, nothing here asks the machine what time it is, and `?life=0` means
// the caller stops calling, so a screenshot is deterministic (D7).
//
// It is NOT on the lane graph. A lane is a direction on a road with a stop
// line and a junction box; a line has none of that, and a train that followed
// `links` would need a second graph over the rail corridors to say nothing the
// polyline does not already say. A train is an arc length and a sign.

import { getConfig } from "../world/config.js";

/** Where a train is along its corridor, and which way it is going. */
const OUT = { x: 0, y: 0, z: 0, tx: 1, tz: 0 };

/** Samples a corridor polyline `s` metres along, into `out`. Clamped at both
 * ends, and it carries the tangent, because a carriage has to face the way it
 * is travelling and a train that slides sideways round a bend is the one thing
 * anybody would notice. */
export function sampleLine(points, cum, s, out, heightAt) {
  const last = cum.length - 1;
  const d = s < 0 ? 0 : s > cum[last] ? cum[last] : s;
  let i = 1;
  while (i < last && cum[i] < d) i += 1;
  const span = cum[i] - cum[i - 1];
  const t = span > 1e-9 ? (d - cum[i - 1]) / span : 0;
  const a = points[i - 1];
  const b = points[i];
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.y = heightAt ? heightAt(out.x, out.z) : 0;
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  out.tx = (b.x - a.x) / len;
  out.tz = (b.z - a.z) / len;
  return out;
}

function arcLengths(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  }
  return cum;
}

/**
 * Where along a corridor a train should stop, or `undefined`.
 *
 * The nearest point on the line to a station's middle — a station stands
 * BESIDE its line (its footprint never carries rail), so the platform is the
 * projection of the building onto the track. A line with no station on it runs
 * through without stopping, which is what a line through open country does.
 *
 * `reach` is per STATION and comes from its own footprint: a 3×2 building
 * adjacent to the track has its middle a tile and a half from the centre line,
 * so a fixed reach either misses it or catches a station two blocks away.
 */
export function platformOn(corridor, cum, stations, tileM, slack = 0) {
  let best;
  for (const station of stations) {
    const sx = (station.x + station.w / 2) * tileM;
    const sz = (station.y + station.h / 2) * tileM;
    for (let i = 1; i < corridor.points.length; i += 1) {
      const a = corridor.points[i - 1];
      const b = corridor.points[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 1e-9 ? ((sx - a.x) * dx + (sz - a.z) * dz) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const d = Math.hypot(sx - px, sz - pz);
      if (d > (Math.max(station.w, station.h) / 2 + 1) * tileM + slack) continue;
      const s = cum[i - 1] + Math.sqrt(len2) * t;
      if (!best || d < best.d) best = { d, s, station: station.id };
    }
  }
  return best;
}

/**
 * The trains of one city.
 *
 * `options.life === false` freezes them where they stand — the same switch the
 * traffic and the crowd take, so one flag stops everything that moves.
 */
export function createTrains(state, model, options = {}) {
  const cfg = getConfig();
  const live = options.life !== false;
  const tileM = model.tileM;
  const spec = cfg.rail;
  const cap = options.cap ?? 8;

  const stations = state.buildings.filter((b) => b.def === "railStation");
  const lines = [];
  for (const corridor of model.rail?.corridors ?? []) {
    const cum = arcLengths(corridor.points);
    const length = cum[cum.length - 1];
    // A line has to be longer than the train that runs on it, or the carriages
    // are stacked on one another at both ends.
    const trainLen = spec.carriages * spec.carriageLen;
    if (length < trainLen + spec.carriageLen) continue;
    if (lines.length >= cap) break;
    lines.push({
      corridor: corridor.id,
      points: corridor.points,
      cum,
      length,
      platform: platformOn(corridor, cum, stations, tileM, spec.width / 2),
      // Starts OFF the line by one carriage, so the first thing a viewer sees
      // is a train arriving rather than one that was always there — and so the
      // wait before it appears is a second rather than the three a whole train
      // length would take.
      s: -spec.carriageLen,
      dir: 1,
      waited: 0,
      stopped: false,
    });
  }

  function advance(line, dt) {
    if (line.stopped) {
      line.waited += dt;
      if (line.waited < spec.dwell) return;
      line.stopped = false;
      line.waited = 0;
      // Leaves in the direction it was going; the turn-around happens at the
      // end of the line, not at the platform.
      line.s += line.dir * 0.01;
      return;
    }
    const was = line.s;
    line.s += line.dir * spec.speed * dt;

    // The platform, if the train crossed it this step and has not just left.
    const stop = line.platform;
    if (stop) {
      const crossed = line.dir > 0 ? (was < stop.s && line.s >= stop.s) : (was > stop.s && line.s <= stop.s);
      if (crossed) {
        line.s = stop.s;
        line.stopped = true;
        line.waited = 0;
        return;
      }
    }

    // The ends. A train runs off the edge, turns round out of sight and comes
    // back — which is what a branch line does, and which means one train can
    // serve a line without a second one appearing from nowhere.
    const trainLen = spec.carriages * spec.carriageLen;
    if (line.dir > 0 && line.s > line.length + trainLen) {
      line.dir = -1;
      line.s = line.length + trainLen;
    } else if (line.dir < 0 && line.s < -trainLen) {
      line.dir = 1;
      line.s = -trainLen;
    }
  }

  return {
    update(dt) {
      if (!live) return;
      for (const line of lines) advance(line, dt);
    },

    /** How many trains exist, whatever the camera is looking at. */
    count() {
      return lines.length;
    },

    stats() {
      let standing = 0;
      let onLine = 0;
      for (const line of lines) {
        if (line.stopped) standing += 1;
        if (line.s > 0 && line.s < line.length) onLine += 1;
      }
      return { trains: lines.length, standing, onLine, platforms: lines.filter((l) => l.platform).length };
    },

    /** Every carriage, in TILES — for a test and for a dump. The head carriage
     * is at `s`; the rest trail it by a carriage length each. */
    fleet() {
      const list = [];
      for (const line of lines) {
        for (let k = 0; k < spec.carriages; k += 1) {
          const s = line.s - line.dir * k * spec.carriageLen;
          if (s < 0 || s > line.length) continue;
          sampleLine(line.points, line.cum, s, OUT, model.railHeightAt ?? model.heightAt);
          list.push({
            corridor: line.corridor, carriage: k, stopped: line.stopped,
            x: OUT.x / tileM, y: OUT.y / tileM, z: OUT.z / tileM,
          });
        }
      }
      return list;
    },

    pose(pools, push, bounds) {
      const pool = pools.train;
      if (!pool) return 0;
      let posed = 0;
      for (const line of lines) {
        for (let k = 0; k < spec.carriages; k += 1) {
          const s = line.s - line.dir * k * spec.carriageLen;
          if (s < 0 || s > line.length) continue;
          sampleLine(line.points, line.cum, s, OUT, model.railHeightAt ?? model.heightAt);
          const tx = OUT.x / tileM;
          const tz = OUT.z / tileM;
          if (bounds && (tx < bounds.x0 - 2 || tx > bounds.x1 + 2 || tz < bounds.z0 - 2 || tz > bounds.z1 + 2)) continue;
          push(pool, tx, (OUT.y + spec.lift) / tileM, tz, 1, 1, 1,
            k === 0 ? 0xb03a30 : 0xd8d4cc, Math.atan2(-(line.dir * OUT.tz), line.dir * OUT.tx));
          posed += 1;
        }
      }
      return posed;
    },
  };
}
