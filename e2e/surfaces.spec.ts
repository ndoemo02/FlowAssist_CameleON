// Powierzchnie Front / Back / HUD: widoczność, inert + aria-hidden, fokus przy zmianie kąta (ADR 0001: I8, I9).
import { expect, test } from '@playwright/test';
import { BACK, anchorState, dispatch, layoutCommand, openApp, seedWorkspace, setAngle, waitScreenMeshes } from './helpers';

test('stół aktywny tylko z Back: inert + aria-hidden z Frontu, fokus zdejmowany przy obrocie', async ({ page }) => {
    await openApp(page);
    await seedWorkspace(page);
    const table = page.getByRole('region', { name: 'Stół roboczy', includeHidden: true });

    await test.step('Front: stół niewidoczny i wyłączony z Tab', async () => {
        await setAngle(page, 0);
        await expect(table).toBeHidden();
        await expect(table).toHaveAttribute('aria-hidden', 'true');
        expect(await table.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
    });

    await test.step('Back: stół widoczny, trzy karty, aktywny', async () => {
        await setAngle(page, BACK);
        await expect(table).toBeVisible();
        await expect(table).not.toHaveAttribute('aria-hidden');
        expect(await table.evaluate((el) => (el as HTMLElement).inert)).toBe(false);
        await expect(table.getByRole('article')).toHaveCount(3);
    });

    await test.step('obrót na Front z fokusem na karcie: fokus opuszcza stół (Astra #7)', async () => {
        const card = page.getByRole('article', { name: 'Element kpis' });
        await card.focus();
        await expect(card).toBeFocused();
        await setAngle(page, 0);
        expect(await page.evaluate(() => Boolean(document.activeElement?.closest('section[aria-label="Stół roboczy"]')))).toBe(false);
    });

    await test.step('kolejność DOM kart = Workspace.children, niezależnie od x/y/z (ADR 0001, I1/P6)', async () => {
        await setAngle(page, BACK);
        await layoutCommand(page, { type: 'raise', id: 'chart' });
        await layoutCommand(page, { type: 'move', id: 'table', x: 0.1, y: 0.2, rev: 0, instance: (await page.evaluate(() =>
            (window as unknown as { __aiui: { getState(): { layout: Record<string, { instance: number }> } } }).__aiui.getState().layout.table.instance)) });
        const names = await table.getByRole('article').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
        expect(names).toEqual(['Element chart', 'Element kpis', 'Element table']);
    });
});

test('ekran: panel aktywny na Froncie, inert z Back', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'tryb kotwicy sprawdzany na desktopie; compact w compact.spec');
    await openApp(page);
    await seedWorkspace(page);
    await waitScreenMeshes(page);
    await layoutCommand(page, { type: 'toScreen', id: 'chart' });
    const panel = page.getByRole('region', { name: 'Ekran: Element chart', includeHidden: true });

    await test.step('Front: kotwica aktywna, panel klikalny i poza inert', async () => {
        await expect.poll(async () => (await anchorState(page))?.active, { timeout: 20_000 }).toBe(true);
        await expect(panel).toBeVisible();
        expect(await panel.evaluate((el) => (el as HTMLElement).inert)).toBe(false);
    });

    await test.step('Back: kotwica nieaktywna, panel inert + aria-hidden', async () => {
        await setAngle(page, BACK);
        await expect.poll(async () => (await anchorState(page))?.active, { timeout: 20_000 }).toBe(false);
        await expect(panel).toHaveAttribute('aria-hidden', 'true');
        expect(await panel.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
    });
});

test('HUD: decyzja widoczna niezależnie od kąta kamery', async ({ page }) => {
    await openApp(page);
    await dispatch(page, { version: 'v0.9.1', createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
    await dispatch(page, { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [
        { id: 'root', component: 'Approval', title: 'Pilotaż', summary: 'Opis decyzji', items: ['A', 'B'] },
    ] } });
    const hud = page.getByRole('complementary', { name: 'Decyzja' });
    for (const angle of [0, BACK, Math.PI / 2]) {
        await setAngle(page, angle);
        await expect(hud).toBeVisible();
        await expect(hud).toContainText('Pilotaż');
    }
});

// P0.5 krok 4: fokus znikającego elementu trafia na bezpieczny cel (kontener aktywnej warstwy), nie na <body>.
test('„Ukryj” z klawiatury na karcie z focusem: fokus na kontenerze stołu (Chromium, MutationObserver)', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'klawiatura i focus karty na desktopie; compact: przewijanie paska zmienia kadr');
    await openApp(page);
    await seedWorkspace(page);
    await setAngle(page, BACK);
    await layoutCommand(page, { type: 'focus', id: 'kpis' });
    const hide = page.getByRole('article', { name: 'Element kpis' }).getByRole('button', { name: 'Ukryj' });
    await hide.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('article', { name: 'Element kpis' })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.focusLayer ?? null)).toBe('table');
    await expect(page.getByRole('status').filter({ hasText: 'Ukryto: Element kpis' })).toHaveCount(1);
});

// Review P0.5 (A11Y-1): klawiatura nie wprowadza karty w focus, więc kontrolki karty są widoczne przy fokusie klawiatury.
test('fokus klawiatury na karcie pokazuje kontrolki „−/+”; zmiana rozmiaru z klawiatury', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'compact ma kontrolki zawsze');
    await openApp(page);
    await seedWorkspace(page);
    await setAngle(page, BACK);
    const card = page.getByRole('article', { name: 'Element kpis' });
    const plus = card.getByRole('button', { name: 'Powiększ' });
    await expect(plus).toHaveCount(0);
    await card.focus();
    await expect(plus).toBeVisible();
    await plus.focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await page.evaluate(() =>
        (window as unknown as { __aiui: { getState(): { layout: Record<string, { scale: number; presentation: string }> } } }).__aiui.getState().layout.kpis))).toMatchObject({ presentation: 'card' });
    expect((await page.evaluate(() => (window as unknown as { __aiui: { getState(): { layout: Record<string, { scale: number }> } } }).__aiui.getState().layout.kpis.scale))).toBeGreaterThan(1);
});
