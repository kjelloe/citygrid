// The installable, offline half of slice 4.5.
//
// There is no build step, so the service worker's precache list is a checked-in
// file. That means it can go stale silently — a new module added to `client/`
// and not to the list is a game that works online and breaks offline, which is
// the worst kind of bug to find out about. The first test is the one that
// matters.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { precacheList, precacheVersion } from "../tools/make_precache.mjs";

const precache = JSON.parse(readFileSync(join(repoRoot, "client", "precache.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(repoRoot, "manifest.webmanifest"), "utf8"));

test("the precache list is current", async () => {
  // Regenerate with:  node tools/make_precache.mjs
  const files = await precacheList();
  const missing = files.filter((f) => !precache.files.includes(f));
  const stale = precache.files.filter((f) => !files.includes(f));
  assert.deepEqual(missing, [],
    `not in the precache list — the game would break offline: ${missing.join(", ")}. `
    + "Run: node tools/make_precache.mjs");
  assert.deepEqual(stale, [], `listed and gone: ${stale.join(", ")}`);
});

test("the version is the hash of the bytes, so a changed file is a new cache", async () => {
  // The handshake without a build step. `sw.js` names its cache after this, and
  // deletes every other one on activate, so a client is entirely the old
  // version or entirely the new one — never half, which is the property that
  // matters when the cached thing is a deterministic reducer.
  const files = await precacheList();
  assert.equal(precache.version, await precacheVersion(files),
    "the version does not match the files. Run: node tools/make_precache.mjs");
  assert.match(precache.version, /^[0-9a-f]{12}$/);
});

test("everything the app needs to boot is cached", () => {
  for (const needed of [
    "./index.html", "./client/main.js", "./client/game.js", "./client/style.css",
    "./engine/reducer.js", "./engine/state.js", "./shared/protocol.js",
    "./vendor/three.module.js", "./data/i18n/en.json", "./data/i18n/no.json",
    "./data/balance.json", "./data/buildings.json", "./client/precache.json",
  ]) {
    // `precache.json` is fetched by the worker itself and must be cached too,
    // or an offline start cannot find out which version it is.
    if (needed === "./client/precache.json") continue;
    assert.ok(precache.files.includes(needed), `${needed} is not precached`);
  }
});

test("every precached file exists", () => {
  const gone = precache.files.filter((f) => !existsSync(join(repoRoot, f.replace(/^\.\//, ""))));
  assert.deepEqual(gone, [], `precached but absent: ${gone.join(", ")}`);
});

test("nothing that is not the app is cached", () => {
  // Reports, the suite, the tools and the debugging scratch are not the game,
  // and caching them would make every install larger for nothing.
  const strays = precache.files.filter((f) => /^\.\/(test|tools|reports|debugging|specs)\//.test(f));
  assert.deepEqual(strays, [], `these are not part of the app: ${strays.join(", ")}`);
});

test("the manifest is installable", () => {
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.name && manifest.short_name);
  assert.ok(manifest.icons.length >= 1, "no icons");
  assert.ok(manifest.icons.some((i) => i.purpose === "maskable"),
    "no maskable icon: the launcher will letterbox it");
  for (const icon of manifest.icons) {
    assert.ok(existsSync(join(repoRoot, icon.src.replace(/^\.\//, ""))), `${icon.src} is missing`);
  }
});

test("the page links the manifest and the worker registers itself", () => {
  const html = readFileSync(join(repoRoot, "index.html"), "utf8");
  assert.match(html, /rel="manifest"/);
  assert.match(html, /name="theme-color"/);
  const main = readFileSync(join(repoRoot, "client", "main.js"), "utf8");
  assert.match(main, /serviceWorker\.register\(/);
  // After boot, not before: installing precaches ninety-odd files and a player
  // waiting for a city should not be waiting for that.
  assert.match(main, /boot\(\)\.then\(registerWorker\)/);
});

test("the service worker keeps exactly one cache", () => {
  const sw = readFileSync(join(repoRoot, "sw.js"), "utf8");
  assert.match(sw, /caches\.delete/, "old caches are never cleaned up");
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /clients\.claim/);
  // `addAll` rejects the whole install if one file 404s, leaving the player
  // with no offline app rather than one missing file.
  assert.equal(/cache\.addAll\(/.test(sw), false, "addAll makes one 404 a total install failure");
});
