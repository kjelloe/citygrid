// Writes the service worker's precache list.
//
// There is no build step (CLAUDE.md), so the list of files that make up the app
// cannot be produced at deploy time by a bundler. It is generated here, checked
// in, and kept honest by `test/pwa.test.js` — which fails when a file is added
// to the app and not to the list, exactly as `reachability.test.js` fails when
// a string is added to the catalogue and not to a screen.
//
//   node tools/make_precache.mjs
//
// The version is the hash of the list AND the bytes: a changed byte in any
// cached file produces a new version, which is what makes the handshake work
// without a build step to stamp one.

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Everything the app needs to boot and play with the network off. Directories
 * are walked; anything not listed is not cached, which is the point — reports,
 * debugging output and the test suite are not part of the app. */
const ROOTS = ["client", "engine", "shared", "data", "vendor"];
const FILES = ["index.html", "manifest.webmanifest"];
const SKIP = /\.(md|png|jpg|jpeg|zip)$/i;

async function walk(dir, out) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { await walk(path, out); continue; }
    if (SKIP.test(entry.name)) continue;
    out.push(`./${relative(root, path).split("\\").join("/")}`);
  }
  return out;
}

export async function precacheList() {
  const files = [...FILES];
  for (const name of ROOTS) {
    try {
      if ((await stat(join(root, name))).isDirectory()) await walk(join(root, name), files);
    } catch { /* an optional directory that does not exist yet */ }
  }
  return [...new Set(files.map((f) => (f.startsWith("./") ? f : `./${f}`)))].sort();
}

export async function precacheVersion(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    // The manifest cannot hash itself: writing the version into it changes its
    // bytes, which changes the version. It is still precached — an offline
    // start has to be able to read which version it is.
    if (file.endsWith("precache.json")) continue;
    hash.update(file);
    try { hash.update(await readFile(join(root, file.replace(/^\.\//, "")))); } catch { hash.update("missing"); }
  }
  return hash.digest("hex").slice(0, 12);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = await precacheList();
  const version = await precacheVersion(files);
  const body = { version, generated: new Date().toISOString().slice(0, 10), files };
  await writeFile(join(root, "client", "precache.json"), `${JSON.stringify(body, undefined, 1)}\n`);
  console.log(`client/precache.json: ${files.length} files, version ${version}`);
}
