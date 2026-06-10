// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * SettingsPanel Component
 * Modern tabbed settings UI with Graphics, Audio, Controls, and General
 * (language / accessibility / tutorial / profile) sections.
 * [P1-SETTINGS-PANEL] integration pass: every control is live, the key
 * rebinder covers the full bindable action set, and the tutorial re-trigger
 * calls the P1-TUTORIAL startTutorial() hook.
 */
import { createElement, useState, useEffect, useCallback, useMemo } from 'react';
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
    isKeyAlreadyBound,
    updateGamepadPrefs
} from '../shared/settings.js';
import {
    normalizeGamepadPrefs,
    getDefaultGamepadPrefs,
    DEADZONE_MIN,
    DEADZONE_MAX
} from '../../gamepadPrefs.js';
import {
    getGamepadButtonLabel,
    captureBaseline,
    detectNewButtonPress,
    detectMovedAxis,
    isButtonAlreadyBound,
    isAxisAlreadyBound,
    applyCircularDeadzone
} from '../shared/gamepadCapture.js';
import { CameraMode } from '../../CameraController.js';
import { NameField } from '../shared/NameField.js';
import { startTutorial } from '../Tutorial/index.js';
import { getPerformanceMonitor } from '../../GameBridge.js';

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

// Cycle 87 Phase 1: read-only renderer diagnostics. Raw values on purpose so
// a real-device session can read what the boot actually decided (effective
// renderer, fallback reason, hardware tier, quality step, device preflight)
// without opening devtools. Only the label is localized.
function rendererDiagnosticsText() {
    const mode = typeof window !== 'undefined' ? window.__sdsRendererMode : null;
    const quality = getPerformanceMonitor()?.qualityState ?? null;
    const preflight = typeof window !== 'undefined'
        ? (window.__sdsG?.productionWebGpu?.devicePreflight ?? null)
        : null;
    return [
        mode?.effective ?? 'unknown',
        mode?.fallbackReason ? `fallback: ${mode.fallbackReason}` : null,
        quality?.deviceTier ? `tier: ${quality.deviceTier}` : null,
        Number.isFinite(quality?.qualityIndex) ? `quality: ${quality.qualityIndex}` : null,
        preflight ? `preflight: ${preflight.ok ? 'ok' : (preflight.reason ?? 'failed')}` : null,
    ].filter(Boolean).join(', ');
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

// [P4-GAMEPAD-UI] First connected pad, or null. Settings polls this for
// capture and the deadzone preview; GamepadManager keeps its own loop.
function getFirstConnectedPad() {
    try {
        if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
            return null;
        }
        for (const pad of navigator.getGamepads()) {
            if (pad) return pad;
        }
    } catch (_) { /* getGamepads can throw in permissions-restricted frames */ }
    return null;
}

