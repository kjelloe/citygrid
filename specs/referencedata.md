# Analysis of a js game— Gameplay, Simulation and UI Specification

A complete inventory of the gameplay setup, simulation loops, "story"/narrative elements and UI
elements found in `./src` and `index.html`, written as a porting reference for a rewrite using
three.js polygon graphics.

All file/line references point at the current tree. Numbers are taken verbatim from the source;
where the source contains a bug that a reimplementation must decide about, it is flagged
**[QUIRK]**.

---

## 0. Legal constraints on a derivative (read first)

| Item | Obligation |
|---|---|
| `LICENSE` | GPLv3 **plus additional GPL §7 terms**: no SimCity/EA trademark use, no claim of EA affiliation, modified versions must be marked as modified. |
| `MicropolisPublicNameLicense.md` | If the derivative keeps the name "Micropolis" (or a variation: `MicropolisX`, `Ymicropolis`, `Micropolis Z`), you must show a trademark attribution on the welcome/title page **and** in credits, linked to <https://www.micropolis.com>. Non-commercial use only. |
| `index.html:174-176`, `about.html`, `name_license.html` | Existing attribution blocks — the new UI needs equivalents (splash screen + credits/about panel). |

A three.js version therefore needs, at minimum: a splash/title screen with the attribution string,
a credits panel, and the license files shipped alongside.

---

## 1. Architecture at a glance

```
micropolis.js          bootstrap: load tile images -> TileSet -> SplashScreen
  splashScreen.js      map generation + "Play/Generate/Load" + name/difficulty form
    game.js            top-level controller: owns Simulation, GameCanvas, InputStatus, all windows
      simulation.js    the 16-phase simulation loop + city clock + message dispatch
        gameMap.js     120x100 Tile grid (value + flag bits)
        blockMap.ts    coarse per-neighbourhood data grids (land value, crime, pollution, ...)
        mapScanner.js  per-tile dispatch table -> residential/commercial/industrial/road/... handlers
        budget.js      tax collection, service funding, deterioration effects
        census.js      per-cycle statistics + 10/120-step history graphs
        valves.js      global R/C/I demand
        evaluation.js  score, city class, public opinion, "worst problems"
        spriteManager.js + *Sprite.js   moving objects (train, ship, plane, copter, monster, tornado, explosion)
        disasterManager.js              fire, flood, meltdown, earthquake (stub)
      gameCanvas.js    2D tile blitter (to be replaced by the three.js renderer)
      inputStatus.js   keyboard/mouse -> tool + window events
      gameTools.js     the 16 player tools
      *Window.js       modal dialogs (budget, evaluation, disasters, query, settings, ...)
```

Everything is wired through a tiny publish/subscribe layer (`eventEmitter.js`) using the string
constants in `messages.ts`. **The event names are the cleanest seam for a rewrite**: the whole
simulation can be kept and only the renderer/UI replaced, because the sim never touches the DOM
(the only exceptions are `queryTool.js` and `game.js:470-479`, which write text into DOM nodes
directly — those must be refactored into events).

---

## 2. Game setup / bootstrap flow

### 2.1 Asset load (`micropolis.js`)
1. Three `<img>` elements in `index.html:26-28` hold `images/tiles.png`, `images/tilessnow.png`,
   `images/sprites.png`.
2. `TileSet` (`tileSet.js`) validates the image is square and `32*16 = 512px` per side, then slices
   it into **1024 individual 16x16 `Image` objects** via a scratch canvas + `toDataURL()`.
3. If slicing fails (tainted canvas under `file://`), it falls back to the base64 data URIs in
   `tileSetURI.ts` / `tileSetSnowURI.ts` (~94 KB each of embedded PNG).
4. `Config.debug` is set from the URL query `?debug=1`.
5. When tiles + `#sprites` are all loaded, `SplashScreen` is constructed.

> **three.js note:** replace steps 2–3 entirely. Keep `tiles.png` only as a reference for what each
> of the 1024 tile IDs looks like; the polygon version needs a tile-ID → mesh/material mapping table
> (see §12).

### 2.2 Splash screen (`splashScreen.js`, `index.html:44-55`)
- Guard: if `#tooSmall` is visible the game refuses to start and re-tries on `resize`.
- `MapGenerator()` produces a fresh 120x100 map; `SplashCanvas` paints a scaled-down minimap into
  `#splashContainer`.
- Buttons: **Load game** (enabled only if `localStorage` has a save), **Play this map**,
  **Generate another**.

### 2.3 New-game form (`index.html:56-69`)
- City name, `maxlength=15`, required (requirement dropped when `Config.debug`).
- Difficulty radio: `Easy=0`, `Medium=1`, `Hard=2` → `Simulation.LEVEL_EASY/MED/HARD`.
- Submit → `new Game(map, tileSet, snowTileSet, spriteSheet, difficulty, name)`.

### 2.4 Initial game state (`game.js:46-247`, `simulation.js:114-121`)
| Property | Value |
|---|---|
| Map size | 120 x 100 tiles, 16 px per tile |
| Starting funds | `$20000` |
| Starting year | 1900 (`_startingYear`), month Jan |
| Default speed | `SPEED_MED` |
| Tax rate | 7 % |
| `autoBudget` | true |
| `autoBulldoze` | true |
| `disastersEnabled` | **false** by default (`disasterManager.js:29`) — enabled from the Settings dialog |
| Initial `census.totalPop` | 1 |
| RCI bars seeded to | 750 / 750 / 750 (`game.js:279`) |
| Nag dialog timer | 30 minutes |

### 2.5 Map generation (`mapGenerator.js`)
Terrain-only generation (no pre-built cities / scenarios):
- `TERRAIN_CREATE_ISLAND = Random.getRandom(2) - 1` → `-1` or `0`; if `-1`, a 10 % chance of a pure
  island map (`makeIsland`, radius 18, water border of 5 tiles).
- Otherwise: clear to `DIRT`, lay one big river (`doBRiver` twice + `doSRiver`), 0–10 lakes
  (`makeLakes` → 2–14 river "plops" each), `smoothRiver`, then trees.
- River stamps are literal matrices: `plopBRiver` 9x9 (`REDGE` ring, `RIVER` fill, `CHANNEL` centre),
  `plopSRiver` 6x6.
- `smoothRiver` picks the correct `REDGE` variant from a 16-entry `riverEdges` lookup keyed on the
  4-neighbour water bitmask; `smoothTrees` does the same for woods via `treeTable`.
- Trees: 50–150 `treeSplash` seeds, each a random walk of 50–200 steps painting `WOODS`.
- `smoothWater()` exists but **is never called** — dead code. **[QUIRK]** (it also references an
  undefined `TILE_INVALID`).

> **three.js note:** the generator produces only water / river-edge / woods / dirt. It is trivially
> portable, and its output is a good source for a height/biome map: `REDGE` tiles are the shoreline
> ring, `CHANNEL` marks navigable water (ships spawn only on `CHANNEL` at a map edge), `WOODS*` marks
> vegetation instancing positions.

