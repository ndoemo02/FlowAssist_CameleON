// @vitest-environment jsdom
// P0.5 (plan v1.3.2, R7): dwa regiony ogłoszeń i polityka ogłoszeń.
// - narracja agenta: STAŁY, zawsze zamontowany role="status"; zmienia się tylko tekst (wizualny napis obok, aria-hidden);
// - lokalny status: osobny region na komunikaty klienta (gesty, start/koniec przebiegu, nowy element, decyzja),
//   żeby nie nadpisywał narracji; błąd blokujący (przebieg w `error`) — role="alert";
// - napływ danych nigdy nie przejmuje fokusu.

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTransport, useAiUi } from '../store';
import AiUiOverlay from '../overlay/AiUiOverlay';
import { userLayoutCommand } from '../overlay/userCommand';
import { resetAnnouncer } from '../overlay/announcer';
import { installDomStubs, render, type Rendered } from './fixtures/render';

vi.mock('../tts', () => ({ speak: vi.fn(), stopSpeaking: vi.fn() }));

const V = 'v0.9.1';
let mounted: Rendered[] = [];
const mount = () => { const r = render(<AiUiOverlay />); mounted.push(r); return r; };
const runId = () => useAiUi.getState().scenario.runId;
const agent = (raw: unknown) => act(() => useAiUi.getState().transportDispatch(raw, runId()));

const narrationRegion = (r: Rendered) => r.container.querySelector<HTMLElement>('[data-region="narration"]')!;
const statusRegion = (r: Rendered) => r.container.querySelector<HTMLElement>('[data-region="status"]')!;
const alertRegion = (r: Rendered) => r.container.querySelector<HTMLElement>('[data-region="alert"]')!;

function startRun() {
    setTransport({ start() {}, send() {}, subscribe: () => () => {}, stop() {} });
    act(() => { useAiUi.getState().setSceneReady(); useAiUi.getState().startScenario('test'); });
}
const chartData = { kind: 'line', series: [{ label: '2026', points: [{ x: 'Q1', y: 1 }] }] };
function workspaceItem(withData = true) {
    agent({ version: V, createSurface: { surfaceId: 'workspace', catalogId: 'flowassist/v2' } });
    agent({ version: V, updateComponents: { surfaceId: 'workspace', components: [
        { id: 'root', component: 'Workspace', children: ['m'] },
        { id: 'm', component: 'WorkspaceItem', kind: 'chart', title: 'Zapytania', representations: ['chart2d'], content: { path: '/items/m' }, presentation: 'card' },
    ] } });
    if (withData) agent({ version: V, updateDataModel: { surfaceId: 'workspace', path: '/items/m', value: chartData } });
}

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

describe('region narracji agenta', () => {
    it('jest stały: ten sam węzeł role="status" przy zmianie tekstu; wizualny napis jest aria-hidden', () => {
        const r = mount();
        startRun();
        const region = narrationRegion(r);
        expect(region.getAttribute('role')).toBe('status');
        agent({ narration: { text: 'Pierwsze zdanie' } });
        expect(narrationRegion(r)).toBe(region);
        expect(region.textContent).toContain('Pierwsze zdanie');
        agent({ narration: { text: 'Drugie zdanie' } });
        expect(narrationRegion(r)).toBe(region);
        expect(region.textContent).toContain('Drugie zdanie');
        expect(region.textContent).not.toContain('Pierwsze zdanie');
        // wizualny napis nie jest drugim regionem na żywo i nie dubluje treści czytnikowi
        const live = r.container.querySelectorAll('[role="status"], [aria-live]');
        expect(Array.from(live).filter((el) => el.textContent?.includes('Drugie zdanie'))).toEqual([region]);
    });

    it('jest zamontowany, zanim pojawi się jakikolwiek tekst', () => {
        const r = mount();
        expect(narrationRegion(r)?.getAttribute('aria-live')).toBe('polite');
        expect(statusRegion(r)?.getAttribute('aria-live')).toBe('polite');
        expect(alertRegion(r)?.getAttribute('role')).toBe('alert');
    });
});

