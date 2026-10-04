import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTransport, useAiUi } from '../store';
import { MockTransport, type ScenarioScript } from '../transport/mockTransport';
import { resolveTree } from '../resolveTree';
import { FOCUS_ANGLE } from '../slots';
import type { ClientMessage } from '../contract';

const V = 'v0.9.1';

const script: ScenarioScript = {
    id: 'test',
    timeline: [
        { at: 0, event: { version: V, createSurface: { surfaceId: 'back-canvas', catalogId: 'flowassist/v1' } } },
        { at: 0, event: { version: V, updateComponents: { surfaceId: 'back-canvas', components: [
            { id: 'root', component: 'Stack', children: ['cards', 'next'] },
            { id: 'cards', component: 'InsightCards', items: { path: '/insights' } },
            { id: 'next', component: 'ActionBar', actions: [{ name: 'open_approval', label: 'Do akceptacji' }] },
        ] } } },
        { at: 100, event: { stage: { focus: 'back' } } },
        { at: 500, event: { version: V, updateDataModel: { surfaceId: 'back-canvas', path: '/insights', value: [{ title: 'Wzrost', value: '+18%' }] } } },
    ],
    responses: {
        open_approval: { steps: [
            { at: 200, event: { version: V, updateComponents: { surfaceId: 'back-canvas', components: [
                { id: 'root', component: 'Approval', title: 'Raport', summary: 'OK?' },
            ] } } },
        ] },
        approve: { terminal: true, steps: [{ at: 100, event: { narration: { text: 'Zatwierdzone' } } }] },
    },
};

let transport: MockTransport;

const st = () => useAiUi.getState();

beforeEach(() => {
    vi.useFakeTimers();
    useAiUi.setState(useAiUi.getInitialState(), true);
    transport = new MockTransport({ test: script });
    setTransport(transport);
    st().setSceneReady();
});

afterEach(() => {
    transport.stop();
    vi.useRealTimers();
});

describe('cykl przebiegu', () => {
    it('nie startuje przed gotowością sceny', () => {
        useAiUi.setState({ scene: { ready: false } });
        expect(st().startScenario('test')).toBe(false);
        expect(st().scenario.status).toBe('idle');
    });

    it('running → awaiting_action po ostatnim zdarzeniu osi → done po akcji terminalnej', () => {
        st().startScenario('test');
        expect(st().scenario.status).toBe('running');
        vi.advanceTimersByTime(1000);
        expect(st().scenario.status).toBe('awaiting_action');
        st().sendAction('approve', 'back-canvas', 'approval');
        vi.advanceTimersByTime(1000);
        expect(st().scenario.status).toBe('done');
        expect(st().narration.text).toBe('Zatwierdzone');
    });
});

describe('pętla action → transport → event → UI', () => {
    it('akcja nie zmienia surface’u, dopóki agent nie odeśle zdarzenia', () => {
        const sent: ClientMessage[] = [];
        const origSend = transport.send.bind(transport);
        transport.send = (m) => { sent.push(m); origSend(m); };

        st().startScenario('test');
        vi.advanceTimersByTime(1000);
        const before = st().surfaces['back-canvas'];

        st().sendAction('open_approval', 'back-canvas', 'next');
        expect(sent[0]).toMatchObject({ version: V, action: { name: 'open_approval', sourceComponentId: 'next' } });
        expect(st().surfaces['back-canvas']).toBe(before); // brak lokalnego przełączenia

        vi.advanceTimersByTime(250);
        expect(st().surfaces['back-canvas']!.components.root.component).toBe('Approval');
    });

    it('opóźnione dane uzupełniają wcześniej wyrenderowany komponent', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(150);
        const early = resolveTree(st().surfaces['back-canvas']!);
        expect(early).toMatchObject({ kind: 'component', children: [{ kind: 'pending', id: 'cards' }, { kind: 'component', id: 'next' }] });

        vi.advanceTimersByTime(500);
        const late = resolveTree(st().surfaces['back-canvas']!);
        expect(late).toMatchObject({ kind: 'component', children: [{ kind: 'component', id: 'cards' }, { kind: 'component', id: 'next' }] });
    });

    it('restart odcina zdarzenia starego przebiegu', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(150);
        const firstRun = st().scenario.runId;

        st().startScenario('test');
        expect(st().scenario.runId).toBe(firstRun + 1);
        expect(st().surfaces['back-canvas']).toBeUndefined(); // restart czyści stan poprzedniego przebiegu
        vi.advanceTimersByTime(1000);
        expect(st().scenario.status).toBe('awaiting_action');

        // Zdarzenie spóźnione ze starego runId musi zostać odrzucone.
        st().dispatch({ narration: { text: 'stare' } }, firstRun);
        expect(st().narration.text).toBeNull();
    });
});

describe('kamera i referencje stanu', () => {
    it('zmiana kąta nie kopiuje surfaces ani narration', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(1000);
        const { surfaces, narration } = st();
        st().setAngle(1.2, 'manual');
        st().tickCamera(0.016);
        expect(st().surfaces).toBe(surfaces);
        expect(st().narration).toBe(narration);
    });

    it('focus back obraca kamerę do π tweenem i kończy dokładnie na celu', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(150);
        expect(st().camera.tween).not.toBeNull();
        for (let i = 0; i < 200; i++) st().tickCamera(0.016);
        expect(st().camera.angle).toBeCloseTo(FOCUS_ANGLE.back, 6);
        expect(st().camera.tween).toBeNull();
    });

    it('powrót na front kończy się dokładnie na 0 (gałąź cinematic)', () => {
        useAiUi.setState({ camera: { angle: FOCUS_ANGLE.back, source: 'manual', tween: null } });
        st().dispatch({ stage: { focus: 'front' } });
        for (let i = 0; i < 200; i++) st().tickCamera(0.016);
        expect(st().camera.angle).toBe(0);
    });

    it('ręczny suwak przerywa auto-tween', () => {
        st().dispatch({ stage: { focus: 'back' } });
        st().tickCamera(0.3);
        st().setAngle(0.5, 'manual');
        expect(st().camera.tween).toBeNull();
        st().tickCamera(0.5);
        expect(st().camera.angle).toBe(0.5);
    });
});
