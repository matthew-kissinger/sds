// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * CompletionScreen Component
 * Polished victory/completion overlay for all game modes.
 *
 * Cycle 51 P9: converted from React.createElement to idiomatic JSX .tsx and
 * restyled onto the pastoral design language. The shared <Icon> family replaces
 * the inline lucide-style trophy/clock/users/refresh/home glyphs; the decorative
 * Medal and Star glyphs stay inline (designed celebration marks with specific
 * gold/silver/bronze + rating colors, no clean shared equivalent). Cool-white
 * glass + blue cooperative branding moved to warm cream glass + meadow accent.
 * Behavior-identical: confetti, medal tiers, score rows, per-mode branches, and
 * all timings preserved exactly.
 */
import { useState, useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Icon } from '../ui/Icon';
import { pastoral, alpha } from '../ui/tokens';
import { useMenuNavigation } from '../hooks/useMenuNavigation';
import { subscribeGameEvent } from '../../GameBridge.js';
import { getPlayerIdentity } from '../shared/playerIdentity.js';
import { NameField } from '../shared/NameField';

// Decorative celebration glyphs kept inline (no clean shared equivalent): the
// medal ribbon (gold/silver/bronze ranking) and the rating star.
function MedalGlyph({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15" />
            <path d="M11 12 5.12 2.2" />
            <path d="m13 12 5.88-9.8" />
            <path d="M8 14h8" />
            <circle cx="12" cy="17" r="5" />
        </svg>
    );
}

function StarGlyph({ size = 24, color = 'currentColor', filled = false }: { size?: number; color?: string; filled?: boolean }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={filled ? color : 'none'}
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
    );
}

// Medal colors for rankings (semantic/decorative - kept as-is: gold/silver/
// bronze are a universal rank convention, only shown in the MP standings list).
const MEDAL_COLORS: Record<number, { bg: string; text: string; glow: string }> = {
    1: { bg: 'linear-gradient(135deg, #FFD700, #FFA500)', text: '#000', glow: 'rgba(255, 215, 0, 0.4)' },
    2: { bg: 'linear-gradient(135deg, #E8E8E8, #B8B8B8)', text: '#000', glow: 'rgba(192, 192, 192, 0.4)' },
    3: { bg: 'linear-gradient(135deg, #CD7F32, #8B4513)', text: '#fff', glow: 'rgba(205, 127, 50, 0.4)' }
};

// Cycle 58 close: pastoral result palette. The Cycle 51 P9 conversion warmed the
// glass + text but left the accents/gradients on the old tech palette (emerald
// #10b981, amber #f59e0b), so the win screen drifted from the cream/gold/meadow
// look of the entrance + HUD. These route every result accent through the
// pastoral tokens: warm meadow green for a win, low-sun gold for a runner-up,
// sunlit gold for the trophy + winner highlights.
const VICTORY_ACCENT = pastoral.accentMeadow;   // #5e9e6e warm meadow, primary
const RUNNERUP_ACCENT = pastoral.accentGold;    // #e0a458 low-sun gold
const TROPHY_GOLD = pastoral.accentGold;        // calm sunlit gold (was #FFD700)
const VICTORY_BG = `linear-gradient(135deg, ${alpha(pastoral.accentMeadow, 20)}, ${alpha(pastoral.accentGold, 10)})`;
const RUNNERUP_BG = `linear-gradient(135deg, ${alpha(pastoral.accentGold, 18)}, ${alpha(pastoral.pastureDusk, 10)})`;

// Animated counter component
function AnimatedNumber({ value, duration = 1000 }: { value: number; duration?: number }) {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        const startTime = Date.now();
        const startValue = 0;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplayValue(Math.floor(startValue + (value - startValue) * eased));

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [value, duration]);

    return <span>{displayValue}</span>;
}

interface Particle {
    id: number;
    x: number;
    delay: number;
    duration: number;
    color: string;
    size: number;
    rotation: number;
}

