// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * ExtremeTuningPanel - developer-facing live tuning for extreme/insane solo
 * modes. Adjusts flocking/difficulty params on the live gameState without
 * touching sandbox.
 *
 * Cycle 52 P3: migrated from the element-factory .js to .tsx + pastoral tokens
 * (the last element-factory HUD holdout). The purple slider/reset accents become
 * warm gold/meadow, white text becomes cream on the warm .ui-panel glass, and the
 * close affordance uses the shared Icon. Behavior is identical: the same FIELDS,
 * the same live gameState.params write, the same reset + compact mode.
 */
import { useMemo, useState, useEffect, type CSSProperties } from 'react';
import { Panel } from '../ui/Panel';
import { Icon } from '../ui/Icon';
import { pastoral, alpha } from '../ui/tokens';
import { getGameState } from '../../GameBridge.js';

interface TuningField {
    key: string;
    label: string;
    min: number;
    max: number;
    step: number;
}

const DEFAULT_TUNING_VALUES: Record<string, number> = {
    speed: 0.1,
    cohesion: 0.1,
    separationDistance: 2,
    perception: 5,
    separationWeight: 1.6,
    alignmentWeight: 1.6,
    fleeMultiplier: 4,
    fleeRadius: 8,
    gateAttraction: 2,
    maxForce: 0.02,
    edgeMargin: 2.5,
    edgeTurnForce: 0.05,
};

const FIELDS: TuningField[] = [
    { key: 'speed', label: 'Speed', min: 0.02, max: 0.4, step: 0.01 },
    { key: 'cohesion', label: 'Cohesion Weight', min: 0, max: 3, step: 0.1 },
    { key: 'separationDistance', label: 'Separation Distance', min: 0.5, max: 6, step: 0.1 },
    { key: 'perception', label: 'Perception Radius', min: 2, max: 15, step: 0.5 },
    { key: 'separationWeight', label: 'Separation Weight', min: 0, max: 5, step: 0.1 },
    { key: 'alignmentWeight', label: 'Alignment Weight', min: 0, max: 3, step: 0.1 },
    { key: 'fleeMultiplier', label: 'Flee Multiplier (Extreme/Insane)', min: 1, max: 8, step: 0.1 },
    { key: 'fleeRadius', label: 'Flee Radius', min: 3, max: 15, step: 0.5 },
    { key: 'gateAttraction', label: 'Gate Attraction', min: 0, max: 2, step: 0.05 },
    { key: 'maxForce', label: 'Max Force', min: 0.005, max: 0.05, step: 0.001 },
    { key: 'edgeMargin', label: 'Edge Margin', min: 2, max: 20, step: 0.5 },
    { key: 'edgeTurnForce', label: 'Edge Turn Force', min: 0.05, max: 1.0, step: 0.05 },
];

interface SliderProps {
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
}

function Slider({ value, min, max, step, onChange }: SliderProps) {
    const percentage = ((value - min) / (max - min)) * 100;
    return (
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => { e.stopPropagation(); onChange(parseFloat(e.target.value)); }}
            onClick={(e) => e.stopPropagation()}
            style={{
                width: '120px',
                height: '6px',
                borderRadius: '3px',
                appearance: 'none',
                WebkitAppearance: 'none',
                background: `linear-gradient(to right, ${pastoral.accentGold} 0%, ${pastoral.accentGold} ${percentage}%, ${alpha(pastoral.cream, 15)} ${percentage}%, ${alpha(pastoral.cream, 15)} 100%)`,
                cursor: 'pointer',
                outline: 'none',
            }}
        />
    );
}

export interface ExtremeTuningPanelProps {
    isVisible: boolean;
    onClose?: () => void;
    isCompact?: boolean;
}

export function ExtremeTuningPanel({ isVisible, onClose, isCompact = false }: ExtremeTuningPanelProps) {
    const initialValues = useMemo(() => {
        const gs = getGameState();
        const params = gs?.params || {};
        const merged: Record<string, number> = {};
        for (const field of FIELDS) merged[field.key] = params[field.key] ?? DEFAULT_TUNING_VALUES[field.key];
        return merged;
    }, []);

    const [values, setValues] = useState<Record<string, number>>(initialValues);

    // Refresh values when the panel is opened (e.g. after a restart).
    useEffect(() => {
        if (!isVisible) return;
        const gs = getGameState();
        const params = gs?.params || {};
        const merged: Record<string, number> = {};
        for (const field of FIELDS) merged[field.key] = params[field.key] ?? DEFAULT_TUNING_VALUES[field.key];
        setValues(merged);
    }, [isVisible]);

    const updateValue = (key: string, value: number) => {
        setValues((prev) => ({ ...prev, [key]: value }));
        const gs = getGameState();
        if (!gs) return;
        gs.params = gs.params || {};
        gs.params[key] = value;
    };

    const handleReset = () => {
        setValues(DEFAULT_TUNING_VALUES);
        const gs = getGameState();
        if (!gs) return;
        gs.params = gs.params || {};
        for (const field of FIELDS) gs.params[field.key] = DEFAULT_TUNING_VALUES[field.key];
    };

    if (!isVisible) return null;

    const wrap: CSSProperties = {
        position: 'absolute',
        top: isCompact ? '0.5rem' : '1rem',
        right: isCompact ? '0.5rem' : '1rem',
        zIndex: 1500,
        width: isCompact ? '17rem' : '21rem',
        maxHeight: '80vh',
        overflowY: 'auto',
        pointerEvents: 'auto',
    };

    return (
        <div style={wrap}>
            <Panel size="md" style={{ padding: isCompact ? '0.75rem' : '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <h2 style={{ margin: 0, fontSize: isCompact ? '0.95rem' : '1.05rem', fontWeight: 700, color: pastoral.cream }}>
                        Extreme / Insane Tuning
                    </h2>
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose?.(); }}
                        aria-label="Close tuning panel"
                        style={{
                            display: 'grid',
                            placeItems: 'center',
                            width: '28px',
                            height: '28px',
                            background: alpha(pastoral.cream, 10),
                            border: `1px solid ${pastoral.glassWarmBorder}`,
                            borderRadius: '0.4rem',
                            color: pastoral.cream,
                            cursor: 'pointer',
                        }}
                    >
                        <Icon name="close" size={15} />
                    </button>
                </div>

                <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleReset(); }}
                    style={{
                        width: '100%',
                        marginBottom: '0.75rem',
                        background: alpha(pastoral.accentMeadow, 15),
                        border: `1px solid ${alpha(pastoral.accentMeadow, 60)}`,
                        borderRadius: '0.5rem',
                        color: pastoral.cream,
                        padding: '0.4rem 0.6rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    Reset to Defaults
                </button>

                {FIELDS.map((field) => (
                    <div
                        key={field.key}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.35rem 0',
                            borderBottom: `1px solid ${alpha(pastoral.cream, 10)}`,
                        }}
                    >
                        <div style={{ color: pastoral.cream, fontSize: isCompact ? '0.75rem' : '0.85rem' }}>{field.label}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Slider
                                value={values[field.key]}
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                onChange={(v) => updateValue(field.key, v)}
                            />
                            <span style={{ color: alpha(pastoral.cream, 80), fontSize: isCompact ? '0.7rem' : '0.8rem', minWidth: '3rem', textAlign: 'right' }}>
                                {values[field.key].toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}
                            </span>
                        </div>
                    </div>
                ))}
            </Panel>
        </div>
    );
}
