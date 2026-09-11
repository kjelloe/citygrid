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
| `specs/transport-and-landmarks.md`, `workitems-transport.md` | **The transport design study and its lane** (2026-09-11) — rail and a station to off-map, harbour, ferry and port, the airport, and other builders' buildings judged against this game's systems; the six questions it asked are answered (A65–A70) | Before building any transport link or landmark building |
| `workitems-mainline.md`, `workitems-measurement.md`, `workitems-film.md`, `workitems-worker.md`; then `workitems-navigation.md`, `workitems-world.md`, `workitems-behaviour.md` (P59, 2026-09-10: the camera on screen and on both mouse buttons, the world made detailed, the simulation made visible) | **The lanes after cityviewer**, in that order: the merge and the gates, real-device numbers and the reference compare, the photo mode and the film, the simulation in a worker | Picking up work once cityviewer's last item is done |
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

**Gates.** One runner, three sets, and a time budget each — a gate that grows past its share is
a finding rather than a fact of life. Every gate that exists is in a set, and `test/gates.test.js`
fails if one is not.

```sh
node tools/gates.mjs quick    # the ten browser smokes and the §24 acceptance script
node tools/gates.mjs render   # walkthrough, passability, lanes_dump, budget_gate — after a renderer slice
node tools/gates.mjs sim      # the soaks: disaster_soak, traffic_gate, sim_sweep
node tools/gates.mjs all      # everything
node tools/gates.mjs --list   # every gate, which sets run it, and what it checks
```

Each gate's wall time is printed and written to `reports/gates-<date>.json`, along with any
headless browser a gate left behind. Every browser gate drives `index.html` by real pointer
events, never a mock.

What the individual gates are, if you want one on its own:

```sh
node tools/client_smoke.mjs    # the renderer, all three styles
node tools/play_smoke.mjs      # input, on a mouse viewport and a phone one
node tools/ui_smoke.mjs        # every button hit-tested, every overlay rendered
node tools/save_smoke.mjs      # a city survives a closed tab, hash for hash
node tools/mvp_acceptance.mjs  # all thirteen §24 criteria, desktop and phone
node tools/a11y_smoke.mjs      # keyboard, contrast, reduced motion, the overlays at night
node tools/lobby_smoke.mjs     # the start screen, and three cities in one page
node tools/serve_smoke.mjs     # the REAL server, so a CSP that blocks the importmap goes red
node tools/reach_smoke.mjs     # every control clickable, nothing invisible eating the map
node tools/offline_smoke.mjs   # the game runs with the network off
node tools/update_smoke.mjs    # a new build actually reaches a returning player
node tools/budget_gate.mjs     # 3 tiers x 2 projections x 4 spans, and every row a slice added
node tools/walkthrough.mjs     # the walker walks every corridor, and the steepest street
node tools/passability.mjs     # a clear lane wide enough for a walker, everywhere
node tools/lanes_dump.mjs      # the lane graph: counts, height error, traffic step and flow
#   ...all three take <size> <terrain>, e.g. `node tools/walkthrough.mjs 128 hilly` (D6)
```

Pictures, which are not gates and are run by hand:

```sh
node tools/play_shot.mjs       # screenshots of the real page
node tools/style-sheet.mjs     # the three styles from one city — STREET=x,y for eye height
node tools/screenshot.mjs      # one shot; ?style= ?time= ?street= ?streets= ?frames= ?traffic=
```

**Measurements**, which are not gates either — they produce a number for a person to read:

```sh
node tools/perf_card.mjs       # the frame sweep -> reports/perf/swiftshader.json (70 s)
node tools/perf_card.mjs --map big     # ...on 256x256, or `--map steep` for 128 hilly
node tools/perf_report.mjs     # every card in reports/perf/*.json -> reports/perf/README.md
node tools/compare_sheet.mjs   # City Grid beside the references -> reports/compare-transport-worlds.png
node tools/i18n_review.mjs     # every string, its slice and its Norwegian -> reports/i18n-review.md
```

`?perf=1` on the real page runs the same sweep on the device you are holding and ends with a
**Copy** button. Nothing is sent anywhere — the numbers leave the device only if you paste them.
Paste the card into `reports/perf/<device>.json` and `perf_report.mjs` picks it up.

Frame times from `perf_card.mjs` are SwiftShader and mean nothing about a phone; the triangles,
draw calls and the LOD ladder's decisions are true everywhere. **This is not a formality** — the
first card from real hardware found that the frame-time governor had been giving up its entire
quality ladder on any machine locked to its refresh rate, silently, since V2.

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
