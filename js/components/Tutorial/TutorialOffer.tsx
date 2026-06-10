// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P1-TUTORIAL: the first-run offer card, mounted by the entrance.
 *
 * Self-gating: renders nothing once sds:tutorialDone is set. "Show me" starts
 * the guided practice run on Home Field (see ./index.js); "No thanks" counts
 * as a skip and persists the flag so the offer never auto-shows again. The
 * card never blocks the entrance: Play, world browsing, and the corner nav
 * all stay live around it.
 */
import { useState, type CSSProperties } from 'react';
import { Z } from '../../ui/zIndex.js';
import { useTranslation } from 'react-i18next';
import { pastoral, alpha } from '../ui/tokens';
import { shouldOfferTutorial, markTutorialDone } from './tutorialMachine.js';
import { startTutorial } from './startTutorial.js';

export function TutorialOffer({ dogId }: { dogId?: string }) {
    const { t } = useTranslation();
    const [offered] = useState(() => shouldOfferTutorial());
    const [hidden, setHidden] = useState(false);

    if (!offered || hidden) return null;

    const card: CSSProperties = {
        position: 'absolute',
        top: 'max(76px, calc(env(safe-area-inset-top) + 64px))',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(360px, 92%)',
        padding: '14px 16px',
        borderRadius: 16,
        background: alpha(pastoral.cream, 88),
        border: `1px solid ${pastoral.glassWarmBorder}`,
        boxShadow: '0 10px 30px rgba(43,38,32,0.24)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        color: pastoral.ink,
        zIndex: Z.toast,
        fontFamily: 'system-ui, -apple-system, sans-serif',
    };

    const btnBase: CSSProperties = {
        borderRadius: 10,
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
    };

    return (
        <div style={card} role="dialog" aria-label={t('tutorial.offerTitle')}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{t('tutorial.offerTitle')}</div>
            <div style={{ fontSize: 13, color: pastoral.inkSoft, marginTop: 4, lineHeight: 1.35 }}>
                {t('tutorial.offerBody')}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                    onClick={() => {
                        setHidden(true);
                        void startTutorial({ dogId });
                    }}
                    style={{ ...btnBase, flex: 1, border: 'none', background: pastoral.accentMeadow, color: pastoral.cream }}
                >
                    {t('tutorial.offerStart')}
                </button>
                <button
                    onClick={() => {
                        markTutorialDone();
                        setHidden(true);
                    }}
                    style={{ ...btnBase, border: `1px solid ${pastoral.glassWarmBorder}`, background: alpha(pastoral.ink, 5), color: pastoral.ink }}
                >
                    {t('tutorial.offerSkip')}
                </button>
            </div>
        </div>
    );
}
