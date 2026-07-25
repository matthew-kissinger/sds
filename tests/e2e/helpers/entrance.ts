// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 113 Phase 3: shared driving for the One Door entrance.
 *
 * Three specs each carried their own copy of "click Next world N times, then
 * click the Classic chip, then Play". Two of the three N tables were stale:
 * they still counted from the Rolling Hills landing after D5 moved the default
 * to Home Field, and because both are @local-only nothing in CI ever ran them
 * to find out. Counting clicks encodes the carousel's order as a magic number
 * in three files; naming the world encodes what the spec actually means.
 *
 * The rung moved too. D3 collapses mode, difficulty and dog behind one summary
 * line, so a rung is no longer on the surface to be clicked; `pickRung` opens
 * the picker first and knows about D7's "three rungs plus More".
 */
import { expect, type Page } from '@playwright/test';

/** Upper bound on arrow presses. The carousel is four worlds; eight is two laps. */
const MAX_STEPS = 8;

/**
 * Arm the world whose name starts with `name`, by pressing the edge arrow until
 * the panel agrees. Prefix rather than exact match: a gated world's title also
 * carries a "Coming soon" badge.
 *
 * dispatchEvent('click') rather than click() throughout, matching the existing
 * specs: it sidesteps the hover-transform stability issue documented in
 * smoke.spec.ts.
 */
export async function armWorld(page: Page, name: string): Promise<void> {
    const next = page.getByRole('button', { name: /Next world/i });
    await expect(next).toBeVisible({ timeout: 30_000 });
    const armed = page.locator('#react-overlay .sds-ent-world-name');
    await expect(armed).toBeVisible({ timeout: 30_000 });

    for (let i = 0; i < MAX_STEPS; i++) {
        if ((await armed.textContent())?.trim().startsWith(name)) return;
        await next.dispatchEvent('click');
        await page.waitForTimeout(150);
    }
    // Fall through to a real assertion so the failure names the world.
    await expect(armed).toContainText(name, { timeout: 5_000 });
}

/** True once the summary line has the picker open. */
async function pickerOpen(page: Page): Promise<boolean> {
    return (await page.locator('#react-overlay .sds-ent-summary').getAttribute('aria-expanded')) === 'true';
}

/** Open or close the one question. */
export async function togglePicker(page: Page): Promise<void> {
    const summary = page.locator('#react-overlay .sds-ent-summary');
    await expect(summary).toBeVisible({ timeout: 15_000 });
    await summary.dispatchEvent('click');
}

/**
 * Select a difficulty rung by its accessible name (for example /Classic\s+\d/),
 * opening the picker and expanding past "More" as needed, then close the picker
 * again so the panel is back to its collapsed height.
 */
export async function pickRung(page: Page, rung: RegExp): Promise<void> {
    if (!(await pickerOpen(page))) await togglePicker(page);

    const rungs = page.locator('#react-overlay .sds-ent-rungs');
    await expect(rungs).toBeVisible({ timeout: 15_000 });

    let target = rungs.getByRole('button', { name: rung });
    if (!(await target.isVisible().catch(() => false))) {
        // D7 keeps three rungs on the surface; the rest are behind More.
        const more = rungs.getByRole('button', { name: /Show \d+ more/ });
        if (await more.isVisible().catch(() => false)) {
            await more.dispatchEvent('click');
            await page.waitForTimeout(100);
            target = rungs.getByRole('button', { name: rung });
        }
    }
    await expect(target).toBeVisible({ timeout: 10_000 });
    await target.dispatchEvent('click');

    if (await pickerOpen(page)) await togglePicker(page);
}

/** The one primary action. */
export async function clickPlay(page: Page): Promise<void> {
    const play = page.getByRole('button', { name: 'Play', exact: true });
    await expect(play).toBeVisible({ timeout: 15_000 });
    await play.dispatchEvent('click');
}

/** Arm a world, pick a rung, and commit. The whole entrance in one call. */
export async function startSolo(page: Page, world: string, rung: RegExp = /Classic\s+\d/i): Promise<void> {
    await armWorld(page, world);
    await pickRung(page, rung);
    await clickPlay(page);
}
