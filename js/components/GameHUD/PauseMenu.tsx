// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * PauseMenu Component
 * Full-featured pause screen with resume, restart, settings, and menu options
 * Works on both desktop and mobile with responsive design
 *
 * Cycle 51 P8: converted from React.createElement to idiomatic JSX (.tsx) and
 * restyled onto the pastoral design language (tokens.ts). Bespoke inline SVG
 * icons replaced with the shared <Icon> family. Form + style only - every
 * behavior is preserved.
 */
import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Z } from '../../ui/zIndex.js';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { Icon } from '../ui/Icon';
import { pastoral, alpha } from '../ui/tokens';
import { useMenuNavigation } from '../hooks/useMenuNavigation';
import {
    loadSettings,
    saveSettings,
    applySettingsToGame,
    applyPerformancePreset,
} from '../shared/settings.js';

// Settings shape is loose (the shared settings module is untyped JS); model the
// fields this component reads/writes and allow the rest through.
interface GameSettings {
    performanceMode?: string;
    experimentalWebGpu?: boolean;
    audioEnabled?: boolean;
    audioVolume?: number;
    telemetryEnabled?: boolean;
    showStats?: boolean;
    [key: string]: unknown;
}

interface ToggleProps {
    value: boolean;
    onChange: (next: boolean) => void;
    color?: string;
}

// Toggle component for settings
function Toggle({ value, onChange, color = pastoral.accentMeadow }: ToggleProps) {
    return (
        <button
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(!value);
            }}
            style={{
                width: '44px',
                height: '24px',
                borderRadius: '12px',
                background: value ? color : '#4b5563',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.2s ease',
                flexShrink: 0
            }}
        >
            <div
                style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: pastoral.cream,
                    position: 'absolute',
                    top: '2px',
                    left: value ? '22px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                }}
            />
        </button>
    );
}

interface SliderProps {
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (next: number) => void;
    color?: string;
}

// Slider component for settings
function Slider({ value, min, max, step = 1, onChange, color = pastoral.accentMeadow }: SliderProps) {
    const percentage = ((value - min) / (max - min)) * 100;

    return (
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => {
                e.stopPropagation();
                onChange(parseFloat(e.target.value));
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
                width: '100px',
                height: '6px',
                borderRadius: '3px',
                appearance: 'none',
                WebkitAppearance: 'none',
                background: `linear-gradient(to right, ${color} 0%, ${color} ${percentage}%, #374151 ${percentage}%, #374151 100%)`,
                cursor: 'pointer',
                outline: 'none'
            }}
        />
    );
}

interface InGameSettingsProps {
    settings: GameSettings;
    onSettingsChange: (next: GameSettings) => void;
    onBack: () => void;
    isCompact: boolean;
}

