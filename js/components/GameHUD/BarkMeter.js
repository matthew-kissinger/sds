// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { createElement, useEffect, useState } from 'react';
import { useGameState } from '../hooks/useGameState.js';
import { getKeyBindings, getKeyDisplayName } from '../shared/settings.js';
import { Icon } from '../ui/Icon';
import { pastoral, alpha } from '../ui/tokens';
import { isTutorialSessionActive } from '../Tutorial/index.js';

function readBarkBinding() {
    return getKeyBindings().bark || 'Space';
}

export function BarkMeter({ active = false }) {
    const gameData = useGameState();
    const [barkKey, setBarkKey] = useState(readBarkBinding);

    useEffect(() => {
        const onBindingsChanged = (event) => {
            setBarkKey(event.detail?.bark || readBarkBinding());
        };
        window.addEventListener('keybindings-changed', onBindingsChanged);
        return () => window.removeEventListener('keybindings-changed', onBindingsChanged);
    }, []);

    if (!active || isTutorialSessionActive()) return null;

    const ready = gameData.barkReady === true;
    const ratio = Math.max(0, Math.min(1, gameData.barkCooldownRatio || 0));
    const fillDegrees = Math.round((1 - ratio) * 360);
    const keyLabel = getKeyDisplayName(barkKey);
    // Cycle 112 Phase 3: the ready state names the verb rather than saying
    // "Ready". BarkHint used to sit alongside this carrying the word "Bark" and
    // a second Space chip, so two prompts bound to the same key were on screen
    // at once. The hint is now suppressed wherever this meter renders, and this
    // label is what keeps the binding self-explanatory: the chip reads
    // "Bark [Space]" while available and swaps to the countdown while not.
    const status = ready
        ? 'Bark'
        : `${Math.max(0.1, (gameData.barkCooldownRemainingMs || 0) / 1000).toFixed(1)}s`;

    const shellStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '9px',
        padding: '7px 10px',
        borderRadius: '8px',
        background: ready ? alpha(pastoral.ink, 44) : alpha(pastoral.ink, 34),
        color: pastoral.cream,
        border: `1px solid ${ready ? alpha(pastoral.accentGold, 46) : pastoral.glassWarmBorder}`,
        boxShadow: ready ? `0 8px 24px ${alpha(pastoral.accentGold, 18)}` : '0 6px 20px rgba(0,0,0,0.22)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        fontSize: '0.82rem',
        fontWeight: 650,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
    };
    const ringStyle = {
        width: '30px',
        height: '30px',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: `conic-gradient(${pastoral.accentGold} ${fillDegrees}deg, ${alpha(pastoral.cream, 16)} ${fillDegrees}deg)`,
        boxShadow: ready ? `0 0 14px ${alpha(pastoral.accentGold, 28)}` : 'none',
    };
    const innerStyle = {
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: alpha(pastoral.ink, 56),
    };
    const keyStyle = {
        minWidth: '32px',
        padding: '3px 7px',
        borderRadius: '6px',
        background: alpha(pastoral.cream, 13),
        border: `1px solid ${alpha(pastoral.cream, 18)}`,
        textAlign: 'center',
        fontSize: '0.78rem',
        lineHeight: 1.1,
    };
    const statusStyle = {
        minWidth: '42px',
        color: ready ? pastoral.accentGold : alpha(pastoral.cream, 70),
        textAlign: 'left',
    };

    return createElement('div', {
        className: 'bark-meter',
        style: shellStyle,
        'data-sds-bark-meter': 'true',
        'aria-label': ready ? 'Bark ready' : `Bark ready in ${status}`,
    }, [
        createElement('span', { key: 'ring', style: ringStyle }, createElement('span', { style: innerStyle },
            createElement(Icon, { name: 'sound', size: 16, color: ready ? pastoral.accentGold : alpha(pastoral.cream, 72) })
        )),
        createElement('span', { key: 'status', style: statusStyle }, status),
        createElement('span', { key: 'key', style: keyStyle }, keyLabel),
    ]);
}
