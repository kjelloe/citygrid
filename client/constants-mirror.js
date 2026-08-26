// The handful of engine constants the renderer needs.
//
// Mirrored rather than imported because engine/ is written in the restricted
// subset and the renderer has no business reaching into it — the renderer reads
// state, it does not participate in the rules. test/render.test.js keeps the
// two in step.

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