// Confetti particle
function Confetti() {
    const [particles, setParticles] = useState<Particle[]>([]);

    useEffect(() => {
        // Cycle 58 close: warm pastoral petals (pasture dawn/gold, sunlit gold,
        // sage meadow, cream, dusty rose) instead of the old teal/pink/purple
        // rainbow, so the celebration reads calm and matches the palette.
        const colors = [
            pastoral.pastureDawn, pastoral.pastureGold, pastoral.accentGold,
            pastoral.meadow, pastoral.cream, pastoral.pastureDusk,
        ];
        const newParticles: Particle[] = [];

        for (let i = 0; i < 40; i++) {
            newParticles.push({
                id: i,
                x: Math.random() * 100,
                delay: Math.random() * 2,
                duration: 2 + Math.random() * 2,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 6 + Math.random() * 8,
                rotation: Math.random() * 360
            });
        }
        setParticles(newParticles);
    }, []);

    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                overflow: 'hidden',
                pointerEvents: 'none'
            }}
        >
            {particles.map(p => (
                <div
                    key={p.id}
                    style={{
                        position: 'absolute',
                        left: `${p.x}%`,
                        top: '-20px',
                        width: `${p.size}px`,
                        height: `${p.size}px`,
                        background: p.color,
                        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                        transform: `rotate(${p.rotation}deg)`,
                        animation: `confettiFall ${p.duration}s ease-in ${p.delay}s infinite`,
                        opacity: 0.9
                    }}
                />
            ))}
        </div>
    );
}

// Rank badge component
function RankBadge({ rank, size = 'normal' }: { rank: number; size?: 'normal' | 'large' }) {
    const isTopThree = rank <= 3;
    const medal = MEDAL_COLORS[rank];
    const sizeClass: CSSProperties = size === 'large'
        ? { width: '48px', height: '48px', fontSize: '20px' }
        : { width: '32px', height: '32px', fontSize: '14px' };

    return (
        <div
            style={{
                ...sizeClass,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                background: isTopThree ? medal.bg : alpha(pastoral.cream, 10),
                color: isTopThree ? medal.text : pastoral.cream,
                border: isTopThree ? 'none' : `1px solid ${alpha(pastoral.cream, 20)}`,
                boxShadow: isTopThree ? `0 4px 12px ${medal.glow}` : 'none'
            }}
        >
            {rank}
        </div>
    );
}

interface ScoreEntry {
    id?: number | string;
    name?: string;
    score: number;
    isMe?: boolean;
}

// Score row component
function ScoreRow({
    rank,
    playerName,
    score,
    isMe,
    isWinner,
    t
}: {
    rank: number;
    playerName: string;
    score: number;
    isMe?: boolean;
    isWinner?: boolean;
    t: TFunction;
}) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                background: isMe ? alpha(pastoral.accentMeadow, 16) : alpha(pastoral.cream, 3),
                borderRadius: '12px',
                border: isMe ? `1px solid ${alpha(pastoral.accentMeadow, 32)}` : `1px solid ${alpha(pastoral.cream, 5)}`,
                marginBottom: '8px',
                animation: `slideInRight 0.5s ease-out ${rank * 0.1}s both`
            }}
        >
            <RankBadge rank={rank} />
            <div style={{ flex: 1 }}>
                <div
                    style={{
                        color: pastoral.cream,
                        fontWeight: isMe ? '600' : '400',
                        fontSize: '14px'
                    }}
                >
                    {playerName + (isMe ? ` (${t('common.you')})` : '')}
                </div>
            </div>
            <div
                style={{
                    color: isWinner ? TROPHY_GOLD : pastoral.cream,
                    fontWeight: '600',
                    fontSize: '16px'
                }}
            >
                {t('completion.sheepUnit', { count: score })}
            </div>
        </div>
    );
}

interface StatEntry {
    label: string;
    value: string;
    icon: ReactNode;
}

interface CompletionContent {
    title: string;
    subtitle: string;
    icon: ReactNode;
    accentColor: string;
    bgGradient: string;
    showConfetti: boolean;
    showNewBest?: boolean;
    stats: StatEntry[];
    scores?: ScoreEntry[];
}

