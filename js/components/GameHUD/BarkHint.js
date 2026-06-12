// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { createElement, useEffect, useState } from 'react';
import { getKeyBindings, getKeyDisplayName } from '../shared/settings.js';

const STORAGE_KEY = 'sds-bark-hint-used';
const AUTO_DISMISS_MS = 9000;

function hasUsedBark() {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

function rememberBarkUsed() {
    try {
        localStorage.setItem(STORAGE_KEY, '1');
    } catch {}
}

function readBarkBinding() {
    return getKeyBindings().bark || 'Space';
}

export function BarkHint({ active = false }) {
    const [visible, setVisible] = useState(() => active && !hasUsedBark());
    const [barkKey, setBarkKey] = useState(readBarkBinding);

    useEffect(() => {
        if (!active || hasUsedBark()) {
            setVisible(false);
            return;
        }

        setVisible(true);
        setBarkKey(readBarkBinding());

        const dismissForUse = () => {
            rememberBarkUsed();
            setVisible(false);
        };
        const onKeyDown = (event) => {
            if (event.code === barkKey) dismissForUse();
        };
        const onBindingsChanged = (event) => {
            const nextKey = event.detail?.bark || readBarkBinding();
            setBarkKey(nextKey);
        };
        const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('sds-bark', dismissForUse);
        window.addEventListener('keybindings-changed', onBindingsChanged);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('sds-bark', dismissForUse);
            window.removeEventListener('keybindings-changed', onBindingsChanged);
        };
    }, [active, barkKey]);

    if (!active || !visible) return null;

    const keyLabel = getKeyDisplayName(barkKey);
    const style = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 10px',
        borderRadius: '8px',
        background: 'var(--color-hint-surface)',
        color: 'var(--color-hint-text)',
        border: '1px solid var(--color-hint-border)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.24)',
        backdropFilter: 'blur(6px)',
        fontSize: '0.92rem',
        fontWeight: 600,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        maxWidth: '92vw',
    };
    const keyStyle = {
        minWidth: '38px',
        padding: '3px 7px',
        borderRadius: '6px',
        background: 'rgba(255,255,255,0.16)',
        border: '1px solid rgba(255,255,255,0.22)',
        color: 'var(--color-text)',
        textAlign: 'center',
        fontSize: '0.82rem',
        lineHeight: 1.1,
    };

    return createElement('div', {
        className: 'bark-hint',
        style,
        'data-sds-bark-hint': 'true',
        'aria-label': `Bark with ${keyLabel}`,
    }, [
        createElement('span', { key: 'label' }, 'Bark'),
        createElement('span', { key: 'key', style: keyStyle }, keyLabel),
    ]);
}
