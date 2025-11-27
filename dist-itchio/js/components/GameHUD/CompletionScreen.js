/**
 * CompletionScreen Component
 * Polished victory/completion overlay for all game modes
 */
const { createElement, useState, useEffect } = window.React;

// Lucide-style SVG Icons
const Icons = {
    trophy: (size = 48, color = 'currentColor') => createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color,
        strokeWidth: '2',
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
    }, [
        createElement('path', { key: 'cup', d: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6' }),
        createElement('path', { key: 'cup2', d: 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18' }),
        createElement('path', { key: 'base', d: 'M4 22h16' }),
        createElement('path', { key: 'stem1', d: 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22' }),
        createElement('path', { key: 'stem2', d: 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22' }),
        createElement('path', { key: 'bowl', d: 'M18 2H6v7a6 6 0 0 0 12 0V2Z' })
    ]),

    medal: (size = 24, color = 'currentColor') => createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color,
        strokeWidth: '2',
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
    }, [
        createElement('path', { key: 'ribbon1', d: 'M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15' }),
        createElement('path', { key: 'ribbon2', d: 'M11 12 5.12 2.2' }),
        createElement('path', { key: 'ribbon3', d: 'm13 12 5.88-9.8' }),
        createElement('path', { key: 'circle', d: 'M8 14h8' }),
        createElement('circle', { key: 'medal', cx: '12', cy: '17', r: '5' })
    ]),

    clock: (size = 24, color = 'currentColor') => createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color,
        strokeWidth: '2',
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
    }, [
        createElement('circle', { key: 'face', cx: '12', cy: '12', r: '10' }),
        createElement('polyline', { key: 'hands', points: '12 6 12 12 16 14' })
    ]),

    users: (size = 24, color = 'currentColor') => createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color,
        strokeWidth: '2',
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
    }, [
        createElement('path', { key: 'p1', d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }),
        createElement('circle', { key: 'c1', cx: '9', cy: '7', r: '4' }),
        createElement('path', { key: 'p2', d: 'M22 21v-2a4 4 0 0 0-3-3.87' }),
        createElement('path', { key: 'p3', d: 'M16 3.13a4 4 0 0 1 0 7.75' })
    ]),

    star: (size = 24, color = 'currentColor', filled = false) => createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: filled ? color : 'none',
        stroke: color,
        strokeWidth: '2',
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
    }, [
        createElement('polygon', { key: 'star', points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' })
    ]),

    refresh: (size = 24, color = 'currentColor') => createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color,
        strokeWidth: '2',
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
    }, [
        createElement('path', { key: 'p1', d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }),
        createElement('path', { key: 'p2', d: 'M21 3v5h-5' }),
        createElement('path', { key: 'p3', d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }),
        createElement('path', { key: 'p4', d: 'M8 16H3v5' })
    ]),

    home: (size = 24, color = 'currentColor') => createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color,
        strokeWidth: '2',
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
    }, [
        createElement('path', { key: 'roof', d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }),
        createElement('polyline', { key: 'door', points: '9 22 9 12 15 12 15 22' })
    ])
};

// Medal colors for rankings
const MEDAL_COLORS = {
    1: { bg: 'linear-gradient(135deg, #FFD700, #FFA500)', text: '#000', glow: 'rgba(255, 215, 0, 0.4)' },
    2: { bg: 'linear-gradient(135deg, #E8E8E8, #B8B8B8)', text: '#000', glow: 'rgba(192, 192, 192, 0.4)' },
    3: { bg: 'linear-gradient(135deg, #CD7F32, #8B4513)', text: '#fff', glow: 'rgba(205, 127, 50, 0.4)' }
};

// Animated counter component
function AnimatedNumber({ value, duration = 1000 }) {
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

    return createElement('span', null, displayValue);
}

