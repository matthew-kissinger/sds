# 01 - Architecture

## Stack (verified against npm 2026-10-16; three and its types rechecked 2026-10-31)

| Package | Version | Notes |
|---|---|---|
| react / react-dom | 19.3.x | fiber 9.8 accepts it. |
| three | 0.187.x | WebGPURenderer is the three-recommended renderer since r182. |
| @react-three/fiber | 9.8.x | v10 (WebGPU/TSL first-class hooks) is alpha; upgrade later, do not build on canary. 9.8 gates an async `gl` factory behind its own Suspense boundary; see the renderer section. |
| @react-three/drei | 10.7.x | Audit every drei import under WebGPURenderer before adopting it; some components assume WebGLRenderer. |
| zustand | 5.0.x | All game/UI/session state. Transient `subscribe` reads in useFrame; never setState per frame. |
| typescript, vite, vitest | latest | |
| @types/three | 0.187.x | dev |

Explicitly omitted, with reasons (do not add without a recorded decision):

- **No physics engine** (@react-three/rapier, ecctrl). The deterministic sim IS the physics and must run byte-identically in the Cloudflare Worker; WASM physics would fork it and desync multiplayer.
- **No @react-three/postprocessing.** It is GLSL/WebGL-only. Post effects use three's native TSL PostProcessing (bloom, vignette, color grade exist natively). Keep post subtle and isolated behind one component.
- **No jotai** (zustand covers it), **no ECS library** unless a view-layer need is demonstrated (miniplex 2.0 is the sanctioned candidate for presentation-only entities, never sim state).

## Renderer: one path, two backends

WebGPURenderer from `three/webgpu`, created through R3F's gl factory:

```tsx
<Canvas gl={glFactory} frameloop={sceneReady ? 'always' : 'never'} ...>
```

where `glFactory` is synchronous: it constructs the renderer, starts `init()`,
exposes that promise as `rendererReady()`, and returns the renderer before
init resolves. It is not memoized; fiber 9.8 calls it once per root and owns
the result. The frame loop stays paused until the scene is ready, and the
capability probe awaits `rendererReady()` before it draws its one measuring
frame; three throws on a render before init, so that pause is load-bearing.

Why not fiber's intended async factory (a factory that awaits `init()`): fiber
9.8 suspends the canvas on it behind fiber's own Suspense boundary, and
react-dom's fallback throttle then holds the resolved commit for 300 ms. The
hub measured it at +300 ms renderer-to-capability on WebGL2 and +150 ms on
WebGPU. The adversarial review of this design and the on-contract alternative
worth an A/B are in `docs/history/renderer-boot-review-2026-10-16.md`.

Tone mapping is `ACESFilmicToneMapping`, applied by fiber's first configure
(`flat` is false and `gl` is a factory). The factory once set Neutral and fiber
overwrote it, so the approved look has always been ACES; the owner kept it on
2026-10-16 and the code no longer claims otherwise. A different operator goes
in `onCreated`, after configure, and through the visual review gate.

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
  worker/          shipped identity, solo scores and cards + D1 migrations
  realtime/        planned separate multiplayer Worker + Durable Objects (not created)
  assets/          asset sources and recipes (see spec/04)
  tools/           bake scripts, validation probes. Never imported by app/.
  tests/           vitest suites incl. sim trace fixtures
