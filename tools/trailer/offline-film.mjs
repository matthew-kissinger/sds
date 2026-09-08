// SPDX-License-Identifier: AGPL-3.0-or-later
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { installCapture } from './capture-browser.mjs';
import { freeze, advance, record } from './offline.mjs';
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--autoplay-policy=no-user-gesture-required']});
const base=process.env.TRAILER_BASE??'https://sheepdogsim.com';
const reportPath='captures/trailer/offline-film-report.json';
const report=existsSync(reportPath)?JSON.parse(readFileSync(reportPath)):{shots:[],errors:[]};
const captureSource=base.includes('127.0.0.1')?{source:'local working tree'}:await(await fetch(`${base}/release.json`)).json();
report.lastCaptureSource=captureSource;
delete report.release;
const wanted=process.argv[2]??'all';
const output=name=>`captures/trailer/offline-${name}.mp4`;
async function setup(studio=false) {
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 await context.route('**/api/**',r=>r.fulfill({status:503,body:'{}'}));
 await context.addInitScript(installCapture);
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(`${base}/?seed=20260821`);
 await page.locator('.herd-app[data-ready="true"]').waitFor({timeout:90000});
 await page.locator('.herd-size').filter({hasText:'200'}).click();
 if(studio)await page.getByRole('button',{name:'Customize',exact:true}).click();
 await page.waitForTimeout(1000);
 if(!studio) {
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.waitForTimeout(1500);
  await page.addStyleTag({content:'.herd-app>*{visibility:hidden} canvas{visibility:visible!important}'});
 }
 await freeze(page);
 await advance(page,36);
 return {page,context};
}
async function take(page,name,frames,action) {
 const receipt=await record(page,output(name),frames,action);
 report.shots=report.shots.filter(s=>s.name!==name);
 report.shots.push({name,source:captureSource,...receipt});
 await page.screenshot({path:`captures/trailer/offline-${name}.png`});
 writeFileSync('captures/trailer/offline-film-report.json',JSON.stringify(report,null,2));
}
try {
 if(wanted==='all'||wanted==='flock') {
  const {page,context}=await setup();
  await page.evaluate(()=>{
   const a=__trailer,s=a.sim.state,flock=s.sheep;
   const densest=flock.reduce((best,s)=>{const count=flock.filter(o=>Math.hypot(o.position.x-s.position.x,o.position.z-s.position.z)<12).length;return count>best.count?{count,point:s.position}:best;},{count:0,point:flock[0].position});
   const group=flock.filter(s=>Math.hypot(s.position.x-densest.point.x,s.position.z-densest.point.z)<12);
   const center=()=>({x:group.reduce((n,s)=>n+s.position.x,0)/group.length,z:group.reduce((n,s)=>n+s.position.z,0)/group.length});
   const c=center();let angle=Math.atan2(c.z-s.dogs[0].position.z,c.x-s.dogs[0].position.x),crossed=null;
   const began=a.offlineTime,native=navigator.getGamepads.bind(navigator);
   navigator.getGamepads=()=>{
    const t=a.offlineTime-began,c=center(),dog=s.dogs[0].position;
    if(crossed===null) {
     const wanted=Math.atan2(c.z-dog.z,c.x-dog.x),difference=Math.atan2(Math.sin(wanted-angle),Math.cos(wanted-angle));
     angle+=Math.max(-.035,Math.min(.035,difference));
     if(Math.hypot(c.x-dog.x,c.z-dog.z)<7)crossed=t;
    }
    const bend=Math.max(0,Math.min(1,(t-(crossed??t)-.65)/2.6));
    const smooth=bend*bend*(3-2*bend),heading=angle-smooth*2.1,effort=1-smooth*.32;
    return [{connected:true,mapping:'standard',axes:[-Math.cos(heading)*effort,-Math.sin(heading)*effort],buttons:Array.from({length:17},()=>({pressed:false,value:0}))}];
   };
   a.stopDrive=()=>navigator.getGamepads=native;
   a.cinema({from:[8,22,-28],to:[8,36,-44],aim:[0,2,0],centerOn:'flock',seconds:5,fov:53});
  });
  await advance(page,90);
  await take(page,'split',300);
  await context.close();
 }
 if(wanted==='all'||wanted==='wide') {
  const {page,context}=await setup();
  await page.evaluate(()=>{
   __trailer.walkTo(-18,-38,.6);
   __trailer.cinema({from:[0,20,-30],to:[2,19,-29],aim:[0,1,0],centerOn:'flock',seconds:8,fov:55});
  });
  await take(page,'wide',300);
  await context.close();
 }
 if(wanted==='all'||wanted==='details') {
  const {page,context}=await setup();
  await page.evaluate(()=>{
   const a=__trailer,flock=a.sim.state.sheep;
   const index=flock.findIndex(s=>{const n=flock.filter(o=>Math.hypot(o.position.x-s.position.x,o.position.z-s.position.z)<7).length;return n>=5&&n<=12;});
   a.detailId=Math.max(0,index);
   a.cinema({from:[7,10,14],to:[6,9.5,13],aim:[0,.8,0],sheepIndex:a.detailId,seconds:8,fov:45,exclusive:true});
  });
  await page.addStyleTag({content:'#herd-nameplate-anchor,#herd-nameplate-anchor *{visibility:visible!important}'});
  await advance(page,30);
  const hover=async(frame=0)=>{
   const p=await page.evaluate(frame=>{
    const a=__trailer,camera=a.store.getState().camera;let mesh;
    a.store.getState().scene.traverse(o=>{if(!mesh&&o.isInstancedMesh&&o.count===200)mesh=o;});
    if(frame%75===0) {
     const target=[[650,470],[1300,500],[1150,690]][Math.floor(frame/75)%3];
     const points=a.sim.state.sheep.map((s,id)=>{
      const v=camera.position.clone().set(s.position.x,mesh.instanceMatrix.array[id*16+13]+.6,s.position.z).project(camera);
      return {id,x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2,z:v.z};
     }).filter(p=>p.x>420&&p.x<1500&&p.y>280&&p.y<820&&p.z<1);
     points.sort((a,b)=>Math.hypot(a.x-target[0],a.y-target[1])-Math.hypot(b.x-target[0],b.y-target[1]));
     a.hoverId=points[0].id;
    }
    const s=a.sim.state.sheep[a.hoverId].position,y=mesh.instanceMatrix.array[a.hoverId*16+13]+.6;
    const v=camera.position.clone().set(s.x,y,s.z).project(camera);
    return{x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};
   },frame);
   await page.mouse.move(p.x,p.y);
  };
  await hover();await advance(page,30);
  await take(page,'details',225,hover);
  report.names=await page.locator('#herd-nameplate-title').innerText();
  if(!report.names)throw new Error('No genuine hover name');
  await context.close();
 }
 if(wanted==='all'||wanted==='studio'||wanted==='flock-studio') {
  const {page,context}=await setup(true);
  if(wanted!=='flock-studio')await take(page,'dog',300,async i=>{
   if(i===80)await page.getByRole('radio',{name:/Blue Merle/}).click();
   if(i===200)await page.getByRole('radio',{name:/Golden Wheaten/}).click();
  });
  await page.getByRole('tab',{name:'Flock Breeds',exact:true}).click();
  await page.mouse.move(1900,1040);await advance(page,90);
  await take(page,'flock',225,async i=>{
   const choices=page.locator('[aria-label="Flock breed varieties"] button');
   if(i===65)await choices.nth(1).click();
   if(i===155)await choices.nth(3).click();
   if([0,85,175].includes(i)) {
    const target=[[1420,650],[770,730],[1390,480]][Math.floor(i/80)];
    const point=await page.evaluate(target=>{
     const a=__trailer,camera=a.store.getState().camera;let mesh;
     a.store.getState().scene.traverse(o=>{if(!mesh&&o.isInstancedMesh&&o.count===200)mesh=o;});
     const points=a.sim.state.sheep.map((s,id)=>{
      const v=camera.position.clone().set(s.position.x,mesh.instanceMatrix.array[id*16+13]+.6,s.position.z).project(camera);
      return{x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2,z:v.z};
     }).filter(p=>p.x>450&&p.x<1700&&p.y>250&&p.y<850&&p.z<1);
     points.sort((a,b)=>Math.hypot(a.x-target[0],a.y-target[1])-Math.hypot(b.x-target[0],b.y-target[1]));
     return points[0];
    },target);
    await page.mouse.move(point.x,point.y,{steps:8});
   }
  });
  await context.close();
 }
 if(wanted==='all'||wanted==='drone') {
  const {page,context}=await setup();
  await page.evaluate(()=>{
   __trailer.cinema({from:[30,38,-38],to:[-18,18,-29],aim:[0,1.5,0],centerOn:'flock',seconds:15,fov:50});
   __trailer.walkTo(-14,-32,.72);
  });
  await advance(page,360);
  await take(page,'drone',300);
  await context.close();
 }
}finally{writeFileSync('captures/trailer/offline-film-report.json',JSON.stringify(report,null,2));await browser.close();}
