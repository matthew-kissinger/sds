// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * GlobalLeaderboard - scene-first global rankings.
 *
 * Cycle 35 Phase 5 restructure: scene picker comes first, then the mode
 * tabs show solo modes for every scene plus the selected scene's allowed
 * multiplayer modes. The cross-scene "any" view is gone — Field's
 * 56-second soloClassic record and Sheep Dog Island's 600-second run are
 * different games with different time distributions.
 *
 * Scene selection persists in localStorage ('sds:leaderboardLastScene'),
 * defaulting to the URL ?scene= param or 'field'. Unknown stored scenes
 * fall back to 'field' so a stale value can't render an empty board.
 *
 * Cycle 48 P3: converted from the element-factory .js to token-driven .tsx.
 * Per the plan, the gold/silver/bronze rank circles now read the Cycle 47 rank
 * tokens (rankGold/rankSilver/rankBronze) instead of the prior yellow-500 /
 * gray-300 / amber-600 fills — a deliberate harmonization, the one intended
 * visible change in this leaf (flag for prod review). The blue-300 player
 * highlight + clear-filter affordance read the new infoSoft token; the native
 * <option> backing reads the new surfaceSelect token; the error text reads
 * danger-soft. The translucent row/badge rgba() triples stay raw literals. The
 * network/leaderboard data path is unchanged. Otherwise identical to the
 * previous GlobalLeaderboard.js.
 */
import { useState, useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getNetworkManager } from '../../GameBridge.js';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { Button } from '../ui/Button.js';
import { listScenes, getSceneById } from '../../../shared/scenes/index.js';
import { getSoloLadder, getRankedCounts, getLadderEntry } from '../../../shared/difficulty.js';
import {
    COUNTING_LEADERBOARD_MODES,
    isCountingLeaderboardMode,
    sceneOffersCounting,
} from '../../../shared/countingModes.js';
import {
    SURVIVAL_LEADERBOARD_MODE,
    isSurvivalLeaderboardMode,
    sceneOffersSurvival,
    SURVIVAL_COOP_PARTY_SIZES,
} from '../../../shared/survivalModes.js';
import { color } from '../ui/tokens';

// Public leaderboard scenes. Newsheepdogland stays a tech sandbox until its
// survival loop is ready for public surfacing.
const SCENE_ORDER = ['field', 'rolling-hills', 'open-country'];
const SCENE_ORDER_SET = new Set(SCENE_ORDER);
const LAST_SCENE_KEY = 'sds:leaderboardLastScene';
const FALLBACK_SCENE = 'field';

// Cycle 58: solo leaderboard identity is (scene, count). The solo tabs for a
// scene are its ranked ladder counts, keyed `solo:<count>` to match the
// getAllLeaderboards response. Multiplayer tabs still come from
// scene.allowedModes so Open Country does not expose competitive.
const SOLO_TAB_PREFIX = 'solo:';

/** Build the solo count tab key the worker response is keyed on. */
const soloTabKey = (count: number): string => `${SOLO_TAB_PREFIX}${count}`;

/** A solo count tab's display label: tier name + count (e.g. "Classic 200"). */
function soloTabLabel(sceneId: string, count: number): string {
    const scene = getSceneById(sceneId);
    const entry = scene
        ? getSoloLadder(scene).find((e) => e.ranked && e.count === count)
        : undefined;
    const name = entry?.label;
    const num = count.toLocaleString('en-US');
    return name ? `${name} ${num}` : `${num}`;
}

// Sheep-count filter is meaningful only on cooperative + competitive (the
// MP modes that vary by sheep count). Solo + timed have a fixed count per
// board. Cycle 35 Phase 4 preserves this dropdown for MP boards.
const SHEEP_FILTER_OPTIONS = [
    { value: 0, label: 'Any size' },
    { value: 200, label: '200 sheep, Classic' },
    { value: 250, label: '250 sheep' },
    { value: 500, label: '500 sheep' },
    { value: 1000, label: '1000 sheep, Extreme' },
    { value: 3000, label: '3000 sheep, Insane' },
    { value: 5000, label: '5000 sheep, Chaos' },
];

