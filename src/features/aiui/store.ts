// Store warstwy AI-to-UI (zustand). Jedyne wejście zdarzeń: dispatch → parseEvent → reducer → efekty.
// Kąt kamery jest tu, ale czyta go tylko CameraSetup (getState w useFrame) i OrbitSlider (selektor).

import { create } from 'zustand';
import { buildAction, buildError, parseEvent, type ClientError, type DrawerState, type SurfaceId } from './contract';
import { initialCoreState, reduce, type CoreState, type Effect } from './reducer';
import { FOCUS_ANGLE, normalizeAngle, shortestDelta, smoothstep01 } from './slots';
import { speak, stopSpeaking } from './tts';
import type { AgentTransport, RunStatus } from './transport/types';
import { MockTransport } from './transport/mockTransport';
import { SCENARIOS } from './scenarios';

export const TWEEN_SECONDS = 1.6;

export type ScenarioStatus = 'idle' | RunStatus;

interface CameraState {
    angle: number;
    source: 'director' | 'manual';
    tween: { from: number; to: number; t: number } | null;
}

export interface AiUiState extends CoreState {
    scene: { ready: boolean };
    camera: CameraState;
    scenario: { status: ScenarioStatus; id: string | null; runId: number; error?: string };
    ui: { orbitPanel: boolean };

    dispatch(raw: unknown, runId?: number): void;
    receiveStatus(runId: number, status: RunStatus, error?: string): void;
    setAngle(angle: number, source: 'manual'): void;
    tickCamera(deltaSeconds: number): void;
    setSceneReady(): void;
    toggleOrbitPanel(): void;
    sendAction(name: string, surfaceId: SurfaceId, sourceComponentId: string, context?: Record<string, unknown>): void;
    reportClientError(error: ClientError): void;
    setDrawer(drawer: DrawerState): void;
    startScenario(id: string, prompt?: string): boolean;
    stopScenario(): void;
}

// ── transport ──────────────────────────────────────────────────────

let transport: AgentTransport | null = null;
let unsubscribe: (() => void) | null = null;

export function setTransport(next: AgentTransport) {
    unsubscribe?.();
    transport?.stop();
    transport = next;
    unsubscribe = next.subscribe(
        (runId, raw) => useAiUi.getState().dispatch(raw, runId),
        (runId, status, error) => useAiUi.getState().receiveStatus(runId, status, error),
    );
}

function getTransport(): AgentTransport {
    if (!transport) {
        const speed = typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('speed')) || 1 : 1;
        setTransport(new MockTransport(SCENARIOS, { speed }));
    }
    return transport!;
}

// ── store ──────────────────────────────────────────────────────────

const initialState = () => ({
    ...initialCoreState(),
    scene: { ready: false },
    camera: { angle: 0, source: 'manual', tween: null } as CameraState,
    scenario: { status: 'idle' as ScenarioStatus, id: null, runId: 0 },
    ui: { orbitPanel: false },
});

export const useAiUi = create<AiUiState>()((set, get) => {
    const tweenTo = (target: number) => {
        const from = normalizeAngle(get().camera.angle);
        const delta = shortestDelta(from, target);
        if (Math.abs(delta) < 1e-4) {
            set({ camera: { angle: normalizeAngle(target), source: 'director', tween: null } });
            return;
        }
        set({ camera: { angle: from, source: 'director', tween: { from, to: from + delta, t: 0 } } });
    };

    const runEffects = (effects: Effect[]) => {
        for (const e of effects) {
            if (e.type === 'focus') tweenTo(FOCUS_ANGLE[e.focus]);
            else if (e.type === 'speak') speak(e.text);
            else {
                console.warn('[aiui] błąd kontraktu:', e.error);
                transport?.send(buildError(e.error));
            }
        }
    };

    return {
        ...initialState(),

        dispatch(raw, runId) {
            if (runId !== undefined && runId !== get().scenario.runId) return; // zdarzenie starego przebiegu
            const event = parseEvent(raw);
            if (!event) {
                console.warn('[aiui] odrzucony komunikat (niezgodny z kontraktem):', raw);
                return;
            }
            const { surfaces, stage, narration } = get();
            const { state, effects } = reduce({ surfaces, stage, narration }, event);
            if (state.surfaces !== surfaces || state.stage !== stage || state.narration !== narration) {
                set({ surfaces: state.surfaces, stage: state.stage, narration: state.narration });
            }
            runEffects(effects);
        },

        receiveStatus(runId, status, error) {
            if (runId !== get().scenario.runId) return;
            set({ scenario: { ...get().scenario, status, error } });
        },

        setAngle(angle) {
            set({ camera: { angle, source: 'manual', tween: null } });
        },

        tickCamera(dt) {
            const { tween } = get().camera;
            if (!tween) return;
            const t = Math.min(1, tween.t + dt / TWEEN_SECONDS);
            if (t >= 1) {
                set({ camera: { angle: normalizeAngle(tween.to), source: 'director', tween: null } });
                return;
            }
            const angle = tween.from + (tween.to - tween.from) * smoothstep01(t);
            set({ camera: { angle, source: 'director', tween: { ...tween, t } } });
        },

        setSceneReady() {
            if (!get().scene.ready) set({ scene: { ready: true } });
        },

        toggleOrbitPanel() {
            set({ ui: { orbitPanel: !get().ui.orbitPanel } });
        },

        sendAction(name, surfaceId, sourceComponentId, context = {}) {
            const { status } = get().scenario;
            if (status !== 'running' && status !== 'awaiting_action') {
                console.warn(`[aiui] akcja "${name}" zignorowana — brak aktywnego przebiegu (${status}).`);
                return;
            }
            getTransport().send(buildAction(name, surfaceId, sourceComponentId, context));
        },

        reportClientError(error) {
            console.warn('[aiui] renderer odrzucił komponent:', error);
            transport?.send(buildError(error));
        },

        // Lokalny gest użytkownika (zakładka drawera) — nie zmienia treści surface'u.
        setDrawer(drawer) {
            if (get().stage.drawer !== drawer) set({ stage: { ...get().stage, drawer } });
        },

        startScenario(id, prompt) {
            if (!get().scene.ready) return false;
            const t = getTransport();
            t.stop();
            stopSpeaking();
            const runId = get().scenario.runId + 1;
            set({ ...initialCoreState(), scenario: { status: 'running', id, runId } });
            tweenTo(FOCUS_ANGLE.front);
            t.start(runId, { scenario: id, prompt });
            return true;
        },

        stopScenario() {
            transport?.stop();
            stopSpeaking();
            set({ ...initialCoreState(), scenario: { status: 'idle', id: null, runId: get().scenario.runId + 1 } });
            tweenTo(FOCUS_ANGLE.front);
        },
    };
});

// Dev: sterowanie z konsoli, np. __aiui.getState().dispatch({ stage: { focus: 'back' } })
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    (window as unknown as { __aiui: typeof useAiUi }).__aiui = useAiUi;
}
