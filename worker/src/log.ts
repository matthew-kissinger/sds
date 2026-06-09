// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// P0-OBS: structured one-line JSON logging for the Worker, the DOs, and the
// authoritative sim. Every line is a single JSON object of the shape
// { level, event, roomCode?, ts, ...fields } so Workers observability /
// Logpush can ingest and query it without any parsing heuristics.
// Dependency-free by design; console.* is the only sink.

type LogLevel = 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown> & { roomCode?: string };

function emit(level: LogLevel, event: string, fields?: LogFields): void {
  const ts = Date.now();
  let out: string;
  try {
    out = JSON.stringify({ level, event, ts, ...fields });
  } catch {
    // A non-serializable field (circular ref, BigInt) must never break the
    // caller. Drop the fields, keep the event.
    out = JSON.stringify({ level, event, ts, logError: 'unserializable fields' });
  }
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.log(out);
}

export const log = {
  info: (event: string, fields?: LogFields): void => emit('info', event, fields),
  warn: (event: string, fields?: LogFields): void => emit('warn', event, fields),
  error: (event: string, fields?: LogFields): void => emit('error', event, fields),
};

// Render an unknown thrown value into a short string fit for a log field.
// Prefers the stack (it embeds the message), caps length so a pathological
// error can't bloat a log line.
export function errStr(e: unknown): string {
  const anyErr = e as { stack?: unknown; message?: unknown } | null;
  const s = (typeof anyErr?.stack === 'string' && anyErr.stack)
    || (typeof anyErr?.message === 'string' && anyErr.message)
    || String(e);
  return s.length > 2000 ? s.slice(0, 2000) : s;
}
