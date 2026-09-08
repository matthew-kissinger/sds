// SPDX-License-Identifier: AGPL-3.0-or-later
// A full-speed controller pass through a real 200-sheep flock.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { installCapture } from './capture-browser.mjs';
const out=resolve('captures/trailer');
const report={release:await(await fetch('https://sheepdogsim.com/release.json')).json(),samples:[],errors:[]};
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--autoplay-policy=no-user-gesture-required']});
try {
 const context=await browser.newContext({viewport:{width:1920,height:1080},acceptDownloads:true});
 await context.route('**/api/**',r=>r.fulfill({status:503,body:'{}'}));
 await context.addInitScript(installCapture);
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto('https://sheepdogsim.com/?seed=20260821');
 await page.locator('.herd-app[data-ready="true"]').waitFor({timeout:90000});
 await page.locator('.herd-size').filter({hasText:'200'}).click();
 await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.waitForTimeout(600);report.scene=await page.evaluate(()=>__trailer.find());
 await page.evaluate(()=>{
  const a=__trailer,s=a.sim.state,flock=s.sheep;
  const densest=flock.reduce((best,s)=>{ const count=flock.filter(o=>Math.hypot(o.position.x-s.position.x,o.position.z-s.position.z)<12).length;return count>best.count?{count,point:s.position}:best;},{count:0,point:flock[0].position});
  const group=flock.filter(s=>Math.hypot(s.position.x-densest.point.x,s.position.z-densest.point.z)<12);
  const cx=group.reduce((n,s)=>n+s.position.x,0)/group.length,cz=group.reduce((n,s)=>n+s.position.z,0)/group.length;
  const heading=Math.atan2(cz-s.dogs[0].position.z,cx-s.dogs[0].position.x),began=performance.now();
  const native=navigator.getGamepads.bind(navigator);
  let trackAngle=heading, crossedAt=null;
  navigator.getGamepads=()=>{
   const t=(performance.now()-began)/1000;
   const gx=group.reduce((n,s)=>n+s.position.x,0)/group.length,gz=group.reduce((n,s)=>n+s.position.z,0)/group.length;
   const dog=s.dogs[0].position;
   if(crossedAt===null) {
    const wanted=Math.atan2(gz-dog.z,gx-dog.x),delta=Math.atan2(Math.sin(wanted-trackAngle),Math.cos(wanted-trackAngle));
    trackAngle+=Math.max(-.035,Math.min(.035,delta));
    if(Math.hypot(gx-dog.x,gz-dog.z)<7)crossedAt=t;
   }
   const bend=Math.max(0,Math.min(1,(t-(crossedAt??t)-1.5)/4));
   const angle=trackAngle-bend*bend*(3-2*bend)*1.3;
   return [{connected:true,mapping:'standard',axes:[-Math.cos(angle),-Math.sin(angle)],buttons:Array.from({length:17},(_,i)=>({pressed:i===7&&t<2,value:i===7&&t<2?1:0}))}];
  };
  a.stopDrive=()=>{navigator.getGamepads=native;};
  a.cinema({from:[12,27,-34],to:[6,24,-31],aim:[0,0,0],centerOn:'flock',seconds:12,fov:55});
 });
 const download=page.waitForEvent('download',{timeout:90000});
 await page.evaluate(()=>__trailer.start('split-200'));
 const began=Date.now();
 for(let i=0;i<12;i++) {
  await page.waitForTimeout(1000);
  report.samples.push(await page.evaluate(()=>({tick:__trailer.sim.state.tick,dog:{...__trailer.sim.state.dogs[0].position},sheep:__trailer.sim.state.sheep.map(s=>({...s.position}))})));

 }
 report.elapsed=(Date.now()-began)/1000;
 report.timing=await page.evaluate(()=>{__trailer.stopDrive();return __trailer.stop();});
 await(await download).saveAs(join(out,'split-200.webm'));
}finally{writeFileSync(join(out,'split-report.json'),JSON.stringify(report,null,2));await browser.close();}
