// A screenshot of the PLAYABLE page — the toolbar, the HUD and a city that has
// actually been built in, on desktop and on a phone viewport.
//
// tools/screenshot.mjs shoots the renderer through a harness page; this shoots
// index.html, which is the thing a person opens. Both are wanted: one proves
// the renderer, this proves the game.
//
//   node tools/play_shot.mjs   →  reports/play-desktop.png, reports/play-phone.png

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
const root = new URL("..", import.meta.url).pathname;
const T = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json" };
const server = createServer(async (q,s)=>{ try{
  const t = join(root, normalize(decodeURIComponent((q.url??"/").split("?")[0]) === "/" ? "/index.html" : decodeURIComponent((q.url??"/").split("?")[0])));
  s.writeHead(200,{"content-type":T[extname(t)]??"application/octet-stream"}); s.end(await readFile(t));
}catch{ s.writeHead(404).end(); }});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const p = server.address().port;
const b = await chromium.launch({args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
for (const [name, vp] of [["desktop",{width:1280,height:720}],["phone",{width:390,height:844}]]) {
  const c = await b.newContext({viewport: vp, hasTouch: name==="phone", isMobile: name==="phone"});
  const page = await c.newPage();
  await page.goto(`http://127.0.0.1:${p}/index.html?seed=1003&size=64`);
  await page.waitForFunction(()=>globalThis.CITY!==undefined,undefined,{timeout:60000});
  await page.evaluate(async ()=>{
    const {state,renderer}=globalThis.CITY;
    const {apply}=await import("/engine/reducer.js");
    const {CMD_TICK,CMD_PLACE_ROAD,CMD_PAINT_ZONE,CMD_PLACE_BUILDING,CMD_PLACE_WIRE,CMD_PLACE_PIPE}=await import("/engine/commands.js");
    globalThis.CITY.pause(); state.players[0].treasury=5000000;
    let row=-1;
    for(let y=10;y<state.height-8&&row<0;y++){let ok=true;
      for(let x=8;x<28;x++) for(let dy=-5;dy<=4;dy++){const i=(y+dy)*state.width+x;
        if(state.tiles.terrain[i]===3||state.tiles.terrain[i]===4) ok=false;}
      if(ok) row=y;}
    apply(state,{type:CMD_PLACE_ROAD,actor:1,runs:[row*state.width+8,20]});
    const z=[]; for(let y=row+1;y<=row+4;y++) z.push(y*state.width+8,20);
    apply(state,{type:CMD_PAINT_ZONE,actor:1,runs:z,zone:1});
    apply(state,{type:CMD_PLACE_BUILDING,actor:1,def:"coalPlant",x:10,y:row-5});
    apply(state,{type:CMD_PLACE_BUILDING,actor:1,def:"groundwaterPump",x:18,y:row-5});
    const w=[],pi=[]; for(let y=row-4;y<=row+4;y++){w.push(y*state.width+10,1);pi.push(y*state.width+18,1);}
    apply(state,{type:CMD_PLACE_WIRE,actor:1,runs:w});
    apply(state,{type:CMD_PLACE_PIPE,actor:1,runs:pi});
    for(let i=0;i<260;i++) apply(state,{type:CMD_TICK});
    globalThis.CITY.resume();
    renderer.worldChanged();
    const {focusOn}=await import("/client/render/camera.js");
    focusOn(renderer.view, 18, row+1); renderer.view.span = 22;
  });
  await page.waitForTimeout(700);
  await page.screenshot({path:`reports/play-${name}.png`});
  console.log("wrote reports/play-"+name+".png");
  await c.close();
}
await b.close(); server.close();