---

## 3. World model

### 3.1 Tiles (`tile.ts`, `tileFlags.ts`, `tileValues.ts`)
A tile is a **single 16-bit integer**: low 10 bits = tile value (0–1023), high 6 bits = flags.

| Flag | Bit | Meaning |
|---|---|---|
| `POWERBIT` | `0x8000` | tile currently has power |
| `CONDBIT` | `0x4000` | tile conducts electricity |
| `BURNBIT` | `0x2000` | tile can catch fire |
| `BULLBIT` | `0x1000` | tile is bulldozable |
| `ANIMBIT` | `0x0800` | tile is animated |
| `ZONEBIT` | `0x0400` | tile is the **centre** of a zone (the sim only visits centres) |

Common combos: `BLBNBIT` (bull+burn), `BLBNCNBIT` (bull+burn+cond), `BNCNBIT` (burn+cond),
`ASCBIT` (anim+cond+burn).

### 3.2 Tile-value ranges (`tileValues.ts`) — the full terrain/building catalogue

| Range | Constant(s) | Content |
|---|---|---|
| 0 | `DIRT` | bare land |
| 2–20 | `RIVER`, `REDGE`, `CHANNEL`, `FIRSTRIVEDGE..LASTRIVEDGE` | water + 16 shore variants |
| 21–43 | `TREEBASE..LASTTREE`, `WOODS`, `WOODS2..WOODS5` | forest variants |
| 44–47 | `RUBBLE..LASTRUBBLE` | 4 rubble variants |
| 48–51 | `FLOOD..LASTFLOOD` | flood water |
| 52 | `RADTILE` | radioactive contamination |
| 56–63 | `FIRE..LASTFIRE` | 8-frame fire animation |
| 64–206 | `HBRIDGE`,`VBRIDGE`,`ROADS..ROADS10`,`INTERSECTION`,`HROADPOWER`,`VROADPOWER`, `LTRFBASE`(80), `HTRFBASE`(144), drawbridge tiles `BRWH`/`BRWV` | roads; the same 16 shapes repeat 3x for **no / light / heavy traffic** |
| 208–222 | `HPOWER`,`VPOWER`,`LHPOWER`,`LVPOWER..LVPOWER10`,`RAILHPOWERV`,`RAILVPOWERH` | power lines (16 shapes) |
| 224–238 | `HRAIL`,`VRAIL`,`LHRAIL`,`LVRAIL..LVRAIL10`,`HRAILROAD`,`VRAILROAD` | rail (16 shapes) |
| 240–248 | `RESBASE`, `FREEZ`(244) | empty residential 3x3 |
| 249–260 | `HOUSE`/`LHTHR`..`HHTHR` | single houses (12 = 4 value levels x 3 variants) |
| 265+ | `RZB` | populated residential 3x3 blocks: `((lpValue*4)+population)*9 + RZB`, 4 pop levels x 4 value levels |
| 405–413 | `HOSPITALBASE`,`HOSPITAL`(409) | hospital 3x3 |
| 414–422, 956–1018 | `CHURCHBASE`/`CHURCH`(418), `CHURCH1..CHURCH7` | churches (8 denominational variants) |
| 423–431 | `COMBASE`, `COMCLR`(427) | empty commercial 3x3 |
| 436–609 | `CZB` | populated commercial: `((lpValue*5)+population)*9 + CZB`, 5 pop x 4 value |
| 612–620 | `INDBASE`, `INDCLR`(616) | empty industrial 3x3 |
| 621–692 | `IZB`(625) | populated industrial: `((valueCat*4)+population)*9 + IZB`, 4 pop x 2 value |
| 693–708 | `PORTBASE`, `PORT`(698) | seaport 4x4 |
| 709–744 | `AIRPORTBASE`, `RADAR`(711), `AIRPORT`(716) | airport 6x6 |
| 745–760 | `COALBASE`, `POWERPLANT`(750) | coal plant 4x4 |
| 761–769 | `FIRESTBASE`, `FIRESTATION`(765) | fire station 3x3 |
| 770–778 | `POLICESTBASE`, `POLICESTATION`(774) | police station 3x3 |
| 779–794 | `STADIUMBASE`, `STADIUM`(784) | stadium 4x4 |
| 800 | `FULLSTADIUM` | stadium with a game on |
| 811–826 | `NUCLEARBASE`, `NUCLEAR`(816) | nuclear plant 4x4 |
| 827 | `LIGHTNINGBOLT` | drawn over unpowered zone centres (blink) |
| 828–831, 948–951 | `HBRDG0..3`, `VBRDG0..3` | open drawbridge frames |
| 832–839 | `RADAR0..7` | rotating airport radar animation |
| 840–843 | `FOUNTAIN` | animated park fountain |
| 844–851 | `INDBASE2`/`TELEBASE..TELELAST` | industrial animation |
| 852–859 | `SMOKEBASE` | smoke animation |
| 860–867 | `TINYEXP..LASTTINYEXP` | small demolition explosion |
| 916–931 | `COALSMOKE1..4` | 4 coal-plant chimney animations |
| 932–947 | `FOOTBALLGAME1/2` | stadium crowd animation |
| 952–955 | `NUKESWIRL1..4` | nuclear cooling animation |
| — | `TILE_COUNT = 1024`, `TILE_INVALID = -1` | `-1` is painted as black "void" outside the map |

### 3.3 Zone sizes (`zoneUtils.js`)
- 3x3: residential, commercial, industrial, hospital, church, fire station, police station.
- 4x4: coal plant, nuclear plant, seaport, stadium.
- 6x6: airport.
`checkBigZone(tileValue)` returns `{zoneSize, deltaX, deltaY}` so a click on any tile of a big
building resolves back to its centre — the polygon version needs the same reverse mapping (or,
better, a proper building entity list; see §12.3).

### 3.4 Block maps (`blockMap.ts`, allocated in `simulation.js:69-110`)
Coarse overlays; `blockSize` = how many map tiles share one cell.

| Map | Block | Range | Purpose |
|---|---|---|---|
| `cityCentreDistScoreMap` | 8 | −64..64 | commercial growth bonus by distance from city centre |
| `crimeRateMap` | 2 | 0..250 | crime |
| `fireStationMap` | 8 | 0..1000 | raw fire-station coverage deposits |
| `fireStationEffectMap` | 8 | 0..1000 | smoothed fire cover |
| `landValueMap` | 2 | 0..250 (0 = undeveloped) | land value |
| `policeStationMap` | 8 | 0..1000 | raw police deposits |
| `policeStationEffectMap` | 8 | 0..1000 | smoothed police cover |
| `pollutionDensityMap` | 2 | 0..255 | pollution |
| `populationDensityMap` | 2 | 0..510 | population density |
| `rateOfGrowthMap` | 8 | −200..200 | neighbourhood growth trend |
| `terrainDensityMap` | 4 | 0..240 | how unspoilt the neighbourhood is |
| `trafficDensityMap` | 2 | 0..240 | traffic |
| `tempMap1/2` (2), `tempMap3` (4) | — | — | smoothing scratch |
| `powerGridMap` (in `PowerManager`) | 1 | 0/1 | flood-filled power reachability |

