// Level of detail, driven by a configurable triangle budget.
//
// The budget is a NUMBER YOU SET, not a constant baked into the renderer:
// `setBudget(80000)` is the default, and a phone, a debug view or the perf
// harness can each ask for a different one. Everything else here is the policy
// that spends it.
//
// The camera is orthographic, which changes the usual LOD question. There is no
// perspective foreshortening, so distance from the camera means nothing — every
// building is the same size on screen whatever its depth. What decides whether
// detail is visible is ZOOM: how many pixels a tile covers. Below about a dozen
// pixels a tile, a window sill is smaller than a pixel and drawing one is pure
// cost.
//
// So the policy is: work out how big a tile is on screen, pick the coarsest
// tier whose estimated cost fits the budget, and never draw detail nobody can
// see.

/** Tiers, coarsest last. Each names what it keeps. */
export const TIER = {
  FULL: 2,   // windows, sills, doors, roof clutter, fences, props, trees
  SHAPE: 1,  // silhouette only: walls, roofs, chimneys. No surface detail.
  BLOCK: 0,  // a box with a roof colour. For when a building is a few pixels.
};

/** Measured triangle cost of one instance at each tier. These come from the
 * geometry itself at startup (see measureCosts) rather than being guessed —
 * a guessed cost budget is not a budget. */
const DEFAULT_COSTS = {
  building: { 2: 620, 1: 190, 0: 36 },
  // A tier-0 tree is a stump and a canopy, not nothing. Pricing it at zero
  // hid 18,000 triangles from a budget that was supposed to be counting them.
  tree: { 2: 150, 1: 44, 0: 20 },
  prop: { 2: 90, 1: 0, 0: 0 },
  // The ground costs are MEASURED and passed in by `createInstances`, like
  // buildings and trees. They were remembered instead until P35, and the
  // memory went stale the moment N28 turned a road into a skirted box: the
  // table still said `road: 2, // one upward quad` while the renderer drew
  // twelve. The planner believed 79,068 triangles against an 80,000 budget
  // while three drew 97,500 — with the whole sacrifice ladder already spent.
  road: 0,      // painted into the terrain mesh since N30; free
  car: 76,      // measured from the car pool by `createInstances`
  marking: 2,
  pole: 12,     // a box; vertical, so it cannot be flattened
  wireHub: 2,
  wireArm: 2,
  pipeHub: 2,
  pipeArm: 2,
};

/** One terrain chunk is 16x16 tiles at two triangles each. Terrain is not
 * optional and has no tiers — it is the ground — so it comes off the top of
 * the budget rather than being traded against. */
const CHUNK_TRIANGLES = 16 * 16 * 2;

let budget = 80000;
let costs = DEFAULT_COSTS;

/** The whole point of the slice: the budget is configurable. */
export function setBudget(triangles) {
  budget = Math.max(1000, Math.floor(triangles));
}

export function getBudget() {
  return budget;
}

/** Replaces the estimated per-instance costs with measured ones. Called once
 * the geometry exists, so the policy spends a real budget rather than a
 * remembered one. */
export function setCosts(measured) {
  costs = { ...DEFAULT_COSTS, ...measured };
}

export function getCosts() {
  return costs;
}

/** How many screen pixels one world tile covers.
 *
 * With an orthographic camera the vertical span is `view.span` tiles over the
 * canvas height, and every tile is that size — one number for the frame.
 *
 * A perspective camera puts every tile at a different size, so the quantity
 * becomes **per chunk** (slice V5, spec §8.2): the tile's own size in pixels at
 * the distance from the eye to the chunk's centre. Pass a `{ x, z }` in tile
 * coordinates to ask about a chunk; ask without one and you get the value at
 * the orbit target, which is where the two projections agree by construction —
 * the eye distance is derived from `span` for exactly that reason.
 */
