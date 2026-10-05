// Raport VALIDATION_FAILED do agenta (review #5, I6/I10) — jedno zgłoszenie na WYSTĄPIENIE problemu.
//
// - Problemy walidacji liczone są ze stanu (czyste resolveItem / resolveTree), a nie z zamontowanych widoków:
//   karta i panel ekranu, remount, zamknięty HUD czy szuflada nie zmieniają liczby raportów.
// - Wystąpienie trwa do ODZYSKANIA (decyzja właściciela po weryfikacji Astry):
//   - problem walidacji: węzeł wraca do `ready` (pending to jeszcze nie odzyskanie);
//   - błąd renderu (RenderGuard): zatwierdzony udany render — po ponowieniu albo pierwszy render nowej instancji
//     (remount panelu). Sama zmiana danych ani samo odmontowanie odzyskaniem nie są.
//   Zniknięcie węzła (lub nowy przebieg) też kończy wystąpienie. Po odzyskaniu nawrót = nowy raport.
// - Każdy raport niesie przebieg, w którym powstał; store wysyła go tylko w tym samym, aktywnym przebiegu.
// Instaluje go warstwa UI (AiUiOverlay) — koordynator (store.dispatch) nie raportuje fallbacków.

import { SURFACE_IDS, type ClientError, type SurfaceId } from './contract';
import { resolveTree, type ResolvedNode } from './resolveTree';
import { resolveItem, workspaceChildren } from './workspace';
import { useAiUi, type AiUiState } from './store';

export interface Problem { surfaceId: SurfaceId; nodeId: string; path: string; message: string }
// 'unavailable' = członek drzewa, którego rozwiązanie się nie odbyło (np. pod rodzicem w pending) — ani odzyskany, ani usunięty
type NodeStatus = 'ready' | 'pending' | 'fallback' | 'unavailable';

const toError = (p: Problem): ClientError => ({ code: 'VALIDATION_FAILED', surfaceId: p.surfaceId, path: p.path, message: p.message });
// klucze z płytkiej tablicy napisów — id od agenta mogą zawierać dowolne znaki
const nodeKey = (surfaceId: SurfaceId, nodeId: string) => JSON.stringify([surfaceId, nodeId]);

/**
 * Członkostwo drzewa slotu z grafu definicji (root → children), a nie z rozwiązanego drzewa: potomek rodzica
 * w pending nadal jest członkiem. Iteracyjnie — definicje od agenta mogą być dowolnie głębokie / cykliczne.
 */
function treeMembers(components: Record<string, { children?: string[] }>): Set<string> {
    const members = new Set<string>();
    const stack = ['root'];
    while (stack.length) {
        const id = stack.pop()!;
        if (members.has(id) || !Object.prototype.hasOwnProperty.call(components, id)) continue;
        members.add(id);
        for (const child of components[id].children ?? []) stack.push(child);
    }
    return members;
}

/** Stan walidacji każdego obecnego węzła i problemy (fallbacki) — z samego stanu surface'ów. */
export function scanSurfaces(surfaces: AiUiState['surfaces']) {
    const problems: Problem[] = [];
    const nodes = new Map<string, NodeStatus>();
    for (const surfaceId of SURFACE_IDS) {
        const surface = surfaces[surfaceId];
        if (!surface) continue;
        if (surfaceId === 'workspace') {
            for (const id of workspaceChildren(surface) ?? []) {
                const view = resolveItem(surface, id);
                nodes.set(nodeKey(surfaceId, id), view.status);
                if (view.status === 'fallback') problems.push({ surfaceId, nodeId: id, path: view.path, message: view.reason });
            }
        } else {
            treeMembers(surface.components).forEach((id) => nodes.set(nodeKey(surfaceId, id), 'unavailable'));
            const visit = (n: ResolvedNode) => {
                nodes.set(nodeKey(surfaceId, n.id), n.kind === 'component' ? 'ready' : n.kind);
                if (n.kind === 'fallback') problems.push({ surfaceId, nodeId: n.id, path: n.path ?? `/components/${n.id}`, message: n.reason });
                if (n.kind === 'component') n.children.forEach(visit);
            };
            const tree = resolveTree(surface);
            if (tree) visit(tree);
        }
    }
    return { problems, nodes };
}

// Stan modułu (jeden overlay na stronę; restart efektu w StrictMode nie zgłasza ponownie).
// Wartość = klucz węzła, którego dotyczy wystąpienie.
let trackedRun: number | null = null;
const active = new Map<string, string>();          // trwające wystąpienia problemów walidacji
const renderActive = new Map<string, string>();    // trwające wystąpienia błędów renderu

function trackRun(runId: number) {
    if (runId === trackedRun) return;
    trackedRun = runId;
    active.clear();
    renderActive.clear();
}

function sync(state: AiUiState) {
    const runId = state.scenario.runId;
    trackRun(runId);
    const { problems, nodes } = scanSurfaces(state.surfaces);
    // koniec wystąpień: walidacja wróciła do ready albo węzeł nie jest już członkiem (błąd renderu — tylko to drugie);
    // 'unavailable' (np. pod rodzicem w pending) i 'pending' nie kończą wystąpienia
    active.forEach((node, k) => { const s = nodes.get(node); if (s === undefined || s === 'ready') active.delete(k); });
    renderActive.forEach((node, k) => { if (!nodes.has(node)) renderActive.delete(k); });
    for (const p of problems) {
        const k = JSON.stringify([p.surfaceId, p.nodeId, p.path, p.message]);
        if (active.has(k)) continue;
        active.set(k, nodeKey(p.surfaceId, p.nodeId));
        state.reportClientError(toError(p), { runId });
    }
}

/** Subskrypcja stanu: raportuje nowe wystąpienia problemów. Zwraca funkcję wyłączającą. */
export function startValidationReporting(): () => void {
    sync(useAiUi.getState());
    return useAiUi.subscribe((s, prev) => {
        if (s.surfaces !== prev.surfaces || s.scenario.runId !== prev.scenario.runId) sync(s);
    });
}

/** Błąd renderu z lokalnego boundary; `runId` = przebieg z chwili renderu. Raz na wystąpienie. */
export function reportRenderProblem(p: Problem, runId: number) {
    const state = useAiUi.getState();
    if (runId === state.scenario.runId) {
        trackRun(runId);
        const k = JSON.stringify([p.surfaceId, p.nodeId, p.message]);
        if (renderActive.has(k)) return;
        renderActive.set(k, nodeKey(p.surfaceId, p.nodeId));
    }
    state.reportClientError(toError(p), { runId }); // inny przebieg: store odrzuci (jawne pochodzenie)
}

/**
 * Zatwierdzony udany render węzła (RenderGuard: po montażu albo po ponowieniu) — koniec wystąpień błędu renderu
 * tego węzła. `runId` = przebieg z chwili renderu: render z innego przebiegu niczego nie zamyka.
 */
export function resolveRenderProblem(surfaceId: SurfaceId, nodeId: string, runId: number) {
    if (runId !== useAiUi.getState().scenario.runId) return;
    const node = nodeKey(surfaceId, nodeId);
    renderActive.forEach((n, k) => { if (n === node) renderActive.delete(k); });
}

/** Testy: zapomnij stan modułu. */
export function resetValidationReporting() {
    trackedRun = null;
    active.clear();
    renderActive.clear();
}
