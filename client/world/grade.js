// Streets graded along their length (slice R3; A42, ruling 038).
//
// A corridor's height used to BE the land's height: `heightAt` inside a road
// returned the terrain at the nearest point on the centre line, so a street
// went wherever the hill went and the steepest on the saturated 96×96 was
// **37.1%**. Nothing could see it — a ribbon drapes onto whatever it is handed,
// and a picture of a very steep street is a picture of a very steep street.
//
// Kjell's answer (A42): *"Hills can be taller, but streets to max 15% sounds
// correct."* So a junction is where the land is — its height is fixed, and
// shared by every corridor meeting there, because two streets that disagree
// about it is a step in the road — and the profile BETWEEN two junctions is cut
// and filled until it obeys `road.maxGrade`.
//
// Pure, and in `client/world/`: it is arithmetic on a polyline.

/** How hard to push, and how many times.
 *
 * A projection onto the constraint set: each pass walks the profile and moves
 * the two ends of any span that is too steep towards each other by half the
 * excess, leaving pinned points where they are, then re-pins. Sixty passes is
 * far more than a corridor of a dozen points needs and still costs nothing —
 * the whole saturated 96×96 is 773 corridors of about five points each.
 */
const PASSES = 60;

/**
 * Grades a corridor's centre line.
 *
 * `points` is the polyline in metres, `landAt(x, z)` the bare terrain, and
 * `ends` the two node heights when the caller knows them — which it does,
 * because a node's height belongs to the node and not to the corridor.
 *
 * `flatEnds` is how much of each end is a JUNCTION rather than a street, and it
 * is level. Fixing the node height alone was not enough: a street still
 * climbing as it entered a junction had to be dragged up to meet the street
 * crossing it, and that drag — not the streets — was where the field's worst
 * grade came from. It is the same junction box the kerbside stops short of.
 *
 * Returns `{ cum, ys, len, steepest }`: the distance along at each point, the
 * graded height at each point, the total length, and the worst rise over run
 * left in it — which is the limit, unless the two ends are further apart in
 * height than the limit allows over the distance between them. In that case
 * nothing can obey it and the answer is the straight line, which is the least
 * bad profile there is rather than a gentle street with a cliff at one end.
 */
export function gradeProfile(rawPoints, landAt, { maxGrade, ends, flatEnds = 0 } = {}) {
  // Never more than a sixth of the street at each end. A junction box is 6.5 m
  // and a block in a dense grid is 20 m, so the fixed number left 7 m to make
  // the whole height change in — which is how a level junction turned a 17%
  // hill into a 29% street. A short corridor is mostly junction anyway.
  const box = Math.min(flatEnds, lengthOfPolyline(rawPoints) / 6);
  const points = box > 1e-6 ? withJunctionBoxes(rawPoints, box) : rawPoints;
  const n = points.length;
  const cum = new Float32Array(n);
  const ys = new Float32Array(n);
  if (n === 0) return { cum, ys, len: 0, steepest: 0 };

  let run = 0;
  for (let i = 0; i < n; i += 1) {
    if (i > 0) run += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    cum[i] = run;
    ys[i] = landAt(points[i].x, points[i].z);
  }
  // Which points are a junction rather than a street. `pin` is how many at each
  // end are held at the node height — one when there is no box, two when there
  // is, because the box's inner edge was inserted as a point.
  const pin = flatEnds > 0 && n >= 4 ? 2 : 1;
  if (ends) {
    for (let k = 0; k < pin; k += 1) {
      ys[k] = ends[0];
      ys[n - 1 - k] = ends[1];
    }
  }
  if (n < 2 || run < 1e-9) return { cum, ys, len: run, steepest: 0 };

  const g = maxGrade > 0 ? maxGrade : Infinity;
  // The run the grade actually has to fit into is the street, not the street
  // plus its two junctions.
  const graded = Math.max(1e-6, cum[n - pin] - cum[pin - 1]);
  const direct = Math.abs(ys[n - pin] - ys[pin - 1]) / graded;
  if (direct > g) {
    // The ends alone are steeper than the limit. Nothing with fixed ends can
    // obey it, so give the profile whose WORST span is as shallow as it can be:
    // a straight line between them.
    const lo = pin - 1;
    const hi = n - pin;
    for (let i = lo + 1; i < hi; i += 1) {
      ys[i] = ys[lo] + (ys[hi] - ys[lo]) * ((cum[i] - cum[lo]) / graded);
    }
    return { cum, ys, len: run, steepest: steepestOf(cum, ys) };
  }

  for (let pass = 0; pass < PASSES; pass += 1) {
    let moved = false;
    for (let i = 1; i < n; i += 1) {
      const seg = cum[i] - cum[i - 1];
      if (seg < 1e-9) continue;
      const allowed = g * seg;
      const drop = ys[i] - ys[i - 1];
      const excess = Math.abs(drop) - allowed;
      if (excess <= 1e-9) continue;
      moved = true;
      const sign = drop > 0 ? 1 : -1;
      // Both ends give way, unless one of them is a junction — cut on the high
      // side and fill on the low side, which is what makes a graded street
      // still climb instead of becoming a level terrace.
      const lowPinned = i - 1 <= pin - 1;
      const highPinned = i >= n - pin;
      if (lowPinned && highPinned) continue;
      if (lowPinned) ys[i] -= sign * excess;
      else if (highPinned) ys[i - 1] += sign * excess;
      else {
        ys[i] -= sign * excess * 0.5;
        ys[i - 1] += sign * excess * 0.5;
      }
    }
    if (ends) {
      for (let k = 0; k < pin; k += 1) {
        ys[k] = ends[0];
        ys[n - 1 - k] = ends[1];
      }
    }
    if (!moved) break;
  }

  return { cum, ys, len: run, steepest: steepestOf(cum, ys) };
}

