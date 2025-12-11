/**
 * ExtremeTuningPanel
 * Developer-facing tuning UI for extreme/insane solo modes.
 * Lets you live-adjust flocking/difficulty parameters without affecting sandbox.
 */
import React, { createElement, useMemo, useState, useEffect } from 'react';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { getGameState } from '../../GameBridge.js';

const DEFAULT_TUNING_VALUES = {
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
    edgeTurnForce: 0.05
};

const FIELDS = [
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
    { key: 'edgeTurnForce', label: 'Edge Turn Force', min: 0.05, max: 1.0, step: 0.05 }
];

function Slider({ value, min, max, step, onChange }) {
    const percentage = ((value - min) / (max - min)) * 100;
    return createElement('input', {
        type: 'range',
        min,
        max,
        step,
        value,
        onChange: (e) => {
            e.stopPropagation();
            onChange(parseFloat(e.target.value));
        },
        onClick: (e) => e.stopPropagation(),
        style: {
            width: '120px',
            height: '6px',
            borderRadius: '3px',
            appearance: 'none',
            WebkitAppearance: 'none',
            background: `linear-gradient(to right, #a855f7 0%, #a855f7 ${percentage}%, #374151 ${percentage}%, #374151 100%)`,
            cursor: 'pointer',
            outline: 'none'
        }
    });
}

export function ExtremeTuningPanel({ isVisible, onClose, isCompact = false }) {
    const initialValues = useMemo(() => {
        const gs = getGameState();
        const params = gs?.params || {};
        const merged = {};
        for (const field of FIELDS) {
            merged[field.key] = params[field.key] ?? DEFAULT_TUNING_VALUES[field.key];
        }
        return merged;
    }, []);

    const [values, setValues] = useState(initialValues);

    // Refresh values when panel is opened (e.g., after restart)
    useEffect(() => {
        if (!isVisible) return;
        const gs = getGameState();
        const params = gs?.params || {};
        const merged = {};
        for (const field of FIELDS) {
            merged[field.key] = params[field.key] ?? DEFAULT_TUNING_VALUES[field.key];
        }
        setValues(merged);
    }, [isVisible]);

    const updateValue = (key, value) => {
        setValues(prev => ({ ...prev, [key]: value }));
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
        for (const field of FIELDS) {
            gs.params[field.key] = DEFAULT_TUNING_VALUES[field.key];
        }
    };

    if (!isVisible) return null;

    return createElement('div', {
        style: {
            position: 'absolute',
            top: isCompact ? '0.5rem' : '1rem',
            right: isCompact ? '0.5rem' : '1rem',
            zIndex: 1500,
            width: isCompact ? '17rem' : '21rem',
            maxHeight: '80vh',
            overflowY: 'auto',
            pointerEvents: 'auto'
        }
    }, createElement(Panel, {
        size: 'md',
        style: { padding: isCompact ? '0.75rem' : '1rem' }
    }, [
        createElement('div', {
            key: 'header',
            style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.5rem'
            }
        }, [
            createElement(PanelTitle, { key: 'title' }, 'Extreme / Insane Tuning'),
            createElement('button', {
                key: 'close',
                onClick: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose?.();
                },
                style: {
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '0.4rem',
                    color: 'white',
                    padding: '0.2rem 0.5rem',
                    cursor: 'pointer'
                }
            }, 'Close')
        ]),

        createElement('button', {
            key: 'reset',
            onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleReset();
            },
            style: {
                width: '100%',
                marginBottom: '0.75rem',
                background: 'rgba(168,85,247,0.15)',
                border: '1px solid rgba(168,85,247,0.6)',
                borderRadius: '0.5rem',
                color: '#e9d5ff',
                padding: '0.4rem 0.6rem',
                fontWeight: 600,
                cursor: 'pointer'
            }
        }, 'Reset to Defaults'),

        ...FIELDS.map(field => createElement('div', {
            key: field.key,
            style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.35rem 0',
                borderBottom: '1px solid rgba(255,255,255,0.08)'
            }
        }, [
            createElement('div', {
                key: 'label',
                style: { color: 'white', fontSize: isCompact ? '0.75rem' : '0.85rem' }
            }, field.label),
            createElement('div', {
                key: 'control',
                style: { display: 'flex', alignItems: 'center', gap: '0.5rem' }
            }, [
                createElement(Slider, {
                    key: 'slider',
                    value: values[field.key],
                    min: field.min,
                    max: field.max,
                    step: field.step,
                    onChange: (v) => updateValue(field.key, v)
                }),
                createElement('span', {
                    key: 'value',
                    style: {
                        color: 'rgba(255,255,255,0.8)',
                        fontSize: isCompact ? '0.7rem' : '0.8rem',
                        minWidth: '3rem',
                        textAlign: 'right'
                    }
                }, values[field.key].toFixed(3).replace(/0+$/,'').replace(/\.$/,''))
            ])
        ]))
    ]));
}