// In-game settings panel
function InGameSettings({ settings, onSettingsChange, onBack, isCompact }: InGameSettingsProps) {
    const { t } = useTranslation();

    const handleChange = (key: string, value: unknown) => {
        const newSettings = { ...settings, [key]: value };
        onSettingsChange(newSettings);
        saveSettings(newSettings);
        applySettingsToGame(newSettings, { applyRenderer: key === 'experimentalWebGpu' });
    };

    const handlePresetChange = (preset: string) => {
        const newSettings = applyPerformancePreset(preset, settings);
        onSettingsChange(newSettings);
        saveSettings(newSettings);
        applySettingsToGame(newSettings);
    };

    const rowStyle: CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.5rem 0',
        borderBottom: `1px solid ${alpha(pastoral.cream, 8)}`
    };

    const labelStyle: CSSProperties = {
        color: pastoral.cream,
        fontSize: isCompact ? '0.8rem' : '0.9rem'
    };

    const infoLinkStyle: CSSProperties = {
        color: alpha(pastoral.cream, 55),
        fontSize: isCompact ? '0.72rem' : '0.78rem',
        textDecoration: 'none'
    };

    const presetButtonStyle = (isActive: boolean, color: string): CSSProperties => ({
        flex: 1,
        padding: isCompact ? '0.5rem' : '0.6rem',
        background: isActive ? alpha(color, 13) : alpha(pastoral.cream, 5),
        border: isActive ? `2px solid ${color}` : `1px solid ${pastoral.glassWarmBorder}`,
        borderRadius: '0.5rem',
        color: isActive ? color : alpha(pastoral.cream, 65),
        fontSize: isCompact ? '0.7rem' : '0.75rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s'
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Back button header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.5rem',
                    paddingBottom: '0.5rem',
                    borderBottom: `1px solid ${pastoral.glassWarmBorder}`
                }}
            >
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onBack();
                    }}
                    style={{
                        background: alpha(pastoral.cream, 10),
                        border: 'none',
                        borderRadius: '0.5rem',
                        padding: '0.4rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: pastoral.cream
                    }}
                >
                    <Icon name="prev" size={18} color={pastoral.cream} />
                </button>
                <span
                    style={{ color: pastoral.cream, fontWeight: 600, fontSize: isCompact ? '0.9rem' : '1rem' }}
                >
                    {t('settings.title')}
                </span>
            </div>

            {/* Performance presets */}
            <div style={{ marginBottom: '0.5rem' }}>
                <div
                    style={{
                        color: alpha(pastoral.cream, 65),
                        fontSize: '0.7rem',
                        textTransform: 'uppercase',
                        marginBottom: '0.4rem'
                    }}
                >
                    {t('settings.presets')}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); handlePresetChange('performance'); }}
                        style={presetButtonStyle(settings.performanceMode === 'performance', '#22c55e')}
                    >
                        {t('settings.performanceOption')}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handlePresetChange('balanced'); }}
                        style={presetButtonStyle(settings.performanceMode === 'balanced', pastoral.accentMeadow)}
                    >
                        {t('settings.balancedOption')}
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handlePresetChange('quality'); }}
                        style={presetButtonStyle(settings.performanceMode === 'quality', '#a855f7')}
                    >
                        {t('settings.qualityOption')}
                    </button>
                </div>
            </div>

            <div style={rowStyle}>
                <div
                    style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', marginRight: '0.75rem' }}
                >
                    <span style={labelStyle}>{t('settings.experimentalWebGpu')}</span>
                    <span
                        style={{
                            color: alpha(pastoral.cream, 55),
                            fontSize: isCompact ? '0.68rem' : '0.72rem'
                        }}
                    >
                        {t('settings.experimentalWebGpuDesc')}
                    </span>
                </div>
                <Toggle
                    value={settings.experimentalWebGpu !== false}
                    onChange={(v) => handleChange('experimentalWebGpu', v)}
                    color={pastoral.accentMeadow}
                />
            </div>

            {/* Audio toggle */}
            <div style={rowStyle}>
                <span style={labelStyle}>{t('settings.audioEnabled')}</span>
                <Toggle
                    value={settings.audioEnabled ?? true}
                    onChange={(v) => handleChange('audioEnabled', v)}
                    color="#22c55e"
                />
            </div>

            {/* Volume slider (if audio enabled) */}
            {settings.audioEnabled && (
                <div style={rowStyle}>
                    <span style={labelStyle}>{t('settings.audioVolume')}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Slider
                            value={settings.audioVolume ?? 70}
                            min={0}
                            max={100}
                            step={5}
                            onChange={(v) => handleChange('audioVolume', v)}
                            color="#22c55e"
                        />
                        <span
                            style={{ color: alpha(pastoral.cream, 65), fontSize: '0.8rem', minWidth: '2.5rem', textAlign: 'right' }}
                        >
                            {`${settings.audioVolume}%`}
                        </span>
                    </div>
                </div>
            )}

            {/* Product telemetry toggle */}
            <div style={rowStyle}>
                <div
                    style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', marginRight: '0.75rem' }}
                >
                    <span style={labelStyle}>{t('settings.telemetryEnabled', 'Product telemetry')}</span>
                    <span
                        style={{
                            color: alpha(pastoral.cream, 55),
                            fontSize: isCompact ? '0.68rem' : '0.72rem'
                        }}
                    >
                        {t('settings.telemetryEnabledDesc', 'Helps tune the beta. Scores and multiplayer still use required service logs.')}
                    </span>
                </div>
                <Toggle
                    value={settings.telemetryEnabled !== false}
                    onChange={(v) => handleChange('telemetryEnabled', v)}
                    color={pastoral.accentMeadow}
                />
            </div>

            {/* Performance stats toggle */}
            <div style={rowStyle}>
                <span style={labelStyle}>{t('settings.showStats')}</span>
                <Toggle
                    value={settings.showStats ?? false}
                    onChange={(v) => handleChange('showStats', v)}
                    color="#f59e0b"
                />
            </div>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                    gap: '0.8rem',
                    paddingTop: '0.7rem'
                }}
            >
                <a
                    href="/support"
                    target="_blank"
                    rel="noopener"
                    onClick={(e) => e.stopPropagation()}
                    style={infoLinkStyle}
                >
                    Support
                </a>
                <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener"
                    onClick={(e) => e.stopPropagation()}
                    style={infoLinkStyle}
                >
                    Privacy
                </a>
            </div>
        </div>
    );
}

interface MenuButtonProps {
    icon?: ReactNode;
    label: ReactNode;
    onClick?: () => void;
    variant?: 'default' | 'primary' | 'secondary';
    size?: 'normal' | 'small';
}

