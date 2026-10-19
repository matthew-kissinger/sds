// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The card signature is HMAC-SHA256 of `card:<id>` under JWT_SECRET. The
// secret stays on the worker. A path that does not verify is a 404 before
// any read, the same response as a missing row.

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}

export async function signCardId(id: number, secret: string): Promise<string> {
  return base64Url(await hmac(secret, `card:${id}`));
}

export async function cardSignatureMatches(id: number, sig: string, secret: string): Promise<boolean> {
  const provided = base64UrlDecode(sig);
  if (!provided) return false;
  return sameBytes(provided, await hmac(secret, `card:${id}`));
}

export function sharePath(id: number, sig: string): string {
  return `/c/${id}.${sig}`;
}

const CARD_PATH = /^\/c\/([1-9]\d{0,15})\.([A-Za-z0-9_-]{43})(\.png)?$/;

/** Canonical decimal id, one dot, and an optional `.png`. Anything else is not a card. */
export function parseCardPath(pathname: string): { id: number; sig: string; png: boolean } | null {
  const match = CARD_PATH.exec(pathname);
  if (!match) return null;
  const id = Number(match[1]);
  if (!Number.isSafeInteger(id)) return null;
  return { id, sig: match[2]!, png: match[3] === '.png' };
}