// Gamepad bind button: same visual language as KeyBindButton, but the value
// is a pad button/axis label and the armed state waits on pad input.
function PadBindButton({ label, listeningLabel, isListening, onClick }) {
    return createElement('button', {
        onClick,
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
    }, isListening ? listeningLabel : label);
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
// third option. Order here matches the camera-cycle hotkey's MODE_ORDER.
const CAMERA_MODE_OPTIONS = [
    { id: CameraMode.FOLLOW,  labelKey: 'settings.cameraModes.follow',  descKey: 'settings.cameraModes.followDesc' },
    { id: CameraMode.FREE,    labelKey: 'settings.cameraModes.free',    descKey: 'settings.cameraModes.freeDesc' },
    { id: CameraMode.CLASSIC, labelKey: 'settings.cameraModes.classic', descKey: 'settings.cameraModes.classicDesc' }
];

function CameraModePicker({ mode, onChange, cycleKey, t }) {
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
        }, t('settings.cameraModeSection', { key: getKeyDisplayName(cycleKey) })),
        createElement('div', {
            key: 'options',
            style: { display: 'flex', gap: '0.5rem' }
        }, CAMERA_MODE_OPTIONS.map(opt =>
            createElement('button', {
                key: opt.id,
                onClick: () => onChange(opt.id),
                title: t(opt.descKey),
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
            }, t(opt.labelKey))
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

    // [P4-GAMEPAD-UI] Gamepad remap/deadzone state. The section renders only
    // while a pad is connected; otherwise the static support note stays.
    const [padConnected, setPadConnected] = useState(() => !!getFirstConnectedPad());
    const [padCapture, setPadCapture] = useState(null); // { kind: 'button'|'axis', action }
    const [padConflict, setPadConflict] = useState(null); // { kind, action }
    const [stickPreview, setStickPreview] = useState(0);

    // Memoized so the capture/preview effects do not re-arm on unrelated
    // renders (the preview interval itself re-renders this component).
    const gamepadPrefs = useMemo(() => normalizeGamepadPrefs(settings.gamepad), [settings.gamepad]);

    // Persist + broadcast a full prefs object (settings.js saves the blob and
    // dispatches 'gamepad-prefs-changed' for GamepadManager), then sync the
    // React settings state.
    const commitGamepadPrefs = useCallback((nextPrefs) => {
        const newSettings = updateGamepadPrefs(nextPrefs);
        onSettingsChange({ ...settings, gamepad: newSettings.gamepad });
    }, [settings, onSettingsChange]);

    // Track pad connection; a disconnect also cancels any armed capture.
    useEffect(() => {
        const scan = () => {
            const connected = !!getFirstConnectedPad();
            setPadConnected(connected);
            if (!connected) setPadCapture(null);
        };
        scan();
        window.addEventListener('gamepadconnected', scan);
        window.addEventListener('gamepaddisconnected', scan);
        return () => {
            window.removeEventListener('gamepadconnected', scan);
            window.removeEventListener('gamepaddisconnected', scan);
        };
    }, []);

    // Capture flow: poll the pad against a baseline snapshot so held buttons
    // and resting axis positions (triggers rest at -1 on some pads) do not
    // self-assign. Escape cancels; disconnection mid-capture cancels.
    useEffect(() => {
        if (!padCapture) return;

        // Suppress in-game gamepad reads while armed so binding Start/A does
        // not simultaneously toggle pause/zoom (GamepadManager listens).
        window.dispatchEvent(new CustomEvent('sds-gamepad-capture', { detail: true }));

        let baseline = null;
        const poll = setInterval(() => {
            const pad = getFirstConnectedPad();
            if (!pad) {
                setPadCapture(null);
                return;
            }
            if (!baseline) {
                baseline = captureBaseline(pad);
                return;
            }
            if (padCapture.kind === 'button') {
                const index = detectNewButtonPress(pad, baseline);
                if (index === null) return;
                const conflict = isButtonAlreadyBound(index, padCapture.action, gamepadPrefs.buttons);
                if (conflict) {
                    setPadConflict({ kind: 'button', action: conflict });
                    setTimeout(() => setPadConflict(null), 2000);
                } else {
                    commitGamepadPrefs({
                        ...gamepadPrefs,
                        buttons: { ...gamepadPrefs.buttons, [padCapture.action]: index }
                    });
                }
                setPadCapture(null);
            } else {
                const index = detectMovedAxis(pad, baseline);
                if (index === null) return;
                const conflict = isAxisAlreadyBound(index, padCapture.action, gamepadPrefs.axes);
                if (conflict) {
                    setPadConflict({ kind: 'axis', action: conflict });
                    setTimeout(() => setPadConflict(null), 2000);
                } else {
                    commitGamepadPrefs({
                        ...gamepadPrefs,
                        axes: { ...gamepadPrefs.axes, [padCapture.action]: index }
                    });
                }
                setPadCapture(null);
            }
        }, 50);

        const handleKeyDown = (e) => {
            if (e.code === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setPadCapture(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);

        return () => {
            clearInterval(poll);
            window.removeEventListener('keydown', handleKeyDown, true);
            window.dispatchEvent(new CustomEvent('sds-gamepad-capture', { detail: false }));
        };
    }, [padCapture, gamepadPrefs, commitGamepadPrefs]);

    // Deadzone live preview: post-deadzone left-stick magnitude, polled only
    // while the Controls tab is open with a pad connected. Functional set +
    // rounding keeps idle polls from re-rendering.
    useEffect(() => {
        if (!padConnected || activeTab !== 'controls') return;
        const poll = setInterval(() => {
            const pad = getFirstConnectedPad();
            const x = pad ? (pad.axes[gamepadPrefs.axes.moveX] || 0) : 0;
            const y = pad ? (pad.axes[gamepadPrefs.axes.moveY] || 0) : 0;
            const magnitude = Math.round(
                applyCircularDeadzone(x, y, gamepadPrefs.deadzone).magnitude * 100
            ) / 100;
            setStickPreview((prev) => (prev === magnitude ? prev : magnitude));
        }, 120);
        return () => clearInterval(poll);
    }, [padConnected, activeTab, gamepadPrefs]);

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

    // Handle key binding capture. Capture-phase listener so the press never
    // reaches InputHandler's window listener (Escape would toggle pause, Space
    // would queue a bark) while the rebinder is armed.
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

            // Escape cancels the capture instead of binding (it is the
            // hardwired pause fallback in InputHandler anyway).
            if (keyCode === 'Escape') {
                setListeningForKey(null);
                return;
            }

            // Conflict detection against the live bindings: a key bound to
            // another action is rejected with feedback, not silently swapped.
            const currentBindings = { ...DEFAULT_KEY_BINDINGS, ...settings.keyBindings };
            const conflictAction = isKeyAlreadyBound(keyCode, listeningForKey, currentBindings);
            if (conflictAction) {
                setKeyConflict({ key: keyCode, action: conflictAction });
                setTimeout(() => setKeyConflict(null), 2000);
                setListeningForKey(null);
                return;
            }

            // Update the binding
            const newBindings = { ...currentBindings, [listeningForKey]: keyCode };
            const newSettings = { ...settings, keyBindings: newBindings };
            onSettingsChange(newSettings);
            saveSettings(newSettings);
            setListeningForKey(null);

            // Dispatch event for InputHandler
            window.dispatchEvent(new CustomEvent('keybindings-changed', {
                detail: newBindings
            }));
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
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
        { id: 'controls', label: t('settings.tabs.controls'), icon: '\u2328' },
        { id: 'general', label: t('settings.tabs.general'), icon: '\u2630' }
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

        createElement(SettingRow, {
            key: 'renderer-diagnostics',
            label: t('settings.rendererDiagnostics'),
            description: rendererDiagnosticsText(),
            isCompact
        }),

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
        }))
    ]);

    // Small uppercase section header used inside the General tab.
    const sectionHeader = (key, label, topMargin = '1.25rem') => createElement('div', {
        key,
        style: {
            color: 'rgba(247,241,230,0.7)',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: `${topMargin} 0 0.5rem`
        }
    }, label);

    // General tab content: language, accessibility, tutorial, player profile.
    // ([P1-SETTINGS-LANG] / [P1-SETTINGS-A11Y] / [P1-SETTINGS-PANEL])
    const renderGeneralTab = () => createElement('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '0.25rem' }
    }, [
        // Language selector (shared component, full variant).
        sectionHeader('language-label', t('settings.language'), '0'),
        createElement(LanguageSelector, { key: 'language-selector', variant: 'full' }),

        // Accessibility: colorblind-safe medal/rank palette.
        sectionHeader('a11y-label', t('settings.accessibility')),
        createElement(SettingRow, {
            key: 'colorblind',
            label: t('settings.colorblindMode'),
            description: t('settings.colorblindModeDesc'),
            isCompact
        }, createElement(Toggle, {
            value: settings.colorblindMode === true,
            onChange: (v) => handleSettingChange('colorblindMode', v)
        })),

        // Tutorial re-trigger ([P1-TUTORIAL] hook). startTutorial() drives the
        // Home Field scene swap itself; leave Settings first so the entrance
        // (and its scene-swap overlay) is what the player watches, and the
        // whole start surface unmounts once the run goes live.
        createElement(SettingRow, {
            key: 'tutorial',
            label: t('settings.tutorialLabel'),
            description: t('settings.tutorialDesc'),
            isCompact
        }, createElement(Button, {
            variant: 'secondary',
            size: 'sm',
            onClick: () => {
                if (onBack) onBack();
                void startTutorial();
            }
        }, t('settings.replayTutorial'))),

        // Player profile: leaderboard display name + identity reset.
        sectionHeader('profile-label', t('settings.profile')),
        createElement(DisplayNameField, { key: 'display-name' }),
        createElement(SettingRow, {
            key: 'reset-profile',
            label: t('settings.resetProfile'),
            description: t('settings.resetProfileDesc'),
            isCompact
        }, createElement(Button, {
            variant: 'danger',
            size: 'sm',
            onClick: () => {
                if (!confirm(t('settings.resetProfileConfirm'))) return;
                try { localStorage.removeItem('playerIdentity'); } catch {}
                window.location.reload();
            }
        }, t('settings.resetProfile')))
    ]);

    // [P4-GAMEPAD-UI] Arm/disarm a capture; clicking the armed control again
    // cancels it.
    const togglePadCapture = (kind, action) => setPadCapture(
        (cur) => (cur && cur.kind === kind && cur.action === action ? null : { kind, action })
    );

    // [P4-GAMEPAD-UI] Gamepad block for the Controls tab: the static support
    // note when no pad is connected, the remap + deadzone editor when one is.
    const renderGamepadSection = () => {
        if (!padConnected) {
            return [
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
            ];
        }

        return [
            // Section header + reset
            createElement('div', {
                key: 'gamepad-header',
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    margin: '1.25rem 0 0.5rem'
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
                }, t('settings.gamepadSupport')),
                createElement(Button, {
                    key: 'reset',
                    variant: 'ghost',
                    size: 'sm',
                    onClick: () => commitGamepadPrefs(getDefaultGamepadPrefs())
                }, t('settings.resetBindings'))
            ]),

            // Conflict feedback (mirrors the keyboard conflict box)
            padConflict && createElement('div', {
                key: 'pad-conflict',
                style: {
                    background: 'rgba(217, 154, 143, 0.2)',
                    border: '1px solid rgba(217, 154, 143, 0.5)',
                    borderRadius: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    marginBottom: '0.5rem',
                    color: '#e8b4ab',
                    fontSize: '0.8rem'
                }
            }, t(
                padConflict.kind === 'axis' ? 'settings.axisConflict' : 'settings.padConflict',
                { action: t(`settings.actions.${padConflict.action}`) }
            )),

            // Deadzone slider + live post-deadzone stick preview
            createElement(SettingRow, {
                key: 'pad-deadzone',
                label: t('settings.gamepadDeadzone'),
                description: t('settings.gamepadDeadzoneDesc'),
                isCompact
            }, createElement(Slider, {
                value: gamepadPrefs.deadzone,
                min: DEADZONE_MIN,
                max: DEADZONE_MAX,
                step: 0.01,
                onChange: (v) => commitGamepadPrefs({ ...gamepadPrefs, deadzone: v }),
                formatValue: (v) => v.toFixed(2)
            })),
            createElement('div', {
                key: 'pad-preview',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid rgba(247,241,230,0.08)'
                }
            }, [
                createElement('div', {
                    key: 'label',
                    style: { color: 'rgba(247,241,230,0.55)', fontSize: '0.75rem', flexShrink: 0 }
                }, t('settings.stickPreview')),
                createElement('div', {
                    key: 'track',
                    style: {
                        flex: 1,
                        height: '6px',
                        borderRadius: '3px',
                        background: '#374151',
                        overflow: 'hidden'
                    }
                }, createElement('div', {
                    style: {
                        width: `${Math.round(stickPreview * 100)}%`,
                        height: '100%',
                        background: '#5e9e6e',
                        transition: 'width 0.1s linear'
                    }
                })),
                createElement('span', {
                    key: 'value',
                    style: {
                        minWidth: '3rem',
                        textAlign: 'right',
                        color: '#f7f1e6',
                        fontSize: '0.875rem',
                        fontFamily: 'monospace'
                    }
                }, stickPreview.toFixed(2))
            ]),

            // Button remap rows
            sectionHeader('pad-buttons-label', t('settings.gamepadButtons'), '0.75rem'),
            ...Object.entries(gamepadPrefs.buttons).map(([action, index]) =>
                createElement(SettingRow, {
                    key: `pad-btn-${action}`,
                    label: t(`settings.actions.${action}`),
                    isCompact
                }, createElement(PadBindButton, {
                    label: getGamepadButtonLabel(index),
                    listeningLabel: t('settings.pressButton'),
                    isListening: padCapture?.kind === 'button' && padCapture.action === action,
                    onClick: () => togglePadCapture('button', action)
                }))
            ),

            // Movement axis assignment rows
            sectionHeader('pad-axes-label', t('settings.gamepadAxes'), '0.75rem'),
            ...Object.entries(gamepadPrefs.axes).map(([axis, index]) =>
                createElement(SettingRow, {
                    key: `pad-axis-${axis}`,
                    label: t(`settings.actions.${axis}`),
                    isCompact
                }, createElement(PadBindButton, {
                    label: t('settings.axisLabel', { index }),
                    listeningLabel: t('settings.moveAxis'),
                    isListening: padCapture?.kind === 'axis' && padCapture.action === axis,
                    onClick: () => togglePadCapture('axis', axis)
                }))
            )
        ];
    };

    // Controls tab content
    const renderControlsTab = () => createElement('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '0.25rem' }
    }, [
        createElement(CameraModePicker, {
            key: 'camera-mode',
            mode: cameraMode,
            onChange: handleCameraModeChange,
            cycleKey: (settings.keyBindings || DEFAULT_KEY_BINDINGS).cameraCycle || DEFAULT_KEY_BINDINGS.cameraCycle,
            t
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

        // Key bindings: merge over defaults so a stale persisted set (saved
        // before bark/cameraCycle became bindable) still lists every action.
        ...Object.entries({ ...DEFAULT_KEY_BINDINGS, ...settings.keyBindings }).map(([action, keyCode]) =>
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

        // Gamepad: note when disconnected, remap + deadzone editor when
        // connected ([P4-GAMEPAD-UI])
        ...renderGamepadSection()
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
                activeTab === 'controls' && renderControlsTab(),
                activeTab === 'general' && renderGeneralTab()
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
                }, t('settings.aboutLink'))
            ])
        ])
    );
}
