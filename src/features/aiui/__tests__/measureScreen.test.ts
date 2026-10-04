import { describe, expect, it } from 'vitest';
import { GATE, measureScreen, type ProjectedPoint } from '../scene/measureScreen';
import { dollyAlongView, focusDistance, frontDollyFactor, FRONT_REF_ASPECT } from '../scene/frontFit';

const VIEW = { x: 0, y: 0, w: 1000, h: 600 };
const CANVAS = { width: 1000, height: 600 };

/** Syntetyczny zakrzywiony ekran: górna krawędź wygięta w dół w środku (łuk), dolna w górę. */
function curvedScreen(cx = 500, cy = 300, w = 600, h = 300, bow = 20, shiftX = 0): ProjectedPoint[] {
    const pts: ProjectedPoint[] = [];
    for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const x = cx - w / 2 + t * w + shiftX;
        const sag = Math.sin(Math.PI * t) * bow;
        pts.push({ x, y: cy - h / 2 + sag, inFront: true, edge: 'top' });
        pts.push({ x, y: cy + h / 2 - sag, inFront: true, edge: 'bottom' });
    }
    for (let j = 1; j < 10; j++) {
        const y = cy - h / 2 + (j / 10) * h;
        pts.push({ x: cx - w / 2 + shiftX, y, inFront: true, edge: null });
        pts.push({ x: cx + w / 2 + shiftX, y, inFront: true, edge: null });
    }
    return pts;
}

describe('measureScreen: geometria', () => {
    it('wpisuje prostokąt pomiędzy łuki górnej i dolnej krawędzi', () => {
        const m = measureScreen(curvedScreen(), VIEW, CANVAS, 0);
        expect(m.active).toBe(true);
        expect(m.outer).toMatchObject({ x: 200, y: 150, w: 600, h: 300 });
        expect(m.inner!.y).toBeGreaterThan(170);
        expect(m.inner!.h).toBeCloseTo(260 * 0.96, 0);
        // w całości w kadrze → panel = inner
        for (const k of ['x', 'y', 'w', 'h'] as const) expect(m.panel![k]).toBeCloseTo(m.inner![k], 6);
        expect(m.coverage).toBeCloseTo(1, 6);
    });

    it('panel jest przycięty do widocznego obszaru (z marginesem)', () => {
        const m = measureScreen(curvedScreen(500, 300, 600, 300, 20, 250), VIEW, CANVAS, 0); // inner do ~1038 px > okno
        expect(m.panel!.x + m.panel!.w).toBeLessThanOrEqual(1000 - GATE.viewportMargin);
        expect(m.inner!.x + m.inner!.w).toBeGreaterThan(m.panel!.x + m.panel!.w);
    });

    it('nieaktywny, gdy którykolwiek punkt jest za kamerą', () => {
        const pts = curvedScreen();
        pts[3] = { ...pts[3], inFront: false };
        expect(measureScreen(pts, VIEW, CANVAS, 0)).toMatchObject({ active: false, reason: 'behind-camera' });
    });

    it('brak punktów lub zdegenerowany rzut', () => {
        expect(measureScreen([], VIEW, CANVAS, 0).reason).toBe('no-points');
        const flat: ProjectedPoint[] = [{ x: 1, y: 1, inFront: true, edge: 'top' }, { x: 1.2, y: 1, inFront: true, edge: 'bottom' }];
        expect(measureScreen(flat, VIEW, CANVAS, 0).reason).toBe('degenerate');
    });
});

