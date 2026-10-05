// Harness korpusu konformacji (plan v1.3.2, P0.2): odtwarza sekwencję kroków przez TEN SAM
// koordynator co aplikacja (store.dispatch / receiveStatus / layoutCommand / sendAction) i zapisuje
// ślad: stan + efekty (kamera, TTS) + komunikaty wychodzące + ostrzeżenia, przy kontrolowanym czasie.
// Kernel nie jest modyfikowany: TTS przez vi.mock w teście, komunikaty przez setTransport(fake).

import { vi } from 'vitest';
import { resetManualInteraction, setTransport, useAiUi } from '../../store';
import type { AgentTransport, RunStatus } from '../../transport/types';
import type { ClientMessage, SurfaceId } from '../../contract';
import type { LayoutCommand } from '../../layout';
import { resolveItem, workspaceChildren } from '../../workspace';

export type Step =
    | { start: string }                                              // nowy przebieg (runId + 1), id scenariusza
    | { event: unknown; run?: 'current' | 'previous' }               // zdarzenie agenta z runId bieżącego / poprzedniego przebiegu
    | { status: RunStatus; run?: 'current' | 'previous' }
    | { command: LayoutCommand & { withToken?: boolean } }          // withToken: dołącz rev/instance bieżącego wpisu
    | { action: { name: string; surfaceId: SurfaceId; source: string; context?: Record<string, unknown> } }
    | { manualAngle: number }
    | { advanceMs: number }
    | { settleCamera: true }
    | { checkpoint: string };

export interface Fixture {
    id: string;
    description: string;
    steps: Step[];
}

export interface Checkpoint {
    label: string;
    state: unknown;
    effects: {
        tweens: { to: number }[];       // starty tweenu kamery (efekt focus / P3)
        speak: string[];                // wywołania TTS
        outgoing: unknown[];            // komunikaty klient → agent (akcje, błędy)
        warnings: string[];             // console.warn (m.in. ciche odrzucenia)
    };
}

const round = (v: number) => Math.round(v * 1e4) / 1e4;

class RecordingTransport implements AgentTransport {
    sent: ClientMessage[] = [];
    started: number[] = [];
    start(runId: number) { this.started.push(runId); }
    send(message: ClientMessage) { this.sent.push(message); }
    subscribe() { return () => {}; }
    stop() {}
}

/**
 * Odtwarza fixture i zwraca listę checkpointów. Efekty w checkpoincie są przyrostowe (od poprzedniego).
 * `speakMock` to zamockowana funkcja `speak` z '../tts' (vi.mock w pliku testu).
 */
export function replay(fixture: Fixture, speakMock: { mock: { calls: unknown[][] } }): Checkpoint[] {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    vi.setSystemTime(new Date('2026-10-05T00:00:00.000Z'));
    try {
        return run(fixture, speakMock);
    } finally {
        vi.useRealTimers();
    }
}

function run(fixture: Fixture, speakMock: { mock: { calls: unknown[][] } }): Checkpoint[] {
    const st = () => useAiUi.getState();
    useAiUi.setState(useAiUi.getInitialState(), true);
    const transport = new RecordingTransport();
    setTransport(transport);
    st().setSceneReady();
    resetManualInteraction();

    const baseRun = st().scenario.runId;
    const instanceLabels = new Map<number, string>();
    const label = (n: number) => {
        if (!instanceLabels.has(n)) instanceLabels.set(n, `#${instanceLabels.size + 1}`);
        return instanceLabels.get(n)!;
    };

    // efekty: starty tweenu (nowy obiekt tween z t = 0), TTS, komunikaty, ostrzeżenia
    let tweens: { to: number }[] = [];
    let speakFrom = speakMock.mock.calls.length;
    let sentFrom = 0;
    let warnings: string[] = [];
    let prevTween = st().camera.tween;
    const unsub = useAiUi.subscribe((s) => {
        const t = s.camera.tween;
        if (t && t !== prevTween && t.t === 0) tweens.push({ to: round(t.to) });
        prevTween = t;
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { warnings.push(String(args[0])); });

    const snapshot = () => {
        const s = st();
        return {
            scenario: { status: s.scenario.status, id: s.scenario.id, run: s.scenario.runId - baseRun },
            stage: s.stage,
            narration: s.narration,
            camera: {
                angle: round(s.camera.angle),
                source: s.camera.source,
                tween: s.camera.tween ? { to: round(s.camera.tween.to) } : null,
            },
            surfaces: s.surfaces,
            // widok elementu tak, jak zobaczy go warstwa UI (czysty resolveItem, bez Reacta)
            views: Object.fromEntries((workspaceChildren(s.surfaces.workspace) ?? []).map((id) => {
                const v = resolveItem(s.surfaces.workspace!, id);
                return [id, v.status === 'ready' ? { status: v.status, representation: v.representation }
                    : v.status === 'fallback' ? { status: v.status, reason: v.reason, path: v.path } : { status: v.status }];
            })),
            layout: Object.fromEntries(Object.entries(s.layout).map(([id, e]) => [id, { ...e, instance: label(e.instance), x: round(e.x), y: round(e.y) }])),
        };
    };
    const normalizeOutgoing = (m: ClientMessage) =>
        'action' in m ? { ...m, action: { ...m.action, timestamp: '<ts>' } } : m;

    const checkpoints: Checkpoint[] = [];
    const runIdFor = (which?: 'current' | 'previous') => st().scenario.runId - (which === 'previous' ? 1 : 0);

    try {
        for (const step of fixture.steps) {
            if ('start' in step) st().startScenario(step.start);
            else if ('event' in step) st().transportDispatch(step.event, runIdFor(step.run));
            else if ('status' in step) st().receiveStatus(runIdFor(step.run), step.status);
            else if ('command' in step) {
                const { withToken, ...cmd } = step.command;
                const e = 'id' in cmd ? st().layout[cmd.id] : undefined;
                st().layoutCommand((withToken && e ? { ...cmd, rev: e.rev, instance: e.instance } : cmd) as LayoutCommand);
            } else if ('action' in step) st().sendAction(step.action.name, step.action.surfaceId, step.action.source, step.action.context);
            else if ('manualAngle' in step) st().setAngle(step.manualAngle, 'manual');
            else if ('advanceMs' in step) vi.advanceTimersByTime(step.advanceMs);
            else if ('settleCamera' in step) for (let i = 0; i < 200; i++) st().tickCamera(0.016);
            else if ('checkpoint' in step) {
                checkpoints.push({
                    label: step.checkpoint,
                    state: snapshot(),
                    effects: {
                        tweens,
                        speak: speakMock.mock.calls.slice(speakFrom).map((c) => String(c[0])),
                        outgoing: transport.sent.slice(sentFrom).map(normalizeOutgoing),
                        warnings,
                    },
                });
                tweens = [];
                speakFrom = speakMock.mock.calls.length;
                sentFrom = transport.sent.length;
                warnings = [];
            }
        }
    } finally {
        unsub();
        warnSpy.mockRestore();
    }
    return checkpoints;
}

/** Checkpoint po etykiecie (błąd, jeśli brak — literówka w fixture nie może przejść po cichu). */
export function at(trace: Checkpoint[], label: string): Checkpoint {
    const c = trace.find((x) => x.label === label);
    if (!c) throw new Error(`Brak checkpointu "${label}"`);
    return c;
}
