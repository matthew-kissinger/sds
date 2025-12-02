/**
 * SettingsPanel Component
 * Game settings configuration UI
 */
import React, { createElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { Button, BackButton } from '../ui/Button.js';
import { LanguageSelector } from '../ui/LanguageSelector.js';
import { getDefaultSettings, saveSettings, applySettingsToGame } from '../shared/settings.js';

// Toggle switch component
function Toggle({ value, onChange, disabled = false }) {
    return createElement('button', {
        onClick: disabled ? undefined : () => onChange(!value),
        disabled,
        style: {
            width: '48px',
            height: '24px',
            borderRadius: '12px',
            background: value ? '#3b82f6' : '#4b5563',
            border: 'none',
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            position: 'relative',
            transition: 'background 0.2s ease'
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
                left: value ? '26px' : '2px',
                transition: 'left 0.2s ease'
            }
        })
    );
}

export function SettingsPanel({ settings, onSettingsChange, onBack }) {
    const { t } = useTranslation();
    const { isCompact } = useResponsive();

    const handleSettingChange = (key, value) => {
        const newSettings = { ...settings, [key]: value };
        onSettingsChange(newSettings);
        saveSettings(newSettings);
        applySettingsToGame(newSettings);
    };

    const resetToDefaults = () => {
        const defaults = getDefaultSettings();
        onSettingsChange(defaults);
        saveSettings(defaults);
        applySettingsToGame(defaults);
    };

    const selectStyle = {
        width: '100%',
        background: 'rgba(31, 41, 55, 0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '0.5rem',
        padding: '0.75rem 1rem',
        color: 'white',
        fontSize: '1rem',
        cursor: 'pointer',
        outline: 'none'
    };

    const labelStyle = {
        display: 'block',
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: isCompact ? '0.85rem' : '0.875rem',
        marginBottom: '0.5rem'
    };

    const rowStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
    };

    return createElement('div', {
        style: {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%'
        }
    },
        createElement(Panel, {
            size: 'md',
            maxWidth: '28rem',
            style: {
                animation: 'slideUp 0.5s ease-out',
                maxHeight: isCompact ? 'calc(80vh - env(safe-area-inset-bottom, 0px))' : 'none',
                overflowY: isCompact ? 'auto' : 'visible',
                WebkitOverflowScrolling: 'touch'
            }
        }, [
            createElement(PanelTitle, { key: 'title' }, t('settings.title')),

            createElement('div', {
                key: 'content',
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isCompact ? '1rem' : '1.5rem'
                }
            }, [
                // Language Selector
                createElement('div', { key: 'language' }, [
                    createElement('label', { key: 'label', style: labelStyle }, t('settings.language')),
                    createElement(LanguageSelector, { key: 'selector', variant: 'full' })
                ]),

                // Performance Mode
                createElement('div', { key: 'performance-mode' }, [
                    createElement('label', { key: 'label', style: labelStyle }, t('settings.performanceMode')),
                    createElement('select', {
                        key: 'select',
                        value: settings.performanceMode,
                        onChange: (e) => handleSettingChange('performanceMode', e.target.value),
                        style: selectStyle
                    }, [
                        createElement('option', { key: 'performance', value: 'performance' }, t('settings.performanceOption')),
                        createElement('option', { key: 'balanced', value: 'balanced' }, t('settings.balancedOption')),
                        createElement('option', { key: 'quality', value: 'quality' }, t('settings.qualityOption'))
                    ])
                ]),

                // Audio Enable Toggle
                createElement('div', { key: 'audio-enable', style: rowStyle }, [
                    createElement('label', { key: 'label', style: { ...labelStyle, marginBottom: 0 } }, t('settings.audioEnabled')),
                    createElement(Toggle, {
                        key: 'toggle',
                        value: settings.audioEnabled,
                        onChange: (value) => handleSettingChange('audioEnabled', value)
                    })
                ]),

                // Audio Volume (only if audio enabled)
                settings.audioEnabled && createElement('div', { key: 'audio-volume' }, [
                    createElement('label', {
                        key: 'label',
                        style: labelStyle
                    }, `${t('settings.audioVolume')} (${settings.audioVolume}%)`),
                    createElement('input', {
                        key: 'slider',
                        type: 'range',
                        min: '0',
                        max: '100',
                        value: settings.audioVolume,
                        onChange: (e) => handleSettingChange('audioVolume', parseInt(e.target.value)),
                        style: {
                            width: '100%',
                            height: '8px',
                            borderRadius: '4px',
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${settings.audioVolume}%, #374151 ${settings.audioVolume}%, #374151 100%)`,
                            cursor: 'pointer'
                        }
                    })
                ]),

                // Performance Stats Toggle
                createElement('div', { key: 'show-stats', style: rowStyle }, [
                    createElement('label', { key: 'label', style: { ...labelStyle, marginBottom: 0 } }, t('settings.showStats')),
                    createElement(Toggle, {
                        key: 'toggle',
                        value: settings.showStats,
                        onChange: (value) => handleSettingChange('showStats', value)
                    })
                ])
            ]),

            // Footer buttons
            createElement('div', {
                key: 'footer',
                style: {
                    display: 'flex',
                    gap: '0.75rem',
                    marginTop: isCompact ? '1rem' : '2rem'
                }
            }, [
                createElement(Button, {
                    key: 'reset',
                    variant: 'secondary',
                    onClick: resetToDefaults,
                    style: { flex: 1 }
                }, t('settings.resetDefaults')),
                createElement(Button, {
                    key: 'back',
                    variant: 'primary',
                    onClick: onBack,
                    style: { flex: 1 }
                }, t('common.backToMenu'))
            ])
        ])
    );
}
