// Minimal HMAC-SHA256 JWT signer/verifier for short-lived session tokens.

const enc = new TextEncoder();

function b64urlEncode(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === 'string') bytes = enc.encode(data);
  else if (data instanceof Uint8Array) bytes = data;
  else bytes = new Uint8Array(data);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return new Uint8Array(sig);
}

export async function signJwt(payload: Record<string, unknown>, secret: string, ttlSeconds = 86400): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const headerB = b64urlEncode(JSON.stringify(header));
  const bodyB = b64urlEncode(JSON.stringify(body));
  const signingInput = `${headerB}.${bodyB}`;
  const sig = await hmac(secret, signingInput);
  return `${signingInput}.${b64urlEncode(sig)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<Record<string, any> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const expected = await hmac(secret, `${h}.${b}`);
  const provided = b64urlDecode(s);
  if (expected.length !== provided.length) return null;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) ok |= expected[i] ^ provided[i];
  if (ok !== 0) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(b)));
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
