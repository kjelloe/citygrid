// The minimap (slice 4.1's last piece, gamedesign.md §13.3).
//
// A 2D canvas, deliberately not three.js: it is a picture of the tile arrays,
// and asking the GPU to draw a second scene to show where the first one is
// would cost more than the map does.
//
// Two layers with very different costs, so they are drawn on different clocks:
//
//   - the WORLD (terrain, zoning, buildings, roads) changes when the player
//     builds. Painted once into an offscreen `ImageData` and blitted.
//   - the VIEWPORT box changes every frame the camera moves. Drawn on top.
//
// Repainting 16,384 pixels every frame at 60fps for a box that moves is the
// obvious version of this and the wrong one.
//
// The renderer never writes to state (CLAUDE.md). This reads `state.tiles` and
// `renderer.view`, and the only thing it produces is a callback saying which
// tile was clicked.
//
// It is a PICTURE, and says so: `role="img"`, not focusable, no key handling.
// It was briefly focusable with Enter jumping to the middle of the map, which
// is ruling 028's own defect in miniature — `role="img"` announces a static
// image, and an image that takes keys is lying about what it is. Keyboard users
// pan with the arrow keys on the map itself, which aims properly and is
// strictly better than jumping to the centre.

import { PALETTES } from "./palettes.js";
import { TERRAIN_WATER, TERRAIN_SHALLOW, NET_PRESENT } from "../constants-mirror.js";
import { pixelToTile, viewportRect, rectIsInformative } from "./minimap-model.js";

/** Big enough to make out a district, small enough to leave the city the
 * screen. A 128-region maps to a little over one pixel a tile. */
export const MINIMAP_SIZE = 160;

function rgb(hex) {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

export function createMinimap(canvas, state, view, { style = "plain", onJump } = {}) {
  const palette = PALETTES[style] ?? PALETTES.plain;
  const context = canvas.getContext("2d");
  const size = MINIMAP_SIZE;
  canvas.width = size;
  canvas.height = size;
  // The displayed size follows the constant rather than being repeated in the
  // stylesheet, where it would drift the first time either was changed.
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const terrain = palette.terrain.map(rgb);
  const zones = palette.zone.map(rgb);
  const roadColour = rgb(palette.road);
  const civicColour = rgb(palette.civic);

  const world = context.createImageData(size, size);
  let painted = false;
  /** The tick the cached picture was painted from, or -1 for never.
   *
   * The 3D renderer rebuilds its instances every frame, so it shows growth,
   * fires and disasters for free. This one caches an image, so it needs to be
   * told — and `worldChanged()` is only called when the PLAYER builds. A city
   * that grew, burned or flooded left the minimap showing the old world until
   * the player happened to lay a road. Anything the simulation does happens on
   * a tick, so the tick is the exact signal, and repainting at most once a tick
   * costs 25,600 pixel writes about eight times a second at fast speed. */
  let paintedTick = -1;

  /** One pass over the tiles, nearest-neighbour into the minimap square.
   *
   * Sampled per minimap PIXEL rather than per tile: a 48-tile region on a
   * 160-pixel map would otherwise leave two thirds of the pixels untouched
   * and transparent. */
  function paintWorld() {
    const { width, height, tiles } = state;
    const span = Math.max(width, height);
    const data = world.data;
    for (let py = 0; py < size; py += 1) {
      const ty = Math.min(height - 1, Math.floor((py * span) / size));
      for (let px = 0; px < size; px += 1) {
        const tx = Math.min(width - 1, Math.floor((px * span) / size));
        const index = ty * width + tx;
        let colour;
        const ground = tiles.terrain[index];
        if (ground === TERRAIN_WATER || ground === TERRAIN_SHALLOW) {
          colour = terrain[ground];
        } else if (tiles.buildingId[index] !== 0) {
          // A developed lot takes its zone's colour; a plant or a station has
          // no zone and takes the civic colour, which is how the player finds
          // the thing they are looking for on a map this small.
          const zone = tiles.zone[index];
          colour = zone === 0 ? civicColour : zones[zone];
        } else if ((tiles.road[index] & NET_PRESENT) !== 0) {
          colour = roadColour;
        } else if (tiles.zone[index] !== 0) {
          // Zoned but empty: the zone colour, dimmed, so a district the player
          // has drawn and not yet filled still reads as theirs.
          const z = zones[tiles.zone[index]];
          colour = [(z[0] + 255) >> 1, (z[1] + 255) >> 1, (z[2] + 255) >> 1];
        } else {
          colour = terrain[ground] ?? terrain[0];
        }
        const at = (py * size + px) * 4;
        data[at] = colour[0];
        data[at + 1] = colour[1];
        data[at + 2] = colour[2];
        data[at + 3] = 255;
      }
    }
    painted = true;
    paintedTick = state.tick;
  }

  function draw(aspect) {
    if (!painted || paintedTick !== state.tick) paintWorld();
    context.putImageData(world, 0, 0);
    const rect = viewportRect(view, aspect, size, state.width, state.height);
    if (!rectIsInformative(rect, size)) return;
    // White under dark, dark over white: one of the two is always visible
    // whatever the minimap looks like underneath.
    context.lineWidth = 3;
    context.strokeStyle = "rgba(255,255,255,0.85)";
    context.strokeRect(rect.x, rect.y, rect.width, rect.height);
    context.lineWidth = 1;
    context.strokeStyle = "rgba(0,0,0,0.85)";
    context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }

  function jumpTo(event) {
    const box = canvas.getBoundingClientRect();
    // Through the CSS size, not the backing-store size — they differ whenever
    // the minimap is scaled, which it is at 200% text.
    const px = ((event.clientX - box.left) / box.width) * size;
    const py = ((event.clientY - box.top) / box.height) * size;
    onJump?.(pixelToTile(px, py, size, state.width, state.height));
  }

  const onPointerDown = (event) => {
    canvas.setPointerCapture?.(event.pointerId);
    jumpTo(event);
  };
  // Held down, the minimap drags the camera around, which is how everyone
  // expects a minimap to behave.
  const onPointerMove = (event) => {
    if (event.buttons !== 0) jumpTo(event);
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);

  return {
    draw,
    /** The world changed: repaint on the next draw rather than now, so a
     * hundred tiles placed in one drag cost one repaint. */
    worldChanged() { painted = false; },
    dispose() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
    },
  };
}
