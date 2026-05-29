/**
 * CameraModeIndicator — persistent HUD chip showing the current camera mode and
 * how to cycle it. Tappable on every platform; desktop also exposes the `C` key.
 * Cycles Follow -> Free -> Classic -> Follow via the camera controller (Cycle 23
 * Phase A2 - Classic demoted to third option).
 *
 * Cycle 48 P1: converted to JSX .tsx. Behavior-identical; no hex (classNames +
 * the .ui-panel surface only). Positioning lives in HudLayout (Cycle 35 P8).
 */
import { getSceneManager } from '../../GameBridge.js';

const MODE_LABEL: Record<string, string> = {
    classic: 'Classic',
    follow: 'Follow',
    free: 'Free',
};

interface CameraModeIndicatorProps {
    mode: string;
    platform?: string;
}

export function CameraModeIndicator({ mode, platform = 'desktop' }: CameraModeIndicatorProps) {
    const label = MODE_LABEL[mode] ?? 'Camera';
    const isMobile = platform === 'mobile';

    const handleCycle = () => {
        getSceneManager()?.getCameraController()?.cycleMode?.();
    };

    return (
        <div className="animate-slide-down" style={{ pointerEvents: 'auto' }}>
            <button
                type="button"
                onClick={handleCycle}
                className="ui-panel py-1.5 px-3 flex items-center gap-2 cursor-pointer hover:bg-white/5 active:scale-95 transition-transform"
                style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                aria-label={`Camera mode: ${label}. Tap to cycle.`}
            >
                <span className="text-white/90 text-sm font-medium">{label}</span>
                <span className="text-white/30 text-xs">·</span>
                {isMobile ? (
                    <span className="text-white/60 text-xs">Tap</span>
                ) : (
                    <>
                        <span className="text-white/60 text-xs">Press</span>
                        <kbd className="inline-block px-1.5 py-0.5 rounded bg-white/15 border border-white/25 text-white/90 text-xs font-mono leading-none">C</kbd>
                    </>
                )}
            </button>
        </div>
    );
}
