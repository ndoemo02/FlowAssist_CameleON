import type { ClientMessage } from '../contract';

export type RunStatus = 'running' | 'awaiting_action' | 'done' | 'error';

export interface StartRequest {
    scenario: string;
    prompt?: string;
}

/**
 * Szew między rendererem a agentem. v1: MockTransport (oś czasu), v2: SSE → inference.sh.
 * Adapter odpowiada za kompletność i kolejność komunikatów oraz tagowanie ich runId.
 */
export interface AgentTransport {
    start(runId: number, request: StartRequest): void;
    send(message: ClientMessage): void;
    subscribe(
        onEvent: (runId: number, raw: unknown) => void,
        onStatus: (runId: number, status: RunStatus, error?: string) => void,
    ): () => void;
    stop(): void;
}
