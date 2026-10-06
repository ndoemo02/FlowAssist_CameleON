// Wspólny test zgodności AgentTransport (P1.7a, plan A4). Uruchamiany dla MockTransport teraz i dla adaptera AG-UI
// w P1.6 (warunek wejścia P1.6). Plik bez `.test` — rejestruje testy dopiero po wywołaniu describeTransportConformance.
//
// Obserwujemy wywołania backendu (BackendCall), nie wnętrze transportu. Capabilities każdego przebiegu to OSOBNY,
// zamrożony obiekt o tej samej treści — asercje po tożsamości (toBe) wykrywają wyciek capabilities między
// przebiegami i transport budujący capabilities sam.

import { describe, expect, it } from 'vitest';
import { buildAction, buildError } from '../contract';
import { clientCapabilities, type ClientCapabilities, type ServerCapabilities } from '../transport/capabilities';
import type { AgentTransport, BackendCall, RunStatus } from '../transport/types';

export interface ConformanceHarness {
    /** Nowy transport; capabilities serwera czytane przy każdym `start` (mogą się zmieniać między przebiegami). */
    make(opts: { serverCapabilities: () => ServerCapabilities | null; onBackendCall: (call: BackendCall) => void }): AgentTransport;
    /** Capabilities serwera, z którymi negocjacja się udaje. */
    compatibleServer: ServerCapabilities;
    /** Capabilities serwera poprawne, ale bez części wspólnej z klientem (np. inny katalog). */
    incompatibleServer: ServerCapabilities;
    /** Scenariusz, który emituje co najmniej jedno zdarzenie i przyjmuje akcję `actionName`. */
    scenario: string;
    actionName: string;
    /** Dostarcza zaplanowane zdarzenia (np. vi.advanceTimersByTime). */
    flush(): void;
    /** Przygotowanie/sprzątanie środowiska (np. fake timers). */
    setup?(): void;
    teardown?(): void;
}

type Log = { calls: BackendCall[]; events: { runId: number; raw: unknown }[]; statuses: { runId: number; status: RunStatus; error?: string }[]; order: string[] };

