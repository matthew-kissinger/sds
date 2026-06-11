// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 90 one-off: localize where two captures differ (abs-diff heatmap PNG).
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';

const [a, b, out] = process.argv.slice(2);
const sharp = (await import('sharp')).default;
const load = async (p) => sharp(await readFile(resolve(p))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const A = await load(a);
const B = await load(b);
const { width, height } = A.info;
const diff = Buffer.alloc(width * height * 4);
let hot = 0;
for (let i = 0; i < width * height; i++) {
    const d = Math.max(
        Math.abs(A.data[i * 4] - B.data[i * 4]),
        Math.abs(A.data[i * 4 + 1] - B.data[i * 4 + 1]),
        Math.abs(A.data[i * 4 + 2] - B.data[i * 4 + 2]),
    );
    const v = d > 25 ? 255 : d * 4;
    if (d > 25) hot++;
    diff[i * 4] = v; diff[i * 4 + 1] = d > 25 ? 0 : v; diff[i * 4 + 2] = d > 25 ? 0 : v; diff[i * 4 + 3] = 255;
}
await sharp(diff, { raw: { width, height, channels: 4 } }).png().toFile(resolve(out));
console.log(`${basename(a)}: ${hot} px over threshold (${(100 * hot / (width * height)).toFixed(2)}%) -> ${out}`);
