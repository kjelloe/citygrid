// `data/` into the engine, for a tool (D8b, Q158 → A136).
//
// **There is one adapter in node and this is not it.** `server/content.js`
// reads the balance, the catalogue and the quests and hands them to the engine,
// because `engine/` may not do I/O; `client/content.js` does the same thing for
// the page over `fetch`. A third copy here would be the `VARIANTS` shape with
// files instead of numbers, so this module is one re-export and a reason.
//
// The reason a tool needs it at all: `engine/rules.js` and `engine/catalogue.js`
// have MIRRORS, kept identical to the files by a drift test, and
// `engine/quests.js` has none — `CATALOGUE = []` until somebody calls
// `setQuests`. So every number this project has ever measured came from a city
// in which **no quest could fire**, while a browser has twenty-one of them, and
// quests pay money and set `rank`. That is Q158, answered as A136: the tools
// load the files, and the era that first does is era 30.
//
// A tool's failure here is fatal, as the server's is: a sweep that silently
// measured the mirrors is the thing this module exists to end.
export { loadServerContent as loadContent } from "../../server/content.js";