These are exactly the data you want to expose as **heatmap overlays** in a modern UI.

---

## 4. The simulation loop

### 4.1 Frame/tick structure (`game.js:660-710`, `simulation.js:177-218`)
- `tick()` re-schedules itself with `setTimeout(…, 0)`; it calls `simulation.simTick()` unless a
  dialog is open, the sim is paused, or `#tooSmall` is visible. It also recomputes the tool
  hover-outline (`calculateMouseForPaint`) — **building works while paused**.
- `animate()` runs on `requestAnimationFrame`: moves sprites (unless paused), then paints the main
  canvas and the MonsterTV canvas. In debug mode it also updates the FPS counter.
- Sim rate limiting by speed:

| Speed | Value | Min ms between sim frames |
|---|---|---|
| `SPEED_PAUSED` | 0 | — |
| `SPEED_SLOW` | 1 | 100 |
| `SPEED_MED` | 2 | 50 |
| `SPEED_FAST` | 3 | 10 |

**[QUIRK]** the UI only exposes Pause/Play (`game.js:491-501`); the Settings dialog does expose all
three speeds, but the comment notes the sim is not optimised enough for them to differ meaningfully.

### 4.2 The 16-phase cycle (`simulation.js:312-393`)
`_phaseCycle` runs 0..15, one phase per sim frame:

| Phase | Work |
|---|---|
| 0 | `_simCycle++` (wraps at 1024), `_cityTime++`, every 2nd cycle `valves.setValves()`, clear census + power stack + fire/police deposit maps |
| 1–8 | `mapScanner.mapScan()` over one eighth of the map width (15 columns each) |
| 9 | every 4 cityTime → `take10Census`; every 40 → `take120Census`; every 48 → `collectTax()` + `evaluation.cityEvaluation()` |
| 10 | every 5 simCycles decay `rateOfGrowthMap`; decay `trafficDensityMap`; `_sendMessages()` |
| 11 | `powerManager.doPowerScan()` — every 2/4/5 simCycles (slow/med/fast) |
| 12 | `pollutionTerrainLandValueScan()` — every 2/7/17 |
| 13 | `crimeScan()` — every 1/8/18 |
| 14 | `populationDensityScan()` — every 1/9/19 |
| 15 | `fireAnalysis()` — every 1/10/20; then `disasterManager.doDisasters()` |

**[QUIRK]** phase 9 passes a bare `budget` identifier (undefined global) to `take10/120Census`
instead of `this.budget` — the money history graph is broken.

### 4.3 City clock (`simulation.js:601-633`)
- `48 cityTime units = 1 year`; `month = (cityTime % 48) >> 2` (4 units per month).
- `DATE_UPDATED` fires on any month/year change.
- Seasonal tileset swap exists (`game.js:289-294`: October, 10 % chance → snow tiles; January →
  normal) but the listener is **commented out** at `game.js:203-204`. **[QUIRK]** — a modern version
  should just re-enable it as a season/weather system.

### 4.4 Map scan dispatch (`mapScanner.js`)
For every tile with value ≥ `FLOOD`:
1. if conductive → `powerManager.setTilePower()`
2. if `ZONEBIT` → `repairManager.checkTile()` and increment powered/unpowered zone counts
3. run the **first** matching registered action.

Registered actions (`simulation.js:282-290`):

| Module | Criterion | Handler |
|---|---|---|
| `Residential` | `isResidentialZone`, `HOSPITAL` | growth/decay, hospital upkeep |
| `Commercial` | `isCommercialZone` | growth/decay |
| `Industrial` | `isIndustrialZone` | growth/decay + smoke animation bits |
| `EmergencyServices` | `POLICESTATION`, `FIRESTATION` | deposit coverage into block maps |
| `MiscTiles` | `isFire`, `RADTILE`, `isFlood` | fire spread/extinguish, radiation decay, flood spread |
| `PowerManager` | `POWERPLANT`, `NUCLEAR` | census + push onto power stack + meltdown roll |
| `Road` | `isRoad` | traffic-density repaint, decay, drawbridge open/close |
| `Transport` | `isRail`, `PORT`, `AIRPORT` | census, train/ship/plane/copter spawning, radar animation |
| `Stadia` | `STADIUM`, `FULLSTADIUM` | start/stop the football game |

`RepairManager` auto-repairs damaged non-centre tiles of key buildings on a `cityTime & period`
schedule: hospital (15, size 3), stadium (15, 4), coal & nuclear plant (7, 4), seaport (15, 4),
airport (7, 6).

---

## 5. Zoning, growth and the demand model

### 5.1 The R/C/I valves (`valves.js`)
Global demand, recomputed every other `_simCycle`:
- `resValve` clamped ±2000, `comValve` and `indValve` clamped ±1500.
- Inputs: `resPop/8` (normalised), `comPop`, `indPop`, employment ratio
  `(comHist10[1] + indHist10[1]) / normalizedResPop`, birth rate 0.02, labour base (clamped 0..1.3),
  internal market `= (normRes + com + ind) / 3.7`, external market factor per difficulty
  `[1.2, 1.1, 0.98]`.
- Tax drag: `taxTable[min(cityTax + gameLevel, 20)]` where
  `taxTable = [200,150,120,100,80,50,30,0,-10,-40,-100,-150,-200,-250,-300,-350,-400,-450,-500,-550,-600]`,
  scaled by 600. Tax ≥ 7 % is already a net negative.
- **Caps**: `resCap` / `comCap` / `indCap` are set when the city needs a stadium / airport / seaport
  (see §7.2); a set cap forces the corresponding valve to 0 when positive.
- Emits `VALVES_UPDATED` → drives the RCI widget.

### 5.2 Per-zone growth (`residential.js`, `commercial.js`, `industrial.js`)
All three follow the same shape, run from the map scan on the zone centre:

1. Add to census (`resZonePop`/`comZonePop`/`indZonePop` and `resPop`/`comPop`/`indPop`).
2. Read `zonePower = tile.isPowered()`.
3. Occasionally test road connectivity via `trafficManager.makeTraffic(x, y, blockMaps, destFn)`
   where `destFn` is the *counterpart* zone type (R→C, C→I, I→R). No road at all → immediate
   `degradeZone`.
4. Occasionally (`Random.getChance(7)`, always for an empty residential zone) score the zone:
   - residential: `landValue - pollution`, scaled to ±3000 → plus `resValve`
   - commercial: `cityCentreDistScoreMap` (±64) → plus `comValve`
   - industrial: just `indValve` (−1000 if no route found)
   - unpowered → score forced to −500
