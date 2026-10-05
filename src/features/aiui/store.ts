// Store warstwy AI-to-UI (zustand) — koordynator (plan v1.2.1, E12/P8).
// Zdarzenie agenta: parseEvent → reduce (surface'y) → reconcileLayout → JEDEN zapis → efekty.
// Komenda użytkownika: presentationReducer → jeden zapis → efekty.
// Kąt kamery czyta tylko CameraSetup (getState w useFrame) i OrbitSlider (selektor).
//
// Semantyka stage.focus: ostatni semantyczny cel kamery (agent lub jawna komenda użytkownika).
// Ręczny obrót suwakiem przejmuje kamerę (camera.source = 'manual') BEZ zmiany stage.focus; hint agenta
// 'screen' w trakcie ręcznego obrotu (P3) umieszcza element na ekranie, ale nie rusza ani kamery, ani celu.
//
// Zakończenie przebiegu jest trwałe: po 'done'/'error' store odrzuca dalsze statusy i zdarzenia tego runId
// (np. odpowiedź na akcję wysłaną tuż przed decyzją terminalną) — niezależnie od implementacji transportu.

import { create } from 'zustand';
import { buildAction, buildError, parseEvent, type ClientError, type DrawerState, type SurfaceId } from './contract';
import { initialCoreState, reduce, type CoreState, type Effect } from './reducer';
import { isScreenOccupied, layoutSnapshot, presentationReducer, reconcileLayout, type Layout, type LayoutCommand } from './layout';
import { workspaceMeta } from './workspace';
import { FOCUS_ANGLE, normalizeAngle, shortestDelta, smoothstep01 } from './slots';
import { speak, stopSpeaking } from './tts';
import type { AgentTransport, RunStatus } from './transport/types';
import { MockTransport } from './transport/mockTransport';
import { SCENARIOS } from './scenarios';

export const TWEEN_SECONDS = 1.6;
/** P3: hint agenta 'screen' nie rusza kamery, jeśli użytkownik obracał ręcznie w tym oknie czasu. */
export const MANUAL_GRACE_MS = 2000;
let lastManualAt = -Infinity;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const isClosed = (status: ScenarioStatus) => status === 'done' || status === 'error';

