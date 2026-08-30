// What the city sounds like, as data (slice 4.4).
//
// The pure half: engine events in, sound cues out. No `AudioContext`, no
// timers, no DOM — so the interesting part (what gets heard when fifty-nine
// `powerShortfall` events arrive in one month) is testable without a browser.
//
// `plan-v1.md`'s gate is the load-bearing rule: **audio is derived from state
// only — a muted client and a loud one stay hash-identical.** So nothing here
// takes a mutable reference to state, nothing writes, and the mixer is handed
// values rather than the state object. Sound is a projection, like the
// renderer, and the renderer never writes to state either.
//
// The layers `plan.md` §4.4 asks for:
//
//   feedback     — the player did something. Immediate, quiet, never queued.
//   notification — the city is telling them something. Ranked and capped.
//   ambience     — the city itself. A continuous level, not an event.
//   music        — not built. There is no composed music to play, and a volume
//                  slider for silence is a control that does nothing.

/** Buses, in the order the mixer creates them. */
export const BUS = { FEEDBACK: "effects", NOTIFY: "effects", AMBIENCE: "ambience" };

/** Which engine events make a sound, and how urgently.
 *
 * A whitelist for the same reason the alert area is one: routine growth is not
 * news, and a `developed` chime every month is a chime the player stops
 * hearing. Lower `priority` wins when the voice pool is full. */
const CUES = {
  disasterWarning: { voice: "alarm", bus: BUS.NOTIFY, priority: 0 },
  disasterStruck: { voice: "boom", bus: BUS.NOTIFY, priority: 0 },
  fireStarted: { voice: "alarm", bus: BUS.NOTIFY, priority: 1 },
  burntDown: { voice: "collapse", bus: BUS.NOTIFY, priority: 1 },
  wrecked: { voice: "collapse", bus: BUS.NOTIFY, priority: 1 },
  bankrupt: { voice: "alarm", bus: BUS.NOTIFY, priority: 1 },

  powerShortfall: { voice: "warn", bus: BUS.NOTIFY, priority: 2 },
  waterShortfall: { voice: "warn", bus: BUS.NOTIFY, priority: 2 },
  fundsLow: { voice: "warn", bus: BUS.NOTIFY, priority: 2 },
  unpaidUpkeep: { voice: "warn", bus: BUS.NOTIFY, priority: 2 },

  questCompleted: { voice: "chime", bus: BUS.NOTIFY, priority: 3 },
  disasterRelief: { voice: "chime", bus: BUS.NOTIFY, priority: 3 },
  fireOut: { voice: "chime", bus: BUS.NOTIFY, priority: 3 },
};

/** How many notification voices one tick may produce. A month that generates
 * fifty-nine shortfalls must not generate fifty-nine sounds — the alert area
 * learned this in slice N4 and the speaker learns it here. */
export const VOICES_PER_TICK = 3;

/** The sound a command's answer makes. Refusals are audible because they are
 * the one thing the player most needs to notice and the readout is at the
 * bottom of the screen (slice N13). */
export function cueForResult(result) {
  if (result === "ok") return { voice: "place", bus: BUS.FEEDBACK, priority: 4 };
  return { voice: "refuse", bus: BUS.FEEDBACK, priority: 2 };
}

/**
 * The cues for one tick's events.
 *
 * Collapsed by voice, ranked by priority, capped. Two `wrecked` events in a
 * month are one `collapse`, because a sound played twice at the same instant is
 * one louder sound and not information.
 */
export function cuesFor(events, limit = VOICES_PER_TICK) {
  const byVoice = new Map();
  for (const event of events ?? []) {
    const cue = CUES[event.kind];
    if (!cue) continue;
    const existing = byVoice.get(cue.voice);
    if (existing === undefined || cue.priority < existing.priority) {
      byVoice.set(cue.voice, { ...cue, kind: event.kind });
    }
  }
  return [...byVoice.values()]
    .sort((a, b) => a.priority - b.priority || (a.voice < b.voice ? -1 : 1))
    .slice(0, limit);
}

/**
 * The ambience level for a city, 0..100.
 *
 * A continuous property of the world rather than an event: a big busy city is
 * louder than an empty field. Derived from population and traffic, both of
 * which are already hashed state, so two clients hear the same city.
 *
 * Integer, and clamped, so a huge city does not creep upward forever.
 */
export function ambienceFor(state) {
  const people = Math.min(60, Math.floor((state.population ?? 0) / 40));
  const traffic = Math.min(40, Math.floor((state.traffic?.congested ?? 0) / 4));
  return Math.max(0, Math.min(100, people + traffic));
}

export function knownCueKinds() {
  return Object.keys(CUES).sort();
}

export function voiceNames() {
  return [...new Set([...Object.values(CUES).map((c) => c.voice), "place", "refuse"])].sort();
}
