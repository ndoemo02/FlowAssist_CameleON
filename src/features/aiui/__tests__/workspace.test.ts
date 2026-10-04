import { describe, expect, it } from 'vitest';
import { resolveItem, workspaceChildren, workspaceMeta } from '../workspace';
import type { Surface } from '../reducer';

const chartItem = (extra: Record<string, unknown> = {}) => ({
    id: 'chart', component: 'WorkspaceItem', kind: 'chart', title: 'Zapytania',
    content: { path: '/items/chart' }, representations: ['ribbon3d', 'chart2d'], presentation: 'card', priority: 1, ...extra,
});
const series = [{ label: '2026', points: [{ x: 'Q1', y: 1 }, { x: 'Q2', y: 2 }] }];

const surface = (components: Surface['components'], data: Surface['data'] = {}): Surface =>
    ({ catalogId: 'flowassist/v2', components, data });

describe('workspace', () => {
    it('członkostwo = Workspace.children; brak roota → null', () => {
        expect(workspaceChildren(surface({}))).toBeNull();
        const s = surface({ root: { id: 'root', component: 'Workspace', children: ['chart', 'late'] }, chart: chartItem(), old: chartItem({ id: 'old' }) });
        expect(workspaceChildren(s)).toEqual(['chart', 'late']);
        expect(workspaceMeta(s)).toEqual([
            { id: 'chart', delivered: true, hint: 'card', priority: 1 },
            { id: 'late', delivered: false, hint: null, priority: 0 },
        ]);
    });

    it('brak komponentu lub danych → pending (szkielet), nie błąd', () => {
        const s = surface({ chart: chartItem() });
        expect(resolveItem(s, 'nope')).toMatchObject({ status: 'pending' });
        expect(resolveItem(s, 'chart')).toMatchObject({ status: 'pending', title: 'Zapytania' });
    });

    it('wybiera pierwszą obsługiwaną reprezentację (P10) i rozwiązuje treść', () => {
        const v = resolveItem(surface({ chart: chartItem() }, { items: { chart: { kind: 'line', series } } }), 'chart');
        expect(v).toMatchObject({ status: 'ready', representation: 'chart2d', kind: 'chart', hint: 'card' });
    });

    it('tylko nieobsługiwane reprezentacje → fallback', () => {
        const v = resolveItem(surface({ chart: chartItem({ representations: ['ribbon3d'] }) }, { items: { chart: { kind: 'line', series } } }), 'chart');
        expect(v).toMatchObject({ status: 'fallback', path: '/components/chart/representations' });
    });

    it('reprezentacja niedozwolona dla rodzaju → fallback ze ścieżką', () => {
        const v = resolveItem(surface({ chart: chartItem({ representations: ['table2d'] }) }, { items: { chart: { kind: 'line', series } } }), 'chart');
        expect(v).toMatchObject({ status: 'fallback', path: '/components/chart/representations/0' });
    });

    it('zła treść → fallback ze ścieżką w content', () => {
        const v = resolveItem(surface({ chart: chartItem() }, { items: { chart: { kind: 'pie', series } } }), 'chart');
        expect(v).toMatchObject({ status: 'fallback', path: '/components/chart/content/kind' });
    });

    it('aktualizacja danych zmienia treść, a niezmienione dane zachowują referencję', () => {
        const data1 = { items: { chart: { kind: 'line', series } } };
        const v1 = resolveItem(surface({ chart: chartItem() }, data1), 'chart');
        const v1b = resolveItem(surface({ chart: chartItem() }, data1), 'chart');
        expect(v1.status === 'ready' && v1b.status === 'ready' && v1.content === v1b.content).toBe(true);
        const v2 = resolveItem(surface({ chart: chartItem() }, { items: { chart: { kind: 'bar', series } } }), 'chart');
        expect(v2.status === 'ready' && v2.content.kind).toBe('bar');
    });
});
