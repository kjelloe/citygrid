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
  }
}

console.log(failures === 0 ? "\nclient smoke ok" : `\nCLIENT SMOKE FAILED — ${failures} of ${CHECKS.length}`);
if (failures > 0) process.exit(1);
