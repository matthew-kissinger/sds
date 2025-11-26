/**
 * SettingsPanel Component
 * Game settings configuration UI
 */
const { createElement } = window.React;
import { usePlatform } from '../hooks/usePlatform.js';
import { getDefaultSettings, saveSettings, applySettingsToGame } from '../shared/settings.js';

// Toggle switch component
function Toggle({ value, onChange, disabled = false }) {
    return createElement('button', {
        onClick: disabled ? undefined : () => onChange(!value),
        disabled: disabled,
        className: `w-12 h-6 rounded-full transition-colors ${
            value ? 'bg-blue-500' : 'bg-gray-600'
        } ${disabled ? 'opacity-50' : ''}`
    },
        createElement('div', {
            className: `w-5 h-5 bg-white rounded-full transition-transform ${
                value ? 'translate-x-6' : 'translate-x-0.5'
            }`
        })
    );
}

export function SettingsPanel({ settings, onSettingsChange, onBack }) {
    const platform = usePlatform();

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

    const panelStyle = {
        animation: 'slideUp 0.5s ease-out',
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        borderRadius: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        padding: platform === 'mobile' ? '2rem' : '2.5rem'
    };

    return createElement('div', {
        className: `max-w-lg w-full ${platform === 'mobile' ? 'max-h-[80vh] overflow-y-auto' : ''}`,
        style: panelStyle
    }, [
        createElement('h2', {
            key: 'title',
            className: 'text-2xl font-bold text-center text-white mb-6',
            style: { textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)' }
        }, 'Settings'),

        createElement('div', {
            key: 'content',
            className: 'space-y-6'
        }, [
            // Performance Mode
            createElement('div', { key: 'performance-mode' }, [
                createElement('label', {
                    key: 'label',
                    className: 'block text-sm font-medium text-gray-300 mb-2'
                }, 'Performance Mode'),
                createElement('select', {
                    key: 'select',
                    value: settings.performanceMode,
                    onChange: (e) => handleSettingChange('performanceMode', e.target.value),
                    className: 'w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500',
                    style: {
                        background: 'rgba(31, 41, 55, 0.8)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)'
                    }
                }, [
                    createElement('option', { key: 'performance', value: 'performance' }, 'Performance - Maximum FPS'),
                    createElement('option', { key: 'balanced', value: 'balanced' }, 'Balanced - Default settings'),
                    createElement('option', { key: 'quality', value: 'quality' }, 'Quality - Best visuals')
                ])
            ]),

            // Audio Enable Toggle
            createElement('div', { key: 'audio-enable' },
                createElement('div', {
                    className: 'flex items-center justify-between'
                }, [
                    createElement('label', {
                        key: 'label',
                        className: 'text-sm font-medium text-gray-300'
                    }, 'Audio Enabled'),
                    createElement(Toggle, {
                        key: 'toggle',
                        value: settings.audioEnabled,
                        onChange: (value) => handleSettingChange('audioEnabled', value)
                    })
                ])
            ),

            // Audio Volume (only if audio enabled)
            settings.audioEnabled && createElement('div', { key: 'audio-volume' }, [
                createElement('label', {
                    key: 'label',
                    className: 'block text-sm font-medium text-gray-300 mb-2'
                }, `Audio Volume (${settings.audioVolume}%)`),
                createElement('input', {
                    key: 'slider',
                    type: 'range',
                    min: '0',
                    max: '100',
                    value: settings.audioVolume,
                    onChange: (e) => handleSettingChange('audioVolume', parseInt(e.target.value)),
                    className: 'w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer',
                    style: {
                        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${settings.audioVolume}%, #374151 ${settings.audioVolume}%, #374151 100%)`
                    }
                })
            ]),

            // Performance Stats Toggle
            createElement('div', { key: 'show-stats' },
                createElement('div', {
                    className: 'flex items-center justify-between'
                }, [
                    createElement('label', {
                        key: 'label',
                        className: 'text-sm font-medium text-gray-300'
                    }, 'Show Performance Stats'),
                    createElement(Toggle, {
                        key: 'toggle',
                        value: settings.showStats,
                        onChange: (value) => handleSettingChange('showStats', value)
                    })
                ])
            )
        ]),

        // Footer buttons
        createElement('div', {
            key: 'footer',
            className: 'flex gap-3 mt-8'
        }, [
            createElement('button', {
                key: 'reset',
                className: 'flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors',
                onClick: resetToDefaults
            }, 'Reset to Defaults'),
            createElement('button', {
                key: 'back',
                className: 'flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-lg transition-colors',
                onClick: onBack
            }, String.fromCharCode(8592) + ' Back to Menu')
        ])
    ]);
}