5. Grow if `score > -350 && (score - 26380) > Random.getRandom16Signed()`;
   decay if `score < 350 && (score + 26380) < Random.getRandom16Signed()`.
   (≈9 % chance to grow, ≈7–10 % to decay per assessment — the source comments do the arithmetic.)

Residential specifics:
- Empty `FREEZ` zone with population < 8 → build one detached `HOUSE` on the best of the 9 lots
  (`evalLot` scores +1 per adjacent road).
- Population ≥ 8 **and** local `populationDensityMap > 64` → convert to a block (`placeResidential`).
- Pollution > 128 blocks all growth outright.
- Empty zone + strong demand + `Random.getChance(3)` → **hospital** if `census.needHospital > 0`.
- Degrade path: block → smaller block → `FREEZ` + 8 houses → remove houses one by one.
- Zone population from tile: `(floor((tile - RZB)/9) % 4 + 1) * 8 + 16` → 24/32/40/48; `FREEZ`
  counts adjacent houses.

Commercial: 5 population levels, growth gated on `population <= landValue >> 5`.
Industrial: 4 population levels x 2 value levels; sets `ANIMBIT` on the smoke-stack sub-tile when
powered (`animated = [true,false,true,true,false,false,true,true]`).

### 5.3 Traffic (`traffic.js`)
- `findPerimeterRoad()` checks the 12 tiles ringing a 3x3 zone for a driveable tile.
- `tryDrive()` does a random walk of up to **30 steps**, backtracking via a stack, until
  `driveDone()` finds the destination zone type orthogonally adjacent.
- Success deposits +50 (capped 240) into `trafficDensityMap` at every second step of the path.
- Traffic ≥ 240 with 1-in-5 chance retargets the traffic helicopter to that spot.
- Return codes: `ROUTE_FOUND = 1`, `NO_ROUTE_FOUND = 0`, `NO_ROAD_FOUND = -1`.
- **[QUIRK]** `tryDrive` references an undefined `pos` (should be `drivePos`) at line 111 — routing
  is effectively broken and must be fixed in a port.

### 5.4 Power (`powerManager.js`)
- Coal plant supplies 700 units, nuclear 2000.
- `doPowerScan()` flood-fills from every plant through `CONDBIT` tiles, consuming 1 unit per tile;
  when consumption exceeds capacity it emits `NOT_ENOUGH_POWER` and aborts.
- `setTilePower()` per tile during the map scan sets/clears `POWERBIT`.
- Unpowered zone centres blink the `LIGHTNINGBOLT` tile every 500 ms (`animationManager.js:108-111`).
- **[QUIRK]** documented in-source: two adjacent power plants — the second is treated as a consumer.

### 5.5 Land value / pollution / crime (`blockMapUtils.js`)
- **Pollution per tile**: heavy traffic 75, light traffic 50, fire 90, radiation 255, industrial 50,
  coal plant 100, everything else 0. Summed per 2x2 block, clamped 255, then smoothed twice.
  The most polluted block is recorded as `map.pollutionMaxX/Y` — **monsters spawn/head there**.
- **Land value** for developed blocks: `(34 - cityCentreDistance/2) << 2` + `terrainDensity`
  − `pollution` − 20 if `crime > 190`, clamped 1..250.
- **Crime**: `128 - landValue + populationDensity` (capped 300) − `policeStationMap`, clamped 0..250.
- **Population density**: per-zone population x8 capped 254, smoothed three times, then doubled.
  The same pass recomputes the **city centre** as the centroid of all zone tiles and refills
  `cityCentreDistScoreMap`.
- **Fire/police cover**: three alternating smoothing passes over the raw deposit maps.
- Service deposits (`emergencyServices.js`): each station contributes `budget.fireEffect` /
  `policeEffect`, **halved if unpowered** and **halved again if not adjacent to a road**.

---

## 6. Economy (`budget.js`)

| Item | Value |
|---|---|
| Police station upkeep | 100 / station |
| Fire station upkeep | 100 / station |
| Road upkeep | 1 / tile |
| Rail upkeep | 2 / tile |
| Road-cost difficulty multiplier `RLevels` | `[0.7, 0.9, 1.2]` (easy/med/hard) |
| Tax-yield difficulty multiplier `FLevels` | `[1.4, 1.2, 0.8]` |
| Tax rate | 0–20 %, default 7 |
| `MAX_ROAD_EFFECT` | 32 |
| `MAX_POLICESTATION_EFFECT` / `MAX_FIRESTATION_EFFECT` | 1000 |

- Tax income (every 48 cityTime): `floor(floor(totalPop * landValueAverage / 120) * cityTax * FLevels[level])`.
- Spending priority when short of cash: **road → fire → police**.
- `*Effect` values scale linearly with the funded percentage and feed back into the sim:
  roads decay when `roadEffect < 15/16 * MAX` (`shouldDegradeRoad`), service coverage shrinks.
- `autoBudget` off (or insufficient funds) → `BUDGET_NEEDED` → the game force-opens the budget
  dialog and the sim stalls on `budget.awaitingValues`.
- **[QUIRK]** `evaluation.js` reads `budget.MAX_POLICE_STATION_EFFECT` / `MAX_FIRE_STATION_EFFECT`
  (with underscores) which do not exist → those score penalties silently evaluate against `undefined`.

---

## 7. Census, evaluation and progression ("story")

### 7.1 Census (`census.js`)
Per-cycle counters: `poweredZoneCount`, `unpoweredZoneCount`, `firePop`, `roadTotal`, `railTotal`,
`resPop`, `comPop`, `indPop`, `resZonePop`, `comZonePop`, `indZonePop`, `hospitalPop`, `churchPop`,
`policeStationPop`, `fireStationPop`, `stadiumPop`, `coalPowerPop`, `nuclearPowerPop`, `seaportPop`,
`airportPop`. Externally set: `landValueAverage`, `pollutionAverage`, `crimeAverage`, `totalPop`.

History arrays (120 entries each, short-term "10" and long-term "120"): `res`, `com`, `ind`, `crime`,
`money`, `pollution`. `crimeRamp`/`pollutionRamp` smooth toward the current averages by ¼ each step.
**No graph UI exists** (`simulation.js:180` "TODO Graphs") — an obvious modernization win.

### 7.2 Advisory messages (`simulation.js:411-535`)
Fired on `cityTime & 63`, one check per slot — this is the game's narrative drip-feed:

| Slot | Condition | Message |
|---|---|---|
| 1 | `resZonePop < totalZonePop/4` | more residential needed |
| 5 | `comZonePop < totalZonePop/8` | more commercial needed |
| 10 | `indZonePop < totalZonePop/8` | more industrial needed |
| 14 | `totalZonePop > 10 && totalZonePop*2 > roadTotal` | more roads |
| 18 | `totalZonePop > 50 && totalZonePop > railTotal` | more rail |
| 22 | `totalZonePop > 10 && no power plants` | build a power plant |
| 26 | `resPop > 500 && stadiumPop === 0` | need stadium → sets `resCap` |
| 28 | `indPop > 70 && seaportPop === 0` | need seaport → sets `indCap` |
| 30 | `comPop > 100 && airportPop === 0` | need airport → sets `comCap` |
| 32 | powered/total zones < 0.7 | blackouts reported (rate-limited to 1 per 2 min) |
| 35 | `pollutionAverage > 60` | high pollution (clickable, jumps to `pollutionMax`) |
| 42 | `crimeAverage > 100` | high crime |
| 45 | `totalPop > 60 && fireStationPop === 0` | need fire department |
| 48 | `totalPop > 60 && policeStationPop === 0` | need police department |
| 51 | `cityTax > 12` | tax too high |
| 54 | `roadEffect < 5/8 max && roadTotal > 30` | roads need funding |
| 57 | `fireEffect < 7/10 max && totalPop > 20` | fire needs funding |
| 60 | `policeEffect < 7/10 max && totalPop > 20` | police need funding |
| 63 | `trafficAverage > 60` | traffic jams |

### 7.3 City classification & milestones (`evaluation.js`, `game.js:539-621`)
`cityPop = (resPop + (comPop + indPop) * 8) * 20`

| Class | Threshold | Milestone message |
|---|---|---|
| `VILLAGE` | 0 | (silent) |
| `TOWN` | > 2 000 | "Population has reached 2,000" |
| `CITY` | > 10 000 | "…10,000" |
| `CAPITAL` | > 50 000 | "…50,000" |
| `METROPOLIS` | > 100 000 | "…100,000" |
| `MEGALOPOLIS` | > 500 000 | "…500,000" |

Each milestone fires **once** (tracked by `_reachedTown` … flags) and opens the **Congratulations**
modal with "`<CityName>` is now a town/city/capital/metropolis/megalopolis!". This plus the advisory
messages *is* the entire narrative layer — there are no scenarios (`disasterManager.js:39` and
`scenarioDisaster()` are TODO stubs; the original Micropolis scenarios are absent).

### 7.4 Score and public opinion (`evaluation.js`)
Recomputed annually (phase 9, every 48 cityTime).

Problem inputs (each 0–255-ish):

| Problem | Source |
|---|---|
| `CRIME` (0) | `census.crimeAverage` |
| `POLLUTION` (1) | `census.pollutionAverage` |
| `HOUSING` (2) | `landValueAverage * 0.7` |
| `TAXES` (3) | `cityTax * 10` |
| `TRAFFIC` (4) | traffic average over developed land x 2.4 |
| `UNEMPLOYMENT` (5) | `min(255, round((resPop/((com+ind)*8) - 1) * 255))` |
| `FIRE` (6) | `min(255, firePop * 5)` |

- **Voting**: up to 100 votes, each voter tolerates a random threshold 0–300; the 4 highest-voted
  problems become the "worst problems" list.
- **Score** (0–1000, starts 500): `((250 - min(sum/3, 250)) * 4)`, then multiplicatively penalised
  — ×0.85 per capped demand valve, ×0.85 per collapsed valve (< −1000), −`(MAX_ROAD_EFFECT - roadEffect)`,
  up to −10 % each for underfunded police and fire, scaled by population growth rate,
  −fireSeverity, −cityTax, ×(poweredZones/totalZones). Final value is the **average of the old and
  new score** (heavy smoothing).
- **Approval**: 100 voters each roll 0–999; `cityYes` = count where `cityScore > roll`.
- `cityAssessedValue = 1000 * (roads*5 + rail*10 + police*1000 + fire*1000 + hospital*400 +
  stadium*3000 + seaport*5000 + airport*10000 + coal*3000 + nuclear*6000)`.

---

## 8. Player tools (the "paint"/marking system)

`gameTools.js` builds 16 tools. `inputStatus.js` binds them to `.toolButton` elements, reading
`data-tool`, `data-size` (hover-outline size in tiles) and `data-colour` (outline colour).

| Tool | Cost | Footprint | Outline colour | Centre tile | Draggable | Notes |
|---|---|---|---|---|---|---|
| Residential | 100 | 3x3 | `lime` | `FREEZ` (244) | no | |
| Commercial | 100 | 3x3 | `blue` | `COMCLR` (427) | no | |
| Industrial | 100 | 3x3 | `yellow` | `INDCLR` (616) | no | |
| Police | 500 | 3x3 | `darkblue` | `POLICESTATION` (774) | no | |
| Fire | 500 | 3x3 | `red` | `FIRESTATION` (765) | no | |
| Coal power | 3000 | 4x4 | `gray` | `POWERPLANT` (750) | no | |
| Nuclear | 5000 | 4x4 | `mistyrose` | `NUCLEAR` (816) | no | `animated = true` |
| Seaport | 3000 | 4x4 | `dodgerblue` | `PORT` (698) | no | |
| Stadium | 5000 | 4x4 | `indigo` | `STADIUM` (784) | no | |
| Airport | 10000 | 6x6 | `violet` | `AIRPORT` (716) | no | |
| Road | 10 | 1x1 | `black` | — | **yes** | 50 over water (bridge) |
| Rail | 20 | 1x1 | `brown` | — | **yes** | 100 over water |
| Wire | 5 | 1x1 | `khaki` | — | **yes** | 25 over water |
| Park | 10 | 1x1 | `darkgreen` | `WOODS2`+rand, 1-in-5 `FOUNTAIN` | no | |
| Bulldozer | 1 (label) | 1x1 | `salmon` | — | **yes** | see below |
| Query | free | 1x1 | `cyan` | — | no | opens Query dialog |

Tool results (`baseTool.js`): `TOOLRESULT_OK` 0, `FAILED` 1, `NO_MONEY` 2, `NEEDS_BULLDOZE` 3.
Failures write `"Insufficient funds to build that"` / `"Area must be bulldozed first"` into
`#toolOutput` (`game.js:468-479`).

Mechanics worth preserving:
- **`WorldEffects` staging buffer** (`worldEffects.js`): a tool writes into a keyed scratch map, then
  `modifyIfEnoughFunding(budget)` either commits all writes and spends, or discards them. All-or-nothing
  placement — keep this transactional model.
- **Auto-bulldoze** (global toggle, default on): building over bulldozable rubble/small explosions
  costs 1 per tile and is folded into the same transaction.
- **Building placement** (`buildingTool.js`): click coordinate is the centre, corrected to top-left by
  −1/−1; all tiles get `BNCNBIT`, the (1,1) tile additionally gets `ZONEBIT`, and (1,2) gets `ANIMBIT`
  for animated buildings (nuclear). Then `checkBorder()` re-fixes surrounding road/rail/wire shapes.
- **Auto-connect** (`connector.js`): after any road/rail/wire edit, `fixSingle()` recomputes the tile
  shape for that tile and its 4 neighbours from a 16-entry lookup (`RoadTable`, `RailTable`,
  `WireTable`) keyed on the N/E/S/W adjacency bitmask. Roads over wires become `HROADPOWER`/
  `VROADPOWER`, roads over rail become `HRAILROAD`/`VRAILROAD`, etc.