export function describeTransportConformance(name: string, h: ConformanceHarness) {
    describe(`AgentTransport — zgodność (P1.7a): ${name}`, () => {
        const caps = (): ClientCapabilities => JSON.parse(JSON.stringify(clientCapabilities())) as ClientCapabilities; // nowy obiekt
        const frozen = (c: ClientCapabilities) => { Object.freeze(c); return c; };
        const action = () => buildAction(h.actionName, 'hud', 'x', {});
        const error = () => buildError({ code: 'VALIDATION_FAILED', surfaceId: 'hud', path: '/components/x', message: 'test' });

        const setup = (server: ServerCapabilities | null | (() => ServerCapabilities | null) = h.compatibleServer) => {
            const log: Log = { calls: [], events: [], statuses: [], order: [] };
            const serverCapabilities = typeof server === 'function' ? server : () => server;
            const t = h.make({ serverCapabilities, onBackendCall: (c) => { log.calls.push(c); log.order.push(`call:${c.kind}`); } });
            t.subscribe(
                (runId, raw) => { log.events.push({ runId, raw }); log.order.push(`event:${runId}`); },
                (runId, status, err) => { log.statuses.push({ runId, status, error: err }); log.order.push(`status:${runId}:${status}`); },
            );
            return { t, log };
        };
        const run = (fn: () => void) => { h.setup?.(); try { fn(); } finally { h.teardown?.(); } };

        it('1: start → jedno wywołanie `start` z capabilities TEGO przebiegu (ten sam obiekt)', () => run(() => {
            const { t, log } = setup();
            const c = frozen(caps());
            t.start(1, { scenario: h.scenario, capabilities: c });
            expect(log.calls).toHaveLength(1);
            expect(log.calls[0]).toMatchObject({ kind: 'start', runId: 1 });
            expect(log.calls[0].capabilities).toBe(c);
            t.stop();
        }));

        it('2: send po udanym starcie → `continue` z tym samym snapshotem i runId przebiegu; błędy renderera też', () => run(() => {
            const { t, log } = setup();
            const c = frozen(caps());
            t.start(1, { scenario: h.scenario, capabilities: c });
            h.flush();
            t.send(action());
            t.send(error());
            const cont = log.calls.filter((x) => x.kind === 'continue');
            expect(cont).toHaveLength(2);
            for (const x of cont) { expect(x.runId).toBe(1); expect(x.capabilities).toBe(c); }
            expect(cont[1].body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
            t.stop();
        }));

        it('3: restart → kontynuacje niosą runId i capabilities NOWEGO przebiegu; stary nie emituje zdarzeń', () => run(() => {
            const { t, log } = setup();
            const a = frozen(caps());
            const b = frozen(caps());
            t.start(1, { scenario: h.scenario, capabilities: a });
            t.start(2, { scenario: h.scenario, capabilities: b });
            h.flush();
            t.send(action());
            const cont = log.calls.filter((x) => x.kind === 'continue');
            expect(cont).toHaveLength(1);
            expect(cont[0].runId).toBe(2);
            expect(cont[0].capabilities).toBe(b);
            expect(log.events.filter((e) => e.runId === 1)).toEqual([]);
            expect(log.events.length).toBeGreaterThan(0);
            t.stop();
        }));

        it('4: po stop żadne send (akcja ani błąd) nie trafia do backendu', () => run(() => {
            const { t, log } = setup();
            t.start(1, { scenario: h.scenario, capabilities: frozen(caps()) });
            h.flush();
            t.stop();
            const before = log.calls.length;
            t.send(action());
            t.send(error());
            h.flush();
            expect(log.calls.length).toBe(before);
        }));

        it.each([
            ['null (capabilities nieznane)', null, 'SERVER_CAPABILITIES_UNKNOWN'],
            ['niezgodne', 'incompatible', null],
        ] as const)('5: negocjacja nieudana (%s) → error przed pierwszym zdarzeniem, bez wywołań backendu, bez running', (_, server, reason) => run(() => {
            const { t, log } = setup(server === 'incompatible' ? h.incompatibleServer : server);
            t.start(1, { scenario: h.scenario, capabilities: frozen(caps()) });
            h.flush();
            expect(log.calls).toEqual([]);
            expect(log.events).toEqual([]);
            expect(log.order).toEqual(['status:1:error']); // jedyny sygnał przebiegu: bez running, zdarzeń i wywołań
            expect(log.statuses[0].error).toMatch(reason ? `negotiation:${reason}` : /^negotiation:/);
            t.stop();
        }));

        it('6: każde zdarzenie jest tagowane runId bieżącego przebiegu (I6)', () => run(() => {
            const { t, log } = setup();
            t.start(7, { scenario: h.scenario, capabilities: frozen(caps()) });
            h.flush();
            t.send(action());
            h.flush();
            expect(log.events.length).toBeGreaterThan(0);
            expect(log.events.every((e) => e.runId === 7)).toBe(true);
            t.stop();
        }));

        it('7: udany A → nieudany B → send nic nie wysyła; udany C → continue z runId i capabilities C', () => run(() => {
            let server: ServerCapabilities | null = h.compatibleServer;
            const { t, log } = setup(() => server);
            const c = frozen(caps());
            t.start(1, { scenario: h.scenario, capabilities: frozen(caps()) });
            h.flush();
            server = null;
            t.start(2, { scenario: h.scenario, capabilities: frozen(caps()) });
            const afterB = log.calls.length;
            t.send(action());
            t.send(error());
            h.flush();
            expect(log.calls.length).toBe(afterB);
            expect(log.calls.some((x) => x.runId === 2)).toBe(false);
            expect(log.statuses.filter((x) => x.runId === 2).map((x) => x.status)).toEqual(['error']);
            server = h.compatibleServer;
            t.start(3, { scenario: h.scenario, capabilities: c });
            h.flush();
            t.send(action());
            const last = log.calls[log.calls.length - 1];
            expect(last).toMatchObject({ kind: 'continue', runId: 3 });
            expect(last.capabilities).toBe(c);
            t.stop();
        }));

        it('8: nieudany pierwszy start → send nic nie wysyła', () => run(() => {
            const { t, log } = setup(null);
            t.start(1, { scenario: h.scenario, capabilities: frozen(caps()) });
            t.send(action());
            t.send(error());
            expect(log.calls).toEqual([]);
            t.stop();
        }));
    });
}
