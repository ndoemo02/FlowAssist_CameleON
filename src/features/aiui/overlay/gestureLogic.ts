// Czysta logika gestów (bez Reacta i DOM): tożsamość gestu, decyzja na końcu gestu, skróty klawiatury.
// Moduł gestures.ts tylko podpina ją pod zdarzenia @use-gesture.

import type { LayoutCommand, LayoutEntry } from '../layout';

const KEY_STEP = 0.02;

/** Tożsamość gestu: instancja wpisu + rewizja z chwili startu oraz pozycja/wymiary do przeliczenia ruchu. */
export interface GestureToken {
    instance: number;
    rev: number;
    x: number;
    y: number;
    w: number;
    h: number;
}

export function gestureToken(e: LayoutEntry, dim: { w: number; h: number }): GestureToken {
    return { instance: e.instance, rev: e.rev, x: e.x, y: e.y, w: dim.w || 1, h: dim.h || 1 };
}

/** Gest jest nieaktualny, gdy element zniknął, został odtworzony (nowa instancja) albo zmienił go ktoś inny (rev). */
export function isGestureStale(current: LayoutEntry | undefined, token: GestureToken): boolean {
    return !current || current.instance !== token.instance || current.rev !== token.rev || current.presentation === 'dismissed';
}

/** Polecenie na końcu przeciągania: flick w dół na focusie = ukryj, inaczej przesuń. null = gest anulowany. */
export function dragEndCommand(
    id: string, current: LayoutEntry | undefined, token: GestureToken, mx: number, my: number, flickDown: boolean,
): LayoutCommand | null {
    if (!current || isGestureStale(current, token)) return null;
    if (flickDown && current.presentation === 'focus') return { type: 'dismiss', id, rev: token.rev, instance: token.instance };
    return { type: 'move', id, x: token.x + mx / token.w, y: token.y + my / token.h, rev: token.rev, instance: token.instance };
}

/**
 * Skróty klawiatury karty. Działają tylko, gdy fokus ma SAMA karta (`fromCard`) — zdarzenia z jej
 * przycisków (Enter na „⋯”, „+” itd.) nie mogą uruchamiać skrótów karty.
 */
export function keyCommand(key: string, id: string, e: LayoutEntry | undefined, fromCard: boolean): LayoutCommand | null {
    if (!fromCard || !e) return null;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[key]) {
        const [dx, dy] = moves[key];
        return { type: 'move', id, x: e.x + dx * KEY_STEP, y: e.y + dy * KEY_STEP, rev: e.rev, instance: e.instance };
    }
    if (key === 'Enter') return { type: 'toScreen', id };
    if (key === 'Delete') return { type: 'dismiss', id };
    if (key === 'Escape') return { type: 'blur' };
    return null;
}