/**
 * Solo count tabs, 'timed', and the counting boards are fixed-count: the sheep
 * dropdown is hidden. Counting ignores sheep_count entirely (the count is the
 * score), so a dropdown would be meaningless there.
 */
const isFixedCountTabKey = (tab: string): boolean =>
    tab.startsWith(SOLO_TAB_PREFIX) || tab === 'timed'
    || isCountingLeaderboardMode(tab) || isSurvivalLeaderboardMode(tab);

interface LeaderEntry {
    rank: number;
    fullName?: string;
    displayName?: string;
    formattedScore?: string;
}

interface PlayerIdentity {
    fullName?: string;
}

interface GlobalLeaderboardProps {
    onBack: () => void;
    playerIdentity?: PlayerIdentity;
}

/**
 * The ordered tab keys for a scene: its ranked solo count tabs (`solo:<count>`)
 * followed by the scene's multiplayer modes. Unknown scene -> []. Cycle 58: the
 * solo tabs are the scene's ranked ladder, not the four fixed difficulty slugs.
 */
export function leaderboardModesForScene(sceneId: string): string[] {
    const scene = getSceneById(sceneId);
    if (!scene) return [];
    const solo = getRankedCounts(scene).map(soloTabKey);
    // Cycle 59 (Counting Sheep): scenes that offer counting (Home Field, Rolling
    // Hills) get one board per curve, after the solo rungs and before the MP
    // modes. Open Country offers no counting, so it shows none.
    const counting = sceneOffersCounting(sceneId) ? [...COUNTING_LEADERBOARD_MODES] : [];
    const mp = Array.isArray(scene.allowedModes) ? scene.allowedModes : [];
    // Cycle 66: a survival scene (Newsheepdogland) leads with its survival board -
    // it is THE mode there - then the solo rungs / MP boards follow.
    if (sceneOffersSurvival(sceneId)) {
        // Cycle 67 P7: the solo survival board leads, then one co-op board per
        // party size (2-4 dogs), then the solo rungs / MP boards.
        const coop = SURVIVAL_COOP_PARTY_SIZES.map((n) => `${SURVIVAL_LEADERBOARD_MODE}:${n}`);
        return [SURVIVAL_LEADERBOARD_MODE, ...coop, ...solo, ...counting, ...mp];
    }
    return [...solo, ...counting, ...mp];
}

/**
 * The tab to land on for a scene: prefer its 'classic' ranked rung (the
 * signature run), else the first solo tab, else the first available tab.
 */
function defaultTabForScene(sceneId: string): string {
    const scene = getSceneById(sceneId);
    const tabs = leaderboardModesForScene(sceneId);
    // Cycle 66: survival scenes land on the survival board by default.
    if (sceneOffersSurvival(sceneId) && tabs.includes(SURVIVAL_LEADERBOARD_MODE)) {
        return SURVIVAL_LEADERBOARD_MODE;
    }
    if (scene) {
        const beginner = getRankedCounts(scene)[0];
        if (beginner) {
            const key = soloTabKey(beginner);
            if (tabs.includes(key)) return key;
        }
        const classic = getLadderEntry(scene, 'classic');
        if (classic && classic.ranked) {
            const key = soloTabKey(classic.count);
            if (tabs.includes(key)) return key;
        }
    }
    return tabs[0] || 'cooperative';
}

function isPublicLeaderboardScene(sceneId: string): boolean {
    return SCENE_ORDER_SET.has(sceneId) && !!getSceneById(sceneId);
}

function initialSceneId(): string {
    if (typeof window === 'undefined') return FALLBACK_SCENE;
    try {
        const fromUrl = new URLSearchParams(window.location.search).get('scene');
        if (fromUrl && isPublicLeaderboardScene(fromUrl)) return fromUrl;
    } catch {}
    try {
        const stored = localStorage.getItem(LAST_SCENE_KEY);
        if (stored && isPublicLeaderboardScene(stored)) return stored;
    } catch {}
    return FALLBACK_SCENE;
}