- **Bulldozer** (`bulldozerTool.js`): on a zone, computes the zone size, emits
  `SOUND_EXPLOSIONHIGH`/`LOW` (3x3 → high, 4x4 → low, 6x6 → both) and fills the footprint with
  animated `TINYEXP` rubble. On plain tiles → `DIRT`; on bridges/power/rail over water → `RIVER`
  (+5 cost). Bridges and drawbridges revert to water.
- **Query** (`queryTool.js`) classifies the clicked tile and pushes the results into the Query dialog:
  density (`>>6 & 3` → Low/Medium/High/Very High), land value (thresholds 30/80/150 →
  Slum/Lower Class/Middle Class/High), crime (Safe/Light/Moderate/Dangerous), pollution
  (None/Moderate/Heavy/Very Heavy), growth (Declining/Stable/Slow Growth/Fast Growth), and a zone-type
  name from a 27-entry table (`text.js:26-31`).

---

## 9. Disasters and moving objects

### 9.1 Disaster manager (`disasterManager.js`)
Random disasters are **off by default**; when enabled, phase 15 rolls
`Random.getRandom(DisChance[level])` with `DisChance = [479, 239, 59]` (easy/med/hard) and then picks:
fire (2/9), flood (2/9), nothing (2/9), tornado (1/9), earthquake (**TODO, disabled**), monster
(2/9, only if `pollutionAverage > 60`).

| Disaster | Effect |
|---|---|
| Fire | up to 40 attempts to ignite a random burnable non-zone tile; fire spreads via `MiscTiles.fireFound` to the 4 neighbours, burns zones (`fireZone`), explodes industrial (> `IZB`), and is extinguished at a rate driven by `fireStationEffectMap` (>100 → rate 1, >20 → 2, >0 → 3, else 10) |
| Flood | seeds a `FLOOD` tile next to water, `_floodCount = 30`, spreads each scan; after the counter runs out flood tiles revert to `DIRT` |
| Meltdown | 4 corner explosions, whole 4x4 plant set on fire, **200 `RADTILE` tiles** scattered in a ±20 x ±15 box. Also rolls spontaneously every nuclear-plant scan: `1 / [30000, 20000, 10000][level]` |
| Plane crash | explodes the existing plane sprite, or spawns one and explodes it |
| Tornado / Monster | spawn the corresponding sprite (see below) |
| Earthquake | `makeEarthquake()` exists (strength 300–1000, scatters rubble and fire) but is **never reachable**; `gameCanvas.shoogle()` (screen shake) is an empty stub |

Radiation decays with `Random.getChance(4095)` per scan — essentially permanent.

### 9.2 Sprites (`spriteManager.js`, `*Sprite.js`, `spriteConstants.ts`)
Sprite sheet `images/sprites.png` is a grid of 48x48 cells: `sx = (frame-1)*48`, `sy = (type-1)*48`.
Individual frames are also present as `sprites/obj<type>-<frame-1>.png`.

| # | Type | Draw size | Offset | Spawn | Behaviour |
|---|---|---|---|---|---|
| 1 | Train | 32 | −16,−16 | from rail tiles, if `totalPop > 10`, 1-in-25 | follows rail, 4 directions + underwater frame |
| 2 | Helicopter | 32 | −16,−16 | from a powered airport, 1-in-12 | 8 directions, `count = 1500` lifetime, retargets to heavy traffic, emits `HEAVY_TRAFFIC` |
| 3 | Airplane | 48 | −24,−24 | from a powered airport, 1-in-5 | 8 directions + 3 take-off frames, random destinations, collides with the copter |
| 4 | Ship | 48 | −24,−24 | from a powered seaport, on a `CHANNEL` tile at a map edge | 8 directions, opens drawbridges within 300 px, honks |
| 5 | Monster | 48 | −24,−24 | disaster; heads for `pollutionMax` | 4 directions x 3 frames, destroys tiles, `count = 1000`, dies in water when `count < 500` |
| 6 | Tornado | 48 | −24,−40 | disaster | `count = 200`, destroys tiles under it, 1-in-500 chance to vanish |
| 7 | Explosion | 48 | −24,−24 | any destruction | 6 frames then dies, starts fires around itself |

Sprite state (`baseSprite.js`): `x`/`y` in pixels with `worldX`/`worldY` accessors that shift by 4
(16 px tiles), plus `origX/origY`, `destX/destY`, `count`, `soundCount`, `dir`, `newDir`, `step`,
`flag`, `turn`, `accel`, `speed`. `frame === 0` means dead; `pruneDeadSprites()` sweeps them.
`SpriteUtils.destroyMapTile()` is the shared "monster/tornado/crash flattens a tile" routine.

Sprites emit `SPRITE_MOVED` / `SPRITE_DYING`, which the MonsterTV picture-in-picture window uses to
follow a disaster.

### 9.3 Tile animation (`animationManager.js`)
- Animation step every **50 ms**, power blink every **500 ms**.
- A 1024-entry successor table maps each animated tile value to the next frame; 53 sequences are
  registered (fire, 32 traffic sequences, industrial smoke, coal chimneys, nuclear swirl, radar,
  fountain, tiny explosions, football game).
- Frame continuity across scrolling is tracked in a `TileHistory` keyed by screen position.
- Special case: when a `TINYEXP` sequence hits `LASTTINYEXP`, the map tile is immediately replaced
  with random rubble so the explosion ends cleanly.

---

## 10. UI inventory

### 10.1 Persistent HUD (all `.initialHidden` until the game starts)

| Element | ID | Content |
|---|---|---|
| Info bar | `#infobar` | city name, `Mon YYYY` date, `Funds $n`, `Score: n`, city class, `Population: n` — updated by `infoBar.js` from `CLASSIFICATION_UPDATED`, `POPULATION_UPDATED`, `SCORE_UPDATED`, `FUNDS_CHANGED`, `DATE_UPDATED` |
| Misc buttons | `#miscButtons` | Budget, Evaluation, Disasters, Save, Settings, Take Picture, Pause/Play toggle |
| RCI indicator | `#RCIContainer` | canvas bar chart, 3 bars (R green, C dark blue, I yellow), 10 buckets each way, scaled from ±2000 (com/ind rescaled by 2000/1500); `rci.js` |
| Tool palette | `#controls` / `#buttons` | 16 `.toolButton`s with a `#toolOutput` status line above |
| Notification ticker | `#notifications` | `notification.js`; classes `good` / `bad` / `neutral`, 30 s auto-hide, **clickable when the message carries x/y** (centres the map on the event) |
| MonsterTV | `#monstertv` | second `GameCanvas` in `#tvContainer` following a disaster sprite; 10 s auto-close after the sprite dies |
| Debug panel | `#debug` | FPS counter + Debug button; only shown with `?debug=1` |
| Too-small guard | `#tooSmall` | blocks play on small viewports |
| Header / footer | `#header`, `#footer` | title, About/GitHub links, donation link, build hash, **Micropolis name-license attribution** |

