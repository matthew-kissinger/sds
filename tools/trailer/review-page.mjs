// SPDX-License-Identifier: AGPL-3.0-or-later
import { writeFileSync, mkdirSync, copyFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
const root = resolve('captures/trailer');
const out = join(root, 'deliverables');
mkdirSync(join(out, 'stills'), { recursive: true });
const ffmpeg = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
ffmpeg(['-ss','3','-i',join(root,'offline-split.mp4'),'-frames:v','1',join(out,'stills','v3-into-the-flock.png')]);
ffmpeg(['-ss','4.3','-i',join(root,'offline-split.mp4'),'-frames:v','1',join(out,'stills','v3-across-the-field.png')]);
ffmpeg(['-ss','1.8','-i',join(root,'offline-details.mp4'),'-frames:v','1',join(out,'stills','v3-meet-your-flock.png')]);
ffmpeg(['-ss','2.5','-i',join(root,'offline-gate.mp4'),'-vf','crop=1440:810:240:20','-frames:v','1',join(out,'stills','v3-bringing-them-home.png')]);
copyFileSync(join(root,'offline-dog.png'),join(out,'stills','06-customize-your-dog.png'));
copyFileSync(join(root,'offline-flock.png'),join(out,'stills','07-flock-customization.png'));
const brief = join(root, 'distribution-brief.md');
if (existsSync(brief)) copyFileSync(brief, join(out, 'DISTRIBUTION-BRIEF.md'));
const images = [
 ['v3-into-the-flock','Into the flock','A full-speed pass through the flock'],
 ['v3-across-the-field','Across the field','Sheep spreading after the dog passes'],
 ['v3-meet-your-flock','Meet your flock','A closer look at the sheep and their names'],
 ['06-customize-your-dog','Your sheepdog','Choose a coat for your sheepdog'],
 ['07-flock-customization','Choose your flock','The larger flock in the customization screen'],
 ['v3-bringing-them-home','Bringing them home','A real herding run through the gate'],
];
for (const [id] of images) {
  ffmpeg(['-i', join(out, 'stills', `${id}.png`), '-frames:v', '1', '-q:v', '2', join(out, 'stills', `${id}.jpg`)]);
  ffmpeg(['-i', join(out, 'stills', `${id}.png`), '-vf', 'scale=640:-2', '-frames:v', '1', '-q:v', '3', join(out, 'stills', `${id}-preview.jpg`)]);
}
copyFileSync(join(out, 'stills', 'v3-into-the-flock.jpg'), join(out, 'thumbnail-v3.jpg'));
const credits = {
 'A-bossa': '“Bossa Antigua” by Kevin MacLeod — https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700069 — CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Excerpt edited and faded for this trailer.',
 'B-playful': '“Carefree” by Kevin MacLeod — https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400037 — CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Excerpt edited and faded for this trailer.',
 'C-bossa-piano': '“BossaBossa” by Kevin MacLeod — https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600055 — CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Excerpt edited and faded for this trailer.',
};
const release = JSON.parse(readFileSync(join(root, 'offline-herding-report.json'))).release.commit;
writeFileSync(join(out, 'POSTING-NOTES.md'), '# Sheepdog Sim launch media\n\nSelected: piano bossa (C), 42.5-second trailer. The 15-second teaser uses the same track.\n\nAll new shots fill 1920 x 1080 and are rendered frame by frame at 60 fixed steps per second through the normal application. This is gameplay footage, not a live performance benchmark. Recorded game ambience and effects are restored beneath the music, with that layer faded out by 39.5 seconds. The completed herd leads directly to the closing card.\n\nSee DISTRIBUTION-BRIEF.md for the original drafts folder, current venues, media recommendations and a rebuild-story outline to rewrite in your own voice.\n\nPlay: https://sheepdogsim.com\nSource: https://github.com/matthew-kissinger/sds\n\n## Music credits\n\n' + Object.entries(credits).map(([id, credit]) => id + '\n\n' + credit).join('\n\n') + '\n');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sheepdog Sim · Launch film</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f2edde;color:#332d22;font:16px/1.5 system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:48px 28px 80px}header{margin-bottom:24px}small,.sub{color:#746b58}h1,h2,h3{font-family:Georgia,serif;font-weight:400;line-height:1.15}h1{font-size:48px;margin:8px 0}h2{font-size:30px;margin-top:44px}.eyebrow{text-transform:uppercase;font-size:12px;letter-spacing:3px}video{display:block;width:100%;aspect-ratio:16/9;background:#242a22;border-radius:8px}nav{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}button,.download{cursor:pointer;padding:12px 18px;border:1px solid #b7ad96;border-radius:6px;background:transparent;color:inherit;font:inherit}button[aria-pressed=true]{background:#46583c;color:#fff;border-color:#46583c}button:focus-visible,a:focus-visible{outline:3px solid #91763d;outline-offset:3px}.download{display:inline-block;text-decoration:none;background:#e6ddc8}#credit{font-size:13px;overflow-wrap:anywhere;max-width:950px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.card img{width:100%;display:block;border-radius:6px}.card h3{font-size:24px;margin:12px 0 3px}.card a{color:#46583c}.card p{font-size:13px;margin:5px 0}footer{margin-top:40px;border-top:1px solid #cfc4ac;padding-top:20px;font-size:13px}a{color:#46583c}.tools{display:flex;gap:16px;flex-wrap:wrap;margin-top:16px}@media(max-width:600px){main{padding:24px 16px}h1{font-size:34px}.grid{grid-template-columns:1fr}button{padding:10px 12px;font-size:14px}}</style>
<main><header><div class="eyebrow">Sheepdog Sim · Launch media</div><h1>A little time in the field.</h1><p class="sub">Piano bossa with game sounds · A calmer ending after the herd comes home.</p></header>
<video id="film" controls playsinline preload="metadata" poster="thumbnail-v3.jpg" src="sheepdog-sim-v4-C-bossa-piano.mp4"></video>
<nav aria-label="Music direction"><button data-cut="A-bossa" aria-pressed="false">A · Relaxed guitar bossa</button><button data-cut="B-playful" aria-pressed="false">B · Playful acoustic</button><button data-cut="C-bossa-piano" aria-pressed="true">C · Piano bossa</button><button data-cut="silent" aria-pressed="false">Silent</button></nav>
<a id="download" class="download" href="sheepdog-sim-v4-C-bossa-piano.mp4" download>Download this cut</a><a class="download" href="sheepdog-sim-v4-teaser-15s.mp4" download>15-second teaser · piano bossa</a><p id="credit"></p>
<p class="sub">42.5 seconds · 1080p / 60 fps · Frame-by-frame gameplay capture.<br>Real controls and simulation, cinematic cameras, and a completed herding run.</p>
<p><a href="https://sheepdogsim.com" target="_blank">Play the updated game · Hold E to walk</a></p><h2>Images for your post</h2><div class="grid">${images.map(([id, name, detail]) => `<article class="card"><a href="stills/${id}.png" target="_blank"><img loading="lazy" src="stills/${id}-preview.jpg" alt="${name}"></a><h3>${name}</h3><p>${detail}</p><p><a download href="stills/${id}.jpg">Download JPEG</a> · <a download href="stills/${id}.png">Original PNG</a></p></article>`).join('')}</div>
<footer><a href="DISTRIBUTION-BRIEF.md" download>Original drafts, communities and posting plan</a> · <a href="POSTING-NOTES.md" download>Media notes and music credits</a><p>Music is licensed under CC BY 4.0. Include the selected track's credit with your post. Piano bossa is the selected music direction. The other cuts remain available for comparison.</p></footer></main>
<script>const credits=${JSON.stringify(credits)};const film=document.querySelector('#film'),credit=document.querySelector('#credit'),download=document.querySelector('#download');credit.textContent=credits['C-bossa-piano'];document.querySelectorAll('[data-cut]').forEach(button=>button.onclick=()=>{const time=film.currentTime,playing=!film.paused;document.querySelectorAll('[data-cut]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));film.src='sheepdog-sim-v4-'+button.dataset.cut+'.mp4';film.addEventListener('loadedmetadata',()=>{film.currentTime=Math.min(time,film.duration);if(playing)film.play().catch(()=>{})},{once:true});download.href=film.getAttribute('src');credit.textContent=credits[button.dataset.cut]||'No added music.';});</script></html>`;
writeFileSync(join(out, 'index.html'), html);