export interface CompletionData {
    totalSheep?: number;
    finalTime?: number;
    isWinner?: boolean;
    winnerName?: string;
    myScore?: number;
    scores?: ScoreEntry[];
    isNewBest?: boolean;
    sheepCount?: number;
    replayBlobUrl?: string;
    // Cycle 59 (Counting Sheep): the banked counted total + the round reached.
    counted?: number;
    round?: number;
}

export interface CompletionScreenProps {
    mode: 'single' | 'racing' | 'timed' | 'cooperative' | string;
    data: CompletionData;
    onPlayAgain: () => void;
    onMainMenu?: () => void;
}

// Main completion screen component
export function CompletionScreen({ mode, data, onPlayAgain, onMainMenu }: CompletionScreenProps) {
    const { t } = useTranslation();
    const [isVisible, setIsVisible] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<{ ok: boolean } | null>(null);
    // Cycle 58 P8: after a saved run, offer the still-auto-named player a chance
    // to set their own leaderboard name. Non-blocking, dismissed once saved.
    const [nameSaved, setNameSaved] = useState(false);
    const isAutoNamed = (getPlayerIdentity()?.nameType ?? 'auto') === 'auto';

    useEffect(() => {
        // Trigger entrance animation
        setTimeout(() => setIsVisible(true), 50);
    }, []);

    // Cycle 57 P6: reflect whether the score saved to the leaderboard. Only
    // single-player solo modes submit; the submit path sets
    // window.__sdsLastSubmit and emits 'leaderboard-submit-result'. Modes that
    // don't submit (Just Play, sandbox, practice, multiplayer) never fire it,
    // so the line stays hidden.
    useEffect(() => {
        // Cycle 59: counting also submits (the banked total), so it shows the
        // saved/could-not-save line and the post-score naming offer too.
        if (mode !== 'single' && mode !== 'counting') return;
        const read = () => {
            const r = typeof window !== 'undefined' ? (window as { __sdsLastSubmit?: { ok?: boolean } }).__sdsLastSubmit : null;
            if (r && typeof r.ok === 'boolean') setSubmitStatus({ ok: r.ok });
        };
        read(); // in case the submit resolved before this screen mounted
        return subscribeGameEvent('leaderboard-submit-result', read);
    }, [mode]);

    // Cycle 27 Phase E: revoke the replay blob URL when the screen
    // unmounts so we don't leak the WebM bytes after the player picks
    // Play Again or Main Menu.
    useEffect(() => {
        const url = data?.replayBlobUrl;
        if (!url) return;
        return () => { try { URL.revokeObjectURL(url); } catch {} };
    }, [data?.replayBlobUrl]);

    const replayDownloadName = `sheepdogsim-${mode}-${Date.now()}.webm`;

    // Format time helper
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Determine content based on mode
    const getContent = (): CompletionContent => {
        if (mode === 'counting') {
            // Cycle 59 (Counting Sheep): the run is player-banked, so this is
            // never a fail screen - it celebrates the counted total and the
            // round reached. counted is the submitted score.
            const counted = data.counted || 0;
            return {
                title: t('completion.counting.title'),
                subtitle: t('completion.counting.subtitle', { count: counted }),
                icon: <Icon name="sheep" size={64} color={TROPHY_GOLD} />,
                accentColor: VICTORY_ACCENT,
                bgGradient: VICTORY_BG,
                showConfetti: true,
                stats: [
                    { label: t('completion.counting.counted'), value: String(counted), icon: <Icon name="sheep" size={20} color={pastoral.cream} /> },
                    { label: t('completion.counting.round'), value: String(data.round || 0), icon: <StarGlyph size={20} color={pastoral.cream} filled /> }
                ]
            };
        }

        if (mode === 'single') {
            return {
                title: t('completion.victory'),
                subtitle: t('completion.allSheepHerded', { count: data.totalSheep || 20 }),
                icon: <Icon name="trophy" size={64} color={TROPHY_GOLD} />,
                accentColor: VICTORY_ACCENT,
                bgGradient: VICTORY_BG,
                showConfetti: true,
                stats: [
                    { label: t('completion.stats.time'), value: formatTime(data.finalTime || 0), icon: <Icon name="timer" size={20} color={pastoral.cream} /> }
                ]
            };
        }

        if (mode === 'racing') {
            const isWinner = data.isWinner === true;
            return {
                title: isWinner ? t('completion.victory') : t('completion.raceComplete'),
                subtitle: isWinner ? t('completion.youWon') : t('completion.playerWon', { name: data.winnerName || 'Another player' }),
                icon: isWinner ? <Icon name="trophy" size={64} color={TROPHY_GOLD} /> : <MedalGlyph size={64} color="#C0C0C0" />,
                accentColor: isWinner ? VICTORY_ACCENT : RUNNERUP_ACCENT,
                bgGradient: isWinner ? VICTORY_BG : RUNNERUP_BG,
                showConfetti: isWinner,
                stats: [
                    { label: t('completion.stats.yourScore'), value: t('completion.sheepUnit', { count: data.myScore || 0 }), icon: <StarGlyph size={20} color={pastoral.cream} filled /> },
                    { label: t('completion.stats.raceTime'), value: formatTime(data.finalTime || 0), icon: <Icon name="timer" size={20} color={pastoral.cream} /> }
                ],
                scores: data.scores || []
            };
        }

        if (mode === 'timed') {
            const isWinner = data.isWinner === true;
            return {
                title: isWinner ? t('completion.timesUpVictory') : t('completion.timesUp'),
                subtitle: isWinner ? t('completion.youCollectedMost') : t('completion.playerCollectedMost', { name: data.winnerName || 'Another player' }),
                icon: <Icon name="timer" size={64} color={isWinner ? TROPHY_GOLD : '#C0C0C0'} />,
                accentColor: isWinner ? VICTORY_ACCENT : RUNNERUP_ACCENT,
                bgGradient: isWinner ? VICTORY_BG : RUNNERUP_BG,
                showConfetti: isWinner,
                showNewBest: data.isNewBest,
                stats: [
                    { label: t('completion.stats.yourScore'), value: t('completion.sheepUnit', { count: data.myScore || 0 }), icon: <StarGlyph size={20} color={pastoral.cream} filled /> },
                    { label: t('completion.stats.duration'), value: '3:00', icon: <Icon name="timer" size={20} color={pastoral.cream} /> }
                ],
                scores: data.scores || []
            };
        }

        if (mode === 'cooperative') {
            return {
                title: t('completion.teamVictory'),
                subtitle: t('completion.teamMessage'),
                icon: <Icon name="users" size={64} color={pastoral.accentMeadow} />,
                accentColor: VICTORY_ACCENT,
                bgGradient: VICTORY_BG,
                showConfetti: true,
                stats: [
                    { label: t('completion.stats.sheepCollected'), value: `${data.sheepCount || 200}/${data.totalSheep || 200}`, icon: <StarGlyph size={20} color={pastoral.cream} filled /> },
                    { label: t('completion.stats.teamTime'), value: formatTime(data.finalTime || 0), icon: <Icon name="timer" size={20} color={pastoral.cream} /> }
                ]
            };
        }

        // Fallback
        return {
            title: t('completion.gameComplete'),
            subtitle: t('completion.wellPlayed'),
            icon: <Icon name="trophy" size={64} color={TROPHY_GOLD} />,
            accentColor: VICTORY_ACCENT,
            bgGradient: VICTORY_BG,
            showConfetti: false,
            stats: []
        };
    };

    const content = getContent();

    // Cycle 60 P4: controller + keyboard navigation over the completion buttons
    // (Play Again, Main Menu). Additive; existing mouse/touch onClick preserved.
    const navRef = useRef<HTMLDivElement>(null);
    useMenuNavigation(navRef, { enabled: isVisible, onBack: onMainMenu });

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.85)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 99999,
                opacity: isVisible ? 1 : 0,
                transition: 'opacity 0.5s ease-out',
                padding: '20px'
            }}
        >
            {/* Confetti */}
            {content.showConfetti && <Confetti />}

            {/* Main panel */}
            <div
                ref={navRef}
                style={{
                    background: content.bgGradient,
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    borderRadius: '24px',
                    border: `1px solid ${pastoral.glassWarmBorder}`,
                    boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px ${alpha(content.accentColor, 13)}`,
                    padding: '40px',
                    maxWidth: '480px',
                    width: '100%',
                    textAlign: 'center',
                    transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(20px)',
                    transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    position: 'relative',
                    overflow: 'hidden'
                }}
            >
                {/* Icon with glow */}
                <div
                    style={{
                        marginBottom: '20px',
                        animation: 'bounceIn 0.6s ease-out 0.2s both',
                        // Warm sunlit halo (gold) so the trophy isn't ringed by
                        // the green meadow accent.
                        filter: `drop-shadow(0 0 18px ${alpha(pastoral.accentGold, 55)})`
                    }}
                >
                    {content.icon}
                </div>

                {/* Title */}
                <h1
                    style={{
                        fontSize: '36px',
                        fontWeight: '700',
                        color: pastoral.cream,
                        margin: '0 0 8px 0',
                        animation: 'slideUp 0.5s ease-out 0.3s both'
                    }}
                >
                    {content.title}
                </h1>

                {/* Subtitle */}
                <p
                    style={{
                        fontSize: '16px',
                        color: alpha(pastoral.cream, 65),
                        margin: '0 0 24px 0',
                        animation: 'slideUp 0.5s ease-out 0.4s both'
                    }}
                >
                    {content.subtitle}
                </p>

                {/* New best indicator */}
                {content.showNewBest && (
                    <div
                        style={{
                            background: `linear-gradient(135deg, ${pastoral.accentGold}, ${pastoral.pastureGold})`,
                            color: pastoral.ink,
                            padding: '8px 16px',
                            borderRadius: '20px',
                            fontSize: '14px',
                            fontWeight: '600',
                            display: 'inline-block',
                            marginBottom: '20px',
                            animation: 'pulse 2s ease-in-out infinite'
                        }}
                    >
                        <StarGlyph size={16} color={pastoral.ink} filled />
                        {` ${t('completion.newPersonalBest')}`}
                    </div>
                )}

                {/* Stats */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '24px',
                        marginBottom: (content.scores?.length ?? 0) > 0 ? '24px' : '32px',
                        animation: 'slideUp 0.5s ease-out 0.5s both'
                    }}
                >
                    {content.stats.map((stat, i) => (
                        <div
                            key={i}
                            style={{
                                background: alpha(pastoral.cream, 8),
                                borderRadius: '12px',
                                padding: '16px 24px',
                                border: `1px solid ${alpha(pastoral.cream, 10)}`
                            }}
                        >
                            <div
                                style={{
                                    marginBottom: '8px',
                                    display: 'flex',
                                    justifyContent: 'center'
                                }}
                            >
                                {stat.icon}
                            </div>
                            <div
                                style={{
                                    fontSize: '24px',
                                    fontWeight: '700',
                                    color: pastoral.cream
                                }}
                            >
                                {stat.value}
                            </div>
                            <div
                                style={{
                                    fontSize: '12px',
                                    color: alpha(pastoral.cream, 50),
                                    marginTop: '4px'
                                }}
                            >
                                {stat.label}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Scores list (for multiplayer) */}
                {(content.scores?.length ?? 0) > 0 && (
                    <div
                        style={{
                            marginBottom: '24px',
                            animation: 'slideUp 0.5s ease-out 0.6s both'
                        }}
                    >
                        <div
                            style={{
                                fontSize: '14px',
                                color: alpha(pastoral.cream, 50),
                                marginBottom: '12px',
                                textAlign: 'left'
                            }}
                        >
                            {t('completion.finalStandings')}
                        </div>
                        {content.scores!.map((score, i) => (
                            <ScoreRow
                                key={i}
                                rank={i + 1}
                                playerName={score.name || `${t('common.player')} ${score.id}`}
                                score={score.score}
                                isMe={score.isMe}
                                isWinner={i === 0}
                                t={t}
                            />
                        ))}
                    </div>
                )}

                {/* Cycle 57 P6: leaderboard submit status (single-player only). */}
                {submitStatus && (
                    <div
                        style={{
                            textAlign: 'center',
                            marginBottom: '12px',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: submitStatus.ok ? content.accentColor : alpha(pastoral.cream, 60),
                            animation: 'slideUp 0.5s ease-out 0.6s both'
                        }}
                    >
                        {submitStatus.ok ? t('completion.scoreSaved') : t('completion.scoreSaveFailed')}
                    </div>
                )}

                {/* Cycle 58 P8: post-score naming offer. Only when the run saved
                    and the player is still auto-named. Non-blocking; collapses to
                    a confirmation once they set a name. */}
                {submitStatus?.ok && isAutoNamed && !nameSaved && (
                    <div
                        style={{
                            maxWidth: '360px',
                            margin: '0 auto 12px',
                            animation: 'slideUp 0.5s ease-out 0.65s both',
                        }}
                    >
                        <div style={{ textAlign: 'center', fontSize: '13px', color: alpha(pastoral.cream, 72), marginBottom: '2px' }}>
                            {t('identity.customNameDesc')}
                        </div>
                        <NameField onSaved={() => setNameSaved(true)} style={{ marginTop: '8px' }} />
                    </div>
                )}
                {nameSaved && (
                    <div
                        style={{
                            textAlign: 'center',
                            marginBottom: '12px',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: content.accentColor,
                        }}
                    >
                        {t('identity.nameUpdated')}
                    </div>
                )}

                {/* Buttons */}
                <div
                    style={{
                        display: 'flex',
                        gap: '12px',
                        justifyContent: 'center',
                        animation: 'slideUp 0.5s ease-out 0.7s both'
                    }}
                >
                    <button
                        onClick={onPlayAgain}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '14px 28px',
                            fontSize: '16px',
                            fontWeight: '600',
                            color: pastoral.cream,
                            background: content.accentColor,
                            border: 'none',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: `0 4px 14px ${alpha(content.accentColor, 27)}`
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = `0 6px 20px ${alpha(content.accentColor, 40)}`;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = `0 4px 14px ${alpha(content.accentColor, 27)}`;
                        }}
                    >
                        <Icon name="replay" size={20} color={pastoral.cream} />
                        {t('completion.playAgain')}
                    </button>

                    {onMainMenu && (
                        <button
                            onClick={onMainMenu}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '14px 28px',
                                fontSize: '16px',
                                fontWeight: '600',
                                color: pastoral.cream,
                                background: alpha(pastoral.cream, 10),
                                border: `1px solid ${alpha(pastoral.cream, 20)}`,
                                borderRadius: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = alpha(pastoral.cream, 15);
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = alpha(pastoral.cream, 10);
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            <Icon name="home" size={20} color={pastoral.cream} />
                            {t('pause.mainMenu')}
                        </button>
                    )}

                    {/* Explicit local developer capture only. */}
                    {data?.replayBlobUrl && (
                        <a
                            href={data.replayBlobUrl}
                            download={replayDownloadName}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '14px 28px',
                                fontSize: '16px',
                                fontWeight: '600',
                                color: pastoral.cream,
                                background: alpha(pastoral.cream, 10),
                                border: `1px solid ${alpha(pastoral.cream, 20)}`,
                                borderRadius: '12px',
                                textDecoration: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = alpha(pastoral.cream, 15);
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = alpha(pastoral.cream, 10);
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            {t('completion.saveClip', 'Save dev clip')}
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}

// CSS animations (injected once)
if (typeof document !== 'undefined' && !document.getElementById('completion-screen-styles')) {
    const style = document.createElement('style');
    style.id = 'completion-screen-styles';
    style.textContent = `
        @keyframes confettiFall {
            0% {
                transform: translateY(-20px) rotate(0deg);
                opacity: 1;
            }
            100% {
                transform: translateY(100vh) rotate(720deg);
                opacity: 0;
            }
        }

        @keyframes bounceIn {
            0% {
                transform: scale(0);
                opacity: 0;
            }
            50% {
                transform: scale(1.1);
            }
            100% {
                transform: scale(1);
                opacity: 1;
            }
        }

        @keyframes pulse {
            0%, 100% {
                transform: scale(1);
            }
            50% {
                transform: scale(1.05);
            }
        }
    `;
    document.head.appendChild(style);
}
