// @vitest-environment jsdom
// Review #5 (I6/I10): cykl życia raportu VALIDATION_FAILED do agenta.
// - jedno zgłoszenie na WYSTĄPIENIE problemu: niezależnie od liczby widoków (karta + ekran), remountów
//   i od tego, czy panel (HUD, szuflada) jest otwarty;
// - po odzyskaniu poprawności i nawrocie problemu — nowe zgłoszenie;
// - po stanie terminalnym przebiegu nic nie jest wysyłane;
// - raport niesie jawne pochodzenie (runId); raport z innego przebiegu nie jest wysyłany.

import { act } from 'react';
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
const agent = (raw: unknown) => useAiUi.getState().transportDispatch(raw, runId());

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

// Weryfikacja Astry (R#5) + decyzja właściciela: odzyskanie = udany render po ponowieniu (błąd renderu)
// albo powrót walidacji do ready. Sama zmiana danych węzła, który dalej jest zły, odzyskaniem nie jest.
describe('błąd renderu: wystąpienie kończy się dopiero udanym renderem po ponowieniu', () => {
    const hudApproval = (title: string, summary = 'S') =>
        agent({ version: V, updateComponents: { surfaceId: 'hud', components: [{ id: 'root', component: 'Approval', title, summary }] } });
    const withThrowingApproval = (fn: () => void) => {
        const original = TREE_VIEWS.Approval;
        TREE_VIEWS.Approval = ({ title }: { title: string }) => {
            if (title === 'zły') throw new Error('boom');
            return <p>{title}</p>;
        };
        try { fn(); } finally { TREE_VIEWS.Approval = original; }
    };

    it('złe propsy → zmiana danych węzła, nadal złe → 1 raport', () => withThrowingApproval(() => {
        agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
        hudApproval('zły', 'S1');
        const r = mount(<SurfaceRenderer surfaceId="hud" />);
        hudApproval('zły', 'S2'); // inne propsy węzła → ponowienie renderu → ten sam błąd
        r.rerender(<SurfaceRenderer surfaceId="hud" />);
        expect(r.container.textContent).toContain('Nie mogę wyświetlić');
        expect(errorsSent()).toHaveLength(1);
    }));

    it('złe → poprawne → te same złe propsy → 2 raporty (węzeł HUD)', () => withThrowingApproval(() => {
        agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
        hudApproval('zły');
        const r = mount(<SurfaceRenderer surfaceId="hud" />);
        hudApproval('dobry');
        r.rerender(<SurfaceRenderer surfaceId="hud" />);
        expect(r.container.textContent).toContain('dobry');
        hudApproval('zły');
        r.rerender(<SurfaceRenderer surfaceId="hud" />);
        expect(errorsSent()).toHaveLength(2);
    }));

    // Weryfikacja Astry, runda 2: odzyskanie widzi też NOWA instancja boundary (remount panelu).
    it('złe → zwinięcie HUD → poprawne dane → rozwinięcie z udanym renderem → znowu złe → 2 raporty', () => withThrowingApproval(() => {
        agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
        hudApproval('zły');
        mount(<SurfaceRenderer surfaceId="hud" />).unmount();   // zwinięcie panelu z błędem
        hudApproval('dobry');                                   // poprawka danych, nikt nie renderuje
        const r = mount(<SurfaceRenderer surfaceId="hud" />);   // rozwinięcie: udany render nowej instancji
        expect(r.container.textContent).toContain('dobry');
        hudApproval('zły');
        r.rerender(<SurfaceRenderer surfaceId="hud" />);
        expect(errorsSent()).toHaveLength(2);
    }));

    it('samo odmontowanie i zmiana danych bez udanego renderu nie kończą wystąpienia', () => withThrowingApproval(() => {
        agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
        hudApproval('zły', 'S1');
        mount(<SurfaceRenderer surfaceId="hud" />).unmount();
        hudApproval('zły', 'S2');                               // dane zmienione, nadal złe, nikt nie renderuje
        mount(<SurfaceRenderer surfaceId="hud" />);             // remount: ten sam błąd
        expect(errorsSent()).toHaveLength(1);
    }));

    it('złe → poprawne → te same złe dane → 2 raporty (karta)', () => {
        const original = REPRESENTATION_VIEWS.map2d;
        REPRESENTATION_VIEWS.map2d = ({ points }: { points: { label: string }[] }) => {
            if (points[0].label === 'zły') throw new Error('boom');
            return <p>{points[0].label}</p>;
        };
        try {
            workspaceItem();
            // te same obiekty danych wracają (mock transport emituje stałe scenariusza bez serializacji)
            const bad = { points: [{ label: 'zły', x: 0.5, y: 0.5 }] };
            const good = { points: [{ label: 'dobry', x: 0.5, y: 0.5 }] };
            const set = (value: unknown) => agent({ version: V, updateDataModel: { surfaceId: 'workspace', path: '/items/m', value } });
            set(bad);
            const r = mount(<ViewOf id="m" />);
            act(() => set(good)); // act: render „dobry” zatwierdzony przed powrotem złych danych
            expect(r.container.textContent).toContain('dobry');
            act(() => set(bad));
            expect(errorsSent()).toHaveLength(2);
        } finally {
            REPRESENTATION_VIEWS.map2d = original;
        }
    });
});

