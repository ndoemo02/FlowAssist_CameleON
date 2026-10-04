import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetManualInteraction, selectScreenBusy, setTransport, useAiUi } from '../store';
import { MockTransport, type ScenarioScript } from '../transport/mockTransport';
import { resolveItem } from '../workspace';
import { FOCUS_ANGLE } from '../slots';
import type { ClientMessage } from '../contract';

const V = 'v0.9.1';
const ws = (components: object[]) => ({ version: V, updateComponents: { surfaceId: 'workspace', components } });
const CHART = { id: 'chart', component: 'WorkspaceItem', kind: 'chart', title: 'Wykres', content: { path: '/items/chart' }, representations: ['chart2d'], presentation: 'card', priority: 1 };
const KPIS = { id: 'kpis', component: 'WorkspaceItem', kind: 'kpi', title: 'KPI', content: { path: '/items/kpis' }, representations: ['cards2d'], presentation: 'card', priority: 2 };
const MAP = { id: 'map', component: 'WorkspaceItem', kind: 'map', title: 'Mapa', content: { path: '/items/map' }, representations: ['map2d'], priority: 3 };
const series = [{ label: '2026', points: [{ x: 'Q1', y: 1 }, { x: 'Q2', y: 2 }] }];

const script: ScenarioScript = {
    id: 'test',
    timeline: [
        { at: 0, event: { version: V, createSurface: { surfaceId: 'workspace', catalogId: 'flowassist/v2' } } },
        { at: 0, event: ws([{ id: 'root', component: 'Workspace', children: ['chart', 'kpis'] }, CHART, KPIS]) },
        { at: 100, event: { stage: { focus: 'back' } } },
        { at: 500, event: { version: V, updateDataModel: { surfaceId: 'workspace', path: '/items/chart', value: { kind: 'line', series } } } },
        { at: 600, event: { version: V, updateDataModel: { surfaceId: 'workspace', path: '/items/kpis', value: { items: [{ title: 'Wzrost', value: '+18%' }] } } } },
    ],
    responses: {
        present: { steps: [{ at: 100, event: ws([{ ...CHART, presentation: 'screen' }]) }] },
        deepen: { steps: [
            { at: 0, event: { version: V, updateDataModel: { surfaceId: 'workspace', path: '/items/map', value: { points: [{ label: 'A', x: 0.5, y: 0.5 }] } } } },
            { at: 200, event: ws([{ id: 'root', component: 'Workspace', children: ['chart', 'kpis', 'map'] }, MAP]) },
        ] },
        approve: { terminal: true, steps: [{ at: 100, event: { narration: { text: 'Zatwierdzone' } } }] },
    },
};

let transport: MockTransport;
let sent: ClientMessage[];
const st = () => useAiUi.getState();
const settle = () => { for (let i = 0; i < 200; i++) st().tickCamera(0.016); };

beforeEach(() => {
    vi.useFakeTimers();
    resetManualInteraction();
    useAiUi.setState(useAiUi.getInitialState(), true);
    transport = new MockTransport({ test: script });
    sent = [];
    const origSend = transport.send.bind(transport);
    transport.send = (m) => { sent.push(m); origSend(m); };
    setTransport(transport);
    st().setSceneReady();
    resetManualInteraction(); // setSceneReady nie obraca, ale testy startują bez „ręcznego” obrotu
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

    it('running → awaiting_action → done po akcji terminalnej', () => {
        st().startScenario('test');
        expect(st().scenario.status).toBe('running');
        vi.advanceTimersByTime(1000);
        expect(st().scenario.status).toBe('awaiting_action');
        st().sendAction('approve', 'hud', 'root');
        vi.advanceTimersByTime(1000);
        expect(st().scenario.status).toBe('done');
        expect(st().narration.text).toBe('Zatwierdzone');
    });
});

