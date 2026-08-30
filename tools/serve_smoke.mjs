// The gate that was missing: does the game work on the server a PLAYER uses?
//
// Every other gate stands up its own throwaway static server inside the test
// file. That is convenient and it meant **eight gates all passed while
// `./run.sh` was broken**: `tools/serve.mjs` sends a Content-Security-Policy
// with `default-src 'self'` and no `script-src`, which blocks inline scripts —
// including `<script type="importmap">`. Without the importmap,
// `import ... from "three"` cannot resolve and the game dies at boot with
// "Failed to resolve module specifier".
//
// So this one starts `tools/serve.mjs` as a child process, exactly as `run.sh`
// does, and loads `http://localhost:<port>` — the bare origin a person types,
// not `/index.html`.
//
//   node tools/serve_smoke.mjs

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8199;

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const server = spawn(process.execPath, [join(root, "tools", "serve.mjs"), String(PORT)], {
  cwd: root, stdio: ["ignore", "pipe", "pipe"],
});
const serverLog = [];
server.stdout.on("data", (d) => serverLog.push(String(d)));
server.stderr.on("data", (d) => serverLog.push(String(d)));

// Wait for it to answer rather than sleeping a fixed time.
const base = `http://localhost:${PORT}`;
for (let attempt = 0; attempt < 50; attempt += 1) {
  try {
    const response = await fetch(`${base}/index.html`);
    if (response.ok) break;
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 100));
}

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const problems = [];

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`page error — ${e.message}`));
  // Console errors matter here more than anywhere else: a CSP violation is
  // reported to the console and NOT as a page error, which is the specific
  // reason this failure was invisible.
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console — ${m.text()}`); });

  // The bare origin, with no path and no query — what a person types.
  await page.goto(base);
  await page.waitForSelector(".lobby", { timeout: 60000 });
  check("the bare origin serves the new-game screen", true);

  const csp = (await (await fetch(`${base}/`)).headers.get("content-security-policy")) ?? "";
  check("the policy permits the page's own inline scripts",
    /script-src[^;]*sha256-/.test(csp), csp);
  check("the policy still refuses anything from elsewhere",
    csp.includes("default-src 'self'") && !csp.includes("unsafe-inline'; script")
    && !/script-src[^;]*'unsafe-inline'/.test(csp),
    "hashes, not unsafe-inline");

  // Start a city and play, so this covers module resolution all the way down
  // rather than only the shell.
  await page.click("#start");
  await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
  const city = await page.evaluate(() => ({
    width: globalThis.CITY.state.width,
    three: Boolean(globalThis.CITY.renderer),
  }));
  check("a city starts, so the importmap resolved and three.js loaded",
    city.width > 0 && city.three, JSON.stringify(city));

  // Every content type the page depends on, from the real server.
  for (const [path, type] of [
    ["/client/main.js", "text/javascript"],
    ["/vendor/three.module.js", "text/javascript"],
    ["/data/i18n/en.json", "application/json"],
    ["/manifest.webmanifest", "application/manifest+json"],
    ["/client/icon.svg", "image/svg+xml"],
    ["/sw.js", "text/javascript"],
  ]) {
    const response = await fetch(base + path);
    const got = response.headers.get("content-type") ?? "";
    check(`${path} is served as ${type}`, response.ok && got.startsWith(type), `${response.status} ${got}`);
  }

  check("no console or page errors", problems.length === 0, problems.join(" | "));
  await context.close();
} finally {
  await browser.close();
  server.kill();
}

if (failures > 0 && serverLog.length > 0) console.log(`\nserver said: ${serverLog.join("").trim()}`);
console.log(failures === 0 ? "\nserve smoke ok" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
