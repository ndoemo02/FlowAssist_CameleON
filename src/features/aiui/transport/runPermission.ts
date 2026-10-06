// Zgoda na wywołania backendu — PER PRZEBIEG (P1.7a, ADR 0002 „Handshake możliwości”).
// Ustanawia ją wyłącznie udana negocjacja danego przebiegu; każdy `start` i `stop` ją resetuje.
// Decyzja terminalna (`done`) NIE jest resetem. Wspólne dla mocka i adaptera P1.6 (jedna implementacja reguły).

import { negotiate, type ClientCapabilities, type Negotiation } from './capabilities';
import type { StartRequest } from './types';

export interface PermittedRun {
    readonly runId: number;
    /** Snapshot ze `StartRequest` tego przebiegu — ten sam obiekt trafia do każdego wywołania backendu. */
    readonly capabilities: ClientCapabilities;
    readonly negotiation: Extract<Negotiation, { ok: true }>;
}

export class RunPermission {
    private run: PermittedRun | null = null;

    /**
     * Nowy przebieg: NAJPIERW cofa zgodę poprzedniego (także gdy dalsze kroki rzucą), potem pobiera capabilities
     * serwera i negocjuje. Wyjątek przy pobieraniu capabilities = capabilities nieznane (krok 0); wyjątek w trakcie
     * negocjacji = SERVER_CAPABILITIES_INVALID. Nigdy zgoda i nigdy wyjątek z begin.
     */
    begin(runId: number, request: StartRequest, serverCapabilities: () => unknown): Negotiation {
        this.run = null;
        let server: unknown;
        try {
            server = serverCapabilities();
        } catch {
            server = null;
        }
        let negotiation: Negotiation;
        try {
            negotiation = negotiate(server, request.capabilities);
        } catch {
            // np. getter albo Proxy w capabilities spoza JSON: porażka musi być jawna (krok 6), nie wyjątek w start
            negotiation = { ok: false, reason: 'SERVER_CAPABILITIES_INVALID' };
        }
        if (negotiation.ok) this.run = { runId, capabilities: request.capabilities, negotiation };
        return negotiation;
    }

    /** `stop`: cofa zgodę; do następnego udanego `begin` żadne wywołanie backendu. */
    revoke() {
        this.run = null;
    }

    /** Aktywny przebieg ze zgodą albo null. */
    get active(): PermittedRun | null {
        return this.run;
    }
}
