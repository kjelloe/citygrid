// Static file server for the no-build client. Zero dependencies on purpose:
// the client is plain ES modules and an importmap, so serving it correctly is
// the whole of the "build step".
//
// Usage: node tools/serve.mjs [port]

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.argv[2] ?? process.env.PORT ?? 8123);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

/** The CSP hashes for every inline script in the page, computed from the page.
 *
 * `default-src 'self'` with no `script-src` blocks inline scripts — including
 * `<script type="importmap">`, without which `import ... from "three"` cannot
 * resolve and the game dies at boot with "Failed to resolve module specifier".
 *
 * Hashes rather than `'unsafe-inline'`: the point of the policy is to catch an
 * accidental CDN import in development, and `'unsafe-inline'` would let any
 * injected script run too. Computed at startup from the file that is actually
 * served, so the policy cannot drift from the page — the alternative, a hash
 * pasted into a header, is wrong the first time the importmap changes.
 */
async function inlineScriptHashes() {
  const html = await readFile(join(root, "index.html"), "utf8");
  const hashes = [];
  for (const match of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    hashes.push(`'sha256-${createHash("sha256").update(match[1], "utf8").digest("base64")}'`);
  }
  return hashes;
}

const scriptHashes = await inlineScriptHashes();
const CSP = [
  "default-src 'self'",
  `script-src 'self' ${scriptHashes.join(" ")}`.trim(),
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
].join("; ");

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";

    // Contain the served tree: a normalized path must still start at root.
    const target = join(root, normalize(path));
    if (!target.startsWith(root)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    const info = await stat(target);
    if (!info.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }

    const body = await readFile(target);
    res.writeHead(200, {
      "content-type": TYPES[extname(target)] ?? "application/octet-stream",
      "cache-control": "no-cache",
      // The client is entirely self-contained; nothing may be pulled in from
      // elsewhere, and this catches an accidental CDN import in development
      // rather than in production.
      "content-security-policy": CSP,
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

server.listen(port, () => {
  process.stdout.write(`City Grid dev server: http://localhost:${port}/\n`);
});
