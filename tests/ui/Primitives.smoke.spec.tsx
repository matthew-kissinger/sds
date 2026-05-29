/** @vitest-environment jsdom */
/**
 * Cycle 47 P4: render smoke harness for the new token-driven primitives
 * (Surface, Card, Badge, IconButton). Pins that each renders its expected
 * element and accepts its variant props without throwing. Token var() and
 * color-mix() strings don't resolve in jsdom, but they must not crash render.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { Surface } from '../../js/components/ui/Surface';
import { Card } from '../../js/components/ui/Card';
import { Badge } from '../../js/components/ui/Badge';
import { IconButton } from '../../js/components/ui/IconButton';

afterEach(cleanup);

describe('Surface (smoke)', () => {
    it('wraps children in a <div>', () => {
        const { container } = render(<Surface><span>glass</span></Surface>);
        const div = container.querySelector('div');
        expect(div).toBeTruthy();
        expect(div?.textContent).toContain('glass');
    });

    it('renders with blur disabled', () => {
        const { container } = render(<Surface blur={false}>x</Surface>);
        expect(container.querySelector('div')).toBeTruthy();
    });
});

describe('Card (smoke)', () => {
    it('renders active and inactive without throwing', () => {
        for (const active of [false, true]) {
            const { container } = render(<Card active={active}>tile</Card>);
            expect(container.querySelector('div')?.textContent).toContain('tile');
            cleanup();
        }
    });

    it('accepts a per-card accent', () => {
        const { container } = render(<Card accent="var(--color-scene-field)">f</Card>);
        expect(container.querySelector('div')).toBeTruthy();
    });
});

describe('Badge (smoke)', () => {
    it('renders each tone in a <span>', () => {
        for (const tone of ['danger', 'accent', 'neutral'] as const) {
            const { container } = render(<Badge tone={tone}>{tone}</Badge>);
            const span = container.querySelector('span');
            expect(span?.tagName).toBe('SPAN');
            expect(span?.textContent).toBe(tone);
            cleanup();
        }
    });
});

describe('IconButton (smoke)', () => {
    it('renders a <button> wrapping its icon child', () => {
        render(<IconButton aria-label="close"><svg /></IconButton>);
        const btn = screen.getByRole('button', { name: 'close' });
        expect(btn.tagName).toBe('BUTTON');
    });

    it('reflects the disabled prop', () => {
        render(<IconButton disabled aria-label="locked"><svg /></IconButton>);
        const btn = screen.getByRole('button', { name: 'locked' }) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
    });
});
