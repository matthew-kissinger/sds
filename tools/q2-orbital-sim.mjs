/**
 * Cycle 20 Phase 0 — Q2 verdict simulation.
 *
 * For each baked atlas (16 hemi-y, 32 hemi-y), simulate the runtime 3-tile
 * barycentric blend at the in-game camera regime (radius 120m, elevation 5°,
 * 24 azimuth stops at 15° steps). Output 24 frames per atlas + a JSON delta
 * report comparing frame-to-frame mean-RGB Δ.
 *
 * Methodology (matches Phase 2 plan's 3-tile barycentric blend for lat/lon
 * latlon layout):
 *   1. Camera azimuth θ_cam ∈ [0, 2π), elevation φ_cam = 5° (≈0.087 rad).
 *   2. Locate the lat/lon cell whose corners straddle (θ_cam, φ_cam) using
 *      the sidecar's azimuths[] + elevations[] arrays.
 *   3. Compute fractional position within the cell. Decide which of the two
 *      triangles the point lies in (lower-left or upper-right diagonal of
 *      the cell). Compute barycentric weights for that triangle's 3 corners.
 *   4. For each output pixel of the 512×512 frame, blend the 3 corresponding
 *      tile pixels by those weights (alpha-aware: weight × alpha sums).
 *   5. Compute mean-RGB delta vs the previous frame (alpha-masked).
 *
 * The bottom elevation row is at 5° in both bakes — so for camera elevation 5°
 * the test point sits exactly on the bottom row, and the elevation-up
 * triangle corner has weight 0. This exactly mirrors what the in-game ground
 * camera sees and isolates the azimuth-step variable for Q2.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const PHASE0_DIR = resolve('cycle20-validation/phase0');
const FRAMES = 24;
const FRAME_SIZE = 512;

async function loadAtlas(basePath) {
  const meta = JSON.parse(readFileSync(`${basePath}.json`, 'utf-8'));
  const img = await sharp(`${basePath}.png`).raw().toBuffer({ resolveWithObject: true });
  return { meta, pixels: img.data, width: img.info.width, height: img.info.height };
}

function tilePixel(atlas, tileX, tileY, u, v) {
  // u, v in [0, 1). Map to absolute atlas pixel.
  const tilePx = atlas.meta.tileSize;
  const px = Math.floor(tileX * tilePx + u * tilePx);
  const py = Math.floor(tileY * tilePx + v * tilePx);
  const idx = (py * atlas.width + px) * 4;
  return [atlas.pixels[idx], atlas.pixels[idx + 1], atlas.pixels[idx + 2], atlas.pixels[idx + 3]];
}

function findCellAndWeights(meta, azCam, elCam) {
  const { tilesX, tilesY, azimuths, elevations } = meta;

  // Azimuth: find the cell index. azimuths[] are evenly spaced [0, 2π) in
  // ascending order; identical step = 2π / tilesX.
  const azStep = (Math.PI * 2) / tilesX;
  let azI = Math.floor(((azCam % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / azStep);
  let azFrac = (((azCam % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / azStep) - azI;
  azI = ((azI % tilesX) + tilesX) % tilesX;
  const azI2 = (azI + 1) % tilesX;

  // Elevation: top row first = highest elevation. elevations[0] is highest,
  // elevations[tilesY-1] is lowest. Find the row pair (j, j+1) such that
  // elevations[j] >= elCam >= elevations[j+1] (top-down). For camera at the
  // bottom-row elevation (5°), we want j = tilesY-2 and elFrac = 1 (= bottom).
  let elJ = 0;
  for (let r = 0; r < tilesY - 1; r++) {
    if (elevations[r] >= elCam && elCam >= elevations[r + 1]) {
      elJ = r;
      break;
    }
    // Above all: stay at top pair, frac = 0.
    if (elCam > elevations[0]) { elJ = 0; break; }
    // Below all: stay at bottom pair, frac = 1.
    if (elCam < elevations[tilesY - 1]) { elJ = tilesY - 2; break; }
  }
  const elFrac = (elevations[elJ] - elCam) / (elevations[elJ] - elevations[elJ + 1]);

  // Two triangles split each (az, el) cell along the diagonal.
  // Cell corners (top row first → row j=upper, row j+1=lower):
  //   TL: (azI,  elJ),   TR: (azI2, elJ)
  //   BL: (azI,  elJ+1), BR: (azI2, elJ+1)
  // Triangle A: TL, TR, BL (lower-left half plane: u + v < 1)
  // Triangle B: TR, BR, BL (upper-right half plane: u + v >= 1)
  // For latlon barycentric, this is the standard split.
  const u = azFrac, v = elFrac;
  if (u + v < 1) {
    // Triangle A: TL (1-u-v), TR (u), BL (v)
    return [
      { tileX: azI,  tileY: elJ,     w: 1 - u - v },
      { tileX: azI2, tileY: elJ,     w: u },
      { tileX: azI,  tileY: elJ + 1, w: v },
    ];
  } else {
    // Triangle B (u + v >= 1, lower-right half of cell along TR-BL diagonal).
    // Standard area-barycentric over corners TR, BR, BL:
    //   w_TR vanishes on the BR-BL edge (v = 1)            ⇒ w_TR = 1 - v
    //   w_BR vanishes on the TR-BL edge (u + v = 1)        ⇒ w_BR = u + v - 1
    //   w_BL vanishes on the TR-BR edge (u = 1)            ⇒ w_BL = 1 - u
    // Verify at corners: TR=(1,0)→(1,0,0); BR=(1,1)→(0,1,0); BL=(0,1)→(0,0,1). ✓
    return [
      { tileX: azI2, tileY: elJ,     w: 1 - v },
      { tileX: azI2, tileY: elJ + 1, w: u + v - 1 },
      { tileX: azI,  tileY: elJ + 1, w: 1 - u },
    ];
  }
}

async function renderFrame(atlas, weights) {
  const tilePx = atlas.meta.tileSize;
  const out = Buffer.alloc(FRAME_SIZE * FRAME_SIZE * 4);
  for (let py = 0; py < FRAME_SIZE; py++) {
    for (let px = 0; px < FRAME_SIZE; px++) {
      const u = px / FRAME_SIZE;
      const v = py / FRAME_SIZE;
      let r = 0, g = 0, b = 0, a = 0;
      for (const w of weights) {
        const [pr, pg, pb, pa] = tilePixel(atlas, w.tileX, w.tileY, u, v);
        const wa = w.w * (pa / 255);
        r += pr * wa;
        g += pg * wa;
        b += pb * wa;
        a += w.w * pa;
      }
      const idx = (py * FRAME_SIZE + px) * 4;
      // Normalize by alpha-weight sum to avoid darkening at translucent edges.
      const aSum = weights.reduce((s, w) => s + w.w, 0); // = 1
      out[idx] = Math.min(255, Math.round(r / Math.max(1e-6, aSum)));
      out[idx + 1] = Math.min(255, Math.round(g / Math.max(1e-6, aSum)));
      out[idx + 2] = Math.min(255, Math.round(b / Math.max(1e-6, aSum)));
      out[idx + 3] = Math.min(255, Math.round(a));
    }
  }
  return out;
}

function frameMeanColor(buf) {
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] >= 16) {
      r += buf[i];
      g += buf[i + 1];
      b += buf[i + 2];
      count++;
    }
  }
  return count > 0 ? [r / count, g / count, b / count] : [0, 0, 0];
}

/**
 * Per-pixel RMSE between two frames. Sensitive to silhouette / spatial
 * discontinuity, not just mean color. RGB only — alpha is included as a
 * 4th channel so silhouette shifts (alpha changing on a pixel) register.
 */
