/**
 * PlayerIdentitySetup — first-visit name flow.
 *
 * Three identity options (custom / random / anonymous) collapse into
 * a single IdentityOption renderer. No decorative emoji; type +
 * accent-color carry the visual hierarchy.
 */
import React, { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getNetworkManager } from '../../GameBridge.js';
import { generatePersistentId, savePlayerIdentity } from '../shared/playerIdentity.js';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { Button } from '../ui/Button.js';
import { LanguageSelector } from '../ui/LanguageSelector.js';

const ACCENT_RGB = {
    blue: { r: 59, g: 130, b: 246 },
    green: { r: 34, g: 197, b: 94 },
    gray: { r: 107, g: 114, b: 128 },
};

// Best-effort server registration. Failure paths log + return null so
// the caller falls back to an offline identity. Same shape for all
// three identity types — the only difference is the (displayName,
// nameType) tuple sent to the server.
async function registerWithServer(persistentId, displayName, nameType) {
    const nm = getNetworkManager();
    if (!nm) return null;
    try {
        await nm.connect();
        const response = await nm.registerPlayer(persistentId, displayName, nameType);
        console.log(`[PLAYER] ${nameType} player registered with server:`, response);
        return response;
    } catch (err) {
        console.warn('[PLAYER] Server registration failed, proceeding offline:', err);
        return null;
    }
}

// Build the persisted identity record. Server-supplied fields win;
// `fallbackName` covers the offline path.
function buildIdentity({ persistentId, nameType, fallbackName, serverResponse }) {
    const profile = serverResponse?.playerProfile ?? serverResponse ?? {};
    return {
        persistentId,
        displayName: profile.displayName || fallbackName || 'Player',
        fullName: profile.fullName || fallbackName || 'Player#0001',
        discriminator: profile.discriminator || '0001',
        nameType,
        createdAt: Date.now(),
        isRegistered: !!serverResponse,
    };
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
}) {
    const c = ACCENT_RGB[accentColor] ?? ACCENT_RGB.blue;
    const style = {
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
    const tag = nameType === 'custom' ? 'div' : 'button';
    return createElement(tag, { style, onClick: onSelect, type: tag === 'button' ? 'button' : undefined }, [
        createElement('span', {
            key: 'title',
            style: { color: 'white', fontWeight: 600, display: 'block', marginBottom: '0.4rem' },
        }, title),
        createElement('p', {
            key: 'desc',
            style: {
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: isCompact ? '0.75rem' : '0.875rem',
                margin: 0,
            },
        }, description),
        children,
    ]);
}

export function PlayerIdentitySetup({ onComplete }) {
    const { t } = useTranslation();
    const [displayName, setDisplayName] = useState('');
    const [nameType, setNameType] = useState('custom');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const { isCompact } = useResponsive();

    // Single completion path — every option (custom submit, random,
    // anonymous) funnels through `complete()` so the persisted-identity
    // shape is built in exactly one place.
    const complete = async ({ type, fallbackName, registerName }) => {
        setIsSubmitting(true);
        setError('');
        try {
            const persistentId = generatePersistentId();
            const serverResponse = await registerWithServer(persistentId, registerName, type);
            const identity = buildIdentity({ persistentId, nameType: type, fallbackName, serverResponse });
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

    const inputStyle = {
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

    return createElement('div', {
        style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: '100%',
            position: 'relative',
        },
    }, [
        createElement('div', {
            key: 'lang-selector',
            style: {
                position: 'absolute',
                top: isCompact ? '0.5rem' : '1rem',
                right: isCompact ? '0.5rem' : '1rem',
                zIndex: 100,
            },
        }, createElement(LanguageSelector, { variant: 'icon' })),

        createElement(Panel, {
            key: 'panel',
            size: 'lg',
            maxWidth: '28rem',
            style: { animation: 'slideUp 0.8s ease-out' },
        }, [
            createElement(PanelTitle, { key: 'title' }, t('identity.welcome')),

            createElement('p', {
                key: 'subtitle',
                style: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    textAlign: 'center',
                    marginBottom: isCompact ? '1rem' : '2rem',
                    fontSize: isCompact ? '0.8rem' : '0.875rem',
                },
            }, t('identity.chooseIdentity')),

            createElement('div', {
                key: 'options',
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isCompact ? '0.5rem' : '1rem',
                },
            }, [
                createElement(IdentityOption, {
                    key: 'custom',
                    nameType: 'custom',
                    selected: nameType === 'custom',
                    accentColor: 'blue',
                    title: t('identity.customName'),
                    description: t('identity.customNameDesc'),
                    onSelect: () => { setNameType('custom'); setDisplayName(''); },
                    isCompact,
                }, nameType === 'custom' && createElement('input', {
                    key: 'input',
                    type: 'text',
                    style: inputStyle,
                    placeholder: t('identity.enterName'),
                    value: displayName,
                    maxLength: 20,
                    onChange: (e) => setDisplayName(e.target.value),
                    onKeyPress: (e) => { if (e.key === 'Enter') submitCustom(); },
                    onFocus: () => { window.isTypingInInput = true; },
                    onBlur: () => { window.isTypingInInput = false; },
                })),
                createElement(IdentityOption, {
                    key: 'random',
                    nameType: 'random',
                    selected: nameType === 'random',
                    accentColor: 'green',
                    title: t('identity.randomName'),
                    description: t('identity.randomNameDesc'),
                    onSelect: selectRandom,
                    isCompact,
                }),
                createElement(IdentityOption, {
                    key: 'anonymous',
                    nameType: 'anonymous',
                    selected: nameType === 'anonymous',
                    accentColor: 'gray',
                    title: t('identity.anonymous'),
                    description: t('identity.anonymousDesc'),
                    onSelect: selectAnonymous,
                    isCompact,
                }),
            ]),

            error && createElement('p', {
                key: 'error',
                style: {
                    color: '#f87171',
                    fontSize: '0.875rem',
                    textAlign: 'center',
                    marginTop: '1rem',
                },
            }, error),

            createElement('div', {
                key: 'submit',
                style: { marginTop: isCompact ? '1rem' : '1.5rem' },
            },
                createElement(Button, {
                    variant: 'primary',
                    fullWidth: true,
                    onClick: submitCustom,
                    disabled: isSubmitting,
                }, isSubmitting ? t('identity.settingUp') : t('identity.continue')),
            ),
        ]),
    ]);
}
