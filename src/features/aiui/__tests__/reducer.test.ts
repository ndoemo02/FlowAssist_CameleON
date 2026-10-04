import { describe, expect, it } from 'vitest';
import { initialCoreState, reduce, type CoreState } from '../reducer';
import type { AiUiEvent } from '../contract';

const V = 'v0.9.1' as const;
const create = (surfaceId: 'workspace' | 'tasks-drawer'): AiUiEvent =>
    ({ version: V, createSurface: { surfaceId, catalogId: 'flowassist/v2' } });

function run(events: AiUiEvent[], start: CoreState = initialCoreState()) {
    return events.reduce(
        (acc, ev) => {
            const r = reduce(acc.state, ev);
            return { state: r.state, effects: [...acc.effects, ...r.effects] };
        },
        { state: start, effects: [] as ReturnType<typeof reduce>['effects'] },
    );
}

describe('reducer: surface lifecycle', () => {
    it('createSurface tworzy pusty surface', () => {
        const { state } = run([create('workspace')]);
        expect(state.surfaces['workspace']).toEqual({ catalogId: 'flowassist/v2', components: {}, data: {} });
    });

    it('duplikat createSurface jest odrzucany bez resetu i raportowany', () => {
        const { state, effects } = run([
            create('workspace'),
            { version: V, updateDataModel: { surfaceId: 'workspace', path: '/x', value: 1 } },
            create('workspace'),
        ]);
        expect(state.surfaces['workspace']?.data).toEqual({ x: 1 });
        expect(effects).toContainEqual(expect.objectContaining({ type: 'reportError', error: expect.objectContaining({ code: 'SURFACE_EXISTS' }) }));
    });

    it('deleteSurface usuwa surface', () => {
        const { state } = run([create('tasks-drawer'), { version: V, deleteSurface: { surfaceId: 'tasks-drawer' } }]);
        expect(state.surfaces['tasks-drawer']).toBeUndefined();
    });

    it('update do nieistniejącego surface’u raportuje błąd bez crasha', () => {
        const { state, effects } = run([{ version: V, updateDataModel: { surfaceId: 'workspace', path: '/x', value: 1 } }]);
        expect(state.surfaces['workspace']).toBeUndefined();
        expect(effects[0]).toMatchObject({ type: 'reportError', error: { code: 'SURFACE_NOT_FOUND' } });
    });
});

describe('reducer: komponenty i data model', () => {
    it('updateComponents robi upsert po id (podmiana root = zmiana widoku)', () => {
        const { state } = run([
            create('workspace'),
            { version: V, updateComponents: { surfaceId: 'workspace', components: [
                { id: 'root', component: 'Workspace', children: ['chart'] },
                { id: 'chart', component: 'Chart', kind: 'line' },
            ] } },
            { version: V, updateComponents: { surfaceId: 'workspace', components: [{ id: 'root', component: 'Approval' }] } },
        ]);
        const comps = state.surfaces['workspace']!.components;
        expect(comps.root.component).toBe('Approval');
        expect(comps.chart.component).toBe('Chart');
    });

    it('updateDataModel ustawia, usuwa i zastępuje model', () => {
        const base = [create('tasks-drawer')];
        const set = run([...base, { version: V, updateDataModel: { surfaceId: 'tasks-drawer', path: '/tasks/web', value: { progress: 0.2 } } }]);
        expect(set.state.surfaces['tasks-drawer']!.data).toEqual({ tasks: { web: { progress: 0.2 } } });

        const removed = reduce(set.state, { version: V, updateDataModel: { surfaceId: 'tasks-drawer', path: '/tasks/web' } });
        expect(removed.state.surfaces['tasks-drawer']!.data).toEqual({ tasks: {} });

        const replaced = reduce(set.state, { version: V, updateDataModel: { surfaceId: 'tasks-drawer', value: { fresh: true } } });
        expect(replaced.state.surfaces['tasks-drawer']!.data).toEqual({ fresh: true });
    });

    it('zmiana jednego surface’u zachowuje referencję drugiego', () => {
        const { state } = run([create('workspace'), create('tasks-drawer')]);
        const next = reduce(state, { version: V, updateDataModel: { surfaceId: 'tasks-drawer', path: '/a', value: 1 } }).state;
        expect(next.surfaces['workspace']).toBe(state.surfaces['workspace']);
        expect(next.narration).toBe(state.narration);
    });
});

describe('reducer: stage i narration', () => {
    it('stage.focus zmienia fokus i emituje efekt focus', () => {
        const { state, effects } = run([{ stage: { focus: 'back', drawer: 'closed' } }]);
        expect(state.stage).toEqual({ focus: 'back', drawer: 'closed' });
        expect(effects).toContainEqual({ type: 'focus', focus: 'back' });
    });

    it('stage bez zmian nie tworzy nowego obiektu', () => {
        const s = initialCoreState();
        expect(reduce(s, { stage: { focus: 'front' } }).state.stage).toBe(s.stage);
    });

    it('narration ustawia tekst, a speak emituje efekt TTS', () => {
        const { state, effects } = run([{ narration: { text: 'Wynik gotowy', speak: true } }]);
        expect(state.narration.text).toBe('Wynik gotowy');
        expect(effects).toContainEqual({ type: 'speak', text: 'Wynik gotowy' });
        expect(reduce(state, { narration: { text: null } }).state.narration.text).toBeNull();
    });
});
