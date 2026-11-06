// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useState } from 'react';
import { useT } from '@app/i18n/store';
import { scoresController } from './controller';
import { useScoreStore } from './store';

export function PlayerIdentity() {
  const t = useT();
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
          <span className="herd-visually-hidden">{t('identity.nameLabel')}</span>
          <input
            className="herd-name-input"
            value={name}
            maxLength={20}
            autoComplete="nickname"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit" className="herd-text-button" disabled={renaming}>{t('common.save')}</button>
        <button type="button" className="herd-text-button" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
        {message ? <span className="herd-identity-message" role="status">{message}</span> : null}
      </form>
    );
  }

  const [nameBefore, nameAfter] = t('identity.runningAs').split('{name}');
  return (
    <div className="herd-identity" aria-live="polite">
      {identity ? (
        <>
          <span>{nameBefore}<strong>{identity.displayName}</strong>{nameAfter}</span>
          <button type="button" className="herd-text-button" onClick={() => setEditing(true)}>{t('identity.edit')}</button>
        </>
      ) : (
        <span>{t(status === 'connecting' ? 'identity.connecting' : 'identity.unavailable')}</span>
      )}
    </div>
  );
}
