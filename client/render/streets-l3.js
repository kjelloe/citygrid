// The street at L3 (slice E3; spec §5.2–5.4).
//
// At city zoom a road is a colour of the terrain mesh and a dashed line of
// instanced quads, and that is right: at eighteen pixels a tile there is
// nothing else to see. Close enough to walk on, it has to be a surface with an
// edge — a crowned carriageway, a kerb you step up, a pavement to stand on —
// and all of it draped on the height field so a hill is a hill.
//
// Everything here goes through the chunk baker, so a whole block of street is
// one draw call (spec §6.4). Plumbing only: the geometry is `ribbon.js` and the
// decisions are in `client/world/`.

import * as THREE from "three";
import { ribbon, skirt, sagCurve, dashes, clip, trim } from "./ribbon.js";
import { getConfig } from "../world/config.js";
import { chunkOfLot } from "../world/chunks.js";
import { OUTWARD, frontEdgeOf } from "../world/lots.js";
import { facadeSpec } from "../world/facade-spec.js";
import { buildFacade } from "./facade.js";
import { houseLots } from "../world/homes.js";
import { defaultName } from "../world/civic-spec.js";
import { buildProps } from "./props-l3.js";
import { buildTrees } from "./trees-l3.js";
import { treesIn } from "../world/foliage.js";
import { signalHeads, crossingBars, stopMarks } from "../world/signals.js";
import { streetProps, streetNameIndex, STREET_NAMES } from "../world/street-furniture.js";
import { jitter } from "../world/hash.js";
import { sink } from "./solid.js";
import { buildSigns, buildNameBoards } from "./signs.js";
import { buildingParams, fenceOf } from "../world/params.js";
import { familyColour } from "./palette.js";
import { ZONE_NONE } from "../constants-mirror.js";
import { NET_PRESENT } from "../constants-mirror.js";

const IDENTITY = new THREE.Matrix4();

/** A painted line is 15 cm of paint, a centimetre above the crown it sits on —
 * enough to clear the camber without floating (slice E3). */
const MARK_HALF = 0.075;
const MARK_LIFT = 0.01;

/** Turns a ribbon's buffers into a geometry the baker can take. */
function toGeometry(strip) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(strip.position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(strip.normal, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(strip.uv, 2));
  return geometry;
}

/** A polyline offset `distance` metres to its left (negative for its right). */
function shift(points, distance) {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return {
      x: p.x + (-(b.z - a.z) / len) * distance,
      z: p.z + ((b.x - a.x) / len) * distance,
    };
  });
}

/** A verge, split into runs of one colour.
 *
 * The verge takes the ground's own colour (A38), and a corridor 300 m long can
 * cross grass, sand and rock — but a strip is one colour, so it is emitted as
 * one strip per RUN of spans the ground agrees about. Most streets collapse to
 * a single run, which is why this is grouping rather than a strip a span. */
function vergeRuns(points, tileM, natural) {
  const runs = [];
  let current;
  for (let i = 1; i < points.length; i += 1) {
    const mx = (points[i - 1].x + points[i].x) / 2;
    const mz = (points[i - 1].z + points[i].z) / 2;
    const colour = natural(Math.floor(mx / tileM), Math.floor(mz / tileM));
    if (!current || current.colour !== colour) {
      current = { colour, points: [points[i - 1]] };
      runs.push(current);
    }
    current.points.push(points[i]);
  }
  return runs;
}

function addStrip(baker, strip, colour, options) {
  if (!strip || strip.triangles === 0) return;
  const geometry = toGeometry(strip);
  baker.add(geometry, IDENTITY, colour, options);
  geometry.dispose();
}

/** Every corridor with at least one tile in this chunk.
 *
 * By TILE rather than by anchor: a corridor is a whole street and the chunk
 * only wants the part of it that passes through — but a ribbon is built along
 * the corridor's own polyline, so the test is "does it touch us at all". A
 * corridor crossing two chunks is built into both; the alternative is a seam
 * where a road stops at a chunk boundary. */
function chunkBox(cx, cy, chunkTiles, tileM) {
  return {
    x0: cx * chunkTiles * tileM, x1: (cx + 1) * chunkTiles * tileM,
    z0: cy * chunkTiles * tileM, z1: (cy + 1) * chunkTiles * tileM,
  };
}

