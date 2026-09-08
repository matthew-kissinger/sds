// SPDX-License-Identifier: AGPL-3.0-or-later
import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
import {installCapture} from './capture-browser.mjs';
const base=process.env.TRAILER_BASE??'https://sheepdogsim.com';
const report={base,release:base.includes('127.0.0.1')?{source:'local working tree'}:await(await fetch(`${base}/release.json`)).json(),views:[],errors:[]};
const prefix=base.includes('127.0.0.1')?'local-hover':'live-controls';
const browser=await chromium.launch({channel:'chrome',headless:false});
try {
 for(const [label,width,height,debug] of [['desktop',1920,1080,''],['phone',390,844,''],['webgl',1920,1080,'webgl']]) {
  const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500});
  await context.route('**/api/**',r=>r.fulfill({status:503,body:'{}'}));
  await context.addInitScript(installCapture);
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
  await page.goto(`${base}/?seed=20260821&debug=${debug}`);
  await page.locator('.herd-app[data-ready="true"]').waitFor({timeout:90000});
  await page.locator('.herd-size').filter({hasText:'200'}).click();
  await page.getByRole('button',{name:'Customize',exact:true}).click();
  await page.getByRole('tab',{name:'Flock Breeds',exact:true}).click();
  await page.waitForTimeout(1200);
  const scene=await page.evaluate(()=>__trailer.find());
  const names=[];
  for(const fraction of [.3,.65,.85]) {
   const point=await page.evaluate(({fraction,width,height})=>{
    const a=__trailer,camera=a.store.getState().camera;let mesh;
    a.store.getState().scene.traverse(o=>{if(!mesh&&o.isInstancedMesh&&o.count===200)mesh=o;});
    const target={x:width<500?width*fraction:400+(width-400)*fraction,y:height*(width<500?.3:.62)};
    const points=a.sim.state.sheep.map((s,id)=>{
     const v=camera.position.clone().set(s.position.x,mesh.instanceMatrix.array[id*16+13]+.6,s.position.z).project(camera);
     return{x:(v.x+1)*width/2,y:(1-v.y)*height/2,z:v.z};
    }).filter(p=>p.x>(width<500?10:380)&&p.x<width-20&&p.y>100&&p.y<height*(width<500?.55:.9)&&p.z<1);
    points.sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y));
    return points[0];
   },{fraction,width,height});
   if(!point)throw new Error('No sheep in viewport');
   if(width<500)await page.touchscreen.tap(point.x,point.y);else await page.mouse.move(point.x,point.y,{steps:8});
   await page.waitForTimeout(350);
   names.push(await page.locator('#herd-nameplate-title').innerText());
  }
  if(new Set(names).size<2||names.some(n=>!n))throw new Error('Hover did not select different sheep: '+names);
  await page.screenshot({path:`captures/trailer/${prefix}-${label}-names.png`});
  if(width>500) {
   await page.getByRole('tab',{name:'Flock Breeds',exact:true}).hover();await page.waitForTimeout(700);
   if(await page.locator('#herd-nameplate-anchor').isVisible())throw new Error('Hover leaked through Studio controls');
  }
  await page.getByRole('button',{name:'Close customization studio',exact:true}).click();
  await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForTimeout(500);
  await page.evaluate(()=>__trailer.find());
  await page.keyboard.down('KeyW');await page.waitForTimeout(650);
  const run=await page.evaluate(()=>__trailer.sim.state.dogs[0].velocity.magnitude());
  await page.keyboard.down('KeyE');await page.waitForTimeout(650);
  const walk=await page.evaluate(()=>__trailer.sim.state.dogs[0].velocity.magnitude());
  await page.screenshot({path:`captures/trailer/${prefix}-${label}-walk.png`});
  await page.keyboard.up('KeyE');await page.waitForTimeout(650);
  const resumed=await page.evaluate(()=>__trailer.sim.state.dogs[0].velocity.magnitude());
  await page.keyboard.up('KeyW');
  if(Math.abs(walk/run-.3)>.05||resumed/run<.95)throw new Error('Walk failed');
  report.views.push({label,scene,names,run,walk,resumed});
  console.log(JSON.stringify(report.views.at(-1)));
  await context.close();
 }
}finally{writeFileSync(`captures/trailer/${prefix}.json`,JSON.stringify(report,null,2));await browser.close();}
if(report.errors.length)throw new Error(report.errors.join('\n'));