/** Testy: zapomnij ostatni ręczny obrót (stan modułu współdzielony między testami). */
export const resetManualInteraction = () => { lastManualAt = -Infinity; };

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
    layout: Layout;

    dispatch(raw: unknown, runId?: number): void;
    layoutCommand(cmd: LayoutCommand): void;
    receiveStatus(runId: number, status: RunStatus, error?: string): void;
    setAngle(angle: number, source: 'manual'): void;
    tickCamera(deltaSeconds: number): void;
    setSceneReady(): void;
    toggleOrbitPanel(): void;
    sendAction(name: string, surfaceId: SurfaceId, sourceComponentId: string, context?: Record<string, unknown>): void;
    reportClientError(error: ClientError, origin: { runId: number }): void;
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
    layout: {} as Layout,
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
            if (runId !== undefined && (runId !== get().scenario.runId || isClosed(get().scenario.status))) return; // stary lub zamknięty przebieg
            const event = parseEvent(raw);
            if (!event) {
                console.warn('[aiui] odrzucony komunikat (niezgodny z kontraktem):', raw);
                return;
            }
            const { surfaces, stage, narration, layout } = get();
            const reduced = reduce({ surfaces, stage, narration }, event);
            const { state } = reduced;
            let { effects } = reduced;
            const manualGrace = now() - lastManualAt <= MANUAL_GRACE_MS;
            // P3 (ADR 0005, OBS-2): w okresie łaski po ręcznym obrocie stage.focus agenta nie przejmuje kamery
            // ani nie zmienia stage.focus (jak hint 'screen'); drawer z tego samego komunikatu stosowany normalnie.
            let agentStage = state.stage;
            if (manualGrace && 'stage' in event && event.stage.focus) {
                effects = effects.filter((e) => e.type !== 'focus');
                if (state.stage.focus !== stage.focus) {
                    agentStage = state.stage.drawer === stage.drawer ? stage : { ...state.stage, focus: stage.focus };
                }
            }
            // P8: uzgodnienie układu tylko, gdy zmienił się surface 'workspace' (w tym deleteSurface → reset, P7)
            const r = state.surfaces.workspace !== surfaces.workspace
                ? reconcileLayout(layout, workspaceMeta(state.surfaces.workspace))
                : { layout, screenHint: false };
            // P3: hint agenta 'screen' przenosi kamerę (i semantyczny cel), o ile użytkownik nie obraca ręcznie
            const cameraToScreen = r.screenHint && !manualGrace;
            const nextStage = cameraToScreen && agentStage.focus !== 'front' ? { ...agentStage, focus: 'front' as const } : agentStage;
            if (state.surfaces !== surfaces || nextStage !== stage || state.narration !== narration || r.layout !== layout) {
                set({ surfaces: state.surfaces, stage: nextStage, narration: state.narration, layout: r.layout });
            }
            runEffects(effects);
            if (cameraToScreen) tweenTo(FOCUS_ANGLE.front);
        },

        layoutCommand(cmd) {
            const r = presentationReducer(get().layout, cmd);
            // P3: jawna komenda użytkownika „na ekran” zawsze przenosi kamerę — cel ustawiany w tym samym zapisie
            const stage = get().stage;
            const nextStage = r.cameraFront && stage.focus !== 'front' ? { ...stage, focus: 'front' as const } : stage;
            if (r.changed || nextStage !== stage) set({ layout: r.layout, stage: nextStage });
            if (r.cameraFront) tweenTo(FOCUS_ANGLE.front);
        },

        receiveStatus(runId, status, error) {
            if (runId !== get().scenario.runId || isClosed(get().scenario.status)) return; // zakończenie jest trwałe
            set({ scenario: { ...get().scenario, status, error } });
        },

        setAngle(angle) {
            lastManualAt = now();
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
            // II.4: migawka układu (bez współrzędnych) przy każdej akcji semantycznej
            getTransport().send(buildAction(name, surfaceId, sourceComponentId, { ...context, workspace: layoutSnapshot(get().layout) }));
        },

        // Review #5: raport niesie jawne pochodzenie (przebieg, w którym powstał). Wysyłany tylko w tym samym,
        // aktywnym przebiegu — spóźniony raport po restarcie lub po done/error nie trafia do agenta.
        reportClientError(error, origin) {
            const { runId, status } = get().scenario;
            if (origin.runId !== runId || (status !== 'running' && status !== 'awaiting_action')) {
                console.warn(`[aiui] raport renderera pominięty — przebieg ${origin.runId} nie jest aktywny (bieżący ${runId}: ${status}).`, error);
                return;
            }
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
            set({ ...initialCoreState(), layout: {}, scenario: { status: 'running', id, runId } }); // P7
            tweenTo(FOCUS_ANGLE.front);
            t.start(runId, { scenario: id, prompt });
            return true;
        },

        stopScenario() {
            transport?.stop();
            stopSpeaking();
            set({ ...initialCoreState(), layout: {}, scenario: { status: 'idle', id: null, runId: get().scenario.runId + 1 } }); // P7
            tweenTo(FOCUS_ANGLE.front);
        },
    };
});

/** E7: ekran sceny zajęty (element na ekranie) lub trwa przebieg → wyciszenie i przyciemnienie wideo. */
export const selectScreenBusy = (s: AiUiState) =>
    isScreenOccupied(s.layout) || s.scenario.status === 'running' || s.scenario.status === 'awaiting_action';

// Dev: sterowanie z konsoli, np. __aiui.getState().dispatch({ stage: { focus: 'back' } })
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    (window as unknown as { __aiui: typeof useAiUi }).__aiui = useAiUi;
}
