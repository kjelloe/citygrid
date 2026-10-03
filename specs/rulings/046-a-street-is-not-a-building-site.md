# Ruling 046 — A street is not a building site, in either direction

- **Date:** 2026-10-03
- **Source:** G1 — a network refuses a building. A85 (Q116) asked for one rule across four
  networks: `placeNetwork` refuses a tile carrying a `buildingId`, which rail has done since A66
  and road, wire and pipe never have.
- **Status:** ruled

*Specified by `specs/gamedesign.md` §8.2 — a zone tile develops when it has road access and "no
blocking structure" — and §6.3, which chooses a footprint from contiguous zone tiles. §8.2 now says
in as many words that access is beside and never on.*

## Question

A tile can carry a road and a building at once. Three ways in:

- a road, wire or pipe laid across an existing building (refused only on the rail layer);
- a building placed on a road (refused by `placeBuilding` since slice 1.3);
- a **grown lot** on a zoned tile that carries a road — `lotFree`, which is `placeBuilding`'s
  counterpart for a lot nobody placed, never read the road layer.

A85 answers the first. Does the third follow, or is it a separate question?

## Ruling

**It follows, and both halves ship together.** A tile carrying a building takes no network of any
kind, and a tile carrying a road grows no lot. The check sits in `placeNetwork` before the
ownership check, so burying your own park under your own road is answered with
`RESULT.NEEDS_BULLDOZE` — what to do about it — rather than with a permission code.

Zoning over a road stays legal. Zoning is intent, the rule reads it, and a block painted across a
street simply leaves the street undeveloped.

## Why

The two halves cannot be separated, and the measurement is what says so. The network refusal
**alone** gives the deputy 169.9 refusals a city on an eight-seed mean and **not one avenue**,
because the avenue is an upgrade of the busiest street and that street had houses standing on it.
Both halves together: no refusals, ten avenue tiles, and no lot on a street anywhere.

The scale of what was wrong is the other half of the argument: **90.9 of 295 buildings a city**
stood on the carriageway, for the life of the project, in every sweep number this repo has ever
published. Nothing could see it — the lot had road access by definition, the tile hashed fine, the
suite was green, and the renderer drew a house and a road ribbon on one tile without complaint.

It is expensive, and that is the correct direction: a third of every city was built on ground that
was never a building site. Era 15's sweep is the price.

## Consequences

- A balance era of its own (15), because it changes what the deputy's cities ARE: 295 buildings a
  city to 238 and population 2,269 to 1,758 on the eight-seed mean, before the 200-game sweep.
- The `founding` fixture's wire and pipe ran straight through its coal plant, which is now refused.
  The fixture's commands were rerouted to run **beside** the plant — the route a player must now
  take — and joined at one tile so the carriers stay one network; re-pinned with that reason.
- `NETWORKS` carries no `clearOfBuildings` flag any more: the rule is the same for every kind, so
  it belongs in the loop rather than in the table.
- The deputy does not zone its own streets — `zoneBlock` skips a tile carrying a road — but it does
  lay LATER streets across its own zoned land, deliberately: B9 measured that refusing to cross a
  zoned strip halves the sweep's population, because crossing one is how blocks join. Two in five
  zoned tiles carry a road (**639 of 1,646 a city**), and since this ruling those tiles can never
  develop. Before it, they grew houses in the carriageway. **Q131** asks whether the deputy should
  dezone what it paves.
- Unchanged: a level crossing. A road and a rail line on one tile is the one legitimate sharing
  (A66), and a carrier may still share a road tile.

## The picture

`reports/smoke-G1-on-the-street.png` is the defect: two houses standing in the carriageway, with the
road running under them, in a city built by command on era 14. `smoke-G1-off-the-street.png` is the
same camera on the same seed in era 15. `tools/street_proof.mjs` makes the pair against a worktree
of any earlier commit.

## Enforced by

- `test/build.test.js` — a road, a wire, a pipe and a rail line over a park are each refused and
  change nothing (asserted against the whole state hash, not the tile); a run that crosses one
  building is refused whole; and the refusal is `needsBulldoze` even for the building's own owner
- `test/development.test.js` — a zoned tile that carries a road grows no lot, and its neighbours
  still do
- `test/rail.test.js` — rail's own refusal, unchanged, and the level crossing it must keep
- `test/fixture.test.js` — the `founding` fixture is a city that develops, which is what its
  `expect` block is for: the first reroute split the grid in two and the fixture went to population
  0, and the guard caught it rather than a hash
