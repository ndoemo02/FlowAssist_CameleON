// @vitest-environment jsdom
// Review #1 (I10): dane agenta, które przechodzą walidację katalogu, nie mogą wywrócić renderu poza
// pojedynczą kartę / węzeł. W aplikacji nad overlayem nie ma boundary — błąd, który dotrze do sondy
// (ProbeBoundary), odmontowałby całą stronę. Złe dane mają dać FallbackCard + VALIDATION_FAILED.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage } from '../contract';
import { setTransport, useAiUi } from '../store';
import { resolveItem } from '../workspace';
import type { Surface } from '../reducer';
import { ItemBody } from '../overlay/ItemContent';
import AiUiOverlay from '../overlay/AiUiOverlay';
import SurfaceRenderer from '../SurfaceRenderer';
import { REPRESENTATION_VIEWS, TREE_VIEWS } from '../registry';
import { installDomStubs, render, type Rendered } from './fixtures/render';
import { fakeTransport } from './fixtures/transport';

vi.mock('../tts', () => ({ speak: vi.fn(), stopSpeaking: vi.fn() }));

const V = 'v0.9.1';
let sent: ClientMessage[] = [];
let mounted: Rendered[] = [];
const mount = (el: Parameters<typeof render>[0]) => { const r = render(el); mounted.push(r); return r; };

/** Aktywny przebieg (status running) z transportem zapisującym komunikaty wychodzące. */
function startRun() {
    sent = [];
    setTransport(fakeTransport({ send: (m) => { sent.push(m); } }));
    useAiUi.getState().setSceneReady();
    useAiUi.getState().startScenario('test');
}
const agent = (raw: unknown) => useAiUi.getState().transportDispatch(raw, useAiUi.getState().scenario.runId);
const errorsSent = () => sent.filter((m): m is Extract<ClientMessage, { error: unknown }> => 'error' in m).map((m) => m.error);

/** Surface workspace z jednym elementem `m` (treść z bindingu /items/m). */
function workspaceWith(rep: string, kind: string, content: unknown): Surface {
    return {
        catalogId: 'flowassist/v2',
        components: {
            root: { id: 'root', component: 'Workspace', children: ['m'] },
            m: { id: 'm', component: 'WorkspaceItem', kind, title: 'Element m', representations: [rep], content: { path: '/items/m' } },
        },
        data: { items: { m: content } },
    };
}

beforeEach(() => {
    installDomStubs();
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React loguje złapane błędy — tu są oczekiwane
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    startRun();
});

afterEach(() => {
    mounted.forEach((r) => r.unmount());
    mounted = [];
    useAiUi.getState().stopScenario();
    vi.restoreAllMocks();
});

describe('wrogie dane w treści elementu stołu (ItemBody)', () => {
    it('klucz `ref` w treści (walidator go przepuszcza) nie wywraca renderu', () => {
        const view = resolveItem(workspaceWith('map2d', 'map', { points: [{ label: 'Mokotów', x: 0.5, y: 0.5 }], ref: 'x' }), 'm');
        expect(view.status).toBe('ready');
        const r = mount(<ItemBody view={view} />);
        expect(r.escaped).toEqual([]);
        expect(r.container.textContent).toContain('Mokotów');
    });

    it('wykres z y = 1.7e308 (skończona liczba, walidator ją przepuszcza) nie wywraca renderu', () => {
        const view = resolveItem(workspaceWith('chart2d', 'chart', { kind: 'bar', series: [{ label: 'S', points: [{ x: 'Q1', y: 1.7e308 }] }] }), 'm');
        expect(view.status).toBe('ready');
        const r = mount(<ItemBody view={view} />);
        expect(r.escaped).toEqual([]);
        expect(r.container.querySelector('svg')).not.toBeNull();
    });
});

describe('wrogie dane w drzewie slotu (SurfaceRenderer)', () => {
    it('klucz `ref` w propsach Approval na HUD nie wywraca renderu', () => {
        agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
        agent({ version: V, updateComponents: { surfaceId: 'hud', components: [
            { id: 'root', component: 'Approval', title: 'Pilotaż', summary: 'Opis', ref: 'x' },
        ] } });
        const r = mount(<SurfaceRenderer surfaceId="hud" />);
        expect(r.escaped).toEqual([]);
        expect(r.container.textContent).toContain('Pilotaż');
    });
});

