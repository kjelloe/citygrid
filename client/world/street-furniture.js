// Where the street furniture stands, and what of it is solid (slice E7; A43).
//
// This was `client/render/props-l3.js`, which is where geometry belongs and is
// the wrong side of the layer for a collider: the collision world is in
// `client/world/` and may not import a renderer module (ruling 032). So the
// PLACEMENT lives here and the geometry stays there, which also means one
// function decides where a lamp is and both the picture and the walker read it
// — the alternative is two copies of the same arithmetic and a lamp you can
// walk through standing next to one you cannot.
//
// Bins are not solid. A43: lamps and hedges stop a walker, a bin is stepped
// over — and a bin that stopped one would be the thing everybody bumped into,
// because it is the only prop that stands where a person walks.

import { getConfig } from "./config.js";
import { jitter } from "./hash.js";
import { FLAG_RUINED } from "../constants-mirror.js";
import { frontEdgeOf, OUTWARD } from "./lots.js";

/** Half the thickness of a lamp post and of a hedge, in metres. Both are the
 * collider's half-extent AND the geometry's, which is the point of this file. */
export const POST_HALF = 0.07;
export const HEDGE_HALF = 0.22;

/** How far from the centre line a lamp stands.
 *
 * `lampInset` out from the KERB, not half a pavement out from the middle of the
 * road. It was the latter — `half + sidewalk / 2` — which is the middle of the
 * pavement and therefore exactly the line a person walks down; with the posts
 * made solid, `walkthrough` stopped dead on one every 24 m (A43).
 */
export function lampOffset(cfg = getConfig()) {
  return cfg.road.width / 2 + cfg.props.lampInset;
}

/** Lamps along one corridor, alternating sides.
 *
 * `heightAt` places the foot; `offset` is how far from the centre line. Moved
 * from `render/props-l3.js` unchanged apart from its home.
 */
export function lampsAlong(points, offset, spacing, height, heightAt) {
  const out = [];
  if (!points || points.length < 2) return out;
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  }
  const total = cum[cum.length - 1];
  let side = 1;
  for (let d = spacing / 2; d < total; d += spacing) {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i += 1;
    const a = points[i - 1];
    const b = points[i];
    const seg = cum[i] - cum[i - 1] || 1;
    const t = (d - cum[i - 1]) / seg;
    const px = a.x + (b.x - a.x) * t;
    const pz = a.z + (b.z - a.z) * t;
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = (-(b.z - a.z) / len) * offset * side;
    const nz = ((b.x - a.x) / len) * offset * side;
    const x = px + nx;
    const z = pz + nz;
    out.push({ x, z, y: heightAt(x, z), h: height, arm: -side, along: { x: (b.x - a.x) / len, z: (b.z - a.z) / len } });
    side = -side;
  }
  return out;
}

/**
 * A lot's hedge as two spans with a gate between them.
 *
 * `front` is the lot's street edge, `{ x0, z0, x1, z1 }`, running the way the
 * facade does. The gap is the path's width plus a shoulder, in the middle,
 * because a hedge with no way through it is a fence.
 */
export function hedgeSpans(front, props = getConfig().props) {
  const along = { x: front.x1 - front.x0, z: front.z1 - front.z0 };
  const len = Math.hypot(along.x, along.z) || 1;
  along.x /= len; along.z /= len;
  const gap = props.pathW + 0.6;
  const mid = len / 2;
  const spans = [];
  for (const [from, to] of [[0.2, mid - gap / 2], [mid + gap / 2, len - 0.2]]) {
    if (to - from < 0.4) continue;
    spans.push({
      ax: front.x0 + along.x * from, az: front.z0 + along.z * from,
      bx: front.x0 + along.x * to, bz: front.z0 + along.z * to,
    });
  }
  return spans;
}

/** Where a lot's path meets the pavement — the point a person comes out of a
 * building at, and where E5's path already reaches to (spec §6.6). */
export const PATH_REACH = 2.4;

export function doorPoint(front, out) {
  const mx = (front.x0 + front.x1) / 2;
  const mz = (front.z0 + front.z1) / 2;
  return { x: mx + out.x * PATH_REACH, z: mz + out.z * PATH_REACH };
}