### 10.2 Modal dialogs (`modalWindow.js` + `#opaque` scrim)

| Dialog | ID | Fields / actions |
|---|---|---|
| Budget | `#budget` | Tax collected, Cashflow, Previous funds, Current funds; range sliders **Roads / Fire / Police 0–100 %** and **Tax 0–20 %** with live "`n`% of $`x` = $`y`" labels; Reset / Cancel / OK. Opened automatically when `BUDGET_NEEDED` fires |
| Evaluation | `#evalWindow` | Public opinion (Yes/No %), 4 "worst problems"; statistics: Population, Net Migration, Assessed Value, Category, Game Level, Score, Annual change |
| Disasters | `#disasterWindow` | select: None / Monster / Fire / Flood / Crash / Meltdown / Tornado |
| Query | `#queryWindow` | Zone, Density, Value, Crime, Pollution, Growth; plus a debug section (raw block-map values and a Burn/Bull/Cond/Anim/Pow/Zone flag table) |
| Settings | `#settingsWindow` | Autobudget yes/no, Autobulldoze yes/no, Speed slow/med/fast, Disasters yes/no |
| Take Picture | `#screenshotWindow` → `#screenshotLinkWindow` | Visible map / Full map → produces a `toDataURL()` link |
| Congratulations | `#congratsWindow` | milestone message |
| Save | `#saveWindow` | "Game Saved!" |
| Nag | `#nagWindow` | charity solicitation after 30 min |
| Touch warning | `#touchWarnWindow` | shown on the first `touchstart` |
| Debug | `#debugWindow` | "Add funds" (+$20000) |

Only one dialog may be open at a time (`game.js:415-434`); `Escape` closes it, or clears the current
tool when nothing is open.

### 10.3 Input (`inputStatus.js`)
- Movement: arrows or **WASD** scroll the map one tile per `tick`; `Escape` closes/clears.
- Mouse: `mouseenter` installs `mousemove` plus either `mousedown`/`mouseup` (draggable tools:
  road, rail, wire, bulldozer) or `click` (everything else). Dragging fires `TOOL_CLICKED` once per
  new tile crossed. Modified clicks (shift/alt/ctrl/meta, non-left) are ignored.
- Cursor class: `pointer` for build tools, `helpPointer` for Query.
- **No zoom, no rotation, no touch support, no minimap during play.**

