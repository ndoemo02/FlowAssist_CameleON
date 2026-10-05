// ScreenAnchor w prawdziwej kamerze (desktop 1440×900): bramka z histerezą i inert panelu (ADR 0001, I8).
// Progi: włączenie kąt ≤ 16° i pokrycie ≥ 0,82; wyłączenie kąt > 20° lub pokrycie < 0,75.
import { expect, test } from '@playwright/test';
import { anchorState, layoutCommand, openApp, seedWorkspace, setAngle, waitScreenMeshes } from './helpers';

test('histereza kotwicy: ten sam kąt daje różny stan zależnie od kierunku; inert = !active', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'progi kotwicy dla viewportu desktop');
    await openApp(page);
    await seedWorkspace(page);
    await waitScreenMeshes(page);
    await layoutCommand(page, { type: 'toScreen', id: 'chart' });
    await setAngle(page, 0);
    await expect.poll(async () => (await anchorState(page))?.active, { timeout: 20_000 }).toBe(true);

    const sample = async (a: number) => {
        await setAngle(page, a);
        await page.waitForTimeout(900); // kamera dojeżdża tłumionym lerpem
        const s = (await anchorState(page))!;
        const inert = await page.getByRole('region', { name: /^Ekran:/, includeHidden: true }).evaluate((el) => (el as HTMLElement).inert);
        return { a, active: s.active, angleDeg: s.angleDeg, coverage: s.coverage, reason: s.reason, inert };
    };
    const out = [];
    for (const a of [0, 0.1, 0.2, 0.25, 0.3, 0.4, 0.5]) out.push(await sample(a));
    const back = [];
    for (const a of [0.4, 0.3, 0.25, 0.2, 0.1, 0]) back.push(await sample(a));

    for (const s of [...out, ...back]) {
        expect(s.inert, `inert przy ${s.a}`).toBe(!s.active);
        if (s.active) {
            expect(s.angleDeg, `aktywny przy ${s.a}`).toBeLessThanOrEqual(20);
            expect(s.coverage, `aktywny przy ${s.a}`).toBeGreaterThanOrEqual(0.75);
        } else {
            expect(['angle', 'offscreen']).toContain(s.reason);
        }
    }
    // histereza: 0,25 rad (≈14,3°, pokrycie ≈ 0,79 — między progami 0,75 i 0,82)
    expect(out.find((s) => s.a === 0.25)!.active).toBe(true);   // jadąc od Frontu: zostaje aktywny
    expect(back.find((s) => s.a === 0.25)!.active).toBe(false); // wracając: jeszcze nieaktywny
    expect(out.find((s) => s.a === 0.5)!.active).toBe(false);
    expect(back.find((s) => s.a === 0)!.active).toBe(true);
});