/**
 * The colliders, as boxes the same shape as `collision.js`'s lot boxes.
 *
 * Lamps and hedges are handed in rather than re-derived, so the boxes are the
 * same objects the geometry was built from: `lamps` from `lampsAlong`, `fronts`
 * as lot street edges. `heightAt` seats them.
 *
 * A hedge overlaps the lot box it belongs to by all but `HEDGE_HALF`, so most
 * of what it adds is already solid. It is here anyway: the 0.22 m it does add
 * is the difference between brushing a hedge and walking through one, and a
 * lot with no building on it has no box at all.
 */
export function furnitureBoxes(model, lamps, fronts, props = []) {
  const cfg = getConfig();
  const heightAt = model.heightAt;
  const boxes = [];
  let id = 0;
  // The S3 props with a body, from the list their geometry is built from.
  for (const prop of props) {
    const size = SOLID_PROPS[prop.kind];
    if (!size) continue;
    const turned = prop.along && Math.abs(prop.along.z) > Math.abs(prop.along.x);
    const hx = turned ? size.hz : size.hx;
    const hz = turned ? size.hx : size.hz;
    const y = heightAt(prop.x, prop.z);
    boxes.push({
      id: `${prop.kind}${id}`, kind: prop.kind,
      x0: prop.x - hx, x1: prop.x + hx, z0: prop.z - hz, z1: prop.z + hz, yBase: y, yTop: y + size.h,
    });
    id += 1;
  }
  for (const lamp of lamps) {
    boxes.push({
      id: `lamp${id}`, kind: "lamp",
      x0: lamp.x - POST_HALF, x1: lamp.x + POST_HALF,
      z0: lamp.z - POST_HALF, z1: lamp.z + POST_HALF,
      yBase: lamp.y, yTop: lamp.y + lamp.h,
    });
    id += 1;
  }
  for (const front of fronts) {
    for (const span of hedgeSpans(front, cfg.props)) {
      const y = heightAt((span.ax + span.bx) / 2, (span.az + span.bz) / 2);
      boxes.push({
        id: `hedge${id}`, kind: "hedge",
        x0: Math.min(span.ax, span.bx) - HEDGE_HALF, x1: Math.max(span.ax, span.bx) + HEDGE_HALF,
        z0: Math.min(span.az, span.bz) - HEDGE_HALF, z1: Math.max(span.az, span.bz) + HEDGE_HALF,
        yBase: y, yTop: y + cfg.props.hedgeH,
      });
      id += 1;
    }
  }
  return boxes;
}

// --- streets with detail (S3) --------------------------------------------------
//
// Every prop a street has beyond its lamps and hedges, placed by pure functions
// here so the picture and the collider read one answer (A43): a name sign and
// bollards at a junction, manholes and drains in the carriageway, a post box on
// a longer street, a bench and a bike rack outside a shop, and a row of parking
// bays between the pavement and a shopfront — never across its door.

/**
 * Street names — a mirror of `data/names.json`'s `streets`, one list per locale
 * (the arrangement the shop names have; `test/street-furniture.test.js` holds
 * the two together). Equal length in every locale: a name is picked by INDEX,
 * so a language change renames a street and moves none.
 */
export const STREET_NAMES = Object.freeze({
  en: Object.freeze([
    "Mill Lane",
    "Church Street",
    "Station Road",
    "Park Avenue",
    "High Street",
    "Orchard Way",
    "Victoria Road",
    "Bridge Street",
    "Queen Street",
    "King's Road",
    "Chapel Lane",
    "Market Street",
    "School Lane",
    "Rose Avenue",
    "Meadow Close",
    "Water Lane",
    "North Road",
    "Elm Grove",
  ]),
  no: Object.freeze([
    "Møllegata",
    "Kirkegata",
    "Stasjonsveien",
    "Parkveien",
    "Storgata",
    "Hagegata",
    "Torggata",
    "Brugata",
    "Dronningens gate",
    "Kongens gate",
    "Kapellveien",
    "Markedsgata",
    "Skoleveien",
    "Roseveien",
    "Engveien",
    "Elveveien",
    "Nordre vei",
    "Almeveien",
  ]),
});

/** A corridor's name, from its id. Never game state; the locale only picks the
 * list the index is read from. */
export function streetName(corridorId, locale = "en") {
  const list = STREET_NAMES[locale] ?? STREET_NAMES.en;
  return list[streetNameIndex(corridorId)];
}

