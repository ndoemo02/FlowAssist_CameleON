// Mock agenta: odtwarza nagraną oś czasu zdarzeń (idea "A2UI theater") i odpowiada na akcje
// skryptowanymi gałęziami. Deterministyczny; każde zdarzenie jest tagowane runId przebiegu.

import type { ClientMessage } from '../contract';
import type { AgentTransport, RunStatus, StartRequest } from './types';

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

    constructor(
        private readonly scripts: Record<string, ScenarioScript>,
        private readonly opts: { speed?: number } = {},
    ) {}

    subscribe(onEvent: Listener['onEvent'], onStatus: Listener['onStatus']) {
        const l = { onEvent, onStatus };
        this.listeners.add(l);
        return () => { this.listeners.delete(l); };
    }

    start(runId: number, request: StartRequest) {
        this.stop();
        this.runId = runId;
        this.closedRunId = null;
        this.script = this.scripts[request.scenario] ?? null;
        if (!this.script) {
            this.emitStatus(runId, 'error', `Nieznany scenariusz "${request.scenario}"`);
            return;
        }
        this.play(runId, this.script.timeline, 'awaiting_action');
    }

    send(message: ClientMessage) {
        if ('error' in message) {
            console.warn('[aiui/mock] błąd zgłoszony przez renderer:', message.error);
            return;
        }
        const { name } = message.action;
        const runId = this.runId;
        if (this.closedRunId === runId) return; // po decyzji terminalnej agent nie odpowiada na nic więcej
        const response = this.script?.responses[name];
        if (!response) {
            this.play(runId, [{ at: 0, event: { narration: { text: `Nie obsługuję jeszcze akcji „${name}”.` } } }], 'awaiting_action');
            return;
        }
        if (response.terminal) {
            // decyzja terminalna zamyka przebieg: anuluj inne zaplanowane odpowiedzi tego przebiegu
            this.stop();
            this.closedRunId = runId;
        }
        this.play(runId, response.steps, response.terminal ? 'done' : 'awaiting_action');
    }

    stop() {
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
