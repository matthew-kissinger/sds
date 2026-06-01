/**
 * PlayerIdentitySetup — first-visit name flow.
 *
 * Three identity options (custom / random / anonymous) collapse into
 * a single IdentityOption renderer. No decorative emoji; type +
 * accent-color carry the visual hierarchy.
 *
 * Cycle 48 P2: converted from the element-factory .js to token-driven .tsx.
 * The three IdentityOption accent tints stay raw rgb() triples (ACCENT_RGB):
 * they are alpha-composited at 0.2 / 0.5, so a token color-mix() blend would
 * shift on sub-pixel rounding. They carry no 6-digit hex. The one hex literal
 * (the error text) maps exactly to the danger-soft token. Behavior
 * is identical to the previous PlayerIdentitySetup.js.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getNetworkManager } from '../../GameBridge.js';
import { generatePersistentId, savePlayerIdentity } from '../shared/playerIdentity.js';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel';
import { Button } from '../ui/Button';
import { LanguageSelector } from '../ui/LanguageSelector.js';
import { color } from '../ui/tokens';

const ACCENT_RGB = {
    blue: { r: 59, g: 130, b: 246 },
    green: { r: 34, g: 197, b: 94 },
    gray: { r: 107, g: 114, b: 128 },
} as const;

type AccentKey = keyof typeof ACCENT_RGB;

interface ServerProfile {
    displayName?: string;
    fullName?: string;
    discriminator?: string;
    persistentId?: string;
    persistent_id?: string;
    playerProfile?: ServerProfile;
}

// P-SEC-1: the worker now also returns a freshly-minted authSecret and the
// canonical (server-minted) persistentId on a new registration.
interface ServerRegisterResponse extends ServerProfile {
    authSecret?: string;
    persistentId?: string;
}

interface PlayerIdentity {
    persistentId: string;
    displayName: string;
    fullName: string;
    discriminator: string;
    nameType: string;
    createdAt: number;
    isRegistered: boolean;
    // P-SEC-1: device-local secret proving ownership of this persistentId on
    // re-register. Present only when the server issued one (online path);
    // undefined for an offline-only identity.
    authSecret?: string;
}

// Best-effort server registration. Failure paths log + return null so
// the caller falls back to an offline identity. Same shape for all
// three identity types — the only difference is the (displayName,
// nameType) tuple sent to the server.
//
// P-SEC-1: for a NEW identity we pass persistentId=null so the worker mints the
// id server-side and ignores any client-chosen value. The server-returned id +
// authSecret are adopted by buildIdentity.
async function registerWithServer(displayName: string, nameType: string): Promise<ServerRegisterResponse | null> {
    const nm = getNetworkManager();
    if (!nm) return null;
    try {
        await nm.connect();
        const response = await nm.registerPlayer(null, displayName, nameType);
        console.log(`[PLAYER] ${nameType} player registered with server:`, response);
        return response as ServerRegisterResponse;
    } catch (err) {
        console.warn('[PLAYER] Server registration failed, proceeding offline:', err);
        return null;
    }
}

// Build the persisted identity record. Server-supplied fields win;
// `fallbackName` + `fallbackId` cover the offline path.
//
// P-SEC-1: when the server responded, adopt its canonical persistentId (it
// minted the id, not the client) and persist the issued authSecret. The local
// `fallbackId` is used only when the server was unreachable.
function buildIdentity({
    fallbackId,
    nameType,
    fallbackName,
    serverResponse,
}: {
    fallbackId: string;
    nameType: string;
    fallbackName?: string;
    serverResponse: ServerRegisterResponse | null;
}): PlayerIdentity {
    const profile: ServerProfile = serverResponse?.playerProfile ?? serverResponse ?? {};
    const serverId = serverResponse?.persistentId
        ?? profile.persistentId
        ?? profile.persistent_id;
    return {
        persistentId: serverId || fallbackId,
        displayName: profile.displayName || fallbackName || 'Player',
        fullName: profile.fullName || fallbackName || 'Player#0001',
        discriminator: profile.discriminator || '0001',
        nameType,
        createdAt: Date.now(),
        isRegistered: !!serverResponse,
        ...(serverResponse?.authSecret ? { authSecret: serverResponse.authSecret } : {}),
    };
}

interface IdentityOptionProps {
    nameType: string;
    selected: boolean;
    accentColor: AccentKey;
    title: ReactNode;
    description: ReactNode;
    onSelect: () => void;
    isCompact: boolean;
    children?: ReactNode;
}

function IdentityOption({
    nameType,
    selected,
    accentColor,
    title,
    description,
    onSelect,
    isCompact,
    children,
}: IdentityOptionProps) {
    const c = ACCENT_RGB[accentColor] ?? ACCENT_RGB.blue;
    const style: CSSProperties = {
        padding: isCompact ? '0.75rem' : '1rem',
        borderRadius: '0.75rem',
        cursor: 'pointer',
        transition: 'all 0.3s',
        background: selected
            ? `rgba(${c.r}, ${c.g}, ${c.b}, 0.2)`
            : 'rgba(255, 255, 255, 0.05)',
        border: selected
            ? `1px solid rgba(${c.r}, ${c.g}, ${c.b}, 0.5)`
            : '1px solid rgba(255, 255, 255, 0.1)',
        width: '100%',
        textAlign: 'left',
    };
    // 'custom' uses div+onClick because it nests an input that owns
    // its own focus + Enter key; the others are real buttons.
    const Tag = (nameType === 'custom' ? 'div' : 'button') as 'div' | 'button';
    const typeAttr = Tag === 'button' ? { type: 'button' as const } : {};
    return (
        <Tag style={style} onClick={onSelect} {...typeAttr}>
            <span style={{ color: 'white', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                {title}
            </span>
            <p
                style={{
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: isCompact ? '0.75rem' : '0.875rem',
                    margin: 0,
                }}
            >
                {description}
            </p>
            {children}
        </Tag>
    );
}

interface PlayerIdentitySetupProps {
    onComplete: (identity: PlayerIdentity) => void;
}

export function PlayerIdentitySetup({ onComplete }: PlayerIdentitySetupProps) {
    const { t } = useTranslation();
    const [displayName, setDisplayName] = useState('');
    const [nameType, setNameType] = useState('custom');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const { isCompact } = useResponsive();

    // Single completion path — every option (custom submit, random,
    // anonymous) funnels through `complete()` so the persisted-identity
    // shape is built in exactly one place.
    const complete = async ({
        type,
        fallbackName,
        registerName,
    }: {
        type: string;
        fallbackName: string;
        registerName: string;
    }) => {
        setIsSubmitting(true);
        setError('');
        try {
            // P-SEC-1: local id is only the offline fallback. Online, the worker
            // mints the canonical persistentId and we adopt it in buildIdentity.
            const fallbackId = generatePersistentId();
            const serverResponse = await registerWithServer(registerName, type);
            const identity = buildIdentity({ fallbackId, nameType: type, fallbackName, serverResponse });
            savePlayerIdentity(identity);
            console.log(`[PLAYER] ${type} identity created:`, identity);
            onComplete(identity);
        } catch (err) {
            console.error(`[PLAYER] Error creating ${type} identity:`, err);
            setError(t('identity.errorFailed'));
            setIsSubmitting(false);
        }
    };

    const selectRandom = () => {
        setNameType('random');
        setDisplayName('Random Name');
        complete({ type: 'random', fallbackName: 'Player', registerName: '' });
    };

    const selectAnonymous = () => {
        setNameType('anonymous');
        setDisplayName('Player');
        complete({ type: 'anonymous', fallbackName: 'Player', registerName: 'Player' });
    };

    const submitCustom = () => {
        const trimmed = displayName.trim();
        if (nameType === 'custom' && trimmed.length === 0) return setError(t('identity.errorEmpty'));
        if (nameType === 'custom' && trimmed.length > 20) return setError(t('identity.errorTooLong'));
        complete({ type: nameType, fallbackName: trimmed, registerName: trimmed });
    };

    const inputStyle: CSSProperties = {
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        color: 'white',
        padding: '0.75rem 1rem',
        borderRadius: '0.5rem',
        fontSize: '1rem',
        transition: 'all 0.3s',
        outline: 'none',
        width: '100%',
        marginTop: '0.75rem',
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                height: '100%',
                position: 'relative',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    top: isCompact ? '0.5rem' : '1rem',
                    right: isCompact ? '0.5rem' : '1rem',
                    zIndex: 100,
                }}
            >
                <LanguageSelector variant="icon" />
            </div>

            <Panel size="lg" maxWidth="28rem" style={{ animation: 'slideUp 0.8s ease-out' }}>
                <PanelTitle>{t('identity.welcome')}</PanelTitle>

                <p
                    style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        textAlign: 'center',
                        marginBottom: isCompact ? '1rem' : '2rem',
                        fontSize: isCompact ? '0.8rem' : '0.875rem',
                    }}
                >
                    {t('identity.chooseIdentity')}
                </p>

                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: isCompact ? '0.5rem' : '1rem',
                    }}
                >
                    <IdentityOption
                        nameType="custom"
                        selected={nameType === 'custom'}
                        accentColor="blue"
                        title={t('identity.customName')}
                        description={t('identity.customNameDesc')}
                        onSelect={() => {
                            setNameType('custom');
                            setDisplayName('');
                        }}
                        isCompact={isCompact}
                    >
                        {nameType === 'custom' && (
                            <input
                                type="text"
                                style={inputStyle}
                                placeholder={t('identity.enterName')}
                                value={displayName}
                                maxLength={20}
                                onChange={(e) => setDisplayName(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') submitCustom();
                                }}
                                onFocus={() => {
                                    (window as Window & { isTypingInInput?: boolean }).isTypingInInput = true;
                                }}
                                onBlur={() => {
                                    (window as Window & { isTypingInInput?: boolean }).isTypingInInput = false;
                                }}
                            />
                        )}
                    </IdentityOption>
                    <IdentityOption
                        nameType="random"
                        selected={nameType === 'random'}
                        accentColor="green"
                        title={t('identity.randomName')}
                        description={t('identity.randomNameDesc')}
                        onSelect={selectRandom}
                        isCompact={isCompact}
                    />
                    <IdentityOption
                        nameType="anonymous"
                        selected={nameType === 'anonymous'}
                        accentColor="gray"
                        title={t('identity.anonymous')}
                        description={t('identity.anonymousDesc')}
                        onSelect={selectAnonymous}
                        isCompact={isCompact}
                    />
                </div>

                {error && (
                    <p
                        style={{
                            color: color.dangerSoft,
                            fontSize: '0.875rem',
                            textAlign: 'center',
                            marginTop: '1rem',
                        }}
                    >
                        {error}
                    </p>
                )}

                <div style={{ marginTop: isCompact ? '1rem' : '1.5rem' }}>
                    <Button variant="primary" fullWidth onClick={submitCustom} disabled={isSubmitting}>
                        {isSubmitting ? t('identity.settingUp') : t('identity.continue')}
                    </Button>
                </div>
            </Panel>
        </div>
    );
}
