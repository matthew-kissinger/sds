// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * SettingsPanel Component
 * Modern tabbed settings UI with Graphics, Audio, and Controls sections
 */
import React, { createElement, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { Button } from '../ui/Button.js';
import { LanguageSelector } from '../ui/LanguageSelector.js';
import {
    getDefaultSettings,
    saveSettings,
    applySettingsToGame,
    applyPerformancePreset,
    getKeyDisplayName,
    DEFAULT_KEY_BINDINGS,
    isKeyAlreadyBound
} from '../shared/settings.js';
import { CameraMode } from '../../CameraController.js';
import { NameField } from '../shared/NameField.js';

const CAMERA_MODE_STORAGE_KEY = 'camera-mode';

function loadCameraMode() {
    try {
        const saved = localStorage.getItem(CAMERA_MODE_STORAGE_KEY);
        if (saved === CameraMode.CLASSIC || saved === CameraMode.FOLLOW || saved === CameraMode.FREE) {
            return saved;
        }
    } catch (_) { /* localStorage may be unavailable */ }
    // Cycle 23 Phase A2 (Q6): default Follow per v1.3.0 playtest. Classic
    // is now the third selectable option, not the boot mode.
    return CameraMode.FOLLOW;
}

function persistCameraMode(mode) {
    try {
        localStorage.setItem(CAMERA_MODE_STORAGE_KEY, mode);
    } catch (_) { /* ignore */ }
    window.dispatchEvent(new CustomEvent('camera-mode-set', { detail: mode }));
}

// Cycle 57 P5 / Cycle 58 P8: view + set the leaderboard display name. The
// Cycle 51 reframe removed the first-run name gate (and the only name-entry UI);
// this is the opt-in Settings surface that restores it without a blocking gate.
// The editor body now lives in the shared NameField (over the same auth-gated
// /api/rename + localStorage path), reused by the post-score and entrance
// touchpoints. showLabel + showCurrent reproduce the Cycle 57 P5 layout here.
function DisplayNameField() {
    return createElement(NameField, { showLabel: true, showCurrent: true });
}

// Toggle switch component. Cycle 61 P2: pastoral meadow default + cream knob.
function Toggle({ value, onChange, disabled = false, color = '#5e9e6e' }) {
    return createElement('button', {
        onClick: disabled ? undefined : () => onChange(!value),
        disabled,
        style: {
            width: '44px',
            height: '24px',
            borderRadius: '12px',
            background: value ? color : '#4b5563',
            border: 'none',
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            position: 'relative',
            transition: 'all 0.2s ease',
            flexShrink: 0
        }
    },
        createElement('div', {
            style: {
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: '#f7f1e6',
                position: 'absolute',
                top: '2px',
                left: value ? '22px' : '2px',
                transition: 'left 0.2s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
            }
        })
    );
}

// Slider component. Cycle 61 P2: pastoral meadow fill default.
function Slider({ value, min, max, step = 1, onChange, formatValue, color = '#5e9e6e' }) {
    const percentage = ((value - min) / (max - min)) * 100;

    return createElement('div', {
        style: { display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }
    }, [
        createElement('input', {
            key: 'input',
            type: 'range',
            min, max, step, value,
            onChange: (e) => onChange(parseFloat(e.target.value)),
            style: {
                flex: 1,
                height: '6px',
                borderRadius: '3px',
                appearance: 'none',
                WebkitAppearance: 'none',
                background: `linear-gradient(to right, ${color} 0%, ${color} ${percentage}%, #374151 ${percentage}%, #374151 100%)`,
                cursor: 'pointer',
                outline: 'none'
            }
        }),
        createElement('span', {
            key: 'value',
            style: {
                minWidth: '3rem',
                textAlign: 'right',
                color: '#f7f1e6',
                fontSize: '0.875rem',
                fontWeight: 500
            }
        }, formatValue ? formatValue(value) : value)
    ]);
}

// Setting row component
function SettingRow({ label, description, children, isCompact }) {
    return createElement('div', {
        style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: isCompact ? '0.5rem 0' : '0.75rem 0',
            borderBottom: '1px solid rgba(247,241,230,0.08)'
        }
    }, [
        createElement('div', { key: 'label', style: { flex: 1, marginRight: '1rem' } }, [
            createElement('div', {
                key: 'title',
                style: {
                    color: '#f7f1e6',
                    fontSize: isCompact ? '0.85rem' : '0.9rem',
                    fontWeight: 500
                }
            }, label),
            description && createElement('div', {
                key: 'desc',
                style: {
                    color: 'rgba(247,241,230,0.55)',
                    fontSize: '0.75rem',
                    marginTop: '2px'
                }
            }, description)
        ]),
        createElement('div', {
            key: 'control',
            style: { display: 'flex', alignItems: 'center' }
        }, children)
    ]);
}

