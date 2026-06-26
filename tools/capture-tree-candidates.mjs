// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 91: render staged tree-candidate GLBs to survey PNGs.
 *
 * For every GLB in tools/asset-gallery/staging/trees (or --dir), renders
 * three views (front, 60-degree, low grazing angle - the sheep-cam read)
 * against a flat ground plane with lighting matched to the production
 * WebGPU bridge (ambient 0.75*PI + directional 1.1*PI), and writes
 * <name>_{front,turn,graze}.png into --out
 * (default cycle91-validation/asset-survey/staging/).
 *
 * Same Playwright + static-server shape as bake-trees.mjs.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = Object.fromEntries(
    process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v ?? true];
    })
);
const DIR = args.dir ?? 'tools/asset-gallery/staging/trees';
const OUT = args.out ?? 'cycle91-validation/asset-survey/staging';
const SIZE = Number(args.size ?? 512);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.glb': 'model/gltf-binary',
};

function startServer() {
    const server = createServer(async (req, res) => {
        try {
            const url = decodeURIComponent(req.url.split('?')[0]);
            if (url === '/') {
                res.setHeader('Content-Type', 'text/html');
                res.end(`<!DOCTYPE html><html><head><script type="importmap">{
                    "imports": {
                        "three": "/node_modules/three/build/three.module.js",
                        "three/addons/": "/node_modules/three/examples/jsm/"
                    }
                }</script></head><body></body></html>`);
                return;
            }
            const path = resolve(ROOT, '.' + url);
            if (!path.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
            const data = await readFile(path);
            res.setHeader('Content-Type', MIME[extname(path).toLowerCase()] || 'application/octet-stream');
            res.end(data);
        } catch (err) {
            res.writeHead(404); res.end(String(err.message));
        }
    });
    return new Promise((res, rej) => {
        server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port }));
        server.on('error', rej);
    });
}

async function main() {
    const files = (await readdir(resolve(ROOT, DIR))).filter((f) => f.endsWith('.glb')).sort();
    if (!files.length) { console.error(`[CAPTURE] no GLBs in ${DIR}`); process.exit(1); }
    await mkdir(resolve(ROOT, OUT), { recursive: true });

    const { server, port } = await startServer();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
    page.on('pageerror', (e) => console.error('[PAGE ERROR]', e.message));

    try {
        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
        await page.evaluate(async ({ size }) => {
            const THREE = await import('three');
            const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
            const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
            const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
            renderer.setSize(size, size);
            document.body.appendChild(renderer.domElement);
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0xbfd4e6); // flat sky, no distractions
            scene.add(new THREE.AmbientLight(0xffffff, 0.75 * Math.PI));
            const dir = new THREE.DirectionalLight(0xffffff, 1.1 * Math.PI);
            dir.position.set(1.5, 2.2, 3.0);
            scene.add(dir);
            const ground = new THREE.Mesh(
                new THREE.CircleGeometry(40, 32).rotateX(-Math.PI / 2),
                new THREE.MeshLambertMaterial({ color: 0x5a7d44 }),
            );
            scene.add(ground);
            const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath('/node_modules/three/examples/jsm/libs/draco/');
            window.__cap = { THREE, GLTFLoader, dracoLoader, renderer, scene, camera, current: null };
        }, { size: SIZE });

        for (const file of files) {
            const name = file.replace(/\.glb$/, '');
            const shots = await page.evaluate(async ({ url, scaleTo }) => {
                const { THREE, GLTFLoader, dracoLoader, renderer, scene, camera } = window.__cap;
                if (window.__cap.current) scene.remove(window.__cap.current);
                const loader = new GLTFLoader();
                loader.setDRACOLoader(dracoLoader);
                const gltf = await new Promise((res, rej) => loader.load(url, res, undefined, rej));
                const model = gltf.scene;
                // Staged trees are normalized to ~1m; scale to a typical
                // in-game placement (~20m tree) so texture density reads true.
                model.scale.setScalar(scaleTo);
                scene.add(model);
                window.__cap.current = model;
                const bbox = new THREE.Box3().setFromObject(model);
                const c = bbox.getCenter(new THREE.Vector3());
                const h = bbox.max.y - bbox.min.y;
                const r = Math.max(h, bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z);
                const out = {};
                const views = {
                    front: { az: 0, el: 0.25, d: r * 1.9 },
                    turn: { az: Math.PI / 3, el: 0.25, d: r * 1.9 },
                    graze: { az: Math.PI / 7, el: 0.04, d: r * 2.4 },
                };
                for (const [tag, v] of Object.entries(views)) {
                    camera.position.set(
                        c.x + Math.sin(v.az) * v.d * Math.cos(v.el),
                        c.y + Math.sin(v.el) * v.d,
                        c.z + Math.cos(v.az) * v.d * Math.cos(v.el),
                    );
                    camera.lookAt(c.x, c.y * 0.95, c.z);
                    renderer.render(scene, camera);
                    out[tag] = renderer.domElement.toDataURL('image/png');
                }
                return out;
            }, { url: `/${DIR.replace(/\\/g, '/')}/${file}`, scaleTo: 20 });

            for (const [tag, dataUrl] of Object.entries(shots)) {
                const b64 = dataUrl.split(',')[1];
                await writeFile(resolve(ROOT, OUT, `${name}_${tag}.png`), Buffer.from(b64, 'base64'));
            }
            console.log(`[CAPTURE] ${name} -> 3 views`);
        }
    } finally {
        await browser.close();
        server.close();
    }
    console.log(`[CAPTURE] wrote ${files.length * 3} PNGs to ${OUT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
