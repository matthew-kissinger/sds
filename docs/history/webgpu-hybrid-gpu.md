# Forced WebGPU device loss on the owner's PC: diagnosis

The test scripts were throwaway and are not in the repository.

Date: 2026-11-05. Machine: the functional lane, so no timing here is a
performance claim. Millisecond figures only order events within a run.

## Answer

Chromium hands a Vulkan memory handle from the AMD GPU to the NVIDIA GPU, and
Vulkan does not allow that. The out-of-memory error is NVIDIA's response to a
foreign handle. No memory actually ran out.

- Chrome's compositor (Skia/Ganesh on Vulkan) runs on the **active** GPU, the AMD
  Vega, which is the boot VGA device.
- WebGPU with `powerPreference: high-performance` gets a Dawn device on the
  **NVIDIA** GPU.
- Canvas buffers are allocated on the compositor's device and exported as
  `OPAQUE_FD`. Dawn then imports them on its own device.
- `OPAQUE_FD` is only valid between devices with the same `deviceUUID` and
  `driverUUID`. These two differ.

No repository change is needed or recommended. The defect is in Chromium, and
this PC has a flag workaround (below).

## 1. The failing allocation

Captured with `VK_LAYER_LUNARG_api_dump`, enabled only in the environment of
browsers launched for this test:

```
vkAllocateMemory -> VK_ERROR_OUT_OF_DEVICE_MEMORY
  device            NVIDIA (Dawn)
  allocationSize    4653072   (the AMD image's size; NVIDIA's own requirement is 4587520)
  memoryTypeIndex   0
  VkImportMemoryFdInfoKHR  handleType = OPAQUE_FD, fd from vkGetMemoryFdKHR on the AMD device
  VkMemoryDedicatedAllocateInfo  image = R8G8B8A8_UNORM 1280x800, OPTIMAL tiling
```

The game's first three canvas configurations all reach this path. With the game
at 1280x720 the canvas is 1024x576 and the import size is 2686992.

**Why "228 objects after 17 MB":** that number is boot order, not a threshold.
The game first calls `getCurrentTexture` at 225 objects. Three more tiny buffers
(36, 144 and 64 bytes) are created before the loss arrives. The objects counted
by `createTexture`/`createBuffer` are not the ones that failed.

## 2. Evidence

**Native Vulkan, no browser**:

| Export -> import | Result |
|---|---|
| NVIDIA -> NVIDIA | `VK_SUCCESS` |
| AMD -> AMD | `VK_SUCCESS` |
| **AMD -> NVIDIA** | **`VK_ERROR_OUT_OF_DEVICE_MEMORY`**, with either size and memory type 0 or 1 |
| NVIDIA -> AMD | `VK_ERROR_INVALID_EXTERNAL_HANDLE` |

The AMD and NVIDIA `deviceUUID` and `driverUUID` values differ.

**Plain WebGPU in the browser, no game code:**

| Case | Adapter | Result |
|---|---|---|
| 600 textures and 600 buffers offscreen, about 190 MB, no canvas | NVIDIA | ok |
| One canvas, clear only, 1280x800 | NVIDIA | lost within 3-4 frames |
| Same at 64x64 | NVIDIA | lost |
| Canvas configured, `getCurrentTexture` never called | NVIDIA | ok |
| Game's canvas settings, timestamps and feature level | AMD (`low-power`) | ok |

**Device mapping:** every dumped failing run in all three browsers (156, 149,
stable 150; 17 runs) shows the first VkDevice on AMD, the second on NVIDIA, and
one import that fails. `chrome://gpu` shows AMD as `*ACTIVE*`, Skia backend
`GaneshVulkan`, and `WebGPU interop: Disabled`.

**Not proven in the browser:** I could not get Chrome to run its compositor on
NVIDIA. PRIME offload environment variables moved ANGLE to NVIDIA but dropped
compositing to software, and `--gpu-testing-*` flags did not change the active
GPU. So the same-GPU NVIDIA control exists only natively. The same-GPU AMD control
exists in both.

## 3. Ruled out

| Candidate | Why not |
|---|---|
| VRAM or heap exhaustion | 190 MB offscreen is fine and the import needs 4.6 MB. The 2.3 and 4.61 GB budgets in the earlier notes are **RADV's** heaps. NVIDIA's are 6 GiB, 11.57 GiB system and a 246 MiB BAR. |
| `RLIMIT_MEMLOCK`, allocation count, mapping limits | Same limits apply to the native NVIDIA->NVIDIA success, and only 18 allocations are made. `maxMemoryAllocationCount` is 2^32-1. |
| Size or memory type mismatch | Native import fails with NVIDIA's own size and with types 0 and 1. |
| Sync or semaphores | The failure comes before any semaphore is shared for that frame. |
| Sandbox | Fails with `--disable-gpu-sandbox` too (4 of 4 here). `chrome://gpu` reports the process unsandboxed either way in these runs. |
| Headless | The earlier headed runs failed 4 of 4. |
| Game code: format, `trackTimestamp`, query sets, `compatibility` | Not needed to fail (table above), and each variation fails or passes only by adapter. |
| Mesa or Vulkan loader update | Native AMD->NVIDIA still fails with RADV 26.2.4 and loader 1.4.357, unpacked from the pacman cache to scratch and not installed. |

## 4. Why 156 looked intermittent

It isn't intermittent in my runs. The earlier measurement was a sampling artefact.

- The earlier script polled every 2.5 s and stopped at the first
  `ready === 'true'`. The game sets ready, and the loss arrives shortly after.
- Replaying that exact logic while timestamping events, one 156 run reported a
  pass and then lost the device 356 ms after ready. It was on "Graphics stopped"
  when checked 12 s later.
