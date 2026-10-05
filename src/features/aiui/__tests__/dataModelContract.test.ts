// Review #4 — kontrakt ścieżek `updateDataModel` (JSON Pointer, ADR 0002). Decyzja właściciela:
// segment adresujący tablicę musi być kanonicznym indeksem (`0` albo cyfra 1–9 i dalsze cyfry).
// `-`, indeksy ujemne i niekanoniczne są odrzucane: dokument zostaje bez zmian (ta sama referencja),
// bez semantyki append dla `-`. Odczyt (bindingi) widzi tylko własne właściwości.

import { describe, expect, it } from 'vitest';
import { getAt, setAt } from '../jsonPointer';
import { initialCoreState, reduce } from '../reducer';
import type { AiUiEvent } from '../contract';

const V = 'v0.9.1' as const;
const doc = () => ({ items: ['x', 'y', 'z'] });

describe('updateDataModel: niekanoniczny indeks tablicy jest odrzucany bez zmiany dokumentu', () => {
    const rejected: [string, unknown][] = [
        ['/items/-', undefined],    // dziś: usuwa element 0
        ['/items/-', 'w'],          // dziś: tworzy właściwość "-" (brak semantyki append)
        ['/items/-1', undefined],   // dziś: usuwa ostatni element
        ['/items/-1', 'w'],
        ['/items/foo', undefined],  // dziś: usuwa element 0
        ['/items/01', 'w'],         // zero wiodące
        ['/items/1.5', 'w'],
        ['/items/1e0', 'w'],
        ['/items/ 1', 'w'],
        ['/items/length', 0],       // dziś: obcina tablicę
        ['/items/-/x', 'w'],        // segment pośredni
    ];

    it.each(rejected)('setAt(%s, %j) zwraca ten sam dokument', (path, value) => {
        const d = doc();
        const next = setAt(d, path, value);
        expect(next).toBe(d);
        expect(d).toEqual({ items: ['x', 'y', 'z'] });
    });

    it.each(rejected)('reduce(updateDataModel %s, %j): dane surface\'u bez zmian', (path, value) => {
        let state = initialCoreState();
        const ev = (e: unknown) => { state = reduce(state, e as AiUiEvent).state; };
        ev({ version: V, createSurface: { surfaceId: 'workspace', catalogId: 'flowassist/v2' } });
        ev({ version: V, updateDataModel: { surfaceId: 'workspace', path: '/', value: doc() } });
        const before = state.surfaces.workspace!.data;
        ev({ version: V, updateDataModel: { surfaceId: 'workspace', path, value } });
        expect(state.surfaces.workspace!.data).toBe(before);
        expect(before).toEqual({ items: ['x', 'y', 'z'] });
    });

    it('kanoniczny indeks nadal działa (zapis i usunięcie)', () => {
        expect(setAt(doc(), '/items/1', 'w')).toEqual({ items: ['x', 'w', 'z'] });
        expect(setAt(doc(), '/items/0', undefined)).toEqual({ items: ['y', 'z'] });
        expect(setAt({ list: [{ a: 1 }] }, '/list/0/a', 2)).toEqual({ list: [{ a: 2 }] });
    });

    it('klucze obiektów nie podlegają regule indeksu ("-", "01" to zwykłe klucze)', () => {
        expect(setAt({}, '/-', 1)).toEqual({ '-': 1 });
        expect(setAt({}, '/m/01', 1)).toEqual({ m: { '01': 1 } });
    });
});

describe('bindingi czytają tylko własne właściwości', () => {
    it('niekanoniczny indeks i `length` tablicy dają undefined', () => {
        expect(getAt(doc(), '/items/length')).toBeUndefined();
        expect(getAt(doc(), '/items/-1')).toBeUndefined();
        expect(getAt(doc(), '/items/01')).toBeUndefined();
        expect(getAt(doc(), '/items/1')).toBe('y');
    });

    it('właściwości z prototypu nie są widoczne', () => {
        expect(getAt({}, '/toString')).toBeUndefined();
        expect(getAt({}, '/__proto__')).toBeUndefined();
        expect(getAt({ a: {} }, '/a/constructor')).toBeUndefined();
    });

    it('klucz "__proto__" jest zapisywany jako własna właściwość, bez zmiany prototypu', () => {
        const next = setAt({}, '/__proto__', { polluted: true }) as Record<string, unknown>;
        expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
        expect(Object.prototype.hasOwnProperty.call(next, '__proto__')).toBe(true);
        expect(getAt(next, '/__proto__/polluted')).toBe(true);
        expect((next as { polluted?: unknown }).polluted).toBeUndefined();
    });
});