describe('wrogie dane: głęboko zagnieżdżony prop (weryfikacja Astry R#1)', () => {
    it('Approval z dodatkowym polem o głębokości 12 000 (JSON.parse je przyjmuje) nie wywraca renderu', () => {
        const depth = 12_000;
        const deep = JSON.parse('{"x":'.repeat(depth) + '1' + '}'.repeat(depth)); // jak z prawdziwego transportu
        agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
        agent({ version: V, updateComponents: { surfaceId: 'hud', components: [
            { id: 'root', component: 'Approval', title: 'Pilotaż', summary: 'Opis', extra: deep },
        ] } });
        const r = mount(<SurfaceRenderer surfaceId="hud" />);
        expect(r.escaped).toEqual([]);
        expect(r.container.textContent).toContain('Pilotaż');
    });
});

describe('wrogie dane szuflady tasków (licznik w AiUiOverlay)', () => {
    const tasksSurface = () => {
        agent({ version: V, createSurface: { surfaceId: 'tasks-drawer', catalogId: 'flowassist/v2' } });
        agent({ version: V, updateComponents: { surfaceId: 'tasks-drawer', components: [
            { id: 'root', component: 'TaskList', title: 'Research', tasks: { path: '/tasks' } },
        ] } });
    };

    it('updateDataModel(path "/", value null) nie wywraca overlayu', () => {
        tasksSurface();
        agent({ version: V, updateDataModel: { surfaceId: 'tasks-drawer', path: '/', value: null } });
        const r = mount(<AiUiOverlay />);
        expect(r.escaped).toEqual([]);
    });

    it('zadanie równe null nie wywraca overlayu', () => {
        tasksSurface();
        agent({ version: V, updateDataModel: { surfaceId: 'tasks-drawer', path: '/tasks', value: { a: null } } });
        const r = mount(<AiUiOverlay />);
        expect(r.escaped).toEqual([]);
    });
});

describe('lokalne boundary: fallback, raport i odzyskanie widoku po poprawieniu danych', () => {
    it('ItemBody: błąd widoku daje FallbackCard + VALIDATION_FAILED, a poprawna treść przywraca widok', () => {
        const original = REPRESENTATION_VIEWS.map2d;
        // dubler widoku: rzuca dla pustej listy punktów (treść poprawna wg walidatora), rysuje dla niepustej
        REPRESENTATION_VIEWS.map2d = ({ points }: { points: unknown[] }) => {
            if (points.length === 0) throw new Error('boom');
            return <p>widok OK</p>;
        };
        try {
            const broken = resolveItem(workspaceWith('map2d', 'map', { points: [] }), 'm');
            const r = mount(<ItemBody view={broken} />);
            expect(r.escaped).toEqual([]);
            expect(r.container.textContent).toContain('Nie mogę wyświetlić');
            expect(errorsSent()).toEqual([expect.objectContaining({ code: 'VALIDATION_FAILED', surfaceId: 'workspace', path: '/components/m/content' })]);

            const fixed = resolveItem(workspaceWith('map2d', 'map', { points: [{ label: 'A', x: 0.1, y: 0.1 }] }), 'm');
            r.rerender(<ItemBody view={fixed} />);
            expect(r.escaped).toEqual([]);
            expect(r.container.textContent).toContain('widok OK');
            expect(r.container.textContent).not.toContain('Nie mogę wyświetlić');
        } finally {
            REPRESENTATION_VIEWS.map2d = original;
        }
    });

    it('SurfaceRenderer: błąd węzła daje FallbackCard + VALIDATION_FAILED, a poprawione propsy przywracają widok', () => {
        const original = TREE_VIEWS.Approval;
        TREE_VIEWS.Approval = ({ title }: { title: string }) => {
            if (title === 'zły') throw new Error('boom');
            return <p>{title}</p>;
        };
        try {
            agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
            agent({ version: V, updateComponents: { surfaceId: 'hud', components: [{ id: 'root', component: 'Approval', title: 'zły', summary: 's' }] } });
            const r = mount(<SurfaceRenderer surfaceId="hud" />);
            expect(r.escaped).toEqual([]);
            expect(r.container.textContent).toContain('Nie mogę wyświetlić');
            expect(errorsSent()).toEqual([expect.objectContaining({ code: 'VALIDATION_FAILED', surfaceId: 'hud', path: '/components/root' })]);

            agent({ version: V, updateComponents: { surfaceId: 'hud', components: [{ id: 'root', component: 'Approval', title: 'dobry', summary: 's' }] } });
            r.rerender(<SurfaceRenderer surfaceId="hud" />);
            expect(r.escaped).toEqual([]);
            expect(r.container.textContent).toContain('dobry');
            expect(r.container.textContent).not.toContain('Nie mogę wyświetlić');
        } finally {
            TREE_VIEWS.Approval = original;
        }
    });
});
