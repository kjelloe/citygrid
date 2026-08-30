// The handful of engine constants the renderer and the HUD need.
//
// Mirrored rather than imported because engine/ is written in the restricted
// subset and neither the renderer nor the HUD has any business reaching into
// it — they read state, they do not participate in the rules.
// test/render.test.js keeps the two in step, so a drifted value fails loudly
// rather than drawing the wrong thing quietly.

export const ZONE_NONE = 0;
export const ZONE_RESIDENTIAL = 1;
export const ZONE_COMMERCIAL = 2;
export const ZONE_INDUSTRIAL = 3;

export const TERRAIN_GRASS = 0;
export const TERRAIN_DIRT = 1;
export const TERRAIN_FOREST = 2;
export const TERRAIN_WATER = 3;
export const TERRAIN_SHALLOW = 4;
export const TERRAIN_ROCK = 5;
export const TERRAIN_SAND = 6;
export const TERRAIN_MARSH = 7;

export const FLAG_POWERED = 1;
export const FLAG_WATERED = 2;
export const FLAG_BURNING = 4;
export const FLAG_RUINED = 8;

export const NET_PRESENT = 16;

// The HUD's clock. The engine decides what a tick means; the top bar only has
// to turn a count of them into a date a person recognises.
export const TICKS_PER_YEAR = 144;