describe('pętla action → transport → event → UI', () => {
    it('akcja nie zmienia stołu, dopóki agent nie odeśle zdarzeń; context niesie itemId i migawkę układu', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(1000);
        st().layoutCommand({ type: 'dismiss', id: 'kpis' });
        const before = st().surfaces.workspace;

        st().sendAction('deepen', 'workspace', 'chart', { itemId: 'chart' });
        expect(sent.at(-1)).toMatchObject({
            version: V,
            action: { name: 'deepen', sourceComponentId: 'chart', context: { itemId: 'chart', workspace: { screen: null, focus: null, dismissed: ['kpis'] } } },
        });
        expect(st().surfaces.workspace).toBe(before);
        expect(st().layout.map).toBeUndefined();

        vi.advanceTimersByTime(300);
        expect(st().layout.map).toMatchObject({ presentation: 'card' });
        expect(resolveItem(st().surfaces.workspace!, 'map')).toMatchObject({ status: 'ready', representation: 'map2d' });
    });

    it('zmiany formy (drag/resize/focus/ukryj) nie wysyłają nic do agenta', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(1000);
        const n = sent.length;
        const e = st().layout.chart;
        st().layoutCommand({ type: 'focus', id: 'chart' });
        st().layoutCommand({ type: 'move', id: 'chart', x: 0.2, y: 0.2, rev: e.rev });
        st().layoutCommand({ type: 'resize', id: 'chart', scale: 1.4 });
        st().layoutCommand({ type: 'dismiss', id: 'kpis' });
        expect(sent.length).toBe(n);
    });

    it('opóźnione dane: element najpierw pending, potem gotowy', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(150);
        expect(resolveItem(st().surfaces.workspace!, 'chart')).toMatchObject({ status: 'pending' });
        vi.advanceTimersByTime(400);
        expect(resolveItem(st().surfaces.workspace!, 'chart')).toMatchObject({ status: 'ready' });
    });

    it('restart odcina zdarzenia starego przebiegu i czyści układ (P7)', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(150);
        st().layoutCommand({ type: 'dismiss', id: 'kpis' });
        const firstRun = st().scenario.runId;

        st().startScenario('test');
        expect(st().scenario.runId).toBe(firstRun + 1);
        expect(st().surfaces.workspace).toBeUndefined();
        expect(st().layout).toEqual({});
        st().dispatch({ narration: { text: 'stare' } }, firstRun);
        expect(st().narration.text).toBeNull();

        vi.advanceTimersByTime(1000);
        expect(st().layout.kpis.presentation).toBe('card'); // ukrycie z poprzedniego przebiegu nie przeżyło restartu
    });

    it('deleteSurface(workspace) resetuje układ (P7)', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(1000);
        st().dispatch({ version: V, deleteSurface: { surfaceId: 'workspace' } });
        expect(st().layout).toEqual({});
    });
});

describe('trwałe zakończenie przebiegu (Astra #2)', () => {
    it('odpowiedź na akcję wysłaną przed decyzją terminalną nie wznawia zakończonego przebiegu', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(1000);
        st().sendAction('deepen', 'workspace', 'chart');   // w locie: dane mapy + komponenty po 200 ms
        st().sendAction('approve', 'hud', 'root');         // decyzja terminalna
        vi.advanceTimersByTime(2000);
        expect(st().scenario.status).toBe('done');
        expect(st().layout.map).toBeUndefined();            // późne zdarzenia zamkniętego przebiegu odrzucone
    });

    it('store ignoruje statusy i zdarzenia przebiegu po done (niezależnie od transportu)', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(1000);
        const runId = st().scenario.runId;
        st().receiveStatus(runId, 'done');
        st().receiveStatus(runId, 'awaiting_action');
        st().dispatch({ narration: { text: 'spóźnione' } }, runId);
        expect(st().scenario.status).toBe('done');
        expect(st().narration.text).toBeNull();
    });
});

