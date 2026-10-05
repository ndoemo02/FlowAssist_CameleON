// Cykl przebiegu w UI (ADR 0001, I6): stary przebieg i ruch po stanie terminalnym nie zmieniają interfejsu.
import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

type Api = { __aiui: { getState(): {
    scenario: { runId: number; status: string };
    startScenario(id: string): boolean;
    stopScenario(): void;
    transportDispatch(raw: unknown, runId: number): void;
    receiveStatus(runId: number, status: string): void;
} } };

test('stary przebieg i ruch po done są ignorowane w UI', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'logika niezależna od viewportu');
    await openApp(page);
    const hud = page.getByRole('complementary', { name: 'Decyzja' });
    const hudEvents = (runId: number) => page.evaluate((r) => {
        const s = (window as unknown as Api).__aiui.getState();
        s.transportDispatch({ version: 'v0.9.1', createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } }, r);
        s.transportDispatch({ version: 'v0.9.1', updateComponents: { surfaceId: 'hud', components: [{ id: 'root', component: 'Approval', title: 'Spóźnione', summary: 'x' }] } }, r);
    }, runId);

    // uwaga: getState() zwraca migawkę — runId czytamy PO akcji, nie z obiektu sprzed niej
    const run1 = await page.evaluate(() => { const api = (window as unknown as Api).__aiui; api.getState().startScenario('research'); return api.getState().scenario.runId; });
    expect(run1).toBeGreaterThan(0);
    await expect(page.getByText('agent pracuje…')).toBeVisible();

    await test.step('restart: zdarzenia z poprzedniego runId nie trafiają do UI', async () => {
        const run2 = await page.evaluate(() => { const api = (window as unknown as Api).__aiui; api.getState().startScenario('research'); return api.getState().scenario.runId; });
        expect(run2).toBe(run1 + 1);
        await hudEvents(run1);
        await page.waitForTimeout(300);
        await expect(hud).toHaveCount(0);
    });

    await test.step('done: status terminalny trwały, kolejne zdarzenia i statusy ignorowane', async () => {
        const run3 = await page.evaluate(() => {
            const api = (window as unknown as Api).__aiui;
            api.getState().startScenario('research');
            const r = api.getState().scenario.runId;
            api.getState().receiveStatus(r, 'done');
            api.getState().receiveStatus(r, 'running'); // po done ignorowane
            return r;
        });
        await expect(page.getByText('zakończone')).toBeVisible();
        await hudEvents(run3);
        await page.waitForTimeout(300);
        await expect(hud).toHaveCount(0);
        expect(await page.evaluate(() => (window as unknown as Api).__aiui.getState().scenario.status)).toBe('done');
    });
});