/** Each corridor's part in this chunk, twice: the carriageway's run, which goes
 * through the junctions at either end, and the kerbside run, which stops short
 * of them. Trimmed BEFORE clipping, or a corridor that crosses a chunk boundary
 * would lose its pavement at the seam instead of at the junction. */
function corridorsIn(model, cx, cy, chunkTiles, tileM, junction) {
  const box = chunkBox(cx, cy, chunkTiles, tileM);
  const out = [];
  for (const corridor of model.corridors) {
    const runs = clip(corridor.points, box);
    if (runs.length === 0) continue;
    out.push({ runs, kerbside: clip(trim(corridor.points, junction), box) });
  }
  return out;
}

/**
 * Bakes one chunk's streets: carriageway, kerb faces, pavements, junction
 * boxes, connector curves, and the wire runs above them.
 *
 * In METRES — the baker's group is added to a scene in tile units, so the
 * caller scales it. Everything samples `model.heightAt`, which is what makes a
 * kerb follow a hill instead of cutting into it.
 */
/** The corridors a chunk's streets are baked from, in order. */
export function streetCorridors(model, cx, cy) {
  const cfg = getConfig();
  return corridorsIn(model, cx, cy, cfg.chunkTiles, cfg.tileM, cfg.road.width / 2 + cfg.road.sidewalk);
}

/**
 * The carriageway, kerbs, pavements, verges and centre line of
 * `corridors[from…]`, until `stop()` says the frame is spent; returns where it
 * stopped (R5). Once the lot phase ran in slices, the street phase was the
 * frame A78's check read over budget — 5.6–10.2 ms warm. At least one corridor
 * per call.
 */
export function bakeStreetCorridors(baker, state, model, corridors, from, stop, palette, ground) {
  const cfg = getConfig();
  const { width: roadW, sidewalk, kerb, camber, lift } = cfg.road;
  const half = roadW / 2;
  const height = model.heightAt;
  const chunkTiles = cfg.chunkTiles;

  const asphalt = palette.road;
  const wear = shadeHex(asphalt, 0.9);
  const patch = shadeHex(asphalt, 1.1);
  const kerbColour = palette.roadMark ?? 0xd8d4c8;
  const concrete = palette.civic ?? 0xd0ccc4;

  // Where the kerb has to stop: half a carriageway plus its pavement, which is
  // the corner of the junction box.
  const junction = half + sidewalk;
  const vergeHalf = (cfg.tileM / 2 - junction) / 2;
  let i = from;
  while (i < corridors.length) {
    const { runs, kerbside } = corridors[i];
    i += 1;
    for (const pts of runs) {
      // The height field ONCE per point on the centre line, shared by every
      // part of the cross-section. Inside a corridor `heightAt` returns the
      // corridor's own flattened height anyway (spec §5.1), and asking it per
      // column made the bake thirteen samples a point where one will do.
      const hs = pts.map((p) => height(p.x, p.z));
      // The carriageway, crowned. It runs THROUGH the junctions at either end,
      // because that is what a junction is.
      addStrip(baker, ribbon(pts, half, height, { lift, camber, heights: hs }), asphalt);
      // Wear (S3): a darker band down each lane where the wheels run, and a
      // lighter patch or two where the road was dug up — the road as a thing
      // that has been used, with no texture.
      for (const side of [-1, 1]) {
        addStrip(baker, ribbon(shift(pts, side * half / 2), 0.55, height, { lift: lift + 0.004 }), wear);
      }
      let runLen = 0;
      for (let i = 1; i < pts.length; i += 1) runLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      const patches = runLen > 30 ? 1 + (jitter(Math.round(pts[0].x * 7 + pts[0].z * 13), 91) < 0.5 ? 1 : 0) : 0;
      for (let k = 0; k < patches; k += 1) {
        const at = 8 + jitter(Math.round(pts[0].x + pts[0].z) + k * 31, 93) * (runLen - 16);
        const sub = trim(pts, at, runLen - at - 3.5);
        if (sub.length < 2) continue;
        const side = k % 2 === 0 ? 1 : -1;
        addStrip(baker, ribbon(shift(sub, side * half / 2), half * 0.4, height, { lift: lift + 0.005 }), patch);
      }
    }
    // Everything kerbside stops short of the junction. Drawn along the whole
    // corridor it paints a kerb, a pavement and a centre line straight across
    // the mouth of the side street.
    for (const walk of kerbside) {
      const hs = walk.map((p) => height(p.x, p.z));
      addStrip(baker, skirt(walk, half, height, kerb + lift, { lift, heights: hs }), kerbColour);
      for (const sign of [-1, 1]) {
        addStrip(baker, ribbon(
          shift(walk, sign * (half + sidewalk / 2)), sidewalk / 2, height, { lift: lift + kerb },
        ), concrete);
        // The verge is not decoration. At city zoom a road TILE is asphalt for
        // its whole 20 m, which is right when it is eighteen pixels across; at
        // street zoom it leaves an 8 m carriageway floating in twelve metres of
        // grey and the kerb has nothing to be a kerb against (ruling 035: a
        // road tile is a carriageway, sidewalks AND verges).
        //
        // And in the colour of the land under it, not a flat lawn (A38): a
        // road through sand or rock had two metres of green either side of it.
        // `natural`, because the tile the verge sits on is a ROAD tile and
        // `tile()` rightly answers tarmac for it.
        if (vergeHalf > 0) {
          const line = shift(walk, sign * (junction + vergeHalf));
          for (const run of vergeRuns(line, cfg.tileM, ground.natural)) {
            addStrip(baker, ribbon(run.points, vergeHalf, height, { lift: 0.01 }), run.colour);
          }
        }
      }
      for (const dash of dashes(walk, cfg.road.stopLine * 1.5, cfg.road.stopLine * 4.5)) {
        addStrip(baker, ribbon(dash, MARK_HALF, height, { lift: lift + MARK_LIFT }), kerbColour);
      }
    }
      if (stop()) break;
  }
  return i;
}

