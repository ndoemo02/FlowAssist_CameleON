// @vitest-environment jsdom
// Review #5 (I6/I10): cykl życia raportu VALIDATION_FAILED do agenta.
// - jedno zgłoszenie na WYSTĄPIENIE problemu: niezależnie od liczby widoków (karta + ekran), remountów
//   i od tego, czy panel (HUD, szuflada) jest otwarty;
// - po odzyskaniu poprawności i nawrocie problemu — nowe zgłoszenie;
// - po stanie terminalnym przebiegu nic nie jest wysyłane;
// - raport niesie jawne pochodzenie (runId); raport z innego przebiegu nie jest wysyłany.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage } from '../contract';
import { setTransport, useAiUi } from '../store';
import { ItemBody, useItemView } from '../overlay/ItemContent';
import SurfaceRenderer from '../SurfaceRenderer';
import { REPRESENTATION_VIEWS, TREE_VIEWS } from '../registry';
import { resetValidationReporting, startValidationReporting } from '../validationReporting';
import { installDomStubs, render, type Rendered } from './fixtures/render';

vi.mock('../tts', () => ({ speak: vi.fn(), stopSpeaking: vi.fn() }));

const V = 'v0.9.1';
let sent: ClientMessage[] = [];
let mounted: Rendered[] = [];
let stopReporting: () => void = () => {};
const mount = (el: Parameters<typeof render>[0]) => { const r = render(el); mounted.push(r); return r; };
const errorsSent = () => sent.filter((m): m is Extract<ClientMessage, { error: unknown }> => 'error' in m).map((m) => m.error);
const runId = () => useAiUi.getState().scenario.runId;
const agent = (raw: unknown) => useAiUi.getState().dispatch(raw, runId());

function startRun() {
    useAiUi.getState().setSceneReady();
    useAiUi.getState().startScenario('test');
}

/** Element `m` na stole; `broken` = treść łamie walidator MapView (fallback), inaczej poprawna. */
function workspaceItem() {
    agent({ version: V, createSurface: { surfaceId: 'workspace', catalogId: 'flowassist/v2' } });
    agent({ version: V, updateComponents: { surfaceId: 'workspace', components: [
        { id: 'root', component: 'Workspace', children: ['m'] },
        { id: 'm', component: 'WorkspaceItem', kind: 'map', title: 'Mapa', representations: ['map2d'], content: { path: '/items/m' } },
    ] } });
}
const mapData = (broken: boolean) => agent({ version: V, updateDataModel: { surfaceId: 'workspace', path: '/items/m',
    value: broken ? { points: [{ label: 'A', x: 2, y: 0.5 }] } : { points: [{ label: 'A', x: 0.5, y: 0.5 }] } } });

/** Konsument widoku elementu — jak WorkspaceCard i ScreenPanel (oba używają useItemView). */
function ItemConsumer({ id }: { id: string }) {
    const view = useItemView(id);
    return <p>{view.status}</p>;
}

beforeEach(() => {
    installDomStubs();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    sent = [];
    setTransport({ start() {}, send: (m) => { sent.push(m); }, subscribe: () => () => {}, stop() {} });
    resetValidationReporting();
    stopReporting = startValidationReporting();
    startRun();
});

afterEach(() => {
    mounted.forEach((r) => r.unmount());
    mounted = [];
    stopReporting();
    useAiUi.getState().stopScenario();
    vi.restoreAllMocks();
});

