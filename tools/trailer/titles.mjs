// SPDX-License-Identifier: AGPL-3.0-or-later
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
const out = resolve('captures/trailer/titles');
mkdirSync(out, { recursive: true });
const font = readFileSync('app/public/fonts/Alice-Regular.ttf').toString('base64');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const base = `@font-face{font-family:Alice;src:url(data:font/ttf;base64,${font})}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent}body{font-family:Alice;color:#f8f0de}.caption{position:absolute;left:72px;bottom:64px;font-size:80px;text-shadow:0 2px 12px #1c271dcc,0 1px 3px #1c271d}.shade{position:absolute;inset:65% 0 0;background:linear-gradient(transparent,rgba(22,35,21,.42))}.end{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(241,234,217,.94);color:#352e22}.eyebrow{font-family:Arial;font-size:23px;letter-spacing:7px}.name{font-size:168px;margin:38px 0 18px;line-height:1.1}.tag{font-size:64px;margin:0}.rule{width:90px;height:2px;background:#9b8c65;margin:40px 0}.url{font-size:80px}.frame{position:absolute;inset:50px;border:1px solid #9b8c6555;pointer-events:none}`;
  const titles = [
    ['hook', '<div class="shade"></div><div class="caption">Be a sheepdog.</div>'],
    ['sizes', '<div class="shade"></div><div class="caption">Herd sheep.</div>'],
    ['goal', '<div class="shade"></div><div class="caption">Bring them home.</div>'],
    ['gate', '<div class="shade"></div><div class="caption">Get to know your flock.</div>'],
    ['home', '<div class="shade"></div><div class="caption">Every sheep in.</div>'],
    ['end', '<div class="end"><div class="eyebrow">ONE FIELD. ONE DOG.</div><div class="name">Sheepdog Sim</div><p class="tag">Play free in your browser</p><div class="rule"></div><div class="url">sheepdogsim.com</div></div><div class="frame"></div>'],
  ];
  for (const [name, html] of titles) {
    await page.setContent(`<html><head><style>${base}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(out, `${name}.png`), omitBackground: true });
  }
} finally { await browser.close(); }
