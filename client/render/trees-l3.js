// Trees at eye height (slice V8; spec §6.6).
//
// The instanced kit is a trunk and a four-sided cone, and at eighteen pixels a
// tile that is the right answer — it is also what a walker was standing under,
// because the tree pass was the one thing in `updateInstances` never gated on
// whether its chunk had been baked. Close up a four-sided cone is a pyramid.
//
// Higashiyama's rule: **never a billboard.** A trunk and a cluster of faceted
// blobs, built into the chunk so a wood is one draw call and follows the ground
// for free. WHERE a tree stands is `client/world/foliage.js` — both passes read
// it, so a tree does not jump sideways the moment its chunk bakes.
//
// Pure: it takes tree records and a height function and gives back buffers.

import { sink } from "./solid.js";

/** How many sides a blob has.
 *
 * Five, and it was seven. Seven put 21,336 triangles into the saturated
 * fixture's eight baked chunks and the night frame's ladder went from "detail
 * dropped" to "silhouettes only" — the trees were being paid for in buildings.
 * Five is 20 triangles a blob against 28, the crown still reads as a crown at
 * three metres, and the style is faceted to begin with (ruling 017). */
const SIDES = 5;

/** A faceted blob: two rings and two caps, like the instanced kit's `addBlob`
 * but built in metres straight into the sink. */
function blob(s, cx, cy, cz, radius, height, spin) {
  const ring = (y, r) => {
    const out = [];
    for (let i = 0; i < SIDES; i += 1) {
      const a = spin + (i / SIDES) * Math.PI * 2;
      out.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
    }
    return out;
  };
  const low = ring(cy + height * 0.28, radius * 0.86);
  const mid = ring(cy + height * 0.6, radius);
  const top = [cx, cy + height, cz];
  const foot = [cx, cy, cz];
  for (let i = 0; i < SIDES; i += 1) {
    const j = (i + 1) % SIDES;
    s.tri(foot, low[j], low[i]);
    s.quad(low[i], low[j], mid[j], mid[i]);
    s.tri(mid[i], mid[j], top);
  }
}

/**
 * One tree's geometry, in metres, seated on `heightAt`.
 *
 * Three species and they differ in SHAPE, not in tint: a conifer is a tapered
 * stack, a round tree is one crown on a bare trunk, a twin is two crowns off a
 * fork. V6's lesson — two variants that hash the same are a city of clones.
 */
export function treeGeometry(trunkSink, leafSink, tree, heightAt, cfg) {
  const { x, z, scale, spin, kind } = tree;
  const y = heightAt(x, z);
  const h = cfg.props.treeH * scale;
  const r = cfg.props.treeR * scale;
  const trunkR = r * 0.13;

  if (kind === "conifer") {
    trunkSink.box(x - trunkR, y, z - trunkR, x + trunkR, y + h * 0.42, z + trunkR);
    blob(leafSink, x, y + h * 0.18, z, r * 0.98, h * 0.5, spin);
    blob(leafSink, x, y + h * 0.5, z, r * 0.7, h * 0.42, spin + 0.4);
    blob(leafSink, x, y + h * 0.78, z, r * 0.4, h * 0.3, spin + 0.8);
    return;
  }
  if (kind === "round") {
    trunkSink.box(x - trunkR, y, z - trunkR, x + trunkR, y + h * 0.55, z + trunkR);
    blob(leafSink, x, y + h * 0.42, z, r, h * 0.6, spin);
    return;
  }
  // S5's three. A willow is a wide crown over a low skirt of fronds; a street
  // tree a small crown on a tall stem in a dark pit; an orchard tree squat.
  if (kind === "willow") {
    trunkSink.box(x - trunkR, y, z - trunkR, x + trunkR, y + h * 0.4, z + trunkR);
    blob(leafSink, x, y + h * 0.46, z, r * 1.15, h * 0.52, spin);
    blob(leafSink, x, y + h * 0.18, z, r * 1.25, h * 0.3, spin + 0.6);
    return;
  }
  if (kind === "street") {
    trunkSink.box(x - r * 0.32, y, z - r * 0.32, x + r * 0.32, y + 0.06, z + r * 0.32);
    trunkSink.box(x - trunkR * 0.7, y, z - trunkR * 0.7, x + trunkR * 0.7, y + h * 0.62, z + trunkR * 0.7);
    blob(leafSink, x, y + h * 0.6, z, r * 0.62, h * 0.36, spin);
    return;
  }
  if (kind === "orchard") {
    trunkSink.box(x - trunkR, y, z - trunkR, x + trunkR, y + h * 0.34, z + trunkR);
    blob(leafSink, x, y + h * 0.36, z, r * 0.74, h * 0.34, spin);
    return;
  }
  // A fork: two crowns off one trunk, offset either side of it.
  trunkSink.box(x - trunkR, y, z - trunkR, x + trunkR, y + h * 0.5, z + trunkR);
  const lean = r * 0.34;
  blob(leafSink, x - Math.cos(spin) * lean, y + h * 0.4, z - Math.sin(spin) * lean, r * 0.78, h * 0.5, spin);
  blob(leafSink, x + Math.cos(spin) * lean, y + h * 0.48, z + Math.sin(spin) * lean, r * 0.66, h * 0.44, spin + 1.1);
}

/**
 * Every tree in a chunk, as two pieces — bark and leaf.
 *
 * Two sinks and not one, because the baker colours a whole part: a brown trunk
 * and a green crown is two parts, exactly as the hedge and the path are.
 */
export function buildTrees({ trees, heightAt, palette, cfg }) {
  const bark = sink();
  const leaf = sink();
  for (const tree of trees) treeGeometry(bark, leaf, tree, heightAt, cfg);
  return [
    { part: bark.done(), colour: palette.trunk ?? 0x6b5340 },
    { part: leaf.done(), colour: palette.tree ?? 0x2f8f3a },
  ].filter((p) => p.part.triangles > 0);
}