// Weryfikacja Astry, runda 2: obecność węzła = członkostwo w grafie definicji (root → children),
// nie rozwiązane drzewo. Potomek rodzica w pending jest chwilowo niedostępny, a nie usunięty.
// Weryfikacja Astry, runda 3 + decyzja właściciela: odzyskanie i deduplikacja liczone per wariant renderowania
// (gęstość: card / screen), przy wspólnym wystąpieniu problemu. Udany render jednego wariantu nie zamyka
// błędu innego; uszkodzony wariant zostaje otwarty, dopóki sam nie przejdzie poprawnego renderu.
describe('błąd renderu: odzyskanie per wariant renderowania', () => {
    /** Widok mapy rzucający tylko w wybranych gęstościach (np. błąd zależny od gęstości). */
    const throwingIn = (bad: (density: string, label: string) => boolean, fn: () => void) => {
        const original = REPRESENTATION_VIEWS.map2d;
        REPRESENTATION_VIEWS.map2d = ({ points, density }: { points: { label: string }[]; density: string }) => {
            if (bad(density, points[0].label)) throw new Error('boom');
            return <p>{points[0].label}</p>;
        };
        try { fn(); } finally { REPRESENTATION_VIEWS.map2d = original; }
    };
    const set = (label: string) => agent({ version: V, updateDataModel: { surfaceId: 'workspace', path: '/items/m', value: { points: [{ label, x: 0.5, y: 0.5 }] } } });

    it('karta zawodzi, ekran zdrowy, ponowienie karty nadal zawodzi → 1 raport', () => throwingIn((d) => d === 'card', () => {
        workspaceItem();
        set('A');
        const card = mount(<ViewOf id="m" density="card" />);
        mount(<ViewOf id="m" density="screen" />);           // udany render innego wariantu
        act(() => set('B'));                                   // nowe dane → ponowienie karty → nadal błąd
        expect(card.container.textContent).toContain('Nie mogę wyświetlić');
        expect(errorsSent()).toHaveLength(1);
    }));

    it('ekran zawodzi → karta zdrowa → ekran znowu zawodzi → 1 raport', () => throwingIn((d) => d === 'screen', () => {
        workspaceItem();
        set('A');
        mount(<ViewOf id="m" density="screen" />).unmount();  // ekran z błędem, potem „Na stół”
        mount(<ViewOf id="m" density="card" />);               // karta renderuje się poprawnie
        mount(<ViewOf id="m" density="screen" />);             // ponownie „Na ekran”: ten sam błąd
        expect(errorsSent()).toHaveLength(1);
    }));

    // Weryfikacja Astry, runda 4: zmiana gęstości w tej samej zamontowanej instancji ItemBody.
    it('jedna instancja: card zawodzi → screen → poprawne dane → card z udanym renderem → złe → 2 raporty', () =>
        throwingIn((d, label) => d === 'card' && label === 'zły', () => {
            workspaceItem();
            set('zły');
            const r = mount(<ViewOf id="m" density="card" />);    // 1. card zawodzi → raport
            r.rerender(<ViewOf id="m" density="screen" />);        // 2. ten sam stan, wariant screen
            expect(r.container.textContent).toContain('zły');      //    screen renderuje się poprawnie
            act(() => set('dobry'));                               // 3. poprawne dane
            r.rerender(<ViewOf id="m" density="card" />);          // 4. powrót do card: udany render = odzyskanie card
            expect(r.container.textContent).toContain('dobry');
            act(() => set('zły'));                                 // 5. nawrót
            expect(errorsSent()).toHaveLength(2);
        }));

    // Strażnik (właściciel): sama zmiana wariantu nie jest odzyskaniem starego wariantu.
    it('card zawodzi → screen zdrowy → card nigdy nie wyrenderowana poprawnie → wystąpienie card otwarte (1 raport)', () =>
        throwingIn((d, label) => d === 'card' && label === 'zły', () => {
            workspaceItem();
            set('zły');
            const r = mount(<ViewOf id="m" density="card" />);
            r.rerender(<ViewOf id="m" density="screen" />);        // zdrowy screen nie zamyka błędu card
            r.rerender(<ViewOf id="m" density="card" />);          // card nadal zawodzi
            expect(r.container.textContent).toContain('Nie mogę wyświetlić');
            expect(errorsSent()).toHaveLength(1);
        }));

    it('strażnik: karta i ekran zawodzą → poprawne dane (oba warianty odzyskane) → znowu złe → 2 raporty', () => throwingIn((_, label) => label === 'zły', () => {
        workspaceItem();
        set('zły');
        const card = mount(<ViewOf id="m" density="card" />);
        mount(<ViewOf id="m" density="screen" />);
        act(() => set('dobry'));
        expect(card.container.textContent).toContain('dobry');
        act(() => set('zły'));
        expect(errorsSent()).toHaveLength(2);
    }));
});

