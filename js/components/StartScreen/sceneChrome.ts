/**
 * Per-scene visual chrome for the ScenePicker card: the background gradient and
 * the optional "NEW" badge. The accent (the card frame color when a scene is
 * not the active one) reads the per-scene design token, so it stays in lockstep
 * with the palette.
 *
 * Cycle 47 P5: lifted out of ScenePicker's inline SCENE_CHROME so the converted
 * .tsx carries no raw hex. The multi-stop gradients remain scene art (the same
 * category as the SceneGlyph vignettes); promoting the gradient stops to tokens
 * is a Phase 8 drift-sweep concern, not part of this behavior-preserving leaf.
 */
import { sceneAccent } from '../ui/tokens';

export interface SceneChrome {
    gradient: string;
    accent: string;
    badge: string | null;
}

const CHROME: Record<string, SceneChrome> = {
    'rolling-hills': {
        gradient: 'linear-gradient(135deg, #4a8db8 0%, #6fbf99 60%, #d6c082 100%)',
        accent: sceneAccent['rolling-hills'],
        badge: 'NEW',
    },
    'open-country': {
        gradient: 'linear-gradient(135deg, #355e3b 0%, #6b8e5a 50%, #d9b779 100%)',
        accent: sceneAccent['open-country'],
        badge: 'NEW',
    },
    field: {
        gradient: 'linear-gradient(135deg, #6b8e23 0%, #9ab35e 60%, #d6c082 100%)',
        accent: sceneAccent.field,
        badge: null,
    },
};

/** Resolve the chrome for a scene id, falling back to the field chrome. */
export function sceneChrome(id: string): SceneChrome {
    return CHROME[id] ?? CHROME.field;
}
