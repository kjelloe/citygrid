// The mixer and the voices (slice 4.4).
//
// Web Audio, synthesised. **No sound files**: the project ships zero runtime
// dependencies and has no build step, so an audio bank would be a vendoring
// and licensing decision rather than a slice. Oscillators and a noise buffer
// give a warm, toy-ish palette that suits the plain style, cost nothing to
// download, and cannot go out of sync with a bake.
//
// Three things a browser makes you get right:
//
//   1. **First-gesture unlock.** An AudioContext starts suspended until a user
//      gesture. Created lazily on the first real interaction rather than at
//      boot, so nothing is allocated for a player who never enables sound.
//   2. **Voice pooling.** Every note is a fresh node graph that must be
//      disconnected when it ends, or a long session accumulates thousands of
//      dead nodes. A live count caps concurrency and each voice tears itself
//      down.
//   3. **Ramps, never steps.** Setting a gain directly clicks audibly; every
//      change here is a short ramp.
//
// This module reads nothing from state. It is handed numbers.

const BUSES = ["effects", "ambience"];

/** Concurrent voices. Beyond this the newest is dropped rather than queued: a
 * sound that arrives late is worse than one that never arrives. */
const MAX_VOICES = 12;

function now(context) {
  return context.currentTime;
}

/** A short shaped tone. `type` chooses the timbre; everything else is envelope. */
function tone(context, destination, { type = "sine", from, to = from, attack, hold, release, gain }) {
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, now(context));
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, now(context) + attack + hold + release);
  amp.gain.setValueAtTime(0.0001, now(context));
  amp.gain.exponentialRampToValueAtTime(gain, now(context) + attack);
  amp.gain.setValueAtTime(gain, now(context) + attack + hold);
  amp.gain.exponentialRampToValueAtTime(0.0001, now(context) + attack + hold + release);
  osc.connect(amp).connect(destination);
  osc.start();
  osc.stop(now(context) + attack + hold + release + 0.02);
  return { osc, amp };
}

function noise(context, destination, { duration, gain, cutoff }) {
  const frames = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  // A deterministic-enough shaped noise; this is a speaker, not the simulation,
  // so `Math.random` is fine here and forbidden three directories away.
  for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  const amp = context.createGain();
  amp.gain.setValueAtTime(gain, now(context));
  amp.gain.exponentialRampToValueAtTime(0.0001, now(context) + duration);
  source.connect(filter).connect(amp).connect(destination);
  source.start();
  source.stop(now(context) + duration + 0.02);
  return { source, amp };
}

/** The palette. Each is a short gesture rather than a sample: a rising pair for
 * something built, a falling one for something refused, a low thud for a
 * collapse. */
const VOICES = {
  place: (c, d) => tone(c, d, { type: "triangle", from: 520, to: 780, attack: 0.005, hold: 0.02, release: 0.07, gain: 0.16 }),
  refuse: (c, d) => tone(c, d, { type: "sawtooth", from: 260, to: 150, attack: 0.005, hold: 0.03, release: 0.10, gain: 0.13 }),
  chime: (c, d) => tone(c, d, { type: "sine", from: 880, to: 1320, attack: 0.01, hold: 0.05, release: 0.22, gain: 0.14 }),
  warn: (c, d) => tone(c, d, { type: "square", from: 400, to: 300, attack: 0.01, hold: 0.06, release: 0.14, gain: 0.10 }),
  alarm: (c, d) => tone(c, d, { type: "square", from: 700, to: 460, attack: 0.01, hold: 0.10, release: 0.20, gain: 0.14 }),
  collapse: (c, d) => noise(c, d, { duration: 0.35, gain: 0.22, cutoff: 700 }),
  boom: (c, d) => noise(c, d, { duration: 0.8, gain: 0.32, cutoff: 320 }),
};

export function voiceCatalogue() {
  return Object.keys(VOICES).sort();
}

/**
 * @param settings `{ sound, volumeMaster, volumeEffects, volumeAmbience }`,
 *   each 0..100 except `sound`, which is a boolean.
 */
export function createMixer(settings = {}) {
  let context;
  let master;
  const buses = {};
  let ambienceVoice;
  let live = 0;
  let current = { sound: true, volumeMaster: 70, volumeEffects: 80, volumeAmbience: 40, ...settings };

  function build() {
    const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctor) return false;
    context = new Ctor();
    master = context.createGain();
    master.connect(context.destination);
    for (const name of BUSES) {
      buses[name] = context.createGain();
      buses[name].connect(master);
    }
    applyVolumes();
    return true;
  }

  function applyVolumes() {
    if (!context) return;
    const at = now(context);
    const level = (v) => Math.max(0.0001, (v / 100) ** 2);
    // Squared, because loudness is not linear in a slider position: a linear
    // fader spends most of its travel in the top of the range.
    master.gain.setTargetAtTime(current.sound ? level(current.volumeMaster) : 0.0001, at, 0.02);
    buses.effects.gain.setTargetAtTime(level(current.volumeEffects), at, 0.02);
    buses.ambience.gain.setTargetAtTime(level(current.volumeAmbience), at, 0.02);
  }

  /** Called from a real gesture. Before one, a browser leaves the context
   * suspended and every sound is silently dropped. */
  function unlock() {
    if (!current.sound) return false;
    if (!context && !build()) return false;
    if (context.state === "suspended") context.resume();
    return context.state !== "suspended";
  }

  function play(cue) {
    if (!current.sound || !context || context.state !== "running") return false;
    if (live >= MAX_VOICES) return false;
    const voice = VOICES[cue.voice];
    if (!voice) return false;
    const bus = buses[cue.bus] ?? buses.effects;
    const node = voice(context, bus);
    live += 1;
    const source = node.osc ?? node.source;
    source.addEventListener("ended", () => {
      live -= 1;
      try { node.amp.disconnect(); } catch { /* already torn down */ }
    }, { once: true });
    return true;
  }

  /** The continuous layer. One oscillator pair, started once and left running;
   * its gain follows the city. Starting and stopping it per tick would click. */
  function setAmbience(level) {
    if (!context || context.state !== "running") return;
    if (!current.sound) return;
    if (!ambienceVoice) {
      const osc = context.createOscillator();
      const sub = context.createOscillator();
      const amp = context.createGain();
      osc.type = "sine";
      sub.type = "sine";
      osc.frequency.value = 110;
      sub.frequency.value = 55;
      amp.gain.value = 0.0001;
      osc.connect(amp);
      sub.connect(amp);
      amp.connect(buses.ambience);
      osc.start();
      sub.start();
      ambienceVoice = { osc, sub, amp };
    }
    const target = Math.max(0.0001, (level / 100) * 0.09);
    ambienceVoice.amp.gain.setTargetAtTime(target, now(context), 0.8);
  }

  function update(next) {
    current = { ...current, ...next };
    if (current.sound && !context) return;
    applyVolumes();
    if (!current.sound && ambienceVoice) ambienceVoice.amp.gain.setTargetAtTime(0.0001, now(context), 0.2);
  }

  return {
    unlock,
    play,
    setAmbience,
    update,
    get running() { return Boolean(context) && context.state === "running"; },
    get voices() { return live; },
    dispose() {
      if (!context) return;
      try { ambienceVoice?.osc.stop(); ambienceVoice?.sub.stop(); } catch { /* not started */ }
      context.close();
      context = undefined;
      ambienceVoice = undefined;
    },
  };
}