// FU-1: błędy struktury rozpoznawane deterministycznie ze stanu trafiają do agenta niezależnie od tego,
// czy powierzchnia jest otwarta — ten sam cykl wystąpienia co pozostałe problemy walidacji.
describe('FU-1: błędy struktury surface\'u', () => {
    it('komponent niedostępny w slocie (root HUD = Workspace): zły → nadal zły → poprawiony → znowu zły = 2 raporty', () => {
        agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
        const root = (c: Record<string, unknown>) => agent({ version: V, updateComponents: { surfaceId: 'hud', components: [{ id: 'root', ...c }] } });
        root({ component: 'Workspace', children: [] });               // poprawny w katalogu, niedozwolony w slocie
        expect(errorsSent()).toEqual([expect.objectContaining({ code: 'VALIDATION_FAILED', surfaceId: 'hud', path: '/components/root/component' })]);
        agent({ version: V, updateDataModel: { surfaceId: 'hud', path: '/x', value: 1 } }); // nadal zły
        expect(errorsSent()).toHaveLength(1);
        root({ component: 'Approval', title: 'Decyzja', summary: 'S' }); // poprawiony
        root({ component: 'Workspace', children: [] });               // znowu zły
        expect(errorsSent()).toHaveLength(2);
    });

    it('root surface\'u workspace niebędący Workspace: zły → nadal zły → poprawiony → znowu zły = 2 raporty', () => {
        agent({ version: V, createSurface: { surfaceId: 'workspace', catalogId: 'flowassist/v2' } });
        const root = (c: Record<string, unknown>) => agent({ version: V, updateComponents: { surfaceId: 'workspace', components: [{ id: 'root', ...c }] } });
        root({ component: 'Approval', title: 'Decyzja', summary: 'S' });  // root stołu musi być Workspace
        expect(errorsSent()).toEqual([expect.objectContaining({ code: 'VALIDATION_FAILED', surfaceId: 'workspace', path: '/components/root/component' })]);
        agent({ version: V, updateDataModel: { surfaceId: 'workspace', path: '/x', value: 1 } }); // nadal zły
        expect(errorsSent()).toHaveLength(1);
        root({ component: 'Workspace', children: [] });                 // poprawiony
        root({ component: 'Approval', title: 'Decyzja', summary: 'S' });  // znowu zły
        expect(errorsSent()).toHaveLength(2);
    });

    it('brak roota to pending, nie błąd struktury', () => {
        agent({ version: V, createSurface: { surfaceId: 'workspace', catalogId: 'flowassist/v2' } });
        agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
        agent({ version: V, updateComponents: { surfaceId: 'hud', components: [{ id: 'other', component: 'Approval', title: 'T', summary: 'S' }] } });
        expect(errorsSent()).toHaveLength(0);
    });
});

describe('walidacja: pending rodzica to nie usunięcie dziecka', () => {
    /**
     * HUD: root (kontener z bindingiem /n — bez danych = pending) z dzieckiem `a` (Approval bez summary = fallback).
     * Kontener to Approval (dozwolony w slocie) — Workspace w HUD byłby osobnym błędem struktury (FU-1).
     */
    function hudParentChild(children: string[]) {
        agent({ version: V, updateComponents: { surfaceId: 'hud', components: [
            { id: 'root', component: 'Approval', title: 'Kontener', summary: 'S', children, note: { path: '/n' } },
            { id: 'a', component: 'Approval', title: 'Decyzja' },
        ] } });
    }
    const n = (value?: number) => agent({ version: V, updateDataModel: { surfaceId: 'hud', path: '/n', ...(value === undefined ? {} : { value }) } });

    it('dziecko w fallbacku → rodzic pending → rodzic znów gotowy, dziecko nadal złe → 1 raport', () => {
        agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
        n(1);
        hudParentChild(['a']);
        n();   // usunięcie danych bindingu → rodzic pending
        n(2);  // rodzic gotowy, dziecko nadal bez summary
        expect(errorsSent()).toEqual([expect.objectContaining({ surfaceId: 'hud', path: '/components/a/summary' })]);
    });

    it('strażnik: dziecko faktycznie usunięte z children i dodane ponownie, nadal złe → 2 raporty', () => {
        agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
        n(1);
        hudParentChild(['a']);
        hudParentChild([]);     // usunięcie członkostwa
        hudParentChild(['a']);  // ponowne dodanie
        expect(errorsSent()).toHaveLength(2);
    });
});

describe('walidacja: odzyskanie dopiero po powrocie do ready', () => {
    it('fallback → pending (dane usunięte) → ten sam fallback → 1 raport', () => {
        workspaceItem();
        mapData(true);
        agent({ version: V, updateDataModel: { surfaceId: 'workspace', path: '/items/m' } }); // brak danych → pending
        mapData(true);
        expect(errorsSent()).toHaveLength(1);
    });
});

/** ItemBody z bieżącym widokiem elementu (jak treść karty / panelu ekranu). */
function ViewOf({ id, density }: { id: string; density?: 'card' | 'screen' }) {
    return <ItemBody view={useItemView(id)} density={density} />;
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
