import { describe, expect, it } from 'vitest';
import { resolveTree, type ResolvedNode } from '../resolveTree';
import type { Surface } from '../reducer';

const surface = (components: Surface['components'], data: Surface['data'] = {}): Surface =>
    ({ catalogId: 'flowassist/v1', components, data });

const task = (title: string, order: number) => ({ title, agent: 'Scout', status: 'running', progress: 0.4, order });

describe('resolveTree', () => {
    it('zwraca null, gdy nie ma jeszcze komponentu root', () => {
        expect(resolveTree(surface({}))).toBeNull();
    });

    it('rozwiązuje binding do mapy tasków (TaskList przyjmuje Record<id, Task>)', () => {
        const tree = resolveTree(surface(
            { root: { id: 'root', component: 'TaskList', tasks: { path: '/tasks' } } },
            { tasks: { web: task('Web', 1), data: task('Dane', 2) } },
        )) as Extract<ResolvedNode, { kind: 'component' }>;
        expect(tree.kind).toBe('component');
        expect(tree.type).toBe('TaskList');
        expect(Object.keys(tree.props.tasks as object)).toEqual(['web', 'data']);
    });

    it('nieznany komponent daje fallback', () => {
        const tree = resolveTree(surface({ root: { id: 'root', component: 'Iframe', src: 'http://x' } }));
        expect(tree).toMatchObject({ kind: 'fallback', type: 'Iframe' });
    });

    it('złe propsy dają fallback z JSON Pointerem do pola', () => {
        const tree = resolveTree(surface({ root: { id: 'root', component: 'Chart', kind: 'pie', series: [] } }));
        expect(tree).toMatchObject({ kind: 'fallback', type: 'Chart', path: '/components/root/kind' });
    });

    it('brakujące dane z bindingu dają pending, a po dosłaniu danych pełny węzeł', () => {
        const comps = { root: { id: 'root', component: 'InsightCards', items: { path: '/insights' } } };
        expect(resolveTree(surface(comps))).toMatchObject({ kind: 'pending', type: 'InsightCards' });

        const later = resolveTree(surface(comps, { insights: [{ title: 'Wzrost', value: '+18%', delta: 'up' }] }));
        expect(later).toMatchObject({ kind: 'component', type: 'InsightCards' });
    });

    it('składa dzieci Stack po id i pomija jeszcze nieprzysłane', () => {
        const tree = resolveTree(surface({
            root: { id: 'root', component: 'Stack', children: ['next', 'missing'] },
            next: { id: 'next', component: 'ActionBar', actions: [{ name: 'back', label: 'Wróć' }] },
        })) as Extract<ResolvedNode, { kind: 'component' }>;
        expect(tree.children.map((c) => c.id)).toEqual(['next']);
    });

    it('wykrywa cykle', () => {
        const tree = resolveTree(surface({
            root: { id: 'root', component: 'Stack', children: ['a'] },
            a: { id: 'a', component: 'Stack', children: ['root'] },
        })) as Extract<ResolvedNode, { kind: 'component' }>;
        expect(tree.children[0]).toMatchObject({ kind: 'component', id: 'a' });
        expect((tree.children[0] as Extract<ResolvedNode, { kind: 'component' }>).children[0]).toMatchObject({ kind: 'fallback', reason: expect.stringContaining('cykl') });
    });

    it('ogranicza głębokość', () => {
        const comps: Surface['components'] = {};
        for (let i = 0; i < 12; i++) comps[i === 0 ? 'root' : `s${i}`] = { id: i === 0 ? 'root' : `s${i}`, component: 'Stack', children: [`s${i + 1}`] };
        let node = resolveTree(surface(comps)) as ResolvedNode;
        let depth = 0;
        while (node.kind === 'component' && node.children.length) { node = node.children[0]; depth++; }
        expect(node).toMatchObject({ kind: 'fallback', reason: expect.stringContaining('głębok') });
        expect(depth).toBe(8);
    });
});
