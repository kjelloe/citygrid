// Colours. One place, because the palette has three jobs at once: terrain and
// buildings legible against each other, eleven data overlays readable on top of
// any of them, and sixteen player colours distinguishable from both — including
// under colour-vision deficiency (specs/art-direction.md §1.5).
//
// Placeholder values until probe 1.2b settles the style (ruling 013). They are
// deliberately flat and slightly unfinished-looking.

export const TERRAIN_COLOURS = [
  0x7fa650, // grass
  0xa08a63, // dirt
  0x4e7c3a, // forest
  0x2f5d7c, // water
  0x4a86a8, // shallow
  0x8d8d8f, // rock
  0xd9c98c, // sand
  0x6b7f5a, // marsh
];

/** Sixteen player colours, chosen by search rather than by eye.
 *
 * The requirement (gamedesign.md §30) is that no two seats collapse into each
 * other under protanopia, deuteranopia or tritanopia. A hand-picked set failed
 * that badly — seven pairs collapsed, the worst at a distance of 0.018 — so
 * these were selected by greedy farthest-point search scored on the WORST pair
 * across all four vision types at once, within a saturation and lightness band
 * that suits the game. Worst pair is now 0.18, ten times the failure threshold.
 *
 * Sixteen genuinely distinguishable colours still do not exist, which is why
 * player identity is always colour PLUS pattern PLUS label. This palette makes
 * the colour carry as much as a colour can, and no more.
 *
 * test/render.test.js re-runs the simulation, so a "nicer" colour swapped in
 * later cannot quietly break it. */
export const PLAYER_COLOURS = [
  0x000000, // 0: nature, never drawn as an owner
  0x8f82c4, 0xe7e792, 0x92e7e7, 0xd33636,
  0xc2c247, 0x2525a7, 0x92b4e7, 0xc4828f,
  0x36d3b4, 0xe7a392, 0xc6de68, 0xa5cbd5,
  0xa7a725, 0x9436d3, 0x6897de, 0xb1599f,
];

export const ZONE_COLOURS = [
  0x000000,
  0x4caf50, // residential
  0x2f7fd8, // commercial
  0xd8b62b, // industrial
];

export const UI = {
  road: 0x3b3b3f,
  wire: 0xc9b458,
  pipe: 0x4a86a8,
  ruin: 0x5a5048,
  burning: 0xe04b2a,
  ghostValid: 0x6bbf92,
  ghostInvalid: 0xd8452b,
  placeholderTint: 0xb0a99a,
};

/** Overlay band colours, fixed by gamedesign.md §16: green good, yellow
 * strained, red failing, grey not applicable. Grey is never drawn — a tile with
 * nothing to say is left showing the city, which is more informative than a
 * wash of grey over the sea. */
export const OVERLAY_COLOURS = [0x53c46a, 0xe8c440, 0xdb4b3a, 0x8d9096];

/** Buildings are tinted by zone and lightened by value tier, so a prosperous
 * district reads lighter without needing different geometry. */
export function buildingColour(zone, valueTier, palette) {
  const table = palette?.zone ?? ZONE_COLOURS;
  const base = table[zone] ?? UI.placeholderTint;
  const lift = valueTier * 0x101010;
  const r = Math.min(255, ((base >> 16) & 0xff) + ((lift >> 16) & 0xff));
  const g = Math.min(255, ((base >> 8) & 0xff) + ((lift >> 8) & 0xff));
  const b = Math.min(255, (base & 0xff) + (lift & 0xff));
  return (r << 16) | (g << 8) | b;
}
