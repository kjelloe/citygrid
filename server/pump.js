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

/** Beats ignored before the warm numbers start counting (X1c). */
const WARMUP_BEATS = 30;

/** What the beat itself cost, as a digest over the warm beats (X1d).
 *
 * The MAXIMUM is not a measurement on its own: X1d made `room_soak` ten times
 * longer — the room owes its ticks per second now, so five city years take
 * forty-five seconds instead of four — and the worst warm beat went 13.85 →
 * 22.25 ms with nothing about the work having changed. A maximum over 4,615
 * samples is simply larger than one over 471. So the budget is checked against
 * the p99 and the maximum is printed beside it with the count it is over.
 *
 * **`n` is part of the reading, not decoration.** This is nearest-rank, so a
 * p99 over fewer than a hundred samples IS the maximum — the same arithmetic
 * that made A78's p95 over eighteen chunks the eighteenth of them. A caller
 * that gates on `p99Ms` has to gate on `n` as well, which `room_soak` does. */
export function costDigest(costs) {
  const c = costs.filter((x) => x >= 0).sort((a, b) => a - b);
  if (c.length < 10) return undefined;
  const pick = (q) => c[Math.min(c.length - 1, Math.floor(q * c.length))];
  return {
    n: c.length,
    p50Ms: Math.round(pick(0.5) * 100) / 100,
    p99Ms: Math.round(pick(0.99) * 100) / 100,
    maxMs: Math.round(c[c.length - 1] * 100) / 100,
  };
}

export function createPump(room, { tickMs = 100 } = {}) {
  const gaps = new Array(RING).fill(-1);
  /** What each warm beat cost, as a ring of its own. Longer than the gap ring
   * because the expensive beat is the monthly one, and a month is sixty beats
   * at the play speed (X1d). */
  const costs = new Array(RING * 10).fill(-1);
  let costAt = 0;
  let at = 0;
  let last;
  let beats = 0;
  let worstBeatMs = 0;
  /** The worst beat once the engine is WARM. The first monthly pass is JIT:
   * measured at X1c, a 48×48 room's beat is 26 ms cold and 11.34 ms warm, and
   * the whole of the difference is the first run of the quest pass. A budget
   * checked against a cold maximum is a budget checked against the compiler
   * (CLAUDE.md: warm the instrument before timing a phase, and keep the cold
   * run as its own row, because a player does pay it once). */
  let worstWarmBeatMs = 0;

  /** One beat at `now` milliseconds. Returns the frame it broadcast. */
  function step(now) {
    let elapsed = tickMs;                 // the first beat has nothing to measure
    if (last !== undefined) {
      elapsed = now - last;
      gaps[at % RING] = elapsed;
      at += 1;
    }
    last = now;
    beats += 1;
    const started = performance.now();
    // The real gap, not the nominal one: the room's own wall clock is what
    // every seat reads the hour from (X1c), so a server that fell behind must
    // not also lose the afternoon.
    const frame = room.beat(elapsed);
    const took = performance.now() - started;
    if (took > worstBeatMs) worstBeatMs = took;
    // Three sim-months at two ticks a beat, which is long enough for the
    // monthly pass to have run a few times.
    if (beats > WARMUP_BEATS) {
      if (took > worstWarmBeatMs) worstWarmBeatMs = took;
      costs[costAt % costs.length] = took;
      costAt += 1;
    }
    return frame;
  }

  return {
    step,
    beats: () => beats,
    /** What the beat cost the server, which is the budget plan §3.8 sets at
     * 20 ms — measured rather than predicted, the first time a room runs.
     * This one includes the cold beats; `worstWarmBeatMs` is the one to gate
     * on, and the pair is the finding. */
    worstBeatMs: () => worstBeatMs,
    worstWarmBeatMs: () => worstWarmBeatMs,
    /** How many beats the warm number is over, so a reading taken from a short
     * run cannot be mistaken for a measurement (the p95-of-eighteen lesson). */
    warmBeats: () => Math.max(0, beats - WARMUP_BEATS),
    jitter: () => jitterDigest(gaps, tickMs),
    /** What a warm beat costs: p50, p99 and the max, with the sample count. The
     * p99 is what a budget is checked against; the max is a story about one
     * beat (X1d). */
    cost: () => costDigest(costs),
    /** The real clock, for `server/index.js`. Nothing in a test calls this. */
    start() {
      const timer = setInterval(() => step(Date.now()), tickMs);
      return () => clearInterval(timer);
    },
  };
}
