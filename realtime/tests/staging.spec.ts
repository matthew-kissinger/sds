// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import { reset, runInDurableObject } from 'cloudflare:test';
import { stagingAccess } from '../../staging/access';
import stagingRealtime from '../../staging/realtime';
import { deploymentDeadline } from '../deadline';
import { bindings, clients, connect, create, join, register, roomStub } from './helpers';
import type { RoomState } from '../roomState';
const origin = 'https://staging.sheepdogsim.com';
const pilot = () => ({ STAGING_PASSCODE: 'a-random-test-passcode-for-this-test', STAGING_END: String(Date.now() + 60_000) });
afterEach(async () => { for (const c of clients.splice(0)) c.socket.close(1000, 'done'); await reset(); });
describe('staging access and shutdown', () => {
  it('authenticates a form into a secure cookie without consuming API identity authorization', async () => {
    const env = pilot();
    const denied = await stagingAccess(new Request(origin, { headers: { Accept: 'text/html' } }), env);
    expect(denied?.status).toBe(401);
    const login = await stagingAccess(new Request(origin + '/r/na_' + 'a'.repeat(32), { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ passcode: env.STAGING_PASSCODE }) }), env);
    expect(login?.status).toBe(303);
    const cookie = login!.headers.get('Set-Cookie')!;
    expect(cookie).toContain('Secure; HttpOnly; SameSite=Strict');
    expect(login!.headers.get('Location')).toBe('/r/na_' + 'a'.repeat(32));
    expect(await stagingAccess(new Request(origin + '/r/rooms', { method: 'POST', headers: { Cookie: cookie.split(';')[0], Authorization: 'Bearer identity' } }), env)).toBeNull();
    expect((await stagingAccess(new Request(origin + '/r/rooms', { method: 'POST' }), env))?.status).toBe(401);
    expect((await stagingAccess(new Request(origin), { ...env, STAGING_END: '0' }))?.status).toBe(410);
    expect((await stagingAccess(new Request('https://bypass.workers.dev', { headers: { Cookie: cookie.split(';')[0] } }), env))?.status).toBe(403);
    expect((await stagingAccess(new Request(origin, { headers: { Cookie: cookie.split(';')[0] } }), { ...env, STAGING_END: String(Number(env.STAGING_END) + 1) }))?.status).toBe(401);
  });
  it('serves an authorized invite through the private asset binding without reserving a seat', async () => {
    const env = pilot();
    const login = await stagingAccess(new Request(origin, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `passcode=${env.STAGING_PASSCODE}` }), env);
    let shells = 0;
    const response = await stagingRealtime.fetch(new Request(origin + '/r/na_' + 'a'.repeat(32), { headers: { Cookie: login!.headers.get('Set-Cookie')!.split(';')[0] } }),
      { ...bindings, ...env, GAME_SHELL: { fetch: async () => { shells++; return new Response('<html>game</html>', { headers: { 'Content-Type': 'text/html' } }); } } as never });
    expect(shells).toBe(1); expect(response.headers.get('Content-Type')).toBe('text/html');
  });
  it('rejects invalid deadlines and closes a running real room when its deadline arrives', async () => {
    expect(() => deploymentDeadline({ STAGING_END: 'bad' })).toThrow();
    const a = await create(await register('pilot-a')); const ca = await connect(a);
    const cb = await connect(await join(a.handle, await register('pilot-b')));
    await ca.until(v => v.members.length === 2); ca.send('ready', true); cb.send('ready', true);
    await ca.until(v => v.members.every(m => m.ready)); ca.send('start');
    const starting = await ca.until(v => v.phase === 'starting');
    ca.send('loaded', starting.round); cb.send('loaded', starting.round);
    await ca.snapshotUntil(s => s.tick > 3);
    await runInDurableObject(roomStub(a.handle), async (_instance, state) => {
      const room = await state.storage.get<RoomState>('room');
      // Change the actual live room deadline; no fake timer or test-only wire command.
      const instance = _instance as unknown as { room: RoomState };
      instance.room.expiresAt = Date.now() + 100;
      room!.expiresAt = instance.room.expiresAt; await state.storage.put('room', room!);
    });
    await new Promise(resolve => setTimeout(resolve, 300));
    await runInDurableObject(roomStub(a.handle), async instance => {
      const actual = instance as unknown as { room: RoomState; timer: unknown; match: unknown };
      expect(actual.room.phase).toBe('closed'); expect(actual.timer).toBeNull(); expect(actual.match).toBeNull();
    });
  });
});
