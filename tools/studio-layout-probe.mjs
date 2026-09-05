// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { launchBrowser, repo } from './probe-lib.mjs';
const label = process.argv.find(x => x.startsWith('--label='))?.slice(8) ?? 'studio-layout';
const backend = process.argv.includes('--webgpu') ? 'webgpu' : 'webgl2';
const out = join(repo, 'captures', label);
mkdirSync(out, { recursive: true });
const browser = await launchBrowser();
const report = [];
try {
  for (const [width, height] of [[390, 844], [844, 390], [320, 568], [667,375], [768,1024], [1440, 900]]) {
    if (process.argv.includes('--naming-only') && width !== 320 && width !== 844) continue;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 900 });
    await context.route('**/api/**', route => route.fulfill({ status: 503, body: '{}' }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:5330/${backend === 'webgl2' ? '?debug=webgl' : ''}`);
    await page.locator('.herd-app[data-ready="true"]').waitFor({ state: 'attached', timeout: 90000 });
    assert.equal(await page.locator('.herd-app').getAttribute('data-backend'), backend);
    await page.getByRole('button', { name: 'Customize', exact: true }).click();
    await page.waitForTimeout(2200);
    await page.getByRole('textbox', { name: 'Working sheepdog name' }).fill('A long friendly dog name');
    if (width === 390) {
      for (const angle of ['profile','front','rear','top','face','hero']) {
        await page.getByRole('combobox', { name:'Camera angle',exact:true }).selectOption(angle);
        await page.waitForTimeout(1000);
        await page.screenshot({ path: join(out, `${width}-${angle}.png`) });
      }
    }
    for (const [tab, name] of [['dog', 'Sheepdog'], ['flock', 'Flock Breeds'], ['sheep', 'Sheep Registry']]) {
      await page.getByRole('tab', { name, exact: true }).click();
      await page.waitForTimeout(1800);
      await page.screenshot({ path: join(out, `${width}-${tab}.png`) });
      const layout = await page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; };
        const overflow = [...document.querySelectorAll('.herd-customize-hud button, .herd-customize-hud select, .herd-customize-dock input, .herd-customize-dock button')].filter(node => {
          const r = node.getBoundingClientRect();
          const dock = node.closest('.herd-customize-dock')?.getBoundingClientRect();
          if (node.closest('.herd-batch-pages')) return false;
          return r.width && r.height && (r.left < (dock?.left ?? 0) - 1 || r.right > (dock?.right ?? innerWidth) + 1);
        }).map(node => node.getAttribute('aria-label') || node.textContent);
        return { dock: rect('.herd-customize-dock'), preview: rect('.herd-customize-drag-zone'), overflow };
      });
      report.push({ width,height,tab,layout,errors:[...errors] });
      assert.deepEqual(layout.overflow, [], `${width} ${tab} horizontal overflow`);
      assert.deepEqual(errors, []);
    }
    const sheepName = page.getByRole('textbox', { name: 'Name for sheep #1', exact:true });
    await sheepName.fill('Friendly sheep');
    await page.getByRole('tab', {name:'Sheepdog',exact:true}).click();
    assert.equal(await page.getByRole('textbox',{name:'Working sheepdog name'}).inputValue(),'A long friendly dog name');
    if (width === 390 || width === 844) {
      // Emulate the visual-viewport resize contract, not physical keyboard ergonomics.
      const keyboardHeight = Math.round(height * 0.6);
      await page.evaluate(visibleHeight => {
        Object.defineProperty(window.visualViewport, 'height', { configurable:true, get:()=>visibleHeight });
        window.visualViewport.dispatchEvent(new Event('resize'));
      }, keyboardHeight);
      await page.waitForTimeout(300);
      const input = page.getByRole('textbox',{name:'Working sheepdog name'});
      await input.scrollIntoViewIfNeeded();
      const inputBox = await input.boundingBox();
      assert.ok(inputBox && inputBox.y >= 0 && inputBox.y + inputBox.height <= keyboardHeight);
      await page.screenshot({path:join(out,`${width}-keyboard-viewport.png`)});
      await page.evaluate(() => {
        Reflect.deleteProperty(window.visualViewport,'height');
        window.visualViewport.dispatchEvent(new Event('resize'));
      });
    }
    if (width === 390) {
      await page.setViewportSize({ width:844,height:390 });
      await page.waitForTimeout(1500);
      assert.equal(await page.locator('.herd-studio').getAttribute('data-bottom'),'false');
      await page.screenshot({path:join(out,'rotated-landscape.png')});
    }
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', {name:'Studio',exact:true}).waitFor({state:'hidden'});
    await page.waitForTimeout(100);
    assert.equal(await page.getByRole('button',{name:'Customize',exact:true}).evaluate(node=>node===document.activeElement),true);
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report.map(x => ({ width:x.width,tab:x.tab,overflow:x.layout.overflow,errors:x.errors }))));
