/**
 * SDS asset gallery — local browser-based GLB picker.
 *
 * Cycle 15 Phase 1: Matt wants to view many tree/rock/scatter GLB
 * variations in a gallery and pick the best ones. This script spins up
 * a tiny static server that serves:
 *   - the gallery HTML harness (`tools/asset-gallery/index.html`)
 *   - any path under repo ROOT (so the harness can request GLBs from
 *     `assets/models/...`, `tools/asset-gallery/staging/`, etc.)
 *   - `/api/list?dir=...` for directory listings
 *   - `/api/save-picks` POST endpoint for persisting picks
 *
 * Open the URL printed at startup. Pick GLBs visually, click Save Picks
 * (or hit `s`); the picks land in `tools/asset-gallery/picks.json`. From
 * there, run `node tools/asset-gen/integrate.mjs` to wire the picks into
 * the runtime asset pipeline.
 *
 * Usage:
 *   node tools/asset-gallery.mjs                    # default staging dir
 *   node tools/asset-gallery.mjs --dir=assets/models/scatter
 *   node tools/asset-gallery.mjs --port=4321
 *
 * Constrained to ROOT for path-traversal safety (same pattern as
 * `tools/bake-trees.mjs`).
 */

import { createServer } from 'node:http';
import { readFile, readdir, writeFile, stat, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = Object.fromEntries(
    process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v ?? true];
    })
);

const DEFAULT_DIR = 'tools/asset-gallery/staging';
const PICKS_PATH = resolve(ROOT, 'tools/asset-gallery/picks.json');
const PORT = Number(args.port ?? 0); // 0 = auto-assign

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.glsl': 'text/plain',
    '.css': 'text/css',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json'
};

function readBody(req) {
    return new Promise((resolveBody, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolveBody(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function safeResolve(rel) {
    const path = resolve(ROOT, '.' + (rel.startsWith('/') ? rel : '/' + rel));
    if (!path.startsWith(ROOT)) throw new Error('Path traversal blocked: ' + rel);
    return path;
}

async function listGlbs(relDir) {
    const dir = safeResolve(relDir);
    let names;
    try {
        names = await readdir(dir);
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
    const entries = [];
    for (const name of names) {
        if (!name.toLowerCase().endsWith('.glb')) continue;
        const full = resolve(dir, name);
        const st = await stat(full).catch(() => null);
        if (!st || !st.isFile()) continue;
        entries.push({
            name,
            path: relative(ROOT, full).split('\\').join('/'),
            size: st.size,
            mtime: st.mtimeMs
        });
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
}

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        let path = decodeURIComponent(url.pathname);

        if (path === '/' || path === '/gallery') {
            const html = await readFile(resolve(__dirname, 'asset-gallery/index.html'));
            res.setHeader('Content-Type', MIME['.html']);
            res.end(html);
            return;
        }

        if (path === '/api/list') {
            const dir = url.searchParams.get('dir') ?? DEFAULT_DIR;
            const entries = await listGlbs(dir);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ dir, entries }));
            return;
        }

        if (path === '/api/save-picks' && req.method === 'POST') {
            const body = await readBody(req);
            await mkdir(dirname(PICKS_PATH), { recursive: true });
            await writeFile(PICKS_PATH, body, 'utf8');
            const written = relative(ROOT, PICKS_PATH).split('\\').join('/');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, written }));
            return;
        }

        // Static fallthrough — serve any file under ROOT.
        const fsPath = safeResolve(path);
        const data = await readFile(fsPath);
        res.setHeader('Content-Type', MIME[extname(fsPath).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.end(data);
    } catch (err) {
        res.writeHead(err.code === 'ENOENT' ? 404 : 500);
        res.end(`${err.code === 'ENOENT' ? 'Not found' : 'Error'}: ${req.url}\n${err.message}`);
    }
});

server.listen(PORT, '127.0.0.1', () => {
    const port = server.address().port;
    const dir = args.dir ?? DEFAULT_DIR;
    const url = `http://127.0.0.1:${port}/?dir=${encodeURIComponent(dir)}`;
    console.log(`[GALLERY] Serving ROOT=${ROOT}`);
    console.log(`[GALLERY] Picks save to ${relative(ROOT, PICKS_PATH).split('\\').join('/')}`);
    console.log(`[GALLERY] Open ${url}`);
});

process.on('SIGINT', () => { server.close(); process.exit(0); });
