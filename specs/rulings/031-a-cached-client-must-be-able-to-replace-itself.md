# Ruling 031 — A cached client must be able to replace itself

- **Date:** 2026-09-04
- **Source:** P33 — two of three playtest reports were about a build that had already shipped
- **Status:** ruled

## Question

The app is precached by a service worker and served cache-first. What makes a
new build reach a player who already has the old one?

## Ruling

**The version is in the registered worker's URL.** `client/main.js` reads
`client/precache.json`, then registers `./sw.js?v=<version>`. A new build is a
new script URL, which is a new worker: it installs, precaches, `skipWaiting`s,
claims, and deletes every cache that is not its own. The page reloads itself
once on `controllerchange`, guarded on there having been a controller already.

**A worker gate proves the update path, not only the offline path.** Installing
and serving with the network off is half the contract. The other half is that
the thing being served can ever change.

## Why

sw.js carried a careful comment about a "version handshake": the cache name is
the version from the manifest, and `activate` deletes every cache that is not
the current one. Every word of it was true and none of it ever ran. A browser
re-installs a service worker when **the worker's own bytes change**, and sw.js
is static by design — the version it keys on lives in a file it fetches. So
`install` ran once, in the player's first session, and the cache-first fetch
handler served that build for ever.

Reproduced before it was fixed: change a file, change the manifest version,
reload twice — the old bytes, and the old cache still the only cache.

The cost was not theoretical. Two of the three items in the P33 playtest —
"right mouse button did nothing", "water and power lines still do not connect" —
were reports about code that had shipped three days earlier and could not
arrive. A day of the playtest's time, and very nearly a day spent debugging
working code.

## Consequences

- Any deploy is `node tools/make_precache.mjs` and nothing else. The version is
  a hash of the cached files' bytes, so the registration URL follows it.
- A capability that is only ever exercised on a clean profile is not tested. The
  gate opens the app twice, with a deploy in between.
- The reload is guarded on `navigator.serviceWorker.controller` having been
  non-null at registration: a first visit claims too, and an unguarded reload
  there is a loop.
- `offline_smoke` and `update_smoke` are two halves of one contract and are both
  required; a worker that never updates passes the first one perfectly.

## Enforced by

- `tools/update_smoke.mjs` — the gate: first load, a deploy, a reload, and the
  new bytes
- `test/pwa.test.js` — "a new build reaches a player who already has the app",
  "a worker that takes over reloads the page exactly once"
