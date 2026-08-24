// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { formatRunTime } from '@app/ui/time';
import { useScoreStore } from './store';

export function OnlineTimes() {
  const status = useScoreStore((state) => state.submissionStatus);
  const message = useScoreStore((state) => state.submissionMessage);
  const entries = useScoreStore((state) => state.entries);

  if (status === 'idle') return null;
  return (
    <section className="herd-online-times" aria-label="Online times" aria-live="polite">
      <p>{message}</p>
      {status === 'ready' && entries.length > 0 ? (
        <ol>
          {entries.slice(0, 5).map((entry) => (
            <li key={entry.persistentId}>
              <span>{entry.rank}. {entry.displayName}</span>
              <span>{formatRunTime(entry.scoreSeconds * 1000)}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
