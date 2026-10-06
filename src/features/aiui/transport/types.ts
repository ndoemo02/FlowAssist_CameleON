import type { ClientMessage } from '../contract';
import type { ClientCapabilities, ServerCapabilities } from './capabilities';

export type RunStatus = 'running' | 'awaiting_action' | 'done' | 'error';

export interface StartRequest {
    scenario: string;
    prompt?: string;
    /**
     * Capabilities klienta dla TEGO przebiegu: zamrożony snapshot liczony raz w `startScenario` (P1.7a, D1).
     * Transport nie buduje capabilities sam — dołącza ten obiekt do każdego wywołania backendu w przebiegu.
     */
    capabilities: ClientCapabilities;
}

/**
 * Jedno wywołanie backendu w ramach przebiegu (dla mocka: logiczne). Obserwowalny punkt wspólnego testu zgodności
 * transportu (P1.7a); świadomie bez ramki, lifecycle i reconnectu (P1.6).
 */
export interface BackendCall {
    kind: 'start' | 'continue';
    runId: number;
    capabilities: ClientCapabilities;
    body: unknown;
}

/** Opcje obserwacji wspólne dla implementacji transportu (testy). */
export interface TransportObserver {
    onBackendCall?: (call: BackendCall) => void;
}

/**
 * Szew między rendererem a agentem. v1: MockTransport (oś czasu), v2: adapter AG-UI (P1.6).
 * Adapter odpowiada za kompletność i kolejność komunikatów oraz tagowanie ich runId.
 *
 * Handshake (P1.7a, ADR 0002): `start` najpierw cofa zgodę poprzedniego przebiegu, potem negocjuje
 * (`serverCapabilities()` + `negotiate`). Porażka = status `error` (`negotiation:<przyczyna>`) przed pierwszym
 * zdarzeniem i bez wywołania backendu. Zgoda na wysyłkę jest per przebieg: ustanawia ją wyłącznie udana negocjacja,
 * resetuje każdy `start` i `stop`; bez zgody `send` nie trafia do backendu (`transport/runPermission.ts`).
 */
export interface AgentTransport {
    start(runId: number, request: StartRequest): void;
    send(message: ClientMessage): void;
    subscribe(
        onEvent: (runId: number, raw: unknown) => void,
        onStatus: (runId: number, status: RunStatus, error?: string) => void,
    ): () => void;
    stop(): void;
    /** Capabilities serwera znane przed `start`; `null` = nieznane (negocjacja kończy się porażką, krok 0). */
    serverCapabilities(): ServerCapabilities | null;
}
