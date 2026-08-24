// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);

function option(name, fallback) {
  const exact = args.indexOf(`--${name}`);
  if (exact >= 0 && args[exact + 1] && !args[exact + 1].startsWith('--')) return args[exact + 1];
  const prefixed = args.find((arg) => arg.startsWith(`--${name}=`));
  return prefixed ? prefixed.slice(name.length + 3) : fallback;
}

const baseUrl = option('url', '');
const retries = Number(option('retries', '1'));
const requireAnalytics = args.includes('--require-analytics');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pngDimensions(bytes) {
  assert(bytes.length >= 24, 'Social image is not a complete PNG.');
  assert(bytes.subarray(1, 4).toString('ascii') === 'PNG', 'Social image must be PNG.');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function verifyPages(files) {
  const root = files['/'];
  assert(root.includes('<title>Sheepdog Sim - Browser Herding Game</title>'), 'Root title is not canonical.');
  assert(!root.includes('Sheepdog Sim 3'), 'Release number leaked into the public brand.');
  assert(root.includes('name="robots" content="index, follow'), 'Root robots metadata is missing.');
  assert(root.includes('property="og:image" content="https://sheepdogsim.com/og/sheepdog-sim.png"'), 'Open Graph image is missing.');
  assert(root.includes('name="twitter:card" content="summary_large_image"'), 'Twitter card metadata is missing.');

  const jsonLdMatch = root.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  assert(jsonLdMatch, 'Software application JSON-LD is missing.');
  const jsonLd = JSON.parse(jsonLdMatch[1]);
  assert(jsonLd.name === 'Sheepdog Sim', 'JSON-LD name is wrong.');
  assert(Array.isArray(jsonLd['@type']) && jsonLd['@type'].includes('WebApplication'), 'JSON-LD WebApplication type is missing.');
  assert(jsonLd.applicationCategory === 'GameApplication', 'JSON-LD game category is missing.');
  assert(jsonLd.offers?.price === '0', 'JSON-LD free offer is missing.');

  const canonical = {
    '/': 'https://sheepdogsim.com/',
    '/about': 'https://sheepdogsim.com/about',
    '/support': 'https://sheepdogsim.com/support',
    '/privacy': 'https://sheepdogsim.com/privacy',
  };
  for (const [route, expected] of Object.entries(canonical)) {
    assert(files[route].includes(`rel="canonical" href="${expected}"`), `${route} canonical URL is missing.`);
    assert(!files[route].includes('Sheepdog Sim 3'), `${route} contains the retired numbered brand.`);
  }

  assert(files['/robots.txt'].includes('Allow: /'), 'robots.txt does not allow crawling.');
  assert(files['/robots.txt'].includes('Sitemap: https://sheepdogsim.com/sitemap.xml'), 'robots.txt does not advertise the sitemap.');
  for (const expected of Object.values(canonical)) {
    assert(files['/sitemap.xml'].includes(`<loc>${expected}</loc>`), `Sitemap is missing ${expected}.`);
  }
  assert(files['/sitemap.xml'].includes('https://sheepdogsim.com/og/sheepdog-sim.png'), 'Sitemap is missing the launch image.');

  const dimensions = pngDimensions(files['/og/sheepdog-sim.png']);
  assert(dimensions.width === 1200 && dimensions.height === 630, 'Social image must be 1200 by 630 pixels.');

  if (requireAnalytics) {
    assert(root.includes('static.cloudflareinsights.com/beacon.min.js'), 'Cloudflare Web Analytics is not enabled on the deployed page.');
  }

  return { routes: Object.keys(canonical).length, image: dimensions, analytics: requireAnalytics };
}

function readLocal() {
  const dist = join(repo, 'dist');
  const paths = {
    '/': 'index.html',
    '/about': 'about.html',
    '/support': 'support.html',
    '/privacy': 'privacy.html',
    '/robots.txt': 'robots.txt',
    '/sitemap.xml': 'sitemap.xml',
    '/og/sheepdog-sim.png': 'og/sheepdog-sim.png',
  };
  const files = {};
  for (const [route, relative] of Object.entries(paths)) {
    const path = join(dist, relative);
    assert(existsSync(path), `Built discovery surface is missing ${relative}.`);
    files[route] = readFileSync(path);
  }
  for (const route of Object.keys(files)) {
    if (!route.endsWith('.png')) files[route] = files[route].toString('utf8');
  }
  return files;
}

async function readRemote() {
  const origin = new URL(baseUrl);
  const routes = ['/', '/about', '/support', '/privacy', '/robots.txt', '/sitemap.xml', '/og/sheepdog-sim.png'];
  const files = {};
  for (const route of routes) {
    const response = await fetch(new URL(route, origin), {
      headers: { 'user-agent': 'Mozilla/5.0 SheepdogSimReleaseVerifier/1.0' },
      redirect: 'follow',
    });
    assert(response.ok, `${route} returned HTTP ${response.status}.`);
    files[route] = route.endsWith('.png')
      ? Buffer.from(await response.arrayBuffer())
      : await response.text();
  }
  return files;
}

async function run() {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = verifyPages(baseUrl ? await readRemote() : readLocal());
      console.log(JSON.stringify({ source: baseUrl || 'dist', ...result }, null, 2));
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw lastError;
}

await run();