export function tilePixels(view, canvasHeight, chunk) {
  if (!view || !canvasHeight || !view.span) return 0;
  if (view.mode !== "city") return canvasHeight / view.span;

  const focalPx = canvasHeight / (2 * Math.tan(((view.fov ?? 50) * Math.PI) / 360));
  const pitch = view.pitch ?? Math.atan(1 / Math.SQRT2);
  // `span` is tiles across the SHORTER axis; the field of view is vertical.
  const vertical = (view.aspect ?? 1) >= 1 ? view.span : view.span / view.aspect;
  const distance = vertical / (2 * Math.tan(((view.fov ?? 50) * Math.PI) / 360));
  const eyeX = view.targetX + Math.sin(view.yaw) * Math.cos(pitch) * distance;
  const eyeY = Math.sin(pitch) * distance;
  const eyeZ = view.targetZ + Math.cos(view.yaw) * Math.cos(pitch) * distance;
  const px = chunk ? chunk.x : view.targetX;
  const pz = chunk ? chunk.z : view.targetZ;
  // Never smaller than the near plane: a chunk at the eye would otherwise
  // report an unbounded size, and a chunk BEHIND the eye is simply far away —
  // the distance is unsigned, which is what stops it coming back as the finest
  // detail in the frame.
  const range = Math.max(0.5, Math.hypot(px - eyeX, eyeY, pz - eyeZ));
  return focalPx / range;
}

/** The resolvability thresholds, in pixels per tile. One table, read by the
 * frame plan and by every chunk plan, so the two can never disagree. */
const RESOLVE = {
  props: 42, cars: 18, markings: 20, poles: 14, networks: 12,
  shape: 30, shadows: 16, block: 13, trees: 8,
  // Above this a chunk is worth BAKING rather than instancing (slice E2, spec
  // §8.2): 160 px a tile at TILE_M = 20 is a chunk within about 40–60 m of the
  // camera, which is the range at which a wall stops being a silhouette.
  l3: 160,
};

/** A chunk's own plan: the frame's plan with whatever this chunk's zoom cannot
 * resolve taken away.
 *
 * Only ever coarser. The frame plan is what the budget bought and a chunk may
 * give more up but never take anything back — otherwise a distant chunk could
 * come out finer than the one under the cursor, which is the exact failure a
 * per-chunk policy is supposed to prevent. */
export function planForChunk(plan, px) {
  const out = { ...plan };
  // The one thing a chunk plan may ADD, and only when the frame allows any
  // street chunks at all: L3 is per chunk by definition — it is the answer to
  // "is this chunk close enough to be worth baking".
  out.l3 = plan.streetChunks > 0 && px >= RESOLVE.l3;
  if (px < RESOLVE.props) out.props = false;
  if (px < RESOLVE.cars) out.cars = false;
  if (px < RESOLVE.markings) out.markings = false;
  if (px < RESOLVE.poles) out.poles = false;
  if (px < RESOLVE.networks) out.networks = false;
  if (px < RESOLVE.shadows) out.shadows = false;
  if (px < RESOLVE.shape) {
    out.buildings = Math.min(out.buildings, TIER.SHAPE);
    out.treeDetail = Math.min(out.treeDetail, TIER.SHAPE);
  }
  if (px < RESOLVE.block) out.buildings = Math.min(out.buildings, TIER.BLOCK);
  if (px < RESOLVE.trees) out.trees = false;
  return out;
}

/** Estimated triangles for a given plan.
 *
 * `planFor(cx, cz)` makes it per chunk (slice V5). Under perspective most
 * chunks draw at a coarser plan than the frame's, so pricing them all at the
 * frame's plan over-charges — 77% over at close zoom, measured — and an
 * over-charging estimate silently sacrifices detail the frame had room for
 * (P35). Without it, the frame's own plan prices everything, which is exactly
 * right for an orthographic camera. */
export function estimate(counts, plan, planFor) {
  if (planFor && counts.chunks) {
    let total = counts.groundChunks * CHUNK_TRIANGLES;
    for (const [key, part] of counts.chunks) {
      const cz = Math.floor(key / 4096);
      const cx = key - cz * 4096;
      total += estimateOne({ ...part, groundChunks: 0 }, planFor(cx, cz));
    }
    return total;
  }
  return estimateOne(counts, plan);
}

