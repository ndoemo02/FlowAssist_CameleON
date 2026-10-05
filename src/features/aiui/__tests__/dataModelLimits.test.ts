// FU-3 — limity zasobów protokołu (ADR 0002): niezaufany `updateDataModel` ma limit ścieżki ZANIM dotknie stanu.
// Ścieżka: ≤ 512 znaków i ≤ 32 segmenty. Ekstremalna ścieżka (dziś: rekurencyjny setAt → RangeError w dispatch)
// ma być odrzucona bez zmiany stanu i bez wyjątku, a następny poprawny event — obsłużony normalnie.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEvent } from '../contract';
import { setTransport, useAiUi } from '../store';

vi.mock('../tts', () => ({ speak: vi.fn(), stopSpeaking: vi.fn() }));

const V = 'v0.9.1';
const udm = (path: string, value: unknown = 1) => ({ version: V, updateDataModel: { surfaceId: 'workspace', path, value } });
const segments = (n: number) => '/a'.repeat(n);

describe('parseEvent: limity ścieżki updateDataModel', () => {
    it('dokładnie 32 segmenty — przyjęte; 33 — odrzucone', () => {
        expect(parseEvent(udm(segments(32)))).not.toBeNull();
        expect(parseEvent(udm(segments(33)))).toBeNull();
    });

    it('dokładnie 512 znaków — przyjęte; 513 — odrzucone', () => {
        expect(parseEvent(udm('/' + 'x'.repeat(511)))).not.toBeNull();
        expect(parseEvent(udm('/' + 'x'.repeat(512)))).toBeNull();
    });

    it('zwykłe ścieżki scenariusza research przechodzą', () => {
        for (const path of ['/', '/items/chart-q', '/items/chart-q/series', '/tasks/scout']) expect(parseEvent(udm(path))).not.toBeNull();
    });
});

describe('ekstremalna ścieżka przez ścieżkę transportową (kryterium akceptacji FU-3)', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        setTransport({ start() {}, send() {}, subscribe: () => () => {}, stop() {} });
        useAiUi.getState().setSceneReady();
        useAiUi.getState().startScenario('test');
    });
    afterEach(() => { useAiUi.getState().stopScenario(); warn.mockRestore(); });

    it('złośliwa ścieżka 10 000 segmentów: odrzucona, stan bez zmian, bez wyjątku; następny poprawny event obsłużony', () => {
        const runId = useAiUi.getState().scenario.runId;
        const dispatch = (raw: unknown) => useAiUi.getState().dispatch(raw, runId);
        dispatch({ version: V, createSurface: { surfaceId: 'workspace', catalogId: 'flowassist/v2' } });
        dispatch(udm('/items', { a: 1 }));
        const before = useAiUi.getState().surfaces;

        expect(() => dispatch(udm(segments(10_000), 'x'))).not.toThrow();
        expect(useAiUi.getState().surfaces).toBe(before);                       // brak (częściowej) modyfikacji
        expect(useAiUi.getState().surfaces.workspace!.data).toEqual({ items: { a: 1 } });

        dispatch(udm('/items/b', 2));                                           // następny poprawny event
        expect(useAiUi.getState().surfaces.workspace!.data).toEqual({ items: { a: 1, b: 2 } });
    });
});
