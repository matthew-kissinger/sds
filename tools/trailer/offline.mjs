// SPDX-License-Identifier: AGPL-3.0-or-later
// Export every rendered frame. Only presentation clocks change; normal input
// and the application's fixed-step simulation still own gameplay.
import { spawn } from 'node:child_process';
import { once } from 'node:events';

export async function freeze(page) {
  return page.evaluate(() => {
    const a = __trailer; a.find();
    const sourceStore = a.store;
    const state = sourceStore.getState().get(), gl = state.gl;
    a.store = { getState: state.get, setState: state.set };
    if (!gl.backend.isWebGPUBackend || !gl._animation || !gl._nodes?.nodeFrame) throw new Error('Unsupported offline renderer');
    state.setFrameloop('never');
    state.internal.frames = 0;
    gl._animation.stop();
    a.offlineTime = 0;
    a.offlineFrame = 0;
    a.releaseOfflineLoop = sourceStore.subscribe(s => {
      if (s.frameloop !== 'never') {
        s.clock.stop(); s.clock.elapsedTime = a.offlineTime;
        s.internal.frames = 0;
        s.set({ frameloop: 'never' });
      }
    });
    a.nodeTimeOrigin = gl._nodes.nodeFrame.time;
    a.offlineStep = async (render = true) => {
      const state = a.store.getState(), gl = state.gl, nodes = gl._nodes.nodeFrame;
      if (state.frameloop !== 'never') throw new Error('Live animation restarted during offline capture');
      const previous = state.clock.elapsedTime;
      a.offlineTime = ++a.offlineFrame / 60;
      nodes.frameId++;
      nodes.deltaTime = a.offlineTime - previous;
      nodes.time = a.nodeTimeOrigin + a.offlineTime;
      if (gl.info.autoReset) gl.info.reset();
      gl.info.frame = nodes.frameId;
      const subscribers = state.internal.subscribers;
      const suppressed = render ? [] : subscribers.filter(s => s.priority > 0).map(s => [s, s.ref.current]);
      for (const [s] of suppressed) s.ref.current = () => {};
      try { state.advance(a.offlineTime, true); }
      catch(error) { throw new Error(`${error.message}; frame=${a.offlineFrame}, clock=${previous}, time=${a.offlineTime}, camera=${state.camera.position.toArray()}, tick=${a.sim.state.tick}`); }
      finally { for (const [s, callback] of suppressed) s.ref.current = callback; }
      if (render) await gl.backend.device.queue.onSubmittedWorkDone();
      return { frame: a.offlineFrame, seconds: a.offlineTime, tick: a.sim.state.tick, penned: a.sim.pennedCount, completed: a.sim.completed,
        hover: document.getElementById('herd-nameplate-title')?.textContent };
    };
    return { webgpu: true, size: state.size, tick: a.sim.state.tick, frameloop: a.store.getState().frameloop };
  });
}

export async function advance(page, frames, render = true) {
  return page.evaluate(async ({ frames, render }) => {
    let result;
    for (let i = 0; i < frames; i++) result = await __trailer.offlineStep(render);
    return result;
  }, { frames, render });
}

export async function record(page, file, frames, beforeFrame) {
  const encoder = spawn('ffmpeg', ['-hide_banner','-loglevel','error','-y',
    '-f','image2pipe','-framerate','60','-vcodec','mjpeg','-i','pipe:0',
    '-f','lavfi','-i','anullsrc=r=48000:cl=stereo',
    '-c:v','libx264','-threads','2','-preset','fast','-crf','16','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','192k','-t',String(frames/60),'-movflags','+faststart',file],
    { stdio:['pipe','inherit','inherit'] });
  const completion = once(encoder,'exit');
  const start = Date.now(); const samples=[];
  try {
    for (let i=0;i<frames;i++) {
      if (beforeFrame) await beforeFrame(i);
      const state = await advance(page,1);
      const bytes = await page.screenshot({type:'jpeg',quality:97,animations:'allow'});
      if (!encoder.stdin.write(bytes)) await once(encoder.stdin,'drain');
      if (i%60===0) { samples.push(state); console.log(`${file}: ${i}/${frames}`); }
    }
  } finally { encoder.stdin.end(); }
  const [code] = await completion;
  if (code !== 0) throw new Error(`Frame encoder exited ${code}`);
  return { frames, fps:60, seconds:frames/60, wallSeconds:(Date.now()-start)/1000, samples, gameAudio:'silent; music mixed later' };
}
