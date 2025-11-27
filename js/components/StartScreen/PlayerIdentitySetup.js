/**
 * PlayerIdentitySetup Component
 * Initial player name setup flow
 */
import { getNetworkManager } from '../../GameBridge.js';
import { generatePersistentId, savePlayerIdentity } from '../shared/playerIdentity.js';

const { createElement, useState } = window.React;

export function PlayerIdentitySetup({ onComplete }) {
    const [displayName, setDisplayName] = useState('');
    const [nameType, setNameType] = useState('custom');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleGenerateRandom = () => {
        setNameType('random');
        setDisplayName('Random Name');
    };

    const handleStayAnonymous = () => {
        setNameType('anonymous');
        setDisplayName('Player');
    };

    const handleCustomName = () => {
        setNameType('custom');
        setDisplayName('');
    };

    const handleSubmit = async () => {
        if (nameType === 'custom' && (!displayName || displayName.trim().length === 0)) {
            setError('Please enter a display name or choose another option');
            return;
        }

        if (nameType === 'custom' && displayName.trim().length > 20) {
            setError('Display name must be 20 characters or less');
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

        } catch (error) {
            console.error('[PLAYER] Error creating player identity:', error);
            setError('Failed to create player identity. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const panelStyle = {
        animation: 'slideUp 0.8s ease-out',
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        borderRadius: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        padding: '2.5rem'
    };

    const optionStyle = (isSelected, color = 'blue') => ({
        padding: '1rem',
        borderRadius: '0.75rem',
        cursor: 'pointer',
        transition: 'all 0.3s',
        background: isSelected ? `rgba(${color === 'blue' ? '59, 130, 246' : color === 'green' ? '34, 197, 94' : '107, 114, 128'}, 0.2)` : 'rgba(255, 255, 255, 0.05)',
        border: isSelected ? `1px solid rgba(${color === 'blue' ? '59, 130, 246' : color === 'green' ? '34, 197, 94' : '107, 114, 128'}, 0.5)` : '1px solid rgba(255, 255, 255, 0.1)'
    });

    return createElement('div', {
        className: 'max-w-lg w-full',
        style: panelStyle
    }, [
        createElement('h2', {
            key: 'title',
            className: 'text-2xl font-bold text-center text-white mb-2',
            style: { textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)' }
        }, 'Welcome to Sheep Dog Sim!'),

        createElement('p', {
            key: 'subtitle',
            className: 'text-white text-opacity-70 text-center mb-8 text-sm'
        }, 'Choose how you\'d like to be known:'),

        createElement('div', {
            key: 'options',
            className: 'space-y-4'
        }, [
            // Custom name option
            createElement('div', {
                key: 'custom',
                style: optionStyle(nameType === 'custom', 'blue'),
                onClick: handleCustomName
            }, [
                createElement('div', {
                    key: 'header',
                    className: 'flex items-center gap-3 mb-3'
                }, [
                    createElement('span', { key: 'icon', className: 'text-xl' }, ''),
                    createElement('span', { key: 'title', className: 'text-white font-semibold' }, 'Custom Name')
                ]),
                createElement('p', {
                    key: 'desc',
                    className: 'text-white text-opacity-70 text-sm mb-3'
                }, 'Choose your own display name'),
                nameType === 'custom' && createElement('input', {
                    key: 'input',
                    type: 'text',
                    className: 'modern-input w-full',
                    placeholder: 'Enter your name...',
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
                className: 'w-full text-left',
                style: optionStyle(nameType === 'random', 'green'),
                onClick: handleGenerateRandom
            }, [
                createElement('div', {
                    key: 'header',
                    className: 'flex items-center gap-3 mb-2'
                }, [
                    createElement('span', { key: 'icon', className: 'text-xl' }, ''),
                    createElement('span', { key: 'title', className: 'text-white font-semibold' }, 'Random Name')
                ]),
                createElement('p', {
                    key: 'desc',
                    className: 'text-white text-opacity-70 text-sm'
                }, 'Get a randomly generated herding-themed name')
            ]),

            // Anonymous option
            createElement('button', {
                key: 'anonymous',
                className: 'w-full text-left',
                style: optionStyle(nameType === 'anonymous', 'gray'),
                onClick: handleStayAnonymous
            }, [
                createElement('div', {
                    key: 'header',
                    className: 'flex items-center gap-3 mb-2'
                }, [
                    createElement('span', { key: 'icon', className: 'text-xl' }, ''),
                    createElement('span', { key: 'title', className: 'text-white font-semibold' }, 'Stay Anonymous')
                ]),
                createElement('p', {
                    key: 'desc',
                    className: 'text-white text-opacity-70 text-sm'
                }, 'Play as "Player" without a custom name')
            ])
        ]),

        error && createElement('p', {
            key: 'error',
            className: 'text-red-400 text-sm text-center mt-4'
        }, error),

        createElement('button', {
            key: 'submit',
            className: 'btn-primary w-full mt-6',
            onClick: handleSubmit,
            disabled: isSubmitting
        }, createElement('span', null, isSubmitting ? 'Setting up...' : 'Continue'))
    ]);
}
