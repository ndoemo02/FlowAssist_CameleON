// P0.6 (plan v1.3.2, R5): ograniczony ruch. Każda gałąź kamery osiąga stan końcowy bez wygładzania; kąt i źródło
// `director` zachowują semantykę P3 (także okres łaski ręcznego suwaka), `stage` nie jest przepisywane; po przejściu
// rzeczywiście aktywuje się ScreenAnchor (nie tylko camera.angle).
// Kadr mierzymy śladem pozy kamery (dev-hook `window.__cameraTrace` w page.tsx: pozycja, target, FOV na klatkę).
// Test kontrolny bez ograniczonego ruchu dowodzi, że pomiar wykrywa wygładzanie.
import { expect, test, type Page } from '@playwright/test';
import { BACK, anchorState, dispatch, layoutCommand, openApp, seedWorkspace, setAngle, waitScreenMeshes } from './helpers';

type Cam = { angle: number; source: string; tween: unknown };
type AiUi = { getState(): { camera: Cam; stage: { focus: string } }; subscribe(fn: (s: { camera: Cam }, p: { camera: Cam }) => void): () => void };
const camera = (page: Page) => page.evaluate(() => (window as unknown as { __aiui: AiUi }).__aiui.getState().camera);
const near = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-6;

/** Zapisuje KAŻDĄ zmianę kąta w store (każdy krok tweenu) — niezależnie od liczby klatek (SwiftShader: kilka fps). */
async function recordAngles(page: Page) {
    await page.evaluate(() => {
        const w = window as unknown as { __angles: number[]; __aiui: AiUi };
        w.__angles = [];
        w.__aiui.subscribe((s, prev) => { if (s.camera.angle !== prev.camera.angle) w.__angles.push(s.camera.angle); });
    });
}
const angles = (page: Page) => page.evaluate(() => (window as unknown as { __angles: number[] }).__angles);

/** Ślad pozy kamery: start, potem `frames` klatek; zwraca liczbę zmian kadru między kolejnymi klatkami. */
async function startTrace(page: Page) {
    await page.evaluate(() => { (window as unknown as { __cameraTrace: number[][] }).__cameraTrace = []; });
}
async function traceChanges(page: Page, frames: number) {
    await expect.poll(() => page.evaluate(() => (window as unknown as { __cameraTrace: number[][] }).__cameraTrace.length),
        { timeout: 60_000 }).toBeGreaterThanOrEqual(frames);
    const trace = await page.evaluate(() => (window as unknown as { __cameraTrace: number[][] }).__cameraTrace);
    let changes = 0;
    for (let i = 1; i < trace.length; i++) if (trace[i].some((v, k) => Math.abs(v - trace[i - 1][k]) > 1e-6)) changes++;
    return changes;
}
const FRAMES = 10;

