// Czysty model układu stołu roboczego (plan v1.2.1, II.5): reguły P1–P10.
// reconcileLayout uzgadnia układ z treścią agenta (Workspace.children + hinty), a presentationReducer
// obsługuje komendy użytkownika. Pozycja i rozmiar należą do klienta — agent nigdy ich nie ustawia.

import type { Presentation } from './contract';

export type LocalPresentation = Presentation | 'dismissed';

export interface LayoutEntry {
    presentation: LocalPresentation;
    x: number;                     // 0..1 w płaszczyźnie stołu (środek karty)
    y: number;
    scale: number;                 // 0.6..2
    z: number;                     // kolejność nakładania
    lastHint: Presentation | null; // ostatni hint agenta (P4)
    rev: number;                   // rośnie przy zmianach od agenta — anulowanie gestów (II.6)
    moved: boolean;                // użytkownik przesunął kartę (P9)
}

export type Layout = Record<string, LayoutEntry>;

/** Element aktywny (członek Workspace.children) z punktu widzenia układu. */
export interface ItemMeta {
    id: string;
    delivered: boolean;            // komponent WorkspaceItem już dostarczony (P6: inaczej szkielet)
    hint: Presentation | null;     // hint prezentacji z komponentu
    priority: number;
}

export const SCALE_MIN = 0.6;
export const SCALE_MAX = 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Auto-layout (P9): siatka wg rangi (priorytet, potem kolejność), środek komórki w 0..1. */
export function autoSlot(rank: number, count: number) {
    const cols = count <= 3 ? Math.max(1, count) : 3;
    const rows = Math.ceil(count / cols);
    const col = rank % cols, row = Math.floor(rank / cols);
    return { x: (col + 0.5) / cols, y: (row + 0.5) / rows };
}

/** Wymusza P1/P2: co najwyżej jeden element na ekranie i jeden w focusie (preferowany `keep`). */
function enforceSingle(layout: Layout, kind: 'screen' | 'focus', keep: string | null): Layout {
    const holders = Object.keys(layout).filter((id) => layout[id].presentation === kind);
    if (holders.length <= 1) return layout;
    const winner = keep && holders.includes(keep) ? keep : holders[holders.length - 1];
    const next = { ...layout };
    for (const id of holders) if (id !== winner) next[id] = { ...next[id], presentation: 'card' };
    return next;
}

/**
 * Uzgadnia układ z aktywnymi elementami (P4–P7, P9).
 * @param items  aktywne elementy w kolejności Workspace.children; null = brak surface'u/roota (reset, P7)
 * @returns      układ (ta sama referencja, gdy nic się nie zmieniło) i flaga „agent poprosił o ekran” (P3)
 */
export function reconcileLayout(prev: Layout, items: ItemMeta[] | null): { layout: Layout; screenHint: boolean } {
    if (!items) return { layout: Object.keys(prev).length ? {} : prev, screenHint: false };

    const ranked = items.map((it, i) => ({ it, i })).sort((a, b) => a.it.priority - b.it.priority || a.i - b.i);
    const rankOf = new Map(ranked.map((r, rank) => [r.it.id, rank]));
    const maxZ = Object.values(prev).reduce((m, e) => Math.max(m, e.z), 0);

    let changed = false, screenHint = false;
    let lastScreen: string | null = null, lastFocus: string | null = null;
    const next: Layout = {};

    for (const it of items) {
        const old = prev[it.id];
        if (!old) {
            // P6: nowy wpis (także dla „jeszcze niedostarczonego” — szkielet z zarezerwowanym miejscem)
            const hint = it.delivered ? it.hint : null;
            const presentation: LocalPresentation = hint ?? 'card';
            next[it.id] = { presentation, ...autoSlot(rankOf.get(it.id)!, items.length), scale: 1, z: maxZ + 1 + rankOf.get(it.id)!, lastHint: hint, rev: 0, moved: false };
            if (presentation === 'screen') { screenHint = true; lastScreen = it.id; }
            if (presentation === 'focus') lastFocus = it.id;
            changed = true;
            continue;
        }
        if (it.delivered && it.hint !== old.lastHint) {
            changed = true;
            if (old.presentation === 'dismissed' || it.hint === null) {
                // P5: ukryty przez użytkownika — hint tylko zapamiętany; null — brak intencji
                next[it.id] = { ...old, lastHint: it.hint };
            } else {
                // P4: zmiana wartości hintu = jawna intencja agenta
                next[it.id] = { ...old, presentation: it.hint, lastHint: it.hint, rev: old.rev + 1 };
                if (it.hint === 'screen') { screenHint = true; lastScreen = it.id; }
                if (it.hint === 'focus') lastFocus = it.id;
            }
            continue;
        }
        next[it.id] = old;
    }
    // P6: usunięte z listy dzieci znikają z układu
    if (Object.keys(prev).some((id) => !(id in next))) changed = true;
    if (!changed) return { layout: prev, screenHint: false };

    // P9: przy zmianie liczby elementów karty NIEprzesunięte przez użytkownika wracają do siatki
    // (nowy element nie ląduje na starej karcie); przesunięte zostają tam, gdzie je odłożono.
    if (items.length !== Object.keys(prev).length) {
        for (const it of items) {
            const e = next[it.id];
            if (e.moved) continue;
            const slot = autoSlot(rankOf.get(it.id)!, items.length);
            if (e.x !== slot.x || e.y !== slot.y) next[it.id] = { ...e, ...slot };
        }
    }

    let layout = enforceSingle(next, 'screen', lastScreen);
    layout = enforceSingle(layout, 'focus', lastFocus);
    return { layout, screenHint };
}