function estimateOne(counts, plan) {
  const b = costs.building[plan.buildings] ?? 0;
  const t = plan.trees ? (costs.tree[plan.treeDetail] ?? 0) : 0;
  const p = plan.props ? costs.prop[2] : 0;

  const casters = counts.buildings * b + counts.trees * t + counts.props * p;
  const flat = counts.roads * costs.road
    + (plan.cars !== false ? counts.cars * costs.car : 0)
    + (plan.markings ? counts.markArms * costs.marking : 0)
    // Every network the renderer draws has a term here. Wire and pipe had
    // none, and `counts.poles` was computed and then never read — a term
    // missing from the estimate is a term the budget cannot trade away (P35).
    + (plan.networks !== false
      ? counts.wireTiles * costs.wireHub + counts.wireArms * costs.wireArm
        + counts.pipeTiles * costs.pipeHub + counts.pipeArms * costs.pipeArm
      : 0)
    + (plan.poles !== false ? Math.round(counts.poles / 3) * costs.pole : 0)
    + counts.groundChunks * CHUNK_TRIANGLES;

  // Casters count ONCE, and this used to be twice.
  //
  // A shadow pass does redraw every caster, and when that was found the actual
  // was 2× the estimate (ruling 019). It is not any more: measured on the real
  // page, toggling `shadowMap.enabled` moves `info.render.triangles` by exactly
  // zero — three resets the counter after the shadow pass, so the number this
  // budget is DEFINED by never sees it. Charging twice against a measurement
  // that only ever counts once put the estimate 92% over the truth at close
  // zoom, and the ladder dropped the props you zoomed in to look at (P35).
  //
  // The shadow pass still costs the GPU real work; that is a frame-time
  // question, and the ladder still sacrifices shadows before building detail.
  // It is not a triangle-budget question, because the triangle budget cannot
  // see it.
  return casters + flat;
}

/** The order in which detail is sacrificed. Deliberate: small props first,
 * then road markings, poles, shadows, then building surface detail, then
 * trees. Buildings are the city; grass tufts are not.
 *
 * One ladder, used twice — once by the estimate and once by the measurement —
 * so a plan cannot mean two different things depending on which gate produced
 * it. */
const LADDER = [
  // The farthest baked street chunk goes FIRST: it is the most expensive thing
  // in the frame and the one the player is least likely to be looking at
  // (spec §8.2, slice E2).
  (p) => (p.streetChunks > 0 ? ((p.streetChunks -= 1), "street chunk dropped") : ""),
  (p) => (p.props ? ((p.props = false), "props dropped") : ""),
  // Cars go late, between props and markings: they are the thing that was
  // asked for, and a city with no traffic reads as a model rather than a place.
  (p) => (p.cars ? ((p.cars = false), "cars dropped") : ""),
  (p) => (p.markings ? ((p.markings = false), "markings dropped") : ""),
  (p) => (p.poles ? ((p.poles = false), "poles dropped") : ""),
  (p) => (p.networks ? ((p.networks = false), "networks dropped") : ""),
  (p) => (p.shadows ? ((p.shadows = false), "shadows dropped") : ""),
  (p) => (p.buildings > TIER.SHAPE ? ((p.buildings = TIER.SHAPE), (p.treeDetail = TIER.SHAPE), "detail dropped") : ""),
  (p) => (p.treeDetail > TIER.BLOCK ? ((p.treeDetail = TIER.BLOCK), "trees simplified") : ""),
  (p) => (p.buildings > TIER.BLOCK ? ((p.buildings = TIER.BLOCK), "silhouettes only") : ""),
  (p) => (p.trees ? ((p.trees = false), "trees dropped") : ""),
];

/** Takes one step down the ladder. Returns false when there is nothing left to
 * give — at which point the city is boxes on ground and the budget is simply
 * too small for the map. */
export function stepDown(plan) {
  while (plan.step < LADDER.length) {
    const note = LADDER[plan.step](plan);
    plan.step += 1;
    if (note) {
      plan.reason = note + " for budget";
      return true;
    }
  }
  return false;
}

