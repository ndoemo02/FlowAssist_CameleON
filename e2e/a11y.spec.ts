// Skan axe-core warstwy AI-to-UI na stabilnych etapach (P0.1). Baseline: znane naruszenia są zapisane
// w e2e/__snapshots__; NOWE naruszenie (lub zmiana liczby węzłów) = czerwony test do przeglądu.
// Zakres: overlay CameleON (nie stara strona pod sceną). Axe nie zastępuje testów fokusu, gestów ani czytnika.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BACK, anchorState, dispatch, layoutCommand, openApp, seedWorkspace, setAngle, waitScreenMeshes } from './helpers';

const SCOPE = '[data-e2e-scope="aiui-overlay"]';

/** Oznacza korzeń overlayu (atrybut tylko w DOM testu) — zakres skanu. */
async function markOverlay(page: Page) {
    await page.evaluate(() => {
        const el = document.querySelector('section[aria-label="Stół roboczy"]')?.parentElement
            ?? document.querySelector('main div.pointer-events-none.absolute.inset-0.z-20');
        el?.setAttribute('data-e2e-scope', 'aiui-overlay');
    });
}

async function scan(page: Page) {
    await markOverlay(page);
    const t0 = Date.now();
    const r = await new AxeBuilder({ page }).include(SCOPE).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .options({ resultTypes: ['violations'] }) // tylko naruszenia — szybciej, ta sama lista reguł
        .analyze();
    test.info().annotations.push({ type: 'axe-ms', description: String(Date.now() - t0) });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })).sort((a, b) => a.id.localeCompare(b.id));
}

test('axe: overlay na etapach Back / Front z ekranem / HUD', async ({ page }) => {
    await openApp(page);
    await seedWorkspace(page);

    await setAngle(page, BACK);
    const back = await scan(page);

    // stabilny etap Front: meshe ekranu zarejestrowane i kotwica aktywna (inaczej panel bywa jeszcze ukryty
    // i axe go pomija — niedeterministyczny baseline)
    await waitScreenMeshes(page);
    await layoutCommand(page, { type: 'toScreen', id: 'chart' });
    await setAngle(page, 0);
    await expect.poll(async () => (await anchorState(page))?.active, { timeout: 30_000 }).toBe(true);
    await expect(page.getByRole('region', { name: 'Ekran: Element chart' })).toBeVisible();
    const front = await scan(page);

    await dispatch(page, { version: 'v0.9.1', createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
    await dispatch(page, { version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [
        { id: 'root', component: 'Approval', title: 'Pilotaż', summary: 'Opis decyzji', items: ['A'] },
    ] } });
    const decision = page.getByRole('complementary', { name: 'Decyzja' });
    // dispatchEvent zamiast click(): click() przewija przycisk do widoku, a przewinięcie strony uruchamia kadr
    // „close” kamery i wyłącza kotwicę ekranu (compact 390 px) — artefakt testu, nie zachowanie użytkownika
    await decision.getByRole('button').first().dispatchEvent('click');
    // rozwinięcie remountuje panel (AnimatePresence): czekamy na koniec animacji wyjścia — jeden landmark
    await expect(decision).toHaveCount(1);
    await expect(decision.getByRole('button', { name: 'Zwiń' })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect((await anchorState(page))?.active).toBe(true);
    const hud = await scan(page);

    expect(JSON.stringify({ back, front, hud }, null, 1) + '\n').toMatchSnapshot('axe-baseline.json');
});
