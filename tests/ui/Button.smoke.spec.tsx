/** @vitest-environment jsdom */
/**
 * Cycle 47 P2: component-render smoke harness.
 *
 * Pins the existing createElement Button family in a jsdom + Testing Library
 * environment before Phase 4 converts these primitives to token-driven .tsx.
 * A green render here is the safety net the conversion refactors against.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { Button, BackButton } from '../../js/components/ui/Button';

afterEach(cleanup);

describe('Button (smoke)', () => {
    it('renders its children inside a <button>', () => {
        render(<Button>Play</Button>);
        const btn = screen.getByRole('button', { name: 'Play' });
        expect(btn.tagName).toBe('BUTTON');
    });

    it('reflects the disabled prop on the element', () => {
        render(<Button disabled>Locked</Button>);
        const btn = screen.getByRole('button', { name: 'Locked' }) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
    });

    it('renders each variant without throwing', () => {
        for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
            render(<Button variant={variant}>{variant}</Button>);
            expect(screen.getByRole('button', { name: variant })).toBeTruthy();
            cleanup();
        }
    });

    it('BackButton shows its default label', () => {
        render(<BackButton />);
        expect(screen.getByRole('button').textContent).toContain('Back');
    });
});
