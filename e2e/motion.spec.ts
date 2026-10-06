// P0.6 (plan v1.3.2, R5): ograniczony ruch. Każda gałąź kamery osiąga stan końcowy bez wygładzania; kąt i źródło
// `director` zachowują semantykę P3; po przejściu rzeczywiście aktywuje się ScreenAnchor (nie tylko camera.angle).
import { expect, test, type Page } from '@playwright/test';
import { BACK, anchorState, layoutCommand, openApp, seedWorkspace, setAngle, waitScreenMeshes } from './helpers';

test.use({ reducedMotion: 'reduce' });

type Cam = { angle: number; source: string; tween: unknown };
const camera = (page: Page) => page.evaluate(() =>
    (window as unknown as { __aiui: { getState(): { camera: Cam } } }).__aiui.getState().camera);

/**
 * Zapisuje KAŻDĄ zmianę kąta kamery w store (każdy krok tweenu), niezależnie od liczby klatek — SwiftShader rysuje
 * scenę w kilku klatkach na sekundę, więc próbkowanie rAF nie wystarcza.
 */
async function recordAngles(page: Page) {
    await page.evaluate(() => {
        const w = window as unknown as { __angles: number[]; __aiui: { subscribe(fn: (s: { camera: Cam }, p: { camera: Cam }) => void): () => void } };
        w.__angles = [];
        w.__aiui.subscribe((s, prev) => { if (s.camera.angle !== prev.camera.angle) w.__angles.push(s.camera.angle); });
    });
}
const sampled = (page: Page) => page.evaluate(() => (window as unknown as { __angles: number[] }).__angles);
const near = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-6;

test('director: tween kąta Back → Front bez stanów pośrednich; potem aktywna kotwica ekranu', async ({ page }) => {
    await openApp(page);
    await seedWorkspace(page);
    await waitScreenMeshes(page);
    await setAngle(page, BACK);
    await recordAngles(page);
    await layoutCommand(page, { type: 'toScreen', id: 'chart' }); // jawne „na ekran”: P3 zawsze przenosi kamerę (director)
    await expect.poll(async () => (await camera(page)).tween, { timeout: 30_000 }).toBeNull();
    const angles = await sampled(page);
    const intermediate = angles.filter((a) => !near(a, BACK) && !near(a, 0));
    expect(intermediate, `kąty pośrednie: ${intermediate.slice(0, 5).join(', ')}`).toEqual([]);
    expect(angles.some((a) => near(a, 0))).toBe(true);
    expect(await camera(page)).toMatchObject({ source: 'director', tween: null });
    await expect.poll(async () => (await anchorState(page))?.active, { timeout: 30_000 }).toBe(true);
    await expect(page.getByRole('region', { name: 'Ekran: Element chart' })).toBeVisible();
});

test('ręczne przerwanie: suwak tuż po poleceniu director wygrywa (P3), bez powrotu do celu tweenu', async ({ page }) => {
    await openApp(page);
    await seedWorkspace(page);
    await setAngle(page, BACK);
    await page.evaluate(() => {
        const s = (window as unknown as { __aiui: { getState(): { layoutCommand(c: unknown): void; setAngle(a: number, src: string): void } } }).__aiui.getState();
        s.layoutCommand({ type: 'toScreen', id: 'chart' }); // tween director na Front…
        s.setAngle(1.2, 'manual');                          // …i od razu ręczny suwak
    });
    await page.waitForTimeout(500);
    const cam = await camera(page);
    expect(cam.source).toBe('manual');
    expect(near(cam.angle, 1.2)).toBe(true);
    expect(cam.tween).toBeNull();
});

test('scroll do „close”, Back, Front i powrót na górę: kotwica ekranu aktywna', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'scroll strony steruje kadrem „close” — scenariusz desktopowy');
    await openApp(page);
    await seedWorkspace(page);
    await waitScreenMeshes(page);
    await page.mouse.wheel(0, 1200);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await setAngle(page, BACK);
    await layoutCommand(page, { type: 'toScreen', id: 'chart' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(async () => (await anchorState(page))?.active, { timeout: 30_000 }).toBe(true);
    expect(near((await camera(page)).angle, 0)).toBe(true);
});
