// What a boat and a carriage are, in metres (slice S17).
//
// B3a gave the car three bodies, a glazed cabin and round wheels; the aircraft
// got its fuselage, wings and fin at T5b. Everything else that moves is a
// **slab**: `instances.js` builds the boat, the ferry and the carriage out of
// `slabGeometry`, so a marina is a row of white bricks on the water and a train
// is three grey bricks on the line.
//
// The sizes come from the config, never from a literal here: `boat.hullW` and
// `boat.hullH` are in `data/cityviewer.json` because what passes under S13's
// bridge has to fit under it, and a kit that invents its own hull is a kit that
// can sail through a deck.
//
// Pure in `(kind, id, cfg)` — no clock, no random, no three (ruling 032).

import { jitter } from "./hash.js";

export const MOVER_KINDS = ["sailBoat", "moored", "ferry", "cargo", "carriage", "locomotive"];

/**
 * What each may spend, in triangles.
 *
 * A box is 12. The car's budget is 120 and there are hundreds of them; there
 * are at most 96 boats and 64 carriages in a city, so these are roomier — but
 * a ferry is still a thing seen from a bank, not a model kit.
 */
export const MOVER_CEILING = {
  // Five or six boxes each: a hull, a bow, a deck, a mast, a sail and a cabin
  // on some of them. 84 is six boxes, which is what a moored boat with a cabin
  // actually costs — the first number here was 60, written before the parts
  // were, and the test said so.
  sailBoat: 84, moored: 84, ferry: 110, cargo: 160, carriage: 110, locomotive: 120,
};

/** A box, in the mover's own frame: x across, y up, z along. */
function box(what, x0, y0, z0, x1, y1, z1, shade = 1) {
  return { what, x0, y0, z0, x1, y1, z1, shade };
}

function hullOf(width, height, length, { bow = 0.34 } = {}) {
  const hw = width / 2;
  const hl = length / 2;
  return [
    // The hull proper, and a narrower bow section so the silhouette comes to a
    // point rather than ending in a wall.
    box("hull", -hw, 0, -hl, hw, height, hl * (1 - bow), 0.9),
    box("bow", -hw * 0.55, 0, hl * (1 - bow), hw * 0.55, height * 0.92, hl, 0.82),
  ];
}

