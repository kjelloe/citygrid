// The node side of the content loader — same job as client/content.js, with
// `fs` instead of `fetch`, so tests and tools run against the REAL quest files
// rather than a fixture that can drift from them.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./sources.js";

export function readQuests() {
  const dir = join(repoRoot, "data", "quests");
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
  const all = [];
  for (const file of index) {
    for (const quest of JSON.parse(readFileSync(join(dir, file), "utf8"))) all.push(quest);
  }
  return { all, index, files: readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json") };
}
