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

// Toggle switch component
function Toggle({ value, onChange, disabled = false, color = '#3b82f6' }) {
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
                background: 'white',
                position: 'absolute',
                top: '2px',
                left: value ? '22px' : '2px',
                transition: 'left 0.2s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
            }
        })
    );
}

// Slider component
function Slider({ value, min, max, step = 1, onChange, formatValue, color = '#3b82f6' }) {
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
                color: 'white',
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
            borderBottom: '1px solid rgba(255,255,255,0.06)'
        }
    }, [
        createElement('div', { key: 'label', style: { flex: 1, marginRight: '1rem' } }, [
            createElement('div', {
                key: 'title',
                style: {
                    color: 'white',
                    fontSize: isCompact ? '0.85rem' : '0.9rem',
                    fontWeight: 500
                }
            }, label),
            description && createElement('div', {
                key: 'desc',
                style: {
                    color: 'rgba(255,255,255,0.5)',
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
            background: isListening ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.1)',
            border: isListening ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.2)',
            borderRadius: '0.5rem',
            color: isListening ? '#93c5fd' : 'white',
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
            background: isActive ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
            border: 'none',
            borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
            color: isActive ? 'white' : 'rgba(255,255,255,0.6)',
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
            background: isActive ? `${color}22` : 'rgba(255,255,255,0.05)',
            border: isActive ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.1)',
            borderRadius: '0.75rem',
            color: isActive ? color : 'rgba(255,255,255,0.8)',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s'
        }
    }, label);
}

export function SettingsPanel({ settings, onSettingsChange, onBack }) {
    const { t } = useTranslation();
    const { isCompact, isMobile } = useResponsive();
    const [activeTab, setActiveTab] = useState('graphics');
    const [listeningForKey, setListeningForKey] = useState(null);
    const [keyConflict, setKeyConflict] = useState(null);

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
        applySettingsToGame(newSettings);
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
        applySettingsToGame(defaults);
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
                    color: 'rgba(255,255,255,0.7)',
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
                    color: '#3b82f6'
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
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '0.5rem',
                padding: '0.5rem 0.75rem',
                color: 'white',
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
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem'
                }
            }, t('settings.language')),
            createElement(LanguageSelector, { key: 'selector', variant: 'full' })
        ])
    ]);

    // Controls tab content
    const renderControlsTab = () => createElement('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '0.25rem' }
    }, [
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
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                }
            }, t('settings.keyBindings')),
            createElement('button', {
                key: 'reset',
                onClick: resetKeyBindings,
                style: {
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                }
            }, t('settings.resetBindings'))
        ]),

        // Key conflict warning
        keyConflict && createElement('div', {
            key: 'conflict',
            style: {
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                borderRadius: '0.5rem',
                padding: '0.5rem 0.75rem',
                marginBottom: '0.5rem',
                color: '#fca5a5',
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
                background: 'rgba(59, 130, 246, 0.1)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(59, 130, 246, 0.2)'
            }
        }, [
            createElement('div', {
                key: 'title',
                style: { color: '#93c5fd', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }
            }, t('settings.gamepadSupport')),
            createElement('div', {
                key: 'desc',
                style: { color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }
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
                createElement('button', {
                    key: 'reset',
                    onClick: resetToDefaults,
                    style: {
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '0.5rem',
                        padding: '0.4rem 0.75rem',
                        color: '#fca5a5',
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                    }
                }, t('settings.resetDefaults'))
            ]),

            // Tabs
            createElement('div', {
                key: 'tabs',
                style: {
                    display: 'flex',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
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
                    borderTop: '1px solid rgba(255,255,255,0.1)',
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
                    href: '/about.html',
                    target: '_blank',
                    rel: 'noopener',
                    style: {
                        display: 'block',
                        textAlign: 'center',
                        marginTop: '0.75rem',
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: '0.75rem',
                        textDecoration: 'none'
                    }
                }, 'About this game')
            ])
        ])
    );
}