```

`sim/` is the successor of sds `shared/` and carries the same fence, enforced
by ESLint: no Three.js, React, app, Worker or DOM dependencies. The client
bundles it via Vite and tests execute it in Node. The planned realtime Worker
must consume the same source through its Worker build, with cross-runtime
determinism verified before acceptance. The shipped score Worker is not a
v3 simulation host.

## The sim is a pure function

The tick loop is an exported pure function:

```ts
step(state: SimState, inputs: readonly PlayerInputs[], rng: Rng): SimState
```

Solo and trace tests use this function today. The planned RoomDO will use it;
there is no deployed v3 room yet. The function mutates and returns the state and
is deterministic in its arguments. Local-dog prediction reuses the movement
rules, not a second whole-flock simulation. There is no hand-mirrored test sim
(sds failure mode: an 810-line harness pinned itself, not the production sim).

Determinism rules carried from sds (trace evidence must establish each new
client/Worker candidate; historical claims are not a current desync receipt):

- No trig or transcendentals in per-tick paths. IEEE-754-pinned ops and Math.sqrt only. Precomputed cosine constants for cone tests.
- No Math.random anywhere in `sim/`. Lint-banned. Every entry point that needs randomness takes a required seeded rng (mulberry32). No default parameter fallback.
- No `for...in` over non-integer keys.
- The per-game seed is drawn once at room creation, lives server-side, and never reaches the wire. Clients copy positions from snapshots; they never re-derive spawns.
- In the client, useFrame's variable delta accumulates into fixed 1/60 s steps (same accumulator the server uses). Variable dt never enters `step`.

## FlockSim buffer contract

Sheep logic runs behind one interface. CPU is implemented; GPU-scale work is
deferred and outside multiplayer:

```ts
interface FlockSim {
  readonly authoritative: boolean;
  step(inputs, dtFixed): void;
  positions: Float32Array;   // SoA: x,z per sheep
  headings: Float32Array;
  stateFlags: Uint8Array;    // lifecycle enum per sheep
}
```

1. **CpuDeterministicSim** (authoritative). Used by shipped solo play and planned
   room simulation. Multiplayer presentation reads authoritative snapshots and
   predicts only local movement, rather than running a competing flock sim.
2. **GpuComputeSim** (deferred, presentation-grade). Proposed TSL compute for
   unranked local scale play. GPU float ordering is not deterministic across
   devices; this is not the multiplayer authority. It never submits scores.

Presentation consumes the same typed-array layout regardless of session
authority. The buffer contract is useful now; it does not authorize a GPU
toggle, dormant flags or extra query parameters. The network snapshot adapter
must expose all consumers' required state without pretending to own `step`.

## State and rendering rules

- Game state lives in zustand. The R3F scene and the DOM UI both subscribe to the same store. Zero window globals, zero custom-event bridging, zero singleton "bridge" objects (sds failure mode: GameBridge plus ~47 `window.__*` globals made every UI bug a race condition).
- The 60 Hz sim writes into typed arrays; one useFrame system copies them into instanceMatrix and instanced attributes. React re-renders only on discrete events (sheep penned count, game complete, connection status), never per frame.
- A per-frame value that would re-render React at 60 Hz if it went through the store is published instead as a named module-scope value behind an accessor, in the module that owns it: the player intent (`input/intent.ts`), the conditioner's commanded speed and direction (`input/conditioning.ts`), the Follow rig's bearing (`camera/followFraming.ts`) and the eased Classic-to-Follow blend weight (`camera/CameraRig.tsx`), the last two read by the input and audio layers. That is the exception to the rule above rather than a hole in it, and it holds only on these terms: nothing on `window`, no events, no subscribers, no game state, and exactly one writer for each, because the app builds one of each owner and a second would fight over the value.
- The flock renders as one raw `<instancedMesh>` (or BatchedMesh) written imperatively. drei `<Instances>` is forbidden for the flock hot path (documented per-instance React overhead); fine for static scatter.
- Sheep animation is vertex-stage TSL (gait bob, ear flick, wool jiggle driven by per-instance attributes: phase, tint, agitation). No skeletons for sheep.
- One session lifecycle. Solo owns its sim locally and starts offline. Planned
  multiplayer uses authoritative room snapshots, local-dog prediction and
  remote-entity interpolation through the same presentation buffer contract.
  The client never advances an authoritative online flock or locally pauses
  everyone else's game. Rules are selected at session construction (spec/03).
- Player-page query parameters are exactly `seed` (local repro) and `debug`,
  matching shipped readers and AGENTS.md. The old third `room` parameter was
  aspirational and is removed from the contract. Planned invites use
  `/r/<room-handle>`, not a query or hash alias. Online seed comes from the
  room. `/play/25`, `/play/75` and `/play/200` remain spec/14 paths, consumed
  once at boot to select flock size; other `/play/` values are a 404 page.
  Probes live in tools/ and drive normal UI, without new player URL switches.

## Planned multiplayer ownership

Spec/03 and [the plan](../docs/architecture/multiplayer-plan.md) supersede the
earlier co-op-only backend research. One separately deployed realtime Worker
hosts a RoomDO per room and a LobbyDO per region. Identity and solo scoring
remain with the existing Worker, accessed for admission through a service
binding. Source imports stay one-way into pure `sim/`; the v3 client imports
neither `worker/` nor `shared/`. The sim import fence must also exclude the
future `realtime/` tree when that first consumer is introduced.

No service code, network dependency, dormant flag or new directory lands merely
because this layout names it. All multiplayer implementation remains unopened.

## Naming and hygiene rules

- Files name WHAT, not WHEN. No plan codenames, cycle numbers, or campaign names in live code (sds paid a 36-file migration to unlearn this).
- Modules are named by domain (spawn, retirement, progress), never by vague category. "Validation" grab-bag modules and re-export compatibility shims are forbidden.
- One field name per concept on the wire and in state. No legacy aliases, ever (sds carried dead Geckos-era aliases through two backend generations).
- A config field exists only once something reads it, in the same PR.