// Menu button component
function MenuButton({ icon, label, onClick, variant = 'default', size = 'normal' }: MenuButtonProps) {
    const { isLandscapeMobile } = useResponsive();

    const isSmall = size === 'small' || isLandscapeMobile;
    const isPrimary = variant === 'primary';
    const isSecondary = variant === 'secondary';

    const buttonStyle: CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isSmall ? '0.5rem' : '0.75rem',
        width: '100%',
        padding: isSmall ? '0.75rem 1rem' : '1rem 1.5rem',
        fontSize: isSmall ? '0.9rem' : '1.1rem',
        fontWeight: 600,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: pastoral.cream,
        background: isPrimary
            ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
            : isSecondary
                ? alpha(pastoral.cream, 10)
                : alpha(pastoral.cream, 15),
        border: isPrimary
            ? '1px solid rgba(34, 197, 94, 0.5)'
            : `1px solid ${pastoral.glassWarmBorder}`,
        borderRadius: '0.75rem',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: isPrimary
            ? '0 4px 15px rgba(34, 197, 94, 0.3)'
            : '0 2px 10px rgba(0, 0, 0, 0.2)',
        WebkitTapHighlightColor: 'transparent'
    };

    return (
        <button
            style={buttonStyle}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[PauseMenu] Button clicked:', label);
                if (onClick) onClick();
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = isPrimary
                    ? '0 6px 20px rgba(34, 197, 94, 0.4)'
                    : '0 4px 15px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = isPrimary
                    ? '0 4px 15px rgba(34, 197, 94, 0.3)'
                    : '0 2px 10px rgba(0, 0, 0, 0.2)';
            }}
            onTouchStart={(e) => {
                e.currentTarget.style.transform = 'scale(0.98)';
            }}
            onTouchEnd={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
            }}
        >
            {icon && <span style={{ display: 'flex', pointerEvents: 'none' }}>{icon}</span>}
            <span style={{ pointerEvents: 'none' }}>{label}</span>
        </button>
    );
}

interface PauseMenuProps {
    isVisible: boolean;
    onResume?: () => void;
    onRestart?: () => void;
    onMainMenu?: () => void;
    onToggleFullscreen?: () => void;
    isFullscreen?: boolean;
    showFullscreenOption?: boolean;
    gameMode?: string;
    // Cycle 59 (Counting Sheep): bank-and-finish entry, shown only for a
    // round-based run (counting never auto-ends, so the pause menu offers a
    // second reachable bank affordance alongside the always-visible HUD one).
    roundBased?: boolean;
    onBankCounting?: () => void;
}

