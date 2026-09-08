// SPDX-License-Identifier: AGPL-3.0-or-later
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { installCapture } from './capture-browser.mjs';
const out=resolve('captures/trailer'),base='http://127.0.0.1:5489';
const report={errors:[],receipts:[]};
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--auto-select-tab-capture-source-by-title=SDS Film Capture','--autoplay-policy=no-user-gesture-required']});
try {
 for(const [label,width,height,debug] of [['desktop',1920,1080,''],['phone',390,844,''],['webgl',1920,1080,'webgl']]) {
  const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,acceptDownloads:true});
  await context.route('**/api/**',r=>r.fulfill({status:503,body:'{}'}));
  await context.addInitScript(installCapture);
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
  await page.goto(`${base}/?seed=20260821&debug=${debug}`);
  await page.locator('.herd-app[data-ready="true"]').waitFor({timeout:90000});
  await page.evaluate(()=>{document.title='SDS Film Capture';});
  await page.locator('.herd-size').filter({hasText:'200'}).click();
  await page.getByRole('button',{name:'Customize',exact:true}).click();await page.waitForTimeout(1800);
  report.receipts.push({label,scene:await page.evaluate(()=>__trailer.find())});
  await page.screenshot({path:join(out,`eyes-${label}.png`)});
  if(label==='desktop' && !process.argv.includes('--checks-only')) {
   const take=async(name,action)=>{
    const download=page.waitForEvent('download',{timeout:90000});
    await page.evaluate(name=>__trailer.start(name,true),name);await action();
    const timing=await page.evaluate(()=>__trailer.stop());await(await download).saveAs(join(out,`${name}.webm`));
    report.receipts.push({name,timing});
   };
   await take('customize-dog-soft',async()=>{
    await page.waitForTimeout(1500);await page.getByRole('radio',{name:/Blue Merle/}).click();await page.waitForTimeout(2000);
    await page.getByRole('radio',{name:/Golden Wheaten/}).click();await page.waitForTimeout(2000);
    await page.getByRole('radio',{name:/Classic Black/}).click();await page.waitForTimeout(1500);
   });
   await page.screenshot({path:join(out,'deliverables/stills/06-customize-your-dog.png')});
   await page.getByRole('tab',{name:'Flock Breeds',exact:true}).click();await page.mouse.move(1900,1000);await page.waitForTimeout(1500);
   await take('customize-flock-200',async()=>{
    const choices=page.locator('[aria-label="Flock breed varieties"] button');
    await page.waitForTimeout(1600);await choices.nth(1).click();await page.waitForTimeout(2200);
    await choices.nth(3).click();await page.waitForTimeout(2200);
   });
   await page.screenshot({path:join(out,'deliverables/stills/07-flock-customization.png')});
  }
  await page.getByRole('button',{name:'Close customization studio',exact:true}).click();
  await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForTimeout(500);
  await page.evaluate(()=>__trailer.find());
  await page.keyboard.down('KeyW');await page.waitForTimeout(900);
  const run=await page.evaluate(()=>__trailer.sim.state.dogs[0].velocity.magnitude());
  await page.keyboard.down('KeyE');await page.waitForTimeout(900);
  const walk=await page.evaluate(()=>__trailer.sim.state.dogs[0].velocity.magnitude());
  await page.screenshot({path:join(out,`walk-${label}.png`)});
  await page.keyboard.up('KeyE');await page.waitForTimeout(900);
  const resumed=await page.evaluate(()=>__trailer.sim.state.dogs[0].velocity.magnitude());
  await page.keyboard.up('KeyW');
  report.receipts.push({label,run,walk,resumed});
  if(Math.abs(walk/run-.3)>.05||resumed/run<.95)throw new Error('Walking pace failed');
  await page.keyboard.press('KeyC');await page.waitForTimeout(1200);
  await page.screenshot({path:join(out,`follow-${label}.png`)});
  await context.close();
 }
}finally{writeFileSync(join(out,'studio-report.json'),JSON.stringify(report,null,2));await browser.close();}
