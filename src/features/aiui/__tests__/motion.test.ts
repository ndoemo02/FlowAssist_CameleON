// P0.6 (plan v1.3.2, R5): ograniczony ruch — każda gałąź kamery osiąga stan końcowy bez wygładzania.
// Kąt i źródło `director` zachowują semantykę P3 (kernel store.ts bez zmian: page.tsx podaje tickCamera cały czas tweenu).

import { afterEach, describe, expect, it } from 'vitest';
import { cameraTickSeconds, entryProgress, smoothing } from '../motion';
import { TWEEN_SECONDS, useAiUi } from '../store';
import { FOCUS_ANGLE } from '../slots';

afterEach(() => useAiUi.getState().stopScenario());

describe('współczynniki ruchu kamery', () => {
    it('wygładzanie: zwykły ruch 1 - e^(-delta·k), ograniczony ruch 1 (stan końcowy w klatce)', () => {
        expect(smoothing(1 / 60, 4.8, false)).toBeCloseTo(1 - Math.exp(-4.8 / 60), 12);
        expect(smoothing(1 / 60, 4.8, true)).toBe(1);
    });

    it('krok tweenu kąta: zwykły ruch = delta, ograniczony ruch = cały czas tweenu', () => {
        expect(cameraTickSeconds(1 / 60, false)).toBe(1 / 60);
        expect(cameraTickSeconds(1 / 60, true)).toBe(TWEEN_SECONDS);
    });

    it('dojazd intro → wide: zwykły ruch wygładzony w czasie, ograniczony ruch od razu 1; podczas intro zawsze 0', () => {
        expect(entryProgress({ introActive: false, elapsed: 0.5, reduced: false })).toBeGreaterThan(0);
        expect(entryProgress({ introActive: false, elapsed: 0.5, reduced: false })).toBeLessThan(1);
        expect(entryProgress({ introActive: false, elapsed: 0, reduced: true })).toBe(1);
        expect(entryProgress({ introActive: true, elapsed: 5, reduced: true })).toBe(0);
    });
});

describe('ograniczony ruch a semantyka P3 (kernel bez zmian)', () => {
    it('tween director kończy się w jednej klatce z cameraTickSeconds(reduced); źródło zostaje director', () => {
        const s = useAiUi.getState();
        s.setSceneReady();
        s.startScenario('test'); // startScenario: tweenTo(Front) — od kąta 0, więc dokładamy ruch na Back
        useAiUi.setState({ camera: { angle: 0, source: 'director', tween: { from: 0, to: FOCUS_ANGLE.back, t: 0 } } });
        useAiUi.getState().tickCamera(cameraTickSeconds(1 / 60, true));
        expect(useAiUi.getState().camera).toMatchObject({ angle: FOCUS_ANGLE.back, source: 'director', tween: null });
    });

    it('kontrakt z kernelem: tickCamera(TWEEN_SECONDS) bez tweenu nie zmienia stanu kamery', () => {
        useAiUi.setState({ camera: { angle: 1.2, source: 'manual', tween: null } });
        const before = useAiUi.getState().camera;
        useAiUi.getState().tickCamera(cameraTickSeconds(1 / 60, true));
        expect(useAiUi.getState().camera).toBe(before);
    });

    it('zwykły ruch: po jednej klatce kąt pośredni (kontrola, że test powyżej coś mierzy)', () => {
        useAiUi.setState({ camera: { angle: 0, source: 'director', tween: { from: 0, to: FOCUS_ANGLE.back, t: 0 } } });
        useAiUi.getState().tickCamera(cameraTickSeconds(1 / 60, false));
        const { angle, tween } = useAiUi.getState().camera;
        expect(tween).not.toBeNull();
        expect(angle).toBeGreaterThan(0);
        expect(angle).toBeLessThan(FOCUS_ANGLE.back);
    });
});
