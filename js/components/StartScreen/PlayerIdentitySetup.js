/**
 * PlayerIdentitySetup Component
 * Initial player name setup flow
 */
import React, { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getNetworkManager } from '../../GameBridge.js';
import { generatePersistentId, savePlayerIdentity } from '../shared/playerIdentity.js';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { Button } from '../ui/Button.js';
import { LanguageSelector } from '../ui/LanguageSelector.js';

export function PlayerIdentitySetup({ onComplete }) {
    const { t } = useTranslation();
    const [displayName, setDisplayName] = useState('');
    const [nameType, setNameType] = useState('custom');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const { isCompact } = useResponsive();

    const handleGenerateRandom = async () => {
        // Auto-proceed when Random Name is selected
        setNameType('random');
        setDisplayName('Random Name');
        setIsSubmitting(true);
        setError('');

        try {
            const persistentId = generatePersistentId();

            // Register with server if connected (server will generate random name)
            let serverResponse = null;
            const nm = getNetworkManager();
            if (nm) {
                try {
                    await nm.connect();
                    serverResponse = await nm.registerPlayer(persistentId, '', 'random');
                    console.log('[PLAYER] Random name player registered with server:', serverResponse);
                } catch (networkError) {
                    console.warn('[PLAYER] Server registration failed, proceeding offline:', networkError);
                }
            }

            // Create player identity
            const identity = {
                persistentId: persistentId,
                displayName: serverResponse?.playerProfile?.displayName || serverResponse?.displayName || 'Player',
                fullName: serverResponse?.playerProfile?.fullName || serverResponse?.fullName || 'Player#0001',
                discriminator: serverResponse?.playerProfile?.discriminator || serverResponse?.discriminator || '0001',
                nameType: 'random',
                createdAt: Date.now(),
                isRegistered: !!serverResponse
            };

            savePlayerIdentity(identity);
            console.log('[PLAYER] Random name identity created:', identity);
            onComplete(identity);

        } catch (err) {
            console.error('[PLAYER] Error creating random name identity:', err);
            setError(t('identity.errorFailed'));
            setIsSubmitting(false);
        }
    };

    const handleStayAnonymous = async () => {
        // Auto-proceed when Anonymous is selected
        setNameType('anonymous');
        setDisplayName('Player');
        setIsSubmitting(true);
        setError('');

        try {
            const persistentId = generatePersistentId();

            // Register with server if connected
            let serverResponse = null;
            const nm = getNetworkManager();
            if (nm) {
                try {
                    await nm.connect();
                    serverResponse = await nm.registerPlayer(persistentId, 'Player', 'anonymous');
                    console.log('[PLAYER] Anonymous player registered with server:', serverResponse);
                } catch (networkError) {
                    console.warn('[PLAYER] Server registration failed, proceeding offline:', networkError);
                }
            }

            // Create player identity
            const identity = {
                persistentId: persistentId,
                displayName: serverResponse?.playerProfile?.displayName || serverResponse?.displayName || 'Player',
                fullName: serverResponse?.playerProfile?.fullName || serverResponse?.fullName || 'Player#0001',
                discriminator: serverResponse?.playerProfile?.discriminator || serverResponse?.discriminator || '0001',
                nameType: 'anonymous',
                createdAt: Date.now(),
                isRegistered: !!serverResponse
            };

            savePlayerIdentity(identity);
            console.log('[PLAYER] Anonymous identity created:', identity);
            onComplete(identity);

        } catch (err) {
            console.error('[PLAYER] Error creating anonymous identity:', err);
            setError(t('identity.errorFailed'));
            setIsSubmitting(false);
        }
    };

    const handleCustomName = () => {
        setNameType('custom');
        setDisplayName('');
    };

    const handleSubmit = async () => {
        if (nameType === 'custom' && (!displayName || displayName.trim().length === 0)) {
            setError(t('identity.errorEmpty'));
            return;
        }

        if (nameType === 'custom' && displayName.trim().length > 20) {
            setError(t('identity.errorTooLong'));
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const persistentId = generatePersistentId();
            const finalDisplayName = nameType === 'custom' ? displayName.trim() :
                                   nameType === 'random' ? '' : displayName;

            // Register with server if connected
            let serverResponse = null;
            const nm = getNetworkManager();
            if (nm) {
                try {
                    await nm.connect();
                    serverResponse = await nm.registerPlayer(
                        persistentId,
                        finalDisplayName,
                        nameType
                    );
                    console.log('[PLAYER] Player registered with server:', serverResponse);
                } catch (networkError) {
                    console.warn('[PLAYER] Server registration failed, proceeding offline:', networkError);
                }
            }

            // Create player identity
            const identity = {
                persistentId: persistentId,
                displayName: serverResponse?.playerProfile?.displayName || serverResponse?.displayName || finalDisplayName || 'Player',
                fullName: serverResponse?.playerProfile?.fullName || serverResponse?.fullName || finalDisplayName || 'Player#0001',
                discriminator: serverResponse?.playerProfile?.discriminator || serverResponse?.discriminator || '0001',
                nameType: nameType,
                createdAt: Date.now(),
                isRegistered: !!serverResponse
            };

            savePlayerIdentity(identity);
            console.log('[PLAYER] Player identity created:', identity);
            onComplete(identity);

        } catch (err) {
            console.error('[PLAYER] Error creating player identity:', err);
            setError(t('identity.errorFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const getOptionStyle = (isSelected, color = 'blue') => {
        const colors = {
            blue: { r: 59, g: 130, b: 246 },
            green: { r: 34, g: 197, b: 94 },
            gray: { r: 107, g: 114, b: 128 }
        };
        const c = colors[color] || colors.blue;

        return {
            padding: isCompact ? '0.75rem' : '1rem',
            borderRadius: '0.75rem',
            cursor: 'pointer',
            transition: 'all 0.3s',
            background: isSelected
                ? `rgba(${c.r}, ${c.g}, ${c.b}, 0.2)`
                : 'rgba(255, 255, 255, 0.05)',
            border: isSelected
                ? `1px solid rgba(${c.r}, ${c.g}, ${c.b}, 0.5)`
                : '1px solid rgba(255, 255, 255, 0.1)',
            width: '100%',
            textAlign: 'left'
        };
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
        width: '100%'
    };

    return createElement('div', {
        style: {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            position: 'relative'
        }
    }, [
        // Language selector in top-right corner
        createElement('div', {
            key: 'lang-selector',
            style: {
                position: 'absolute',
                top: isCompact ? '0.5rem' : '1rem',
                right: isCompact ? '0.5rem' : '1rem',
                zIndex: 100
            }
        }, createElement(LanguageSelector, { variant: 'icon' })),

        createElement(Panel, {
            key: 'panel',
            size: 'lg',
            maxWidth: '28rem',
            style: { animation: 'slideUp 0.8s ease-out' }
        }, [
            createElement(PanelTitle, { key: 'title' }, t('identity.welcome')),

            createElement('p', {
                key: 'subtitle',
                style: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    textAlign: 'center',
                    marginBottom: isCompact ? '1rem' : '2rem',
                    fontSize: isCompact ? '0.8rem' : '0.875rem'
                }
            }, t('identity.chooseIdentity')),

            createElement('div', {
                key: 'options',
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isCompact ? '0.5rem' : '1rem'
                }
            }, [
                // Custom name option
                createElement('div', {
                    key: 'custom',
                    style: getOptionStyle(nameType === 'custom', 'blue'),
                    onClick: handleCustomName
                }, [
                    createElement('div', {
                        key: 'header',
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            marginBottom: '0.5rem'
                        }
                    }, [
                        createElement('span', {
                            key: 'icon',
                            style: { fontSize: isCompact ? '1rem' : '1.25rem' }
                        }, '✏️'),
                        createElement('span', {
                            key: 'title',
                            style: { color: 'white', fontWeight: 600 }
                        }, t('identity.customName'))
                    ]),
                    createElement('p', {
                        key: 'desc',
                        style: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: isCompact ? '0.75rem' : '0.875rem',
                            marginBottom: nameType === 'custom' ? '0.75rem' : 0
                        }
                    }, t('identity.customNameDesc')),
                    nameType === 'custom' && createElement('input', {
                        key: 'input',
                        type: 'text',
                        style: inputStyle,
                        placeholder: t('identity.enterName'),
                        value: displayName,
                        maxLength: 20,
                        onChange: (e) => setDisplayName(e.target.value),
                        onKeyPress: (e) => { if (e.key === 'Enter') handleSubmit(); },
                        onFocus: () => window.isTypingInInput = true,
                        onBlur: () => window.isTypingInInput = false
                    })
                ]),

                // Random name option
                createElement('button', {
                    key: 'random',
                    style: getOptionStyle(nameType === 'random', 'green'),
                    onClick: handleGenerateRandom
                }, [
                    createElement('div', {
                        key: 'header',
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            marginBottom: '0.25rem'
                        }
                    }, [
                        createElement('span', {
                            key: 'icon',
                            style: { fontSize: isCompact ? '1rem' : '1.25rem' }
                        }, '🎲'),
                        createElement('span', {
                            key: 'title',
                            style: { color: 'white', fontWeight: 600 }
                        }, t('identity.randomName'))
                    ]),
                    createElement('p', {
                        key: 'desc',
                        style: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: isCompact ? '0.75rem' : '0.875rem'
                        }
                    }, t('identity.randomNameDesc'))
                ]),

                // Anonymous option
                createElement('button', {
                    key: 'anonymous',
                    style: getOptionStyle(nameType === 'anonymous', 'gray'),
                    onClick: handleStayAnonymous
                }, [
                    createElement('div', {
                        key: 'header',
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            marginBottom: '0.25rem'
                        }
                    }, [
                        createElement('span', {
                            key: 'icon',
                            style: { fontSize: isCompact ? '1rem' : '1.25rem' }
                        }, '👤'),
                        createElement('span', {
                            key: 'title',
                            style: { color: 'white', fontWeight: 600 }
                        }, t('identity.anonymous'))
                    ]),
                    createElement('p', {
                        key: 'desc',
                        style: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: isCompact ? '0.75rem' : '0.875rem'
                        }
                    }, t('identity.anonymousDesc'))
                ])
            ]),

            error && createElement('p', {
                key: 'error',
                style: {
                    color: '#f87171',
                    fontSize: '0.875rem',
                    textAlign: 'center',
                    marginTop: '1rem'
                }
            }, error),

            createElement('div', {
                key: 'submit',
                style: { marginTop: isCompact ? '1rem' : '1.5rem' }
            },
                createElement(Button, {
                    variant: 'primary',
                    fullWidth: true,
                    onClick: handleSubmit,
                    disabled: isSubmitting
                }, isSubmitting ? t('identity.settingUp') : t('identity.continue'))
            )
        ])
    ]);
}
