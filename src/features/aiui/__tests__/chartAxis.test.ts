// Review #1 (I10): oś wykresu liczona z danych agenta. Walidator przepuszcza każdą skończoną liczbę
// i dowolnie długą serię — oś musi to znieść bez wyjątku (inaczej render wywraca stronę).

import { describe, expect, it } from 'vitest';
import { chartAxis } from '../components/Chart';

const series = (ys: number[]) => [{ label: 'S', points: ys.map((y, i) => ({ x: i, y })) }];

describe('chartAxis: skrajne dane agenta', () => {
    it.each([1.7e308, Number.MAX_VALUE])('y = %s: skończone maksimum i skończona lista podziałek', (y) => {
        const axis = chartAxis(series([y]));
        expect(Number.isFinite(axis.maxY)).toBe(true);
        expect(axis.ticks.length).toBeLessThan(20);
        expect(axis.ticks.every(Number.isFinite)).toBe(true);
    });

    it('seria 200 000 punktów (powyżej limitu argumentów spreadu) nie rzuca', () => {
        const axis = chartAxis(series(new Array(200_000).fill(0).map((_, i) => i % 1000)));
        expect(axis.maxY).toBeGreaterThanOrEqual(999);
    });

    it('zwykłe dane: oś bez zmian (krok 1000, maksimum 3000 dla 2260)', () => {
        const axis = chartAxis(series([1240, 1510, 1980, 2260]));
        expect(axis).toEqual({ maxY: 3000, step: 1000, ticks: [0, 1000, 2000, 3000] });
    });
});
