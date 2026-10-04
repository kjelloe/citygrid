// Where a street's shoulder is a wall (S18, Q145 → A128).
//
// A street on graded ground stands above the land beside it: the height field
// hands back to the land over `road.blend`, four metres, and where the drop is
// deep that is a cliff at the kerbside — up to 14.7 m of it on a played `hilly`
// 128, every case beside water, where a road along a bank stands above the shore
// level S12 cuts to.
//
// S14 tried to move the GROUND and reverted it twice: widening the blend widens
// a corridor's influence as well as its shoulder (the walked street went from
// 53.5% to 71.8% steep), and a floor on the ground qualified 674 of 1,376
// corridors and buried a building. A batter needs space, and the city is built
// to the kerb.
//
// So this is a SURFACE, not a structure: the face is stone rather than grass,
// with a coping at the top. It changes no height — no lot, no lane, no walker
// and no gate is re-measured — and it is what a city does where a street stands
// three storeys above a river.
//
// Pure, and in `client/world/` for the usual reason: a decision that only exists
// inside three is a decision nobody can check.

/**
 * The runs of a line that need a retaining wall, with the depth at each point.
 *
 * `line` is the middle of the shoulder — the verge — with `tops[i]` the ground
 * at the kerb side of it and `feet[i]` the ground (or the water's surface) just
 * beyond. Two arrays rather than two callbacks, because the caller is the only
 * one that knows which way "beyond" is, and a hillside is then a literal in a
 * test.
 *
 * A run is only cut where the drop falls below `minDrop`: a wall that starts and
 * stops every few metres is a row of teeth, and the real thing runs the length
 * of what it holds up.
 */
export function retainingRuns(line, tops, feet, { minDrop = 1.2, maxDrop = 40 } = {}) {
  if (!line || line.length < 2) return [];
  const drops = line.map((unused, i) => {
    const drop = tops[i] - feet[i];
    return drop > minDrop ? Math.min(drop, maxDrop) : 0;
  });

  const runs = [];
  let points;
  let depths;
  for (let i = 0; i < line.length; i += 1) {
    if (drops[i] > 0) {
      if (!points) { points = []; depths = []; }
      points.push({ ...line[i], top: tops[i] });
      depths.push(drops[i]);
      continue;
    }
    // The point where the ground levels out still belongs to the wall: without
    // it the face stops a span early and the last metres of fill are grass
    // again, which is the join every wall in this project has to make.
    if (points) {
      points.push({ ...line[i], top: tops[i] });
      depths.push(0);
      if (points.length >= 2) runs.push({ points, drops: depths });
      points = undefined;
      depths = undefined;
    }
  }
  if (points && points.length >= 2) runs.push({ points, drops: depths });
  return runs;
}

/**
 * Every wall in a city, from the model: `{ at, drop, water }` per point.
 *
 * The baker asks the same question per baked run, from the kerbside lines it
 * already has; this answers it for the whole city, which is what a gate counts
 * and what a camera aims at. One rule, two callers — and the rule is the test
 * above rather than a number repeated in three files.
 */
export function wallRuns(model, cfg) {
  const T = cfg.tileM;
  const junction = cfg.road.width / 2 + cfg.road.sidewalk;
  const vergeHalf = (T / 2 - junction) / 2;
  const out = [];
  if (vergeHalf <= 0) return out;
  for (const c of model.corridors) {
    for (const sign of [-1, 1]) {
      const line = [];
      const tops = [];
      const feet = [];
      for (let i = 0; i < c.points.length; i += 1) {
        const a = c.points[Math.max(0, i - 1)];
        const b = c.points[Math.min(c.points.length - 1, i + 1)];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        const n = { x: (-dz / len) * sign, z: (dx / len) * sign };
        const p = c.points[i];
        const kerb = { x: p.x + n.x * junction, z: p.z + n.z * junction };
        const mid = { x: p.x + n.x * (junction + vergeHalf), z: p.z + n.z * (junction + vergeHalf) };
        const beyond = {
          x: p.x + n.x * (junction + vergeHalf * 2 + cfg.road.wallOut),
          z: p.z + n.z * (junction + vergeHalf * 2 + cfg.road.wallOut),
        };
        const level = model.waterLevelAt(beyond.x, beyond.z);
        line.push(mid);
        tops.push(model.heightAt(kerb.x, kerb.z));
        feet.push(level === undefined ? model.heightAt(beyond.x, beyond.z) : level);
        line[line.length - 1].water = level !== undefined;
      }
      for (const run of retainingRuns(line, tops, feet,
        { minDrop: cfg.road.wallMinDrop, maxDrop: cfg.road.wallMaxDrop })) {
        const deepest = Math.max(...run.drops);
        const at = run.points[Math.floor(run.points.length / 2)];
        out.push({ corridor: c.id, at, drop: deepest, water: run.points.some((p) => p.water) });
      }
    }
  }
  return out;
}
