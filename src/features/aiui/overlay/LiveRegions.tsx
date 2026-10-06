'use client';

import { useEffect } from 'react';
import { useAiUi, type AiUiState } from '../store';
import { resolveItem, workspaceChildren } from '../workspace';
import { alertAnnounce, announce, clearAlert, useAnnouncer } from './announcer';

// Regiony ogłoszeń dla czytników ekranu (P0.5, plan v1.3.2 R7). Zawsze zamontowane w AiUiOverlay, niezależnie
// od widoczności napisów (compact: napisy chowane przy otwartej szufladzie), zmienia się tylko ich treść.
// Ogłoszenia nigdy nie przenoszą fokusu.

/** Narracja agenta (`store.narration.text`) — jedyny region tej treści; wizualny napis obok jest aria-hidden. */
export function NarrationRegion() {
    const text = useAiUi((s) => s.narration.text);
    return <div data-region="narration" role="status" aria-live="polite" aria-atomic="true" className="sr-only">{text ?? ''}</div>;
}

/** Komunikaty klienta: uprzejmy status i alert tylko dla błędu blokującego. */
export function ClientRegions() {
    const status = useAnnouncer((s) => s.status);
    const alert = useAnnouncer((s) => s.alert);
    return (
        <>
            <div data-region="status" role="status" aria-live="polite" aria-atomic="true" className="sr-only">
                <span key={status.seq}>{status.text}</span>
            </div>
            <div data-region="alert" role="alert" aria-atomic="true" className="sr-only">
                <span key={alert.seq}>{alert.text}</span>
            </div>
        </>
    );
}

const decisionTitle = (s: AiUiState) => {
    const root = s.surfaces.hud?.components.root;
    if (!root || root.component !== 'Approval') return null;
    return typeof root.title === 'string' ? root.title : 'Decyzja';
};

/**
 * Polityka ogłoszeń klienta (ze stanu, raz na zdarzenie w przebiegu): start i koniec przebiegu, nowy element `ready`,
 * element w `fallback` (uprzejmie — błąd nieblokujący), decyzja w HUD; błąd przebiegu — alert.
 * Gesty użytkownika potwierdza `userLayoutCommand`. Napływ danych bez zmiany stanu z listy nic nie ogłasza.
 */
export function useClientAnnouncements() {
    useEffect(() => {
        let ready = new Set<string>();
        let failed = new Set<string>();
        let decision: string | null = null;
        const seen = (s: AiUiState) => {
            const surface = s.surfaces.workspace;
            for (const id of (surface && workspaceChildren(surface)) ?? []) {
                const v = resolveItem(surface!, id);
                if (v.status === 'ready') ready.add(id);
                if (v.status === 'fallback') failed.add(id);
            }
            decision = decisionTitle(s);
        };
        seen(useAiUi.getState()); // stan zastany przy montowaniu nie jest nowością

        return useAiUi.subscribe((s, p) => {
            const messages: string[] = [];
            const newRun = s.scenario.runId !== p.scenario.runId;
            if (newRun) { ready = new Set(); failed = new Set(); decision = null; clearAlert(); }
            if (s.scenario.status !== p.scenario.status || newRun) {
                if (s.scenario.status === 'running' && newRun) messages.push('Agent rozpoczął pracę');
                if (s.scenario.status === 'done') messages.push('Przebieg zakończony');
                if (s.scenario.status === 'error') alertAnnounce(`Błąd przebiegu${s.scenario.error ? `: ${s.scenario.error}` : ''}`);
            }
            // tylko zmiana surface'u stołu rozwiązuje elementy (HUD, szuflada tasków nie)
            if (s.surfaces.workspace !== p.surfaces.workspace) {
                const surface = s.surfaces.workspace;
                const members = new Set((surface && workspaceChildren(surface)) ?? []);
                // P6: element, który wypadł z Workspace.children, po ponownym dodaniu jest nowym wpisem — znowu nowością
                ready.forEach((id) => { if (!members.has(id)) ready.delete(id); });
                failed.forEach((id) => { if (!members.has(id)) failed.delete(id); });
                const fresh: string[] = [], broken: string[] = [];
                members.forEach((id) => {
                    const v = resolveItem(surface!, id);
                    if (v.status === 'ready') failed.delete(id); // po naprawie nawrót błędu jest znowu nowością
                    if (v.status === 'ready' && !ready.has(id)) { ready.add(id); fresh.push(v.title); }
                    if (v.status === 'fallback' && !failed.has(id)) { failed.add(id); broken.push(v.title ?? id); }
                });
                if (fresh.length) messages.push(`${fresh.length === 1 ? 'Nowy element na stole' : 'Nowe elementy na stole'}: ${fresh.join(', ')}`);
                if (broken.length) messages.push(`Nie można wyświetlić elementu: ${broken.join(', ')}`);
            }
            if (s.surfaces.hud !== p.surfaces.hud) {
                const title = decisionTitle(s);
                if (title && title !== decision) messages.push(`Decyzja do podjęcia: ${title}`);
                decision = title;
            }
            if (messages.length) announce(messages.join('. '));
        });
    }, []);
}
