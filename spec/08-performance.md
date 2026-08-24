# 08 - Performance and loading

Budgets are requirements with numbers, checked by probes in tools/, not vibes.

## Frame budgets

| Target | Budget |
|---|---|
| Desktop (discrete or recent integrated GPU) | 60 fps at 1440p, 200 sheep, full grass |
| Mobile high (recent iPhone / flagship Android) | 60 fps at native res, 200 sheep, reduced grass density |
| Mobile low | 30 fps floor, 200 sheep never degrades below full flock (cut grass/effects, never gameplay entities) |

The flock is one draw call (single InstancedMesh, vertex-anim in TSL). Grass is one draw call per density tier. Post is one pass chain. Draw-call budget for the whole frame: under 100.

## Loading budget

All-cold: everything built before first interaction.

- Navigation to interactive: under 5 s on mid mobile over 4G, under 2 s on desktop broadband.
- Initial JS bundle under 1.5 MB gzipped (three + fiber + game); total first-load transfer including assets under 8 MB. KTX2/meshopt compression on everything heavy.
- Load work is honest: no fake progress. The palette color card fades to the live field once, when actually ready.

## Quality tiering

One small auto-tier: a measured capability probe at boot (renderer backend chosen, a quick offscreen fill test), mapping to high/low presets for grass density, shadow resolution, post toggles. Manual override in settings (auto / high / low). No UA sniffing (sds failure mode), no per-frame quality governor in v1; the scene is small enough to pick once and hold.

## GPU-scale mode (the GpuComputeSim toggle)

The TSL compute backend targets thousands of sheep for unranked zen play. Its budget: 5,000 sheep at 60 fps desktop / high mobile, sim fully on GPU (position/heading/state textures or storage buffers), zero per-sheep CPU work per frame. It reuses the same instanced renderer and grass interaction inputs. This is a scale showcase, not the game; it never gates the core experience and ships only when the core is done (roadmap phase 7).

## Perf discipline

- Zero per-frame allocations in steady state on the hot paths (sim step, instance write, delta reconstruction, interpolation). Preallocated buffers everywhere; the profiler decides whether scratch-pooling is needed, not habit.
- A perf probe in tools/ captures frame-time percentiles on a scripted 60 s herding run; it runs in CI-adjacent validation before any phase closes and its numbers go in the phase report.
- Browser probe hygiene (lifted from sds rules): every automated browser/page/listener closes when its probe finishes; probes never leave dev servers running.
