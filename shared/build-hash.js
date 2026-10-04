// What build this is, for the handshake (X0; plan.md §3.9).
//
// A PWA caches its own client, so a stale client meeting an updated server is
// not an edge case — it is the DEFAULT after every deploy, and a mismatched
// reducer desyncs silently. The join handshake refuses instead, which it can
// only do if both sides can say which rules they are running.
//
// The hash covers `engine/`, `shared/` and `data/` — the rules and the wire —
// and nothing else: a changed stylesheet is a new cache version and the same
// game, a changed balance file is a different game. `tools/make_precache.mjs`
// computes it into `client/precache.json` beside the version, so there is still
// no build step; the client reads that file at boot and the server reads it at
// startup, and both hand it in here.
//
// It is a module-level value with a setter for the same reason `engine/rules.js`
// is: this module may not do I/O. The default is `"dev"`, and `compatible()`
// lets a dev build talk to anything, because a developer's client and server are
// rebuilt at different moments and blocking that would be theatre.

let hash = "dev";

export function buildHash() {
  return hash;
}

/** Called once at boot by whoever read `client/precache.json`. */
export function setBuildHash(next) {
  hash = typeof next === "string" && next.length > 0 ? next : "dev";
  return hash;
}
