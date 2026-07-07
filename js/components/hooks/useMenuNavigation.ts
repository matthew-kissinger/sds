// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 60 Phase 2 - controller + keyboard menu navigation.
 *
 * Additive by design: it discovers the native focusable controls inside a
 * container and roves focus over them with the d-pad / left stick / arrow keys.
 * Activation is the element's own click (gamepad A) or native Enter/Space on the
 * focused <button>; B / Escape call onBack. Every existing mouse and touch path
 * is untouched - this only adds a focus ring and a way to move it.
 *
 * The ring appears on the FIRST directional input, so mouse and touch users
 * never see it. Inputs/selects are skipped while typing.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { subscribeMenuGamepad } from '../../input/menuGamepad.js';
import { stepIndex, navAction } from '../../input/menuNav.js';

const FOCUSABLE = 'button:not([disabled]):not([data-nav-skip]), a[href]:not([data-nav-skip]), [data-nav-focusable]';
const DEFAULT_FOCUS = '[data-nav-default]';
const MODAL_SCOPE = '[data-nav-modal]';

export interface MenuNavOptions {
    enabled?: boolean;
    onBack?: () => void;
    /** When false, Escape is left to the surface's own handler (e.g. PauseMenu). Default true. */
    handleEscape?: boolean;
}

export function useMenuNavigation(
    containerRef: RefObject<HTMLElement | null>,
    opts: MenuNavOptions = {},
) {
    const { enabled = true, handleEscape = true } = opts;
    const onBackRef = useRef(opts.onBack);
    onBackRef.current = opts.onBack;
    const idxRef = useRef(-1);

    useEffect(() => {
        if (!enabled) return;

        const itemsNow = (): HTMLElement[] => {
            const root = containerRef.current;
            if (!root) return [];
            const modalScopes = Array.from(document.querySelectorAll<HTMLElement>(MODAL_SCOPE))
                .filter((el) => el.offsetParent !== null);
            if (modalScopes.some((el) => !root.contains(el))) return [];
            return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
                .filter((el) => el.offsetParent !== null);
        };

        const paint = (els: HTMLElement[], i: number) => {
            els.forEach((el, j) => {
                if (j === i) el.setAttribute('data-navfocus', '');
                else el.removeAttribute('data-navfocus');
            });
        };

        const focusAt = (els: HTMLElement[], i: number) => {
            if (!els.length) return;
            const clamped = ((i % els.length) + els.length) % els.length;
            idxRef.current = clamped;
            const el = els[clamped];
            try { el.focus({ preventScroll: false }); } catch { el.focus(); }
            paint(els, clamped);
        };

        const defaultIndex = (els: HTMLElement[]) => els.findIndex((el) => el.matches(DEFAULT_FOCUS));

        const move = (dir: number) => {
            const els = itemsNow();
            if (!els.length) return;
            const active = document.activeElement as HTMLElement | null;
            let cur = active ? els.indexOf(active) : -1;
            if (cur < 0) cur = idxRef.current;
            focusAt(els, stepIndex(cur, els.length, dir, defaultIndex(els)));
        };

        const activate = () => {
            const els = itemsNow();
            const active = document.activeElement as HTMLElement | null;
            const activeIndex = active ? els.indexOf(active) : -1;
            const preferred = defaultIndex(els);
            const el = (idxRef.current >= 0 ? els[idxRef.current] : null)
                || (activeIndex >= 0 ? els[activeIndex] : null)
                || (preferred >= 0 ? els[preferred] : null)
                || els[0];
            if (el && typeof el.click === 'function') el.click();
        };

        const onGamepad = (type: string) => {
            const a = navAction(type);
            if (a.move) move(a.move);
            else if (a.activate) activate();
            else if (a.back) onBackRef.current?.();
        };

        const onKey = (e: KeyboardEvent) => {
            const active = document.activeElement as HTMLElement | null;
            const tag = active?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            switch (e.key) {
                case 'ArrowUp': case 'ArrowLeft': e.preventDefault(); move(-1); break;
                case 'ArrowDown': case 'ArrowRight': e.preventDefault(); move(1); break;
                case 'Escape':
                    if (handleEscape && onBackRef.current) { e.preventDefault(); onBackRef.current(); }
                    break;
                default: break;
            }
        };

        const unsub = subscribeMenuGamepad(onGamepad);
        window.addEventListener('keydown', onKey);
        return () => {
            unsub();
            window.removeEventListener('keydown', onKey);
            const root = containerRef.current;
            if (root) root.querySelectorAll('[data-navfocus]').forEach((el) => el.removeAttribute('data-navfocus'));
            idxRef.current = -1;
        };
    }, [enabled, handleEscape, containerRef]);
}
