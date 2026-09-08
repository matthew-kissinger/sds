// SPDX-License-Identifier: AGPL-3.0-or-later
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { installCapture } from './capture-browser.mjs';
import { freeze, advance, record } from './offline.mjs';
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--autoplay-policy=no-user-gesture-required']});
try {
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 await context.route('**/api/**',r=>r.fulfill({status:503,body:'{}'}));
 await context.addInitScript(installCapture);
 const page=await context.newPage();
 await page.goto('http://127.0.0.1:5489/?seed=20260821');
 await page.locator('.herd-app[data-ready="true"]').waitFor({timeout:90000});
 await page.locator('.herd-size').filter({hasText:'200'}).click();
 await page.getByRole('button',{name:'Customize',exact:true}).click();
 await page.waitForTimeout(1200);
 console.log(await freeze(page));
 await advance(page,60);
 const report=await record(page,'captures/trailer/offline-probe.mp4',120,async i=>{
  if(i===60)await page.getByRole('radio',{name:/Blue Merle/}).click();
 });
 await page.screenshot({path:'captures/trailer/offline-probe.png'});
 writeFileSync('captures/trailer/offline-probe.json',JSON.stringify(report,null,2));
}finally{await browser.close();}
