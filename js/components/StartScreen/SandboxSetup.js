// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * SandboxSetup Component
 * Configuration interface for sandbox/creative mode
 */
import React, { createElement, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { Button, BackButton } from '../ui/Button.js';
import { FIELD_SIZES as FIELD_SIZE_BOUNDS, FIELD_SHAPES } from '../../FieldConfig.js';
import { SandboxConfig } from '../../SandboxConfig.js';

// Field size presets - derived from FieldConfig
const FIELD_SIZES = [
    { id: 'small', labelKey: 'sandbox.sizes.small', description: '100x100', bounds: { ...FIELD_SIZE_BOUNDS.small } },
    { id: 'medium', labelKey: 'sandbox.sizes.medium', description: '200x200', bounds: { ...FIELD_SIZE_BOUNDS.medium } },
    { id: 'large', labelKey: 'sandbox.sizes.large', description: '300x300', bounds: { ...FIELD_SIZE_BOUNDS.large } },
    { id: 'huge', labelKey: 'sandbox.sizes.huge', description: '400x400', bounds: { ...FIELD_SIZE_BOUNDS.huge } }
];

// Field shape options - derived from FieldConfig with translation keys
const FIELD_SHAPE_OPTIONS = Object.values(FIELD_SHAPES).map(shape => ({
    id: shape.id,
    labelKey: `sandbox.shapes.${shape.id}`,
    description: shape.description,
    icon: shape.icon
}));

// Cycle 8 Phase 4: scene options for sandbox. 'field' (default) keeps the
// legacy rect-bounded sandbox; the two island scenes use the scene's
// heightfield + island disc as the boundary, and disable the field-shape /
// custom-fences pickers.
const SCENE_OPTIONS = [
    {
        id: 'field',
        label: 'Home Field',
        description: 'Flat fenced pasture - full sandbox controls'
    },
    {
        id: 'rolling-hills',
        label: 'Rolling Hills',
        description: 'Island with corral - 180m radius'
    },
    {
        id: 'open-country',
        label: 'Open Country',
        description: 'Big island with woods + portal - 380m radius'
    }
];

// Fence layout presets
const FENCE_PRESETS = [
    { id: 'open', labelKey: 'sandbox.fencePresets.open', descKey: 'sandbox.fencePresets.openDesc' },
    { id: 'corridor', labelKey: 'sandbox.fencePresets.corridor', descKey: 'sandbox.fencePresets.corridorDesc' },
    { id: 'funnel', labelKey: 'sandbox.fencePresets.funnel', descKey: 'sandbox.fencePresets.funnelDesc' },
    { id: 'maze', labelKey: 'sandbox.fencePresets.maze', descKey: 'sandbox.fencePresets.mazeDesc' },
    { id: 'obstacles', labelKey: 'sandbox.fencePresets.obstacles', descKey: 'sandbox.fencePresets.obstaclesDesc' },
    { id: 'custom', labelKey: 'sandbox.fencePresets.custom', descKey: 'sandbox.fencePresets.customDesc' }
];

// Slider component for number inputs
function Slider({ label, value, min, max, step = 1, onChange, formatValue }) {
    const displayValue = formatValue ? formatValue(value) : value;

    return createElement('div', {
        className: 'mb-4'
    }, [
        createElement('div', {
            key: 'label',
            className: 'flex justify-between items-center mb-2'
        }, [
            createElement('span', {
                key: 'text',
                className: 'text-[#f7f1e6]/80 text-sm font-medium'
            }, label),
            createElement('span', {
                key: 'value',
                className: 'text-[#f7f1e6] font-bold text-sm bg-[#f7f1e6]/10 px-2 py-0.5 rounded'
            }, displayValue)
        ]),
        createElement('input', {
            key: 'slider',
            type: 'range',
            min,
            max,
            step,
            value,
            onChange: (e) => onChange(parseFloat(e.target.value)),
            className: 'w-full h-2 bg-[#f7f1e6]/20 rounded-lg appearance-none cursor-pointer accent-[#5e9e6e]'
        })
    ]);
}

// Option button for selections. Cycle 61 P2: pastoral meadow accent default.
function OptionButton({ label, description, selected, onClick, accentColor = '#5e9e6e' }) {
    return createElement('button', {
        onClick,
        className: `w-full p-3 rounded-xl border-2 text-left transition-all duration-200 ${
            selected
                ? 'bg-[#f7f1e6]/15 border-current'
                : 'bg-[#f7f1e6]/5 border-[#f7f1e6]/10 hover:bg-[#f7f1e6]/10 hover:border-[#f7f1e6]/20'
        }`,
        style: selected ? { borderColor: accentColor, color: accentColor } : {}
    }, [
        createElement('div', {
            key: 'label',
            className: `font-semibold text-sm ${selected ? '' : 'text-[#f7f1e6]'}`
        }, label),
        description && createElement('div', {
            key: 'desc',
            className: 'text-xs text-[#f7f1e6]/60 mt-0.5'
        }, description)
    ]);
}

// Section header
function SectionHeader({ children }) {
    return createElement('h3', {
        className: 'text-[#f7f1e6]/90 font-semibold text-sm uppercase tracking-wide mb-3 mt-5 first:mt-0'
    }, children);
}

export function SandboxSetup({ config, onConfigChange, onStartGame, onEditFences, onBack }) {
    const { t } = useTranslation();
    const { isCompact, isLandscapeMobile } = useResponsive();
    const [activeTab, setActiveTab] = useState('sheep');
    const [shareToast, setShareToast] = useState(null);

    const handleShareLink = useCallback(() => {
        try {
            const cfg = new SandboxConfig(config);
            const encoded = cfg.serialize();
            const url = `${location.origin}/#s/${encoded}`;
            if (url.length > 1800) {
                setShareToast('Config too large to share via URL');
            } else {
                navigator.clipboard.writeText(url).then(() => {
                    setShareToast('Link copied!');
                }).catch(() => {
                    setShareToast('Copy failed - check browser permissions');
                });
            }
        } catch (err) {
            setShareToast('Failed to generate share link');
        }
        setTimeout(() => setShareToast(null), 2000);
    }, [config]);

    // Handle config updates - deep clone to avoid mutation
    const updateConfig = (path, value) => {
        // Deep clone the config to avoid mutating nested objects
        const newConfig = JSON.parse(JSON.stringify({
            sceneId: config.sceneId,
            sheep: config.sheep,
            field: config.field,
            fences: config.fences,
            gates: config.gates,
            pastures: config.pastures,
            rules: config.rules,
            dog: config.dog,
            preset: config.preset,
            name: config.name,
            description: config.description,
            useExtremeBoids: config.useExtremeBoids
        }));

        const keys = path.split('.');
        let current = newConfig;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) current[keys[i]] = {};
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        onConfigChange(newConfig);
    };

    const isIslandScene = config.sceneId && config.sceneId !== 'field';

    // Tabs for mobile/compact view
    const tabs = [
        { id: 'sheep', labelKey: 'sandbox.tabs.sheep' },
        { id: 'field', labelKey: 'sandbox.tabs.field' },
        { id: 'rules', labelKey: 'sandbox.tabs.rules' }
    ];

    // Tab content renderer
    const renderTabContent = () => {
        switch (activeTab) {
            case 'sheep':
                return createElement('div', null, [
                    createElement(SectionHeader, { key: 'h1' }, t('sandbox.sheepCount')),
                    createElement(Slider, {
                        key: 'count',
                        label: t('sandbox.numberOfSheep'),
                        value: config.sheep?.count || 200,
                        min: 10,
                        max: 5000,
                        step: 10,
                        onChange: (v) => updateConfig('sheep.count', v)
                    }),
                    createElement('div', {
                        key: 'presets',
                        className: 'flex gap-2 flex-wrap'
                    }, [
                        [50, 200, 500, 1000, 3000, 5000].map(count =>
                            createElement('button', {
                                key: count,
                                onClick: () => updateConfig('sheep.count', count),
                                className: `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    config.sheep?.count === count
                                        ? 'bg-[#5e9e6e] text-[#f7f1e6]'
                                        : 'bg-[#f7f1e6]/10 text-[#f7f1e6]/70 hover:bg-[#f7f1e6]/20'
                                }`
                            }, count)
                        )
                    ]),

                    createElement(SectionHeader, { key: 'h2' }, t('sandbox.behavior')),
                    createElement(Slider, {
                        key: 'speed',
                        label: t('sandbox.movementSpeed'),
                        value: config.sheep?.behavior?.speed || 0.1,
                        min: 0.05,
                        max: 0.3,
                        step: 0.01,
                        onChange: (v) => updateConfig('sheep.behavior.speed', v),
                        formatValue: (v) => `${Math.round(v * 100)}%`
                    }),
                    createElement(Slider, {
                        key: 'cohesion',
                        label: t('sandbox.flockCohesion'),
                        value: config.sheep?.behavior?.cohesion || 1.0,
                        min: 0.1,
                        max: 2.0,
                        step: 0.1,
                        onChange: (v) => updateConfig('sheep.behavior.cohesion', v),
                        formatValue: (v) => v.toFixed(1)
                    }),
                    createElement(Slider, {
                        key: 'separation',
                        label: t('sandbox.separationDistance'),
                        value: config.sheep?.behavior?.separationDistance || 2.0,
                        min: 1.0,
                        max: 5.0,
                        step: 0.5,
                        onChange: (v) => updateConfig('sheep.behavior.separationDistance', v),
                        formatValue: (v) => v.toFixed(1)
                    })
                ]);

            case 'field':
                return createElement('div', null, [
                    // Cycle 8 Phase 4: scene picker.
                    createElement(SectionHeader, { key: 'h-scene' }, 'Scene'),
                    createElement('div', {
                        key: 'scenes',
                        className: 'grid grid-cols-3 gap-2 mb-2'
                    }, SCENE_OPTIONS.map(scene =>
                        createElement('button', {
                            key: scene.id,
                            onClick: () => updateConfig('sceneId', scene.id),
                            className: `px-2 py-3 rounded-lg transition-all flex items-center justify-center text-center ${
                                (config.sceneId || 'field') === scene.id
                                    ? 'bg-[#5e9e6e] text-[#f7f1e6] ring-2 ring-[#5e9e6e]'
                                    : 'bg-[#f7f1e6]/10 text-[#f7f1e6]/70 hover:bg-[#f7f1e6]/20 hover:text-[#f7f1e6]'
                            }`,
                            title: scene.description
                        }, createElement('span', {
                            className: 'text-xs font-medium'
                        }, scene.label))
                    )),
                    isIslandScene && createElement('div', {
                        key: 'island-notice',
                        className: 'text-[11px] text-[#f7f1e6]/55 mb-3 px-2 py-2 bg-[#f7f1e6]/5 rounded-lg'
                    }, 'Island scene selected. Field size, shape, and custom fences are disabled - the scene\'s heightfield is the boundary.'),
                    !isIslandScene && createElement(SectionHeader, { key: 'h1' }, t('sandbox.fieldSize')),
                    !isIslandScene && createElement('div', {
                        key: 'sizes',
                        className: 'grid grid-cols-2 gap-2'
                    }, FIELD_SIZES.map(size =>
                        createElement(OptionButton, {
                            key: size.id,
                            label: t(size.labelKey),
                            description: size.description,
                            selected: config.field?.size === size.id,
                            onClick: () => updateConfig('field.size', size.id)
                        })
                    )),

                    !isIslandScene && createElement(SectionHeader, { key: 'h-shape' }, t('sandbox.fieldShape')),
                    !isIslandScene && createElement('div', {
                        key: 'shapes',
                        className: 'grid grid-cols-4 gap-2'
                    }, FIELD_SHAPE_OPTIONS.map(shape =>
                        createElement('button', {
                            key: shape.id,
                            onClick: () => {
                                updateConfig('field.shape', shape.id);
                                // If custom shape is selected, open the shape editor
                                if (shape.id === 'custom' && onEditFences) {
                                    // Pass a flag to indicate shape drawing mode
                                    onEditFences({ mode: 'shape' });
                                }
                            },
                            className: `p-2 rounded-lg transition-all flex flex-col items-center justify-center ${
                                config.field?.shape === shape.id
                                    ? 'bg-[#5e9e6e] text-[#f7f1e6] ring-2 ring-[#5e9e6e]'
                                    : 'bg-[#f7f1e6]/10 text-[#f7f1e6]/70 hover:bg-[#f7f1e6]/20 hover:text-[#f7f1e6]'
                            }`,
                            title: shape.description
                        }, [
                            shape.icon && createElement('span', { key: 'icon', className: 'text-2xl mb-1' }, shape.icon),
                            createElement('span', { key: 'label', className: 'text-[10px] font-medium' }, t(shape.labelKey))
                        ])
                    )),
                    // Show "Edit Shape" button when custom shape is selected
                    !isIslandScene && config.field?.shape === 'custom' && createElement(Button, {
                        key: 'edit-shape-btn',
                        variant: 'secondary',
                        onClick: () => onEditFences && onEditFences({ mode: 'shape' }),
                        className: 'w-full mt-2 mb-2',
                        style: { backgroundColor: 'rgba(224, 164, 88, 0.2)', borderColor: 'rgba(224, 164, 88, 0.5)' }
                    }, config.field?.customBorderPoints?.length >= 3
                        ? t('sandbox.editCustomShape')
                        : t('sandbox.drawCustomShape')),

                    !isIslandScene && createElement(SectionHeader, { key: 'h2' }, t('sandbox.fenceLayout')),
                    !isIslandScene && createElement('div', {
                        key: 'presets',
                        className: 'grid grid-cols-2 gap-2'
                    }, FENCE_PRESETS.map(preset =>
                        createElement(OptionButton, {
                            key: preset.id,
                            label: t(preset.labelKey),
                            description: t(preset.descKey),
                            selected: config.preset === preset.id,
                            onClick: () => {
                                updateConfig('preset', preset.id);
                                if (preset.id === 'custom' && onEditFences) {
                                    onEditFences();
                                }
                            },
                            accentColor: preset.id === 'custom' ? '#e0a458' : '#5e9e6e'
                        })
                    )),

                    !isIslandScene && config.preset === 'custom' && createElement(Button, {
                        key: 'edit-btn',
                        variant: 'secondary',
                        onClick: onEditFences,
                        className: 'w-full mt-3'
                    }, t('sandbox.editFenceLayout'))
                ]);

            case 'rules':
                return createElement('div', null, [
                    createElement(SectionHeader, { key: 'h1' }, t('sandbox.timer')),
                    createElement('div', {
                        key: 'timer-toggle',
                        className: 'flex items-center justify-between p-3 bg-[#f7f1e6]/5 rounded-xl mb-3'
                    }, [
                        createElement('span', { key: 'label', className: 'text-[#f7f1e6]/80' }, t('sandbox.enableTimer')),
                        createElement('button', {
                            key: 'toggle',
                            onClick: () => updateConfig('rules.timerEnabled', !config.rules?.timerEnabled),
                            className: `w-12 h-6 rounded-full transition-colors ${
                                config.rules?.timerEnabled ? 'bg-[#5e9e6e]' : 'bg-[#f7f1e6]/20'
                            }`
                        }, createElement('div', {
                            className: `w-5 h-5 rounded-full bg-[#f7f1e6] shadow-md transform transition-transform ${
                                config.rules?.timerEnabled ? 'translate-x-6' : 'translate-x-0.5'
                            }`
                        }))
                    ]),

                    config.rules?.timerEnabled && [
                        createElement('div', {
                            key: 'timer-mode',
                            className: 'flex gap-2 mb-3'
                        }, [
                            createElement(OptionButton, {
                                key: 'countup',
                                label: t('sandbox.countUp'),
                                description: t('sandbox.countUpDesc'),
                                selected: config.rules?.timerMode !== 'countdown',
                                onClick: () => updateConfig('rules.timerMode', 'countup')
                            }),
                            createElement(OptionButton, {
                                key: 'countdown',
                                label: t('sandbox.countdown'),
                                description: t('sandbox.countdownDesc'),
                                selected: config.rules?.timerMode === 'countdown',
                                onClick: () => updateConfig('rules.timerMode', 'countdown'),
                                accentColor: '#e0a458'
                            })
                        ]),

                        config.rules?.timerMode === 'countdown' && createElement(Slider, {
                            key: 'time-limit',
                            label: t('sandbox.timeLimit'),
                            value: config.rules?.timeLimit || 180,
                            min: 60,
                            max: 600,
                            step: 30,
                            onChange: (v) => updateConfig('rules.timeLimit', v),
                            formatValue: (v) => `${Math.floor(v / 60)}:${(v % 60).toString().padStart(2, '0')}`
                        })
                    ],

                    createElement(SectionHeader, { key: 'h2' }, t('sandbox.winCondition')),
                    createElement('div', {
                        key: 'win-conditions',
                        className: 'space-y-2'
                    }, [
                        createElement(OptionButton, {
                            key: 'all',
                            label: t('sandbox.herdAllSheep'),
                            description: t('sandbox.herdAllSheepDesc'),
                            selected: config.rules?.winCondition === 'all',
                            onClick: () => updateConfig('rules.winCondition', 'all')
                        }),
                        createElement(OptionButton, {
                            key: 'percentage',
                            label: t('sandbox.percentageGoal'),
                            description: t('sandbox.percentageGoalDesc'),
                            selected: config.rules?.winCondition === 'percentage',
                            onClick: () => updateConfig('rules.winCondition', 'percentage'),
                            accentColor: '#5e9e6e'
                        }),
                        config.rules?.winCondition === 'percentage' && createElement(Slider, {
                            key: 'percentage-slider',
                            label: t('sandbox.targetPercentage'),
                            value: config.rules?.winPercentage || 75,
                            min: 25,
                            max: 100,
                            step: 5,
                            onChange: (v) => updateConfig('rules.winPercentage', v),
                            formatValue: (v) => `${v}%`
                        }),
                        createElement(OptionButton, {
                            key: 'none',
                            label: t('sandbox.freePlay'),
                            description: t('sandbox.freePlayDesc'),
                            selected: config.rules?.winCondition === 'none',
                            onClick: () => updateConfig('rules.winCondition', 'none'),
                            accentColor: '#d99a8f'
                        })
                    ]),

                    // Performance optimization toggle
                    createElement(SectionHeader, { key: 'h3' }, t('sandbox.performance', 'Performance')),
                    createElement('div', {
                        key: 'extreme-boids-toggle',
                        className: 'flex items-center justify-between p-3 bg-[#f7f1e6]/5 rounded-xl mb-3'
                    }, [
                        createElement('div', { key: 'label-container' }, [
                            createElement('span', { key: 'label', className: 'text-[#f7f1e6]/80 block' },
                                t('sandbox.optimizedFlocking', 'Optimized Flocking')),
                            createElement('span', { key: 'desc', className: 'text-[#f7f1e6]/50 text-xs block mt-0.5' },
                                t('sandbox.optimizedFlockingDesc', 'Better performance with many sheep'))
                        ]),
                        createElement('button', {
                            key: 'toggle',
                            onClick: () => updateConfig('useExtremeBoids', !config.useExtremeBoids),
                            className: `w-12 h-6 rounded-full transition-colors ${
                                config.useExtremeBoids ? 'bg-[#5e9e6e]' : 'bg-[#f7f1e6]/20'
                            }`
                        }, createElement('div', {
                            className: `w-5 h-5 rounded-full bg-[#f7f1e6] shadow-md transform transition-transform ${
                                config.useExtremeBoids ? 'translate-x-6' : 'translate-x-0.5'
                            }`
                        }))
                    ])
                ]);

            default:
                return null;
        }
    };

    // Calculate sheep count display for summary
    const sheepCount = config.sheep?.count || 200;
    const fieldSizeConfig = FIELD_SIZES.find(s => s.id === config.field?.size);
    const fieldSize = fieldSizeConfig ? t(fieldSizeConfig.labelKey) : t('sandbox.sizes.medium');

    return createElement('div', {
        style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: '100%'
        }
    }, createElement(Panel, {
        size: 'lg',
        maxWidth: isCompact ? '100%' : '36rem',
        className: 'overflow-hidden'
    }, [
        // Header
        createElement('div', {
            key: 'header',
            className: 'flex items-center justify-between mb-4'
        }, [
            createElement(PanelTitle, { key: 'title' }, t('sandbox.title')),
            createElement('div', {
                key: 'summary',
                className: 'text-xs text-[#f7f1e6]/60 text-right'
            }, [
                createElement('div', { key: 's1' }, `${sheepCount} ${t('sandbox.tabs.sheep').toLowerCase()}`),
                createElement('div', { key: 's2' }, `${fieldSize}`)
            ])
        ]),

        // Tab navigation
        createElement('div', {
            key: 'tabs',
            className: 'flex gap-1 p-1 bg-[#f7f1e6]/5 rounded-xl mb-4'
        }, tabs.map(tab =>
            createElement('button', {
                key: tab.id,
                onClick: () => setActiveTab(tab.id),
                className: `flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                        ? 'bg-[#5e9e6e] text-[#f7f1e6]'
                        : 'text-[#f7f1e6]/60 hover:text-[#f7f1e6] hover:bg-[#f7f1e6]/10'
                }`
            }, t(tab.labelKey))
        )),

        // Tab content
        createElement('div', {
            key: 'content',
            className: 'min-h-[280px] max-h-[350px] overflow-y-auto pr-1',
            style: {
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(247,241,230,0.2) transparent',
                WebkitOverflowScrolling: 'touch'
            }
        }, renderTabContent()),

        // Share toast notification
        shareToast && createElement('div', {
            key: 'toast',
            style: {
                position: 'absolute',
                bottom: '80px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(40, 28, 18, 0.85)',
                color: '#f7f1e6',
                padding: '6px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                pointerEvents: 'none',
                whiteSpace: 'nowrap'
            }
        }, shareToast),

        // Footer actions
        createElement('div', {
            key: 'footer',
            className: 'flex gap-3 mt-5 pt-4 border-t border-[#f7f1e6]/10'
        }, [
            createElement(Button, {
                key: 'back',
                variant: 'secondary',
                onClick: onBack,
                style: { minWidth: 'auto', width: 'auto', flexShrink: 0 }
            }, `\u2190 ${t('common.back')}`),
            createElement(Button, {
                key: 'share',
                variant: 'secondary',
                onClick: handleShareLink,
                style: { minWidth: 'auto', width: 'auto', flexShrink: 0 }
            }, 'Copy share link'),
            createElement(Button, {
                key: 'start',
                variant: 'primary',
                onClick: onStartGame,
                className: 'flex-1 py-3'
            }, t('sandbox.startGameWithCount', { count: sheepCount }))
        ])
    ]));
}