/** The junction boxes, the connectors, the signals and the wires of a chunk. */
export function bakeStreetJoints(baker, state, model, cx, cy, palette) {
  const cfg = getConfig();
  const half = cfg.road.width / 2;
  const { lift } = cfg.road;
  const height = model.heightAt;
  const chunkTiles = cfg.chunkTiles;
  const asphalt = palette.road;
  // Junction boxes: a square of carriageway at the node so the four approaches
  // meet in a surface rather than four ribbons ending in mid-air.
  for (const node of model.nodes) {
    const tx = node.tile % state.width;
    const ty = (node.tile - tx) / state.width;
    if (tx < cx * chunkTiles || tx >= (cx + 1) * chunkTiles) continue;
    if (ty < cy * chunkTiles || ty >= (cy + 1) * chunkTiles) continue;
    const box = [{ x: node.x - half, z: node.z }, { x: node.x + half, z: node.z }];
    addStrip(baker, ribbon(box, half, height, { lift }), asphalt);
  }

  // The connectors E0 derived for each bend, as curved carriageway.
  for (const connector of model.connectors) {
    const node = model.nodes[connector.node];
    if (!node) continue;
    const tx = node.tile % state.width;
    const ty = (node.tile - tx) / state.width;
    if (tx < cx * chunkTiles || tx >= (cx + 1) * chunkTiles) continue;
    if (ty < cy * chunkTiles || ty >= (cy + 1) * chunkTiles) continue;
    addStrip(baker, ribbon(connector.points, half, height, { lift }), asphalt);
  }

  bakeSignals(baker, model, cx, cy, chunkTiles, cfg, palette, state);
  bakeWires(baker, state, model, cx, cy, palette);
}

/** A chunk's streets at once: the corridors, then the joints. */
export function bakeStreets(baker, state, model, cx, cy, palette, ground) {
  bakeStreetCorridors(baker, state, model, streetCorridors(model, cx, cy), 0, () => false, palette, ground);
  bakeStreetJoints(baker, state, model, cx, cy, palette);
}

