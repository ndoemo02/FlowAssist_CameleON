'use client';

// Moduł gestów (plan v1.2.1, E4/II.6): JEDYNE miejsce mapowania gest → intencja.
// Karty nie wiedzą, czym je dotknięto — dostają tylko komendy layoutu (lokalne) lub akcje semantyczne.
// W trakcie drag/pinch pozycja żyje tylko w `transform` (ref); zapis do store'u dopiero na końcu gestu,
// z kontrolą `rev` (anulowanie, gdy agent zmienił/usunął element w trakcie).

import { useGesture } from '@use-gesture/react';
import type { RefObject } from 'react';
import { useAiUi } from '../store';
import { SCALE_MAX, SCALE_MIN } from '../layout';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const KEY_STEP = 0.02;
const DOUBLE_TAP_MS = 350;
const FOCUS_BOOST = 1.2;      // powiększenie karty w focusie…
const MAX_VISUAL_SCALE = 1.5; // …ale łącznie nie więcej (karta nie zasłania własnych przycisków)

/** Skala wizualna karty: rozmiar użytkownika × powiększenie focusu, z limitem. */
export const visualScale = (scale: number, focused: boolean) => (focused ? Math.min(MAX_VISUAL_SCALE, Math.max(scale, scale * FOCUS_BOOST)) : scale);

// Ostatni tap per karta — podwójny tap wykrywamy tutaj, nie natywnym dblclick (focus zmienia geometrię
// karty między kliknięciami, więc drugie kliknięcie trafia w inny element i przeglądarka nie zgłasza dblclick).
const lastTap = new Map<string, number>();

/** Element z atrybutem data-nodrag (przyciski, menu) nie startuje gestów karty. */
const fromControl = (e: Event | undefined) => Boolean((e?.target as HTMLElement | null)?.closest?.('[data-nodrag]'));

export interface CardGestureOptions {
    id: string;
    cardRef: RefObject<HTMLElement>;
    containerRef: RefObject<HTMLElement>;
    baseTransform: () => string;          // transform wynikający ze stanu (do przywrócenia po geście)
    onMenu: () => void;                   // long press / prawy klik → menu akcji semantycznych
    enabled: boolean;                     // compact: swobodne gesty wyłączone (E13)
}

/** Gesty karty na stole roboczym (desktop). */
export function useCardGestures({ id, cardRef, containerRef, baseTransform, onMenu, enabled }: CardGestureOptions) {
    const cmd = useAiUi.getState().layoutCommand;
    const entry = () => useAiUi.getState().layout[id];

    return useGesture(
        {
            onDrag: ({ first, last, tap, movement: [mx, my], swipe: [, sy], event, memo, cancel }) => {
                if (first && fromControl(event)) { cancel(); return; }
                const e = entry();
                if (!e) { cancel(); return; }
                if (tap) {
                    // podwójny tap → na ekran; pojedynczy → focus (zdejmowanie focusu — klik w tło)
                    const t = performance.now(), prev = lastTap.get(id) ?? -Infinity;
                    lastTap.set(id, t);
                    if (t - prev < DOUBLE_TAP_MS) { lastTap.delete(id); cmd({ type: 'toScreen', id }); }
                    else if (e.presentation === 'card') cmd({ type: 'focus', id });
                    return;
                }
                if (!memo) cmd({ type: 'raise', id }); // przeciągana karta na wierzch (jeden zapis na starcie)
                const m = memo ?? { rev: e.rev, x: e.x, y: e.y, w: containerRef.current?.clientWidth || 1, h: containerRef.current?.clientHeight || 1 };
                const el = cardRef.current;
                if (el) el.style.transform = `translate(calc(-50% + ${mx}px), calc(-50% + ${my}px)) scale(${visualScale(e.scale, e.presentation === 'focus')})`;
                if (last) {
                    if (el) el.style.transform = baseTransform();
                    if (sy === 1 && e.presentation === 'focus') cmd({ type: 'dismiss', id });   // flick w dół na focusie
                    else cmd({ type: 'move', id, x: m.x + mx / m.w, y: m.y + my / m.h, rev: m.rev });
                }
                return m;
            },
            onPinch: ({ first, last, movement: [ms], memo, event, cancel }) => {
                if (first && fromControl(event)) { cancel(); return; }
                const e = entry();
                if (!e) { cancel(); return; }
                const m = memo ?? { rev: e.rev, scale: e.scale };
                const scale = clamp(m.scale * ms, SCALE_MIN, SCALE_MAX);
                const el = cardRef.current;
                if (el) el.style.transform = `translate(-50%, -50%) scale(${visualScale(scale, e.presentation === 'focus')})`;
                if (last) {
                    if (el) el.style.transform = baseTransform();
                    cmd({ type: 'resize', id, scale, rev: m.rev });
                }
                return m;
            },
        },
        {
            enabled,
            drag: { filterTaps: true, pointer: { buttons: 1 }, swipe: { distance: [50, 50], velocity: [0.4, 0.4] } },
            pinch: { scaleBounds: { min: SCALE_MIN, max: SCALE_MAX } },
            eventOptions: { passive: false },
        },
    );
}

/** Uchwyt zmiany rozmiaru w rogu karty (desktop). */
export function useResizeHandle(id: string, cardRef: RefObject<HTMLElement>, baseTransform: () => string) {
    const cmd = useAiUi.getState().layoutCommand;
    return useGesture({
        onDrag: ({ last, movement: [mx, my], memo, cancel, event }) => {
            event.stopPropagation();
            const e = useAiUi.getState().layout[id];
            if (!e) { cancel(); return; }
            const m = memo ?? { rev: e.rev, scale: e.scale };
            const scale = clamp(m.scale * (1 + (mx + my) / 400), SCALE_MIN, SCALE_MAX);
            const el = cardRef.current;
            if (el) el.style.transform = `translate(-50%, -50%) scale(${visualScale(scale, e.presentation === 'focus')})`;
            if (last) {
                if (el) el.style.transform = baseTransform();
                cmd({ type: 'resize', id, scale, rev: m.rev });
            }
            return m;
        },
    }, { drag: { pointer: { buttons: 1 } } });
}

/** Klawiatura na karcie w focusie: strzałki = przesuń, Enter = na ekran, Delete = ukryj, Escape = zdejmij focus. */
export function cardKeyHandler(id: string) {
    return (ev: React.KeyboardEvent) => {
        const s = useAiUi.getState(), e = s.layout[id];
        if (!e) return;
        const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (moves[ev.key]) {
            ev.preventDefault();
            const [dx, dy] = moves[ev.key];
            s.layoutCommand({ type: 'move', id, x: e.x + dx * KEY_STEP, y: e.y + dy * KEY_STEP, rev: e.rev });
        } else if (ev.key === 'Enter') s.layoutCommand({ type: 'toScreen', id });
        else if (ev.key === 'Delete') s.layoutCommand({ type: 'dismiss', id });
        else if (ev.key === 'Escape') s.layoutCommand({ type: 'blur' });
    };
}

/** Pinch na treści ekranu (także compact): lokalny zoom treści, bez zmiany układu. */
export function useScreenPinch(setZoom: (z: number) => void, getZoom: () => number) {
    return useGesture({
        onPinch: ({ movement: [ms], memo }) => {
            const start = memo ?? getZoom();
            setZoom(clamp(start * ms, 1, 2.5));
            return start;
        },
    }, { pinch: { scaleBounds: { min: 1, max: 2.5 } }, eventOptions: { passive: false } });
}
