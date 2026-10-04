// Czysty reducer warstwy AI-to-UI: (state, event) => { state, effects }.
// Efekty (TTS, raport błędu do agenta, obrót kamery) wykonuje store — nie reducer.

import { CATALOG_ID, type A2Component, type AiUiEvent, type ClientError, type DrawerState, type Focus, type SurfaceId } from './contract';
import { setAt } from './jsonPointer';

export interface Surface {
    catalogId: typeof CATALOG_ID;
    components: Record<string, A2Component>;
    data: Record<string, unknown>;
}

export interface CoreState {
    surfaces: Partial<Record<SurfaceId, Surface>>;
    stage: { focus: Focus; drawer: DrawerState };
    narration: { text: string | null; speaker: 'amber' };
}

export type Effect =
    | { type: 'focus'; focus: Focus }
    | { type: 'speak'; text: string }
    | { type: 'reportError'; error: ClientError };

export const initialCoreState = (): CoreState => ({
    surfaces: {},
    stage: { focus: 'front', drawer: 'closed' },
    narration: { text: null, speaker: 'amber' },
});

type Result = { state: CoreState; effects: Effect[] };

const reportError = (state: CoreState, surfaceId: SurfaceId, code: string, message: string): Result =>
    ({ state, effects: [{ type: 'reportError', error: { code, surfaceId, message } }] });

const withSurface = (state: CoreState, id: SurfaceId, surface: Surface | undefined): CoreState => {
    const surfaces = { ...state.surfaces };
    if (surface) surfaces[id] = surface;
    else delete surfaces[id];
    return { ...state, surfaces };
};

export function reduce(state: CoreState, ev: AiUiEvent): Result {
    if ('stage' in ev) {
        const focus = ev.stage.focus ?? state.stage.focus;
        const drawer = ev.stage.drawer ?? state.stage.drawer;
        const effects: Effect[] = ev.stage.focus ? [{ type: 'focus', focus: ev.stage.focus }] : [];
        if (focus === state.stage.focus && drawer === state.stage.drawer) return { state, effects };
        return { state: { ...state, stage: { focus, drawer } }, effects };
    }

    if ('narration' in ev) {
        const { text, speak } = ev.narration;
        return {
            state: { ...state, narration: { ...state.narration, text } },
            effects: speak && text ? [{ type: 'speak', text }] : [],
        };
    }

    if ('createSurface' in ev) {
        const { surfaceId } = ev.createSurface;
        if (state.surfaces[surfaceId]) {
            return reportError(state, surfaceId, 'SURFACE_EXISTS', `Surface "${surfaceId}" już istnieje — wyślij najpierw deleteSurface.`);
        }
        return { state: withSurface(state, surfaceId, { catalogId: CATALOG_ID, components: {}, data: {} }), effects: [] };
    }

    if ('deleteSurface' in ev) {
        const { surfaceId } = ev.deleteSurface;
        if (!state.surfaces[surfaceId]) return reportError(state, surfaceId, 'SURFACE_NOT_FOUND', `Brak surface "${surfaceId}".`);
        return { state: withSurface(state, surfaceId, undefined), effects: [] };
    }

    if ('updateComponents' in ev) {
        const { surfaceId, components } = ev.updateComponents;
        const surface = state.surfaces[surfaceId];
        if (!surface) return reportError(state, surfaceId, 'SURFACE_NOT_FOUND', `Brak surface "${surfaceId}".`);
        const next = { ...surface.components };
        for (const c of components) next[c.id] = c;
        return { state: withSurface(state, surfaceId, { ...surface, components: next }), effects: [] };
    }

    // updateDataModel
    const { surfaceId, path = '/', value } = ev.updateDataModel;
    const surface = state.surfaces[surfaceId];
    if (!surface) return reportError(state, surfaceId, 'SURFACE_NOT_FOUND', `Brak surface "${surfaceId}".`);
    const data = setAt(surface.data, path, value) as Record<string, unknown>;
    return { state: withSurface(state, surfaceId, { ...surface, data }), effects: [] };
}