/** Which row of the list a corridor's name is — the same in every locale, and
 * the row of the name atlas its board reads (S3). */
export function streetNameIndex(corridorId) {
  const n = STREET_NAMES.en.length;
  return Math.floor(jitter(corridorId * 17 + 3, 71) * n) % n;
}

/** The props with a body a walker bumps into, and their half-extents in metres
 * (A43: a bin and a drain are stepped over; a post and a bench are not). */
export const SOLID_PROPS = Object.freeze({
  bollard: { hx: 0.1, hz: 0.1, h: 0.9 },
  sign: { hx: 0.06, hz: 0.06, h: 2.6 },
  postbox: { hx: 0.25, hz: 0.25, h: 1.1 },
  bench: { hx: 0.8, hz: 0.3, h: 0.85 },
});

/** How far apart manholes and drains are along a street, in metres. */
const MANHOLE_EVERY = 40;
const DRAIN_EVERY = 30;
/** A post box on a street at least this many tiles long. */
const POSTBOX_TILES = 3;
/** A parking bay: how long, and how much clear kerb a door keeps either side. */
export const BAY_LEN = 6;
export const DOOR_CLEAR = 1.5;

/** A polyline's arc lengths and a sampler: `(s) -> { x, z, tx, tz }`. */
function walker(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  }
  const len = cum[cum.length - 1];
  const at = (s) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i += 1;
    const a = points[i - 1];
    const b = points[i];
    const seg = cum[i] - cum[i - 1] || 1;
    const t = Math.max(0, Math.min(1, (s - cum[i - 1]) / seg));
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: (b.x - a.x) / seg, tz: (b.z - a.z) / seg };
  };
  return { len, at };
}

/** The directions a junction's arms leave it in, one per corridor. */
function armsAt(model, node) {
  const out = [];
  for (const id of node.corridors) {
    const c = model.corridors[id];
    if (!c || c.points.length < 2) continue;
    const pts = c.from === node.id ? c.points : [...c.points].reverse();
    const dx = pts[1].x - pts[0].x;
    const dz = pts[1].z - pts[0].z;
    const len = Math.hypot(dx, dz) || 1;
    out.push({ corridor: id, x: dx / len, z: dz / len, angle: Math.atan2(dz, dx) });
  }
  return out.sort((a, b) => a.angle - b.angle);
}

/**
 * A junction's props: a bollard on each pavement corner between two arms, and
 * one name sign — on the first corner, a step back from its bollard, carrying
 * the name of the street on its right.
 */
export function junctionProps(model, node, cfg = getConfig()) {
  if (!node || node.kind !== "junction") return [];
  const half = cfg.road.width / 2;
  // On the KERB corner, and the sign at the back of the pavement: mid-pavement
  // is exactly the line a person walks, and `walkthrough` stopped dead on a
  // bollard at every junction corner (S3b).
  const corner = (half + 0.35) * Math.SQRT2;
  const back = (half + cfg.road.sidewalk - 0.3) * Math.SQRT2;
  const arms = armsAt(model, node);
  const out = [];
  for (let i = 0; i < arms.length; i += 1) {
    const a = arms[i];
    const b = arms[(i + 1) % arms.length];
    let turn = b.angle - a.angle;
    if (turn <= 0) turn += Math.PI * 2;
    // Only between two arms at about a right angle: across a straight run
    // (the far side of a T) there is no corner, there is kerb.
    if (turn > Math.PI * 0.75) continue;
    const bx = a.x + b.x;
    const bz = a.z + b.z;
    const bl = Math.hypot(bx, bz) || 1;
    const x = node.x + (bx / bl) * corner;
    const z = node.z + (bz / bl) * corner;
    out.push({ kind: "bollard", x, z, node: node.id });
    if (!out.some((p) => p.kind === "sign")) {
      out.push({
        kind: "sign", x: node.x + (bx / bl) * back, z: node.z + (bz / bl) * back, node: node.id,
        name: a.corridor, face: { x: -bx / bl, z: -bz / bl },
      });
    }
  }
  return out;
}

/**
 * Along one corridor: manholes on the carriageway, drains at the kerb, and on a
 * street of `POSTBOX_TILES` or more, a post box at the back of the pavement.
 * Nothing inside a junction box.
 */
