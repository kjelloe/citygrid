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
import { facadeSpec } from "../world/facade-spec.js";
import { buildFacade } from "./facade.js";
import { buildProps } from "./props-l3.js";
import { buildSigns } from "./signs.js";
import { buildingParams } from "../world/params.js";
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
export function bakeStreets(baker, state, model, cx, cy, palette) {
  const cfg = getConfig();
  const { width: roadW, sidewalk, kerb, camber, lift } = cfg.road;
  const half = roadW / 2;
  const height = model.heightAt;
  const chunkTiles = cfg.chunkTiles;

  const asphalt = palette.road;
  const kerbColour = palette.roadMark ?? 0xd8d4c8;
  const concrete = palette.civic ?? 0xd0ccc4;

  // Where the kerb has to stop: half a carriageway plus its pavement, which is
  // the corner of the junction box.
  const junction = half + sidewalk;
  const vergeHalf = (cfg.tileM / 2 - junction) / 2;
  for (const { runs, kerbside } of corridorsIn(model, cx, cy, chunkTiles, cfg.tileM, junction)) {
    for (const pts of runs) {
      // The height field ONCE per point on the centre line, shared by every
      // part of the cross-section. Inside a corridor `heightAt` returns the
      // corridor's own flattened height anyway (spec §5.1), and asking it per
      // column made the bake thirteen samples a point where one will do.
      const hs = pts.map((p) => height(p.x, p.z));
      // The carriageway, crowned. It runs THROUGH the junctions at either end,
      // because that is what a junction is.
      addStrip(baker, ribbon(pts, half, height, { lift, camber, heights: hs }), asphalt);
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
        if (vergeHalf > 0) {
          addStrip(baker, ribbon(
            shift(walk, sign * (junction + vergeHalf)), vergeHalf, height, { lift: 0.01 },
          ), palette.lawn);
        }
      }
      for (const dash of dashes(walk, cfg.road.stopLine * 1.5, cfg.road.stopLine * 4.5)) {
        addStrip(baker, ribbon(dash, MARK_HALF, height, { lift: lift + MARK_LIFT }), kerbColour);
      }
    }
  }

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

  bakeWires(baker, state, model, cx, cy, palette);
}

/**
 * Every lot whose centre is in this chunk, built at its real size on its real
 * lot from the generated facade spec (slice E5, spec §6.2).
 *
 * By CENTRE rather than by overlap, so a lot that straddles a chunk boundary is
 * built once — a building drawn twice is a building with z-fighting on every
 * face, which at street level is the most obvious artefact there is.
 */
export function bakeLots(baker, state, model, cx, cy, palette, styleName = "plain", locale = "en") {
  const cfg = getConfig();
  const box = chunkBox(cx, cy, cfg.chunkTiles, cfg.tileM);
  const fronts = [];
  const specs = [];
  for (const lot of model.lots) {
    // ONE rule, shared with the instanced pass (R2): a lot belongs to the chunk
    // its centre is in. Comparing against this chunk's box here and against the
    // anchor TILE there drew a straddling building twice or not at all.
    const owner = chunkOfLot(lot);
    if (owner.cx !== cx || owner.cy !== cy) continue;
    // The SAME family colour the instanced kit uses, from the same function, so
    // the L2 box and the L3 facade are the same house (ruling 032, spec §6.1).
    const params = buildingParams(lot.building, palette, familyColour(lot.building, palette, false, ZONE_NONE));
    const spec = facadeSpec(lot, params, locale);
    specs.push(spec);
    for (const piece of buildFacade(spec)) baker.addPart(piece.part, piece.colour, piece.options);
    fronts.push({ lot: frontEdgeOf(lot), out: OUTWARD[lot.frontage], kind: params.kind });
  }
  // The prop pass, which is the difference between a street and a diagram
  // (spec §6.6). Lamps come from the corridors, hedges and paths from the lots.
  const props = buildProps({
    // WITH the junction distance. Called without it, `trim` was handed
    // `undefined`, every kerbside point came out NaN, `clip` dropped all of
    // them, and the prop pass has been silently building nothing since E5 —
    // the lamps in that slice's screenshots were the L2 instanced poles.
    corridors: corridorsIn(model, cx, cy, cfg.chunkTiles, cfg.tileM, cfg.road.width / 2 + cfg.road.sidewalk)
      .flatMap((c) => c.kerbside),
    lots: fronts, cfg, heightAt: model.heightAt, palette,
    chunk: cy * 4096 + cx,
  });
  for (const piece of props.pieces) baker.addPart(piece.part, piece.colour, piece.options);
  // Where the lamps are, for the night rig to hang point lights on (E6).
  baker.lamps.push(...props.lamps);
  // The fascias, which cannot go through the vertex-colour baker because they
  // carry a texture. One mesh per distinct NAME, added to the same group, so a
  // high street of forty shops is eighteen draw calls at worst (spec §6.5).
  baker.extra(buildSigns(specs, styleName));
}

/** The outward normal of each lot side, in the order `lots.js` numbers them. */
const OUTWARD = [{ x: 0, z: -1 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }];

/** A lot's street edge as two endpoints, running the way the facade does. */
function frontEdgeOf(lot) {
  if (lot.frontage === 0) return { x0: lot.x0, z0: lot.z0, x1: lot.x1, z1: lot.z0 };
  if (lot.frontage === 1) return { x0: lot.x1, z0: lot.z0, x1: lot.x1, z1: lot.z1 };
  if (lot.frontage === 2) return { x0: lot.x1, z0: lot.z1, x1: lot.x0, z1: lot.z1 };
  return { x0: lot.x0, z0: lot.z1, x1: lot.x0, z1: lot.z0 };
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
