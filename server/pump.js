// The beat a room keeps (X1, plan.md §3.6).
//
// Descends from `../CarrierDominion/server/clock.js` (an injectable clock, a
// fixed beat, and the gap between beats recorded rather than assumed) and from
// `../Fireline/server/metrics.js`'s `jitterDigest` for the digest itself —
// p50, p99, max and late%, null until there are enough samples to mean anything.
// Rewritten against this room: Fireline pumps a snapshot per team at 10 Hz and
// this one broadcasts the accepted commands, which is usually nothing.
//
// **The clock is an argument.** `step(now)` is the whole interface, so a test
// drives a room through a sim-year in a millisecond and `server/index.js` drives
// it with `setInterval`. A pump that read the clock itself would be a pump no
// test could hurry.
//
// **Degrade the game clock, never the pump** (plan.md §3.7.6): if the sim cannot
// keep up, the room advances fewer ticks per beat — the world runs slower for
// everyone, identically, and nothing desyncs, because the tick count is data in
// the frame.

/** Inter-beat gaps, as a ring. Thirty seconds at 100 ms. */
const RING = 300;

/** p50, p99, max and late% over the gaps — `../Fireline/server/metrics.js`.
 * Null below ten samples, because four gaps are an anecdote. */
export function jitterDigest(gaps, tickMs) {
  const g = gaps.filter((x) => x >= 0).sort((a, b) => a - b);
  if (g.length < 10) return undefined;
  const pick = (q) => g[Math.min(g.length - 1, Math.floor(q * g.length))];
  return {
    expectedMs: tickMs,
    p50Ms: Math.round(pick(0.5)),
    p99Ms: Math.round(pick(0.99)),
    maxMs: Math.round(g[g.length - 1]),
    // A gap over one and a half beats means the room missed one.
    latePct: Math.round((g.filter((x) => x > tickMs * 1.5).length / g.length) * 1000) / 10,
  };
}

export function createPump(room, { tickMs = 100 } = {}) {
  const gaps = new Array(RING).fill(-1);
  let at = 0;
  let last;
  let beats = 0;
  let worstBeatMs = 0;

  /** One beat at `now` milliseconds. Returns the frame it broadcast. */
  function step(now) {
    if (last !== undefined) {
      gaps[at % RING] = now - last;
      at += 1;
    }
    last = now;
    beats += 1;
    const started = performance.now();
    const frame = room.beat();
    const took = performance.now() - started;
    if (took > worstBeatMs) worstBeatMs = took;
    return frame;
  }

  return {
    step,
    beats: () => beats,
    /** What the beat cost the server, which is the budget plan §3.8 sets at
     * 20 ms — measured rather than predicted, the first time a room runs. */
    worstBeatMs: () => worstBeatMs,
    jitter: () => jitterDigest(gaps, tickMs),
    /** The real clock, for `server/index.js`. Nothing in a test calls this. */
    start() {
      const timer = setInterval(() => step(Date.now()), tickMs);
      return () => clearInterval(timer);
    },
  };
}
