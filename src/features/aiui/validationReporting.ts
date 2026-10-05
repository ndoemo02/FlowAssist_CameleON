// Raport VALIDATION_FAILED do agenta (review #5, I6/I10) — jedno zgłoszenie na WYSTĄPIENIE problemu.
//
// - Problemy walidacji liczone są ze stanu (czyste resolveItem / resolveTree), a nie z zamontowanych widoków:
//   karta i panel ekranu, remount, zamknięty HUD czy szuflada nie zmieniają liczby raportów.
// - Wystąpienie trwa, dopóki problem jest w stanie; po odzyskaniu poprawności klucz jest zapominany,
//   więc nawrót tego samego problemu jest zgłaszany ponownie.
// - Błąd renderu (RenderGuard) to wystąpienie dla konkretnych danych: te same dane na karcie i na ekranie
//   = jeden raport; nowe dane, które znów wywracają widok = nowe wystąpienie.
// - Każdy raport niesie przebieg, w którym powstał; store wysyła go tylko w tym samym, aktywnym przebiegu.
// Instaluje go warstwa UI (AiUiOverlay) — koordynator (store.dispatch) nie raportuje fallbacków.

import { SURFACE_IDS, type ClientError, type SurfaceId } from './contract';
import { collectFallbacks, resolveTree } from './resolveTree';
import { resolveItem, workspaceChildren } from './workspace';
import { useAiUi, type AiUiState } from './store';
import { sameSignature } from './viewProps';

export interface Problem { surfaceId: SurfaceId; nodeId: string; path: string; message: string }

const toError = (p: Problem): ClientError => ({ code: 'VALIDATION_FAILED', surfaceId: p.surfaceId, path: p.path, message: p.message });
const key = (p: Problem) => `${p.surfaceId}|${p.nodeId}|${p.path}|${p.message}`;

/** Problemy walidacji wynikające z samego stanu surface'ów. */
export function surfaceProblems(surfaces: AiUiState['surfaces']): Problem[] {
    const out: Problem[] = [];
    for (const surfaceId of SURFACE_IDS) {
        const surface = surfaces[surfaceId];
        if (!surface) continue;
        if (surfaceId === 'workspace') {
            for (const id of workspaceChildren(surface) ?? []) {
                const view = resolveItem(surface, id);
                if (view.status === 'fallback') out.push({ surfaceId, nodeId: id, path: view.path, message: view.reason });
            }
        } else {
            for (const f of collectFallbacks(resolveTree(surface))) {
                out.push({ surfaceId, nodeId: f.id, path: f.path ?? `/components/${f.id}`, message: f.reason });
            }
        }
    }
    return out;
}

// Stan modułu (jeden overlay na stronę; restart efektu w StrictMode nie zgłasza ponownie).
let trackedRun: number | null = null;
let active = new Set<string>();               // trwające wystąpienia problemów walidacji
const rendered = new Map<string, readonly unknown[]>(); // surface|węzeł|komunikat → podpis danych, na których render się wywrócił

function trackRun(runId: number) {
    if (runId === trackedRun) return;
    trackedRun = runId;
    active = new Set();
    rendered.clear();
}

function sync(state: AiUiState) {
    const runId = state.scenario.runId;
    trackRun(runId);
    const current = new Map(surfaceProblems(state.surfaces).map((p) => [key(p), p]));
    current.forEach((p, k) => { if (!active.has(k)) state.reportClientError(toError(p), { runId }); });
    active = new Set(current.keys());
}

/** Subskrypcja stanu: raportuje nowe wystąpienia problemów. Zwraca funkcję wyłączającą. */
export function startValidationReporting(): () => void {
    sync(useAiUi.getState());
    return useAiUi.subscribe((s, prev) => {
        if (s.surfaces !== prev.surfaces || s.scenario.runId !== prev.scenario.runId) sync(s);
    });
}

/**
 * Błąd renderu z lokalnego boundary. `data` = podpis danych, na których widok się wywrócił
 * (płytko równy podpis = to samo wystąpienie); `runId` = przebieg z chwili renderu.
 */
export function reportRenderProblem(p: Problem, data: readonly unknown[], runId: number) {
    const state = useAiUi.getState();
    if (runId === state.scenario.runId) {
        trackRun(runId);
        const k = `${p.surfaceId}|${p.nodeId}|${p.message}`;
        const prev = rendered.get(k);
        if (prev && sameSignature(prev, data)) return;
        rendered.set(k, data);
    }
    state.reportClientError(toError(p), { runId }); // inny przebieg: store odrzuci (jawne pochodzenie)
}

/** Testy: zapomnij stan modułu. */
export function resetValidationReporting() {
    trackedRun = null;
    active = new Set();
    rendered.clear();
}
