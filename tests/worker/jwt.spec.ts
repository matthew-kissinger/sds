// P-SEC-1: coverage for the HMAC-SHA256 JWT signer/verifier that mints the
// short-lived session tokens. The auth rebuild leans on these tokens being
// unforgeable, so this locks down the round-trip plus the four rejection paths:
// tampered signature, expired exp, malformed structure, and wrong secret.
//
// crypto.subtle (used by jwt.ts hmac) is available in the Node test runtime,
// same as on the Worker V8 isolate - no polyfill needed.
import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt } from '../../worker/src/jwt';

const SECRET = 'test-jwt-secret-do-not-ship';

describe('signJwt / verifyJwt round-trip', () => {
  it('verifies a token signed with the same secret and returns the payload', async () => {
    const token = await signJwt({ persistent_id: 'pid-123' }, SECRET, 86400);
    const payload = await verifyJwt(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.persistent_id).toBe('pid-123');
    // iat/exp are stamped by the signer.
    expect(typeof payload!.iat).toBe('number');
    expect(typeof payload!.exp).toBe('number');
    expect(payload!.exp).toBeGreaterThan(payload!.iat);
  });

  it('preserves the persistent_id subject shape exactly (the 5 consumers read payload.persistent_id)', async () => {
    const token = await signJwt({ persistent_id: 'abc-def' }, SECRET);
    const payload = await verifyJwt(token, SECRET);
    expect(payload!.persistent_id).toBe('abc-def');
    // No accidental `sub` claim - consumers read persistent_id, not sub.
    expect(payload!.sub).toBeUndefined();
  });
});

describe('verifyJwt rejects', () => {
  it('a token with a tampered signature', async () => {
    const token = await signJwt({ persistent_id: 'pid-123' }, SECRET);
    const [h, b] = token.split('.');
    // Re-sign-shaped but corrupt last segment: flip a char in the signature.
    const sig = token.split('.')[2];
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    const tampered = `${h}.${b}.${flipped}`;
    expect(await verifyJwt(tampered, SECRET)).toBeNull();
  });

  it('a token whose payload was swapped without re-signing (impersonation attempt)', async () => {
    const token = await signJwt({ persistent_id: 'victim' }, SECRET);
    const [h, , s] = token.split('.');
    // Attacker rewrites the body to a different persistent_id but cannot
    // produce a matching HMAC without the secret.
    const forgedBody = btoa(JSON.stringify({ persistent_id: 'attacker', iat: 1, exp: 9999999999 }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const forged = `${h}.${forgedBody}.${s}`;
    expect(await verifyJwt(forged, SECRET)).toBeNull();
  });

  it('an expired token (exp in the past)', async () => {
    // ttl = -10 puts exp 10s in the past at signing time.
    const token = await signJwt({ persistent_id: 'pid-123' }, SECRET, -10);
    expect(await verifyJwt(token, SECRET)).toBeNull();
  });

  it('a malformed token (wrong segment count / garbage)', async () => {
    expect(await verifyJwt('not-a-jwt', SECRET)).toBeNull();
    expect(await verifyJwt('only.two', SECRET)).toBeNull();
    expect(await verifyJwt('a.b.c.d', SECRET)).toBeNull();
    expect(await verifyJwt('', SECRET)).toBeNull();
  });

  it('a token signed with a different secret', async () => {
    const token = await signJwt({ persistent_id: 'pid-123' }, SECRET);
    expect(await verifyJwt(token, 'a-different-secret')).toBeNull();
  });
});
