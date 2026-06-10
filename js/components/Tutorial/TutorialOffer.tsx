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
import { useTranslation } from 'react-i18next';
import { pastoral, alpha } from '../ui/tokens';
import { RailPortal } from '../ui/RailPortal.js';
import { shouldOfferTutorial, markTutorialDone } from './tutorialMachine.js';
import { startTutorial } from './startTutorial.js';

export function TutorialOffer({ dogId }: { dogId?: string }) {
    const { t } = useTranslation();
    const [offered] = useState(() => shouldOfferTutorial());
    const [hidden, setHidden] = useState(false);

    if (!offered || hidden) return null;

    // Cycle 87 Phase 6: the card rides the shared top rail (order 10, below
    // any hub toast at order 0), so a simultaneous toast and the offer stack
    // with a gap instead of overlapping in the same top-center band. The rail
    // owns position/centering; the card keeps its visual language.
    const card: CSSProperties = {
        width: 'min(360px, 92vw)',
        padding: '14px 16px',
        borderRadius: 16,
        background: alpha(pastoral.cream, 88),
        border: `1px solid ${pastoral.glassWarmBorder}`,
        boxShadow: '0 10px 30px rgba(43,38,32,0.24)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        color: pastoral.ink,
        pointerEvents: 'auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
    };

    const btnBase: CSSProperties = {
        borderRadius: 10,
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 600,
        minHeight: 44,
        cursor: 'pointer',
    };

    return (
        <RailPortal order={10}>
        <div style={card} role="dialog" aria-label={t('tutorial.offerTitle')} data-testid="tutorial-offer">
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
        </RailPortal>
    );
}