/**
 * Every lot whose centre is in this chunk, built at its real size on its real
 * lot from the generated facade spec (slice E5, spec §6.2).
 *
 * By CENTRE rather than by overlap, so a lot that straddles a chunk boundary is
 * built once — a building drawn twice is a building with z-fighting on every
 * face, which at street level is the most obvious artefact there is.
 */
/** The lots a chunk bakes, in the model's order. ONE rule, shared with the
 * instanced pass (R2): a lot belongs to the chunk its centre is in. Comparing
 * against this chunk's box here and against the anchor TILE there drew a
 * straddling building twice or not at all. */
export function lotsOfChunk(model, cx, cy) {
  return model.lots.filter((lot) => {
    const owner = chunkOfLot(lot);
    return owner.cx === cx && owner.cy === cy;
  });
}

/**
 * The facades of `lots[from…]`, until `stop()` says the frame is spent; returns
 * the index it stopped at (R5). The lot phase is the heaviest part of a bake —
 * a furnished chunk's was 10–24 ms, which A78's check read the first time it
 * timed it — so the cache runs it a slice a frame. At least one lot per call.
 * `acc` collects the specs and fronts the extras need.
 */
export function bakeLotFacades(baker, state, lots, from, stop, acc, palette, styleName = "plain", locale = "en", showOwner = false, furniture = false, buildingName = undefined) {
  let i = from;
  while (i < lots.length) {
    const lot = lots[i];
    i += 1;
    // The SAME family colour the instanced kit uses, from the same function, so
    // the L2 box and the L3 facade are the same house (ruling 032, spec §6.1).
    // With the territory overlay on it is the OWNER's colour, exactly as the
    // instanced boxes do it — the chunk hash is salted with the flag so this
    // runs again on the toggle (slice V7, A44).
    const family = familyColour(lot.building, palette, showOwner, ZONE_NONE);
    const params = buildingParams(lot.building, palette, family, showOwner, state.tick);
    // A residential lot is a form, not a building (S10): one detached house at
    // level 1, a pair of semis at level 2, a block of flats at 3. Each sub-lot
    // is a lot, so the facade grammar, S9's furniture and the props all work on
    // it unchanged.
    const parts = params.kind === "residential"
      ? houseLots(lot, lot.building.level ?? 0).lots
      : [lot];
    for (const part of parts) {
      const spec = facadeSpec(part, params, locale, furniture, {
        palette, name: styleName, nameFor: buildingName ?? defaultName,
      });
      acc.specs.push(spec);
      for (const piece of buildFacade(spec)) baker.addPart(piece.part, piece.colour, piece.options);
    }
    acc.fronts.push({ lot: frontEdgeOf(lot), out: OUTWARD[lot.frontage], kind: params.kind, fence: fenceOf(lot.building) });
    if (stop()) break;
  }
  return i;
}

/** What a chunk's lots share once their facades are done: the props, the
 * trees, the lamps and the signs (R5: its own frame). */
