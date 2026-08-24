// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Dependency-free deterministic synthesis for every shipped audio sample.
// The output is mono PCM WAV so browsers can decode it without a codec or
// opaque encoder. Run with --check to rebake in a temporary directory and
// byte-compare the result with the committed asset set and ledger.

import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const committedRoot = join(repo, 'assets', 'audio');
const SAMPLE_RATE = 22_050;
const TWO_PI = Math.PI * 2;
const FORMAT = 'wav_pcm_s16le_22050_mono';
const RECIPE_VERSION = 1;

function rngFor(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function smooth01(value) {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
}

function eventEnvelope(time, start, attack, hold, release) {
  const local = time - start;
  if (local < 0 || local >= attack + hold + release) return 0;
  if (local < attack) return smooth01(local / attack);
  if (local < attack + hold) return 1;
  return 1 - smooth01((local - attack - hold) / release);
}

function decayEnvelope(time, start, attack, decay) {
  const local = time - start;
  if (local < 0 || local >= attack + decay) return 0;
  if (local < attack) return smooth01(local / attack);
  return Math.exp(-6 * (local - attack) / decay);
}

function samples(durationSeconds) {
  return new Float64Array(Math.round(durationSeconds * SAMPLE_RATE));
}

function addNoise(signal, seed, gain, lowpassHz, highpassHz = 0, levelAt = () => 1) {
  const random = rngFor(seed);
  const lowAlpha = 1 - Math.exp(-TWO_PI * lowpassHz / SAMPLE_RATE);
  const highAlpha = highpassHz > 0
    ? 1 - Math.exp(-TWO_PI * highpassHz / SAMPLE_RATE)
    : 0;
  let low = 0;
  let highBase = 0;
  for (let i = 0; i < signal.length; i++) {
    const white = random() * 2 - 1;
    low += lowAlpha * (white - low);
    if (highAlpha > 0) highBase += highAlpha * (low - highBase);
    signal[i] += (highAlpha > 0 ? low - highBase : low) * gain * levelAt(i / SAMPLE_RATE);
  }
}

function addChirp(signal, start, duration, startHz, endHz, gain, phase = 0) {
  const first = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const last = Math.min(signal.length, Math.ceil((start + duration) * SAMPLE_RATE));
  let angle = phase;
  for (let i = first; i < last; i++) {
    const local = i / SAMPLE_RATE - start;
    const progress = clamp(local / duration, 0, 1);
    const frequency = startHz + (endHz - startHz) * smooth01(progress);
    angle += TWO_PI * frequency / SAMPLE_RATE;
    const envelope = Math.sin(Math.PI * progress) ** 1.7;
    signal[i] += Math.sin(angle) * envelope * gain;
    signal[i] += Math.sin(angle * 2.01 + 0.7) * envelope * gain * 0.16;
  }
}

function addModes(signal, start, attack, decay, gain, modes) {
  const first = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const last = Math.min(signal.length, Math.ceil((start + attack + decay) * SAMPLE_RATE));
  for (let i = first; i < last; i++) {
    const time = i / SAMPLE_RATE;
    const local = time - start;
    const envelope = decayEnvelope(time, start, attack, decay);
    let value = 0;
    for (const [frequency, amplitude, damping, phase] of modes) {
      value += Math.sin(TWO_PI * frequency * local + phase)
        * amplitude * Math.exp(-damping * Math.max(0, local));
    }
    signal[i] += value * envelope * gain;
  }
}

function addVocal(signal, options) {
  const {
    start,
    duration,
    baseHz,
    endHz,
    gain,
    formants,
    pulseCount,
    seed,
  } = options;
  const random = rngFor(seed);
  const phases = Array.from({ length: 18 }, () => random() * TWO_PI);
  const first = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const last = Math.min(signal.length, Math.ceil((start + duration) * SAMPLE_RATE));
  for (let i = first; i < last; i++) {
    const local = i / SAMPLE_RATE - start;
    const progress = clamp(local / duration, 0, 1);
    const outer = Math.sin(Math.PI * progress) ** 0.85;
    const syllable = 0.58 + 0.42 * Math.max(0, Math.sin(Math.PI * pulseCount * progress));
    const vibrato = Math.sin(TWO_PI * (4.2 + (seed % 7) * 0.11) * local) * 0.018;
    const fundamental = (baseHz + (endHz - baseHz) * smooth01(progress)) * (1 + vibrato);
    let voice = 0;
    for (let harmonic = 1; harmonic <= phases.length; harmonic++) {
      const frequency = fundamental * harmonic;
      let formantWeight = 0;
      for (const [center, width, amount] of formants) {
        const distance = (frequency - center) / width;
        formantWeight += amount * Math.exp(-0.5 * distance * distance);
      }
      const amplitude = (0.11 + formantWeight) / (harmonic ** 0.78);
      phases[harmonic - 1] += TWO_PI * frequency / SAMPLE_RATE;
      voice += Math.sin(phases[harmonic - 1]) * amplitude;
    }
    signal[i] += voice * outer * syllable * gain;
  }
  addNoise(
    signal,
    seed ^ 0xa5a5a5a5,
    gain * 0.055,
    4_800,
    1_100,
    (time) => eventEnvelope(time, start, 0.035, duration * 0.56, duration * 0.4),
  );
}

function addBark(signal, options) {
  const { start, duration, baseHz, gain, seed } = options;
  const first = Math.floor(start * SAMPLE_RATE);
  const last = Math.min(signal.length, Math.ceil((start + duration) * SAMPLE_RATE));
  let phase = 0;
  for (let i = first; i < last; i++) {
    const local = i / SAMPLE_RATE - start;
    const progress = clamp(local / duration, 0, 1);
    const fundamental = baseHz * (1.18 - 0.42 * progress)
      * (1 + Math.sin(TWO_PI * 27 * local) * 0.025);
    phase += TWO_PI * fundamental / SAMPLE_RATE;
    const envelope = decayEnvelope(i / SAMPLE_RATE, start, 0.008, duration - 0.008);
    const throat = Math.sin(phase) * 0.62
      + Math.sin(phase * 2.02 + 0.4) * 0.29
      + Math.sin(phase * 3.97 + 1.1) * 0.16;
    const chest = Math.sin(TWO_PI * (380 - progress * 80) * local) * 0.2;
    signal[i] += (throat + chest) * envelope * gain;
  }
  addNoise(
    signal,
    seed,
    gain * 0.72,
    3_600,
    260,
    (time) => decayEnvelope(time, start, 0.004, duration * 0.72),
  );
}

function taperLoop(signal, seconds = 0.12) {
  const count = Math.min(Math.floor(seconds * SAMPLE_RATE), Math.floor(signal.length / 3));
  for (let i = 0; i < count; i++) {
    const fade = smooth01(i / Math.max(1, count - 1));
    signal[i] *= fade;
    signal[signal.length - 1 - i] *= fade;
  }
  signal[0] = 0;
  signal[signal.length - 1] = 0;
}

function normalize(signal, targetPeakDbfs) {
  let peak = 0;
  for (const value of signal) peak = Math.max(peak, Math.abs(value));
  const target = 10 ** (targetPeakDbfs / 20);
  const scale = peak > 0 ? target / peak : 1;
  for (let i = 0; i < signal.length; i++) signal[i] = Math.tanh(signal[i] * scale * 1.06) / 1.06;
  let normalizedPeak = 0;
  let squareSum = 0;
  for (const value of signal) {
    normalizedPeak = Math.max(normalizedPeak, Math.abs(value));
    squareSum += value * value;
  }
  return {
    peakDbfs: 20 * Math.log10(Math.max(1e-12, normalizedPeak)),
    rmsDbfs: 20 * Math.log10(Math.max(1e-12, Math.sqrt(squareSum / signal.length))),
  };
}

function wavBytes(signal) {
  const dataBytes = signal.length * 2;
  const output = Buffer.allocUnsafe(44 + dataBytes);
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(36 + dataBytes, 4);
  output.write('WAVE', 8, 'ascii');
  output.write('fmt ', 12, 'ascii');
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(SAMPLE_RATE, 24);
  output.writeUInt32LE(SAMPLE_RATE * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < signal.length; i++) {
    output.writeInt16LE(Math.round(clamp(signal[i], -1, 1) * 32_767), 44 + i * 2);
  }
  return output;
}

const recipes = [
  {
    id: 'birds-loop', file: 'ambience/birds-loop.wav', bus: 'ambient', duration: 12,
    loop: true, seed: 0xb17d0001, targetPeak: -10,
    synthesis: 'Sparse original two-note meadow chirps over a near-silent airy bed',
    render(signal) {
      addNoise(signal, this.seed, 0.014, 5_200, 1_400, (time) => 0.35 + 0.25 * Math.sin(TWO_PI * time / 6));
      for (const call of [[1.2, 1760, 2470], [3.85, 2240, 1540], [7.1, 1840, 2680], [9.7, 2380, 1930]]) {
        addChirp(signal, call[0], 0.24, call[1], call[2], 0.21, call[0] * 0.7);
        addChirp(signal, call[0] + 0.31, 0.18, call[2] * 0.91, call[1] * 1.06, 0.12, call[0]);
      }
    },
  },
  {
    id: 'leaves-loop', file: 'ambience/leaves-loop.wav', bus: 'ambient', duration: 11,
    loop: true, seed: 0x1ea50002, targetPeak: -9.5,
    synthesis: 'Band-limited seeded noise shaped into four overlapping soft leaf swells',
    render(signal) {
      addNoise(signal, this.seed, 0.8, 6_100, 650, (time) => {
        const slow = 0.18 + 0.16 * (Math.sin(TWO_PI * time * 2 / 11 + 0.8) + 1);
        const gust = [1.4, 4.0, 6.8, 9.1].reduce(
          (sum, start) => sum + eventEnvelope(time, start, 0.6, 0.25, 1.15), 0,
        );
        return slow + gust * 0.24;
      });
    },
  },
  {
    id: 'crowd-loop', file: 'flock/crowd-loop.wav', bus: 'flock', duration: 10,
    loop: true, seed: 0xc20d0003, targetPeak: -10.5,
    synthesis: 'Five distant low-level synthesized sheep formant calls with a soft flock murmur',
    render(signal) {
      addNoise(signal, this.seed, 0.05, 900, 110, (time) => 0.32 + 0.1 * Math.sin(TWO_PI * time / 5));
      const calls = [[1.1, 106, 98], [2.9, 124, 109], [4.65, 98, 92], [6.7, 132, 116], [8.35, 112, 101]];
      for (let index = 0; index < calls.length; index++) {
        const [start, baseHz, endHz] = calls[index];
        addVocal(signal, {
          start, duration: 0.86, baseHz, endHz, gain: 0.023,
          formants: [[520, 210, 0.42], [1_080, 330, 0.28], [2_080, 510, 0.12]],
          pulseCount: 2, seed: this.seed + index,
        });
      }
    },
  },
  {
    id: 'farmhouse-chime-loop', file: 'world/farmhouse-chime-loop.wav', bus: 'world', duration: 11.5,
    loop: true, seed: 0xfa2c0004, targetPeak: -8.5,
    synthesis: 'Three sparse original porch-chime clusters from inharmonic wooden and brass modes',
    render(signal) {
      const clusters = [[1.4, 392], [5.2, 329.63], [8.75, 440]];
      for (let index = 0; index < clusters.length; index++) {
        const [start, root] = clusters[index];
        addModes(signal, start, 0.008, 1.55, 0.18, [
          [root, 1, 1.8, 0], [root * 2.41, 0.34, 3.1, 0.7], [root * 4.18, 0.16, 4.8, 1.3],
        ]);
        addModes(signal, start + 0.43, 0.008, 1.2, 0.11, [
          [root * 1.26, 1, 2.2, 0.2], [root * 3.03, 0.28, 3.8, 1.1],
        ]);
      }
    },
  },
  {
    id: 'pant-loop', file: 'dog/pant-loop.wav', bus: 'dog', duration: 6,
    loop: true, seed: 0x0a170005, targetPeak: -9,
    synthesis: 'Eight alternating seeded breath-noise pulses with low chest resonance',
    render(signal) {
      const starts = [0.45, 1.12, 1.78, 2.48, 3.16, 3.82, 4.53, 5.18];
      for (let index = 0; index < starts.length; index++) {
        const start = starts[index];
        addNoise(signal, this.seed + index, 0.42, 3_900, 240, (time) => (
          eventEnvelope(time, start, 0.055, 0.09, 0.28)
        ));
        addModes(signal, start + 0.03, 0.02, 0.26, 0.025, [[155, 1, 8, index * 0.3]]);
      }
    },
  },
  ...[
    ['baa-01', 'flock/baa-01.wav', 1.36, 118, 101, 0xbaa10001, -5.5, 2.35],
    ['baa-02', 'flock/baa-02.wav', 1.52, 103, 92, 0xbaa20002, -5.5, 2.7],
    ['baa-03', 'flock/baa-03.wav', 1.18, 137, 119, 0xbaa30003, -6, 1.85],
  ].map(([id, file, duration, baseHz, endHz, seed, targetPeak, pulseCount]) => ({
    id, file, bus: 'flock', duration, loop: false, seed, targetPeak,
    synthesis: 'Original harmonic-formant sheep call with seeded aspiration and individual pitch contour',
    render(signal) {
      addVocal(signal, {
        start: 0.045, duration: this.duration - 0.12, baseHz, endHz, gain: 0.31,
        formants: [[510, 180, 0.58], [1_020, 300, 0.34], [2_180, 520, 0.16]],
        pulseCount, seed,
      });
    },
  })),
  {
    id: 'bellwether', file: 'flock/bellwether.wav', bus: 'flock', duration: 1.45,
    loop: false, seed: 0xbe110007, targetPeak: -6,
    synthesis: 'Original small worn-bell modal synthesis with six decaying partials',
    render(signal) {
      addModes(signal, 0.03, 0.004, 1.33, 0.52, [
        [312, 1, 2.2, 0], [487, 0.72, 2.8, 0.3], [721, 0.5, 3.5, 0.8],
        [1_034, 0.29, 4.4, 1.1], [1_558, 0.15, 5.4, 0.5], [2_310, 0.08, 7, 1.7],
      ]);
    },
  },
  ...[
    ['bark-01', 'dog/bark-01.wav', 0.78, 168, 0xb4010001, -3.5],
    ['bark-02', 'dog/bark-02.wav', 0.82, 145, 0xb4020002, -3.5],
    ['bark-03', 'dog/bark-03.wav', 0.7, 192, 0xb4030003, -4],
  ].map(([id, file, duration, baseHz, seed, targetPeak]) => ({
    id, file, bus: 'dog', duration, loop: false, seed, targetPeak,
    synthesis: 'Original single stylized collie cue from descending glottal harmonics and filtered breath burst',
    render(signal) { addBark(signal, { start: 0.025, duration: duration - 0.09, baseHz, gain: 0.58, seed }); },
  })),
  ...[
    ['footfall-01', 'dog/footfall-01.wav', 0.34, 0xf0010001, 132],
    ['footfall-02', 'dog/footfall-02.wav', 0.36, 0xf0020002, 118],
  ].map(([id, file, duration, seed, fundamental]) => ({
    id, file, bus: 'dog', duration, loop: false, seed, targetPeak: -5,
    synthesis: 'Original muted grass paw impact from a low body mode and short filtered grass brush',
    render(signal) {
      addModes(signal, 0.018, 0.006, 0.22, 0.42, [[fundamental, 1, 10, 0], [fundamental * 2.15, 0.24, 15, 0.4]]);
      addNoise(signal, seed, 0.34, 3_700, 700, (time) => decayEnvelope(time, 0.012, 0.004, 0.16));
    },
  })),
  {
    id: 'huff', file: 'dog/huff.wav', bus: 'dog', duration: 1.08,
    loop: false, seed: 0x4aff0001, targetPeak: -6.5,
    synthesis: 'Original single soft settling exhale from filtered seeded breath and chest modes',
    render(signal) {
      addNoise(signal, this.seed, 0.7, 2_700, 150, (time) => eventEnvelope(time, 0.08, 0.09, 0.2, 0.58));
      addModes(signal, 0.11, 0.05, 0.62, 0.07, [[104, 1, 5, 0], [218, 0.35, 7, 0.4]]);
    },
  },
  {
    id: 'gate-creak', file: 'world/gate-creak.wav', bus: 'world', duration: 2.25,
    loop: false, seed: 0x6a7e0001, targetPeak: -5.5,
    synthesis: 'Original weathered-hinge friction from seeded band noise, stick-slip pulses and bending wood modes',
    render(signal) {
      addNoise(signal, this.seed, 0.62, 2_400, 120, (time) => {
        const motion = eventEnvelope(time, 0.08, 0.18, 1.5, 0.38);
        const stickSlip = 0.24 + 0.76 * Math.max(0, Math.sin(TWO_PI * (3.1 + time * 0.8) * time));
        return motion * stickSlip;
      });
      addChirp(signal, 0.25, 0.72, 185, 420, 0.19, 0.4);
      addChirp(signal, 1.12, 0.64, 360, 164, 0.16, 1.1);
      addModes(signal, 1.77, 0.01, 0.38, 0.16, [[116, 1, 8, 0], [284, 0.4, 12, 0.5]]);
    },
  },
  {
    id: 'fence-knock', file: 'world/fence-knock.wav', bus: 'world', duration: 0.78,
    loop: false, seed: 0xfece0001, targetPeak: -4.5,
    synthesis: 'Original muted timber knock plus a short seeded wool-and-grass scrape',
    render(signal) {
      addModes(signal, 0.018, 0.004, 0.6, 0.62, [
        [128, 1, 7, 0], [246, 0.52, 10, 0.5], [513, 0.22, 15, 1.2], [910, 0.1, 22, 0.8],
      ]);
      addNoise(signal, this.seed, 0.25, 2_700, 480, (time) => eventEnvelope(time, 0.03, 0.02, 0.09, 0.28));
    },
  },
];

function renderAsset(recipe) {
  const signal = samples(recipe.duration);
  recipe.render(signal);
  if (recipe.loop) taperLoop(signal);
  const levels = normalize(signal, recipe.targetPeak);
  const bytes = wavBytes(signal);
  const first = bytes.readInt16LE(44) / 32_767;
  const last = bytes.readInt16LE(bytes.length - 2) / 32_767;
  return {
    bytes,
    ledger: {
      id: recipe.id,
      file: recipe.file,
      bus: recipe.bus,
      loop: recipe.loop,
      durationSeconds: signal.length / SAMPLE_RATE,
      sampleRateHz: SAMPLE_RATE,
      channels: 1,
      bitDepth: 16,
      byteSize: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      peakDbfs: Number(levels.peakDbfs.toFixed(3)),
      rmsDbfs: Number(levels.rmsDbfs.toFixed(3)),
      loopSeamDelta: recipe.loop ? Number(Math.abs(last - first).toFixed(8)) : null,
      recipe: {
        version: RECIPE_VERSION,
        seed: `0x${Number(recipe.seed).toString(16).padStart(8, '0')}`,
        targetPeakDbfs: recipe.targetPeak,
        synthesis: recipe.synthesis,
      },
    },
  };
}

function bake(root) {
  const assets = [];
  for (const recipe of recipes) {
    const rendered = renderAsset(recipe);
    const destination = join(root, recipe.file);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, rendered.bytes);
    assets.push(rendered.ledger);
  }
  const manifest = {
    version: 5,
    origin: 'synthesized-in-repo',
    provider: null,
    generatedAt: '2026-08-24',
    license: 'AGPL-3.0-or-later',
    recipe: 'tools/bake-audio.mjs',
    recipeVersion: RECIPE_VERSION,
    outputFormat: FORMAT,
    sampleRateHz: SAMPLE_RATE,
    channels: 1,
    bitDepth: 16,
    totalBytes: assets.reduce((sum, asset) => sum + asset.byteSize, 0),
    assets,
  };
  writeFileSync(join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function verify() {
  const scratch = mkdtempSync(join(tmpdir(), 'herd-audio-bake-'));
  try {
    const manifest = bake(scratch);
    const expectedManifest = readFileSync(join(committedRoot, 'manifest.json'));
    const actualManifest = readFileSync(join(scratch, 'manifest.json'));
    if (!expectedManifest.equals(actualManifest)) throw new Error('assets/audio/manifest.json differs from a clean bake');
    for (const asset of manifest.assets) {
      const expected = readFileSync(join(committedRoot, asset.file));
      const actual = readFileSync(join(scratch, asset.file));
      if (!expected.equals(actual)) throw new Error(`${asset.file} differs from a clean bake`);
    }
    process.stdout.write(`audio bake reproducible: ${manifest.assets.length} files, ${manifest.totalBytes} bytes\n`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv.includes('--check')) verify();
else {
  const manifest = bake(committedRoot);
  process.stdout.write(`baked ${manifest.assets.length} files to assets/audio (${manifest.totalBytes} bytes)\n`);
}