// Confetti particle
function Confetti() {
    const [particles, setParticles] = useState([]);

    useEffect(() => {
        const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
        const newParticles = [];

        for (let i = 0; i < 50; i++) {
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

    return createElement('div', {
        style: {
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            pointerEvents: 'none'
        }
    }, particles.map(p =>
        createElement('div', {
            key: p.id,
            style: {
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
            }
        })
    ));
}

// Rank badge component
function RankBadge({ rank, size = 'normal' }) {
    const isTopThree = rank <= 3;
    const medal = MEDAL_COLORS[rank];
    const sizeClass = size === 'large' ? { width: '48px', height: '48px', fontSize: '20px' }
                    : { width: '32px', height: '32px', fontSize: '14px' };

    return createElement('div', {
        style: {
            ...sizeClass,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            background: isTopThree ? medal.bg : 'rgba(255, 255, 255, 0.1)',
            color: isTopThree ? medal.text : '#fff',
            border: isTopThree ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: isTopThree ? `0 4px 12px ${medal.glow}` : 'none'
        }
    }, rank);
}

// Score row component
function ScoreRow({ rank, playerName, score, isMe, isWinner }) {
    return createElement('div', {
        style: {
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            background: isMe ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
            borderRadius: '12px',
            border: isMe ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
            marginBottom: '8px',
            animation: `slideInRight 0.5s ease-out ${rank * 0.1}s both`
        }
    }, [
        createElement(RankBadge, { key: 'rank', rank }),
        createElement('div', { key: 'info', style: { flex: 1 } }, [
            createElement('div', {
                key: 'name',
                style: {
                    color: '#fff',
                    fontWeight: isMe ? '600' : '400',
                    fontSize: '14px'
                }
            }, playerName + (isMe ? ' (You)' : '')),
        ]),
        createElement('div', {
            key: 'score',
            style: {
                color: isWinner ? '#FFD700' : '#fff',
                fontWeight: '600',
                fontSize: '16px'
            }
        }, `${score} sheep`)
    ]);
}

// Main completion screen component
export function CompletionScreen({ mode, data, onPlayAgain, onMainMenu }) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Trigger entrance animation
        setTimeout(() => setIsVisible(true), 50);
    }, []);

    // Format time helper
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Determine content based on mode
    const getContent = () => {
        if (mode === 'single') {
            return {
                title: 'Victory!',
                subtitle: `All ${data.totalSheep || 20} sheep herded successfully!`,
                icon: Icons.trophy(64, '#FFD700'),
                accentColor: '#10b981',
                bgGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.1))',
                showConfetti: true,
                stats: [
                    { label: 'Time', value: formatTime(data.finalTime || 0), icon: Icons.clock(20, '#fff') }
                ]
            };
        }

        if (mode === 'racing') {
            const isWinner = data.isWinner;
            return {
                title: isWinner ? 'Victory!' : 'Race Complete',
                subtitle: isWinner ? 'You won the race!' : `${data.winnerName || 'Another player'} won!`,
                icon: isWinner ? Icons.trophy(64, '#FFD700') : Icons.medal(64, '#C0C0C0'),
                accentColor: isWinner ? '#10b981' : '#f59e0b',
                bgGradient: isWinner
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.1))'
                    : 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.1))',
                showConfetti: isWinner,
                stats: [
                    { label: 'Your Score', value: `${data.myScore || 0} sheep`, icon: Icons.star(20, '#fff', true) },
                    { label: 'Race Time', value: formatTime(data.finalTime || 0), icon: Icons.clock(20, '#fff') }
                ],
                scores: data.scores || []
            };
        }

        if (mode === 'timed') {
            const isWinner = data.isWinner;
            return {
                title: isWinner ? "Time's Up - Victory!" : "Time's Up",
                subtitle: isWinner ? 'You collected the most sheep!' : `${data.winnerName || 'Another player'} collected the most!`,
                icon: Icons.clock(64, isWinner ? '#FFD700' : '#C0C0C0'),
                accentColor: isWinner ? '#10b981' : '#f59e0b',
                bgGradient: isWinner
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.1))'
                    : 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.1))',
                showConfetti: isWinner,
                showNewBest: data.isNewBest,
                stats: [
                    { label: 'Your Score', value: `${data.myScore || 0} sheep`, icon: Icons.star(20, '#fff', true) },
                    { label: 'Duration', value: '3:00', icon: Icons.clock(20, '#fff') }
                ],
                scores: data.scores || []
            };
        }

        if (mode === 'cooperative') {
            return {
                title: 'Team Victory!',
                subtitle: 'Working together, you herded all the sheep!',
                icon: Icons.users(64, '#3b82f6'),
                accentColor: '#3b82f6',
                bgGradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.1))',
                showConfetti: true,
                stats: [
                    { label: 'Sheep Collected', value: `${data.sheepCount || 200}/${data.totalSheep || 200}`, icon: Icons.star(20, '#fff', true) },
                    { label: 'Team Time', value: formatTime(data.finalTime || 0), icon: Icons.clock(20, '#fff') }
                ]
            };
        }

        // Fallback
        return {
            title: 'Game Complete',
            subtitle: 'Well played!',
            icon: Icons.trophy(64, '#FFD700'),
            accentColor: '#10b981',
            bgGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.1))',
            showConfetti: false,
            stats: []
        };
    };

    const content = getContent();

    return createElement('div', {
        style: {
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
        }
    }, [
        // Confetti
        content.showConfetti && createElement(Confetti, { key: 'confetti' }),

        // Main panel
        createElement('div', {
            key: 'panel',
            style: {
                background: content.bgGradient,
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                borderRadius: '24px',
                border: `1px solid rgba(255, 255, 255, 0.15)`,
                boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px ${content.accentColor}22`,
                padding: '40px',
                maxWidth: '480px',
                width: '100%',
                textAlign: 'center',
                transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(20px)',
                transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                position: 'relative',
                overflow: 'hidden'
            }
        }, [
            // Icon with glow
            createElement('div', {
                key: 'icon',
                style: {
                    marginBottom: '20px',
                    animation: 'bounceIn 0.6s ease-out 0.2s both',
                    filter: `drop-shadow(0 0 20px ${content.accentColor})`
                }
            }, content.icon),

            // Title
            createElement('h1', {
                key: 'title',
                style: {
                    fontSize: '36px',
                    fontWeight: '700',
                    color: '#fff',
                    margin: '0 0 8px 0',
                    animation: 'slideUp 0.5s ease-out 0.3s both'
                }
            }, content.title),

            // Subtitle
            createElement('p', {
                key: 'subtitle',
                style: {
                    fontSize: '16px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    margin: '0 0 24px 0',
                    animation: 'slideUp 0.5s ease-out 0.4s both'
                }
            }, content.subtitle),

            // New best indicator
            content.showNewBest && createElement('div', {
                key: 'newBest',
                style: {
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    color: '#000',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    fontSize: '14px',
                    fontWeight: '600',
                    display: 'inline-block',
                    marginBottom: '20px',
                    animation: 'pulse 2s ease-in-out infinite'
                }
            }, [
                Icons.star(16, '#000', true),
                ' NEW PERSONAL BEST!'
            ]),

            // Stats
            createElement('div', {
                key: 'stats',
                style: {
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '24px',
                    marginBottom: content.scores?.length > 0 ? '24px' : '32px',
                    animation: 'slideUp 0.5s ease-out 0.5s both'
                }
            }, content.stats.map((stat, i) =>
                createElement('div', {
                    key: i,
                    style: {
                        background: 'rgba(255, 255, 255, 0.08)',
                        borderRadius: '12px',
                        padding: '16px 24px',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                    }
                }, [
                    createElement('div', {
                        key: 'icon',
                        style: {
                            marginBottom: '8px',
                            display: 'flex',
                            justifyContent: 'center'
                        }
                    }, stat.icon),
                    createElement('div', {
                        key: 'value',
                        style: {
                            fontSize: '24px',
                            fontWeight: '700',
                            color: '#fff'
                        }
                    }, stat.value),
                    createElement('div', {
                        key: 'label',
                        style: {
                            fontSize: '12px',
                            color: 'rgba(255, 255, 255, 0.5)',
                            marginTop: '4px'
                        }
                    }, stat.label)
                ])
            )),

            // Scores list (for multiplayer)
            content.scores?.length > 0 && createElement('div', {
                key: 'scores',
                style: {
                    marginBottom: '24px',
                    animation: 'slideUp 0.5s ease-out 0.6s both'
                }
            }, [
                createElement('div', {
                    key: 'scoresTitle',
                    style: {
                        fontSize: '14px',
                        color: 'rgba(255, 255, 255, 0.5)',
                        marginBottom: '12px',
                        textAlign: 'left'
                    }
                }, 'Final Standings'),
                ...content.scores.map((score, i) =>
                    createElement(ScoreRow, {
                        key: i,
                        rank: i + 1,
                        playerName: score.name || `Player ${score.id}`,
                        score: score.score,
                        isMe: score.isMe,
                        isWinner: i === 0
                    })
                )
            ]),

            // Buttons
            createElement('div', {
                key: 'buttons',
                style: {
                    display: 'flex',
                    gap: '12px',
                    justifyContent: 'center',
                    animation: 'slideUp 0.5s ease-out 0.7s both'
                }
            }, [
                createElement('button', {
                    key: 'playAgain',
                    onClick: onPlayAgain,
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '14px 28px',
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#fff',
                        background: content.accentColor,
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        boxShadow: `0 4px 14px ${content.accentColor}44`
                    },
                    onMouseEnter: (e) => {
                        e.target.style.transform = 'translateY(-2px)';
                        e.target.style.boxShadow = `0 6px 20px ${content.accentColor}66`;
                    },
                    onMouseLeave: (e) => {
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = `0 4px 14px ${content.accentColor}44`;
                    }
                }, [
                    Icons.refresh(20, '#fff'),
                    'Play Again'
                ]),

                onMainMenu && createElement('button', {
                    key: 'mainMenu',
                    onClick: onMainMenu,
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '14px 28px',
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#fff',
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease'
                    },
                    onMouseEnter: (e) => {
                        e.target.style.background = 'rgba(255, 255, 255, 0.15)';
                        e.target.style.transform = 'translateY(-2px)';
                    },
                    onMouseLeave: (e) => {
                        e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                        e.target.style.transform = 'translateY(0)';
                    }
                }, [
                    Icons.home(20, '#fff'),
                    'Main Menu'
                ])
            ])
        ])
    ]);
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