- Across 47 page loads of the real game on 156, watched past first present, none
  survived. 149 was 4 of 4 lost.
- The same early exit applies to the earlier `--disable-gpu-sandbox` 2 of 4.

**Limit:** I reproduced the mechanism but not the rate. I caught 1 false pass in
8, against about half earlier. The earlier runs used a real server under a
different load, which may widen the window, and I did not test that. The 0 of 4
on 149 and 150 are small samples, and those ran against production.

## 5. The 2026-10-20 lead

**Not resolved.** I could not find what the 10-20 note measured, and the journal
keeps only two boots, so nothing shows which adapter or GPU that run used.

- Mesa and the loader are excluded (above).
- A failing import would be expected on any driver, because the usage is invalid.
  An older NVIDIA driver might have tolerated it, but I could not test that:
  old userland will not run against the current kernel module.
- That run may also have used another adapter or been a false pass.

`linux-cachyos-lts` is **not** a useful test of the driver change. Its module is
also 615.78.08, so booting it only changes the kernel. I expect it to still fail.

To settle it: repeat the native AMD to NVIDIA import on a boot with NVIDIA 615.71.09
installed, which needs a downgrade only the owner can choose. If it succeeds, the
driver changed behaviour. It would still be invalid Vulkan usage that Chromium
should not rely on.

## 6. Recommendation

**Game: no change.**
- A throwaway patch dropping `powerPreference` worked here (AMD adapter, 2 of 2),
  but it would also move hybrid laptops on other systems off their discrete GPU.
  Nothing in this evidence justifies that.
- `tools/probe-lib.mjs` `GPU_ARGS` is unchanged. The default-high-performance flag
  does not help, as already found.

**Workaround on this PC, opt-in only:**

```bash
--use-webgpu-power-preference=force-low-power
```

The game requested `high-performance`, got AMD, and stayed up through the real
Play button for 12 s, 3 of 3. That is genuine WebGPU on the Vega. The production
build has no debug readout, so "stayed up" means no device loss, no Graphics
stopped screen and `ready=true`; ticks were not read, and
`tools/coop-browser-probe.mjs` was not run with it. It should not become the
`GPU_ARGS` default without a hub check, because it forces the integrated GPU on
any hybrid machine, and I did not touch the hub.

**Upstream:** file against Chromium/Dawn (draft below). I don't recommend an NVIDIA
report: the input is invalid, so the misleading error code is at most a minor
complaint. RADV returns `INVALID_EXTERNAL_HANDLE` for the mirror case, which would
have made this far quicker to find.

**Who is affected:** hybrid Linux machines where WebGPU is forced on. Stable Chrome
without flags offers no adapter here and uses WebGL2. If Chrome enables WebGPU on
Linux by default before this is fixed, these players would see a repeating Graphics
stopped screen. Single-GPU NVIDIA Linux should not hit this path (native
NVIDIA->NVIDIA passes), but that is not tested in a browser on such a machine.

**WebGL2 fallback on device loss (not implemented, separate decision):** it would
cover this case. The loss comes right after first present and before play, so a
fallback would not interrupt a run. Reload alone cannot help, since it fails the
same way every time.

## Unexplained side observation

In one native test, running NVIDIA->NVIDIA, AMD->AMD, AMD->NVIDIA and then NVIDIA->AMD
makes the later NVIDIA **export** allocation fail with `OUT_OF_DEVICE_MEMORY`, every
time (3 of 3). A similar sequence in a second test does not, so it may be the test
or a driver state effect. I did not isolate it. It does not affect the conclusion:
AMD->NVIDIA fails alone in a fresh process.

## Draft Chromium bug

> **Title:** WebGPU on Linux hybrid GPU: device lost on first canvas present when the
> high-performance adapter differs from the compositor's Vulkan device
>
> **Versions:** Chrome 150.0.7871.128, Chrome for Testing 149.0.7827.55 and 156.0.8078.4.
> CachyOS, Wayland, AMD Vega 10 (Mesa 26.2.5, boot VGA, active GPU) plus GTX 1660 Ti
> Max-Q (NVIDIA 615.78.08, nvidia-open).
>
> **Flags:** `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=default --ignore-gpu-blocklist`
>
> **Steps:** `requestAdapter({powerPreference: 'high-performance'})`, `requestDevice()`,
> configure a canvas, then clear `getCurrentTexture()` and submit.
>
> **Expected:** the canvas presents, by a transfer that works across GPUs (DMA-BUF
> with a compatible modifier, or a copy), or the browser returns the adapter matching
> the compositor.
>
> **Actual:** the device is lost within a few frames: `vkAllocateMemory failed with
> VK_ERROR_OUT_OF_DEVICE_MEMORY`.
>
> **Analysis:** an API dump shows the shared image allocated on the compositor's AMD
> VkDevice with `VkExportMemoryAllocateInfo(OPAQUE_FD)`, exported with
> `vkGetMemoryFdKHR`, and imported on Dawn's NVIDIA VkDevice with
> `VkImportMemoryFdInfoKHR(OPAQUE_FD)` and the exporter's size. The devices have
> different `deviceUUID` and `driverUUID`, which `OPAQUE_FD` does not permit. The
> error is not memory pressure: a native program reproduces it with no browser, and
> same-GPU export/import succeeds on both GPUs. `low-power` or no preference selects
> AMD and works; so does `--use-webgpu-power-preference=force-low-power`.
>
> `chrome://gpu` shows `WebGPU interop: Disabled`, but WebGPU reports hardware
> accelerated and offers the NVIDIA adapter.
>
> **Attachments:** native reproducer, api_dump excerpt.
