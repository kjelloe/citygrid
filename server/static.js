// Serving the tree, once (Q167, 2026-10-10).
//
// **One implementation of "serve these files".** M12 deleted `tools/serve.mjs`
// because two static servers for one tree is two chances to be wrong about it
// — and left sixteen more, one per picture gate, each with its own type table
// and none of them sending the headers a player gets. `tools/screenshot.mjs`
// is the one that matters: every picture this project has ever taken came off
// its fourteen-line server, so the frames the art direction is argued from
// were served by a harness rather than by the game.
//
// The process boundary is not the point and spawning a ROOM to take a
// screenshot would be absurd — a picture harness needs no pump, no socket and
// no city. What matters is that the bytes and the headers are the same, so the
// handler moved here and `server/index.js` and the harness both call it.
//
// Pure of the room on purpose: `health` arrives as a function and is absent
// for every caller that has no rooms to report.

import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

/** Every type the client actually asks for. `.jpg` and `.glb` came from
 * `tools/serve.mjs` when this became the ONE server (M12): a file served as
 * `application/octet-stream` is a file the browser downloads instead of
 * showing, and a reference image in `reports/` is a legitimate request. */
export const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".glb": "model/gltf-binary",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2",
};

/**
 * The CSP for one HTML file, with a hash for each of ITS inline scripts.
 *
 * Moved here from `tools/serve.mjs` with the rest of the static half (M12),
 * because two servers sending different headers for one tree is how
 * `serve_smoke` came to exist: `default-src 'self'` with no `script-src`
 * blocks inline scripts — including `<script type="importmap">`, without which
 * `import … from "three"` cannot resolve and the game dies at boot.
 *
 * **Per page, not one policy for the server.** The first version hashed
 * `index.html` and sent that policy with every file, and `a11y_smoke` went red
 * at once: `tools/shoot.html` has inline scripts of its own, so the page it
 * drives was refused by the policy of a page it is not. One global policy
 * would also have meant index.html permitting shoot.html's scripts, which is
 * wider than it needs to be. Memoised per path, because a hash per request of
 * a file that does not change is work nobody asked for.
 *
 * Hashes rather than `'unsafe-inline'`, and computed from the file that is
 * actually served, so the policy cannot drift from the page.
 */
const policies = new Map();
export async function contentPolicy(target) {
  const had = policies.get(target);
  if (had) return had;
  let hashes = [];
  try {
    const html = await readFile(target, "utf8");
    hashes = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((m) => `'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
  } catch {
    hashes = [];
  }
  const policy = [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(" ")}`.trim(),
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    // The socket is same-origin, and naming it is what stops a page served
    // from here reaching a socket somewhere else.
    "connect-src 'self'",
  ].join("; ");
  policies.set(target, policy);
  return policy;
}

/**
 * The static half, and since M12 it is the ONLY one: `run.sh` and the three
 * browser smokes start this file, where they used to start `tools/serve.mjs`.
 * Two servers that serve the same tree with different headers is the shape
 * `serve_smoke` was written for — it exists because `run.sh`'s CSP blocked the
 * importmap on the server a player uses while every other gate stood up its own.
 *
 * `health` is passed in rather than read from a module, because what it reports
 * belongs to the running rooms and this function is reused by nothing else.
 */
export function makeStatic({ health, root = repoRoot } = {}) {
  return function serveStatic(req, res) {
    const url = new URL(req.url, "http://localhost");
    let path = decodeURIComponent(url.pathname);
    // **`/healthz` is the box-wide convention** and `/health` is what the
    // sibling playbooks' deploy scripts curl, so both reach the same handler
    // (`../Fireline/DEPLOYING.md` does the same). A monitoring sweep hits one
    // path across every port on the machine.
    if (health && (path === "/health" || path === "/healthz")) {
      const body = JSON.stringify(health(), undefined, 1);
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(body);
      return;
    }
    if (path.endsWith("/")) path += "index.html";
    const target = join(root, normalize(path));
    // Resolved first, then checked: a path that climbs out of the root is
    // refused rather than normalised into something that looks safe. It is the
    // third of three — `new URL()` flattens `..` in the pathname and
    // `normalize()` flattens what percent-decoding puts back, so `test/static.test.js`
    // asserts that nothing outside the root is served rather than which of the
    // three refused it.
    if (!resolve(target).startsWith(root)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    readFile(target).then(async (body) => {
      const headers = {
        "content-type": TYPES[extname(target)] ?? "application/octet-stream",
        "cache-control": "no-cache",
      };
      // Only a document carries a policy: a `.js` served with one is a header
      // nothing reads, and the hashes belong to the page that holds the scripts.
      if (extname(target) === ".html") headers["content-security-policy"] = await contentPolicy(target);
      res.writeHead(200, headers);
      res.end(body);
    }).catch(() => res.writeHead(404).end("Not found"));
  };
}
