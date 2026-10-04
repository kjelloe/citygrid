// A film is a list of shots (F2; `workitems-film.md`, plan.md §10 bonus 4).
//
// Pure, and in `client/world/` for the usual reason: the framing is arithmetic
// — where the camera is at second 23, how far through its ease, which hour and
// style the shot asks for — and arithmetic that only exists inside three is
// arithmetic nobody can check. `client/debug/tour.js` drives a renderer with
// what this returns, and `tools/film.mjs` drives that.
//
// Positions are in TILES and angles in radians, which is what the camera takes.
// A shot's `duration` and `hold` are seconds, so a list is a timeline and the
// storyboard is that timeline sampled once a second.

/** The camera moves a shot may ask for. A `walk` shot drives the real walker
 * along the ground between two points, so it cannot pass through a wall — the
 * same movement code `walkthrough` uses. */
export const CAMERAS = ["orbit", "crane", "pan", "walk", "photo"];

/** Easing, as pure functions of 0..1. A film that cuts between two poses reads
 * as a slideshow; a film that eases reads as a camera somebody is holding. */
export const EASES = {
  linear: (t) => t,
  // Slow in and out: the default, and what a crane or a pan wants.
  smooth: (t) => t * t * (3 - 2 * t),
  // Starts moving at once and settles — a pull-back at the end of a film.
  out: (t) => 1 - (1 - t) * (1 - t),
  in: (t) => t * t,
};

export function easeFor(name) {
  return EASES[name] ?? EASES.smooth;
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isPoint = (p) => p !== null && typeof p === "object" && isNum(p.x) && isNum(p.z);

/**
 * What is wrong with a shot list, as a list of sentences — empty when it is
 * sound.
 *
 * `world` carries what the fixture can answer: which styles and hours exist,
 * and whether a point is on a corridor (a `walk` shot that starts in a field is
 * a shot of a walker refusing to move, which is the defect this catches before
 * a minute of rendering rather than after).
 */
export function problemsIn(list, world = {}) {
  const out = [];
  const styles = world.styles ?? [];
  const hours = world.hours ?? [];
  const onCorridor = world.onCorridor ?? (() => true);
  if (!list || typeof list !== "object") return ["the list is not an object"];
  if (typeof list.name !== "string" || list.name.length === 0) out.push("the list has no name");
  if (!Array.isArray(list.shots) || list.shots.length === 0) return [...out, "the list has no shots"];

  list.shots.forEach((shot, i) => {
    const at = `shot ${i + 1}${shot.title ? ` (${shot.title})` : ""}`;
    if (typeof shot.title !== "string" || shot.title.length === 0) out.push(`${at}: no title`);
    if (!CAMERAS.includes(shot.camera)) out.push(`${at}: camera "${shot.camera}" is not one of ${CAMERAS.join(", ")}`);
    if (!isNum(shot.duration) || shot.duration <= 0) out.push(`${at}: no duration`);
    if (shot.hold !== undefined && (!isNum(shot.hold) || shot.hold < 0)) out.push(`${at}: a hold that is not seconds`);
    if (shot.style !== undefined && styles.length > 0 && !styles.includes(shot.style)) {
      out.push(`${at}: style "${shot.style}" does not exist`);
    }
    if (shot.time !== undefined && hours.length > 0 && !hours.includes(shot.time)) {
      out.push(`${at}: time "${shot.time}" is not an hour the renderer has`);
    }
    if (shot.ease !== undefined && !(shot.ease in EASES)) out.push(`${at}: ease "${shot.ease}" is not one of ${Object.keys(EASES).join(", ")}`);
    if (!isPoint(shot.from)) out.push(`${at}: no "from" point`);
    if (!isPoint(shot.to)) out.push(`${at}: no "to" point`);
    if (shot.camera === "walk") {
      // Both ends on a street, because the walker walks and the ground is the
      // ground: `walkthrough` proves a corridor is walkable and this is the
      // same movement code.
      if (isPoint(shot.from) && !onCorridor(shot.from)) out.push(`${at}: a walk starts off any street`);
      if (isPoint(shot.to) && !onCorridor(shot.to)) out.push(`${at}: a walk ends off any street`);
    } else {
      if (!isNum(shot.span) && !isNum(shot.spanTo)) out.push(`${at}: no span to frame it with`);
    }
    if (shot.look !== undefined && !isPoint(shot.look) && !isNum(shot.look)) {
      out.push(`${at}: "look" is neither a point nor a heading`);
    }
  });
  return out;
}

/** How long the film runs, in seconds. */
export function lengthOf(list) {
  return (list.shots ?? []).reduce((n, s) => n + (s.duration ?? 0) + (s.hold ?? 0), 0);
}

/** Which shot second `t` of the film falls in, and how far through it.
 *
 * The hold is at the END of a shot and does not move the camera: it is what
 * gives a storyboard frame time to be looked at, and a film a beat before it
 * cuts.
 */
export function shotAt(list, t) {
  let start = 0;
  const shots = list.shots ?? [];
  for (let i = 0; i < shots.length; i += 1) {
    const span = (shots[i].duration ?? 0) + (shots[i].hold ?? 0);
    if (t < start + span || i === shots.length - 1) {
      const into = Math.max(0, Math.min(span, t - start));
      const moving = Math.min(into, shots[i].duration ?? 0);
      return {
        index: i,
        shot: shots[i],
        into,
        // 0..1 through the MOVE, which stays at 1 through the hold.
        f: (shots[i].duration ?? 0) > 0 ? moving / shots[i].duration : 1,
        holding: into > (shots[i].duration ?? 0),
      };
    }
    start += span;
  }
  return { index: 0, shot: shots[0], into: 0, f: 0, holding: false };
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The camera at second `t` of the film: everything the renderer needs and
 * nothing it has to work out.
 *
 * `mode` is the projection the shot runs in — a walk is street mode and
 * everything else is the city camera — and `yaw` comes from `look` where a shot
 * gives one, so a crane can descend while keeping a crossroads in frame.
 */
export function poseAt(list, t) {
  const { shot, f, index, holding } = shotAt(list, t);
  const e = easeFor(shot.ease)(f);
  const x = lerp(shot.from.x, shot.to.x, e);
  const z = lerp(shot.from.z, shot.to.z, e);
  const span = isNum(shot.spanTo) && isNum(shot.span) ? lerp(shot.span, shot.spanTo, e) : (shot.span ?? 0);
  const pitch = isNum(shot.pitchTo) && isNum(shot.pitch) ? lerp(shot.pitch, shot.pitchTo, e) : (shot.pitch ?? 0);
  let yaw = shot.yaw ?? 0;
  if (isNum(shot.look)) yaw = shot.look;
  else if (isPoint(shot.look)) yaw = Math.atan2(shot.look.x - x, shot.look.z - z);
  else if (isNum(shot.yawTo) && isNum(shot.yaw)) yaw = lerp(shot.yaw, shot.yawTo, e);
  return {
    index,
    title: shot.title,
    subtitle: shot.subtitle,
    mode: shot.camera === "walk" ? "street" : (shot.camera === "photo" ? "photo" : "city"),
    camera: shot.camera,
    x,
    z,
    span,
    pitch,
    yaw,
    style: shot.style,
    time: shot.time,
    holding,
    f: e,
  };
}
