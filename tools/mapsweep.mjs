// Map sweep: the gate for slice 1.1.
//
// Five seeds tell you generation runs. Only a battery tells you whether the
// regions it produces are fair, and whether the fairness gate is doing
// anything or just passing everything.
//
// Usage: node tools/mapsweep.mjs [count] [size] [seats]
//   MODE=districts WATER=river STYLE=hilly node tools/mapsweep.mjs 200

import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { surveyTerrain } from "../engine/terrain.js";

const WATERS = ["none", "lakes", "river", "coastal", "archipelago"];
const STYLES = ["flat", "rolling", "hilly"];

export function sweep({ count = 200, size = 64, seats = 8, mode = "districts", water = "", style = "" } = {}) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const waterStyle = water || WATERS[i % WATERS.length];
    const terrainStyle = style || STYLES[i % STYLES.length];
    const options = defaultOptions({
      seed: 1000 + i, width: size, height: size, seats, mode, waterStyle, terrainStyle,
    });
    const started = process.hrtime.bigint();
    const result = generateWorld(options);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;

    if (!result.ok) {
      rows.push({ seed: 1000 + i, waterStyle, terrainStyle, ok: false, reason: result.reason, attempts: result.attempts, ms });
      continue;
    }
    rows.push({
      seed: 1000 + i,
      waterStyle,
      terrainStyle,
      ok: true,
      attempts: result.attempts,
      spread: result.districts.spread,
      smallest: result.districts.smallest,
      buildablePercent: result.description.buildablePercent,
      waterPercent: result.description.waterPercent,
      islands: result.description.islands,
      shape: result.description.shape,
      ms,
    });
  }
  return rows;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

export function report(rows) {
  const ok = rows.filter((r) => r.ok);
  const failed = rows.filter((r) => !r.ok);
  const spreads = ok.map((r) => r.spread);
  const attempts = rows.map((r) => r.attempts);
  const times = rows.map((r) => r.ms);

  const reasons = {};
  for (const row of failed) reasons[row.reason] = (reasons[row.reason] ?? 0) + 1;

  const byWater = {};
  for (const row of rows) {
    const bucket = byWater[row.waterStyle] ?? { total: 0, ok: 0, attempts: 0 };
    bucket.total += 1;
    if (row.ok) bucket.ok += 1;
    bucket.attempts += row.attempts;
    byWater[row.waterStyle] = bucket;
  }

  return {
    regions: rows.length,
    accepted: ok.length,
    rejected: failed.length,
    reasons,
    spread: { min: Math.min(...spreads), p50: percentile(spreads, 0.5), max: Math.max(...spreads) },
    attempts: { mean: Math.round((attempts.reduce((a, b) => a + b, 0) / attempts.length) * 100) / 100, max: Math.max(...attempts) },
    ms: { p50: Math.round(percentile(times, 0.5) * 100) / 100, p99: Math.round(percentile(times, 0.99) * 100) / 100 },
    byWater,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const count = Number(process.argv[2] ?? 200);
  const size = Number(process.argv[3] ?? 64);
  const seats = Number(process.argv[4] ?? 8);
  const rows = sweep({
    count, size, seats,
    mode: process.env.MODE ?? "districts",
    water: process.env.WATER ?? "",
    style: process.env.STYLE ?? "",
  });
  const summary = report(rows);
  console.log(`map sweep — ${summary.regions} regions, ${size}x${size}, ${seats} seats, era 0`);
  console.log(`accepted ${summary.accepted}, rejected ${summary.rejected}`);
  if (summary.rejected > 0) console.log("rejection reasons:", summary.reasons);
  console.log(`fairness spread: min ${summary.spread.min}% median ${summary.spread.p50}% max ${summary.spread.max}%`);
  console.log(`gate attempts: mean ${summary.attempts.mean}, worst ${summary.attempts.max}`);
  console.log(`generation time: p50 ${summary.ms.p50} ms, p99 ${summary.ms.p99} ms`);
  console.log("by water style:");
  for (const [name, bucket] of Object.entries(summary.byWater)) {
    console.log(`  ${name.padEnd(13)} accepted ${bucket.ok}/${bucket.total}, mean attempts ${(bucket.attempts / bucket.total).toFixed(2)}`);
  }
}