/** The polyline with a point inserted `flatEnds` metres in from each end — the
 * inner edge of each junction box. A corridor shorter than its two boxes is
 * left alone: a street that is all junction is a junction. */
function withJunctionBoxes(points, flatEnds) {
  if (points.length < 2) return points;
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  }
  const len = cum[cum.length - 1];
  if (len <= flatEnds * 2 + 1e-6) return points;
  const at = (d) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i += 1;
    const seg = cum[i] - cum[i - 1] || 1;
    const t = (d - cum[i - 1]) / seg;
    return {
      x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
      z: points[i - 1].z + (points[i].z - points[i - 1].z) * t,
      d,
    };
  };
  const out = [points[0], at(flatEnds)];
  for (let i = 1; i < points.length - 1; i += 1) {
    if (cum[i] > flatEnds + 1e-6 && cum[i] < len - flatEnds - 1e-6) out.push(points[i]);
  }
  out.push(at(len - flatEnds), points[points.length - 1]);
  return out;
}

function lengthOfPolyline(points) {
  let run = 0;
  for (let i = 1; i < points.length; i += 1) {
    run += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  return run;
}

function steepestOf(cum, ys) {
  let worst = 0;
  for (let i = 1; i < ys.length; i += 1) {
    const seg = cum[i] - cum[i - 1];
    if (seg < 1e-9) continue;
    worst = Math.max(worst, Math.abs(ys[i] - ys[i - 1]) / seg);
  }
  return worst;
}

/** The graded height `s` metres along a profile. Linear between the points,
 * which is what makes a caller sampling every two metres see the same limit the
 * profile itself obeys. Clamped at both ends. */
/** Junction heights a street can actually be graded between (slice S11; A87).
 *
 * R3 pinned a junction to the land (A42) and graded the street between two of
 * them. That is right until the land between two junctions is steeper than any
 * street may be: `gradeProfile` sees `direct > maxGrade`, gives up, and draws a
 * straight line at whatever grade the land demanded. On `hilly` 128 that was
 * **485 of 1,458 corridors** and a steepest street of 98.1% — the terrain was
 * scenery, which is Q64 and Q74.
 *
 * So the junctions give way too, within a cap. One Gauss-Seidel pass per
 * corridor moves both ends halfway toward the limit; the clamp afterwards keeps
 * every node within `maxDrift` of its own land, which is what makes this a cut
 * and an embankment rather than a road on stilts — every lot, lawn and walker
 * still reads the land. The two fight, deliberately: the cap wins, and what is
 * left over is a street `gradeProfile` straightens as it always did.
 *
 * `maxDrift` at or below zero turns it off, the way `maxGrade` turns grading
 * off, so one harness can measure the before and the after (R3's lesson).
 */
export function relaxNodes(network, landAt, maxGrade, maxDrift, passes = PASSES) {
  const height = new Map();
  const land = new Map();
  for (const node of network.nodes) {
    const h = landAt(node.x, node.z);
    height.set(node.id, h);
    land.set(node.id, h);
  }
  if (!(maxGrade > 0) || !(maxDrift > 0)) return height;

  // The run the grade has to fit into is the street, NOT the street plus its
  // two junction boxes — the same subtraction `gradeProfile` makes, or this
  // relaxes to a limit the profile cannot meet and `ungradeable` does not move
  // (measured: 485 of 1,458 corridors before the subtraction and 485 after,
  // while the field's steepest fell, which is what said the two disagreed).
  const spans = [];
  for (const c of network.corridors) {
    const len = lengthOfPolyline(c.points);
    if (len <= 1e-6 || !height.has(c.from) || !height.has(c.to)) continue;
    const box = Math.min(c.frontage ?? 0, len / 6);
    const graded = Math.max(1e-6, len - 2 * box);
    spans.push({ from: c.from, to: c.to, allowed: maxGrade * graded });
  }

  for (let pass = 0; pass < passes; pass += 1) {
    let moved = false;
    for (const span of spans) {
      const a = height.get(span.from);
      const b = height.get(span.to);
      const drop = b - a;
      const excess = Math.abs(drop) - span.allowed;
      if (excess <= 1e-9) continue;
      moved = true;
      const sign = drop > 0 ? 1 : -1;
      height.set(span.to, b - sign * excess * 0.5);
      height.set(span.from, a + sign * excess * 0.5);
    }
    for (const [id, h] of height) {
      const l = land.get(id);
      if (h > l + maxDrift) height.set(id, l + maxDrift);
      else if (h < l - maxDrift) height.set(id, l - maxDrift);
    }
    if (!moved) break;
  }
  return height;
}

/**
 * Is this the same graded profile as that one? (W6b.)
 *
 * By VALUE, because every derivation builds new objects: a dirty set that
 * compared profiles by reference would find nothing reusable and say so by
 * being slow rather than by failing. One definition, read by the lane graph
 * (which packs lanes on a corridor's own profile) and by the nav graph (which
 * uses it to decide whether the ground under a pavement moved).
 */
export function sameProfile(a, b) {
  if (a === b) return true;
  if (!a || !b || a.len !== b.len || a.ys.length !== b.ys.length) return false;
  for (var i = 0; i < a.ys.length; i += 1) if (a.ys[i] !== b.ys[i]) return false;
  return true;
}

export function heightOnProfile(profile, s) {
  const { cum, ys } = profile;
  const last = ys.length - 1;
  if (last < 0) return 0;
  if (last === 0) return ys[0];
  const d = s < 0 ? 0 : s > profile.len ? profile.len : s;
  let i = 1;
  while (i < last && cum[i] < d) i += 1;
  const seg = cum[i] - cum[i - 1];
  const t = seg > 1e-9 ? (d - cum[i - 1]) / seg : 0;
  return ys[i - 1] + (ys[i] - ys[i - 1]) * t;
}

/**
 * Every corridor of a network, graded — the shape `createGround` builds for the
 * roads, as a function, so a second network can have one too (Q120, A118).
 *
 * The railway is that second network. Grading it the way a road is graded would
 * mean the HEIGHT FIELD carrying it, and the field is what every lot, lane,
 * prop and walker reads — a line nobody stands on is not worth re-measuring the
 * city for. So this returns the profiles and nothing else: `rails-l3` draws the
 * track on them and hangs the cutting and the embankment under it, and the
 * ground stays where it is.
 */
export function profilesFor(network, sampleAt, { maxGrade, drift = 0, flatEnds = 0, freeEnds = false } = {}) {
  const profiles = new Map();
  if (!network || maxGrade <= 0) return profiles;
  const nodeHeight = drift > 0
    ? relaxNodes(network, sampleAt, maxGrade, drift)
    : new Map();
  for (const c of network.corridors) {
    const last = c.points[c.points.length - 1];
    let ends = [
      nodeHeight.get(c.from) ?? sampleAt(c.points[0].x, c.points[0].z),
      nodeHeight.get(c.to) ?? sampleAt(last.x, last.z),
    ];
    // A railway's ends are not a junction with a street: they are the line's
    // own, and a line that cannot make its gradient CUTS. Pinning them at the
    // land is what left the track at the terrain's own 10% — `gradeProfile`
    // says so itself ("nothing with fixed ends can obey it") and draws a
    // straight line between them. So the two ends are pulled toward each other
    // until the end-to-end gradient fits, and the relaxation below smooths what
    // is between (Q120, A118).
    if (freeEnds) {
      const span = lengthOfPolyline(c.points);
      const allowed = maxGrade * span;
      const rise = ends[1] - ends[0];
      if (Math.abs(rise) > allowed) {
        const mid = (ends[0] + ends[1]) / 2;
        const half = allowed / 2;
        ends = rise > 0 ? [mid - half, mid + half] : [mid + half, mid - half];
      }
    }
    profiles.set(c.id, gradeProfile(c.points, sampleAt, { maxGrade, ends, flatEnds }));
  }
  return profiles;
}
