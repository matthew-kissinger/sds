// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * RailPortal (Cycle 87 Phase 6): render React children into the shared
 * top-center overlay rail (js/ui/overlayRail.js) so React cards and vanilla
 * toasts stack in ONE flex column instead of overlapping. `order` positions
 * the row among the rail's children: hub toasts mount at order 0, so a card
 * with order 10 always sits below a simultaneous toast.
 */
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ensureTopRail } from '../../ui/overlayRail.js';

export function RailPortal({ order = 0, children }: { order?: number; children: ReactNode }) {
    const rail = ensureTopRail();
    if (!rail) return null;
    return createPortal(
        <div style={{ order, pointerEvents: 'none', display: 'flex', justifyContent: 'center' }}>
            {children}
        </div>,
        rail,
    );
}
