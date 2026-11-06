// SPDX-License-Identifier: AGPL-3.0-or-later
import { translate } from '@app/i18n/store';
import { scoresController } from '@app/scores/controller';
import type { OwnerStats, PlayerHistory } from '../../../net/stats';
class HistoryError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
async function read<T>(path: string, token: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path,{headers:{Authorization:`Bearer ${token}`},signal,cache:'no-store'});
  if (!response.ok) {
    const body = await response.json().catch(()=>({error:''})) as { error?: string };
    throw new HistoryError(response.status,body.error ?? '',translate(response.status===401 ? 'stats.apiDenied' : 'stats.apiUnavailable'));
  }
  return response.json() as Promise<T>;
}
export async function myHistory(before: string | null, signal: AbortSignal) {
  for (let attempt=0;attempt<2;attempt++) {
    const token = await scoresController.roomToken(attempt===1);
    if (!token) throw new Error(translate('stats.identityUnavailable'));
    if (signal.aborted) throw new DOMException('Aborted','AbortError');
    try { return await read<PlayerHistory>(`/r/stats/me${before ? `?before=${encodeURIComponent(before)}` : ''}`,token,signal); }
    catch(error) { if (attempt===0 && error instanceof HistoryError && error.status===401 && error.code==='identity_expired') continue; throw error; }
  }
  throw new Error(translate('stats.identityUnavailable'));
}
export function dashboard(key: string, days: number, signal: AbortSignal) {
  return read<OwnerStats>(`/r/stats/owner?days=${days}`,key,signal);
}
