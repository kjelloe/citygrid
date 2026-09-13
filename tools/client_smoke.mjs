// Client smoke: does the real client render a real city without complaining?
//
// A separate layer from the unit suite on purpose (plan.md §11): it needs a
// browser, it is slow, and it catches a different class of fault — a module
// that throws on load, a shader that fails to compile, a renderer that draws
// nothing. None of those are visible to `node --test`.
//
// SwiftShader, so frame times mean nothing here. Correctness only.
//
// Usage: node tools/client_smoke.mjs

import { shoot } from "./screenshot.mjs";

// Declared here rather than imported: client/render/* imports the bare
// specifier "three", which only the browser's importmap resolves. A Node tool
// that reaches into the renderer would need a loader, and the point of this
// script is to drive the client from outside, as a browser does.
const CHECKS = [
  { style: "plain", span: 0, post: false },
  { style: "plain", span: 9, post: false },
  { style: "pixel", span: 9, post: true },
  { style: "painted", span: 9, post: false },
];

let failures = 0;

for (const check of CHECKS) {
  const label = `${check.style} @ span ${check.span || "default"}`;
  const result = await shoot({
    out: `reports/smoke-${check.style}-${check.span}.png`,
    seed: 1003, years: 12, style: check.style, span: check.span,
    width: 800, height: 450,
  });

  const problems = [...result.problems];
  const report = result.report ?? {};

  // A render that produced nothing is a pass by every other measure.
  if (!(report.drawCalls > 0)) problems.push("no draw calls");
  if (!(report.buildings > 0)) problems.push("the fixture city grew nothing");
  if (!(report.instances > 0)) problems.push("no instances were placed");
  if (report.chunksRebuilt !== 16) problems.push(`rebuilt ${report.chunksRebuilt} chunks, expected 16`);
  // Every category builds a DISTINCT silhouette per variant (slice V6). A
  // variant the kit forgot falls through to another branch and comes out
  // identical — a city of clones with a green suite, and node cannot see it
  // because `building-kit.js` imports three.
  for (const [kind, counts] of Object.entries(report.kit ?? {})) {
    // Civic has one silhouette per DEFINITION since S1 — twelve, not the six
    // hashed variants every other category has. The count it must match is the
    // catalogue's, and the reason this is here rather than in a unit test is
    // the same as ever: `building-kit.js` imports three.
    const want = kind === "civic" ? (report.civicDefs ?? report.variants) : report.variants;
    if (counts.length !== want) {
      problems.push(`${kind} builds ${counts.length} variants, not ${want}`);
    }
    const distinct = new Set(counts).size;
    if (distinct < counts.length) {
      problems.push(`${kind} has ${counts.length - distinct} duplicate silhouette(s): ${counts.join(", ")}`);
    }
    if (counts.some((n) => !(n > 0))) problems.push(`${kind} has an empty variant`);
  }
  // The whole point of instancing: a city of hundreds of buildings must not be
  // hundreds of draw calls.
  if (!check.post && report.drawCalls > 80) {
    problems.push(`${report.drawCalls} draw calls — instancing is not working`);
  }

  if (problems.length > 0) {
    failures += 1;
    console.log(`FAIL  ${label}`);
    for (const problem of problems) console.log(`        ${problem}`);
  } else {
    console.log(`ok    ${label.padEnd(26)} ${report.drawCalls} draws, ${report.triangles} tris, ${report.buildings} buildings`);
    if (check.span === 0) {
      for (const [kind, counts] of Object.entries(report.kit ?? {})) {
        console.log(`        ${kind.padEnd(12)} ${new Set(counts).size} distinct silhouettes of ${counts.length}`);
      }
    }
  }
}

// Frozen is frozen: two shots of one city under `?life=0` are the same BYTES.
// S6's item calls this "V1's gate, kept", and no tool had ever checked it —
// `motion_shots.mjs` did, and it is too slow for any set. Here it costs two
// small shots, in the set every slice runs.
{
  const { readFileSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const hashes = [];
  for (const k of [1, 2]) {
    const out = `reports/.smoke-frozen-${k}.png`;
    await shoot({ out, seed: 1003, years: 12, style: "plain", span: 9, width: 480, height: 270, frames: 20 });
    hashes.push(createHash("sha256").update(readFileSync(out)).digest("hex").slice(0, 16));
  }
  if (hashes[0] === hashes[1]) console.log(`ok    two frozen shots are the same bytes (${hashes[0]})`);
  else {
    failures += 1;
    console.log(`FAIL  two frozen shots differ: ${hashes.join(" and ")} — something moves with life off`);
  }
}

console.log(failures === 0 ? "\nclient smoke ok" : `\nCLIENT SMOKE FAILED — ${failures} of ${CHECKS.length + 1}`);
if (failures > 0) process.exit(1);
