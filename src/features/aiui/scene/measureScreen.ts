// Czysta geometria ScreenAnchor: z rzutów punktów ekranu (px Canvasu) wylicza obrys,
// prostokąt wpisany w zakrzywiony ekran, panel przycięty do widocznego obszaru oraz decyzję
// o aktywności (z histerezą). Bez Three.js — adapter sceny dostarcza tylko liczby.

/** Bramka (v1.2.1, po spike #1): pokrycie liczone od prostokąta wewnętrznego przyciętego do okna. */
export const GATE = {
    coverageOn: 0.82,    // włączenie: ≥ 82% prostokąta wewnętrznego w widocznym obszarze
    coverageOff: 0.75,   // wyłączenie: < 75% (histereza)
    angleOnDeg: 16,      // włączenie: kamera ≤ 16° od Frontu
    angleOffDeg: 20,     // wyłączenie: > 20° (histereza; zabezpieczenie — zwykle wcześniej decyduje pokrycie)
    minAspect: 1.2,      // węższy/pionowy Canvas → tryb centered (fallback)
    minWidth: 600,       // wąski Canvas → tryb centered
    viewportMargin: 8,   // px marginesu panelu od krawędzi okna
} as const;

const EDGE_EPS = 0.03; // tolerancja (ułamek szerokości obrysu) przy wyborze punktów lewej/prawej krawędzi
const INSET = 0.02;    // margines wewnątrz prostokąta wpisanego

export interface ProjectedPoint {
    x: number;           // px w układzie Canvasu
    y: number;
    inFront: boolean;    // punkt przed kamerą (z widoku < 0)
    edge: 'top' | 'bottom' | null; // klasyfikacja po świecie (pion Y), niezależna od perspektywy
}

export interface Rect { x: number; y: number; w: number; h: number }

export type AnchorMode = 'anchor' | 'centered';
export type AnchorReason = 'ok' | 'portrait' | 'behind-camera' | 'offscreen' | 'angle' | 'degenerate' | 'no-points';

export interface ScreenMeasure {
    mode: AnchorMode;
    active: boolean;            // panel przyklejony do ekranu jest widoczny i klikalny
    reason: AnchorReason;
    outer: Rect | null;         // obrys rzutu (diagnostyka)
    inner: Rect | null;         // prostokąt wpisany w ekran (pełny, może wychodzić poza okno)
    panel: Rect | null;         // inner ∩ widoczny obszar (z marginesem) — to dostaje DOM
    coverage: number;           // pole(panel) / pole(inner)
    visibleFraction: number;    // część obrysu w widocznym obszarze (diagnostyka)
    angleDeg: number;
}

/**
 * @param points     rzuty punktów ekranu
 * @param viewport   widoczny obszar w układzie Canvasu (okno ∩ Canvas, uwzględnia scroll)
 * @param canvas     rozmiar Canvasu (decyzja anchor/centered — niezależna od scrolla)
 * @param angleDeg   odległość kątowa kamery od Frontu (stopnie, ≥ 0)
 * @param wasActive  poprzedni stan (histereza)
 */
export function measureScreen(
    points: ProjectedPoint[],
    viewport: Rect,
    canvas: { width: number; height: number },
    angleDeg: number,
    wasActive = false,
): ScreenMeasure {
    const base = { outer: null, inner: null, panel: null, coverage: 0, visibleFraction: 0, angleDeg };

    if (canvas.width < GATE.minWidth || canvas.width / Math.max(1, canvas.height) < GATE.minAspect) {
        return { mode: 'centered', active: false, reason: 'portrait', ...base };
    }
    if (points.length === 0) return { mode: 'anchor', active: false, reason: 'no-points', ...base };
    for (const p of points) if (!p.inFront) return { mode: 'anchor', active: false, reason: 'behind-camera', ...base };

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    const outer = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    if (outer.w < 1 || outer.h < 1) return { mode: 'anchor', active: false, reason: 'degenerate', ...base };

    // Prostokąt wpisany: górna krawędź ekranu w rzucie jest łukiem — bierzemy jej najniższy punkt,
    // dolna — najwyższy; boki: najbardziej wewnętrzne punkty skrajnych kolumn.
    const eps = outer.w * EDGE_EPS;
    let top = -Infinity, bottom = Infinity, left = -Infinity, right = Infinity;
    for (const p of points) {
        if (p.edge === 'top' && p.y > top) top = p.y;
        if (p.edge === 'bottom' && p.y < bottom) bottom = p.y;
        if (p.x <= minX + eps && p.x > left) left = p.x;
        if (p.x >= maxX - eps && p.x < right) right = p.x;
    }
    if (!Number.isFinite(top)) top = minY;
    if (!Number.isFinite(bottom)) bottom = maxY;
    const visibleFraction = intersectionArea(outer, viewport) / (outer.w * outer.h);

    const rawW = right - left, rawH = bottom - top;
    if (rawW <= 4 || rawH <= 4) {
        return { mode: 'anchor', active: false, reason: 'degenerate', ...base, outer, visibleFraction };
    }
    const ix = rawW * INSET, iy = rawH * INSET;
    const inner = { x: left + ix, y: top + iy, w: rawW - 2 * ix, h: rawH - 2 * iy };

    const m = GATE.viewportMargin;
    const safe = { x: viewport.x + m, y: viewport.y + m, w: viewport.w - 2 * m, h: viewport.h - 2 * m };
    const panel = intersect(inner, safe);
    const coverage = panel ? (panel.w * panel.h) / (inner.w * inner.h) : 0;
    const result = { outer, inner, panel, coverage, visibleFraction, angleDeg };

    const angleLimit = wasActive ? GATE.angleOffDeg : GATE.angleOnDeg;
    const coverageMin = wasActive ? GATE.coverageOff : GATE.coverageOn;
    if (angleDeg > angleLimit) return { mode: 'anchor', active: false, reason: 'angle', ...result };
    if (coverage < coverageMin) return { mode: 'anchor', active: false, reason: 'offscreen', ...result };
    return { mode: 'anchor', active: true, reason: 'ok', ...result };
}

export function intersect(a: Rect, b: Rect): Rect | null {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
    return w > 0 && h > 0 ? { x, y, w, h } : null;
}

export function intersectionArea(a: Rect, b: Rect): number {
    const r = intersect(a, b);
    return r ? r.w * r.h : 0;
}
