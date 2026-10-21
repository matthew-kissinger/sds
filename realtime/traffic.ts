// SPDX-License-Identifier: AGPL-3.0-or-later
// Per-isolate request abuse bound, not an account-global spending limit.
const buckets = new Map<string, { at: number; tokens: number }>();
export function requestAllowed(ip: string, now: number): boolean {
  let bucket = buckets.get(ip);
  if (!bucket) {
    if (buckets.size >= 4096) {
      for (const [key, value] of buckets) if (now - value.at > 60_000) buckets.delete(key);
      if (buckets.size >= 4096) return false;
    }
    bucket = { at: now, tokens: 60 }; buckets.set(ip, bucket);
  }
  bucket.tokens = Math.min(60, bucket.tokens + Math.max(0, now - bucket.at) / 1000);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens--; return true;
}