export function GlobalLeaderboard({ onBack, playerIdentity }: GlobalLeaderboardProps) {
    const { t } = useTranslation();
    const [sceneId, setSceneId] = useState(initialSceneId);
    const [leaderboards, setLeaderboards] = useState<Record<string, LeaderEntry[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [sheepFilter, setSheepFilter] = useState(0);
    const { isCompact, isMobile } = useResponsive();

    const sceneOptions = useMemo(() => {
        const all = listScenes();
        return SCENE_ORDER.map((id) => all.find((s: { id: string }) => s.id === id)).filter(Boolean);
    }, []);

    const visibleModes = useMemo(() => leaderboardModesForScene(sceneId), [sceneId]);
    const beginnerTab = useMemo(() => defaultTabForScene(sceneId), [sceneId]);
    const displayModes = useMemo(() => {
        const out: string[] = [];
        const add = (mode: string) => {
            if (mode && visibleModes.includes(mode) && !out.includes(mode)) out.push(mode);
        };
        add(beginnerTab);
        visibleModes
            .filter((mode) => (leaderboards[mode]?.length ?? 0) > 0)
            .forEach(add);
        visibleModes.forEach(add);
        return out;
    }, [beginnerTab, leaderboards, visibleModes]);
    const scoredBoardCount = useMemo(
        () => visibleModes.filter((mode) => (leaderboards[mode]?.length ?? 0) > 0).length,
        [leaderboards, visibleModes]
    );

    // Cycle 58: default tab is the scene's signature solo run (its 'classic'
    // rung), so the leaderboard opens on a meaningful board rather than an MP
    // mode that may be empty.
    const sceneDefaultTab = useMemo(() => defaultTabForScene(sceneId), [sceneId]);

    const [activeTab, setActiveTab] = useState(() => defaultTabForScene(initialSceneId()));

    // When the visible tab list changes (scene swap), snap activeTab to a valid
    // choice: the scene's default solo tab, else the first visible tab.
    useEffect(() => {
        if (!visibleModes.includes(activeTab)) {
            setActiveTab(visibleModes.includes(sceneDefaultTab) ? sceneDefaultTab : visibleModes[0]);
        }
    }, [visibleModes, activeTab, sceneDefaultTab]);

    // Persist scene selection across sessions.
    useEffect(() => {
        try {
            localStorage.setItem(LAST_SCENE_KEY, sceneId);
        } catch {}
    }, [sceneId]);

    const loadLeaderboards = async () => {
        setLoading(true);
        setError('');
        try {
            const nm = getNetworkManager();
            if (!nm) throw new Error('Network manager not available');
            if (!nm.isConnected()) {
                console.log('[LEADERBOARD] Connecting to server...');
                await nm.connect();
            }
            const data = await nm.getAllLeaderboards(10, {
                sceneId,
                sheepCount: sheepFilter,
            });
            setLeaderboards(data);
            setLastRefresh(new Date());
        } catch (err) {
            console.error('[LEADERBOARD] Failed to load:', err);
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('Failed to fetch') || message.includes('ERR_CONNECTION_REFUSED')) {
                setError('serverOffline');
            } else {
                setError('loadFailed');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLeaderboards();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sceneId, sheepFilter]);

    const isFixedCountTab = isFixedCountTabKey(activeTab);
    const hasActiveSheepFilter = !isFixedCountTab && sheepFilter > 0;
    const beginnerLabel = beginnerTab.startsWith(SOLO_TAB_PREFIX)
        ? soloTabLabel(sceneId, Number(beginnerTab.slice(SOLO_TAB_PREFIX.length)))
        : t(labelKeyForMode(beginnerTab));

    const renderLeaderboardTable = (gameMode: string): ReactNode => {
        const data = leaderboards[gameMode] || [];
        if (data.length === 0) {
            return (
                <div
                    style={{
                        textAlign: 'center',
                        padding: '2rem',
                        color: 'rgba(255, 255, 255, 0.6)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.75rem',
                    }}
                >
                    <span>{t('leaderboard.noScores')}</span>
                    {hasActiveSheepFilter && (
                        <button
                            onClick={() => setSheepFilter(0)}
                            style={{
                                background: 'rgba(96, 165, 250, 0.15)',
                                border: '1px solid rgba(96, 165, 250, 0.4)',
                                color: color.infoSoft,
                                borderRadius: '0.375rem',
                                padding: '0.4rem 0.85rem',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                            }}
                        >
                            Clear sheep filter
                        </button>
                    )}
                </div>
            );
        }
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {data.map((entry, index) => {
                    const isPlayer = Boolean(
                        playerIdentity && entry.fullName === playerIdentity.fullName
                    );
                    const getRankStyle = (rank: number): CSSProperties => {
                        const base: CSSProperties = {
                            width: isCompact ? '28px' : '32px',
                            height: isCompact ? '28px' : '32px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: isCompact ? '0.7rem' : '0.875rem',
                            fontWeight: 'bold',
                        };
                        if (rank === 1) return { ...base, background: color.rankGold, color: 'black' };
                        if (rank === 2) return { ...base, background: color.rankSilver, color: 'black' };
                        if (rank === 3) return { ...base, background: color.rankBronze, color: 'white' };
                        return { ...base, background: 'rgba(255, 255, 255, 0.1)', color: 'white' };
                    };
                    return (
                        <div
                            key={index}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: isCompact ? '0.5rem 0.75rem' : '0.75rem 1rem',
                                borderRadius: '0.5rem',
                                transition: 'all 0.2s',
                                background: isPlayer ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                border: isPlayer ? '1px solid rgba(96, 165, 250, 0.3)' : '1px solid transparent',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: isCompact ? '0.5rem' : '0.75rem',
                                }}
                            >
                                <div style={getRankStyle(entry.rank)}>
                                    {entry.rank <= 3
                                        ? [
                                              t('leaderboard.ranks.first'),
                                              t('leaderboard.ranks.second'),
                                              t('leaderboard.ranks.third'),
                                          ][entry.rank - 1]
                                        : entry.rank}
                                </div>
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 600,
                                            color: isPlayer ? color.infoSoft : 'white',
                                            fontSize: isCompact ? '0.8rem' : '1rem',
                                        }}
                                    >
                                        {entry.displayName + (isPlayer ? ` (${t('common.you')})` : '')}
                                    </div>
                                    {!isCompact && (
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)' }}>
                                            {entry.fullName}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div
                                style={{
                                    color: 'white',
                                    fontFamily: 'monospace',
                                    fontWeight: 'bold',
                                    fontSize: isCompact ? '0.8rem' : '1rem',
                                }}
                            >
                                {entry.formattedScore}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const tabButtonStyle = (isActive: boolean, hasScores = false, isBeginner = false): CSSProperties => ({
        padding: isCompact ? '0.5rem 0.75rem' : '0.5rem 1rem',
        borderRadius: '0.5rem',
        fontSize: isCompact ? '0.75rem' : '0.875rem',
        fontWeight: 500,
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        border: isActive
            ? '1px solid rgba(255, 255, 255, 0.3)'
            : hasScores
                ? '1px solid rgba(224, 164, 88, 0.35)'
                : '1px solid transparent',
        background: isActive
            ? 'rgba(255, 255, 255, 0.2)'
            : isBeginner
                ? 'rgba(224, 164, 88, 0.12)'
                : hasScores
                    ? 'rgba(224, 164, 88, 0.08)'
                    : 'rgba(255, 255, 255, 0.05)',
        color: isActive ? 'white' : 'rgba(255, 255, 255, 0.7)',
    });

    function labelKeyForMode(mode: string): string {
        const known: Record<string, string> = {
            soloClassic: 'leaderboard.soloClassic',
            soloExtreme: 'leaderboard.soloExtreme',
            soloInsane: 'leaderboard.soloInsane',
            soloChaos: 'leaderboard.soloChaos',
            timed: 'leaderboard.timed',
            competitive: 'leaderboard.competitive',
            cooperative: 'leaderboard.cooperative',
            // Cycle 59 (Counting Sheep): per-curve board tabs.
            'counting-incremental': 'leaderboard.countingIncremental',
            'counting-exponential': 'leaderboard.countingExponential',
            // Cycle 66: the survival board.
            survival: 'leaderboard.survival',
        };
        return known[mode] || `leaderboard.${mode}`;
    }

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                height: '100%',
                maxHeight: '100%',
                padding: isMobile ? '0.5rem' : '1rem',
            }}
        >
            <Panel
                size="lg"
                maxWidth="56rem"
                style={{
                    animation: 'slideUp 0.5s ease-out',
                    maxHeight: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* Header (fixed) */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: isMobile ? 'flex-start' : 'center',
                        justifyContent: 'space-between',
                        flexDirection: isMobile ? 'column' : 'row',
                        gap: isMobile ? '0.75rem' : '0',
                        marginBottom: isCompact ? '0.75rem' : '1rem',
                        flexShrink: 0,
                    }}
                >
                    <PanelTitle style={{ marginBottom: 0 }}>{t('leaderboard.title')}</PanelTitle>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {lastRefresh && (
                            <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                                {t('leaderboard.updated', { time: lastRefresh.toLocaleTimeString() })}
                            </span>
                        )}
                        <Button
                            variant="secondary"
                            onClick={loadLeaderboards}
                            disabled={loading}
                            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                        >
                            {loading ? '...' : t('common.refresh')}
                        </Button>
                    </div>
                </div>

                {/* Cycle 35 Phase 5: scene picker is the primary control, above
                    the mode tabs. Mode tabs show solo modes for every selected
                    scene, then filter MP modes by getSceneById(sceneId).allowedModes.
                    The cross-scene 'any' view is gone. */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: isCompact ? '0.75rem' : '1rem',
                        flexShrink: 0,
                    }}
                >
                    <span
                        style={{
                            fontSize: '0.7rem',
                            color: 'rgba(255, 255, 255, 0.55)',
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                        }}
                    >
                        Scene
                    </span>
                    <select
                        value={sceneId}
                        onChange={(e) => setSceneId(e.target.value)}
                        style={{
                            padding: '0.4rem 0.75rem',
                            borderRadius: '0.5rem',
                            background: 'rgba(255, 255, 255, 0.08)',
                            color: 'white',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                        }}
                    >
                        {sceneOptions.map((opt) => (
                            <option key={opt!.id} value={opt!.id} style={{ background: color.surfaceSelect }}>
                                {opt!.name || opt!.id}
                            </option>
                        ))}
                    </select>
                </div>

                <div
                    style={{
                        display: 'flex',
                        alignItems: isMobile ? 'flex-start' : 'center',
                        justifyContent: 'space-between',
                        flexDirection: isMobile ? 'column' : 'row',
                        gap: '0.5rem',
                        marginBottom: isCompact ? '0.75rem' : '1rem',
                        padding: isCompact ? '0.6rem 0.75rem' : '0.75rem 1rem',
                        borderRadius: '0.5rem',
                        background: 'rgba(224, 164, 88, 0.09)',
                        border: '1px solid rgba(224, 164, 88, 0.24)',
                        flexShrink: 0,
                    }}
                >
                    <div>
                        <div style={{ color: 'white', fontWeight: 650, fontSize: isCompact ? '0.82rem' : '0.92rem' }}>
                            First ranked target: {beginnerLabel}
                        </div>
                        <div style={{ color: 'rgba(255, 255, 255, 0.62)', fontSize: isCompact ? '0.72rem' : '0.78rem' }}>
                            {scoredBoardCount} active board{scoredBoardCount === 1 ? '' : 's'} in this scene.
                        </div>
                    </div>
                    <button
                        onClick={() => setActiveTab(beginnerTab)}
                        style={{
                            padding: '0.42rem 0.75rem',
                            borderRadius: '0.45rem',
                            background: activeTab === beginnerTab ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.18)',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                            fontWeight: 650,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        Open target
                    </button>
                </div>

                {/* Mode tabs (filtered by the scene's available modes). */}
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        marginBottom: isCompact ? '0.5rem' : '0.75rem',
                        overflowX: 'auto',
                        flexShrink: 0,
                    }}
                >
                    {displayModes.map((mode) => {
                        // Cycle 58: solo count tabs (`solo:<count>`) label from the
                        // scene ladder; MP tabs keep their i18n labels.
                        // Cycle 67 P7: co-op survival tabs read "Survival NP".
                        const isCoopSurvival = mode.startsWith(`${SURVIVAL_LEADERBOARD_MODE}:`);
                        const label = mode.startsWith(SOLO_TAB_PREFIX)
                            ? soloTabLabel(sceneId, Number(mode.slice(SOLO_TAB_PREFIX.length)))
                            : isCoopSurvival
                                ? `${t('leaderboard.survival')} ${mode.slice(SURVIVAL_LEADERBOARD_MODE.length + 1)}P`
                                : t(labelKeyForMode(mode));
                        const entryCount = leaderboards[mode]?.length ?? 0;
                        const hasScores = entryCount > 0;
                        const isBeginner = mode === beginnerTab;
                        return (
                            <button key={mode} style={tabButtonStyle(activeTab === mode, hasScores, isBeginner)} onClick={() => setActiveTab(mode)}>
                                <span>{label}</span>
                                {hasScores && (
                                    <span
                                        style={{
                                            marginLeft: '0.45rem',
                                            padding: '0.08rem 0.35rem',
                                            borderRadius: '999px',
                                            background: 'rgba(224, 164, 88, 0.22)',
                                            color: 'white',
                                            fontSize: '0.68rem',
                                            fontWeight: 700,
                                        }}
                                    >
                                        {entryCount}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Sheep-count filter, only meaningful on MP boards. */}
                {!isFixedCountTab && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            marginBottom: isCompact ? '1rem' : '1.5rem',
                            flexShrink: 0,
                        }}
                    >
                        <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.7)' }}>Sheep count:</span>
                        <select
                            value={sheepFilter}
                            onChange={(e) => setSheepFilter(parseInt(e.target.value, 10) || 0)}
                            style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.375rem',
                                background: 'rgba(255, 255, 255, 0.1)',
                                color: 'white',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                            }}
                        >
                            {SHEEP_FILTER_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value} style={{ background: color.surfaceSelect }}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Content area (scrollable). */}
                <div
                    style={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: 'auto',
                        WebkitOverflowScrolling: 'touch',
                    }}
                >
                    {loading && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '3rem 0',
                            }}
                        >
                            <span style={{ color: 'rgba(255, 255, 255, 0.8)' }}>{t('leaderboard.loading')}</span>
                        </div>
                    )}
                    {error && (
                        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                            <p style={{ color: color.dangerSoft, marginBottom: '1rem' }}>
                                {t(`leaderboard.${error}`)}
                            </p>
                            <Button variant="primary" onClick={loadLeaderboards}>
                                {t('common.retry')}
                            </Button>
                        </div>
                    )}
                    {!loading && !error && renderLeaderboardTable(activeTab)}
                </div>

                <Button
                    variant="secondary"
                    onClick={onBack}
                    style={{ marginTop: isCompact ? '1rem' : '1.5rem', flexShrink: 0 }}
                >
                    {t('common.backToMenu')}
                </Button>
            </Panel>
        </div>
    );
}