export function moverSpec(kind, id, cfg) {
  const boat = cfg.boat;
  const rail = cfg.rail;

  if (kind === "sailBoat" || kind === "moored") {
    const length = boat.length;
    const width = boat.hullW;
    const hull = boat.hullH;
    const parts = hullOf(width, hull, length);
    parts.push(box("deck", -width / 2 * 0.92, hull, -length / 2 * 0.86, width / 2 * 0.92, hull + 0.12, length * 0.2, 1.1));
    const deckTop = hull + 0.12;
    // A cabin on some of them, by hash: a marina of identical boats is a
    // marina of one boat drawn twenty times.
    if (jitter(id, 211) > 0.45) {
      parts.push(box("cabin", -width * 0.3, deckTop, -length * 0.22, width * 0.3, deckTop + 0.7, length * 0.08, 0.95));
    }
    const mastH = kind === "moored" ? length * 0.7 : length * 0.95;
    parts.push(box("mast", -0.07, deckTop, -0.07, 0.07, deckTop + mastH, 0.07, 0.7));
    // The sail: a thin slab along the mast, which S6's wind moves. A moored
    // boat has it furled — the same part, a tenth of the area.
    const furled = kind === "moored";
    parts.push(box("sail",
      -0.05, deckTop + (furled ? 0.2 : 0.45), -length * (furled ? 0.06 : 0.3),
      0.05, deckTop + (furled ? 0.5 : mastH * 0.92), length * (furled ? 0.06 : 0.22), 1.35));
    return { kind, length, width, height: deckTop + mastH, parts };
  }

  if (kind === "ferry" || kind === "cargo") {
    const length = boat.length * 2.4;
    const width = boat.ferryW;
    const hull = boat.ferryH;
    const parts = hullOf(width, hull, length, { bow: 0.26 });
    const deckTop = hull;
    if (kind === "ferry") {
      parts.push(box("superstructure", -width * 0.38, deckTop, -length * 0.3, width * 0.38, deckTop + 2.2, length * 0.22, 1.1));
      parts.push(box("bridge", -width * 0.28, deckTop + 2.2, -length * 0.02, width * 0.28, deckTop + 3.1, length * 0.18, 1.2));
      parts.push(box("funnel", -width * 0.12, deckTop + 2.2, -length * 0.26, width * 0.12, deckTop + 3.4, -length * 0.14, 0.7));
      return { kind, length, width, height: deckTop + 3.4, parts };
    }
    // A cargo ship: the bridge aft, and containers by hash down the deck, so
    // two ships in one port are not the same ship.
    parts.push(box("bridge", -width * 0.34, deckTop, -length * 0.42, width * 0.34, deckTop + 2.6, -length * 0.28, 1.1));
    parts.push(box("funnel", -width * 0.1, deckTop + 2.6, -length * 0.4, width * 0.1, deckTop + 3.6, -length * 0.32, 0.7));
    // Four or five rows, and where they start moves with the ship: two ships in
    // one port carrying the identical load is the defect a hash on the HEIGHT
    // alone leaves behind (the test caught exactly that).
    const rows = jitter(id, 229) > 0.5 ? 5 : 4;
    const shift = length * 0.04 * jitter(id, 233);
    for (let i = 0; i < rows; i += 1) {
      const z0 = -length * 0.2 + shift + (length * 0.52 * i) / rows;
      const z1 = z0 + length * 0.52 / rows - 0.4;
      const high = jitter(id * 13 + i, 223) > 0.5;
      parts.push(box("container", -width * 0.36, deckTop, z0, width * 0.36, deckTop + (high ? 2.4 : 1.3), z1,
        0.8 + 0.4 * jitter(id * 17 + i, 227)));
    }
    return { kind, length, width, height: deckTop + 3.6, parts };
  }

  // The train (T3). A carriage is a body on two bogies with a window band; the
  // locomotive is shorter, has a cab at one end and no passenger windows.
  const length = rail.carriageLen;
  const width = rail.carriageW;
  const height = rail.carriageH;
  const floor = 0.55;
  const parts = [];
  const hl = length / 2;
  const hw = width / 2;
  for (const z of [-hl * 0.62, hl * 0.62]) {
    parts.push(box("bogie", -hw * 0.82, 0, z - 1.3, hw * 0.82, floor, z + 1.3, 0.55));
  }
  if (kind === "locomotive") {
    parts.push(box("body", -hw, floor, -hl, hw, height * 0.86, hl * 0.52, 1));
    parts.push(box("cab", -hw * 0.94, floor, hl * 0.52, hw * 0.94, height, hl, 1.1));
    parts.push(box("window", -hw * 0.8, height * 0.62, hl * 0.98, hw * 0.8, height * 0.88, hl, 0.35));
    parts.push(box("roof", -hw * 0.96, height * 0.86, -hl, hw * 0.96, height * 0.93, hl * 0.52, 0.8));
    return { kind, length, width, height, parts };
  }
  parts.push(box("body", -hw, floor, -hl, hw, height * 0.9, hl, 1));
  parts.push(box("roof", -hw * 0.97, height * 0.9, -hl * 0.99, hw * 0.97, height, hl * 0.99, 0.82));
  // One window band a side, as a thin slab proud of the body: a row of panes at
  // this distance is a band, and a band is two triangles a side rather than
  // twelve a window.
  for (const side of [-1, 1]) {
    parts.push(box("window", side * hw * 0.98, height * 0.52, -hl * 0.86,
      side * hw * 1.02, height * 0.78, hl * 0.86, 0.35));
  }
  return { kind, length, width, height, parts };
}

/** What one mover costs: a box is twelve triangles. */
export function moverCost(spec) {
  return spec.parts.length * 12;
}
