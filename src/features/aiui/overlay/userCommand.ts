'use client';

// Komenda układu wydana przez UŻYTKOWNIKA (gest, przycisk, klawisz) — przez koordynator store (`layoutCommand`,
// kernel bez zmian) — z potwierdzeniem w lokalnym regionie statusu, gdy zmieniła się prezentacja elementu (P0.5).
// Zmiany od agenta (hinty) nie przechodzą tędy: o nich mówi narracja agenta.

import type { LayoutCommand, LocalPresentation } from '../layout';
import { useAiUi } from '../store';
import { resolveItem } from '../workspace';
import { announce } from './announcer';
import { requestScreenFocus } from './focusTarget';

/** Tytuł elementu do komunikatu: rozwiązany, a gdy brak — id. */
export function itemTitle(id: string): string {
    const surface = useAiUi.getState().surfaces.workspace;
    const view = surface ? resolveItem(surface, id) : null;
    return view?.title ?? id;
}

function confirmation(before: LocalPresentation | undefined, after: LocalPresentation, title: string): string | null {
    if (after === 'dismissed') return `Ukryto: ${title}`;
    if (after === 'screen') return `Na ekranie: ${title}`;
    if (before === 'dismissed') return `Przywrócono: ${title}`;
    if (before === 'screen') return `Na stole: ${title}`;
    return null; // focus / blur: widoczna zmiana formy, bez komunikatu
}

export function userLayoutCommand(cmd: LayoutCommand) {
    const state = useAiUi.getState();
    const id = 'id' in cmd ? cmd.id : null;
    const before = id ? state.layout[id]?.presentation : undefined;
    state.layoutCommand(cmd);
    if (!id) return;
    const after = useAiUi.getState().layout[id]?.presentation;
    if (!after || after === before) return;
    // LOW-1: „Na ekran” od użytkownika z fokusem w overlayu — fokus pójdzie za elementem na panel ekranu
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (after === 'screen' && active && active !== document.body && active.closest('[data-aiui-overlay]')) requestScreenFocus();
    const message = confirmation(before, after, itemTitle(id));
    if (message) announce(message);
}
