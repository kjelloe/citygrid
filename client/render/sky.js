// A sky, for the perspective camera only (slice V5; ruling 039 — hand-rolled).
//
// An orthographic view of a city has no horizon: the map fills the frame or the
// clear colour does, and a flat wash reads as "background". A perspective view
// at a low pitch has one, and a flat wash there reads as a wall the city is
// standing in front of. The dome is what turns that wall into distance.
//
// Fifty lines and no texture: an inverted sphere with a vertical gradient baked
// into its vertex colours, rendered inside out and without depth. That is the
// whole trick — no shader, no asset, and it costs one draw call (ruling 036: no
// binary assets, and 039: addons are hand-rolled).

import * as THREE from "three";

/** How far up the dome the horizon colour reaches before it starts turning to
 * zenith. Low, because most of what a low-pitched camera shows is near the
 * horizon and a gradient that starts high looks like a painted ceiling. */
const HORIZON = 0.12;

function mix(a, b, t) {
  return new THREE.Color(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  );
}

/**
 * `palette.sky` is the horizon; the zenith is a deeper version of it, so a
 * style's own colour still decides what its sky looks like and the dome never
 * fights the ground it sits behind.
 */
export function createSky(palette) {
  const geometry = new THREE.SphereGeometry(1800, 24, 16);
  const horizon = new THREE.Color(palette.sky);
  const zenith = mix(horizon, new THREE.Color(0x2f6ea8), 0.55);
  const ground = mix(horizon, new THREE.Color(0xffffff), 0.25);

  const position = geometry.getAttribute("position");
  const colours = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    // −1 at the nadir, +1 at the zenith.
    const up = position.getY(i) / 1800;
    const colour = up >= 0
      ? mix(horizon, zenith, Math.min(1, Math.max(0, (up - HORIZON) / (1 - HORIZON))))
      // Below the horizon the dome is only ever seen where the map is not, so
      // it lightens rather than darkening: a dark band under a city reads as a
      // hole in the world.
      : mix(horizon, ground, Math.min(1, -up * 2));
    colours[i * 3] = colour.r;
    colours[i * 3 + 1] = colour.g;
    colours[i * 3 + 2] = colour.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));

  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  }));
  // Drawn first and never culled: it is always around the camera, and a frustum
  // test on a sphere the camera is inside is a test that can only be wrong.
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}