// Key binding button component
function KeyBindButton({ action, keyCode, onRebind, isListening, t }) {
    const displayName = getKeyDisplayName(keyCode);

    return createElement('button', {
        onClick: () => onRebind(action),
        style: {
            minWidth: '80px',
            padding: '0.5rem 0.75rem',
            background: isListening ? 'rgba(94, 158, 110, 0.3)' : 'rgba(247,241,230,0.1)',
            border: isListening ? '2px solid #5e9e6e' : '1px solid rgba(247,241,230,0.2)',
            borderRadius: '0.5rem',
            color: isListening ? '#7dbf8e' : '#f7f1e6',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontFamily: 'monospace'
        }
    }, isListening ? t('settings.pressKey') : displayName);
}

// Tab button component
function TabButton({ id, label, icon, isActive, onClick, isCompact }) {
    return createElement('button', {
        onClick: () => onClick(id),
        style: {
            flex: 1,
            padding: isCompact ? '0.5rem' : '0.75rem 1rem',
            background: isActive ? 'rgba(94, 158, 110, 0.2)' : 'transparent',
            border: 'none',
            borderBottom: isActive ? '2px solid #5e9e6e' : '2px solid transparent',
            color: isActive ? '#f7f1e6' : 'rgba(247,241,230,0.6)',
            fontSize: isCompact ? '0.8rem' : '0.875rem',
            fontWeight: isActive ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
        }
    }, [
        icon && createElement('span', { key: 'icon' }, icon),
        createElement('span', { key: 'label' }, label)
    ]);
}

// Performance preset button
function PresetButton({ id, label, isActive, onClick, color }) {
    return createElement('button', {
        onClick: () => onClick(id),
        style: {
            flex: 1,
            padding: '0.75rem',
            background: isActive ? `${color}22` : 'rgba(247,241,230,0.05)',
            border: isActive ? `2px solid ${color}` : '1px solid rgba(247,241,230,0.1)',
            borderRadius: '0.75rem',
            color: isActive ? color : 'rgba(247,241,230,0.8)',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s'
        }
    }, label);
}

// Cycle 23 Phase A2 (Q6): Follow is the default; Classic demoted to
// third option. Order here matches the C-key cycle in MODE_ORDER.
const CAMERA_MODE_OPTIONS = [
    { id: CameraMode.FOLLOW,  label: 'Follow',   desc: 'Cinematic close-up behind the dog (default)' },
    { id: CameraMode.FREE,    label: 'Free',     desc: 'Right-mouse-drag to orbit the dog' },
    { id: CameraMode.CLASSIC, label: 'Classic',  desc: 'High isometric overhead view' }
];