export function ladderLength() {
  return LADDER.length;
}

/**
 * Chooses what to draw.
 *
 * Two gates, in order:
 *
 *   1. **Resolvability.** Below a few pixels a tile, detail is invisible, so it
 *      is dropped whether or not the budget allows it. Drawing a window sill
 *      smaller than a pixel is not a trade-off, it is waste.
 *   2. **Budget.** Whatever survives is stepped down until the estimate fits,
 *      and then stepped down again once per unit of measured overshoot. The
 *      order of sacrifice is deliberate: small props first, then markings,
 *      poles, shadows, then building detail. Buildings are the city; grass
 *      tufts are not.
 */
export function choosePlan(counts, view, canvasHeight, options = {}) {
  const px = options.tilePixels ?? tilePixels(view, canvasHeight);
  const cap = options.budget ?? budget;
  // Under perspective the renderer draws each chunk at its own plan, so the
  // estimate has to price them the same way or it over-charges (P35).
  const CHUNK = 16;
  const planFor = view?.mode === "city" && canvasHeight
    ? (base) => (cx, cz) => planForChunk(
      base, tilePixels(view, canvasHeight, { x: (cx + 0.5) * CHUNK, z: (cz + 0.5) * CHUNK }),
    )
    : undefined;

  // Gate one: what is resolvable at this zoom.
  let plan = {
    buildings: TIER.FULL,
    treeDetail: TIER.FULL,
    trees: true,
    props: true,
    markings: true,
    poles: true,
    networks: true,
    cars: true,
    // How many chunks of baked street the tier allows around the camera. Set
    // by the caller from the tier (ruling 040); 0 means none at all.
    streetChunks: options.streetChunks ?? 0,
    l3: false,
    shadows: true,
    reason: "full",
    tilePixels: Math.round(px),
    step: 0,
  };
  if (px < RESOLVE.props) { plan.props = false; plan.reason = "props not resolvable"; }
  // A car is 0.22 of a tile long. Below about eighteen pixels a tile it is
  // four pixels of a colour that is already on the road, and there may be
  // hundreds of them (slice V1).
  if (px < RESOLVE.cars) { plan.cars = false; plan.reason = "cars not resolvable"; }
  if (px < RESOLVE.markings) { plan.markings = false; plan.reason = "markings not resolvable"; }
  if (px < RESOLVE.poles) { plan.poles = false; plan.reason = "poles not resolvable"; }
  // A wire ribbon is 0.16 of a tile wide and a pipe main 0.28, so below about
  // twelve pixels a tile they are drawing a line thinner than a pixel — and on
  // a wired city they are the single largest thing on screen: 13,476 instances
  // and 43% of the frame at the default span on a 64x64 (slice V2). The power
  // and water overlays still say where the network reaches.
  if (px < RESOLVE.networks) { plan.networks = false; plan.reason = "networks not resolvable"; }
  if (px < RESOLVE.shape) { plan.buildings = TIER.SHAPE; plan.treeDetail = TIER.SHAPE; plan.reason = "detail not resolvable"; }
  if (px < RESOLVE.shadows) { plan.shadows = false; plan.reason = "shadows not resolvable"; }
  if (px < RESOLVE.block) { plan.buildings = TIER.BLOCK; plan.reason = "silhouette only"; }
  if (px < RESOLVE.trees) { plan.trees = false; plan.reason = "buildings only"; }

  // Gate two: spend down to the budget, by estimate.
  while (plan.step < LADDER.length && estimate(counts, plan, planFor?.(plan)) > cap) stepDown(plan);

  plan.estimate = estimate(counts, plan, planFor?.(plan));
  plan.budget = cap;
  plan.overBudget = plan.estimate > cap;
  return plan;
}

/** The world-space rectangle the camera can actually see, plus a margin so a
 * building at the edge does not pop as it enters.
 *
 * This is what makes the budget mean anything. Counting the whole city when
 * only a twentieth of it is on screen made a zoomed-in view drop the very
 * detail it had the most room for. */