describe('lokalny status (komunikaty klienta)', () => {
    it('start i koniec przebiegu', () => {
        const r = mount();
        startRun();
        expect(statusRegion(r).textContent).toContain('Agent rozpoczął pracę');
        act(() => useAiUi.getState().receiveStatus(runId(), 'done'));
        expect(statusRegion(r).textContent).toContain('Przebieg zakończony');
    });

    it('potwierdzenia gestów nie nadpisują narracji: ukryto, przywrócono, na ekranie, na stół', () => {
        const r = mount();
        startRun();
        workspaceItem();
        agent({ narration: { text: 'Narracja trwa' } });
        act(() => userLayoutCommand({ type: 'dismiss', id: 'm' }));
        expect(statusRegion(r).textContent).toContain('Ukryto: Zapytania');
        act(() => userLayoutCommand({ type: 'restore', id: 'm' }));
        expect(statusRegion(r).textContent).toContain('Przywrócono: Zapytania');
        act(() => userLayoutCommand({ type: 'toScreen', id: 'm' }));
        expect(statusRegion(r).textContent).toContain('Na ekranie: Zapytania');
        act(() => userLayoutCommand({ type: 'toCard', id: 'm' }));
        expect(statusRegion(r).textContent).toContain('Na stole: Zapytania');
        expect(narrationRegion(r).textContent).toContain('Narracja trwa');
    });

    it('przyciski UI idą przez userLayoutCommand: „Ukryj” na panelu ekranu i „Przywróć” w ukrytych', () => {
        const r = mount();
        startRun();
        workspaceItem();
        act(() => useAiUi.getState().layoutCommand({ type: 'toScreen', id: 'm' })); // bez komunikatu (bezpośrednio)
        const button = (name: string) => Array.from(r.container.querySelectorAll('button')).find((b) => b.textContent?.trim() === name)!;
        act(() => button('Ukryj').click());
        expect(statusRegion(r).textContent).toContain('Ukryto: Zapytania');
        act(() => button('Pokaż ukryte (1)').click());
        act(() => button('Przywróć').click());
        expect(statusRegion(r).textContent).toContain('Przywrócono: Zapytania');
    });

    it('komenda bez zmiany prezentacji (np. resize) nic nie ogłasza', () => {
        const r = mount();
        startRun();
        workspaceItem();
        const before = statusRegion(r).textContent;
        act(() => userLayoutCommand({ type: 'resize', id: 'm', scale: 1.2 }));
        expect(statusRegion(r).textContent).toBe(before);
    });

    it('nowy element gotowy ogłaszany raz w przebiegu; aktualizacja danych nie ogłasza ponownie', () => {
        const r = mount();
        startRun();
        workspaceItem(false);
        expect(statusRegion(r).textContent).not.toContain('Nowy element');
        agent({ version: V, updateDataModel: { surfaceId: 'workspace', path: '/items/m', value: chartData } });
        expect(statusRegion(r).textContent).toContain('Nowy element na stole: Zapytania');
        act(() => userLayoutCommand({ type: 'dismiss', id: 'm' })); // inny komunikat w regionie
        agent({ version: V, updateDataModel: { surfaceId: 'workspace', path: '/items/m', value: { ...chartData, kind: 'bar' } } });
        expect(statusRegion(r).textContent).not.toContain('Nowy element');
    });

    it('element, którego nie da się wyświetlić: uprzejmy komunikat (błąd nieblokujący), raz w przebiegu', () => {
        const r = mount();
        startRun();
        workspaceItem(false);
        agent({ version: V, updateDataModel: { surfaceId: 'workspace', path: '/items/m', value: { ...chartData, kind: 'pie' } } });
        expect(statusRegion(r).textContent).toContain('Nie można wyświetlić elementu: Zapytania');
        expect(alertRegion(r).textContent).toBe('');
        act(() => userLayoutCommand({ type: 'dismiss', id: 'm' }));
        agent({ version: V, updateDataModel: { surfaceId: 'workspace', path: '/items/m', value: { ...chartData, kind: 'area' } } });
        expect(statusRegion(r).textContent).not.toContain('Nie można wyświetlić');
    });

    it('decyzja w HUD', () => {
        const r = mount();
        startRun();
        agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
        agent({ version: V, updateComponents: { surfaceId: 'hud', components: [
            { id: 'root', component: 'Approval', title: 'Pilotaż 24/7', summary: 'S' },
        ] } });
        expect(statusRegion(r).textContent).toContain('Decyzja do podjęcia: Pilotaż 24/7');
    });

    it('błąd przebiegu (blokujący) trafia do role="alert", nie do lokalnego statusu', () => {
        const r = mount();
        startRun();
        act(() => useAiUi.getState().receiveStatus(runId(), 'error', 'brak połączenia'));
        expect(alertRegion(r).textContent).toContain('Błąd przebiegu');
        expect(alertRegion(r).textContent).toContain('brak połączenia');
    });
});

describe('napływ danych nie przejmuje fokusu', () => {
    it('fokus na przycisku zostaje przy nowych elementach, danych, narracji i decyzji', () => {
        mount();
        const outside = document.createElement('button');
        document.body.appendChild(outside);
        outside.focus();
        startRun();
        workspaceItem();
        agent({ narration: { text: 'Nowe dane' } });
        agent({ version: V, createSurface: { surfaceId: 'hud', catalogId: 'flowassist/v2' } });
        agent({ version: V, updateComponents: { surfaceId: 'hud', components: [
            { id: 'root', component: 'Approval', title: 'Decyzja', summary: 'S' },
        ] } });
        expect(document.activeElement).toBe(outside);
        outside.remove();
    });
});
