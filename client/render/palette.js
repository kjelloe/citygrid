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

/** Sixteen player colours. Distinguishable is not the same as sixteen — this is
 * a first pass, and the real set is verified by colour-vision simulation before
 * any of it ships. Identity always carries a pattern and a label too. */
export const PLAYER_COLOURS = [
  0x000000, // 0: nature, never drawn as an owner
  0xd8582b, 0x2f7fd8, 0x3fa64a, 0xd8b62b,
  0x8b4fd8, 0x2fb9b0, 0xd8459a, 0x7a6a4f,
  0xe0824a, 0x5f95e0, 0x6ec06a, 0xc9a93f,
  0xa87ad8, 0x4fc4bd, 0xd87ab5, 0x9a8a6f,
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