test.describe('ograniczony ruch (prefers-reduced-motion: reduce)', () => {
    test.use({ reducedMotion: 'reduce' });

    test('director Back → Front: kąt bez stanów pośrednich, kadr skacze (≤ 2 zmiany), potem aktywna kotwica', async ({ page }) => {
        await openApp(page);
        await seedWorkspace(page);
        await waitScreenMeshes(page);
        await setAngle(page, BACK);
        await recordAngles(page);
        await startTrace(page);
        await layoutCommand(page, { type: 'toScreen', id: 'chart' }); // jawne „na ekran”: P3 zawsze przenosi kamerę (director)
        await expect.poll(async () => (await camera(page)).tween, { timeout: 30_000 }).toBeNull();
        const steps = await angles(page);
        const intermediate = steps.filter((a) => !near(a, BACK) && !near(a, 0));
        expect(intermediate, `kąty pośrednie: ${intermediate.slice(0, 5).join(', ')}`).toEqual([]);
        expect(await camera(page)).toMatchObject({ source: 'director', tween: null });
        expect(await traceChanges(page, FRAMES)).toBeLessThanOrEqual(2); // orbita → cinematic: pozycja, target, FOV od razu
        await expect.poll(async () => (await anchorState(page))?.active, { timeout: 30_000 }).toBe(true);
        await expect(page.getByRole('region', { name: 'Ekran: Element chart' })).toBeVisible();
    });

    test('okres łaski P3: stage.focus agenta zaraz po ręcznym suwaku nie rusza kamery ani stage', async ({ page }) => {
        await openApp(page);
        await seedWorkspace(page);
        await setAngle(page, BACK); // ręczny suwak (MANUAL_GRACE_MS liczony od tej chwili)
        const before = await page.evaluate(() => (window as unknown as { __aiui: AiUi }).__aiui.getState().stage.focus);
        await dispatch(page, { stage: { focus: before === 'front' ? 'back' : 'front' } });
        await page.waitForTimeout(400);
        const cam = await camera(page);
        expect(cam.source).toBe('manual');
        expect(near(cam.angle, BACK)).toBe(true);
        expect(cam.tween).toBeNull();
        expect(await page.evaluate(() => (window as unknown as { __aiui: AiUi }).__aiui.getState().stage.focus)).toBe(before);
    });

    test('scroll do „close” → Back → Front → powrót na górę: kadr skacze (≤ 2 zmiany), kotwica aktywna', async ({ page }) => {
        await openApp(page);
        await seedWorkspace(page);
        await waitScreenMeshes(page);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        await setAngle(page, BACK);
        await layoutCommand(page, { type: 'toScreen', id: 'chart' });
        await expect.poll(async () => (await camera(page)).tween, { timeout: 30_000 }).toBeNull();
        await startTrace(page);
        await page.evaluate(() => window.scrollTo(0, 0)); // „close” → wide
        expect(await traceChanges(page, FRAMES)).toBeLessThanOrEqual(2);
        await expect.poll(async () => (await anchorState(page))?.active, { timeout: 30_000 }).toBe(true);
    });

    test('po intro kadr nie dojeżdża (intro → wide od razu)', async ({ page }) => {
        await openApp(page);
        await startTrace(page);
        expect(await traceChanges(page, FRAMES)).toBeLessThanOrEqual(1);
    });
});

// Kontrola pomiaru: przy zwykłym ruchu ta sama sekwencja daje wiele zmian kadru (wygładzanie) — inaczej testy wyżej
// niczego by nie dowodziły.
test.describe('kontrola pomiaru (prefers-reduced-motion: no-preference)', () => {
    test.use({ reducedMotion: 'no-preference' });

    test('director Back → Front przy zwykłym ruchu: kadr wygładzany (> 2 zmiany)', async ({ page }) => {
        await openApp(page);
        await seedWorkspace(page);
        await setAngle(page, BACK);
        await startTrace(page);
        await layoutCommand(page, { type: 'toScreen', id: 'chart' });
        expect(await traceChanges(page, FRAMES)).toBeGreaterThan(2);
    });
});

// P0.6: przy ograniczonym ruchu nie ma okna „w trakcie tweenu”, więc ręczne przerwanie sprawdzamy okresem łaski (wyżej).
// Zachowujemy też przypadek z jednego zadania JS (kontrakt kernela, niezależny od ruchu).
test('ręczny suwak tuż po poleceniu director wygrywa (P3, kernel)', async ({ page }) => {
    await openApp(page);
    await seedWorkspace(page);
    await setAngle(page, BACK);
    await page.evaluate(() => {
        const s = (window as unknown as { __aiui: { getState(): { layoutCommand(c: unknown): void; setAngle(a: number, src: string): void } } }).__aiui.getState();
        s.layoutCommand({ type: 'toScreen', id: 'chart' });
        s.setAngle(1.2, 'manual');
    });
    await page.waitForTimeout(500);
    const cam = await camera(page);
    expect(cam.source).toBe('manual');
    expect(near(cam.angle, 1.2)).toBe(true);
});
