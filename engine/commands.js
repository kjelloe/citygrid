// The command vocabulary. A replay is seed + options + this list, so every
// command must be describable in integers, strings and booleans.

export var CMD_TICK = "tick";
export var CMD_JOIN = "join";
export var CMD_LEAVE = "leave";
export var CMD_SET_STATUS = "setStatus";
export var CMD_PAINT_ZONE = "paintZone";
export var CMD_DEZONE = "dezone";
export var CMD_PLACE_ROAD = "placeRoad";
export var CMD_PLACE_WIRE = "placeWire";
export var CMD_PLACE_PIPE = "placePipe";
export var CMD_PLACE_BUILDING = "placeBuilding";
export var CMD_BULLDOZE = "bulldoze";
export var CMD_SET_TAX = "setTax";
export var CMD_SET_FUNDING = "setFunding";
export var CMD_TAKE_LOAN = "takeLoan";
export var CMD_TRANSFER_FUNDS = "transferFunds";
export var CMD_REQUEST_DEMOLITION = "requestDemolition";
export var CMD_RESOLVE_REQUEST = "resolveRequest";
export var CMD_WITHDRAW_REQUEST = "withdrawRequest";
export var CMD_SET_REQUEST_POLICY = "setRequestPolicy";
export var CMD_REPORT_NUISANCE = "reportNuisance";
export var CMD_CLAIM_SECTOR = "claimSector";
export var CMD_OPEN_BORDER = "openBorder";
export var CMD_MUTUAL_AID = "mutualAid";
export var CMD_OFFER_CONTRACT = "offerContract";
export var CMD_RESOLVE_CONTRACT = "resolveContract";
export var CMD_PING = "ping";

/** Commands that paint over a set of tiles. These carry `runs` — a run-length
 * encoded cell list — never one command per tile crossed. That single rule is
 * the biggest multiplayer load lever there is. */
export var AREA_COMMANDS = [
  CMD_PAINT_ZONE, CMD_DEZONE, CMD_PLACE_ROAD, CMD_PLACE_WIRE,
  CMD_PLACE_PIPE, CMD_BULLDOZE, CMD_REQUEST_DEMOLITION, CMD_REPORT_NUISANCE,
];

export function isAreaCommand(type) {
  for (var i = 0; i < AREA_COMMANDS.length; i += 1) {
    if (AREA_COMMANDS[i] === type) return true;
  }
  return false;
}

/** Commands the clock issues; they carry no actor. */
export function isSystemCommand(type) {
  return type === CMD_TICK;
}
