// FU-4 (decyzja właściciela 2026-10-06, przed P1.6): granica protokołu odrzuca zarezerwowane klucze własne
// `__proto__`, `constructor`, `prototype` — na każdym poziomie zagnieżdżenia ładunku — oraz te same nazwy w miejscach,
// gdzie wartość od agenta staje się później kluczem obiektu: `id` komponentu, wpis `children`, segment ścieżki data modelu.
// Odrzucenie jest ciche (OBS-1: raport VALIDATION_FAILED w adapterze P1.6), stan bez zmian, kolejne zdarzenia działają.
// Ładunki budujemy przez JSON.parse — tylko tak (jak z transportu) `__proto__` jest kluczem WŁASNYM, a nie prototypem.

import { afterEach, describe, expect, it } from 'vitest';
import { parseEvent, RESERVED_KEYS } from '../contract';
import { setTransport, useAiUi } from '../store';

const V = 'v0.9.1';
const json = (s: string) => JSON.parse(s) as unknown;

afterEach(() => useAiUi.getState().stopScenario());

describe('FU-4: klucze zarezerwowane w ładunku (zagnieżdżone)', () => {
    it('lista zarezerwowanych nazw', () => {
        expect(Array.from(RESERVED_KEYS).sort()).toEqual(['__proto__', 'constructor', 'prototype']);
    });

    for (const key of ['__proto__', 'constructor', 'prototype']) {
        it(`${key}: na najwyższym poziomie koperty`, () => {
            expect(parseEvent(json(`{"version":"${V}","deleteSurface":{"surfaceId":"hud"},"${key}":{}}`))).toBeNull();
        });

        it(`${key}: w propsie komponentu, głęboko w obiektach i tablicach`, () => {
            const ev = `{"version":"${V}","updateComponents":{"surfaceId":"hud","components":[
                {"id":"root","component":"Approval","title":"T","summary":"S","meta":{"a":[{"b":{"c":[1,{"${key}":{"x":1}}]}}]}}]}}`;
            expect(parseEvent(json(ev))).toBeNull();
        });

        it(`${key}: w wartości updateDataModel, głęboko`, () => {
            const ev = `{"version":"${V}","updateDataModel":{"surfaceId":"workspace","path":"/items/m",
                "value":{"kind":"line","series":[{"label":"x","points":[{"x":"Q1","y":1,"${key}":{}}]}]}}}`;
            expect(parseEvent(json(ev))).toBeNull();
        });

        it(`${key}: w stage i narration`, () => {
            expect(parseEvent(json(`{"stage":{"focus":"back","${key}":{}}}`))).toBeNull();
            expect(parseEvent(json(`{"narration":{"text":"t","${key}":1}}`))).toBeNull();
        });

        it(`${key}: jako segment ścieżki data modelu (także zagnieżdżony)`, () => {
            expect(parseEvent({ version: V, updateDataModel: { surfaceId: 'workspace', path: `/${key}`, value: 1 } })).toBeNull();
            expect(parseEvent({ version: V, updateDataModel: { surfaceId: 'workspace', path: `/items/${key}/x`, value: 1 } })).toBeNull();
        });

        it(`${key}: jako id komponentu albo wpis children`, () => {
            expect(parseEvent({ version: V, updateComponents: { surfaceId: 'workspace', components: [
                { id: key, component: 'WorkspaceItem' },
            ] } })).toBeNull();
            expect(parseEvent({ version: V, updateComponents: { surfaceId: 'workspace', components: [
                { id: 'root', component: 'Workspace', children: ['a', key] },
            ] } })).toBeNull();
        });
    }

    it('bardzo głębokie zagnieżdżenie (12 000 poziomów) z kluczem na dnie: odrzucenie bez przepełnienia stosu', () => {
        const depth = 12_000;
        const ev = `{"version":"${V}","updateDataModel":{"surfaceId":"workspace","path":"/x","value":${'{"a":'.repeat(depth)}{"__proto__":1}${'}'.repeat(depth)}}}`;
        expect(parseEvent(json(ev))).toBeNull();
    });

    it('kontrola: podobne, niezarezerwowane klucze i wartości tekstowe „__proto__” są przyjmowane', () => {
        expect(parseEvent(json(`{"version":"${V}","updateDataModel":{"surfaceId":"workspace","path":"/items/m",
            "value":{"constructorName":"a","proto":1,"__proto":2,"prototypes":3,"label":"__proto__"}}}`))).not.toBeNull();
        expect(parseEvent({ narration: { text: 'constructor prototype __proto__' } })).not.toBeNull();
        expect(parseEvent({ version: V, updateDataModel: { surfaceId: 'workspace', path: '/items/constructorName', value: 1 } })).not.toBeNull();
    });

    it('cykl w ładunku (np. z devDispatch) nie zawiesza skanu', () => {
        const value: Record<string, unknown> = { a: 1 };
        value.self = value;
        expect(parseEvent({ version: V, updateDataModel: { surfaceId: 'workspace', path: '/x', value } })).not.toBeNull();
    });
});

describe('FU-4: przez transportDispatch — stan bez zmian, brak skażenia prototypów, następne zdarzenie działa', () => {
    it('odrzucony ładunek nie zmienia stanu; Object.prototype nietknięty; poprawne zdarzenie po nim jest obsłużone', () => {
        setTransport({ start() {}, send() {}, subscribe: () => () => {}, stop() {} });
        const s = useAiUi.getState();
        s.setSceneReady();
        s.startScenario('test');
        const runId = useAiUi.getState().scenario.runId;
        const dispatch = (raw: unknown) => useAiUi.getState().transportDispatch(raw, runId);
        dispatch({ version: V, createSurface: { surfaceId: 'workspace', catalogId: 'flowassist/v2' } });
        const before = useAiUi.getState().surfaces;
        dispatch(json(`{"version":"${V}","updateComponents":{"surfaceId":"workspace","components":[{"id":"__proto__","component":"WorkspaceItem","polluted":true}]}}`));
        dispatch(json(`{"version":"${V}","updateDataModel":{"surfaceId":"workspace","path":"/__proto__/polluted","value":true}}`));
        dispatch(json(`{"version":"${V}","updateDataModel":{"surfaceId":"workspace","path":"/x","value":{"__proto__":{"polluted":true}}}}`));
        expect(useAiUi.getState().surfaces).toBe(before);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(Object.getPrototypeOf(useAiUi.getState().surfaces.workspace!.components)).toBe(Object.prototype);
        dispatch({ version: V, updateDataModel: { surfaceId: 'workspace', path: '/ok', value: 1 } });
        expect(useAiUi.getState().surfaces.workspace!.data).toEqual({ ok: 1 });
    });
});
