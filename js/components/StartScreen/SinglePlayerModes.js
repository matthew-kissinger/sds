/**
 * SinglePlayerModes Component
 * Mode selection for single player (Classic vs Extreme)
 */
const { createElement } = window.React;

export function SinglePlayerModes({ onSelectMode, onBack }) {
    const panelStyle = {
        animation: 'slideUp 0.5s ease-out',
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        borderRadius: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        padding: '2.5rem'
    };

    const modeButtonStyle = (isExtreme = false) => ({
        background: isExtreme ? 'rgba(255, 107, 107, 0.08)' : 'rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: isExtreme ? '1px solid rgba(255, 107, 107, 0.2)' : '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '1rem',
        padding: '1.5rem',
        boxShadow: isExtreme
            ? '0 3px 12px rgba(255, 107, 107, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)'
            : '0 3px 12px rgba(0, 0, 0, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
        color: 'white'
    });

    const renderModeButton = (mode, icon, title, description, isExtreme = false) => {
        return createElement('button', {
            key: mode,
            className: 'w-full cursor-pointer transition-all duration-300 text-white',
            style: modeButtonStyle(isExtreme),
            onMouseEnter: (e) => {
                e.target.style.background = isExtreme ? 'rgba(255, 107, 107, 0.15)' : 'rgba(255, 255, 255, 0.1)';
                e.target.style.borderColor = isExtreme ? 'rgba(255, 107, 107, 0.3)' : 'rgba(255, 255, 255, 0.15)';
            },
            onMouseLeave: (e) => {
                e.target.style.background = isExtreme ? 'rgba(255, 107, 107, 0.08)' : 'rgba(255, 255, 255, 0.06)';
                e.target.style.borderColor = isExtreme ? 'rgba(255, 107, 107, 0.2)' : 'rgba(255, 255, 255, 0.1)';
            },
            onClick: () => onSelectMode(mode)
        },
            createElement('div', {
                className: 'flex items-center justify-between'
            }, [
                createElement('div', {
                    key: 'left',
                    className: 'flex items-center gap-3'
                }, [
                    createElement('span', { key: 'icon', className: 'text-2xl' }, icon),
                    createElement('div', { key: 'text', className: 'text-left' }, [
                        createElement('div', { key: 'title', className: 'font-semibold text-white' }, title),
                        createElement('div', { key: 'desc', className: 'text-sm text-white text-opacity-70' }, description)
                    ])
                ]),
                createElement('span', { key: 'arrow', className: 'text-white text-opacity-60' }, String.fromCharCode(8594))
            ])
        );
    };

    return createElement('div', {
        className: 'max-w-lg w-full',
        style: panelStyle
    }, [
        createElement('h2', {
            key: 'title',
            className: 'text-2xl font-bold text-center text-white mb-8',
            style: { textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)' }
        }, 'Choose Game Mode'),

        createElement('div', {
            key: 'modes',
            className: 'space-y-4'
        }, [
            renderModeButton('classic', '', 'Classic Mode', 'Herd all 200 sheep to the pasture', false),
            renderModeButton('extreme', '', 'Extreme Mode', 'Herd all 1000 sheep - performance challenge!', true)
        ]),

        createElement('button', {
            key: 'back',
            className: 'btn-secondary w-full mt-6',
            onClick: onBack
        }, String.fromCharCode(8592) + ' Back to Dog Selection')
    ]);
}
