// Mock agenta: odtwarza nagraną oś czasu zdarzeń (idea "A2UI theater") i odpowiada na akcje
// skryptowanymi gałęziami. Deterministyczny; każde zdarzenie jest tagowane runId przebiegu.
// Handshake (P1.7a, D4): egzekwuje TE SAME reguły co adapter — negocjacja w `start`, zgoda na wysyłkę per przebieg.

import { CATALOG_ID, type ClientMessage } from '../contract';
import type { ServerCapabilities } from './capabilities';
import { TRANSPORT_PROFILE } from './profile';
import { RunPermission } from './runPermission';
import type { AgentTransport, RunStatus, StartRequest, TransportObserver } from './types';

/**
 * Capabilities „serwera” mocka: co skrypty potrafią generować (rodzaje i reprezentacje z ich list).
 * Test statyczny pilnuje, że każdy WorkspaceItem w SCENARIOS mieści się w wyniku negocjacji z klientem.
 */
export const MOCK_SERVER_CAPABILITIES: ServerCapabilities = {
    transportProfiles: [TRANSPORT_PROFILE],
    a2uiServerCapabilities: { 'v0.9': { supportedCatalogIds: [CATALOG_ID] } },
    flowassist: { kinds: { chart: ['chart2d', 'ribbon3d'], kpi: ['cards2d', 'kpi3d'], table: ['table2d'], map: ['map2d'] } },
};

export interface MockTransportOptions extends TransportObserver {
    speed?: number;
    /** Nadpisanie capabilities serwera (testy negocjacji); `null` = nieznane. Domyślnie MOCK_SERVER_CAPABILITIES. */
    serverCapabilities?: ServerCapabilities | null;
}

export interface ScenarioStep {
    at: number; // ms od początku odtwarzania danego fragmentu
    event: unknown;
}

export interface ScenarioScript {
    id: string;
    timeline: ScenarioStep[];
    responses: Record<string, { steps: ScenarioStep[]; terminal?: boolean }>;
}

type Listener = {
    onEvent: (runId: number, raw: unknown) => void;
    onStatus: (runId: number, status: RunStatus, error?: string) => void;
};

const END_PADDING_MS = 50;

export class MockTransport implements AgentTransport {
    private timers = new Set<ReturnType<typeof setTimeout>>();
    private listeners = new Set<Listener>();
    private runId = 0;
    private closedRunId: number | null = null; // przebieg zamknięty decyzją terminalną
    private script: ScenarioScript | null = null;
    private readonly permission = new RunPermission();

    constructor(
        private readonly scripts: Record<string, ScenarioScript>,
        private readonly opts: MockTransportOptions = {},
    ) {}

    serverCapabilities(): ServerCapabilities | null {
        return 'serverCapabilities' in this.opts ? this.opts.serverCapabilities ?? null : MOCK_SERVER_CAPABILITIES;
    }

    subscribe(onEvent: Listener['onEvent'], onStatus: Listener['onStatus']) {
        const l = { onEvent, onStatus };
        this.listeners.add(l);
        return () => { this.listeners.delete(l); };
    }

    start(runId: number, request: StartRequest) {
        this.stop(); // cofa zgodę poprzedniego przebiegu i jego zaplanowane zdarzenia
        this.runId = runId;
        this.closedRunId = null;
        this.script = null;
        const negotiation = this.permission.begin(runId, request, () => this.serverCapabilities());
        if (!negotiation.ok) {
            // jawna porażka przed pierwszym zdarzeniem, bez wywołania backendu (komunikat dla UI: profil P1.7b)
            this.emitStatus(runId, 'error', `negotiation:${negotiation.reason}`);
            return;
        }
        this.opts.onBackendCall?.({ kind: 'start', runId, capabilities: request.capabilities, body: { scenario: request.scenario, prompt: request.prompt } });
        this.script = this.scripts[request.scenario] ?? null;
        if (!this.script) {
            this.emitStatus(runId, 'error', `Nieznany scenariusz "${request.scenario}"`);
            this.closedRunId = runId; // przebieg zakończony błędem: agent nie odpowiada już na akcje (zgoda zostaje do start/stop)
            return;
        }
        this.play(runId, this.script.timeline, 'awaiting_action');
    }

    send(message: ClientMessage) {
        // bramka PRZED rozgałęzieniem: błędy renderera też są wywołaniem backendu (P1.7a)
        const run = this.permission.active;
        if (!run) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[aiui/mock] wysyłka pominięta — brak zgody przebiegu (nieudana negocjacja albo po stop).', message);
            }
            return;
        }
        this.opts.onBackendCall?.({ kind: 'continue', runId: run.runId, capabilities: run.capabilities, body: message });
        if ('error' in message) {
            console.warn('[aiui/mock] błąd zgłoszony przez renderer:', message.error);
            return;
        }
        const { name } = message.action;
        const runId = run.runId;
        if (this.closedRunId === runId) return; // po decyzji terminalnej agent nie odpowiada na nic więcej
        const response = this.script?.responses[name];
        if (!response) {
            this.play(runId, [{ at: 0, event: { narration: { text: `Nie obsługuję jeszcze akcji „${name}”.` } } }], 'awaiting_action');
            return;
        }
        if (response.terminal) {
            // decyzja terminalna zamyka przebieg: anuluj inne zaplanowane odpowiedzi tego przebiegu.
            // To NIE jest reset zgody (resetują ją tylko start i stop).
            this.clearTimers();
            this.closedRunId = runId;
        }
        this.play(runId, response.steps, response.terminal ? 'done' : 'awaiting_action');
    }

    stop() {
        this.clearTimers();
        this.permission.revoke();
    }

    private clearTimers() {
        this.timers.forEach(clearTimeout);
        this.timers.clear();
    }

    private play(runId: number, steps: ScenarioStep[], endStatus: RunStatus) {
        const speed = this.opts.speed && this.opts.speed > 0 ? this.opts.speed : 1;
        this.emitStatus(runId, 'running');
        let last = 0;
        for (const step of steps) {
            last = Math.max(last, step.at);
            this.schedule(step.at / speed, () => this.listeners.forEach((l) => l.onEvent(runId, step.event)));
        }
        this.schedule((last + END_PADDING_MS) / speed, () => this.emitStatus(runId, endStatus));
    }

    private schedule(ms: number, fn: () => void) {
        const t = setTimeout(() => {
            this.timers.delete(t);
            fn();
        }, ms);
        this.timers.add(t);
    }

    private emitStatus(runId: number, status: RunStatus, error?: string) {
        this.listeners.forEach((l) => l.onStatus(runId, status, error));
    }
}
