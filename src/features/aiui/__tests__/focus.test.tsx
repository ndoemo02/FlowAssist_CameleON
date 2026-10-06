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