describe('measureScreen: bramka z histerezą', () => {
    // inner ≈ 576 px szerokości; przesunięcie w prawo zmniejsza pokrycie
    const shifted = (shiftX: number) => curvedScreen(500, 300, 600, 300, 20, shiftX);

    it('pokrycie liczone od prostokąta wewnętrznego, nie od obrysu', () => {
        const m = measureScreen(shifted(250), VIEW, CANVAS, 0);
        // obrys 450..1050 (≈92% w oknie), ale inner przycięty do 992 px → pokrycie < 100%
        expect(m.visibleFraction).toBeGreaterThan(0.9);
        expect(m.coverage).toBeLessThan(1);
        expect(m.coverage).toBeGreaterThan(0.82);
        expect(m.active).toBe(true);
    });

    it('włącza się dopiero od progu ON, a wyłącza poniżej progu OFF', () => {
        // inner od 537 px: pokrycie (992-537)/576 ≈ 0.79 — pomiędzy OFF (0.75) a ON (0.82)
        const pts = shifted(325);
        const m0 = measureScreen(pts, VIEW, CANVAS, 0, false);
        expect(m0.coverage).toBeGreaterThan(GATE.coverageOff);
        expect(m0.coverage).toBeLessThan(GATE.coverageOn);
        expect(m0.active).toBe(false);                                  // nieaktywny → nie włącza się
        expect(measureScreen(pts, VIEW, CANVAS, 0, true).active).toBe(true); // aktywny → nie gaśnie
    });

    it('kąt: włączenie ≤ 16°, wyłączenie > 20°', () => {
        expect(measureScreen(curvedScreen(), VIEW, CANVAS, 18, false)).toMatchObject({ active: false, reason: 'angle' });
        expect(measureScreen(curvedScreen(), VIEW, CANVAS, 18, true).active).toBe(true);
        expect(measureScreen(curvedScreen(), VIEW, CANVAS, 21, true)).toMatchObject({ active: false, reason: 'angle' });
    });

    it('scroll: viewport przesunięty w dół zmniejsza pokrycie', () => {
        const m = measureScreen(curvedScreen(), { x: 0, y: 280, w: 1000, h: 600 }, CANVAS, 0);
        expect(m.coverage).toBeLessThan(GATE.coverageOn);
        expect(m.reason).toBe('offscreen');
    });

    it('pionowy lub wąski Canvas → tryb centered', () => {
        expect(measureScreen(curvedScreen(), VIEW, { width: 390, height: 844 }, 0)).toMatchObject({ mode: 'centered', active: false, reason: 'portrait' });
        expect(measureScreen(curvedScreen(), VIEW, { width: 580, height: 400 }, 0).mode).toBe('centered');
        expect(measureScreen(curvedScreen(), VIEW, { width: 844, height: 390 }, 0).mode).toBe('anchor');
    });
});

describe('frontFit', () => {
    it('bez zmian dla proporcji ≥ kalibracji', () => {
        expect(frontDollyFactor(FRONT_REF_ASPECT)).toBe(1);
        expect(frontDollyFactor(2.4)).toBe(1);
    });

    it('odsuwa kamerę proporcjonalnie dla węższych viewportów', () => {
        expect(frontDollyFactor(1.6)).toBeCloseTo(FRONT_REF_ASPECT / 1.6, 6);
        expect(frontDollyFactor(1024 / 768)).toBeGreaterThan(1.5);
    });

    it('focusDistance mierzy odległość wzdłuż osi widzenia', () => {
        expect(focusDistance([0, 0, 0], [10, 0, 0], [3, 5, 0])).toBeCloseTo(3, 6);
    });

    it('dollyAlongView skaluje odległość do ekranu, nie do celu', () => {
        // kamera w 0, cel w x=10, ekran w x=2.5: factor 2 → ekran ma być 5 od kamery → kamera w x=-2.5
        const p = dollyAlongView([0, 0, 0], [10, 0, 0], 2.5, 2);
        expect(p[0]).toBeCloseTo(-2.5, 6);
        expect(focusDistance(p, [10, 0, 0], [2.5, 0, 0])).toBeCloseTo(5, 6);
        expect(dollyAlongView([1, 1, 1], [2, 1, 1], 3, 1)).toEqual([1, 1, 1]);
    });
});
