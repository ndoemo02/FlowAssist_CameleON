// Wspólne kroki e2e: gotowość sceny, seed stołu przez window.__aiui (bez mocka i jego osi czasu),
// sterowanie kamerą i odczyt stanu. Testy czytają stan i DOM — nie posiadają stanu aplikacji.

import type { Page } from '@playwright/test';

type Layout = Record<string, { presentation: string; x: number; y: number; z: number; scale: number; rev: number; instance: number }>;

export const BACK = Math.PI;
const V = 'v0.9.1';

export const CHART = { kind: 'line', series: [{ label: '2026', points: [{ x: 'Q1', y: 1 }, { x: 'Q2', y: 3 }, { x: 'Q3', y: 2 }] }] };
export const KPIS = { items: [{ title: 'Wzrost', value: '+18%', delta: 'up' }] };
export const TABLE = { columns: ['Dzielnica', 'Zapytania'], rows: [['Mokotów', 120], ['Wola', 80]] };

export const item = (id: string, kind: string, rep: string, priority: number, extra: Record<string, unknown> = {}) => ({
    id, component: 'WorkspaceItem', kind, title: `Element ${id}`, content: { path: `/items/${id}` },
    representations: [rep], presentation: 'card', priority, ...extra,
});

/** Otwiera aplikację i czeka na gotowość sceny (koniec intro → scene.ready) oraz rejestr meshy ekranu. */
export async function openApp(page: Page) {
    await page.goto('/');
    await page.waitForFunction(() => {
        const w = window as unknown as { __aiui?: { getState(): { scene: { ready: boolean } } } };
        return Boolean(w.__aiui?.getState().scene.ready);
    }, undefined, { timeout: 90_000 });
}

/** Czeka, aż Canvas zarejestruje meshe ekranu (potrzebne ScreenAnchor). */
export async function waitScreenMeshes(page: Page) {
    await page.waitForFunction(() => {
        const r = (window as unknown as { __anchorRegistry?: { getScreenMeshes(): { meshes: unknown[] } } }).__anchorRegistry;
        return Boolean(r && r.getScreenMeshes().meshes.length > 0);
    }, undefined, { timeout: 90_000 });
}

/** Stan ScreenAnchor (dev-hook). */
export async function anchorState(page: Page) {
    return page.evaluate(() => (window as unknown as {
        __anchorRegistry: { getAnchorState(): { active: boolean; angleDeg: number; coverage: number; mode: string; reason: string } | null };
    }).__anchorRegistry.getAnchorState());
}

/**
 * Punkt w karcie, w którym hit-test faktycznie trafia w kartę (elementFromPoint). Testy LOGIKI gestów nie mogą
 * zależeć od znanego problemu trafień w kontenerze 3D stołu (E2E-1, test w a11y-hit.spec).
 */
export async function hittablePoint(page: Page, cardName: string) {
    const card = page.getByRole('article', { name: cardName });
    const box = (await card.boundingBox())!;
    const p = await page.evaluate(([x, y, w, h, name]) => {
        for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7, 0.45, 0.55, 0.35, 0.65]) {
            for (const fx of [0.5, 0.3, 0.7]) {
                const px = x + w * fx, py = y + h * fy;
                const el = document.elementFromPoint(px, py);
                // punkt na karcie, ale nie na kontrolce (data-nodrag)
                if (el?.closest('article')?.getAttribute('aria-label') === name && !el.closest('[data-nodrag]')) return { x: px, y: py };
            }
        }
        return null;
    }, [box.x, box.y, box.width, box.height, cardName] as const);
    if (!p) throw new Error(`Brak trafialnego punktu w karcie "${cardName}"`);
    return p;
}

/** Zdarzenie agenta przez koordynator (bez runId — poza przebiegiem mocka). */
export async function dispatch(page: Page, event: unknown) {
    await page.evaluate((e) => (window as unknown as { __aiui: { getState(): { dispatch(raw: unknown): void } } }).__aiui.getState().dispatch(e), event);
}

/** Stół z trzema elementami (wykres, KPI, tabela) i danymi. */
export async function seedWorkspace(page: Page) {
    await dispatch(page, { version: V, createSurface: { surfaceId: 'workspace', catalogId: 'flowassist/v2' } });
    await dispatch(page, { version: V, updateComponents: { surfaceId: 'workspace', components: [
        { id: 'root', component: 'Workspace', children: ['chart', 'kpis', 'table'] },
        item('chart', 'chart', 'chart2d', 1, { actions: [{ name: 'deepen', label: 'Pogłęb' }] }),
        item('kpis', 'kpi', 'cards2d', 2),
        item('table', 'table', 'table2d', 3),
    ] } });
    for (const [id, value] of [['chart', CHART], ['kpis', KPIS], ['table', TABLE]] as const) {
        await dispatch(page, { version: V, updateDataModel: { surfaceId: 'workspace', path: `/items/${id}`, value } });
    }
}

/** Ustawia kąt kamery ręcznie (jak suwak 360°) i czeka na przerysowanie. */
export async function setAngle(page: Page, angle: number) {
    await page.evaluate((a) => (window as unknown as { __aiui: { getState(): { setAngle(a: number, s: 'manual'): void } } }).__aiui.getState().setAngle(a, 'manual'), angle);
    await page.waitForTimeout(300); // przejście opacity warstw (200 ms)
}

export async function layout(page: Page): Promise<Layout> {
    return page.evaluate(() => (window as unknown as { __aiui: { getState(): { layout: Layout } } }).__aiui.getState().layout);
}

export async function layoutCommand(page: Page, cmd: Record<string, unknown>) {
    await page.evaluate((c) => (window as unknown as { __aiui: { getState(): { layoutCommand(c: unknown): void } } }).__aiui.getState().layoutCommand(c), cmd);
}

/** Licznik zapisów `layout` w store (subskrypcja w stronie) — do weryfikacji „brak zapisów w trakcie gestu”. */
export async function countLayoutWrites(page: Page) {
    await page.evaluate(() => {
        const w = window as unknown as { __aiui: { subscribe(fn: (s: { layout: unknown }, p: { layout: unknown }) => void): () => void }; __layoutWrites: number; __unsubWrites?: () => void };
        w.__unsubWrites?.();
        w.__layoutWrites = 0;
        w.__unsubWrites = w.__aiui.subscribe((s, p) => { if (s.layout !== p.layout) w.__layoutWrites++; });
    });
    return () => page.evaluate(() => (window as unknown as { __layoutWrites: number }).__layoutWrites);
}
