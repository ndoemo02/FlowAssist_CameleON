import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEvent } from '../contract';
import { collectFallbacks, resolveTree } from '../resolveTree';
import { researchDemo } from '../scenarios/researchDemo';
import { setTransport, useAiUi } from '../store';
import { MockTransport } from '../transport/mockTransport';

const allSteps = [researchDemo.timeline, ...Object.values(researchDemo.responses).map((r) => r.steps)].flat();

describe('scenariusz research: zgodność z kontraktem', () => {
    it('każde zdarzenie przechodzi parseEvent', () => {
        for (const step of allSteps) expect(parseEvent(step.event), JSON.stringify(step.event)).not.toBeNull();
    });
});

describe('scenariusz research: pełny przebieg', () => {
    let transport: MockTransport;
    const st = () => useAiUi.getState();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    beforeEach(() => {
        vi.useFakeTimers();
        warn.mockClear();
        useAiUi.setState(useAiUi.getInitialState(), true);
        transport = new MockTransport({ research: researchDemo });
        setTransport(transport);
        st().setSceneReady();
    });
    afterEach(() => { transport.stop(); vi.useRealTimers(); });

    const backTree = () => resolveTree(st().surfaces['back-canvas']!);

    it('oś czasu: taski → Back → wykres + karty bez fallbacków', () => {
        st().startScenario('research');
        vi.advanceTimersByTime(5500);
        const tasks = st().surfaces['tasks-drawer']!.data.tasks as Record<string, { status: string }>;
        expect(Object.values(tasks).every((t) => t.status === 'done')).toBe(true);
        expect(st().stage.drawer).toBe('open');

        vi.advanceTimersByTime(10_000);
        expect(st().stage).toEqual({ focus: 'back', drawer: 'closed' });
        expect(st().scenario.status).toBe('awaiting_action');
        expect(collectFallbacks(backTree())).toEqual([]);
        expect(backTree()).toMatchObject({ kind: 'component', type: 'Stack', children: [{ type: 'Chart' }, { type: 'InsightCards' }, { type: 'ActionBar' }] });
        expect(warn).not.toHaveBeenCalled();
    });

    it.each([
        ['deepen', 'Stack', ['DataTable', 'MapView', 'ActionBar']],
        ['open_presentation', 'Stack', ['Presentation', 'ActionBar']],
        ['open_approval', 'Approval', []],
    ])('akcja %s przełącza widok bez fallbacków', (action, rootType, childTypes) => {
        st().startScenario('research');
        vi.advanceTimersByTime(16_000);
        st().sendAction(action, 'back-canvas', 'next');
        vi.advanceTimersByTime(3000);
        const tree = backTree()!;
        expect(tree).toMatchObject({ kind: 'component', type: rootType });
        if (tree.kind === 'component') expect(tree.children.map((c) => (c.kind === 'component' ? c.type : c.kind))).toEqual(childTypes);
        expect(collectFallbacks(tree)).toEqual([]);
        expect(st().scenario.status).toBe('awaiting_action');
        expect(warn).not.toHaveBeenCalled();
    });

    it.each(['approve', 'reject', 'back'])('akcja %s kończy przebieg i wraca na Front', (action) => {
        st().startScenario('research');
        vi.advanceTimersByTime(16_000);
        st().sendAction(action, 'back-canvas', 'next');
        vi.advanceTimersByTime(3000);
        expect(st().scenario.status).toBe('done');
        expect(st().stage.focus).toBe('front');
    });
});
