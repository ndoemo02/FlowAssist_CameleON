// @vitest-environment jsdom
// P0.5 krok 3 (plan v1.3.2, R7): semantyka fokusu i klawiatury w overlayu.
// - decyzja w HUD: pasek ma aria-expanded; otwarcie przenosi fokus na pierwszy przycisk panelu („Zwiń”, nie
//   „Zatwierdź” — klawisz powtórzony po Enter nie może zatwierdzić decyzji); Escape zwija i wraca na pasek;
//   rozwinięcie nie montuje drugiego landmarku „Decyzja” (dawniej key={expanded} → remount);
// - menu akcji karty i ekranu: „⋯” ma aria-expanded; Escape zamyka menu i oddaje fokus „⋯”.

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTransport, useAiUi } from '../store';
import AiUiOverlay from '../overlay/AiUiOverlay';
import { resetAnnouncer } from '../overlay/announcer';
import { publishAnchor, type AnchorState } from '../scene/anchorRegistry';
import { installDomStubs, render, type Rendered } from './fixtures/render';

vi.mock('../tts', () => ({ speak: vi.fn(), stopSpeaking: vi.fn() }));

const V = 'v0.9.1';
let mounted: Rendered[] = [];
const mount = () => { const r = render(<AiUiOverlay />); mounted.push(r); return r; };
const runId = () => useAiUi.getState().scenario.runId;
const agent = (raw: unknown) => act(() => useAiUi.getState().transportDispatch(raw, runId()));
const buttons = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
const button = (root: ParentNode, name: string) => buttons(root).find((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().includes(name))!;
const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
const click = (el: HTMLElement) => act(() => el.click());

function startRun() {
    setTransport({ start() {}, send() {}, subscribe: () => () => {}, stop() {} });
    act(() => { useAiUi.getState().setSceneReady(); useAiUi.getState().startScenario('test'); });
}
function decision() {
    agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
    agent({ version: V, updateComponents: { surfaceId: 'hud', components: [
        { id: 'root', component: 'Approval', title: 'Pilotaż', summary: 'Opis', items: ['A'] },
    ] } });
}
const landmarks = (r: Rendered) => r.container.querySelectorAll('aside[aria-label="Decyzja"]');

beforeEach(() => {
    installDomStubs();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetAnnouncer();
});

afterEach(() => {
    mounted.forEach((r) => r.unmount());
    mounted = [];
    act(() => useAiUi.getState().stopScenario());
    vi.restoreAllMocks();
});

function itemWithActions() {
    agent({ version: V, createSurface: { surfaceId: 'workspace', catalogId: 'flowassist/v2' } });
    agent({ version: V, updateComponents: { surfaceId: 'workspace', components: [
        { id: 'root', component: 'Workspace', children: ['m'] },
        { id: 'm', component: 'WorkspaceItem', kind: 'chart', title: 'Zapytania', representations: ['chart2d'], content: { path: '/items/m' },
            presentation: 'card', actions: [{ name: 'deep', label: 'Pogłęb' }] },
    ] } });
    agent({ version: V, updateDataModel: { surfaceId: 'workspace', path: '/items/m', value: { kind: 'line', series: [{ label: '2026', points: [{ x: 'Q1', y: 1 }] }] } } });
}
/** Warstwa aktywna: stół widoczny z Back (inaczej inert) / panel ekranu z aktywną kotwicą. */
const toBack = () => act(() => useAiUi.getState().setAngle(Math.PI, 'manual'));
const anchorActive = () => act(() => publishAnchor({ mode: 'anchor', active: true, reason: 'ok', outer: null, inner: null,
    panel: { x: 0, y: 0, w: 600, h: 300 }, coverage: 1, visibleFraction: 1, angleDeg: 0, pointCount: 0, computeMs: 0 } as unknown as AnchorState));
function twoItems() {
    itemWithActions();
    agent({ version: V, updateComponents: { surfaceId: 'workspace', components: [
        { id: 'root', component: 'Workspace', children: ['m', 'n'] },
        { id: 'n', component: 'WorkspaceItem', kind: 'chart', title: 'Inne', representations: ['chart2d'], content: { path: '/items/m' }, presentation: 'card' },
    ] } });
}
const article = (r: Rendered) => r.container.querySelector<HTMLElement>('article[aria-label="Zapytania"]')!;
const screen = (r: Rendered) => r.container.querySelector<HTMLElement>('section[aria-label="Ekran: Zapytania"]')!;

describe('menu akcji karty', () => {
    it('„⋯” ma aria-expanded; Escape z akcji zamyka menu i oddaje fokus „⋯”', () => {
        const r = mount();
        startRun();
        itemWithActions();
        toBack();
        act(() => useAiUi.getState().layoutCommand({ type: 'focus', id: 'm' }));
        const more = button(article(r), 'Akcje');
        expect(more.getAttribute('aria-expanded')).toBe('false');
        click(more);
        expect(more.getAttribute('aria-expanded')).toBe('true');
        const action = button(article(r), 'Pogłęb');
        action.focus();
        key(action, 'Escape');
        expect(button(article(r), 'Pogłęb')).toBeUndefined();
        expect(more.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(more);
        expect(useAiUi.getState().layout.m.presentation).toBe('focus'); // Escape zamknął menu, nie zdjął focusu karty
    });

    it('Escape na samej karcie przy otwartym menu najpierw zamyka menu; dopiero drugi zdejmuje focus', () => {
        const r = mount();
        startRun();
        itemWithActions();
        toBack();
        act(() => useAiUi.getState().layoutCommand({ type: 'focus', id: 'm' }));
        click(button(article(r), 'Akcje'));
        article(r).focus();
        key(article(r), 'Escape');
        expect(button(article(r), 'Pogłęb')).toBeUndefined();
        expect(useAiUi.getState().layout.m.presentation).toBe('focus');
        key(article(r), 'Escape');
        expect(useAiUi.getState().layout.m.presentation).toBe('card');
    });
});

describe('menu akcji panelu ekranu', () => {
    it('„⋯” ma nazwę i aria-expanded; Escape zamyka menu i oddaje fokus „⋯”', () => {
        const r = mount();
        startRun();
        itemWithActions();
        act(() => useAiUi.getState().layoutCommand({ type: 'toScreen', id: 'm' }));
        anchorActive();
        const more = button(screen(r), 'Akcje');
        expect(more.getAttribute('aria-label')).toBe('Akcje');
        expect(more.getAttribute('aria-expanded')).toBe('false');
        click(more);
        expect(more.getAttribute('aria-expanded')).toBe('true');
        const action = button(screen(r), 'Pogłęb');
        action.focus();
        key(action, 'Escape');
        expect(button(screen(r), 'Pogłęb')).toBeUndefined();
        expect(document.activeElement).toBe(more);
    });
});

describe('decyzja w HUD', () => {
    it('pasek: aria-expanded=false; otwarcie → fokus na „Zwiń” (aria-expanded=true); Escape → zwinięta, fokus na pasku', () => {
        const r = mount();
        startRun();
        decision();
        const bar = button(r.container, 'Szczegóły');
        expect(bar.getAttribute('aria-expanded')).toBe('false');
        bar.focus();
        click(bar);
        const collapse = button(r.container, 'Zwiń');
        expect(collapse).toBeTruthy();
        expect(collapse.getAttribute('aria-expanded')).toBe('true');
        expect(document.activeElement).toBe(collapse);
        key(collapse, 'Escape');
        expect(button(r.container, 'Zwiń')).toBeUndefined();
        expect(document.activeElement).toBe(button(r.container, 'Szczegóły'));
    });

    it('rozwinięcie i zwinięcie nie montuje drugiego landmarku „Decyzja”', () => {
        const r = mount();
        startRun();
        decision();
        const aside = landmarks(r)[0];
        click(button(r.container, 'Szczegóły'));
        expect(landmarks(r)).toHaveLength(1);
        expect(landmarks(r)[0]).toBe(aside);
        click(button(r.container, 'Zwiń'));
        expect(landmarks(r)).toHaveLength(1);
        expect(landmarks(r)[0]).toBe(aside);
    });

    it('„Zwiń” przyciskiem też oddaje fokus paskowi', () => {
        const r = mount();
        startRun();
        decision();
        click(button(r.container, 'Szczegóły'));
        click(button(r.container, 'Zwiń'));
        expect(document.activeElement).toBe(button(r.container, 'Szczegóły'));
    });
});

describe('przewijana treść karty z focusem (desktop)', () => {
    it('treść jest osiągalna z klawiatury i nazwana; Escape z treści wraca na kartę, kolejny zdejmuje focus', () => {
        const r = mount();
        startRun();
        itemWithActions();
        toBack();
        const content = () => article(r).querySelector<HTMLElement>('[role="group"][aria-label="Treść: Zapytania"]');
        expect(content()).toBeNull(); // karta bez focusu: treść przycięta, bez przewijania i bez tab stopu
        act(() => useAiUi.getState().layoutCommand({ type: 'focus', id: 'm' }));
        expect(content()?.tabIndex).toBe(0);
        content()!.focus();
        key(content()!, 'Escape');
        expect(document.activeElement).toBe(article(r));
        expect(useAiUi.getState().layout.m.presentation).toBe('focus');
        key(article(r), 'Escape');
        expect(useAiUi.getState().layout.m.presentation).toBe('card');
    });
});

function tasks() {
    agent({ version: V, createSurface: { surfaceId: 'tasks-drawer', catalogId: 'flowassist/v2' } });
    agent({ version: V, updateComponents: { surfaceId: 'tasks-drawer', components: [
        { id: 'root', component: 'TaskList', title: 'Research', tasks: { path: '/tasks' } },
    ] } });
    agent({ version: V, updateDataModel: { surfaceId: 'tasks-drawer', path: '/tasks', value: {
        a: { title: 'Scout', status: 'running', progress: 0.5 },
    } } });
}
const tasksTab = (r: Rendered) => buttons(r.container).find((b) => /Taski|Ukryj taski/.test(b.textContent ?? ''))!;

describe('szuflada tasków', () => {
    it('przycisk ma aria-expanded; lista jest osiągalna z klawiatury; Escape zamyka i oddaje fokus przyciskowi', () => {
        const r = mount();
        startRun();
        tasks();
        expect(tasksTab(r).getAttribute('aria-expanded')).toBe('false');
        click(tasksTab(r));
        expect(tasksTab(r).getAttribute('aria-expanded')).toBe('true');
        const list = r.container.querySelector<HTMLElement>('[aria-label="Lista tasków"]')!;
        expect(list.tabIndex).toBe(0);
        list.focus();
        key(list, 'Escape');
        expect(useAiUi.getState().stage.drawer).toBe('closed');
        expect(document.activeElement).toBe(tasksTab(r));
    });

    it('compact: zamknięta szuflada (przesunięta poza ekran) jest inert, otwarta — aktywna', () => {
        const original = window.matchMedia;
        window.matchMedia = ((query: string) => ({ ...original(query), matches: true })) as typeof window.matchMedia;
        try {
            const r = mount();
            startRun();
            tasks();
            const list = () => r.container.querySelector<HTMLElement>('[aria-label="Lista tasków"]')!;
            act(() => useAiUi.getState().setDrawer('closed'));
            expect(list().getAttribute('aria-hidden')).toBe('true');
            click(tasksTab(r));
            expect(list().getAttribute('aria-hidden')).toBeNull();
        } finally {
            window.matchMedia = original;
        }
    });
});

// Krok 4: ważność właściciela menu i bezpieczny cel fokusu (plan v1.3.2 P0.5, R7).
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const tableLayer = (r: Rendered) => r.container.querySelector<HTMLElement>('[data-focus-layer="table"]')!;

describe('menu zamyka się, gdy jego warstwa przestaje być aktywna', () => {
    it('karta: obrót kamery z Back na Front zamyka menu akcji', () => {
        const r = mount();
        startRun();
        itemWithActions();
        toBack();
        act(() => useAiUi.getState().layoutCommand({ type: 'focus', id: 'm' }));
        click(button(article(r), 'Akcje'));
        expect(button(article(r), 'Pogłęb')).toBeTruthy();
        act(() => useAiUi.getState().setAngle(0, 'manual'));
        expect(button(article(r), 'Pogłęb')).toBeUndefined();
    });

    it('panel ekranu: nieaktywna kotwica zamyka menu akcji', () => {
        const r = mount();
        startRun();
        itemWithActions();
        act(() => useAiUi.getState().layoutCommand({ type: 'toScreen', id: 'm' }));
        anchorActive();
        click(button(screen(r), 'Akcje'));
        expect(button(screen(r), 'Pogłęb')).toBeTruthy();
        act(() => publishAnchor({ mode: 'anchor', active: false, reason: 'angle', outer: null, inner: null, panel: { x: 0, y: 0, w: 600, h: 300 },
            coverage: 0.5, visibleFraction: 0.5, angleDeg: 40, pointCount: 0, computeMs: 0 } as unknown as AnchorState));
        expect(button(screen(r), 'Pogłęb')).toBeUndefined();
    });

    it('restart przebiegu zamyka menu (karty i panel znikają) bez błędu', () => {
        const r = mount();
        startRun();
        itemWithActions();
        toBack();
        act(() => useAiUi.getState().layoutCommand({ type: 'focus', id: 'm' }));
        click(button(article(r), 'Akcje'));
        startRun();
        expect(r.container.querySelector('article')).toBeNull();
        expect(r.escaped).toEqual([]);
    });
});

describe('bezpieczny cel fokusu, gdy fokusowany element znika', () => {
    it('„Ukryj” na karcie z fokusem: karta znika, fokus na kontener aktywnego stołu', async () => {
        const r = mount();
        startRun();
        itemWithActions();
        toBack();
        act(() => useAiUi.getState().layoutCommand({ type: 'focus', id: 'm' }));
        const hide = button(article(r), 'Ukryj');
        hide.focus();
        click(hide);
        await flush();
        expect(article(r)).toBeNull();
        expect(document.activeElement).toBe(tableLayer(r));
    });

    it('agent usuwa element z Workspace.children, gdy fokus jest w jego karcie → kontener stołu', async () => {
        const r = mount();
        startRun();
        itemWithActions();
        // drugi element zostaje, więc stół (bezpieczny cel) nadal istnieje; pusty stół WorkspaceLayer odmontowuje
        agent({ version: V, updateComponents: { surfaceId: 'workspace', components: [
            { id: 'root', component: 'Workspace', children: ['m', 'n'] },
            { id: 'n', component: 'WorkspaceItem', kind: 'chart', title: 'Inne', representations: ['chart2d'], content: { path: '/items/m' }, presentation: 'card' },
        ] } });
        toBack();
        article(r).focus();
        agent({ version: V, updateComponents: { surfaceId: 'workspace', components: [{ id: 'root', component: 'Workspace', children: ['n'] }] } });
        await flush();
        expect(article(r)).toBeNull();
        expect(document.activeElement).toBe(tableLayer(r));
    });

    it('stół staje się nieaktywny (obrót na Front) z fokusem na karcie → pasek decyzji HUD', async () => {
        const r = mount();
        startRun();
        itemWithActions();
        decision();
        toBack();
        article(r).focus();
        act(() => useAiUi.getState().setAngle(0, 'manual'));
        await flush();
        expect(document.activeElement).toBe(button(r.container, 'Szczegóły'));
    });

    it('decyzja znika z fokusem na „Zatwierdź” → kontener aktywnego stołu', async () => {
        const r = mount();
        startRun();
        itemWithActions();
        decision();
        toBack();
        click(button(r.container, 'Szczegóły'));
        const approve = button(r.container, 'Zatwierdź');
        approve.focus();
        agent({ version: V, deleteSurface: { surfaceId: 'hud' } });
        await flush();
        expect(document.activeElement).toBe(tableLayer(r));
    });

    it('fokus zdjęty przez użytkownika (body) nie wraca sam przy późniejszych zmianach', async () => {
        const r = mount();
        startRun();
        twoItems();
        toBack();
        article(r).focus();
        act(() => article(r).blur()); // np. klik w scenę 3D
        await flush();
        expect(document.activeElement).toBe(document.body);
        // zmiana, która zostawia stół (bezpieczny cel istnieje) — ratunek nie może zabrać fokusu z <body>
        agent({ version: V, updateComponents: { surfaceId: 'workspace', components: [{ id: 'root', component: 'Workspace', children: ['m'] }] } });
        await flush();
        expect(tableLayer(r)).not.toBeNull();
        expect(document.activeElement).toBe(document.body);
    });

    // review kroków 3–4, HIGH-1: fokus, który wyszedł poza overlay, nie jest „ostatnim fokusem overlayu”
    it('fokus poza overlayem → <body> → agent usuwa kartę: fokus zostaje na <body>', async () => {
        const r = mount();
        startRun();
        twoItems();
        toBack();
        article(r).focus();
        const outside = document.createElement('button');
        document.body.appendChild(outside);
        act(() => outside.focus());
        await flush(); // sprawdzenie ratunku zdąży się wykonać, gdy fokus jest jeszcze poza overlayem
        act(() => outside.blur());
        await flush();
        agent({ version: V, updateComponents: { surfaceId: 'workspace', components: [{ id: 'root', component: 'Workspace', children: ['n'] }] } });
        await flush();
        expect(article(r)).toBeNull();
        expect(document.activeElement).toBe(document.body);
        outside.remove();
    });

    // review kroków 3–4, MEDIUM-1: ratunek nie przewija strony (overlay jest w sekcji hero przewijanej strony)
    it('ratunek ustawia fokus z preventScroll', async () => {
        const r = mount();
        startRun();
        itemWithActions();
        toBack();
        act(() => useAiUi.getState().layoutCommand({ type: 'focus', id: 'm' }));
        const hide = button(article(r), 'Ukryj');
        hide.focus();
        const spy = vi.spyOn(HTMLElement.prototype, 'focus');
        click(hide);
        await flush();
        const rescue = spy.mock.calls.find((_, i) => (spy.mock.instances[i] as unknown) === tableLayer(r));
        expect(rescue?.[0]).toEqual({ preventScroll: true });
    });
});

// review kroków 3–4, MEDIUM-2 / LOW-4: menu i kontrolki z fokusu klawiatury nie przeżywają zniknięcia karty
describe('menu i kontrolki karty po ukryciu i po ekranie', () => {
    it('Akcje → Ukryj → Przywróć: menu zamknięte, kontrolki bez fokusu schowane', () => {
        const r = mount();
        startRun();
        itemWithActions();
        toBack();
        act(() => article(r).focus()); // fokus klawiatury: kontrolki widoczne
        click(button(article(r), 'Akcje'));
        expect(button(article(r), 'Pogłęb')).toBeTruthy();
        act(() => useAiUi.getState().layoutCommand({ type: 'dismiss', id: 'm' }));
        act(() => useAiUi.getState().layoutCommand({ type: 'restore', id: 'm' }));
        expect(useAiUi.getState().layout.m.presentation).toBe('card');
        expect(button(article(r), 'Pogłęb')).toBeUndefined();
        expect(button(article(r), 'Powiększ')).toBeUndefined();
    });

    it('Akcje → Na ekran → Na stół: menu zamknięte', () => {
        const r = mount();
        startRun();
        itemWithActions();
        toBack();
        act(() => useAiUi.getState().layoutCommand({ type: 'focus', id: 'm' }));
        click(button(article(r), 'Akcje'));
        act(() => useAiUi.getState().layoutCommand({ type: 'toScreen', id: 'm' }));
        act(() => useAiUi.getState().layoutCommand({ type: 'toCard', id: 'm' }));
        expect(button(article(r), 'Pogłęb')).toBeUndefined();
    });
});

// Review kroków 1–2 (A11Y-1): na desktopie klawiatura nie wprowadza karty w focus, więc kontrolki karty
// („−/+”, „Ukryj”, „Na ekran”, „⋯”) muszą być dostępne, gdy fokus klawiatury jest w karcie.
describe('kontrolki karty przy fokusie w karcie (desktop)', () => {
    it('Tab na kartę (prezentacja card) pokazuje kontrolki; fokus poza kartą je chowa', () => {
        const r = mount();
        startRun();
        itemWithActions();
        toBack();
        expect(useAiUi.getState().layout.m.presentation).toBe('card');
        expect(button(article(r), 'Powiększ')).toBeUndefined();
        act(() => article(r).focus());
        expect(button(article(r), 'Powiększ')).toBeTruthy();
        expect(button(article(r), 'Zmniejsz')).toBeTruthy();
        const outside = document.createElement('button');
        document.body.appendChild(outside);
        act(() => outside.focus());
        expect(button(article(r), 'Powiększ')).toBeUndefined();
        outside.remove();
    });

    it('przejście fokusu z karty na jej przycisk nie chowa kontrolek', () => {
        const r = mount();
        startRun();
        itemWithActions();
        toBack();
        act(() => article(r).focus());
        act(() => button(article(r), 'Powiększ').focus());
        expect(button(article(r), 'Powiększ')).toBeTruthy();
        click(button(article(r), 'Powiększ'));
        expect(useAiUi.getState().layout.m.scale).toBeGreaterThan(1);
    });
});
