// P1.7a (D1): startScenario dokłada capabilities = zamrożony snapshot dla przebiegu; transport tylko go dołącza.
// Bramka per przebieg widziana od strony store'u: efekt błędu kontraktu (runEffects → send) nie jest strzeżony
// statusem przebiegu, więc po nieudanej negocjacji albo po stop zatrzymuje go dopiero transport.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_ID } from '../contract';
import { setTransport, useAiUi } from '../store';
import { clientCapabilities, type ServerCapabilities } from '../transport/capabilities';
import { MOCK_SERVER_CAPABILITIES, MockTransport, type ScenarioScript } from '../transport/mockTransport';
import type { BackendCall } from '../transport/types';

vi.mock('../tts', () => ({ speak: vi.fn(), stopSpeaking: vi.fn() }));

const V = 'v0.9.1';
const createHud = { version: V, createSurface: { surfaceId: 'hud', catalogId: CATALOG_ID } };
const script: ScenarioScript = {
    id: 'caps',
    timeline: [{ at: 0, event: createHud }],
    responses: { ping: { steps: [{ at: 0, event: { narration: { text: 'pong' } } }] } },
};
const st = () => useAiUi.getState();
let calls: BackendCall[];
let server: ServerCapabilities | null;

const isDeepFrozen = (v: unknown): boolean =>
    v === null || typeof v !== 'object' || (Object.isFrozen(v) && Object.values(v).every(isDeepFrozen));

beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useAiUi.setState(useAiUi.getInitialState(), true);
    calls = [];
    server = MOCK_SERVER_CAPABILITIES;
    setTransport(new (class extends MockTransport {
        override serverCapabilities() { return server; }
    })({ caps: script }, { onBackendCall: (c) => calls.push(c) }));
    st().setSceneReady();
});
afterEach(() => { st().stopScenario(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('startScenario: capabilities w StartRequest (D1)', () => {
    it('start niesie głęboko zamrożony snapshot równy clientCapabilities()', () => {
        st().startScenario('caps');
        const start = calls.find((c) => c.kind === 'start')!;
        expect(start.runId).toBe(st().scenario.runId);
        expect(start.capabilities).toEqual(clientCapabilities());
        expect(isDeepFrozen(start.capabilities)).toBe(true);
    });

    it('kontynuacja (akcja) niesie TEN SAM obiekt co start przebiegu', () => {
        st().startScenario('caps');
        vi.advanceTimersByTime(500);
        st().sendAction('ping', 'hud', 'x');
        const [start, cont] = [calls.find((c) => c.kind === 'start')!, calls.find((c) => c.kind === 'continue')!];
        expect(cont.runId).toBe(start.runId);
        expect(cont.capabilities).toBe(start.capabilities);
    });

    it('restart: nowy snapshot (inny obiekt, ta sama treść)', () => {
        st().startScenario('caps');
        st().startScenario('caps');
        const starts = calls.filter((c) => c.kind === 'start');
        expect(starts).toHaveLength(2);
        expect(starts[1].capabilities).not.toBe(starts[0].capabilities);
        expect(starts[1].capabilities).toEqual(starts[0].capabilities);
    });
});

describe('bramka per przebieg widziana ze store’u', () => {
    it('nieudana negocjacja: status error z przyczyną, bez wywołań backendu; błąd kontraktu z efektu nie wychodzi', () => {
        server = null;
        st().startScenario('caps');
        expect(st().scenario).toMatchObject({ status: 'error', error: 'negotiation:SERVER_CAPABILITIES_UNKNOWN' });
        st().devDispatch(createHud);
        st().devDispatch(createHud); // SURFACE_EXISTS → runEffects → transport.send(buildError)
        expect(calls).toEqual([]);
    });

    it('po stopScenario: błąd kontraktu z efektu nie trafia do backendu', () => {
        st().startScenario('caps');
        vi.advanceTimersByTime(500);
        const before = calls.length;
        st().stopScenario();
        st().devDispatch(createHud);
        st().devDispatch(createHud);
        expect(calls.length).toBe(before);
    });

    it('kontrola: w aktywnym przebiegu ten sam błąd kontraktu trafia do backendu jako continue', () => {
        st().startScenario('caps');
        vi.advanceTimersByTime(500); // hud utworzony z osi czasu
        st().transportDispatch(createHud, st().scenario.runId);
        const errors = calls.filter((c) => c.kind === 'continue' && 'error' in (c.body as object));
        expect(errors).toHaveLength(1);
        expect(errors[0].body).toMatchObject({ error: { code: 'SURFACE_EXISTS' } });
    });
});
