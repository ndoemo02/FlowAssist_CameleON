import { describe, expect, it } from 'vitest';
import { getAt, setAt } from '../jsonPointer';

describe('jsonPointer.getAt', () => {
    const doc = { tasks: { web: { progress: 0.5 } }, list: [10, 20], 'a/b': { '~x': 1 } };

    it('zwraca cały dokument dla "/" i ""', () => {
        expect(getAt(doc, '/')).toBe(doc);
        expect(getAt(doc, '')).toBe(doc);
    });

    it('czyta zagnieżdżone klucze i indeksy tablic', () => {
        expect(getAt(doc, '/tasks/web/progress')).toBe(0.5);
        expect(getAt(doc, '/list/1')).toBe(20);
    });

    it('obsługuje escape ~1 i ~0', () => {
        expect(getAt(doc, '/a~1b/~0x')).toBe(1);
    });

    it('zwraca undefined dla brakującej ścieżki', () => {
        expect(getAt(doc, '/tasks/nope/progress')).toBeUndefined();
        expect(getAt(doc, '/list/9')).toBeUndefined();
    });
});

describe('jsonPointer.setAt', () => {
    it('ustawia wartość niemutowalnie i zachowuje niezmienione gałęzie', () => {
        const doc = { tasks: { web: { progress: 0 } }, chart: { series: [] } };
        const next = setAt(doc, '/tasks/web/progress', 1) as typeof doc;
        expect(next.tasks.web.progress).toBe(1);
        expect(doc.tasks.web.progress).toBe(0);
        expect(next).not.toBe(doc);
        expect(next.chart).toBe(doc.chart);
    });

    it('tworzy brakujące obiekty pośrednie', () => {
        expect(setAt({}, '/tasks/data', { title: 'x' })).toEqual({ tasks: { data: { title: 'x' } } });
    });

    it('usuwa klucz, gdy value === undefined', () => {
        expect(setAt({ a: 1, b: 2 }, '/a', undefined)).toEqual({ b: 2 });
    });

    it('zastępuje cały dokument dla ścieżki "/"', () => {
        expect(setAt({ a: 1 }, '/', { b: 2 })).toEqual({ b: 2 });
        expect(setAt({ a: 1 }, '/', undefined)).toEqual({});
    });

    it('ustawia element tablicy', () => {
        expect(setAt({ list: [1, 2] }, '/list/0', 9)).toEqual({ list: [9, 2] });
    });
});
