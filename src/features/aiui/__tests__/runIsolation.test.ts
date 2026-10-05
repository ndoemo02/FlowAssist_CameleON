// FU-2 (review #6): wejście transportowe i deweloperskie są rozdzielone (ADR 0001, I6).
// - transportDispatch(raw, runId): runId wymagany; inny lub zamknięty przebieg → odrzucone;
// - devDispatch(raw): świadome wejście dev/test bez izolacji przebiegów, wyłączone w produkcji;
// - transport nie ma dostępu do devDispatch (most setTransport → transportDispatch).
// Luka sprzed FU-2: dispatch(raw) bez runId po `done` zmieniał stan.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentTransport } from '../transport/types';
import { setTransport, useAiUi } from '../store';

vi.mock('../tts', () => ({ speak: vi.fn(), stopSpeaking: vi.fn() }));

const V = 'v0.9.1';
const createHud = { version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } };
const st = () => useAiUi.getState();
let onEvent: Parameters<AgentTransport['subscribe']>[0] = () => {};

beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setTransport({ start() {}, send() {}, subscribe: (e) => { onEvent = e; return () => {}; }, stop() {} });
    st().setSceneReady();
    st().startScenario('test');
});
afterEach(() => { st().stopScenario(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('transportDispatch: izolacja przebiegów (I6)', () => {
    it('zdarzenie bieżącego przebiegu — przyjęte', () => {
        st().transportDispatch(createHud, st().scenario.runId);
        expect(st().surfaces.hud).toBeDefined();
    });

    it('zdarzenie starego przebiegu — odrzucone', () => {
        const old = st().scenario.runId;
        st().startScenario('test');
        st().transportDispatch(createHud, old);
        expect(st().surfaces.hud).toBeUndefined();
    });

    it('zdarzenie po stanie terminalnym — odrzucone', () => {
        const runId = st().scenario.runId;
        st().receiveStatus(runId, 'done');
        st().transportDispatch(createHud, runId);
        expect(st().surfaces.hud).toBeUndefined();
    });

    it('brak runId jest niemożliwy w API transportowym (typ) i odrzucany w runtime', () => {
        // @ts-expect-error runId jest wymagany w ścieżce transportowej (FU-2)
        st().transportDispatch(createHud);
        st().receiveStatus(st().scenario.runId, 'done');
        st().transportDispatch(createHud, undefined as unknown as number);
        expect(st().surfaces.hud).toBeUndefined();
    });

    it('most transportu (setTransport → onEvent) korzysta z izolacji: stary runId odrzucony, bieżący przyjęty', () => {
        const old = st().scenario.runId;
        st().startScenario('test');
        onEvent(old, createHud);
        expect(st().surfaces.hud).toBeUndefined();
        onEvent(st().scenario.runId, createHud);
        expect(st().surfaces.hud).toBeDefined();
    });
});

describe('devDispatch: świadome wejście dev/test', () => {
    it('działa bez przebiegu (seedowanie, dev-hook)', () => {
        st().stopScenario(); // idle, bez aktywnego runu
        st().devDispatch(createHud);
        expect(st().surfaces.hud).toBeDefined();
    });

    it('w produkcji jest wyłączone', () => {
        vi.stubEnv('NODE_ENV', 'production');
        st().devDispatch(createHud);
        expect(st().surfaces.hud).toBeUndefined();
    });
});

describe('transport nie korzysta z devDispatch ani ze store', () => {
    it('żaden plik w transport/ nie odwołuje się do devDispatch, useAiUi ani store', () => {
        const dir = fileURLToPath(new URL('../transport/', import.meta.url));
        for (const f of readdirSync(dir)) {
            const src = readFileSync(dir + f, 'utf-8');
            expect(src, f).not.toMatch(/devDispatch|useAiUi|from ['"]\.\.\/store['"]/);
        }
    });
});
