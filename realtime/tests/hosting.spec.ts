// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest';
import realtime from '../index';
import { bindings } from './helpers';

it('serves production invites through the private shell while status stays JSON', async () => {
  let shells = 0;
  const env = { ...bindings, RELEASE_SHA: 'a'.repeat(40), GAME_SHELL: {
    fetch: async () => { shells++; return new Response('<html>game</html>', { headers: { 'Content-Type': 'text/html' } }); },
  } } as never;
  const invite = 'https://sheepdogsim.com/r/na_' + 'b'.repeat(32);
  expect((await realtime.fetch(new Request(invite), env)).headers.get('Content-Type')).toBe('text/html');
  const status = await realtime.fetch(new Request(invite + '/status'), env);
  expect(status.status).toBe(404);
  expect(status.headers.get('Content-Type')).toContain('application/json');
  expect(shells).toBe(1);
  const health = await realtime.fetch(new Request('https://sheepdogsim.com/r/health'), env);
  expect(await health.json()).toEqual({ protocol: 3, gameplay: true, commit: 'a'.repeat(40) });
});