export function corridorProps(corridor, cfg = getConfig()) {
  const half = cfg.road.width / 2;
  const clear = half + cfg.road.sidewalk + 2;
  const { len, at } = walker(corridor.points);
  const out = [];
  if (len <= clear * 2) return out;
  const put = (kind, s, lateral, extra = {}) => {
    const p = at(s);
    out.push({ kind, x: p.x - p.tz * lateral, z: p.z + p.tx * lateral, along: { x: p.tx, z: p.tz }, corridor: corridor.id, ...extra });
  };
  const start = clear + jitter(corridor.id, 81) * MANHOLE_EVERY * 0.5;
  for (let s = start, k = 0; s < len - clear; s += MANHOLE_EVERY, k += 1) {
    put("manhole", s, (k % 2 === 0 ? 1 : -1) * half * 0.5);
  }
  for (let s = clear + DRAIN_EVERY / 2, k = 0; s < len - clear; s += DRAIN_EVERY, k += 1) {
    put("drain", s, (k % 2 === 0 ? 1 : -1) * (half - 0.25));
  }
  if (len >= POSTBOX_TILES * cfg.tileM) {
    const side = jitter(corridor.id, 83) < 0.5 ? 1 : -1;
    put("postbox", len * 0.5, side * (half + cfg.road.sidewalk - 0.35));
  }
  return out;
}

/**
 * Outside an occupied shop: a bench on one side of its door and a bike rack on
 * the other, and a row of parking bays between the pavement and the
 * shopfront, never across the door. Positions in metres, from the lot's own
 * front edge — the same edge its hedge and its door are placed from.
 */
export function shopProps(lot, cfg = getConfig()) {
  const b = lot.building;
  // Standing, not ruined — not `occupancy`, which the engine fills with
  // residents and leaves at zero on every shop (S3b's shot tool found none).
  if (!b || b.zone !== 2 || lot.facing === false || (b.flags & FLAG_RUINED) !== 0) return { props: [], bays: [] };
  const front = frontEdgeOf(lot);
  const out = OUTWARD[lot.frontage];
  const ax = front.x1 - front.x0;
  const az = front.z1 - front.z0;
  const flen = Math.hypot(ax, az) || 1;
  const ux = ax / flen;
  const uz = az / flen;
  const setback = cfg.lot.setback.commercial ?? 0;
  // From the front edge out to the road's centre line is half a tile plus the
  // setback; the pavement ends `half + sidewalk` from the centre. The bays sit
  // in the strip between the pavement and the shopfront, clear of the traffic.
  const toCentre = cfg.tileM / 2 + setback;
  const pavementEdge = cfg.road.width / 2 + cfg.road.sidewalk;
  const bayOut = (toCentre - pavementEdge) / 2;
  const point = (u, o) => ({ x: front.x0 + ux * u + out.x * o, z: front.z0 + uz * u + out.z * o });
  const door = flen / 2;
  const props = [
    { kind: "bench", ...point(door - 2.6, 0.9), along: { x: ux, z: uz }, lot: lot.id },
    { kind: "bikerack", ...point(door + 2.4, 0.9), along: { x: ux, z: uz }, lot: lot.id },
  ];
  const bays = [];
  for (let u = 0.5; u + BAY_LEN <= flen - 0.5; u += BAY_LEN) {
    // A driveway: the door's path crosses this strip to the pavement.
    if (u < door + DOOR_CLEAR && u + BAY_LEN > door - DOOR_CLEAR) continue;
    bays.push({ ...point(u + BAY_LEN / 2, bayOut), along: { x: ux, z: uz }, lot: lot.id, u0: u, u1: u + BAY_LEN });
  }
  return { props, bays };
}

/** Every S3 prop and bay in the city, derived once per model. */
const byModel = new WeakMap();
export function streetProps(model, cfg = getConfig()) {
  let found = byModel.get(model);
  if (found) return found;
  const props = [];
  const bays = [];
  for (const node of model.nodes) props.push(...junctionProps(model, node, cfg));
  for (const corridor of model.corridors) props.push(...corridorProps(corridor, cfg));
  for (const lot of model.lots) {
    const shop = shopProps(lot, cfg);
    props.push(...shop.props);
    bays.push(...shop.bays);
  }
  found = { props, bays, tileM: cfg.tileM };
  byModel.set(model, found);
  return found;
}