export function visibleBounds(view, aspect, margin = 3) {
  const halfY = view.span / 2;
  const halfX = halfY * Math.max(1, aspect);
  const pitch = view.pitch ?? Math.atan(1 / Math.SQRT2);

  if (view.mode === "city") {
    // A perspective frustum is a WEDGE, not a box: it opens out toward the
    // horizon, so a symmetric reach either cuts the distance off or pays for a
    // huge area behind the eye. The four corner rays are intersected with the
    // ground and the box is drawn round what they hit — with a ray that escapes
    // over the horizon clamped to the far plane, which is the only thing that
    // stops the answer running to infinity at a low pitch (slice V5).
    const fov = ((view.fov ?? 50) * Math.PI) / 180;
    const vertical = aspect >= 1 ? view.span : view.span / aspect;
    const distance = (vertical / 2) / Math.tan(fov / 2);
    const eyeX = view.targetX + Math.sin(view.yaw) * Math.cos(pitch) * distance;
    const eyeY = Math.sin(pitch) * distance;
    const eyeZ = view.targetZ + Math.cos(view.yaw) * Math.cos(pitch) * distance;

    // Camera basis: forward toward the target, right and up from it.
    const fx = view.targetX - eyeX;
    const fy = -eyeY;
    const fz = view.targetZ - eyeZ;
    const flen = Math.hypot(fx, fy, fz) || 1;
    const f = [fx / flen, fy / flen, fz / flen];
    // right = normalise(f × up), up' = right × f
    const r = [f[2], 0, -f[0]];
    const rlen = Math.hypot(r[0], r[2]) || 1;
    r[0] /= rlen; r[2] /= rlen;
    const u = [
      r[1] * f[2] - r[2] * f[1],
      r[2] * f[0] - r[0] * f[2],
      r[0] * f[1] - r[1] * f[0],
    ];

    const tanY = Math.tan(fov / 2);
    const tanX = tanY * Math.max(aspect, 1e-3);
    const far = view.persp?.far ?? 4000;
    let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
    const corners = [];
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      {
        const dx = f[0] + r[0] * sx * tanX + u[0] * sy * tanY;
        const dy = f[1] + r[1] * sx * tanX + u[1] * sy * tanY;
        const dz = f[2] + r[2] * sx * tanX + u[2] * sy * tanY;
        const len = Math.hypot(dx, dy, dz) || 1;
        // Where this corner ray meets the ground, or the far plane if it never
        // does. `t` is in world units along the normalised ray.
        const ny = dy / len;
        const t = ny < -1e-6 ? Math.min(far, eyeY / -ny) : far;
        const hx = eyeX + (dx / len) * t;
        const hz = eyeZ + (dz / len) * t;
        if (hx < x0) x0 = hx; if (hx > x1) x1 = hx;
        if (hz < z0) z0 = hz; if (hz > z1) z1 = hz;
        corners.push({ x: hx, z: hz });
      }
    }
    // The eye's own ground position too: at a high pitch the four corners can
    // all land beyond the tile the camera is directly over.
    if (eyeX < x0) x0 = eyeX; if (eyeX > x1) x1 = eyeX;
    if (eyeZ < z0) z0 = eyeZ; if (eyeZ > z1) z1 = eyeZ;
    // The FOOTPRINT as well as its box. The box of a wedge holds far more
    // ground than the wedge does, and terrain is frustum-culled by three — so
    // charging the budget for every chunk in the box over-charged it by a
    // quarter at a wide zoom (slice V5, and the same shape as N30's "charged
    // 49k for ground never drawn").
    return { x0: x0 - margin, x1: x1 + margin, y0: z0 - margin, y1: z1 + margin, footprint: corners };
  }

  // A rotated orthographic view sweeps a larger axis-aligned box than its own
  // rectangle; the diagonal covers every yaw without a per-angle special case.
  //
  // And a TILTED one sweeps further still. The screen's vertical half-extent
  // lands on the ground stretched by 1/sin(pitch) — at 20° that is nearly three
  // times as far — so a camera dropped towards the horizon (P34) sees a long
  // way up the map. Bounds that ignore it cull the distance away and the city
  // ends at a straight line across the screen.
  const reach = Math.hypot(halfX, halfY / Math.max(Math.sin(pitch), 0.15)) + margin;
  return {
    x0: view.targetX - reach, x1: view.targetX + reach,
    y0: view.targetZ - reach, y1: view.targetZ + reach,
  };
}

