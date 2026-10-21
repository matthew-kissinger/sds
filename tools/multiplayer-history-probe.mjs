// SPDX-License-Identifier: AGPL-3.0-or-later
// Production assets + disposable local services: npm run build, then
// node tools/coop-local.mjs --production-assets. No production writes or game hooks.
import { launchBrowser } from './probe-lib.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='http://localhost:5198', output='captures/multiplayer/history';
await mkdir(output,{recursive:true});
const browser=await launchBrowser(undefined,['--disable-background-timer-throttling','--disable-renderer-backgrounding']);
const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:1280,height:900}})));
const [host,guest]=await Promise.all(contexts.map(c=>c.newPage()));
const errors=[];
for(const c of contexts){await c.route('**/*cloudflareinsights.com/**',r=>r.abort());c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));}
for(const p of [host,guest])p.on('pageerror',e=>errors.push(e.message));
async function ready(p){await p.waitForFunction(()=>document.querySelector('.herd-app')?.dataset.ready==='true',{}, {timeout:90000});}
async function capture(p,name){
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflows horizontally');
  await p.screenshot({path:`${output}/${name}.png`,fullPage:true});
}
try{
  await host.goto(origin);await ready(host);
  await host.getByRole('button',{name:'Play multiplayer',exact:true}).click();
  await host.getByRole('button',{name:'Your multiplayer stats',exact:true}).click();
  await host.getByText('No recorded matches yet.',{exact:false}).waitFor();
  await capture(host,'player-empty');await host.getByRole('button',{name:'Back to multiplayer'}).click();
  await host.getByLabel(/^Mode/).selectOption('competitive');
  await host.getByRole('button',{name:'Create room',exact:true}).click();
  await host.getByRole('button',{name:'Start competitive',exact:true}).waitFor();
  await guest.goto(await host.getByLabel('Invite link',{exact:true}).inputValue());await ready(guest);
  await guest.getByRole('button',{name:'Join room',exact:true}).click();
  await guest.getByRole('button',{name:'Ready',exact:true}).click();
  await host.getByRole('button',{name:'Ready',exact:true}).click();
  await host.getByRole('button',{name:'Start competitive',exact:true}).click();
  for(const p of [host,guest])await p.waitForFunction(()=>document.querySelector('.herd-app')?.dataset.phase==='playing');
  await guest.keyboard.press('Escape');await guest.getByRole('button',{name:'Forfeit and leave',exact:true}).click();
  await host.getByRole('heading',{name:'Round finished',exact:true}).waitFor();
  // Let the normal DO alarm export the result; no direct database seeding.
  await host.waitForTimeout(6500);
  await host.getByRole('button',{name:'Your multiplayer stats',exact:true}).click();
  await host.locator('.history-matches').getByText('Win by forfeit',{exact:false}).waitFor();
  await capture(host,'player-desktop');await host.setViewportSize({width:390,height:844});
  await capture(host,'player-mobile');
  await host.locator('.history-matches').scrollIntoViewIfNeeded();await capture(host,'player-mobile-match');
  await host.keyboard.press('Escape');assert.equal(await host.getByRole('heading',{name:'Your multiplayer stats'}).count(),0);
  await host.getByRole('button',{name:'Leave room',exact:true}).click();
  const owner=await contexts[0].newPage();await owner.goto(origin+'/r/owner');
  await owner.getByLabel('Owner key',{exact:true}).waitFor();assert.equal(await owner.locator('canvas').count(),0);
  await owner.getByLabel('Owner key',{exact:true}).fill('incorrect');await owner.getByRole('button',{name:'Open dashboard'}).click();
  await owner.getByText('Access was not accepted. Try again.').waitFor();
  await owner.getByLabel('Owner key',{exact:true}).fill('local-owner-key-for-development-only');
  await owner.getByRole('button',{name:'Open dashboard'}).click();
  await owner.getByRole('heading',{name:'NA · Competitive'}).waitFor();
  await capture(owner,'owner-desktop');await owner.setViewportSize({width:390,height:844});await capture(owner,'owner-mobile');
  await owner.getByRole('heading',{name:'Recent rounds'}).scrollIntoViewIfNeeded();await capture(owner,'owner-mobile-matches');
  await owner.getByRole('button',{name:'Lock dashboard'}).click();assert.equal(await owner.getByLabel('Owner key',{exact:true}).inputValue(),'');
  await capture(owner,'owner-mobile-locked');await owner.reload();await owner.getByLabel('Owner key',{exact:true}).waitFor();
  assert.equal(await owner.getByLabel('Owner key',{exact:true}).inputValue(),'');
  assert(!(await owner.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).includes('local-owner-key-for-development-only'));
  assert.deepEqual(errors,[]);
  await writeFile(`${output}/receipt.json`,JSON.stringify({origin,productionAssets:true,functionalOnly:true,errors,checks:['real two-player start and forfeit','alarm-driven persisted result','player empty/populated history','desktop and mobile composition','owner auth rejected/accepted','owner has no canvas','lock/reload clears owner key','key absent from web storage','Escape returns from history']},null,2));
  console.log('PASS: persisted match history and owner dashboard');
}catch(error){for(const [i,p]of[host,guest].entries())await p.screenshot({path:`${output}/failure-${i}.png`}).catch(()=>{});throw error;}
finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();}
