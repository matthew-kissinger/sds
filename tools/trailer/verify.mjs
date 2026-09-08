// SPDX-License-Identifier: AGPL-3.0-or-later
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root = resolve('captures/trailer');
const results = { media: [], pages: [], sourceTiming: [], errors: [] };
for (const id of ['A-bossa', 'B-playful', 'C-bossa-piano', 'silent', 'teaser-15s']) {
  const file = join(root, 'deliverables', `sheepdog-sim-v3-${id}.mp4`);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const video = probe.streams.find(s => s.codec_type === 'video');
  const duration = id === 'teaser-15s' ? 15 : 42.5;
  if (video.width !== 1920 || video.height !== 1080 || video.r_frame_rate !== '60/1' || Math.abs(Number(video.duration) - duration) > 0.12) throw new Error(`Invalid export ${id}`);
  if (id !== 'silent' && !probe.streams.some(s => s.codec_name === 'aac')) throw new Error(`Missing AAC ${id}`);
  results.media.push({ id, width: video.width, height: video.height, fps: video.r_frame_rate, duration: video.duration, bytes: Number(probe.format.size) });
}
const cuts = JSON.parse(readFileSync(join(root, 'edit-decision-list.json'))).cuts;
const timestamps = new Map();
for (const cut of cuts) {
  if (!timestamps.has(cut.take)) {
    // Decode presentation timestamps: H.264 packet order includes reordered B frames.
    const data = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'csv=p=0', join(root, `${cut.take}.mp4`)], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    timestamps.set(cut.take, data.trim().split(/\r?\n/).map(parseFloat).filter(Number.isFinite));
  }
  const pts = timestamps.get(cut.take).filter(t => t >= cut.start && t < cut.start + cut.duration);
  if (pts.length < 2) throw new Error('Missing source timing: ' + cut.take);
  const gaps = pts.slice(1).map((t, i) => (t - pts[i]) * 1000).sort((a,b) => a-b);
  if (pts.length !== Math.round(cut.duration * 60) || gaps.some(g => Math.abs(g - 1000 / 60) > 0.002)) throw new Error('Nonuniform offline source timing: ' + cut.take);
  results.sourceTiming.push({ take: cut.take, start: cut.start, samples: pts.length, p95Ms: gaps[Math.floor(gaps.length * .95)], maxMs: gaps.at(-1), gapsOver50ms: gaps.filter(g => g > 50).length });
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => results.errors.push(String(e)));
  await page.goto('http://127.0.0.1:5488');
  await page.locator('video').evaluate(v => new Promise(resolve => { if (v.readyState >= 1) resolve(); else v.addEventListener('loadedmetadata', resolve, { once: true }); }));
  await page.locator('video').evaluate(v => { v.muted = true; v.currentTime = 17.7; return v.play(); });
  await page.waitForTimeout(2500);
  results.pages.push(await page.locator('video').evaluate(v => ({ viewport: 'desktop', currentTime: v.currentTime, videoWidth: v.videoWidth, videoHeight: v.videoHeight, playback: v.getVideoPlaybackQuality().toJSON?.() ?? { total: v.getVideoPlaybackQuality().totalVideoFrames, dropped: v.getVideoPlaybackQuality().droppedVideoFrames } })));
  await page.locator('video').evaluate(v => v.pause());
  for (const time of [2,7,12,16,19,24,29,34,39]) {
    await page.locator('video').evaluate((v,time) => new Promise(resolve => { v.addEventListener('seeked', resolve, { once:true }); v.currentTime=time; }), time);
    const frame = await page.locator('video').evaluate(v => ({ time:v.currentTime, width:v.videoWidth, height:v.videoHeight }));
    results.pages.push(frame);
    if (frame.width !== 1920 || frame.height !== 1080) throw new Error('Changing output dimensions: ' + JSON.stringify(frame));
  }
  await page.locator('video').evaluate(v => { v.currentTime = 20; });
  await page.waitForTimeout(200);

  await page.screenshot({ path: join(root, 'review-desktop.png') });
  for (const cut of ['B-playful', 'C-bossa-piano', 'silent']) {
    await page.locator(`[data-cut="${cut}"]`).click();
    await page.waitForFunction(cut => { const v = document.querySelector('video'); return v.currentSrc.endsWith(`sheepdog-sim-v3-${cut}.mp4`) && v.readyState >= 2 && v.currentTime > 19; }, cut);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('video').evaluate(v => { v.currentTime = 30; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(root, 'review-phone.png') });
  results.pages.push(await page.evaluate(() => ({ viewport: 'phone', overflow: document.documentElement.scrollWidth > innerWidth })));
  if (results.pages.at(-1).overflow || results.errors.length) throw new Error('Review page failed');
} finally { await browser.close(); writeFileSync(join(root, 'verification.json'), JSON.stringify(results, null, 2)); }
console.log(JSON.stringify(results));
