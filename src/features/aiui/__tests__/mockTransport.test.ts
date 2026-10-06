// MockTransport: wspólny test zgodności (P1.7a) + reguły specyficzne dla mocka (D4: te same zasady co adapter).

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAction, buildError, CATALOG_ID, type ClientMessage } from '../contract';
import { clientCapabilities, negotiate, type ServerCapabilities } from '../transport/capabilities';
import { MOCK_SERVER_CAPABILITIES, MockTransport, type ScenarioScript } from '../transport/mockTransport';
import type { AgentTransport, BackendCall, StartRequest } from '../transport/types';
import { SCENARIOS } from '../scenarios';
import { describeTransportConformance } from './transportConformance';

const V = 'v0.9.1';
const script: ScenarioScript = {
    id: 'conf',
    timeline: [
        { at: 0, event: { version: V, createSurface: { surfaceId: 'hud', catalogId: CATALOG_ID } } },
        { at: 20, event: { narration: { text: 'start' } } },
    ],
    responses: {
        ping: { steps: [{ at: 0, event: { narration: { text: 'pong' } } }] },
        approve: { steps: [{ at: 0, event: { narration: { text: 'koniec' } } }], terminal: true },
    },
};

class ConfigurableMock extends MockTransport {
    constructor(private readonly server: () => ServerCapabilities | null, onBackendCall: (c: BackendCall) => void) {
        super({ conf: script }, { onBackendCall });
    }
    override serverCapabilities() { return this.server(); }
}

const harness = {
    compatibleServer: MOCK_SERVER_CAPABILITIES,
    incompatibleServer: { ...MOCK_SERVER_CAPABILITIES, a2uiServerCapabilities: { 'v0.9': { supportedCatalogIds: ['basic/v1'] } } },
    scenario: 'conf',
    actionName: 'ping',
    terminalActionName: 'approve',
    flush: async () => { await vi.advanceTimersByTimeAsync(1000); },
    setup: () => { vi.useFakeTimers(); vi.spyOn(console, 'warn').mockImplementation(() => {}); },
    teardown: () => { vi.useRealTimers(); vi.restoreAllMocks(); },
};

describeTransportConformance('MockTransport', {
    ...harness,
    make: ({ serverCapabilities, onBackendCall }) => new ConfigurableMock(serverCapabilities, onBackendCall),
});

/**
 * Dowód, że wspólny zestaw przyjmuje transport ASYNCHRONICZNY (jak adapter fetch/SSE w P1.6): wywołania backendu,
 * zdarzenia i statusy dochodzą w mikrozadaniach (review Claude P1.7a, M1). Jak poprawny adapter, wrapper rozstrzyga
 * zgodę w chwili PRZYJĘCIA `send` (synchronicznie), a dopiero dostarczenie jest odroczone — odroczenie samej decyzji
 * przenosiłoby komunikat do następnego przebiegu (review Astry P1.7a, MEDIUM 2; przypadki 12–13 zestawu).
 */
class AsyncMock implements AgentTransport {
    private readonly inner: ConfigurableMock;
    constructor(server: () => ServerCapabilities | null, onBackendCall: (c: BackendCall) => void) {
        this.inner = new ConfigurableMock(server, (c) => queueMicrotask(() => onBackendCall(c)));
    }
    start(runId: number, request: StartRequest) { this.inner.start(runId, request); }
    send(message: ClientMessage) { this.inner.send(message); }
    subscribe(onEvent: Parameters<AgentTransport['subscribe']>[0], onStatus: Parameters<AgentTransport['subscribe']>[1]) {
        return this.inner.subscribe(
            (runId, raw) => queueMicrotask(() => onEvent(runId, raw)),
            (runId, status, error) => queueMicrotask(() => onStatus(runId, status, error)),
        );
    }
    stop() { this.inner.stop(); }
    serverCapabilities() { return this.inner.serverCapabilities(); }
}

describeTransportConformance('MockTransport opakowany asynchronicznie (mikrozadania)', {
    ...harness,
    make: ({ serverCapabilities, onBackendCall }) => new AsyncMock(serverCapabilities, onBackendCall),
});

