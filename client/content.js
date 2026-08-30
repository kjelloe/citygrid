// Loading data/ into the engine.
//
// `engine/` may not do I/O (ruling: the engine is pure), so somebody outside it
// has to read the JSON and hand it in. That somebody is here for the browser,
// and `test/helpers` for node.
//
// The quest catalogue is VALIDATED on the way in. A quest that references a
// measure nobody implements would otherwise sit in the catalogue for months,
// never firing, looking exactly like a quest whose conditions have not been met
// — the most expensive kind of bug, because it looks like content.

import { setQuests, validateQuests } from "../engine/quests.js";

export async function loadQuests(base = "./data/quests/") {
  const index = await (await fetch(`${base}index.json`)).json();
  const all = [];
  for (const file of index) {
    const list = await (await fetch(`${base}${file}`)).json();
    for (const quest of list) all.push(quest);
  }
  const problems = validateQuests(all);
  if (problems.length > 0) {
    // Loudly, at boot. A broken quest is a startup error, not a silent no-op at
    // hour three.
    console.error(`quest catalogue has ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
  }
  setQuests(all);
  return { quests: all, problems };
}
