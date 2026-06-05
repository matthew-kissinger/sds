# Playtest on the tablet (LAN baseline)

Serve the build to the Samsung tablet for hands-on playtesting with an on-screen perf readout. Written for Cycle 60 Phase 1.

**Device of record:** SM-X518U (Galaxy Tab S9 FE), product `gts9fe`. Lands on the `low` hardware tier (5 grass blades/clump, 1 wind octave, closer foliage LOD); the `QualityGovernor` drops render scale if it misses budget. Expect modest fps - that is the point of the baseline.

## One-time tablet setup

1. Settings -> About tablet -> tap Build number 7 times to unlock Developer options.
2. Settings -> Developer options -> enable USB debugging.
3. Plug into the PC over USB and tap Allow on the "Allow USB debugging" prompt (check "always allow from this computer").
4. Confirm from the PC: `adb devices -l` should show the device as `device` (not `unauthorized`). The current device id is `R52X405L12T`.

## Path A - USB tether (recommended, no wifi needed)

`adb reverse` maps the tablet's localhost to the PC, so the tablet loads over the USB cable. Because the origin is `localhost`, the service worker auto-disables and there is never a stale-cache surprise.

```bash
# PC: build + serve (binds 0.0.0.0 so both USB-localhost and wifi work)
npm run build
npm run preview:lan        # vite preview --host, port 4173

# PC: map the tablet's :4173 to the PC's :4173 over USB
adb -s R52X405L12T reverse tcp:4173 tcp:4173

# PC: open the build on the tablet (Chrome)
adb -s R52X405L12T shell am start -a android.intent.action.VIEW \
  -d "http://localhost:4173/?stats=1" com.android.chrome
```

On the tablet, the game loads at `http://localhost:4173/?stats=1`.

## Path B - wifi LAN (untethered)

With the tablet on the `mkfi` wifi (its IP is `192.168.1.230`), point Chrome at the PC's LAN IP:

```
http://192.168.1.100:4173/?stats=1
```

The Cycle 60 service-worker fix treats any `192.168.x` / `10.x` / `172.16-31.x` origin (and `?nosw`) as dev, so no stale build is served during playtest. `npm run preview:lan` must be running on the PC.

## The on-screen perf chip

- `?stats=1` shows a dependency-free chip (bottom-left): fps, frametime, peak frametime, draw calls, triangles, active sheep. It persists across reloads (localStorage `sds.show-stats`).
- `?stats=0` hides and clears it.
- It pulls no CDN script, unlike the P-key `PerformanceMonitor` (Stats.js), so it works offline on the tablet.

## Capturing a perf baseline

`?perfMode=1` installs `window.__perfHarness`. After the scene is up, from a remote console (or `adb shell` + chrome devtools), call:

```js
window.__perfHarness.startSampling(8000)
// 8s later:
window.__perfHarness.getSummary()   // avg/p95 frametime, draw calls, triangles, active sheep
```

Record the summary per scene + mode in the cycle plan or `BACKLOG.md` as the testing baseline.

## Notes

- The preview build points at the production worker (`sds-worker...workers.dev`), so a banked Counting score from the tablet writes to the live leaderboard. That is intentional for the Phase 7 live-leaderboard smoke; be aware of it during casual testing.
- For live-reload iteration (dev server, not a production build), use `npm run dev:lan` instead of `preview:lan` and load port `3000`. Perf numbers from a dev build are not representative; use `preview:lan` for baselines.
- If the hub (`192.168.1.218`) is up, ADB can also be driven through it (`ssh l "adb ..."`); the PC-USB path above does not need the hub.