export function bakeLotExtras(baker, state, model, cx, cy, acc, palette, styleName = "plain", locale = "en") {
  const cfg = getConfig();
  const box = chunkBox(cx, cy, cfg.chunkTiles, cfg.tileM);
  // S3's props and bays in this chunk, from the list the colliders read.
  const inBox = (p) => p.x >= box.x0 && p.x < box.x1 && p.z >= box.z0 && p.z < box.z1;
  const all = streetProps(model, cfg);
  const street = { props: all.props.filter(inBox), bays: all.bays.filter(inBox) };
  // The prop pass, which is the difference between a street and a diagram
  // (spec §6.6). Lamps come from the corridors, hedges and paths from the lots.
  const props = buildProps({
    // WITH the junction distance. Called without it, `trim` was handed
    // `undefined`, every kerbside point came out NaN, `clip` dropped all of
    // them, and the prop pass has been silently building nothing since E5 —
    // the lamps in that slice's screenshots were the L2 instanced poles.
    corridors: corridorsIn(model, cx, cy, cfg.chunkTiles, cfg.tileM, cfg.road.width / 2 + cfg.road.sidewalk)
      .flatMap((c) => c.kerbside),
    lots: acc.fronts, cfg, heightAt: model.heightAt, palette,
    chunk: cy * 4096 + cx, street,
  });
  for (const piece of props.pieces) baker.addPart(piece.part, piece.colour, piece.options);
  // Trees, at eye height (V8). The instanced cone is right at city zoom and is
  // a four-sided pyramid standing under it; `updateInstances` stops drawing
  // them inside a baked chunk, so what a walker sees is this.
  for (const piece of buildTrees({
    // With the model: the lots' trees too — street trees, orchards, a park's
    // ring (S5) — from the same cached list the instanced pass reads.
    trees: treesIn(state, box, cfg, model), heightAt: model.heightAt, palette, cfg,
  })) baker.addPart(piece.part, piece.colour, piece.options);
  // Where the lamps are, for the night rig to hang point lights on (E6).
  baker.lamps.push(...props.lamps);
  // The fascias, which cannot go through the vertex-colour baker because they
  // carry a texture. One mesh per distinct NAME, added to the same group, so a
  // high street of forty shops is eighteen draw calls at worst (spec §6.5).
  baker.extra(buildSigns(acc.specs, styleName));
  // The street-name boards, one mesh for the chunk off one atlas (S3).
  baker.extra(buildNameBoards(street.props
    .filter((p) => p.kind === "sign")
    .map((p) => ({ index: streetNameIndex(p.name), quad: nameBoard(p, model.heightAt, cfg) })),
  STREET_NAMES[locale] ?? STREET_NAMES.en, styleName));
}

/** A street-name board on its post, facing the junction (S3): bottom-RIGHT
 * first as a reader standing in the junction sees it, which is the corner
 * `buildSigns` gives u = 1. */
function nameBoard(sign, heightAt, cfg) {
  const y0 = heightAt(sign.x, sign.z) + cfg.road.lift + cfg.road.kerb + 2.15;
  const y1 = y0 + 0.32;
  const f = sign.face;
  const rx = f.z;
  const rz = -f.x;
  const cx = sign.x + f.x * 0.08;
  const cz = sign.z + f.z * 0.08;
  const at = (u, y) => [cx + rx * u, y, cz + rz * u];
  return { corners: [at(0.65, y0), at(-0.65, y0), at(-0.65, y1), at(0.65, y1)], out: [f.x, f.z] };
}

