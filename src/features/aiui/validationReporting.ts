// Raport VALIDATION_FAILED do agenta (review #5, I6/I10) — jedno zgłoszenie na WYSTĄPIENIE problemu.
//
// - Problemy walidacji liczone są ze stanu (czyste resolveItem / resolveTree), a nie z zamontowanych widoków:
//   karta i panel ekranu, remount, zamknięty HUD czy szuflada nie zmieniają liczby raportów.
// - Wystąpienie trwa do ODZYSKANIA (decyzja właściciela po weryfikacji Astry):
//   - problem walidacji: węzeł wraca do `ready` (pending to jeszcze nie odzyskanie);
//   - błąd renderu (RenderGuard): zatwierdzony udany render — po ponowieniu albo pierwszy render nowej instancji
//     (remount panelu). Sama zmiana danych ani samo odmontowanie odzyskaniem nie są.
//     Odzyskanie liczone PER WARIANT renderowania (gęstość: card / screen; węzeł slotu: slot), przy wspólnym
//     wystąpieniu problemu: pierwszy zawodzący wariant raportuje, kolejne tylko dołączają; udany render jednego
//     wariantu nie zamyka błędu innego. Wystąpienie kończy się, gdy żaden wariant już nie zawodzi.
//   Zniknięcie węzła (lub nowy przebieg) też kończy wystąpienie. Po odzyskaniu nawrót = nowy raport.
// - ZAŁOŻENIE granulacji wariantu (definicja główna; ADR 0003 tylko odsyła): dla jednego elementu istnieje
//   najwyżej jedna aktywna instancja danego wariantu renderowania (card, screen, slot) — dziś: WorkspaceCard
//   (card), ScreenPanel (screen), węzeł SurfaceRenderer (slot). Jeśli kiedyś dopuścimy dwie instancje tej samej
//   gęstości, klucz wariantu musi dostać identyfikator miejsca montowania (mount/location identity).
// - Błędy struktury (FU-1) też pochodzą ze stanu: komponent katalogu bez widoku w slocie (HUD, szuflada)
//   oraz root surface'u `workspace`, który nie jest `Workspace`. Brak roota to pending, nie błąd.
// - Każdy raport niesie przebieg, w którym powstał; store wysyła go tylko w tym samym, aktywnym przebiegu.
// Instaluje go warstwa UI (AiUiOverlay) — koordynator (store.dispatch) nie raportuje fallbacków.

import { SURFACE_IDS, type ClientError, type SurfaceId } from './contract';
import { resolveTree, type ResolvedNode } from './resolveTree';
import { resolveItem, workspaceChildren } from './workspace';
import { SLOT_UNAVAILABLE_REASON, TREE_VIEWS } from './registry';
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
            // FU-1: root stołu musi być Workspace (inny komponent = błąd struktury; brak roota = pending)
            const root = surface.components.root;
            if (root) {
                const rootOk = root.component === 'Workspace';
                nodes.set(nodeKey(surfaceId, 'root'), rootOk ? 'ready' : 'fallback');
                if (!rootOk) problems.push({ surfaceId, nodeId: 'root', path: '/components/root/component', message: `oczekiwano Workspace, jest ${root.component}` });
            }
            for (const id of workspaceChildren(surface) ?? []) {
                const view = resolveItem(surface, id);
                nodes.set(nodeKey(surfaceId, id), view.status);
                if (view.status === 'fallback') problems.push({ surfaceId, nodeId: id, path: view.path, message: view.reason });
            }
        } else {
            treeMembers(surface.components).forEach((id) => nodes.set(nodeKey(surfaceId, id), 'unavailable'));
            const visit = (n: ResolvedNode) => {
                // FU-1: komponent katalogu bez widoku w slocie = błąd struktury (SurfaceRenderer rysuje fallback)
                const noSlotView = n.kind === 'component' && !TREE_VIEWS[n.type];
                nodes.set(nodeKey(surfaceId, n.id), n.kind === 'component' ? (noSlotView ? 'fallback' : 'ready') : n.kind);
                if (noSlotView) problems.push({ surfaceId, nodeId: n.id, path: `/components/${n.id}/component`, message: SLOT_UNAVAILABLE_REASON });
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
// trwające wystąpienia błędów renderu: węzeł + warianty renderowania, które zawiodły i jeszcze się nie odzyskały
const renderActive = new Map<string, { node: string; failing: Set<string> }>();

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
    renderActive.forEach((o, k) => { if (!nodes.has(o.node)) renderActive.delete(k); });
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

/**
 * Błąd renderu z lokalnego boundary w wariancie `variant`; `runId` = przebieg z chwili renderu.
 * Raz na wystąpienie: kolejny zawodzący wariant tylko dołącza do trwającego wystąpienia.
 */
export function reportRenderProblem(p: Problem, variant: string, runId: number) {
    const state = useAiUi.getState();
    if (runId === state.scenario.runId) {
        trackRun(runId);
        const k = JSON.stringify([p.surfaceId, p.nodeId, p.message]);
        const open = renderActive.get(k);
        if (open) { open.failing.add(variant); return; }
        renderActive.set(k, { node: nodeKey(p.surfaceId, p.nodeId), failing: new Set([variant]) });
    }
    state.reportClientError(toError(p), { runId }); // inny przebieg: store odrzuci (jawne pochodzenie)
}

/**
 * Zatwierdzony udany render węzła w wariancie `variant` (RenderGuard: po montażu albo po ponowieniu) — ten wariant
 * się odzyskał; wystąpienie kończy się, gdy nie zawodzi już żaden wariant. `runId` = przebieg z chwili renderu:
 * render z innego przebiegu niczego nie zamyka.
 */
export function resolveRenderProblem(surfaceId: SurfaceId, nodeId: string, variant: string, runId: number) {
    if (runId !== useAiUi.getState().scenario.runId) return;
    const node = nodeKey(surfaceId, nodeId);
    renderActive.forEach((o, k) => {
        if (o.node !== node) return;
        o.failing.delete(variant);
        if (o.failing.size === 0) renderActive.delete(k);
    });
}

/** Testy: zapomnij stan modułu. */
export function resetValidationReporting() {
    trackedRun = null;
    active.clear();
    renderActive.clear();
}
