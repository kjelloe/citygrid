// The street cache's policy, separated from its plumbing (slice E2/E3).
//
// `street-chunks.js` imports three and node cannot resolve three, so anything
// left inside it is invisible to the unit suite — and three defects in this
// lane have already lived exactly there. What is actually worth testing about
// the cache is not the three calls: it is **which chunk to build next** and
// **which to let go**, and both are pure functions of the live map, what the
// view wants, and the clock.
//
// Nothing here touches three, a scene or a geometry.

/** The shading signature two pieces must share to end up in one mesh.
 *
 * `transparent` and `emissive` are the ones that matter: a transparent piece in
 * an opaque bucket is depth-sorted wrongly, and an emissive one in a plain
 * bucket cannot be dialled up at night (spec §6.5). */
export function signature(options = {}) {
  return [
    options.transparent ? "t" : "o",
    options.emissive !== undefined ? `e${options.emissive.toString(16)}` : "-",
    options.side ?? "front",
    options.bands ?? "-",
  ].join(":");
}

/**
 * The next chunk to build, or `undefined` when the cache is up to date.
 *
 * Nearest first, and at most one a frame: baking is milliseconds and the L2
 * pools cover everything until a chunk lands, so the chunk the player is
 * looking at arrives first and the rest follow as they become worth having.
 * A chunk already live is rebuilt only when its content hash has moved.
 */
export function nextBuild(wanted, live, hashOf) {
  for (const chunk of wanted) {
    const entry = live.get(chunk.key);
    const hash = hashOf(chunk);
    if (!entry) return { chunk, hash, stale: false };
    if (entry.hash !== hash) return { chunk, hash, stale: true };
  }
  return undefined;
}

/**
 * The chunks to dispose: outside what the view wants, and outside it for longer
 * than the grace period.
 *
 * The grace is what makes this a cache. Without it, panning a street back and
 * forth across a chunk boundary rebuilds the same geometry every second.
 */
export function expired(live, wantedKeys, now, graceMs) {
  const out = [];
  for (const [key, entry] of live) {
    if (wantedKeys.has(key)) continue;
    if (now - entry.seen < graceMs) continue;
    out.push(key);
  }
  return out;
}
