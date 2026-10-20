// SPDX-License-Identifier: AGPL-3.0-or-later
export class RoomError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
export function requireThat(value: unknown, code: string, status = 409): asserts value {
  if (!value) throw new RoomError(code, status);
}
export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function smallJson(request: Request): Promise<unknown> {
  requireThat(request.headers.get('content-type')?.split(';')[0] === 'application/json', 'content_type', 415);
  const reader = request.body?.getReader();
  requireThat(reader, 'body_required', 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      requireThat(size <= 2048, 'body_too_large', 413);
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)); }
    catch { throw new RoomError('invalid_json', 400); }
  } finally { await reader.cancel().catch(() => {}); }
}
export function object(value: unknown): Record<string, unknown> {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'invalid_body', 400);
  return value as Record<string, unknown>;
}
export function failure(error: unknown): Response {
  return error instanceof RoomError ? json({ error: error.code }, error.status)
    : json({ error: 'service_unavailable' }, 503);
}
export type RpcResult<T> = { ok: true; value: T } | { ok: false; code: string; status: number };
export async function rpc<T>(fn: () => Promise<T>): Promise<RpcResult<T>> {
  try { return { ok: true, value: await fn() }; }
  catch (error) {
    if (error instanceof RoomError) return { ok: false, code: error.code, status: error.status };
    throw error;
  }
}
export function unwrap<T>(result: RpcResult<T>): T {
  if (!result.ok) throw new RoomError(result.code, result.status);
  return result.value;
}
