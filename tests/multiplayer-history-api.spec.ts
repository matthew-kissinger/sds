// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, it, vi } from 'vitest';
const { roomToken } = vi.hoisted(()=>({roomToken:vi.fn()}));
vi.mock('@app/scores/controller',()=>({scoresController:{roomToken}}));
import { dashboard, myHistory } from '../app/src/multiplayer/historyApi';
afterEach(()=>{vi.unstubAllGlobals();vi.resetAllMocks();});
it('renews only an expired player token once and keeps the pagination cursor',async()=>{
  roomToken.mockResolvedValueOnce('old').mockResolvedValueOnce('new');
  const fetch=vi.fn().mockResolvedValueOnce(Response.json({error:'identity_expired'},{status:401}))
    .mockResolvedValueOnce(Response.json({matches:[],stats:[],next:null}));vi.stubGlobal('fetch',fetch);
  await myHistory('123:abc',new AbortController().signal);
  expect(roomToken.mock.calls).toEqual([[false],[true]]);
  expect(fetch.mock.calls.map(c=>c[0])).toEqual(['/r/stats/me?before=123%3Aabc','/r/stats/me?before=123%3Aabc']);
  expect(fetch.mock.calls[1]![1].headers.Authorization).toBe('Bearer new');
});
it.each([401,503])('never resets identity for unrelated %s responses or owner access',async status=>{
  roomToken.mockResolvedValue('player');
  const fetch=vi.fn().mockImplementation(()=>Promise.resolve(Response.json({error:'unavailable'},{status})));vi.stubGlobal('fetch',fetch);
  await expect(myHistory(null,new AbortController().signal)).rejects.toThrow();
  expect(roomToken).toHaveBeenCalledTimes(1);
  await expect(dashboard('owner-key',7,new AbortController().signal)).rejects.toThrow();
  expect(roomToken).toHaveBeenCalledTimes(1);
});
it('does not fetch if identity resolution finishes after the view closes',async()=>{
  const abort=new AbortController();roomToken.mockImplementation(()=>{abort.abort();return Promise.resolve('token');});
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(myHistory(null,abort.signal)).rejects.toMatchObject({name:'AbortError'});expect(fetch).not.toHaveBeenCalled();
});
