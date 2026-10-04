import { describe, expect, it } from 'vitest';
import { resolveTree, type ResolvedNode } from '../resolveTree';
import type { Surface } from '../reducer';

// resolveTree obsługuje drzewa slotów HUD i tasków (TaskList, Approval); stół roboczy → workspace.test.ts
const surface = (components: Surface['components'], data: Surface['data'] = {}): Surface =>
    ({ catalogId: 'flowassist/v2', components, data });

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
        expect(tree).toMatchObject({ kind: 'component', type: 'TaskList' });
        expect(Object.keys(tree.props.tasks as object)).toEqual(['web', 'data']);
    });

    it('nieznany komponent daje fallback', () => {
        expect(resolveTree(surface({ root: { id: 'root', component: 'Iframe', src: 'http://x' } })))
            .toMatchObject({ kind: 'fallback', type: 'Iframe' });
    });

    it('złe propsy dają fallback z JSON Pointerem do pola', () => {
        expect(resolveTree(surface({ root: { id: 'root', component: 'Approval', title: 'X' } })))
            .toMatchObject({ kind: 'fallback', type: 'Approval', path: '/components/root/summary' });
    });

    it('brakujące dane z bindingu dają pending, a po dosłaniu danych pełny węzeł', () => {
        const comps = { root: { id: 'root', component: 'TaskList', tasks: { path: '/tasks' } } };
        expect(resolveTree(surface(comps))).toMatchObject({ kind: 'pending', type: 'TaskList' });
        expect(resolveTree(surface(comps, { tasks: { a: task('A', 1) } }))).toMatchObject({ kind: 'component', type: 'TaskList' });
    });

    it('wykrywa cykle (kontener z children)', () => {
        const tree = resolveTree(surface({
            root: { id: 'root', component: 'Workspace', children: ['a'] },
            a: { id: 'a', component: 'Workspace', children: ['root'] },
        })) as Extract<ResolvedNode, { kind: 'component' }>;
        const a = tree.children[0] as Extract<ResolvedNode, { kind: 'component' }>;
        expect(a).toMatchObject({ kind: 'component', id: 'a' });
        expect(a.children[0]).toMatchObject({ kind: 'fallback', reason: expect.stringContaining('cykl') });
    });

    it('ogranicza głębokość', () => {
        const comps: Surface['components'] = {};
        for (let i = 0; i < 12; i++) comps[i === 0 ? 'root' : `s${i}`] = { id: i === 0 ? 'root' : `s${i}`, component: 'Workspace', children: [`s${i + 1}`] };
        let node = resolveTree(surface(comps)) as ResolvedNode;
        let depth = 0;
        while (node.kind === 'component' && node.children.length) { node = node.children[0]; depth++; }
        expect(node).toMatchObject({ kind: 'fallback', reason: expect.stringContaining('głębok') });
        expect(depth).toBe(8);
    });
});
