// The water's surface (slice E8; spec §5.5).
//
// ONE mesh for the whole map, drawn after the terrain, at the water's own
// level. Plumbing: what the surface IS — where, how high, how deep under it —
// is `client/world/water.js`, which node can load and which is where the tests
// are.
//
// **Two deviations from §5.5, both measured.**
//
// Not a plane but a quad per water tile, at that tile's own level. A single
// plane is a single height, and the `rolling` fixture's river falls 33 m from
// end to end — a plane would flood half the valley and leave the rest dry.
//
// Not per chunk but one mesh. Per chunk it was sixteen draw calls on a 64×64
// and `client_smoke` went red at **89 against its budget of 80** — the check
// that exists to notice instancing quietly stopping. One mesh is one call and
// forfeits frustum culling, which costs nothing here: two triangles a tile is
// 1,570 for the whole of a 64×64, less than one building, and a terrain chunk
// is 512 on its own. The count the budget is charged is therefore the whole
// map's water, not the part on screen, because the whole map's water is drawn.
//
// LIT, and that was not the first answer. Unlit is the obvious choice — water
// is a reflection, not a surface catching a lamp — and it produced a river
// glowing cyan through a black city at midnight. Not because the colour was
// wrong: `applyHour` dimmed it by the preset's hemisphere and three does that
// arithmetic in LINEAR space, so a factor of 0.34 is about 0.6 to the eye,
// while the lit ground beside it had gone to almost nothing. A lit material
// dims by exactly what everything else dims by, for free and without a second
// copy of the lighting rules. Transparent, because the shoreline is the bed
// coming up through it and you have to be able to see it happen.

import * as THREE from "three";
import { PALETTES } from "./palettes.js";
import { getConfig } from "../world/config.js";

/**
 * Builds the water surface for a whole map.
 *
 * In TILE units like every other pool, so the scene's own scale holds.
 */
export function createWater(state, model, styleName = "plain") {
  const cfg = getConfig();
  const palette = PALETTES[styleName] ?? PALETTES.plain;
  const group = new THREE.Group();
  // After the terrain and after the baked streets: a transparent surface has to
  // be drawn over what it is transparent ABOUT.
  group.renderOrder = 2;

  const material = new THREE.MeshLambertMaterial({
    color: palette.terrain[3],
    transparent: true,
    opacity: cfg.water.opacity,
    // A surface, not a solid: the bed under it still writes depth, and a water
    // plane that wrote its own would hide everything behind it in the same
    // chunk — including the far bank.
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const tileM = model.tileM;
  const water = model.water;
  const tiles = water.tiles;

  if (tiles.length > 0) {
    const positions = new Float32Array(tiles.length * 6 * 3);
    let p = 0;
    for (const tile of tiles) {
      const x = tile % state.width;
      const y = (tile - x) / state.width;
      // A few centimetres ABOVE the level (`water.lift`). At the shoreline the
      // bed is the surface by definition, so a plane at exactly the level is
      // coplanar with the sand under it: the two z-fight, and at night — when
      // the water is dark and the shallows are the palette's palest colour —
      // it showed as a river glowing through a black city.
      // A height per CORNER, shared with whatever water meets there (S4). A
      // quad at the tile's own level steps at every tile boundary, and a
      // transparent sheet of steps reads as seams and a cross-hatch from the
      // air — which is what `smoke-S2-edge.png` showed. The corners are the
      // mean of the water that meets at them, so a lake is one plane and a
      // river still falls along its length.
      const lift = cfg.water.lift;
      const cornerY = (cx, cy) => (water.cornerLevelAt(cx, cy) + lift) / tileM;
      const h00 = cornerY(x, y);
      const h10 = cornerY(x + 1, y);
      const h01 = cornerY(x, y + 1);
      const h11 = cornerY(x + 1, y + 1);
      // Counter-clockwise from +Y so the normal points up, the same winding the
      // terrain uses — a surface culled from above is a lake that is not there.
      const quad = [
        [x, h00, y], [x + 1, h11, y + 1], [x + 1, h10, y],
        [x, h00, y], [x, h01, y + 1], [x + 1, h11, y + 1],
      ];
      for (const [vx, vy, vz] of quad) {
        positions[p] = vx; positions[p + 1] = vy; positions[p + 2] = vz;
        p += 3;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "water";
    mesh.renderOrder = 2;
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    group.add(mesh);
  }

  return {
    group,
    triangles: tiles.length * 2,
    tiles: tiles.length,
    /**
     * The hour moves the sky, and the water with it (E6).
     *
     * Water is mostly a REFLECTION of the sky, and treating it as one is what
     * makes it work at every hour for free: blue at noon, orange at dusk, near
     * black at midnight. The first version scaled the palette colour by the
     * preset's hemisphere with a floor under it, and a night shot came back
     * with a river glowing cyan through a black city — an unlit material does
     * not dim with the lights, which is the whole reason it is unlit.
     */
    applyHour(hour) {
      const sky = new THREE.Color(hour?.sky ?? 0xbfe0f0);
      material.color.setHex(palette.terrain[3]).lerp(sky, 0.35);
      // And it turns to glass as the light goes: at midnight what you see is
      // the sky on it, not the bed under it.
      material.opacity = cfg.water.opacity + (1 - cfg.water.opacity) * (hour?.night ?? 0);
    },
    dispose() {
      for (const mesh of group.children) mesh.geometry.dispose();
      group.clear();
      material.dispose();
    },
  };
}
