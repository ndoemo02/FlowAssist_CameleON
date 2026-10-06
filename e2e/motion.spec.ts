// P0.6 (plan v1.3.2, R5): ograniczony ruch. Każda gałąź kamery osiąga stan końcowy bez wygładzania; kąt i źródło
// `director` zachowują semantykę P3 (także okres łaski ręcznego suwaka), `stage` nie jest przepisywane; po przejściu
// rzeczywiście aktywuje się ScreenAnchor (nie tylko camera.angle).
// Pomiar (review Astry P0.6): dev-hook `window.__cameraTrace` w page.tsx zapisuje w każdej klatce pozę faktyczną
// (pozycja, target, FOV) i pozę DOCELOWĄ bieżącej gałęzi (cinematic: intro/wide/close ze scrolla; orbit: wide obrócone).
// „Stan końcowy od razu” = w każdej klatce poza faktyczna = docelowa; przejście dodatkowo musi zmienić kadr (próbka
// sprzed bodźca jest gwarantowana). Poza docelowa zależy od dopasowania Frontu do ekranu (meshe rejestrują się
// asynchronicznie), więc porównanie w tej samej klatce jest odporne na ten czas. Test kontrolny bez ograniczonego ruchu
// dowodzi, że pomiar wykrywa wygładzanie.
import { expect, test, type Page } from '@playwright/test';
import { BACK, anchorState, dispatch, layoutCommand, openApp, seedWorkspace, setAngle, waitScreenMeshes } from './helpers';

type Cam = { angle: number; source: string; tween: unknown };
type AiUi = { getState(): { camera: Cam; stage: { focus: string } }; subscribe(fn: (s: { camera: Cam }, p: { camera: Cam }) => void): () => void };
type Sample = number[]; // [pozycja(3), target(3), fov] + opcjonalnie [docelowe: pozycja(3), target(3), fov]
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

const FRAMES = 10;
const traceLength = (page: Page) => page.evaluate(() => (window as unknown as { __cameraTrace: number[][] }).__cameraTrace.length);
/** Start śladu i co najmniej 2 klatki przed bodźcem (próbka „przed” jest gwarantowana). */
async function startTrace(page: Page) {
    await page.evaluate(() => { (window as unknown as { __cameraTrace: number[][] }).__cameraTrace = []; });
    await expect.poll(() => traceLength(page), { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
}
/** Czeka, aż ślad będzie miał `frames` klatek PO bieżącej długości, i zwraca cały ślad. */
async function readTrace(page: Page, frames = FRAMES): Promise<Sample[]> {
    const from = await traceLength(page);
    await expect.poll(() => traceLength(page), { timeout: 60_000 }).toBeGreaterThanOrEqual(from + frames);
    return page.evaluate(() => (window as unknown as { __cameraTrace: number[][] }).__cameraTrace);
}
const pose = (s: Sample) => s.slice(0, 7);
const samePose = (a: number[], b: number[], eps = 1e-6) => a.every((v, k) => Math.abs(v - b[k]) <= eps);
const changes = (trace: Sample[]) => trace.slice(1).filter((s, i) => !samePose(pose(s), pose(trace[i]))).length;
/** Klatki, w których kamera NIE jest w pozie docelowej swojej gałęzi (wygładzanie = dojazd przez kilka klatek). */
const offTarget = (trace: Sample[]) => trace.filter((s) => s.length === 14 && !samePose(s.slice(0, 7), s.slice(7), 1e-4)).length;
const withTarget = (trace: Sample[]) => trace.filter((s) => s.length === 14).length;
/** Ograniczony ruch: w każdej klatce poza faktyczna = docelowa; przejście (`changed`) zmienia kadr. */
function expectEndStateEveryFrame(trace: Sample[], changed: boolean) {
    expect(withTarget(trace), 'brak klatek z pozą docelową gałęzi').toBeGreaterThan(0);
    expect(offTarget(trace), 'klatki poza stanem końcowym (wygładzanie)').toBe(0);
    if (changed) expect(changes(trace), 'kadr się nie zmienił').toBeGreaterThanOrEqual(1);
}

/** Ślad pozy galaktyki w tle (dev-hook `window.__galaxyTrace` w StarField): liczba zmian między klatkami. */
async function galaxyChanges(page: Page, frames: number) {
    await page.evaluate(() => { (window as unknown as { __galaxyTrace: number[][] }).__galaxyTrace = []; });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __galaxyTrace: number[][] }).__galaxyTrace.length),
        { timeout: 60_000 }).toBeGreaterThanOrEqual(frames);
    const trace = await page.evaluate(() => (window as unknown as { __galaxyTrace: number[][] }).__galaxyTrace);
    return trace.slice(1).filter((s, i) => !samePose(s, trace[i], 1e-9)).length;
}

