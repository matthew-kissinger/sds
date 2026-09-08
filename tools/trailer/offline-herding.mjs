// SPDX-License-Identifier: AGPL-3.0-or-later
// Find cut windows by replaying normal controls, then repeat the same seeded run.
import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { installCapture } from './capture-browser.mjs';
import { freeze, advance, record } from './offline.mjs';
const base='https://sheepdogsim.com';
const report={release:await(await fetch(`${base}/release.json`)).json(),entries:[],shots:[],errors:[]};
const player=buildSync({entryPoints:['tools/trailer/player.mjs'],bundle:true,write:false,format:'iife',globalName:'filmPlayer'}).outputFiles[0].text;
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--autoplay-policy=no-user-gesture-required']});
async function setup() {
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 await context.route('**/api/**',r=>r.fulfill({status:503,body:'{}'}));
 await context.addInitScript(installCapture);
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(`${base}/?seed=20260821`);
 await page.locator('.herd-app[data-ready="true"]').waitFor({timeout:90000});
 await page.waitForTimeout(800);
 await freeze(page);
 await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.evaluate(()=>__trailer.find());
 await page.addScriptTag({content:player});
 await page.evaluate(()=>{
  if(__trailer.sim.state.tick!==0)throw new Error('A replay must start at tick zero');
  __trailer.playSmooth();
  __trailer.trace=[];
  const step=__trailer.offlineStep;
  __trailer.offlineStep=async render=>{
   const result=await step(render);
   const dog=__trailer.sim.state.dogs[0].position;
   __trailer.trace.push([result.tick,result.penned,dog.x,dog.z]);
   return result;
  };
 });
 await page.addStyleTag({content:'.herd-app>*{visibility:hidden} canvas{visibility:visible!important}'});
 return {page,context};
}
try {
 let {page,context}=await setup();
 const plan=await page.evaluate(async()=>{
  const a=__trailer,entries=[];
  while(a.offlineFrame<36000&&!a.sim.completed) {
   const before=a.sim.pennedCount;
   const frame=await a.offlineStep(false);
   if(a.sim.pennedCount!==before)entries.push(frame);
  }
  if(!a.sim.completed)throw new Error('Controller did not complete');
  return {entries,frames:a.offlineFrame,trace:a.trace};
 });
 report.entries=plan.entries;report.completionFrame=plan.frames;
 console.log(JSON.stringify({entries:plan.entries,completion:plan.frames}));
 await context.close();
 ({page,context}=await setup());
 const first=plan.entries[0].frame;
 const windows=[{name:'approach',start:first-510},{name:'gate',start:first-90},{name:'finish',start:plan.frames-150}];
 let current=0;
 for(const window of windows) {
  await advance(page,window.start-current,false);
  const receipt=await record(page,`captures/trailer/offline-${window.name}.mp4`,300);
  current=window.start+300;
  report.shots.push({...window,...receipt});
  await page.screenshot({path:`captures/trailer/offline-${window.name}.png`});
 }
 const replay=await page.evaluate(()=>__trailer.trace);
 const mismatch=plan.trace.findIndex((row,i)=>JSON.stringify(row)!==JSON.stringify(replay[i]));
 if(mismatch>=0)throw new Error(`Replay differs at frame ${mismatch}`);
 report.replayMatchedFrames=plan.trace.length;
 report.completed=await page.evaluate(()=>__trailer.sim.completed);
 if(!report.completed)throw new Error('Recorded run did not complete');
 await context.close();
}finally{writeFileSync('captures/trailer/offline-herding-report.json',JSON.stringify(report,null,2));await browser.close();}