export function PauseMenu({
    isVisible,
    onResume,
    onRestart,
    onMainMenu,
    onToggleFullscreen,
    isFullscreen = false,
    showFullscreenOption = false,
    gameMode = 'solo',
    roundBased = false,
    onBankCounting
}: PauseMenuProps) {
    const { t } = useTranslation();
    const { isMobile, isLandscapeMobile } = useResponsive();
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState<GameSettings>(() => loadSettings());

    // Reset settings view when menu closes
    useEffect(() => {
        if (!isVisible) {
            setShowSettings(false);
        }
    }, [isVisible]);

    // Handle escape key to resume or go back from settings
    useEffect(() => {
        if (!isVisible) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (showSettings) {
                    setShowSettings(false);
                } else {
                    onResume?.();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isVisible, onResume, showSettings]);

    // Cycle 60 P4: controller + keyboard navigation over the pause buttons.
    // handleEscape:false - the Escape effect above already owns that key; this
    // adds gamepad B (resume, or back out of settings) and d-pad/stick focus.
    const navRef = useRef<HTMLDivElement>(null);
    useMenuNavigation(navRef, {
        enabled: isVisible,
        handleEscape: false,
        onBack: () => { if (showSettings) setShowSettings(false); else onResume?.(); },
    });

    if (!isVisible) return null;

    // Responsive sizing
    const containerPadding = isLandscapeMobile ? '1rem' : isMobile ? '1.5rem' : '2rem';
    const titleSize = isLandscapeMobile ? '1.5rem' : isMobile ? '2rem' : '2.5rem';
    const subtitleSize = isLandscapeMobile ? '0.75rem' : isMobile ? '0.85rem' : '1rem';
    const buttonGap = isLandscapeMobile ? '0.5rem' : '0.75rem';
    const maxWidth = isLandscapeMobile ? '280px' : isMobile ? '320px' : '400px';

    // Overlay style
    const overlayStyle: CSSProperties = {
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: Z.modal,
        animation: 'fadeIn 0.2s ease-out',
        padding: containerPadding,
        pointerEvents: 'auto' // Ensure clicks work despite parent having pointer-events: none
    };

    // Panel style
    const panelStyle: CSSProperties = {
        background: 'rgba(30, 30, 40, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '1.5rem',
        border: `1px solid ${pastoral.glassWarmBorder}`,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        padding: containerPadding,
        width: '100%',
        maxWidth,
        animation: 'scaleIn 0.25s ease-out'
    };

    // Title style
    const titleStyle: CSSProperties = {
        fontSize: titleSize,
        fontWeight: 800,
        color: pastoral.cream,
        textAlign: 'center',
        marginBottom: '0.25rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        letterSpacing: '2px'
    };

    // Subtitle style
    const subtitleStyle: CSSProperties = {
        fontSize: subtitleSize,
        color: alpha(pastoral.cream, 50),
        textAlign: 'center',
        marginBottom: isLandscapeMobile ? '1rem' : '1.5rem',
        fontFamily: 'system-ui, -apple-system, sans-serif'
    };

    // Buttons container style
    const buttonsStyle: CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        gap: buttonGap
    };

    // Divider style
    const dividerStyle: CSSProperties = {
        height: '1px',
        background: alpha(pastoral.cream, 10),
        margin: `${buttonGap} 0`
    };

    const buttonSize = isLandscapeMobile ? 'small' : 'normal';
    const iconSize = isLandscapeMobile ? 18 : 22;

    return (
        <div
            style={overlayStyle}
            onClick={(e) => {
                // Only close if clicking the overlay background (and not in settings)
                if (e.target === e.currentTarget && !showSettings) {
                    onResume?.();
                }
            }}
        >
            <div ref={navRef} style={panelStyle}>
                {showSettings ? (
                    // Settings panel
                    <InGameSettings
                        settings={settings}
                        onSettingsChange={setSettings}
                        onBack={() => setShowSettings(false)}
                        isCompact={isLandscapeMobile}
                    />
                ) : (
                    <>
                        {/* Title */}
                        <h2 style={titleStyle}>{t('pause.title')}</h2>

                        {/* Subtitle with control hint */}
                        <p style={subtitleStyle}>
                            {isMobile ? t('pause.tapToResume') : t('pause.pressEscToResume')}
                        </p>

                        {/* Buttons */}
                        <div style={buttonsStyle}>
                            {/* Resume button (primary) */}
                            <MenuButton
                                icon={<Icon name="play" size={iconSize} color={pastoral.cream} />}
                                label={t('pause.resume')}
                                variant="primary"
                                size={buttonSize}
                                onClick={onResume}
                            />

                            {/* Cycle 59 (Counting Sheep): bank-and-finish entry. */}
                            {roundBased && onBankCounting && (
                                <MenuButton
                                    icon={<Icon name="trophy" size={iconSize} color={pastoral.cream} />}
                                    label={t('pause.bankAndFinish')}
                                    size={buttonSize}
                                    onClick={onBankCounting}
                                />
                            )}

                            {/* Restart button */}
                            <MenuButton
                                icon={<Icon name="replay" size={iconSize} color={pastoral.cream} />}
                                label={t('pause.restart')}
                                size={buttonSize}
                                onClick={onRestart}
                            />

                            {/* Settings button */}
                            <MenuButton
                                icon={<Icon name="settings" size={iconSize} color={pastoral.cream} />}
                                label={t('menu.settings')}
                                size={buttonSize}
                                onClick={() => setShowSettings(true)}
                            />

                            {/* Divider */}
                            <div style={dividerStyle} />

                            {/* Fullscreen toggle (mobile only) */}
                            {showFullscreenOption && (
                                <MenuButton
                                    icon={<Icon name="fullscreen" size={iconSize} color={pastoral.cream} />}
                                    label={isFullscreen ? t('pause.exitFullscreen') : t('pause.fullscreen')}
                                    variant="secondary"
                                    size={buttonSize}
                                    onClick={onToggleFullscreen}
                                />
                            )}

                            {/* Main Menu button */}
                            <MenuButton
                                icon={<Icon name="home" size={iconSize} color={pastoral.cream} />}
                                label={t('pause.mainMenu')}
                                variant="secondary"
                                size={buttonSize}
                                onClick={onMainMenu}
                            />

                            <MenuButton
                                icon={<Icon name="info" size={iconSize} color={pastoral.cream} />}
                                label="Source"
                                variant="secondary"
                                size={buttonSize}
                                onClick={() => {
                                    window.open('https://github.com/matthew-kissinger/sds', '_blank', 'noopener,noreferrer');
                                }}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// Add animations to document if not present
if (typeof document !== 'undefined') {
    const styleId = 'pause-menu-animations';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes scaleIn {
                from {
                    opacity: 0;
                    transform: scale(0.9);
                }
                to {
                    opacity: 1;
                    transform: scale(1);
                }
            }
        `;
        document.head.appendChild(style);
    }
}
