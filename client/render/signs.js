// Fascia signs (slice E5; spec §6.5, ruling 036).
//
// The one thing at L3 that a flat colour cannot say: the name over a shop.
// Drawn into a Canvas2D at start-up rather than loaded — ruling 036 forbids
// binary assets, and a texture the game generates is not an asset — cached by
// the string, so the eighteen names in `data/names.json` are eighteen textures
// for a whole city however many shops there are.
//
// A textured mesh cannot go through the vertex-colour baker, which merges
// everything into one material. These merge by TEXTURE instead and are added
// to the same chunk group, so a chunk is still a handful of draw calls and one
// cull unit.

import * as THREE from "three";
import { EDGES, originOf } from "./facade.js";
import { makeMaterial } from "./style-assets.js";

const CACHE = new Map();
const WIDTH = 256;
const HEIGHT = 64;

/** The fascia texture for one name. Cached by the string it says. */
export function signTexture(text, ink = "#f4f0e6", ground = "#2b3138") {
  const key = `${text}|${ink}|${ground}`;
  const found = CACHE.get(key);
  if (found) return found;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = ink;
  // Shrunk to fit rather than clipped: "Launderette" is twice "Deli" and a
  // sign that runs off its own board reads as a bug, not as a long name.
  let size = 34;
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  while (ctx.measureText(text).width > WIDTH - 24 && size > 12) {
    size -= 2;
    ctx.font = `600 ${size}px system-ui, sans-serif`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, WIDTH / 2, HEIGHT / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  CACHE.set(key, texture);
  return texture;
}

/** How many distinct fascias have been drawn. Read by the gate: a cache that
 * never hits is a texture per shop, which is a draw call per shop. */
export function signCacheSize() {
  return CACHE.size;
}

/** The four corners of one fascia, in world metres, on the lot's street edge. */
function fasciaQuad(spec, front, from, to, lift = 0) {
  const geom = EDGES[front.side];
  const [ox, oz] = originOf(spec, front.side);
  const groundTop = spec.seat + spec.groundH + lift;
  const y0 = groundTop - 0.62;
  const y1 = groundTop - 0.1;
  // A hair proud of the wall, or it z-fights with the panel behind it.
  const out = 0.06;
  const at = (u, y) => [
    ox + geom.along[0] * u + geom.out[0] * out,
    y,
    oz + geom.along[1] * u + geom.out[1] * out,
  ];
  return { corners: [at(from, y0), at(to, y0), at(to, y1), at(from, y1)], out: geom.out };
}

/**
 * One mesh per distinct sign text, holding every fascia in the chunk that says
 * it. `specs` are the facade specs of the chunk's lots.
 */
export function buildSigns(specs, styleName = "plain") {
  const byText = new Map();
  for (const spec of specs) {
    const front = spec.edges.find((e) => e.street);
    if (!front) continue;
    // A civic building's name on a board over its entrance (S1b). The same
    // canvas the shopfronts use, localised the same way — a coal plant that
    // says "Coal plant" is a coal plant before you read the inspector.
    if (spec.civicSign) {
      // On the building, where `facade-spec.js` put it (R5) — not on the lot's
      // street edge, which for a civic building is the front garden.
      if (spec.civicSignQuad) {
        const list = byText.get(spec.civicSign) ?? [];
        list.push(spec.civicSignQuad);
        byText.set(spec.civicSign, list);
      }
    }
    if (spec.storefronts.length === 0) continue;
    for (const shop of spec.storefronts) {
      const list = byText.get(shop.sign) ?? [];
      list.push(fasciaQuad(spec, front, shop.from + 0.25, shop.to - 0.25));
      byText.set(shop.sign, list);
    }
  }

  const meshes = [];
  for (const [text, quads] of byText) {
    const position = new Float32Array(quads.length * 18);
    const uv = new Float32Array(quads.length * 12);
    const normal = new Float32Array(quads.length * 18);
    let at = 0;
    for (const { corners: q, out } of quads) {
      // The face's OWN outward normal, and a winding to match it. Deriving the
      // normal from the quad's own cross product pointed it into the building
      // on every edge, and with a double-sided material the whole high street
      // read its signs back to front (slice E5).
      const nx = out[0];
      const nz = out[1];
      const corners = [q[0], q[3], q[2], q[0], q[2], q[1]];
      // `u` runs from 1 down to 0 along the edge. The facade's edges run
      // ANTICLOCKWISE round the lot seen from above, so "along" is screen-LEFT
      // to a reader standing outside — and a whole high street read its signs
      // back to front until this was worked out on paper rather than guessed.
      const uvs = [[1, 0], [1, 1], [0, 1], [1, 0], [0, 1], [0, 0]];
      for (let i = 0; i < 6; i += 1) {
        position[at * 3] = corners[i][0];
        position[at * 3 + 1] = corners[i][1];
        position[at * 3 + 2] = corners[i][2];
        normal[at * 3] = nx;
        normal[at * 3 + 1] = 0;
        normal[at * 3 + 2] = nz;
        uv[at * 2] = uvs[i][0];
        uv[at * 2 + 1] = uvs[i][1];
        at += 1;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    // White vertex colours (R5). The style's material multiplies by them —
    // `makeMaterial` turns `vertexColors` on for everything, because the baker
    // bakes colour into vertices — and a geometry with no colour attribute is
    // multiplied by black: every fascia and every civic board in the city was
    // a black rectangle with its name painted on it in black.
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(quads.length * 18).fill(1), 3));
    geometry.computeBoundingSphere();
    // The STYLE's material, not a Lambert one whatever the style (R2). A
    // fascia in `painted` was the one surface on the street that was not
    // toon-shaded; in `pixel` it was lit on an unlit city; and at night it was
    // dark while the shopfront under it glowed.
    const material = makeMaterial(styleName, 0xffffff);
    material.map = signTexture(text);
    if (material.emissive) {
      material.emissive = new THREE.Color(0xffdca8);
      material.emissiveIntensity = 0;
      material.emissiveMap = material.map;
      // Marked so `setNight` finds it, like the lit windows behind it.
      material.userData.emissive = true;
    }
    material.needsUpdate = true;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `sign:${text}`;
    meshes.push(mesh);
  }
  return meshes;
}
