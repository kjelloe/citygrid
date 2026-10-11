import { chromium } from "playwright";
import { createServer } from "node:http";
import { makeStatic } from "../server/static.js";
const server = createServer(makeStatic());
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/tools/shoot.html?seed=1003&size=96&years=40&streets=40&tier=high&style=plain&life=0&frames=2&hour=0.5`);
await page.waitForFunction(() => globalThis.SHOT_READY === true || globalThis.CITY !== undefined, undefined, { timeout: 180000 }).catch(() => {});
await page.waitForTimeout(3000);
console.log(JSON.stringify(await page.evaluate(() => {
  const r = globalThis.SHOT_VIEW;
  const scene = r?.scene;
  const out = [];
  scene?.traverse?.((n) => {
    if (n.isDirectionalLight) {
      out.push({ type: "dir", intensity: n.intensity, cast: n.castShadow,
        shadowIntensity: n.shadow?.intensity, radius: n.shadow?.radius, map: n.shadow?.mapSize?.x });
    }
    if (n.isHemisphereLight) out.push({ type: "hemi", intensity: n.intensity });
    if (n.isAmbientLight) out.push({ type: "ambient", intensity: n.intensity });
  });
  return { lights: out, shadowsOn: r?.renderer?.shadowMap?.enabled, keys: Object.keys(globalThis.SHOT_VIEW ?? {}).slice(0, 20) };
}), undefined, 1));
await browser.close(); server.close();