export function inBounds(bounds, x, y) {
  return !bounds || (x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1);
}

/** Is a point inside the frustum's ground footprint?
 *
 * Four corner rays in order round the quad, so the sign of the cross product
 * with each edge is the same for every point inside it. The quad can be
 * non-convex only if the camera is upside down, which the pitch clamp forbids.
 */
export function inFootprint(bounds, x, z) {
  const quad = bounds?.footprint;
  if (!quad || quad.length !== 4) return true;
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const cross = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** How many prop instances a tile draws on average, from the renderer's own
 * rules in `instances.js`: a paved tile gets a lamp above a hash of 0.72 and a
 * parked car above 0.44, and an open field gets two tufts above 0.55 and one
 * below. Averages rather than a per-tile hash, because the planner is deciding
 * what to draw and cannot afford to draw it first. */
const PROPS_PER_PAVED = 0.56;
const PROPS_PER_FIELD = 1.45;

/** How many marking instances one road tile draws, from its connection mask.
 *
 * The renderer's own rule (`roadMarkings` in `instances.js`), kept here so the
 * planner charges for what is actually drawn: nothing on a stub, one dash on a
 * straight run, and one arm per approach at a corner or a junction. Charging
 * one a tile understates a downtown grid by most of its markings.
 */
export function markingInstances(mask) {
  let bits = 0;
  for (let d = 0; d < 4; d += 1) if (mask & (1 << d)) bits += 1;
  if (bits < 2) return 0;
  return (mask === 5 || mask === 10) ? 1 : bits;
}

/** Counts the renderer needs before it can plan. Cheap: no geometry touched. */
export function countScene(state, bounds) {
  let trees = 0;
  let props = 0;
  let roads = 0;
  let poles = 0;
  let markArms = 0;
  let wireTiles = 0;
  let wireArms = 0;
  let pipeTiles = 0;
  let pipeArms = 0;
  // The same counts, split by 16x16 chunk, so a perspective frame can price
  // each chunk at its own plan (slice V5). One extra Map entry per chunk; the
  // per-tile work is the same walk it always was.
  const chunks = new Map();
  const CHUNK = 16;
  const blank = () => ({
    buildings: 0, trees: 0, props: 0, roads: 0, poles: 0, groundChunks: 0,
    markArms: 0, wireTiles: 0, wireArms: 0, pipeTiles: 0, pipeArms: 0, cars: 0,
  });
  const chunkAt = (x, y) => {
    const key = ((y / CHUNK) | 0) * 4096 + ((x / CHUNK) | 0);
    let part = chunks.get(key);
    if (!part) { part = blank(); chunks.set(key, part); }
    return part;
  };
  const NET = 16;
  const FOREST = 2;
  const GRASS = 0;
  const MARSH = 7;
  const width = state.width;
  for (let i = 0; i < state.tiles.terrain.length; i += 1) {
    if (bounds && !inBounds(bounds, i % width, (i - (i % width)) / width)) continue;
    const x = i % width;
    const y = (i - x) / width;
    const part = chunkAt(x, y);
    const paved = (state.tiles.road[i] & NET) !== 0;
    if (paved) {
      roads += 1;
      part.roads += 1;
      const arms = markingInstances(state.tiles.road[i] & 15);
      markArms += arms;
      part.markArms += arms;
    }
    if ((state.tiles.wire[i] & NET) !== 0) {
      poles += 1;
      wireTiles += 1;
      part.poles += 1;
      part.wireTiles += 1;
      for (let d = 0; d < 4; d += 1) {
        if (state.tiles.wire[i] & (1 << d)) { wireArms += 1; part.wireArms += 1; }
      }
    }
    if ((state.tiles.pipe[i] & NET) !== 0) {
      pipeTiles += 1;
      part.pipeTiles += 1;
      for (let d = 0; d < 4; d += 1) {
        if (state.tiles.pipe[i] & (1 << d)) { pipeArms += 1; part.pipeArms += 1; }
      }
    }
    if (state.tiles.terrain[i] === FOREST && state.tiles.buildingId[i] === 0 && !paved) {
      trees += 1;
      part.trees += 1;
    }
    // Props, at the rate the renderer actually places them rather than one a
    // tile. Charging every paved tile and every field for a full prop put the
    // estimate over the budget at close zoom on a frame using a fifth of it,
    // and the ladder dropped props — the detail you zoomed in to see (P35).
    if (paved) { props += PROPS_PER_PAVED; part.props += PROPS_PER_PAVED; }
    else if (state.tiles.buildingId[i] === 0
      && (state.tiles.terrain[i] === GRASS || state.tiles.terrain[i] === MARSH)) {
      props += PROPS_PER_FIELD;
      part.props += PROPS_PER_FIELD;
    }
  }
  // NOT rounded: `props` is an expectation (0.56 a paved tile, 1.45 a field),
  // and rounding the total while the per-chunk parts stay fractional makes the
  // two disagree — which under perspective means the budget is spent against a
  // slightly different city from the one drawn.
  let buildings = 0;
  for (const b of state.buildings) {
    if (!inBounds(bounds, b.x, b.y)) continue;
    buildings += 1;
    chunkAt(b.x, b.y).buildings += 1;
  }
  // Only the chunks the camera can see. Terrain chunks are frustum-culled by
  // three.js, so counting the whole map charged the budget for ground that is
  // never drawn — 49k triangles of it on a 64x64 region, which is most of an
  // 80k budget spent on nothing.
  const chunksX = Math.ceil(state.width / 16);
  const chunksY = Math.ceil(state.height / 16);
  let groundChunks = chunksX * chunksY;
  if (bounds) {
    const cx0 = Math.max(0, Math.floor(bounds.x0 / 16));
    const cx1 = Math.min(chunksX - 1, Math.floor(bounds.x1 / 16));
    const cy0 = Math.max(0, Math.floor(bounds.y0 / 16));
    const cy1 = Math.min(chunksY - 1, Math.floor(bounds.y1 / 16));
    if (bounds.footprint) {
      // Against the footprint, not its box: three frustum-culls the terrain,
      // and the box of a wedge holds far more chunks than the wedge (V5).
      // A chunk counts if ANY of its corners or its centre is inside. Three
      // culls by bounding sphere, so a chunk that merely touches the frustum is
      // still drawn; testing the centre alone under-counted by 40% at a wide
      // zoom, which is the more dangerous direction — the measurement loop
      // corrects an over-estimate by stepping down and cannot see the other.
      groundChunks = 0;
      for (let cy = cy0; cy <= cy1; cy += 1) {
        for (let cx = cx0; cx <= cx1; cx += 1) {
          const x0 = cx * 16;
          const z0 = cy * 16;
          const touches = inFootprint(bounds, x0 + 8, z0 + 8)
            || inFootprint(bounds, x0, z0) || inFootprint(bounds, x0 + 16, z0)
            || inFootprint(bounds, x0, z0 + 16) || inFootprint(bounds, x0 + 16, z0 + 16);
          if (touches) groundChunks += 1;
        }
      }
    } else {
      groundChunks = Math.max(0, (cx1 - cx0 + 1)) * Math.max(0, (cy1 - cy0 + 1));
    }
  }
  return {
    buildings, trees, props, roads, poles, groundChunks,
    markArms, wireTiles, wireArms, pipeTiles, pipeArms, chunks,
    // Filled in by the caller from the traffic system's live count: the number
    // of cars is not a function of the tiles, it is a function of how long the
    // road has been busy.
    cars: 0,
  };
}
