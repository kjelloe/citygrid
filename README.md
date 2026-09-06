# City Grid

A city-building simulation for browsers and phones. Play alone, fully offline, or join a
persistent shared region with up to sixteen people where nobody can destroy anyone else's work.

Original game. Not affiliated with any existing city-building franchise; all names, art, audio,
buildings, characters and interface are original, and no third-party code is used.

## Status

**Pre-implementation.** The design, architecture and execution plan are settled; Wave 0 has not
started. See `plan-v1.md` for what happens first.

## The documents, and which one is authoritative

| File | Authoritative for | Read it when |
|---|---|---|
| `specs/gamedesign.md` | **What the game is** — mechanics, systems, modes, UI, multiplayer rules | Deciding what something should do |
| `specs/plan.md` | **How it is built** — architecture, determinism, rendering, networking, budgets | Deciding how to build it |
| `plan-v1.md` | **Execution** — waves, slices, dependencies, definitions of done, release gates | Deciding what to do next |
| `specs/rulings/` | **Decisions**, one per file, with their reasoning and where they are enforced | Wondering why something is the way it is |
| `dev-prompts.md` | **Product decisions verbatim** from the user, numbered `P1…` | Tracing a requirement to its source |
| `dev-questions.md` | **Questions asked and still open** — open ones in the bottom section | Wondering what is undecided |
| `dev-log.md` | **What actually happened**, slice by slice, including dead ends | Wondering why an approach was abandoned |
| `specs/referencedata.md` | A behavioural analysis of a classic open-source city simulator, used as a **specification to compare against** — never as source | Reasoning about a mechanic's shape |
| `specs/art-direction.md` | Visual language | Making anything visual |
| `workitems-mainline.md`, `workitems-measurement.md`, `workitems-film.md`, `workitems-worker.md` | **The lanes after cityviewer**, in that order: the merge and the gates, real-device numbers and the reference compare, the photo mode and the film, the simulation in a worker | Picking up work once cityviewer's last item is done |
| `workitems-cityviewer.md` | **The cityviewer hand-off** — one implementable work item per slice, with tests, gate and review checks | Picking up the next renderer slice |
| `specs/engine/` | **cityviewer** — the renderer rebuilt to match `../fable51-worlds/`: model, ground, kit, style, camera, life, QA, roadmap | Touching anything under `client/render/` or `client/world/` |

## Shape in one paragraph

A pure deterministic reducer — `apply(state, command) → state`, integer state, seeded PRNG living
inside the state, no I/O and no clocks — with thin adapters around it: a no-build browser client
rendering with three.js, a Web Worker that owns the state in singleplayer, and a Node `ws` server
that owns it in multiplayer. Multiplayer is command relay with hash verification, not state
streaming: every client runs the same simulation and the wire carries only accepted commands, so
server cost is flat in player count. One state-hash function is simultaneously the save checksum,
the desync detector, the replay verifier and the multiplayer acceptance gate.

## Running it

```sh
./test.sh          # the suite, run twice — a slice is not done until it is green both times
```

```sh
node tools/serve.mjs        # then open the printed URL — boots straight into a playable city
```

Build a road, zone beside it, place a power plant and a pump, and watch it grow.
One finger paints when a tool is selected and pans when none is; two fingers are
always the camera. Tap with no tool to inspect a tile.

**Gates** (each drives the real page, not a mock):

```sh
node tools/client_smoke.mjs    # the renderer, all three styles
node tools/play_smoke.mjs      # input, on a mouse viewport and a phone one
node tools/ui_smoke.mjs        # every button hit-tested, every overlay rendered
node tools/save_smoke.mjs      # a city survives a closed tab, hash for hash
node tools/mvp_acceptance.mjs  # all thirteen §24 criteria, desktop and phone
node tools/play_shot.mjs       # screenshots of the real page
node tools/a11y_smoke.mjs      # keyboard, contrast, reduced motion, the overlays at night
node tools/lobby_smoke.mjs     # the start screen, and three cities in one page
node tools/serve_smoke.mjs     # the REAL server, so a CSP that blocks the importmap goes red
node tools/offline_smoke.mjs   # the game runs with the network off
node tools/update_smoke.mjs    # a new build actually reaches a returning player
```

**The renderer's own gates** (cityviewer). The first is the one every number in
`dev-log.md` comes from:

```sh
node tools/budget_gate.mjs     # 3 tiers x 2 projections x 4 spans, plus street chunks,
                               # cars, night and the painted finish
node tools/walkthrough.mjs     # the walker walks every corridor and into every building
node tools/passability.mjs     # a clear lane wide enough for a walker, everywhere
node tools/lanes_dump.mjs      # link, node and signal counts for the saturated fixture
node tools/style-sheet.mjs     # the three styles from one city — STREET=x,y for eye height
node tools/screenshot.mjs      # one shot; ?style= ?time= ?street= ?streets= ?frames=
```

**Soaks** (slow, and the only honest way to talk about balance):

```sh
node tools/disaster_soak.mjs 200 25   # every disaster fires, no unrepairable cities
node tools/traffic_gate.mjs 200 25    # routing fits the month tick; congestion tracks density
node tools/sim_sweep.mjs 200 25       # 200 games x 4 configs -> reports/balance-eraN.md
```

## Working rules

`CLAUDE.md`. They are short, and they are not suggestions — most of them exist because the
reference projects in `../Fireline` and `../Retrogradegames` paid for them.

## Licence

MIT (to be added with the first code).
