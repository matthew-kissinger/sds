// SPDX-License-Identifier: AGPL-3.0-or-later
import { requireThat } from './http';
// Local development has no pilot window. Hosted staging must supply a valid one.
export function deploymentDeadline(env: { STAGING_END?: string }): number {
  if (env.STAGING_END === undefined) return Infinity;
  const end = Number(env.STAGING_END);
  requireThat(Number.isSafeInteger(end) && end > 0, 'pilot_unconfigured', 503);
  return end;
}
