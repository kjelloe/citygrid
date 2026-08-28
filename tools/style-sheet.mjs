// Renders all three candidate styles from the same city, same seed, same
// camera, and stitches them into one labelled sheet.
//
// Three separate files are three separate impressions; a decision needs them
// side by side, which is the whole point of a probe.
//
// Usage: node tools/style-sheet.mjs [out.png] [seed] [years]
//   SPAN=9 LAYOUT=column node tools/style-sheet.mjs

import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shoot } from "./screenshot.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

const STYLES = [
  { name: "plain", label: "PLAIN — soft cool light, bright cosy palette" },
  { name: "pixel", label: "PIXEL — unlit, baked face shading, limited palette, dither" },
  { name: "painted", label: "PAINTED — low warm sun, deep cool shadow, no post-process" },
];

export async function sheet({
  out = "reports/style-sheet.png", seed = 1003, years = 20,
  span = 9, tileWidth = 1180, tileHeight = 560, layout = "column",
} = {}) {
  const shots = [];
  for (const style of STYLES) {
    const file = `reports/.sheet-${style.name}.png`;
    const result = await shoot({
      out: file, seed, years, style: style.name, span,
      width: tileWidth, height: tileHeight,
    });
    shots.push({ ...style, file, report: result.report, problems: result.problems });
  }

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
    const images = [];
    for (const shot of shots) {
      images.push("data:image/png;base64," + (await readFile(join(root, shot.file))).toString("base64"));
    }

    const png = await page.evaluate(async ({ srcs, labels, reports, wide }) => {
      const loaded = [];
      for (const src of srcs) {
        const img = new Image();
        img.src = src;
        await img.decode();
        loaded.push(img);
      }
      const pad = 18;
      const bar = 46;
      const w = loaded[0].width;
      const h = loaded[0].height;
      const cols = wide ? loaded.length : 1;
      const rows = wide ? 1 : loaded.length;

      const canvas = document.createElement("canvas");
      canvas.width = cols * w + (cols + 1) * pad;
      canvas.height = rows * (h + bar) + (rows + 1) * pad;
      const c = canvas.getContext("2d");
      c.fillStyle = "#14161a";
      c.fillRect(0, 0, canvas.width, canvas.height);

      loaded.forEach((img, i) => {
        const cx = wide ? i : 0;
        const cy = wide ? 0 : i;
        const x = pad + cx * (w + pad);
        const y = pad + cy * (h + bar + pad);
        c.fillStyle = "#e8e6e1";
        c.font = "600 20px system-ui, sans-serif";
        c.textBaseline = "middle";
        c.fillText(labels[i], x + 2, y + bar / 2 - 4);
        c.fillStyle = "#8f9299";
        c.font = "400 14px system-ui, sans-serif";
        c.fillText(reports[i], x + 2, y + bar / 2 + 15);
        c.drawImage(img, x, y + bar);
      });
      return canvas.toDataURL("image/png");
    }, {
      srcs: images,
      labels: shots.map((s) => s.label),
      reports: shots.map((s) => {
        const r = s.report ?? {};
        return `${r.buildings} buildings · ${r.population} residents · ${r.drawCalls} draw calls · ${r.triangles} triangles`;
      }),
      wide: layout === "row",
    });

    await mkdir(dirname(join(root, out)), { recursive: true });
    await writeFile(join(root, out), Buffer.from(png.split(",")[1], "base64"));
    return { out, shots };
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await sheet({
    out: process.argv[2] ?? "reports/style-sheet.png",
    seed: Number(process.argv[3] ?? process.env.SEED ?? 1003),
    years: Number(process.argv[4] ?? process.env.YEARS ?? 20),
    span: Number(process.env.SPAN ?? 9),
    layout: process.env.LAYOUT ?? "column",
  });
  console.log(`wrote ${result.out}`);
  for (const shot of result.shots) {
    const r = shot.report ?? {};
    console.log(`  ${shot.name.padEnd(8)} ${r.drawCalls} draws, ${r.triangles} tris`
      + (shot.problems?.length ? `  PAGE ERRORS: ${shot.problems.length}` : ""));
  }
}