function CameraModePicker({ mode, onChange }) {
    return createElement('div', {
        style: { marginBottom: '0.75rem' }
    }, [
        createElement('div', {
            key: 'label',
            style: {
                color: 'rgba(247,241,230,0.7)',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem'
            }
        }, 'Camera Mode (press C to cycle)'),
        createElement('div', {
            key: 'options',
            style: { display: 'flex', gap: '0.5rem' }
        }, CAMERA_MODE_OPTIONS.map(opt =>
            createElement('button', {
                key: opt.id,
                onClick: () => onChange(opt.id),
                title: opt.desc,
                style: {
                    flex: 1,
                    padding: '0.6rem 0.5rem',
                    background: mode === opt.id ? 'rgba(94, 158, 110, 0.2)' : 'rgba(247,241,230,0.05)',
                    border: mode === opt.id ? '2px solid #5e9e6e' : '1px solid rgba(247,241,230,0.1)',
                    borderRadius: '0.5rem',
                    color: mode === opt.id ? '#7dbf8e' : 'rgba(247,241,230,0.8)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                }
            }, opt.label)
        ))
    ]);
}

export function SettingsPanel({ settings, onSettingsChange, onBack }) {
    const { t } = useTranslation();
    const { isCompact, isMobile } = useResponsive();
    const [activeTab, setActiveTab] = useState('graphics');
    const [listeningForKey, setListeningForKey] = useState(null);
    const [keyConflict, setKeyConflict] = useState(null);
    const [cameraMode, setCameraMode] = useState(loadCameraMode);

    const handleCameraModeChange = useCallback((mode) => {
        setCameraMode(mode);
        persistCameraMode(mode);
    }, []);

    // Sync from `C` hotkey so the radio reflects in-game cycles.
    useEffect(() => {
        const onChange = (e) => {
            if (e?.detail) setCameraMode(e.detail);
        };
        window.addEventListener('camera-mode-changed', onChange);
        return () => window.removeEventListener('camera-mode-changed', onChange);
    }, []);

    // Handle key binding capture
    useEffect(() => {
        if (!listeningForKey) return;

        const handleKeyDown = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Ignore modifier-only presses
            if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
                return;
            }

            const keyCode = e.code;

            // Check for conflicts
            const conflictAction = isKeyAlreadyBound(keyCode, listeningForKey);
            if (conflictAction) {
                setKeyConflict({ key: keyCode, action: conflictAction });
                setTimeout(() => setKeyConflict(null), 2000);
                setListeningForKey(null);
                return;
            }

            // Update the binding
            const newBindings = { ...settings.keyBindings, [listeningForKey]: keyCode };
            const newSettings = { ...settings, keyBindings: newBindings };
            onSettingsChange(newSettings);
            saveSettings(newSettings);
            setListeningForKey(null);

            // Dispatch event for InputHandler
            window.dispatchEvent(new CustomEvent('keybindings-changed', {
                detail: newBindings
            }));
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [listeningForKey, settings, onSettingsChange]);

    const handleSettingChange = useCallback((key, value) => {
        const newSettings = { ...settings, [key]: value };
        onSettingsChange(newSettings);
        saveSettings(newSettings);
        applySettingsToGame(newSettings, { applyRenderer: key === 'experimentalWebGpu' });
    }, [settings, onSettingsChange]);

    const handlePresetChange = useCallback((presetName) => {
        const newSettings = applyPerformancePreset(presetName, settings);
        onSettingsChange(newSettings);
        saveSettings(newSettings);
        applySettingsToGame(newSettings);
    }, [settings, onSettingsChange]);

    const resetToDefaults = useCallback(() => {
        const defaults = getDefaultSettings();
        onSettingsChange(defaults);
        saveSettings(defaults);
        applySettingsToGame(defaults, { applyRenderer: settings.experimentalWebGpu !== defaults.experimentalWebGpu });
    }, [onSettingsChange]);

    const resetKeyBindings = useCallback(() => {
        const newSettings = { ...settings, keyBindings: { ...DEFAULT_KEY_BINDINGS } };
        onSettingsChange(newSettings);
        saveSettings(newSettings);
        window.dispatchEvent(new CustomEvent('keybindings-changed', {
            detail: DEFAULT_KEY_BINDINGS
        }));
    }, [settings, onSettingsChange]);

    // Tab definitions
    const tabs = [
        { id: 'graphics', label: t('settings.tabs.graphics'), icon: '\u2699' },
        { id: 'audio', label: t('settings.tabs.audio'), icon: '\u266B' },
        { id: 'controls', label: t('settings.tabs.controls'), icon: '\u2328' }
    ];

    // Graphics tab content
    const renderGraphicsTab = () => createElement('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' }
    }, [
        // Performance presets
        createElement('div', {
            key: 'presets',
            style: { marginBottom: '1rem' }
        }, [
            createElement('div', {
                key: 'label',
                style: {
                    color: 'rgba(247,241,230,0.7)',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem'
                }
            }, t('settings.presets')),
            createElement('div', {
                key: 'buttons',
                style: { display: 'flex', gap: '0.5rem' }
            }, [
                createElement(PresetButton, {
                    key: 'perf',
                    id: 'performance',
                    label: t('settings.performanceOption'),
                    isActive: settings.performanceMode === 'performance',
                    onClick: handlePresetChange,
                    color: '#22c55e'
                }),
                createElement(PresetButton, {
                    key: 'bal',
                    id: 'balanced',
                    label: t('settings.balancedOption'),
                    isActive: settings.performanceMode === 'balanced',
                    onClick: handlePresetChange,
                    color: '#5e9e6e'
                }),
                createElement(PresetButton, {
                    key: 'qual',
                    id: 'quality',
                    label: t('settings.qualityOption'),
                    isActive: settings.performanceMode === 'quality',
                    onClick: handlePresetChange,
                    color: '#a855f7'
                })
            ])
        ]),

        // Individual settings
        createElement(SettingRow, {
            key: 'experimental-webgpu',
            label: t('settings.experimentalWebGpu'),
            description: t('settings.experimentalWebGpuDesc'),
            isCompact
        }, createElement(Toggle, {
            value: settings.experimentalWebGpu !== false,
            onChange: (v) => handleSettingChange('experimentalWebGpu', v),
            color: '#5e9e6e'
        })),

        !isMobile && createElement(SettingRow, {
            key: 'shadows',
            label: t('settings.shadows'),
            description: t('settings.shadowsDesc'),
            isCompact
        }, createElement(Toggle, {
            value: settings.shadows,
            onChange: (v) => handleSettingChange('shadows', v)
        })),

        !isMobile && settings.shadows && createElement(SettingRow, {
            key: 'shadow-quality',
            label: t('settings.shadowQuality'),
            isCompact
        }, createElement('select', {
            value: settings.shadowQuality,
            onChange: (e) => handleSettingChange('shadowQuality', e.target.value),
            style: {
                background: 'rgba(247,241,230,0.1)',
                border: '1px solid rgba(247,241,230,0.2)',
                borderRadius: '0.5rem',
                padding: '0.5rem 0.75rem',
                color: '#f7f1e6',
                fontSize: '0.875rem',
                cursor: 'pointer'
            }
        }, [
            createElement('option', { key: 'low', value: 'low' }, t('settings.low')),
            createElement('option', { key: 'medium', value: 'medium' }, t('settings.medium')),
            createElement('option', { key: 'high', value: 'high' }, t('settings.high'))
        ])),

        createElement(SettingRow, {
            key: 'stats',
            label: t('settings.showStats'),
            description: t('settings.showStatsDesc'),
            isCompact
        }, createElement(Toggle, {
            value: settings.showStats,
            onChange: (v) => handleSettingChange('showStats', v),
            color: '#f59e0b'
        }))
    ]);

    // Audio tab content
    const renderAudioTab = () => createElement('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' }
    }, [
        createElement(SettingRow, {
            key: 'audio-enable',
            label: t('settings.audioEnabled'),
            isCompact
        }, createElement(Toggle, {
            value: settings.audioEnabled,
            onChange: (v) => handleSettingChange('audioEnabled', v),
            color: '#22c55e'
        })),

        settings.audioEnabled && createElement(SettingRow, {
            key: 'audio-volume',
            label: t('settings.audioVolume'),
            isCompact
        }, createElement(Slider, {
            value: settings.audioVolume,
            min: 0, max: 100, step: 5,
            onChange: (v) => handleSettingChange('audioVolume', v),
            formatValue: (v) => `${v}%`,
            color: '#22c55e'
        })),

        // Language selector
        createElement('div', {
            key: 'language',
            style: { marginTop: '1rem' }
        }, [
            createElement('div', {
                key: 'label',
                style: {
                    color: 'rgba(247,241,230,0.7)',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem'
                }
            }, t('settings.language')),
            createElement(LanguageSelector, { key: 'selector', variant: 'full' })
        ]),

        // Cycle 57 P5: view + change the leaderboard display name.
        createElement(DisplayNameField, { key: 'display-name' }),

        // Reset player profile (re-trigger onboarding) — Cycle 11 Phase 2.
        createElement('div', {
            key: 'reset-profile',
            style: { marginTop: '1.25rem' }
        }, [
            createElement('div', {
                key: 'label',
                style: {
                    color: 'rgba(247,241,230,0.7)',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem'
                }
            }, 'Player profile'),
            createElement(Button, {
                key: 'btn',
                variant: 'danger',
                size: 'sm',
                onClick: () => {
                    if (!confirm('Reset your player profile and re-run onboarding? Your local stats and bindings stay.')) return;
                    try { localStorage.removeItem('playerIdentity'); } catch {}
                    window.location.reload();
                }
            }, 'Reset & re-run onboarding')
        ])
    ]);

    // Controls tab content
    const renderControlsTab = () => createElement('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '0.25rem' }
    }, [
        createElement(CameraModePicker, {
            key: 'camera-mode',
            mode: cameraMode,
            onChange: handleCameraModeChange
        }),

        // Keyboard bindings header
        createElement('div', {
            key: 'header',
            style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem'
            }
        }, [
            createElement('span', {
                key: 'title',
                style: {
                    color: 'rgba(247,241,230,0.7)',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                }
            }, t('settings.keyBindings')),
            createElement(Button, {
                key: 'reset',
                variant: 'ghost',
                size: 'sm',
                onClick: resetKeyBindings
            }, t('settings.resetBindings'))
        ]),

        // Key conflict warning
        keyConflict && createElement('div', {
            key: 'conflict',
            style: {
                background: 'rgba(217, 154, 143, 0.2)',
                border: '1px solid rgba(217, 154, 143, 0.5)',
                borderRadius: '0.5rem',
                padding: '0.5rem 0.75rem',
                marginBottom: '0.5rem',
                color: '#e8b4ab',
                fontSize: '0.8rem'
            }
        }, t('settings.keyConflict', { action: t(`settings.actions.${keyConflict.action}`) })),

        // Key bindings
        ...Object.entries(settings.keyBindings || DEFAULT_KEY_BINDINGS).map(([action, keyCode]) =>
            createElement(SettingRow, {
                key: action,
                label: t(`settings.actions.${action}`),
                isCompact
            }, createElement(KeyBindButton, {
                action,
                keyCode,
                onRebind: setListeningForKey,
                isListening: listeningForKey === action,
                t
            }))
        ),

        // Gamepad note
        createElement('div', {
            key: 'gamepad-note',
            style: {
                marginTop: '1rem',
                padding: '0.75rem',
                background: 'rgba(94, 158, 110, 0.1)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(94, 158, 110, 0.2)'
            }
        }, [
            createElement('div', {
                key: 'title',
                style: { color: '#7dbf8e', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }
            }, t('settings.gamepadSupport')),
            createElement('div', {
                key: 'desc',
                style: { color: 'rgba(247,241,230,0.6)', fontSize: '0.75rem' }
            }, t('settings.gamepadDesc'))
        ])
    ]);

    // Main render
    return createElement('div', {
        style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: '100%'
        }
    },
        createElement(Panel, {
            size: 'lg',
            maxWidth: '32rem',
            style: {
                animation: 'slideUp 0.5s ease-out',
                maxHeight: isCompact ? 'calc(85vh - env(safe-area-inset-bottom, 0px))' : '80vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }
        }, [
            // Header
            createElement('div', {
                key: 'header',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '1rem',
                    flexShrink: 0
                }
            }, [
                createElement(PanelTitle, { key: 'title', style: { marginBottom: 0 } }, t('settings.title')),
                createElement(Button, {
                    key: 'reset',
                    variant: 'danger',
                    size: 'sm',
                    onClick: resetToDefaults
                }, t('settings.resetDefaults'))
            ]),

            // Tabs
            createElement('div', {
                key: 'tabs',
                style: {
                    display: 'flex',
                    borderBottom: '1px solid rgba(247,241,230,0.1)',
                    marginBottom: '1rem',
                    flexShrink: 0
                }
            }, tabs.map(tab =>
                createElement(TabButton, {
                    key: tab.id,
                    ...tab,
                    isActive: activeTab === tab.id,
                    onClick: setActiveTab,
                    isCompact
                })
            )),

            // Tab content (scrollable)
            createElement('div', {
                key: 'content',
                style: {
                    flex: 1,
                    overflowY: 'auto',
                    minHeight: 0,
                    paddingRight: '0.5rem',
                    WebkitOverflowScrolling: 'touch'
                }
            }, [
                activeTab === 'graphics' && renderGraphicsTab(),
                activeTab === 'audio' && renderAudioTab(),
                activeTab === 'controls' && renderControlsTab()
            ]),

            // Footer
            createElement('div', {
                key: 'footer',
                style: {
                    marginTop: '1rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid rgba(247,241,230,0.1)',
                    flexShrink: 0
                }
            }, [
                createElement(Button, {
                    key: 'back',
                    variant: 'primary',
                    fullWidth: true,
                    onClick: onBack
                }, t('common.backToMenu')),
                createElement('a', {
                    key: 'about',
                    href: '/about',
                    target: '_blank',
                    rel: 'noopener',
                    style: {
                        display: 'block',
                        textAlign: 'center',
                        marginTop: '0.75rem',
                        color: 'rgba(247,241,230,0.4)',
                        fontSize: '0.75rem',
                        textDecoration: 'none'
                    }
                }, 'About this game')
            ])
        ])
    );
}
