# 01 - Architecture

## Stack (verified against npm 2026-08-21)

| Package | Version | Notes |
|---|---|---|
| react / react-dom | 19.2.x | Pin under 19.3: fiber's peer range is `>=19 <19.3`. Do not auto-bump. |
| three | 0.185.x | WebGPURenderer is the three-recommended renderer since r182. |
| @react-three/fiber | 9.7.x | v10 (WebGPU/TSL first-class hooks) is alpha; upgrade later, do not build on canary. |
| @react-three/drei | 10.7.x | Audit every drei import under WebGPURenderer before adopting it; some components assume WebGLRenderer. |
| zustand | 5.0.x | All game/UI/session state. Transient `subscribe` reads in useFrame; never setState per frame. |
| typescript, vite, vitest | latest | |
| @types/three | 0.185.x | dev |

Explicitly omitted, with reasons (do not add without a recorded decision):

- **No physics engine** (@react-three/rapier, ecctrl). The deterministic sim IS the physics and must run byte-identically in the Cloudflare Worker; WASM physics would fork it and desync multiplayer.
- **No @react-three/postprocessing.** It is GLSL/WebGL-only. Post effects use three's native TSL PostProcessing (bloom, vignette, color grade exist natively). Keep post subtle and isolated behind one component.
- **No jotai** (zustand covers it), **no ECS library** unless a view-layer need is demonstrated (miniplex 2.0 is the sanctioned candidate for presentation-only entities, never sim state).

## Renderer: one path, two backends

WebGPURenderer from `three/webgpu`, created through R3F's async gl factory:

```tsx
<Canvas gl={glFactory} frameloop="always" ...>
```

where `glFactory` is a module-level memoized `async (props) => { const r = new THREE.WebGPURenderer(props); await r.init(); return r; }`. Memoization is mandatory: R3F issue #3782, a re-render can invoke the factory twice.

WebGPURenderer carries its own WebGL2 backend and falls back automatically. That is the entire fallback story. Rules that follow:

- All custom materials are TSL node materials. TSL compiles to WGSL and GLSL, so one material serves both backends.
- ShaderMaterial, RawShaderMaterial, and onBeforeCompile GLSL patching are forbidden (they do not work under WebGPURenderer, and they are how sds ended up authoring every material twice).
- Never write a per-backend material variant. If a TSL feature misbehaves on the WebGL2 backend, fix or simplify the material; do not fork it. (sds failure mode: 44 webgpu* adapter files plus ~5,000 lines of proof diagnostics existed only to keep two paths visually identical.)

## Repo layout

```
sds/
  spec/            this spec
  sim/             pure deterministic TypeScript. No three, react, DOM, or worker imports.
  app/             the client: Vite + React + R3F
    src/scene/     R3F components (Field, Flock, Dog, Fence, Pen, Sky, Grass, ...)
    src/state/     zustand store(s)
    src/net/       network client (plain TS, writes into sim/store, never into React)
    src/audio/     audio system
    src/ui/        DOM UI components (TSX only)
    src/tsl/       TSL node materials, one module per material
  worker/          Cloudflare Worker + Durable Objects + D1 migrations
  assets/          asset sources and recipes (see spec/04)
  tools/           bake scripts, validation probes. Never imported by app/.
  tests/           vitest suites incl. sim trace fixtures
```

`sim/` is the successor of sds `shared/` and carries the same fence, enforced by ESLint from day one: `no-restricted-imports` scoped to `sim/**` bans three (and sub-paths), react, `app/`, `worker/`; a DOM-free globals map makes browser API access an error. The Worker bundles `sim/` via wrangler/esbuild; the client bundles it via Vite; tests run it in Node. TypeScript is fine in all three toolchains (verify in phase 0).

## The sim is a pure function

The tick loop is an exported pure function:

```ts
step(state: SimState, inputs: PlayerInputs, rng: Rng): SimState
```

Production Durable Object, client predictor, and trace tests all import this same function. There is no separate test harness reimplementation (sds failure mode: an 810-line hand-mirrored harness meant fixtures pinned the harness, not the sim).

Determinism rules (lifted from sds, they produced zero live desyncs):

- No trig or transcendentals in per-tick paths. IEEE-754-pinned ops and Math.sqrt only. Precomputed cosine constants for cone tests.
- No Math.random anywhere in `sim/`. Lint-banned. Every entry point that needs randomness takes a required seeded rng (mulberry32). No default parameter fallback.
- No `for...in` over non-integer keys.
- The per-game seed is drawn once at room creation, lives server-side, and never reaches the wire. Clients copy positions from snapshots; they never re-derive spawns.
- In the client, useFrame's variable delta accumulates into fixed 1/60 s steps (same accumulator the server uses). Variable dt never enters `step`.

## FlockSim: dual backend from day one

Sheep logic runs behind one interface with two implementations:

```ts
interface FlockSim {
  readonly authoritative: boolean;
  step(inputs, dtFixed): void;
  positions: Float32Array;   // SoA: x,z per sheep
  headings: Float32Array;
  stateFlags: Uint8Array;    // lifecycle enum per sheep
}
```

1. **CpuDeterministicSim** (authoritative). The lifted sds sim. Used for all ranked solo play and ALL multiplayer. This is the only backend the Worker knows about.
2. **GpuComputeSim** (presentation-grade). TSL compute shaders running the boid rules on the GPU. Used for unranked local zen/scale play (thousands of sheep). Never authoritative: GPU float ordering is not deterministic across devices and the Durable Object cannot run compute shaders. Scores from this backend are never submitted.

Both backends fill the same typed-array layout, so the instanced renderer, grass interaction, and audio triggers do not know which is running. The toggle is a config value on the local game setup (and a debug URL param), not a mode. Build the interface in phase 1 even though GpuComputeSim ships later; retrofitting the buffer contract is the expensive part.

## State and rendering rules

- Game state lives in zustand. The R3F scene and the DOM UI both subscribe to the same store. Zero window globals, zero custom-event bridging, zero singleton "bridge" objects (sds failure mode: GameBridge plus ~47 `window.__*` globals made every UI bug a race condition).
- The 60 Hz sim writes into typed arrays; one useFrame system copies them into instanceMatrix and instanced attributes. React re-renders only on discrete events (sheep penned count, game complete, connection status), never per frame.
- The flock renders as one raw `<instancedMesh>` (or BatchedMesh) written imperatively. drei `<Instances>` is forbidden for the flock hot path (documented per-instance React overhead); fine for static scatter.
- Sheep animation is vertex-stage TSL (gait bob, ear flick, wool jiggle driven by per-instance attributes: phase, tint, agitation). No skeletons for sheep.
- One start path. Solo runs the sim client-local (offline-capable, instant start). Co-op runs the identical sim as predictor against the DO. The difference is who owns `step`, not a separate code path through the app (sds failure mode: four game-start paths).
- URL params are capped at three: `room` (join code), `seed` (local repro), `debug`. Validation probes live in tools/ and drive the app through its normal path (sds failure mode: ~23 production URL params, each load-bearing for some harness).

## Naming and hygiene rules

- Files name WHAT, not WHEN. No plan codenames, cycle numbers, or campaign names in live code (sds paid a 36-file migration to unlearn this).
- Modules are named by domain (spawn, retirement, progress), never by vague category. "Validation" grab-bag modules and re-export compatibility shims are forbidden.
- One field name per concept on the wire and in state. No legacy aliases, ever (sds carried dead Geckos-era aliases through two backend generations).
- A config field exists only once something reads it, in the same PR.