/** A colour scaled by `k`, clamped. */
function shadeHex(hex, k) {
  const ch = (shift) => Math.min(255, Math.round(((hex >> shift) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Every lot of a chunk at once: the facades, then the extras. */
export function bakeLots(baker, state, model, cx, cy, palette, styleName = "plain", locale = "en", showOwner = false, furniture = false, buildingName = undefined) {
  const acc = { specs: [], fronts: [] };
  bakeLotFacades(baker, state, lotsOfChunk(model, cx, cy), 0, () => false, acc,
    palette, styleName, locale, showOwner, furniture, buildingName);
  bakeLotExtras(baker, state, model, cx, cy, acc, palette, styleName, locale);
}

/**
 * Signal heads and crossings at every signalled junction in this chunk
 * (V8, spec §9.2).
 *
 * The POST and the housing are baked; the LENS is not — it changes three times
 * a minute, so `baker.signals` records where each head is and `scene.js` poses
 * an instance there coloured by the same `phaseAt` the cars read.
 */
function bakeSignals(baker, model, cx, cy, chunkTiles, cfg, palette, state) {
  const metal = sink();
  const paint = [];
  for (const node of model.nodes) {
    const tx = node.tile % state.width;
    const ty = (node.tile - tx) / state.width;
    if (tx < cx * chunkTiles || tx >= (cx + 1) * chunkTiles) continue;
    if (ty < cy * chunkTiles || ty >= (cy + 1) * chunkTiles) continue;
    for (const head of signalHeads(model, node, cfg)) {
      const y = model.heightAt(head.x, head.z) + cfg.road.lift + cfg.road.kerb;
      metal.box(head.x - 0.07, y, head.z - 0.07, head.x + 0.07, y + head.h, head.z + 0.07);
      // The housing: a small box facing back down the arm, with the lens hung
      // on the front of it by the caller.
      const fx = head.fx * 0.12;
      const fz = head.fz * 0.12;
      metal.box(
        Math.min(head.x, head.x + fx) - 0.16, y + head.h - 0.62, Math.min(head.z, head.z + fz) - 0.16,
        Math.max(head.x, head.x + fx) + 0.16, y + head.h - 0.06, Math.max(head.z, head.z + fz) + 0.16,
      );
      baker.signals.push({
        node: head.node, axis: head.axis,
        x: head.x + head.fx * 0.2, y: y + head.h - 0.34, z: head.z + head.fz * 0.2,
      });
    }
    for (const bar of crossingBars(model, node, cfg)) paint.push(bar);
    // And the stop line and the lane arrow where the lights are (S3).
    for (const mark of stopMarks(model, node, cfg)) paint.push(mark);
  }
  const part = metal.done();
  if (part.triangles > 0) baker.addPart(part, palette.lamp ?? 0xb8bcc0);
  // The zebra, as ribbons on the carriageway — a crossing with nothing painted
  // on it is a light telling people to cross an empty road (A33).
  for (const bar of paint) {
    addStrip(baker, ribbon(bar.points, bar.width / 2, model.heightAt, {
      lift: cfg.road.lift + MARK_LIFT,
    }), palette.roadMark ?? 0xd8d4c8);
  }
}

/** Poles with a cross-arm and a sagging span between them (spec §5.4). */
function bakeWires(baker, state, model, cx, cy, palette) {
  const cfg = getConfig();
  const { poleSpacing, poleHeight, sag, armWidth } = cfg.wire;
  const chunkTiles = cfg.chunkTiles;
  const colour = palette.wire;
  const pole = new THREE.BoxGeometry(0.22, poleHeight, 0.22);
  const arm = new THREE.BoxGeometry(armWidth, 0.14, 0.14);
  const matrix = new THREE.Matrix4();

  const box = {
    x0: cx * chunkTiles * cfg.tileM, x1: (cx + 1) * chunkTiles * cfg.tileM,
    z0: cy * chunkTiles * cfg.tileM, z1: (cy + 1) * chunkTiles * cfg.tileM,
  };

  // Along each corridor that carries wire, a pole every `poleSpacing` metres —
  // and only the part of it that passes through this chunk.
  for (const corridor of model.corridors) {
    const carries = corridor.tiles.some((t) => (state.tiles.wire[t] & NET_PRESENT) !== 0);
    if (!carries) continue;
    for (const points of clip(corridor.points, box)) {
    let run = 0;
    for (let i = 1; i < points.length; i += 1) {
      run += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    }
    const spans = Math.max(1, Math.round(run / poleSpacing));
    const previous = [];
    for (let i = 0; i <= spans; i += 1) {
      const at = (i / spans) * run;
      const p = pointAlong(points, at);
      const ground = model.heightAt(p.x, p.z);
      const top = ground + poleHeight;
      matrix.makeTranslation(p.x, ground + poleHeight / 2, p.z);
      baker.add(pole, matrix, colour);
      matrix.makeTranslation(p.x, top, p.z);
      baker.add(arm, matrix, colour);
      previous.push({ x: p.x, y: top - 0.2, z: p.z });
    }
    for (let i = 1; i < previous.length; i += 1) {
      const curve = sagCurve(previous[i - 1], previous[i], sag, 8);
      // A wire is a ribbon a few centimetres wide, seen edge-on from the street
      // and from above — cheaper than a tube and indistinguishable at any zoom
      // a player can reach.
      addStrip(baker, ribbon(
        curve.map((c) => ({ x: c.x, z: c.z })), 0.06, undefined,
        { heights: curve.map((c) => c.y) },
      ), colour);
    }
    }
  }
  pole.dispose();
  arm.dispose();
}

/** A point `distance` metres along a polyline. */
function pointAlong(points, distance) {
  let run = 0;
  for (let i = 1; i < points.length; i += 1) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    if (run + seg >= distance || i === points.length - 1) {
      const t = seg > 1e-9 ? Math.min(1, (distance - run) / seg) : 0;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        z: points[i - 1].z + (points[i].z - points[i - 1].z) * t,
      };
    }
    run += seg;
  }
  return points[points.length - 1];
}
