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
 * canvas height, so this is the honest measure of how much detail is even
 * resolvable. */
export function tilePixels(view, canvasHeight) {
  if (!view || !canvasHeight || !view.span) return 0;
  return canvasHeight / view.span;
}

/** Estimated triangles for a given plan. */
export function estimate(counts, plan) {
  const b = costs.building[plan.buildings] ?? 0;
  const t = plan.trees ? (costs.tree[plan.treeDetail] ?? 0) : 0;
  const p = plan.props ? costs.prop[2] : 0;

  const casters = counts.buildings * b + counts.trees * t + counts.props * p;
  const flat = counts.roads * costs.road
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
  (p) => (p.props ? ((p.props = false), "props dropped") : ""),
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

  // Gate one: what is resolvable at this zoom.
  let plan = {
    buildings: TIER.FULL,
    treeDetail: TIER.FULL,
    trees: true,
    props: true,
    markings: true,
    poles: true,
    networks: true,
    shadows: true,
    reason: "full",
    tilePixels: Math.round(px),
    step: 0,
  };
  if (px < 42) { plan.props = false; plan.reason = "props not resolvable"; }
  if (px < 20) { plan.markings = false; plan.reason = "markings not resolvable"; }
  if (px < 14) { plan.poles = false; plan.reason = "poles not resolvable"; }
  // A wire ribbon is 0.16 of a tile wide and a pipe main 0.28, so below about
  // twelve pixels a tile they are drawing a line thinner than a pixel — and on
  // a wired city they are the single largest thing on screen: 13,476 instances
  // and 43% of the frame at the default span on a 64x64 (slice V2). The power
  // and water overlays still say where the network reaches.
  if (px < 12) { plan.networks = false; plan.reason = "networks not resolvable"; }
  if (px < 30) { plan.buildings = TIER.SHAPE; plan.treeDetail = TIER.SHAPE; plan.reason = "detail not resolvable"; }
  if (px < 16) { plan.shadows = false; plan.reason = "shadows not resolvable"; }
  if (px < 13) { plan.buildings = TIER.BLOCK; plan.reason = "silhouette only"; }
  if (px < 8) { plan.trees = false; plan.reason = "buildings only"; }

  // Gate two: spend down to the budget, by estimate.
  while (plan.step < LADDER.length && estimate(counts, plan) > cap) stepDown(plan);

  plan.estimate = estimate(counts, plan);
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
  // A rotated orthographic view sweeps a larger axis-aligned box than its own
  // rectangle; the diagonal covers every yaw without a per-angle special case.
  //
  // And a TILTED one sweeps further still. The screen's vertical half-extent
  // lands on the ground stretched by 1/sin(pitch) — at 20° that is nearly three
  // times as far — so a camera dropped towards the horizon (P34) sees a long
  // way up the map. Bounds that ignore it cull the distance away and the city
  // ends at a straight line across the screen.
  const pitch = view.pitch ?? Math.atan(1 / Math.SQRT2);
  const reach = Math.hypot(halfX, halfY / Math.max(Math.sin(pitch), 0.15)) + margin;
  return {
    x0: view.targetX - reach, x1: view.targetX + reach,
    y0: view.targetZ - reach, y1: view.targetZ + reach,
  };
}

export function inBounds(bounds, x, y) {
  return !bounds || (x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1);
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
  const NET = 16;
  const FOREST = 2;
  const GRASS = 0;
  const MARSH = 7;
  const width = state.width;
  for (let i = 0; i < state.tiles.terrain.length; i += 1) {
    if (bounds) {
      const x = i % width;
      const y = (i - x) / width;
      if (!inBounds(bounds, x, y)) continue;
    }
    const paved = (state.tiles.road[i] & NET) !== 0;
    if (paved) {
      roads += 1;
      markArms += markingInstances(state.tiles.road[i] & 15);
    }
    if ((state.tiles.wire[i] & NET) !== 0) {
      poles += 1;
      wireTiles += 1;
      for (let d = 0; d < 4; d += 1) if (state.tiles.wire[i] & (1 << d)) wireArms += 1;
    }
    if ((state.tiles.pipe[i] & NET) !== 0) {
      pipeTiles += 1;
      for (let d = 0; d < 4; d += 1) if (state.tiles.pipe[i] & (1 << d)) pipeArms += 1;
    }
    if (state.tiles.terrain[i] === FOREST && state.tiles.buildingId[i] === 0 && !paved) trees += 1;
    // Props, at the rate the renderer actually places them rather than one a
    // tile. Charging every paved tile and every field for a full prop put the
    // estimate over the budget at close zoom on a frame using a fifth of it,
    // and the ladder dropped props — the detail you zoomed in to see (P35).
    if (paved) props += PROPS_PER_PAVED;
    else if (state.tiles.buildingId[i] === 0
      && (state.tiles.terrain[i] === GRASS || state.tiles.terrain[i] === MARSH)) {
      props += PROPS_PER_FIELD;
    }
  }
  props = Math.round(props);
  let buildings = 0;
  for (const b of state.buildings) {
    if (inBounds(bounds, b.x, b.y)) buildings += 1;
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
    groundChunks = Math.max(0, (cx1 - cx0 + 1)) * Math.max(0, (cy1 - cy0 + 1));
  }
  return {
    buildings, trees, props, roads, poles, groundChunks,
    markArms, wireTiles, wireArms, pipeTiles, pipeArms,
  };
}
