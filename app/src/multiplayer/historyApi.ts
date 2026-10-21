// SPDX-License-Identifier: AGPL-3.0-or-later
import { scoresController } from '@app/scores/controller';
import type { OwnerStats, PlayerHistory } from '../../../net/stats';
class HistoryError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
async function read<T>(path: string, token: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path,{headers:{Authorization:`Bearer ${token}`},signal,cache:'no-store'});
  if (!response.ok) {
    const body = await response.json().catch(()=>({error:''})) as { error?: string };
    throw new HistoryError(response.status,body.error ?? '',response.status===401 ? 'Access was not accepted. Try again.' : 'History is unavailable. You can still play.');
  }
  return response.json() as Promise<T>;
}
export async function myHistory(before: string | null, signal: AbortSignal) {
  for (let attempt=0;attempt<2;attempt++) {
    const token = await scoresController.roomToken(attempt===1);
    if (!token) throw new Error('Your player identity is unavailable. Try again.');
    if (signal.aborted) throw new DOMException('Aborted','AbortError');
    try { return await read<PlayerHistory>(`/r/stats/me${before ? `?before=${encodeURIComponent(before)}` : ''}`,token,signal); }
    catch(error) { if (attempt===0 && error instanceof HistoryError && error.status===401 && error.code==='identity_expired') continue; throw error; }
  }
  throw new Error('Your player identity is unavailable. Try again.');
}
export function dashboard(key: string, days: number, signal: AbortSignal) {
  return read<OwnerStats>(`/r/stats/owner?days=${days}`,key,signal);
}
