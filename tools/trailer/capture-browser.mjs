// SPDX-License-Identifier: AGPL-3.0-or-later
// Local filmmaking instrumentation only. Never imported into the application.
export function installCapture() {
  const roots = new Map(); let rendererId = 0;
  globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, inject: () => ++rendererId,
    onCommitFiberRoot: (id, root) => roots.set(id, root), onCommitFiberUnmount() {},
  };
  const streams = [];
  const taps = new WeakMap();
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...args) {
    const tap = taps.get(target);
    if (tap) connect.call(this, tap);
    return connect.call(this, target, ...args);
  };
  const NativeAudioContext = globalThis.AudioContext;
  globalThis.AudioContext = new Proxy(NativeAudioContext, {
    construct(Target, args) {
      const context = Reflect.construct(Target, args);
      const destination = context.createMediaStreamDestination();
      taps.set(context.destination, destination);
      streams.push(destination.stream);
      return context;
    },
  });
  localStorage.setItem('herd.settings.v1', JSON.stringify({ quality: 'high' }));
  const api = globalThis.__trailer = {
    find() {
      let sim, store;
      for (const root of roots.values()) {
        const stack = [root.current];
        while (stack.length) {
          const fiber = stack.pop();
          const check = value => {
            if (value?.state?.sheep && value?.dogPositions) sim = value;
            if (typeof value?.getState === 'function' && value.getState()?.camera) store = value;
          };
          check(fiber.memoizedProps?.value);
          for (let hook = fiber.memoizedState; hook; hook = hook.next) check(hook.memoizedState);
          if (fiber.child) stack.push(fiber.child);
          if (fiber.sibling) stack.push(fiber.sibling);
        }
      }
      if (!sim || !store) throw new Error(`Capture references missing: sim=${!!sim} store=${!!store}`);
      api.sim = sim; api.store = store;
      return { sheep: sim.state.sheep.length, webgpu: store.getState().gl.backend.isWebGPUBackend === true,
        dog: sim.state.dogs[0].position, camera: store.getState().camera.position.toArray() };
    },
    async start(name, tab = false) {
      const canvas = document.querySelector('canvas');
      const stream = tab ? await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 60, width: 1920, height: 1080, displaySurface: 'browser' },
        audio: false, preferCurrentTab: true, selfBrowserSurface: 'include',
      }) : canvas.captureStream(60);
      api.captureSettings = stream.getVideoTracks()[0].getSettings();
      for (const audio of streams) for (const track of audio.getAudioTracks()) stream.addTrack(track.clone());
      const mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) throw new Error('VP9/Opus unsupported');
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 26000000, audioBitsPerSecond: 192000 });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const anchor = document.createElement('a');
        anchor.href = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
        anchor.download = `${name}.webm`; anchor.click();
        setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
        for (const track of stream.getTracks()) track.stop();
      };
      api.gaps = []; api.lastFrame = performance.now();
      let active = true;
      const frame = now => {
        api.gaps.push(now - api.lastFrame); api.lastFrame = now;
        if (active) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      recorder.start(1000);
      api.stop = () => { active = false; recorder.stop(); return { frames: api.gaps.length, gaps: api.gaps }; };
    },
    cinema(config) {
      api.unseat?.();
      api.restoreRig?.(); delete api.restoreRig;
      if (!config) return;
      if (config.exclusive) {
        const rig = api.store.getState().internal.subscribers.find(s => s.ref.current.toString().includes('.classic.update'));
        if (!rig) throw new Error('Camera subscription not found');
        const callback = rig.ref.current; rig.ref.current = () => {};
        api.restoreRig = () => { rig.ref.current = callback; };
      }
      const now = () => api.offlineTime === undefined ? performance.now() : api.offlineTime * 1000;
      const began = now();
      const callback = { current: ({ camera }) => {
        const t = Math.min(1, (now() - began) / (config.seconds * 1000));
        const smooth = t * t * (3 - 2 * t);
        const pos = config.from.map((v, i) => v + (config.to[i] - v) * smooth);
        const aim = [...config.aim];
        if (config.sheepIndex !== undefined) {
          const s = api.sim.state.sheep[config.sheepIndex].position;
          pos[0] += s.x;pos[2] += s.z;aim[0] += s.x;aim[2] += s.z;
        }
        if (config.centerOn === 'flock') {
          const sheep = api.sim.state.sheep;
          const x = sheep.reduce((sum, s) => sum + s.position.x, 0) / sheep.length;
          const z = sheep.reduce((sum, s) => sum + s.position.z, 0) / sheep.length;
          pos[0] += x; pos[2] += z; aim[0] += x; aim[2] += z;
        }
        camera.position.set(...pos); camera.lookAt(...aim);
        camera.fov = config.fov ?? 45; camera.updateProjectionMatrix();
      } };
      // After all scene/camera systems (0), before the existing renderer (1).
      api.unseat = api.store.getState().internal.subscribe(callback, config.exclusive ? -0.5 : 0.5, api.store);
    },
    drive(follow = false) {
      const config = { ...globalThis.herdingDriver.DEFAULT_DRIVER, arcRadius: 14, maxSpread: 16 };
      const drive = globalThis.herdingDriver.createHerdingDriver(config);
      let input = { direction: { x: 0, z: 0 }, sprint: false };
      const forward = api.store.getState().camera.position.clone();
      api.driveTimer = setInterval(() => { input = drive(api.sim.state); }, 100);
      const native = navigator.getGamepads.bind(navigator);
      navigator.getGamepads = () => {
        let fx = 0, fz = 1;
        if (follow) {
          api.store.getState().camera.getWorldDirection(forward);
          const len = Math.hypot(forward.x, forward.z);
          fx = forward.x / len; fz = forward.z / len;
        }
        const right = -fz * input.direction.x + fx * input.direction.z;
        const front = fx * input.direction.x + fz * input.direction.z;
        return [{ connected: true, mapping: 'standard', axes: [right, -front],
          buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 7 && input.sprint, value: i === 7 && input.sprint ? 1 : 0 })) }];
      };
      api.stopDrive = () => { clearInterval(api.driveTimer); navigator.getGamepads = native; };
    },
    playSmooth() {
      const player = globalThis.filmPlayer.createPlayer({ gain: .12 });
      const native = navigator.getGamepads.bind(navigator);
      let tick = -1, input;
      navigator.getGamepads = () => {
        if (api.sim.state.tick !== tick) { tick = api.sim.state.tick; input = player(api.sim.state); }
        const { x, z } = input.direction, length = Math.hypot(x,z);
        const scale = length > .001 ? (.22 + .78 * length) / length : 0;
        return [{ connected:true,mapping:'standard',axes:[-x*scale,-z*scale],buttons:Array.from({length:17},()=>({pressed:false,value:0})) }];
      };
      api.stopDrive = () => { navigator.getGamepads = native; };
    },
    walkTo(x, z, effort = 0.68) {
      api.walkTarget = { x, z, effort };
      if (api.stopWalk) return;
      const native = navigator.getGamepads.bind(navigator);
      navigator.getGamepads = () => {
        const dog = api.sim.state.dogs[0].position;
        const target = api.walkTarget;
        const dx = target.x - dog.x, dz = target.z - dog.z, distance = Math.hypot(dx, dz);
        const amount = distance < 0.7 ? 0 : Math.min(target.effort, distance * .2 + .22);
        return [{ connected: true, mapping: 'standard', axes: [-dx / Math.max(.01, distance) * amount, -dz / Math.max(.01, distance) * amount],
          buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }];
      };
      api.stopWalk = () => { navigator.getGamepads = native; delete api.stopWalk; };
    },
  };
}