test.describe('ograniczony ruch (prefers-reduced-motion: reduce)', () => {
    test.use({ reducedMotion: 'reduce' });

    test('director Back → Front: kąt bez stanów pośrednich, kadr od razu w stanie końcowym, potem aktywna kotwica', async ({ page }) => {
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
        expectEndStateEveryFrame(await readTrace(page), true);
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

    test('scroll do „close” → Back (orbita) → Front → góra: każde przejście od razu w stanie końcowym, kotwica aktywna', async ({ page }) => {
        await openApp(page);
        await seedWorkspace(page);
        await waitScreenMeshes(page);
        // wide → „close” (cinematic, scroll)
        await startTrace(page);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        expectEndStateEveryFrame(await readTrace(page), true);
        // „close” → Back: powrót do orbity (gałąź orbit)
        await startTrace(page);
        await setAngle(page, BACK);
        expectEndStateEveryFrame(await readTrace(page), true);
        // Front (nadal przewinięte = „close”), potem powrót na górę: „close” → wide
        await layoutCommand(page, { type: 'toScreen', id: 'chart' });
        await expect.poll(async () => (await camera(page)).tween, { timeout: 30_000 }).toBeNull();
        await startTrace(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        expectEndStateEveryFrame(await readTrace(page), true);
        await expect.poll(async () => (await anchorState(page))?.active, { timeout: 30_000 }).toBe(true);
    });

    test('po intro kadr od razu w stanie końcowym (bez dojazdu intro → wide)', async ({ page }) => {
        await openApp(page);
        await startTrace(page);
        expectEndStateEveryFrame(await readTrace(page), false);
    });

    // decyzja właściciela 2026-10-06: poza overlayem wyłączamy tylko ruch gwiazd / galaktyki
    test('galaktyka w tle stoi (bez obrotu i „oddychania” skali)', async ({ page }) => {
        await openApp(page);
        expect(await galaxyChanges(page, 6)).toBe(0);
    });
});

// Kontrola pomiaru: przy zwykłym ruchu te same sekwencje dają klatki poza stanem końcowym (dojazd) — inaczej testy
// wyżej niczego by nie dowodziły.
test.describe('kontrola pomiaru (prefers-reduced-motion: no-preference)', () => {
    test.use({ reducedMotion: 'no-preference' });

    test('director Back → Front przy zwykłym ruchu: klatki poza stanem końcowym (wygładzanie)', async ({ page }) => {
        await openApp(page);
        await seedWorkspace(page);
        await setAngle(page, BACK);
        await startTrace(page);
        await layoutCommand(page, { type: 'toScreen', id: 'chart' });
        const trace = await readTrace(page);
        expect(offTarget(trace)).toBeGreaterThan(0);
        expect(changes(trace)).toBeGreaterThan(2);
    });

    test('galaktyka przy zwykłym ruchu się obraca', async ({ page }) => {
        await openApp(page);
        expect(await galaxyChanges(page, 6)).toBeGreaterThan(0);
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
