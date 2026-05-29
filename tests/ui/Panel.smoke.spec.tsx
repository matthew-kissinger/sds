/** @vitest-environment jsdom */
/**
 * Cycle 47 P2: component-render smoke harness (Panel family).
 * Pins the glassmorphism container + title before the Phase 4 .tsx conversion.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { Panel, PanelTitle } from '../../js/components/ui/Panel';

afterEach(cleanup);

describe('Panel (smoke)', () => {
    it('wraps children in a .ui-panel container', () => {
        const { container } = render(
            <Panel><span>Body content</span></Panel>,
        );
        const panel = container.querySelector('.ui-panel');
        expect(panel).toBeTruthy();
        expect(panel?.textContent).toContain('Body content');
    });

    it('applies an extra className alongside .ui-panel', () => {
        const { container } = render(<Panel className="custom-x">x</Panel>);
        const panel = container.querySelector('.ui-panel');
        expect(panel?.classList.contains('custom-x')).toBe(true);
    });

    it('PanelTitle renders a level-2 heading', () => {
        render(<PanelTitle>Settings</PanelTitle>);
        const h2 = screen.getByRole('heading', { level: 2, name: 'Settings' });
        expect(h2.tagName).toBe('H2');
    });
});
