import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEvent } from '../contract';
import { collectFallbacks, resolveTree } from '../resolveTree';
import { researchDemo } from '../scenarios/researchDemo';
import { resetManualInteraction, setTransport, useAiUi } from '../store';
import { MockTransport } from '../transport/mockTransport';
import { resolveItem, workspaceChildren } from '../workspace';

const allSteps = [researchDemo.timeline, ...Object.values(researchDemo.responses).map((r) => r.steps)].flat();

describe('scenariusz research v1.2: zgodność z kontraktem', () => {
    it('każde zdarzenie przechodzi parseEvent', () => {
        for (const step of allSteps) expect(parseEvent(step.event), JSON.stringify(step.event)).not.toBeNull();
    });
});

describe('scenariusz research v1.2: pełny przebieg', () => {
    let transport: MockTransport;
    const st = () => useAiUi.getState();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const items = () => (workspaceChildren(st().surfaces.workspace) ?? []).map((id) => resolveItem(st().surfaces.workspace!, id));

    beforeEach(() => {
        vi.useFakeTimers();
        warn.mockClear();
        resetManualInteraction();
        useAiUi.setState(useAiUi.getInitialState(), true);
        transport = new MockTransport({ research: researchDemo });
        setTransport(transport);
        st().setSceneReady();
    });
    afterEach(() => { transport.stop(); vi.useRealTimers(); });

    it('taski → stół (3 elementy bez fallbacków) → wykres na ekranie → linia planu → Approval', () => {
        st().startScenario('research');
        vi.advanceTimersByTime(5500);
        const tasks = st().surfaces['tasks-drawer']!.data.tasks as Record<string, { status: string }>;
        expect(Object.values(tasks).every((t) => t.status === 'done')).toBe(true);

        vi.advanceTimersByTime(3500); // 9000 ms
        for (let i = 0; i < 200; i++) st().tickCamera(0.016); // brak pętli klatek w testach — dojazd kamery na Back
        expect(st().camera.angle).toBeCloseTo(Math.PI, 6);
        expect(st().stage).toEqual({ focus: 'back', drawer: 'closed' });
        expect(items().map((v) => v.status)).toEqual(['ready', 'ready', 'ready']);
        expect(Object.values(st().layout).map((e) => e.presentation)).toEqual(['card', 'card', 'card']);

        vi.advanceTimersByTime(2000); // 11 000 ms — hint 'screen' dla wykresu
        expect(st().layout['chart-q'].presentation).toBe('screen');
        expect(st().camera.tween).not.toBeNull(); // P3: kamera jedzie na Front

        vi.advanceTimersByTime(3500); // 14 500 ms — dane wykresu zaktualizowane na ekranie
        const chart = resolveItem(st().surfaces.workspace!, 'chart-q');
        expect(chart.status === 'ready' && (chart.content.series as unknown[]).length).toBe(3);

        vi.advanceTimersByTime(6000); // 20 500 ms — Approval w HUD
        expect(collectFallbacks(resolveTree(st().surfaces.hud!))).toEqual([]);
        expect(st().surfaces.hud!.components.root.component).toBe('Approval');
        expect(st().scenario.status).toBe('awaiting_action');
        expect(warn).not.toHaveBeenCalled();
    });

    it('C6: element zaktualizowany na ekranie wraca na stół z aktualną treścią', () => {
        st().startScenario('research');
        vi.advanceTimersByTime(14_500);
        st().layoutCommand({ type: 'toCard', id: 'chart-q' });
        const chart = resolveItem(st().surfaces.workspace!, 'chart-q');
        expect(st().layout['chart-q'].presentation).toBe('card');
        expect(chart.status === 'ready' && (chart.content.series as unknown[]).length).toBe(3);
    });

    it('„Pogłęb” dokłada mapę; zmiana hintu dla ukrytego KPI jest ignorowana (P5)', () => {
        st().startScenario('research');
        vi.advanceTimersByTime(20_500);
        st().layoutCommand({ type: 'dismiss', id: 'kpis' });
        st().sendAction('deepen', 'workspace', 'districts', { itemId: 'districts' });
        vi.advanceTimersByTime(2000);
        expect(workspaceChildren(st().surfaces.workspace)).toEqual(['chart-q', 'kpis', 'districts', 'district-map']);
        expect(resolveItem(st().surfaces.workspace!, 'district-map')).toMatchObject({ status: 'ready', representation: 'map2d' });
        expect(st().layout.kpis.presentation).toBe('dismissed');
        expect(st().layout.kpis.lastHint).toBe('focus');
        expect(warn).not.toHaveBeenCalled();
    });

    it('bez ukrycia ten sam hint KPI ustawia focus', () => {
        st().startScenario('research');
        vi.advanceTimersByTime(20_500);
        st().sendAction('deepen', 'workspace', 'districts', { itemId: 'districts' });
        vi.advanceTimersByTime(2000);
        expect(st().layout.kpis.presentation).toBe('focus');
    });

    it.each(['approve', 'reject'])('akcja %s kończy przebieg, zamyka HUD i wraca na Front', (action) => {
        st().startScenario('research');
        vi.advanceTimersByTime(20_500);
        st().sendAction(action, 'hud', 'root');
        vi.advanceTimersByTime(3000);
        expect(st().scenario.status).toBe('done');
        expect(st().surfaces.hud).toBeUndefined();
        expect(st().stage.focus).toBe('front');
    });
});