describe('jedno zgłoszenie na wystąpienie problemu', () => {
    it('element w fallbacku rysowany przez kartę i ekran oraz remount panelu ekranu → jeden raport', () => {
        workspaceItem();
        mapData(true);
        mount(<ItemConsumer id="m" />);                 // karta
        const screen = mount(<ItemConsumer id="m" />);  // panel ekranu
        screen.unmount();
        mount(<ItemConsumer id="m" />);                 // ponowne „Na ekran” (ScreenPanel z key = id)
        expect(errorsSent()).toEqual([expect.objectContaining({ code: 'VALIDATION_FAILED', surfaceId: 'workspace', path: '/components/m/content/points/0/x' })]);
    });

    it('fallback w HUD jest zgłaszany bez otwierania panelu „Szczegóły”', () => {
        agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
        agent({ version: V, updateComponents: { surfaceId: 'hud', components: [{ id: 'root', component: 'Approval', title: 'Decyzja' }] } });
        expect(errorsSent()).toEqual([expect.objectContaining({ code: 'VALIDATION_FAILED', surfaceId: 'hud', path: '/components/root/summary' })]);
    });

    it('zwijanie i rozwijanie HUD (remount SurfaceRenderer) nie zgłasza ponownie', () => {
        agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
        agent({ version: V, updateComponents: { surfaceId: 'hud', components: [{ id: 'root', component: 'Approval', title: 'Decyzja' }] } });
        mount(<SurfaceRenderer surfaceId="hud" />).unmount();
        mount(<SurfaceRenderer surfaceId="hud" />);
        expect(errorsSent()).toHaveLength(1);
    });

    it('błąd renderu tych samych danych na karcie i na ekranie → jeden raport', () => {
        const original = REPRESENTATION_VIEWS.map2d;
        REPRESENTATION_VIEWS.map2d = () => { throw new Error('boom'); };
        try {
            workspaceItem();
            mapData(false);
            const card = mount(<ViewOf id="m" />);
            mount(<ViewOf id="m" />);
            expect(card.container.textContent).toContain('Nie mogę wyświetlić');
            expect(errorsSent()).toHaveLength(1);
        } finally {
            REPRESENTATION_VIEWS.map2d = original;
        }
    });
});

describe('błąd renderu węzła drzewa (HUD) to jedno wystąpienie, dopóki propsy się nie zmienią', () => {
    it('niezwiązana aktualizacja danych surface\'u nie zgłasza błędu ponownie', () => {
        const original = TREE_VIEWS.Approval;
        TREE_VIEWS.Approval = () => { throw new Error('boom'); };
        try {
            agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
            agent({ version: V, updateComponents: { surfaceId: 'hud', components: [{ id: 'root', component: 'Approval', title: 'T', summary: 'S' }] } });
            const r = mount(<SurfaceRenderer surfaceId="hud" />);
            agent({ version: V, updateDataModel: { surfaceId: 'hud', path: '/note', value: 'x' } }); // propsy root bez zmian
            r.rerender(<SurfaceRenderer surfaceId="hud" />);
            expect(errorsSent()).toHaveLength(1);
        } finally {
            TREE_VIEWS.Approval = original;
        }
    });
});

/** ItemBody z bieżącym widokiem elementu (jak treść karty / panelu ekranu). */
function ViewOf({ id }: { id: string }) {
    return <ItemBody view={useItemView(id)} />;
}

describe('reset po odzyskaniu poprawności', () => {
    it('fallback → poprawne dane → ten sam fallback ponownie → dwa raporty', () => {
        workspaceItem();
        mapData(true);
        mount(<ItemConsumer id="m" />);
        mapData(false);
        mapData(true);
        expect(errorsSent()).toHaveLength(2);
    });
});

describe('brak wysyłki po stanie terminalnym', () => {
    it('po done: nowy widok elementu w fallbacku (np. „Na ekran”) nie wysyła raportu', () => {
        workspaceItem();
        mapData(true);
        mount(<ItemConsumer id="m" />);
        useAiUi.getState().receiveStatus(runId(), 'done');
        mount(<ItemConsumer id="m" />);
        expect(errorsSent()).toHaveLength(1);
    });

    it('po done: raport z bieżącego przebiegu nie jest wysyłany', () => {
        useAiUi.getState().receiveStatus(runId(), 'done');
        useAiUi.getState().reportClientError({ code: 'VALIDATION_FAILED', surfaceId: 'workspace', path: '/x', message: 'm' }, { runId: runId() });
        expect(errorsSent()).toHaveLength(0);
    });
});

describe('jawne pochodzenie przebiegu', () => {
    it('spóźniony raport z poprzedniego przebiegu nie trafia do nowego', () => {
        const previous = runId();
        startRun(); // restart → nowy runId
        useAiUi.getState().reportClientError({ code: 'VALIDATION_FAILED', surfaceId: 'workspace', path: '/x', message: 'm' }, { runId: previous });
        expect(errorsSent()).toHaveLength(0);
    });

    it('raport z bieżącego, aktywnego przebiegu jest wysyłany', () => {
        useAiUi.getState().reportClientError({ code: 'VALIDATION_FAILED', surfaceId: 'workspace', path: '/x', message: 'm' }, { runId: runId() });
        expect(errorsSent()).toHaveLength(1);
    });
});
