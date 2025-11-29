/**
 * Button Components
 * Primary and Secondary button styles with responsive sizing
 */
import React, { createElement, useState } from 'react';
import { useResponsive } from '../hooks/usePlatform.js';
import { buttonStyle } from '../../styles/styles.js';

/**
 * Button - Primary or secondary style button
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Button content
 * @param {'primary'|'secondary'} props.variant - Button style
 * @param {boolean} props.fullWidth - Take full width of container
 * @param {Function} props.onClick - Click handler
 * @param {Object} props.style - Additional styles
 */
export function Button({
    children,
    variant = 'primary',
    fullWidth = false,
    onClick,
    style = {},
    disabled = false,
    ...props
}) {
    const responsive = useResponsive();
    const [isHovered, setIsHovered] = useState(false);

    const computedStyle = {
        ...buttonStyle({ variant, responsive, isHovered, fullWidth, disabled }),
        ...style
    };

    return createElement('button', {
        style: computedStyle,
        onClick: disabled ? undefined : onClick,
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
        disabled,
        ...props
    }, children);
}

/**
 * BackButton - Secondary button with back arrow
 */
export function BackButton({ children = 'Back', onClick, ...props }) {
    return createElement(Button, {
        variant: 'secondary',
        fullWidth: true,
        onClick,
        ...props
    }, [
        createElement('span', { key: 'arrow' }, '\u2190'),
        createElement('span', { key: 'text' }, children)
    ]);
}