export type LayoutCommand =
    | { type: 'focus'; id: string }
    | { type: 'blur' }
    | { type: 'toScreen'; id: string }
    | { type: 'toCard'; id: string }
    | { type: 'dismiss'; id: string }
    | { type: 'restore'; id: string }
    | { type: 'move'; id: string; x: number; y: number; rev: number }
    | { type: 'resize'; id: string; scale: number; rev?: number }
    | { type: 'raise'; id: string };

/**
 * Komendy użytkownika (zmiany formy — lokalne, bez agenta). Nie podbijają `rev`.
 * `cameraFront` = jawna komenda „na ekran” (P3: zawsze przenosi kamerę).
 */
export function presentationReducer(layout: Layout, cmd: LayoutCommand): { layout: Layout; changed: boolean; cameraFront: boolean } {
    const none = { layout, changed: false, cameraFront: false };
    const topZ = () => Object.values(layout).reduce((m, e) => Math.max(m, e.z), 0) + 1;
    const set = (id: string, patch: Partial<LayoutEntry>, base: Layout = layout) => ({ ...base, [id]: { ...base[id], ...patch } });

    if (cmd.type === 'blur') {
        const id = Object.keys(layout).find((k) => layout[k].presentation === 'focus');
        return id ? { layout: set(id, { presentation: 'card' }), changed: true, cameraFront: false } : none;
    }

    const e = layout[cmd.id];
    if (!e) return none; // element usunięty (np. w trakcie gestu) — komenda anulowana

    switch (cmd.type) {
        case 'focus': {
            if (e.presentation !== 'card') return none;
            const demoted = enforceSingle(set(cmd.id, { presentation: 'focus', z: topZ() }), 'focus', cmd.id);
            return { layout: demoted, changed: true, cameraFront: false };
        }
        case 'toScreen': {
            if (e.presentation === 'dismissed') return none;
            const next = enforceSingle(set(cmd.id, { presentation: 'screen' }), 'screen', cmd.id);
            return { layout: next, changed: true, cameraFront: true };
        }
        case 'toCard':
            return e.presentation === 'card' || e.presentation === 'dismissed' ? none
                : { layout: set(cmd.id, { presentation: 'card' }), changed: true, cameraFront: false };
        case 'dismiss':
            return e.presentation === 'dismissed' ? none
                : { layout: set(cmd.id, { presentation: 'dismissed' }), changed: true, cameraFront: false };
        case 'restore':
            return e.presentation !== 'dismissed' ? none
                : { layout: set(cmd.id, { presentation: 'card', z: topZ() }), changed: true, cameraFront: false };
        case 'move':
            // II.6: zapis gestu tylko, gdy wpis się nie zmienił od startu gestu
            if (e.rev !== cmd.rev || e.presentation === 'dismissed') return none;
            return { layout: set(cmd.id, { x: clamp(cmd.x, 0, 1), y: clamp(cmd.y, 0, 1), moved: true }), changed: true, cameraFront: false };
        case 'resize':
            if ((cmd.rev !== undefined && e.rev !== cmd.rev) || e.presentation === 'dismissed') return none;
            return { layout: set(cmd.id, { scale: clamp(cmd.scale, SCALE_MIN, SCALE_MAX) }), changed: true, cameraFront: false };
        case 'raise':
            return { layout: set(cmd.id, { z: topZ() }), changed: true, cameraFront: false };
    }
}

/** Migawka układu dla agenta (II.4) — bez współrzędnych. */
export function layoutSnapshot(layout: Layout) {
    const ids = Object.keys(layout);
    return {
        screen: ids.find((id) => layout[id].presentation === 'screen') ?? null,
        focus: ids.find((id) => layout[id].presentation === 'focus') ?? null,
        dismissed: ids.filter((id) => layout[id].presentation === 'dismissed'),
    };
}

export const isScreenOccupied = (layout: Layout) => Object.values(layout).some((e) => e.presentation === 'screen');