describe('stage.focus spójny z kamerą (Astra #3)', () => {
    it('hint agenta "screen" ustawia stage.focus = front razem z ruchem kamery', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(1000);
        expect(st().stage.focus).toBe('back');
        st().sendAction('present', 'workspace', 'chart');
        vi.advanceTimersByTime(200);
        expect(st().stage.focus).toBe('front');
    });

    it('komenda użytkownika „na ekran” ustawia stage.focus = front', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(1000);
        st().layoutCommand({ type: 'toScreen', id: 'kpis' });
        expect(st().stage.focus).toBe('front');
    });

    it('w trakcie ręcznego obrotu hint "screen" nie zmienia ani kamery, ani stage.focus (jawna semantyka)', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(1000);
        st().setAngle(FOCUS_ANGLE.back, 'manual');
        st().sendAction('present', 'workspace', 'chart');
        vi.advanceTimersByTime(200);
        expect(st().layout.chart.presentation).toBe('screen');
        expect(st().stage.focus).toBe('back');
        expect(st().camera.source).toBe('manual');
    });
});

describe('koordynator: ekran i kamera (P3)', () => {
    it('hint agenta "screen" przenosi kamerę na Front', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(1000);
        settle();
        expect(st().camera.angle).toBeCloseTo(FOCUS_ANGLE.back, 6);
        st().sendAction('present', 'workspace', 'chart');
        vi.advanceTimersByTime(200);
        expect(st().layout.chart.presentation).toBe('screen');
        settle();
        expect(st().camera.angle).toBe(0);
    });

    it('hint agenta "screen" nie rusza kamery w trakcie ręcznego obrotu, ale element trafia na ekran', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(1000);
        settle();
        st().setAngle(FOCUS_ANGLE.back, 'manual'); // użytkownik właśnie obraca
        st().sendAction('present', 'workspace', 'chart');
        vi.advanceTimersByTime(200);
        expect(st().layout.chart.presentation).toBe('screen');
        expect(st().camera.tween).toBeNull();
        expect(st().camera.angle).toBe(FOCUS_ANGLE.back);
    });

    it('komenda użytkownika „na ekran” przenosi kamerę zawsze, także tuż po ręcznym obrocie', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(1000);
        st().setAngle(FOCUS_ANGLE.back, 'manual');
        st().layoutCommand({ type: 'toScreen', id: 'kpis' });
        expect(st().camera.tween).not.toBeNull();
        settle();
        expect(st().camera.angle).toBe(0);
    });

    it('E7: ekran zajęty, gdy element jest na ekranie lub trwa przebieg', () => {
        expect(selectScreenBusy(st())).toBe(false);
        st().startScenario('test');
        expect(selectScreenBusy(st())).toBe(true);
        vi.advanceTimersByTime(1000);
        st().sendAction('approve', 'hud', 'root');
        vi.advanceTimersByTime(1000);
        expect(st().scenario.status).toBe('done');
        expect(selectScreenBusy(st())).toBe(false);
        st().layoutCommand({ type: 'toScreen', id: 'chart' });
        expect(selectScreenBusy(st())).toBe(true);
    });
});

describe('kamera i referencje stanu', () => {
    it('zmiana kąta nie kopiuje surfaces, narration ani layout', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(1000);
        const { surfaces, narration, layout } = st();
        st().setAngle(1.2, 'manual');
        st().tickCamera(0.016);
        expect(st().surfaces).toBe(surfaces);
        expect(st().narration).toBe(narration);
        expect(st().layout).toBe(layout);
    });

    it('zmiana jednego elementu zachowuje referencje wpisów pozostałych', () => {
        st().startScenario('test');
        vi.advanceTimersByTime(1000);
        const kpis = st().layout.kpis;
        st().layoutCommand({ type: 'resize', id: 'chart', scale: 1.5 });
        expect(st().layout.kpis).toBe(kpis);
    });

    it('powrót na front kończy się dokładnie na 0 (gałąź cinematic)', () => {
        useAiUi.setState({ camera: { angle: FOCUS_ANGLE.back, source: 'manual', tween: null } });
        st().dispatch({ stage: { focus: 'front' } });
        settle();
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
