// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P1-MOBILE-WARN: the pre-round performance warning a mobile client sees when
 * it arms a solo mode over 1,000 sheep (Insane 3,000 / Chaos 5,000). Same warm
 * frosted-glass language as the entrance panel. Two choices, player's call:
 * continue anyway (commits the round) or go back (stays on the entrance to
 * pick a smaller flock). Never a permanent block.
 *
 * Strings ride the shared i18n instance (App initializes it before the
 * entrance chunk loads); the rest of the entrance keeps its literal copy.
 */
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { pastoral, alpha } from '../ui/tokens';
import { formatSheep } from './worlds';

export interface MobilePerfWarningProps {
  /** Sheep count of the armed mode, named in the warning copy. */
  sheepCount: number;
  /** Player chose to play anyway: commit the round. */
  onContinue: () => void;
  /** Player stepped back to pick a smaller flock. */
  onBack: () => void;
}

const card: CSSProperties = {
  background: alpha(pastoral.cream, 94),
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${pastoral.glassWarmBorder}`,
  borderRadius: 22,
  color: pastoral.ink,
  boxShadow: '0 10px 34px rgba(43,38,32,0.28)',
  width: 'min(380px, calc(100% - 32px))',
  padding: '22px 22px 18px',
  textAlign: 'center',
};

const btnBase: CSSProperties = {
  flex: 1, height: 44, borderRadius: 14, cursor: 'pointer',
  fontSize: 14, fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

export function MobilePerfWarning({ sheepCount, onContinue, onBack }: MobilePerfWarningProps) {
  const { t } = useTranslation();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('mobileWarning.title')}
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(43,38,32,0.45)',
      }}
    >
      <div style={card}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}>
          {t('mobileWarning.title')}
        </div>
        <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.45, color: pastoral.inkSoft }}>
          {t('mobileWarning.body', { sheep: formatSheep(sheepCount) })}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button
            onClick={onBack}
            autoFocus
            style={{ ...btnBase, border: 'none', background: pastoral.accentMeadow, color: pastoral.cream }}
          >
            {t('mobileWarning.goBack')}
          </button>
          <button
            onClick={onContinue}
            style={{ ...btnBase, border: `1px solid ${pastoral.glassWarmBorder}`, background: alpha(pastoral.ink, 5), color: pastoral.ink }}
          >
            {t('mobileWarning.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