function frameRmse(a, b) {
  let sum = 0;
  const n = a.length / 4;
  for (let i = 0; i < a.length; i += 4) {
    const dr = a[i] - b[i];
    const dg = a[i + 1] - b[i + 1];
    const db = a[i + 2] - b[i + 2];
    const da = a[i + 3] - b[i + 3];
    sum += dr * dr + dg * dg + db * db + da * da;
  }
  return Math.sqrt(sum / (n * 4));
}

function frameMeanDelta(prevMean, currMean) {
  const dr = currMean[0] - prevMean[0];
  const dg = currMean[1] - prevMean[1];
  const db = currMean[2] - prevMean[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

async function runForAtlas(label, basePath) {
  const atlas = await loadAtlas(basePath);
  console.log(`[${label}] loaded ${atlas.meta.tilesX}×${atlas.meta.tilesY} atlas (${atlas.width}×${atlas.height})`);

  const elCam = (5 * Math.PI) / 180; // 5° elevation — bottom-row exact
  const meanColors = [];
  const buffers = [];
  const frameInfo = [];

  for (let i = 0; i < FRAMES; i++) {
    const azDeg = i * (360 / FRAMES);
    const azCam = (azDeg * Math.PI) / 180;
    const weights = findCellAndWeights(atlas.meta, azCam, elCam);
    const buf = await renderFrame(atlas, weights);

    const outPath = `${PHASE0_DIR}/orbit-B-${label}-${String(Math.round(azDeg)).padStart(3, '0')}.png`;
    await sharp(buf, { raw: { width: FRAME_SIZE, height: FRAME_SIZE, channels: 4 } })
      .png()
      .toFile(outPath);

    const mean = frameMeanColor(buf);
    meanColors.push(mean);
    buffers.push(buf);
    frameInfo.push({
      azDeg,
      mean,
      tiles: weights.map(w => ({ x: w.tileX, y: w.tileY, w: +w.w.toFixed(4) })),
    });
  }

  // Per-pixel RMSE between adjacent frames. Sensitive to silhouette shift,
  // ghosting, and cardinal step — what mean-color Δ misses.
  const rmseDeltas = [];
  const meanDeltas = [];
  for (let i = 0; i < FRAMES; i++) {
    const next = (i + 1) % FRAMES;
    rmseDeltas.push(frameRmse(buffers[i], buffers[next]));
    meanDeltas.push(frameMeanDelta(meanColors[i], meanColors[next]));
  }

  const sorted = [...rmseDeltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(FRAMES / 2)];
  const max = Math.max(...rmseDeltas);
  const min = Math.min(...rmseDeltas);

  return {
    label,
    tiles: `${atlas.meta.tilesX}×${atlas.meta.tilesY}`,
    azStepDeg: 360 / atlas.meta.tilesX,
    rmse: {
      median: +median.toFixed(3),
      max: +max.toFixed(3),
      min: +min.toFixed(3),
      maxToMedian: +(max / Math.max(1e-6, median)).toFixed(3),
    },
    meanDelta: {
      median: +([...meanDeltas].sort((a, b) => a - b)[Math.floor(FRAMES / 2)]).toFixed(3),
      max: +Math.max(...meanDeltas).toFixed(3),
    },
    rmsePerFrame: rmseDeltas.map(d => +d.toFixed(3)),
    frames: frameInfo,
  };
}

(async () => {
  const r16 = await runForAtlas('16', `${PHASE0_DIR}/tree1-16`);
  const r32 = await runForAtlas('32', `${PHASE0_DIR}/tree1-32`);

  // Verdict: max-to-median ratio of per-pixel RMSE deltas. Smooth orbit ⇒
  // ratio close to 1 (every frame jump is similar magnitude). Spiky orbit
  // (cardinal step from coarse azimuth) ⇒ ratio >> 1.
  const r16r = r16.rmse.maxToMedian;
  const r32r = r32.rmse.maxToMedian;
  const verdict = r16r <= 1.5 ? '16 hemi-y (saves ~15 MB; 16-bake spike acceptable)' : '32 hemi-y (16-bake shows visible spike)';

  const report = {
    methodology: '2D barycentric simulation of Phase 2 candidate shader at radius=120m / elevation=5° (in-game ground-camera regime). 24 frames at 15° azimuth steps. Per-pixel RMSE between adjacent frames measures spatial discontinuity (silhouette ghosting / cardinal step) — sensitive to what mean-color Δ misses.',
    threshold: 'Pass = max RMSE ≤ 1.5 × median RMSE. Smooth orbit ratio ≈ 1; spiky orbit ratio ≫ 1.',
    runs: [r16, r32],
    verdict,
  };

  writeFileSync(`${PHASE0_DIR}/q2-report.json`, JSON.stringify(report, null, 2));
  console.log('\nQ2 VERDICT:', verdict);
  console.log(`16 hemi-y — RMSE median ${r16.rmse.median} | max ${r16.rmse.max} | ratio ${r16r}`);
  console.log(`32 hemi-y — RMSE median ${r32.rmse.median} | max ${r32.rmse.max} | ratio ${r32r}`);
})();