describe('MockTransport — reguły mocka (P1.7a)', () => {
    let calls: BackendCall[];
    beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'warn').mockImplementation(() => {}); calls = []; });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('domyślne capabilities mocka negocjują się z klientem i spełniają schemat upstream (server_capabilities.json)', () => {
        expect(negotiate(MOCK_SERVER_CAPABILITIES, clientCapabilities()).ok).toBe(true);
        const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../schemas/a2ui-v0.9/server_capabilities.json', import.meta.url)), 'utf-8'));
        expect(new Ajv2020({ strict: true, strictTypes: false }).compile(schema)(MOCK_SERVER_CAPABILITIES.a2uiServerCapabilities)).toBe(true);
    });

    it('nieznany scenariusz: error, potem brak zdarzeń i statusów (przebieg zamknięty); zgoda zostaje do start/stop', () => {
        const order: string[] = [];
        const t = new MockTransport({ conf: script }, { onBackendCall: (c) => calls.push(c) });
        t.subscribe((runId) => order.push(`event:${runId}`), (runId, s) => order.push(`status:${runId}:${s}`));
        t.start(1, { scenario: 'nope', capabilities: clientCapabilities() });
        t.send(buildAction('ping', 'hud', 'x', {}));
        vi.advanceTimersByTime(1000);
        expect(order).toEqual(['status:1:error']);
        expect(calls.map((c) => c.kind)).toEqual(['start', 'continue']);
        t.stop();
    });

    it('odrzucona wysyłka ostrzega tylko poza produkcją', () => {
        const warn = vi.mocked(console.warn);
        const t = new MockTransport({ conf: script });
        vi.stubEnv('NODE_ENV', 'production');
        t.send(buildAction('ping', 'hud', 'x', {}));
        expect(warn).not.toHaveBeenCalled();
        vi.unstubAllEnvs();
        t.send(buildAction('ping', 'hud', 'x', {}));
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('jawne `serverCapabilities: null` w opcjach = nieznane (krok 0), nie wartość domyślna', () => {
        expect(new MockTransport({}, { serverCapabilities: null }).serverCapabilities()).toBeNull();
        expect(new MockTransport({}).serverCapabilities()).toBe(MOCK_SERVER_CAPABILITIES);
    });

    it('decyzja terminalna NIE resetuje zgody: błąd renderera po `approve` nadal trafia do backendu; akcja bez odpowiedzi', () => {
        const events: unknown[] = [];
        const t = new MockTransport({ conf: script }, { onBackendCall: (c) => calls.push(c) });
        t.subscribe((_, raw) => events.push(raw), () => {});
        const caps = clientCapabilities();
        t.start(1, { scenario: 'conf', capabilities: caps });
        vi.advanceTimersByTime(1000);
        t.send(buildAction('approve', 'hud', 'x', {}));
        vi.advanceTimersByTime(1000);
        const afterTerminal = events.length;
        t.send(buildError({ code: 'VALIDATION_FAILED', surfaceId: 'hud', path: '/x', message: 'm' }));
        t.send(buildAction('ping', 'hud', 'x', {}));
        vi.advanceTimersByTime(1000);
        expect(calls.filter((c) => c.kind === 'continue')).toHaveLength(3);
        expect(calls.every((c) => c.capabilities === caps)).toBe(true);
        expect(events.length).toBe(afterTerminal); // po decyzji terminalnej mock nie odpowiada
        t.stop();
    });

    it('wyjątek przy pobieraniu capabilities serwera = nieznane (krok 0); zgoda poprzedniego przebiegu cofnięta wcześniej', () => {
        let throwing = false;
        const statuses: string[] = [];
        const t = new ConfigurableMock(() => { if (throwing) throw new Error('agent card niedostępna'); return MOCK_SERVER_CAPABILITIES; }, (c) => calls.push(c));
        t.subscribe(() => {}, (_, s, e) => statuses.push(e ? `${s}:${e}` : s));
        t.start(1, { scenario: 'conf', capabilities: clientCapabilities() });
        throwing = true;
        t.start(2, { scenario: 'conf', capabilities: clientCapabilities() });
        const before = calls.length;
        t.send(buildAction('ping', 'hud', 'x', {}));
        expect(calls.length).toBe(before);
        expect(statuses).toContain('error:negotiation:SERVER_CAPABILITIES_UNKNOWN');
        t.stop();
    });
});

// A2b: serwer (mock) emituje tylko elementy mieszczące się w wyniku negocjacji z klientem.
describe('skrypty mocka mieszczą się w wynikowych kinds negocjacji (A2b)', () => {
    const negotiated = negotiate(MOCK_SERVER_CAPABILITIES, clientCapabilities());
    const items = (s: ScenarioScript) => {
        const steps = [...s.timeline, ...Object.values(s.responses).flatMap((r) => r.steps)];
        return steps.flatMap(({ event }) => {
            const comps = (event as { updateComponents?: { components?: Record<string, unknown>[] } }).updateComponents?.components ?? [];
            return comps.filter((c) => c.component === 'WorkspaceItem');
        });
    };

    it.each(Object.values(SCENARIOS).map((s) => [s.id, s] as const))('%s', (_, s) => {
        expect(negotiated.ok).toBe(true);
        if (!negotiated.ok) return;
        const found = items(s);
        expect(found.length).toBeGreaterThan(0);
        for (const item of found) {
            expect(typeof item.kind, `${String(item.id)}: kind musi być dosłowny`).toBe('string');
            expect(Array.isArray(item.representations), `${String(item.id)}: representations muszą być dosłowne`).toBe(true);
            const allowed = negotiated.kinds[item.kind as keyof typeof negotiated.kinds] ?? [];
            const common = (item.representations as string[]).filter((r) => (allowed as readonly string[]).includes(r));
            expect(common.length, `${String(item.id)} (${String(item.kind)}): brak wspólnej reprezentacji`).toBeGreaterThan(0);
        }
    });
});

describe('transport nie buduje capabilities sam (D1)', () => {
    it('żaden plik w transport/ (rekurencyjnie) poza capabilities.ts nie odwołuje się do clientCapabilities', () => {
        const dir = fileURLToPath(new URL('../transport/', import.meta.url));
        const files = (readdirSync(dir, { recursive: true }) as string[])
            .map((f) => f.replace(/\\/g, '/'))
            .filter((f) => /\.tsx?$/.test(f) && f !== 'capabilities.ts');
        expect(files).toContain('mockTransport.ts');
        for (const f of files) expect(readFileSync(dir + f, 'utf-8'), f).not.toMatch(/\bclientCapabilities\b/);
    });
});
