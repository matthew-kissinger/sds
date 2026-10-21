// SPDX-License-Identifier: AGPL-3.0-or-later
// Pilot-only access gate. Never imported by the public game Worker.
export interface PilotEnv { STAGING_PASSCODE: string; STAGING_END: string }
const COOKIE = '__Host-sds-pilot';
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function page(message: string, status: number) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sheepdog Sim staging</title>
<style>body{font:20px Georgia,serif;background:#f4eddc;color:#273321;max-width:28rem;margin:12vh auto;padding:24px}input,button{font:inherit;box-sizing:border-box;min-height:44px;width:100%;margin:10px 0;padding:10px}</style>
<h1>Sheepdog Sim staging</h1><p>${message}</p>${status === 410 ? '' : '<form method="post"><label for="passcode">Staging passcode</label><input id="passcode" name="passcode" type="password" autocomplete="current-password" required maxlength="128"><button>Enter staging</button></form>'}</html>`,
    { status, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" } });
}
export async function stagingAccess(request: Request, env: PilotEnv): Promise<Response | null> {
  const end = Number(env.STAGING_END);
  if (!env.STAGING_PASSCODE || env.STAGING_PASSCODE.length < 24 || !Number.isSafeInteger(end) || Date.now() >= end) {
    return page('This staging session is closed.', 410);
  }
  const url = new URL(request.url);
  if (url.hostname !== 'staging.sheepdogsim.com') return new Response(null, { status: 403, headers });
  const expected = await digest(`${env.STAGING_PASSCODE}:${end}`);
  const cookie = request.headers.get('Cookie')?.split(';').map(c => c.trim()).find(c => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (cookie && equal(cookie, expected)) return null;
  const navigation = request.method === 'GET' && request.headers.get('Accept')?.includes('text/html') && !request.headers.has('Upgrade');
  if (navigation) return page('Private co-op playtest. Enter the passcode to join.', 401);
  // Only same-origin form navigation authenticates. API Bearer tokens remain independent.
  if (request.method === 'POST' && request.headers.get('Origin') === url.origin
    && request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) {
    if (Number(request.headers.get('Content-Length') ?? 0) > 1024) return new Response(null, { status: 413, headers });
    const reader = request.body?.getReader(); let body = ''; let size = 0;
    if (reader) for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); return new Response(null, { status: 413, headers }); }
      body += new TextDecoder().decode(value);
    }
    const supplied = new URLSearchParams(body).get('passcode') ?? '';
    if (equal(await digest(`${supplied}:${end}`), expected)) return new Response(null, { status: 303,
      headers: { ...headers, Location: url.pathname,
        'Set-Cookie': `${COOKIE}=${expected}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((end - Date.now()) / 1000))}` } });
    return page('Passcode not recognized.', 401);
  }
  return Response.json({ error: 'staging_access_required' }, { status: 401, headers });
}
