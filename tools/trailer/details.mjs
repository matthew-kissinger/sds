// SPDX-License-Identifier: AGPL-3.0-or-later
// Close editorial camera, genuine pointer hover, untouched simulation.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { installCapture } from './capture-browser.mjs';
const out=resolve('captures/trailer'),report={names:[],errors:[]};
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--auto-select-tab-capture-source-by-title=SDS Film Capture','--autoplay-policy=no-user-gesture-required']});
try {
 const context=await browser.newContext({viewport:{width:1920,height:1080},acceptDownloads:true});
 await context.route('**/api/**',r=>r.fulfill({status:503,body:'{}'}));
 await context.addInitScript(installCapture);
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto('http://127.0.0.1:5489/?seed=20260821');
 await page.locator('.herd-app[data-ready="true"]').waitFor({timeout:90000});
 await page.locator('.herd-size').filter({hasText:'200'}).click();
 await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForTimeout(700);
 report.scene=await page.evaluate(()=>__trailer.find());
 await page.evaluate(()=>{
  document.title='SDS Film Capture';
  const flock=__trailer.sim.state.sheep;
  const index=flock.findIndex(s=>{const n=flock.filter(o=>Math.hypot(o.position.x-s.position.x,o.position.z-s.position.z)<7).length;return n>=5&&n<=12;});
  __trailer.detailId=Math.max(0,index);
  __trailer.cinema({from:[5,4.5,10],to:[4,4.3,9],aim:[0,.8,0],sheepIndex:__trailer.detailId,seconds:12,fov:45,exclusive:true});
 });
 await page.addStyleTag({content:'.herd-app>*{visibility:hidden} canvas,#herd-nameplate-anchor,#herd-nameplate-anchor *{visibility:visible!important}'});
 await page.waitForTimeout(700);
 const hover=async()=>{
  const p=await page.evaluate(()=>{
   const a=__trailer,camera=a.store.getState().camera;
   let mesh;a.store.getState().scene.traverse(o=>{if(!mesh&&o.isInstancedMesh&&o.count===200)mesh=o;});
   const s=a.sim.state.sheep[a.detailId].position,y=mesh.instanceMatrix.array[a.detailId*16+13]+.6;
   const v=camera.position.clone().set(s.x,y,s.z).project(camera);
   return{x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};
  });
  await page.mouse.move(p.x,p.y);await page.waitForTimeout(90);
 };
 await hover();
 const download=page.waitForEvent('download',{timeout:90000});await page.evaluate(()=>__trailer.start('sheep-details',true));
 for(let i=0;i<55;i++) {
  await hover();
  if(i%10===0) {
   report.names.push(await page.locator('#herd-nameplate-title').innerText());

  }
 }
 report.timing=await page.evaluate(()=>__trailer.stop());await(await download).saveAs(join(out,'sheep-details.webm'));
 if(!report.names.some(Boolean))throw new Error('No real names appeared');
}finally{writeFileSync(join(out,'details-report.json'),JSON.stringify(report,null,2));await browser.close();}
