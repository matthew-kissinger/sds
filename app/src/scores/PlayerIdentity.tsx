// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useState } from 'react';
import { scoresController } from './controller';
import { useScoreStore } from './store';

export function PlayerIdentity() {
  const identity = useScoreStore((state) => state.identity);
  const status = useScoreStore((state) => state.identityStatus);
  const renaming = useScoreStore((state) => state.renaming);
  const message = useScoreStore((state) => state.renameMessage || state.identityMessage);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(identity?.displayName ?? '');

  useEffect(() => {
    if (!editing) setName(identity?.displayName ?? '');
  }, [editing, identity?.displayName]);

  const save = async () => {
    if (await scoresController.rename(name)) setEditing(false);
  };

  if (editing) {
    return (
      <form className="herd-identity-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label>
          <span className="herd-visually-hidden">Leaderboard name</span>
          <input
            className="herd-name-input"
            value={name}
            maxLength={20}
            autoComplete="nickname"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit" className="herd-text-button" disabled={renaming}>Save</button>
        <button type="button" className="herd-text-button" onClick={() => setEditing(false)}>Cancel</button>
        {message ? <span className="herd-identity-message" role="status">{message}</span> : null}
      </form>
    );
  }

  return (
    <div className="herd-identity" aria-live="polite">
      {identity ? (
        <>
          <span>Running as <strong>{identity.displayName}</strong></span>
          <button type="button" className="herd-text-button" onClick={() => setEditing(true)}>Edit</button>
        </>
      ) : (
        <span>{status === 'connecting' ? 'Choosing a running name' : 'Online times unavailable'}</span>
      )}
    </div>
  );
}
