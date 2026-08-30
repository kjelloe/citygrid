// Every enumerated value the simulation uses. Numbers, not strings, because
// they live in typed arrays; names exported so nothing ever writes a bare 3.

export var TERRAIN_GRASS = 0;
export var TERRAIN_DIRT = 1;
export var TERRAIN_FOREST = 2;
export var TERRAIN_WATER = 3;
export var TERRAIN_SHALLOW = 4;
export var TERRAIN_ROCK = 5;
export var TERRAIN_SAND = 6;
export var TERRAIN_MARSH = 7;

export var ZONE_NONE = 0;
export var ZONE_RESIDENTIAL = 1;
export var ZONE_COMMERCIAL = 2;
export var ZONE_INDUSTRIAL = 3;

// Owner slots. 0 is nature, 1..16 are seats, 255 is the civic commons —
// border roads and shared projects that anyone may build on and only the
// builder may remove.
export var OWNER_NATURE = 0;
export var OWNER_COMMONS = 255;
export var SEAT_MIN = 1;
export var SEAT_MAX = 16;

// Tile flags, one bit each.
export var FLAG_POWERED = 1;
export var FLAG_WATERED = 2;
export var FLAG_BURNING = 4;
export var FLAG_RUINED = 8;
export var FLAG_ZONE_CENTRE = 16;
export var FLAG_CONDUCTS = 32;
export var FLAG_PROTECTED = 64;
export var FLAG_DERELICT = 128;

// Road, wire and pipe shapes are a 4-bit NESW adjacency mask; 0 means absent,
// so shape values run 0..15 with 0 reserved.
export var NET_NONE = 0;

export var MODE_SHARED_CITY = "sharedCity";
export var MODE_DISTRICTS = "districts";
export var MODE_REGION_RIVALS = "regionRivals";
export var MODE_SCENARIO_COOP = "scenarioCoop";

export var TREASURY_SHARED = "shared";
export var TREASURY_SPLIT = "split";
export var TREASURY_SEPARATE = "separate";

export var TERRAIN_STYLE_FLAT = "flat";
export var TERRAIN_STYLE_ROLLING = "rolling";
export var TERRAIN_STYLE_HILLY = "hilly";

export var WATER_NONE = "none";
export var WATER_LAKES = "lakes";
export var WATER_RIVER = "river";
export var WATER_COASTAL = "coastal";
export var WATER_ARCHIPELAGO = "archipelago";

export var DIFFICULTY_RELAXED = "relaxed";
export var DIFFICULTY_STEADY = "steady";
export var DIFFICULTY_DEMANDING = "demanding";

// The clock. Twelve fast ticks to a month, twelve months to a year — so a
// year is 144 fast ticks and a month boundary is cheap to test for.
export var TICKS_PER_MONTH = 12;
export var MONTHS_PER_YEAR = 12;
export var TICKS_PER_YEAR = 144;

export var PLAYER_ACTIVE = 0;
export var PLAYER_AFK = 1;
export var PLAYER_REGENT = 2;
export var PLAYER_GONE = 3;

// --- history (slice 4.6) ----------------------------------------------------

/** Twenty years of monthly samples. Bounded, because a 200-year game must not
 * grow without limit; hashed, because two clients that disagree about the
 * graphs disagree about the city. */
export var HISTORY_CAP = 240;

/** The order history fields are written in, for the hash and the save.
 * Explicit and ordered — canonical serialisation may not depend on key order. */
export var HISTORY_FIELDS = [
  "tick", "population", "jobs", "treasury", "landValue", "pollution",
  "crime", "congested", "demandR", "demandC", "demandI",
];

// --- department funding (gamedesign.md §9.4) --------------------------------

/** The services that carry a funding level. These are the `service` values in
 * `data/buildings.json`; a station type added there with a new service name
 * must be added here too, and `test/civic.test.js` says so. */
export var FUNDING_SERVICES = ["fire", "police", "health"];