### 10.4 Text catalogue (`text.js`)
- `densityStrings`, `landValueStrings`, `crimeStrings`, `pollutionStrings`, `rateStrings` — 4 entries each.
- `zoneTypes` — 27 names used by the Query dialog.
- `months` — 12 abbreviations.
- `toolMessages` — 2 strings.
- `messageText` — ~40 news strings, partitioned into `goodMessages`, `badMessages`, `neutralMessages`
  (these drive the ticker's colour). Good/neutral news is suppressed for 20 s after a disaster
  (`disasterTimeout`, `game.js:43`).

### 10.5 Save/load (`storage.js`)
Single `localStorage` slot, key `micropolisJSGame`, `CURRENT_VERSION = 3`, with a migration path from
versions 1 and 2. Saved: city name, `everClicked`, `autoBulldoze`, `_cityTime`, `_speed`,
`_gameLevel`, the full tile array (raw 16-bit values), evaluation (`cityClass`, `cityScore`), valve
values, budget fields and the census/history arrays. **Sprites and block maps are not saved** — they
are rebuilt from the map on load.

---

## 11. Complete event/message list (`messages.ts`)

Front-end requests: `BUDGET_REQUESTED`, `EVAL_REQUESTED`, `DISASTER_REQUESTED`,
`SETTINGS_WINDOW_REQUESTED`, `SCREENSHOT_WINDOW_REQUESTED`, `DEBUG_WINDOW_REQUESTED`,
`SAVE_REQUESTED`, `QUERY_WINDOW_NEEDED`, `TOOL_CLICKED`, `SPEED_CHANGE`.

Window closures: `*_WINDOW_CLOSED` for each dialog.

Simulation → UI: `FRONT_END_MESSAGE` (wraps everything below), `FUNDS_CHANGED`, `BUDGET_NEEDED`,
`AUTOBUDGET_CHANGED`, `NO_MONEY`, `DATE_UPDATED`, `VALVES_UPDATED`, `CLASSIFICATION_UPDATED`,
`POPULATION_UPDATED`, `SCORE_UPDATED`, `EVAL_UPDATED`.

Advisories: `NEED_MORE_RESIDENTIAL/COMMERCIAL/INDUSTRIAL/ROADS/RAILS`, `NEED_ELECTRICITY`,
`NEED_STADIUM`, `NEED_SEAPORT`, `NEED_AIRPORT`, `NEED_FIRE_STATION`, `NEED_POLICE_STATION`,
`ROAD_NEEDS_FUNDING`, `FIRE_STATION_NEEDS_FUNDING`, `POLICE_NEEDS_FUNDING`, `TAX_TOO_HIGH`,
`BLACKOUTS_REPORTED`, `NOT_ENOUGH_POWER`, `HIGH_CRIME`, `HIGH_POLLUTION`, `TRAFFIC_JAMS`,
`HEAVY_TRAFFIC`.

`DISASTER_MESSAGES`: `EARTHQUAKE`, `EXPLOSION_REPORTED`, `FIRE_REPORTED`, `FLOODING_REPORTED`,
`MONSTER_SIGHTED`, `NUCLEAR_MELTDOWN`, `TORNADO_SIGHTED`.
`CRASHES`: `HELICOPTER_CRASHED`, `PLANE_CRASHED`, `SHIP_CRASHED`, `TRAIN_CRASHED`.

Milestones: `REACHED_VILLAGE/TOWN/CITY/CAPITAL/METROPOLIS/MEGALOPOLIS`, `WELCOME`.

Sprites: `SPRITE_MOVED`, `SPRITE_DYING`.

Sound hooks (**declared but never played — there is no audio in this build**):
`SOUND_EXPLOSIONHIGH`, `SOUND_EXPLOSIONLOW`, `SOUND_HEAVY_TRAFFIC`, `SOUND_HONKHONK`,
`SOUND_MONSTER`.

Message payloads carry `{showable: true, x, y}` (jump the camera there) or
`{trackable: true, x, y, sprite}` (follow the sprite in MonsterTV) — keep this contract, it is what
drives the cinematic camera.

---

## 12. Porting notes for a three.js version

### 12.1 What to keep unchanged
`gameMap.js`, `tile.ts`, `tileValues.ts`, `tileFlags.ts`, `blockMap.ts`, `blockMapUtils.js`,
`simulation.js`, `census.js`, `valves.js`, `budget.js`, `evaluation.js`, `residential/commercial/
industrial.js`, `road.js`, `traffic.js`, `powerManager.js`, `mapScanner.js`, `repairManager.js`,
`zoneUtils.js`, `disasterManager.js`, `mapGenerator.js`, `connector.js`, all `*Tool.js`,
`worldEffects.js`, `storage.js`, `messages.ts`, `random.ts`, `position.ts`, `direction.ts`,
`bounds.ts`, `eventEmitter.js`.

Practical first step: strip jQuery out of `inputStatus.js`, `queryTool.js` and `game.js`, and make
the simulation emit events instead of writing DOM text. After that the sim is a pure headless module.

### 12.2 What to replace
| Old | Replacement |
|---|---|
| `gameCanvas.js` (dirty-rect 2D blitter, `_lastPaintedTiles` diffing) | scene graph + instanced meshes; keep the "damage" concept only as a dirty-chunk invalidation for geometry rebuilds |
| `tileSet.js`, `tileSetURI.ts`, `tileSetSnowURI.ts` (~190 KB of base64) | delete; replace with a glTF asset library keyed by tile ID / building type |
| `animationManager.js` successor table | per-mesh animation clips / shader time; keep the table only for the traffic-density → road material mapping |
| `splashCanvas.js`, screenshot code | orthographic top-down render target |
| `rci.js`, `infoBar.js`, `*Window.js`, `index.html` markup | modern UI layer (React/Svelte/lit), driven by the same event names |
| `mouseBox.js` (2D outline) | a ghost/preview mesh with a valid/invalid material, sized from the tool footprint |

### 12.3 Modelling advice specific to this codebase
1. **Tile ID → mesh is many-to-one.** The 1024 values encode *variant* (16 road shapes, 4 rubble,
   16 shore) and *state* (traffic level, population level, land-value level) in the ID itself. For
   polygons, decompose each tile value into `(category, shapeIndex, populationLevel, valueLevel,
   trafficLevel)` once, and pick the mesh from that tuple rather than from the raw number. The
   arithmetic is already in the source: residential `((lp*4)+pop)*9 + RZB`, commercial
   `((lp*5)+pop)*9 + CZB`, industrial `((val*4)+pop)*9 + IZB`, roads `(tile - ROADBASE) & 15` plus
   `densityTable[0|1|2]`.
2. **Buildings are 3x3 / 4x4 / 6x6 blocks of tiles with a `ZONEBIT` centre.** Render one mesh per
   building anchored at the centre; do not render the 8 satellite tiles. Maintain a
   `Map<centreIndex, BuildingInstance>` and drive it from `putZone` / `checkBigZone` / `fireZone`.
3. **Instancing groups**: (a) ground plane with a splat/index texture for dirt/water/woods,
   (b) `InstancedMesh` per road/rail/wire shape (16 each), (c) `InstancedMesh` per building variant,
   (d) 7 sprite types as billboards or low-poly models, (e) particle systems for fire, smoke,
   explosions, flood.
4. **Vertical dimension**: the source has none. Natural mappings — building height from
   `populationLevel`, roof/material quality from `valueLevel`, terrain height from `terrainDensityMap`,
   with water at a fixed lower plane and `REDGE` as the bevel ring.
5. **Overlays**: the block maps are ready-made data textures. Expose land value, crime, pollution,
   population density, traffic, police cover, fire cover and power grid as toggleable shader overlays;
   this replaces the Query dialog's text classification with something readable at a glance.
6. **Camera**: `centreOn(x, y)` is called by the notification ticker and MonsterTV. Keep the same API
   and add smooth interpolation; the "showable/trackable" message payloads give you a free
   cinematic-camera system for disasters.
7. **Frame budget**: the current design runs the sim on `setTimeout(0)` and rendering on rAF, with the
   sim self-limiting by wall clock. Preserve that split — a fixed-step sim tick decoupled from render
   — but move the sim into a Web Worker, since `mapScan` touches 12 000 tiles per phase and
   `populationDensityScan` walks the whole map.

### 12.4 Known bugs to fix while porting
- `traffic.js:111` — undefined `pos` (should be `drivePos`); route-finding is broken.
- `simulation.js:343,346` — `budget` should be `this.budget` in the census calls.
- `evaluation.js:264-268` — `MAX_POLICE_STATION_EFFECT` / `MAX_FIRE_STATION_EFFECT` don't exist
  (`budget.js` defines `MAX_POLICESTATION_EFFECT` / `MAX_FIRESTATION_EFFECT`).
- `miscTiles.js` — `tileUtils.randomFire()` (lowercase) and `map.setTo(tile)` with a missing x/y.
- `zoneUtils.js:169` — `map.getTileValue(xTem, yTem >= TileValues.ROADBASE)` — misplaced parenthesis.
- `residential.js:49` — `tile.getValue()` where the variable is `tileValue`.
- `residential.js:169` — degrade loop writes to `(x, y)` instead of `(xx, yy)`.
- `census.js:124-128` — compares `this.hospitalPop` against `this.resPopScaled` (undefined) instead
  of the local `resPopScaled`, so `needHospital` is always 0 → **hospitals never get built**.
- `gameCanvas.js:352` — `throw e` with `e` undefined.
- `simulation.js:624` — `this.setYear(startingYear)` (both undefined).
- `inputStatus.js:27` — uses `canvasID` before its declaration (works only via hoisting of the
  `var` at line 78, so it is `undefined` at construction time).
- `mapGenerator.js:498` — `TILE_INVALID` is not imported; `smoothWater()` is dead code anyway.
- `game.js:220` — typo `_reacedMegalopolis`, so the megalopolis congratulation uses an undefined flag.
- `disasterManager.js:201` — `tile === TileValues.DIRT` compares a `Tile` object to a number, and
  `tile.isCombustible` is not called.
- Earthquakes and scenarios are unimplemented; `gameCanvas.shoogle()` is an empty stub.

---

## 13. Quick constant reference

```
Map                120 x 100 tiles, 16 px/tile, 1024 tile values
Start              $20000, Jan 1900, tax 7%, speed MED, autobudget on, autobulldoze on, disasters off
Clock              48 cityTime = 1 year; month = (cityTime % 48) >> 2
Sim                16 phases; mapScan split into 8 slices of 15 columns
Census             10-history every 4 cityTime, 120-history every 40, tax + evaluation every 48
Difficulty         0 easy / 1 medium / 2 hard
Disaster odds      1 / [479, 239, 59]      Meltdown odds  1 / [30000, 20000, 10000]
Valves             res ±2000, com ±1500, ind ±1500
Power              coal 700, nuclear 2000 units
Score              0..1000 (starts 500), averaged with the previous score each year
Classes            2k town, 10k city, 50k capital, 100k metropolis, 500k megalopolis
Animation          tile frames 50 ms, unpowered-zone blink 500 ms
Notification       30 s visible; good/neutral news muted 20 s after a disaster
Nag                30 minutes
```
