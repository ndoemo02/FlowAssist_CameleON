'use client';

// Moduł gestów (plan v1.2.1, E4/II.6): JEDYNE miejsce mapowania gest → intencja.
// Karty nie wiedzą, czym je dotknięto — dostają tylko komendy layoutu (lokalne) lub akcje semantyczne.
// W trakcie drag/pinch pozycja żyje tylko w `transform` (ref); zapis do store'u dopiero na końcu gestu.
// Tożsamość gestu (instancja wpisu + rev, gestureLogic.ts) jest sprawdzana w każdej klatce i przy
// poleceniu końcowym — zmiana od agenta, siatki lub odtworzenie elementu anuluje gest bez zapisu.

import { useGesture } from '@use-gesture/react';
import type { RefObject } from 'react';
import { useAiUi } from '../store';
import { SCALE_MAX, SCALE_MIN } from '../layout';
import { dragEndCommand, gestureToken, isGestureStale, keyCommand, type GestureToken } from './gestureLogic';
import { userLayoutCommand } from './userCommand';
import { DOUBLE_TAP_MS } from './gestureConstants';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// DOUBLE_TAP_MS: gestureConstants.ts (wspólne ze strażnikiem FLAKE-2 w e2e)
const FOCUS_BOOST = 1.2;      // powiększenie karty w focusie…
const MAX_VISUAL_SCALE = 1.5; // …ale łącznie nie więcej (karta nie zasłania własnych przycisków)

/** Skala wizualna karty: rozmiar użytkownika × powiększenie focusu, z limitem. */
export const visualScale = (scale: number, focused: boolean) => (focused ? Math.min(MAX_VISUAL_SCALE, Math.max(scale, scale * FOCUS_BOOST)) : scale);

// Ostatni tap per karta — podwójny tap wykrywamy tutaj, nie natywnym dblclick (focus zmienia geometrię
// karty między kliknięciami, więc drugie kliknięcie trafia w inny element i przeglądarka nie zgłasza dblclick).
const lastTap = new Map<string, number>();

/** Element z atrybutem data-nodrag (przyciski, menu) nie startuje gestów karty. */
const fromControl = (e: { target: EventTarget | null } | undefined) => Boolean((e?.target as HTMLElement | null)?.closest?.('[data-nodrag]'));

/** Tap na przycisku karty to kliknięcie przycisku, nie gest karty (treść karty w focusie przyciskiem nie jest). */
const fromButton = (e: { target: EventTarget | null } | undefined) =>
    Boolean((e?.target as HTMLElement | null)?.closest?.('button, a[href], input, select, textarea, [role="button"]'));

/**
 * Gest przerwany przez przeglądarkę/system. @use-gesture zgłasza pointercancel/touchcancel jako zwykły
 * koniec gestu (`last`), więc bez tej kontroli anulowanie zapisywałoby geometrię (E2E-2, ADR 0006; I7).
 */
const cancelledEnd = (last: boolean, e: Event | undefined) => last && (e?.type === 'pointercancel' || e?.type === 'touchcancel');

// Gest anulowany przez nas (`cancel()`: start na [data-nodrag], gest nieaktualny, brak wpisu): @use-gesture
// woła potem handler jeszcze raz z `canceled`, `last` i `first: false` (setTimeout po cancel), a przy pointer
// capture — przy każdym kolejnym ruchu do puszczenia przycisku. Taki callback nie może nic zapisać (review #2, I7).

export interface CardGestureOptions {
    id: string;
    cardRef: RefObject<HTMLElement>;
    containerRef: RefObject<HTMLElement>;
    baseTransform: () => string;          // transform wynikający ze stanu (do przywrócenia po geście)
    onMenu: () => void;                   // long press / prawy klik → menu akcji semantycznych
    enabled: boolean;                     // compact: swobodne gesty wyłączone (E13)
}

/** Gesty karty na stole roboczym (desktop). */
export function useCardGestures({ id, cardRef, containerRef, baseTransform, enabled }: CardGestureOptions) {
    const cmd = userLayoutCommand; // komendy użytkownika: potwierdzenie zmiany prezentacji (P0.5)
    const entry = () => useAiUi.getState().layout[id];
    const restore = () => { if (cardRef.current) cardRef.current.style.transform = baseTransform(); };

    const bind = useGesture(
        {
            onDrag: ({ first, last, tap, movement: [mx, my], swipe: [, sy], event, memo, cancel, canceled }) => {
                if (canceled) { restore(); return memo; }
                if (first && fromControl(event)) { cancel(); return; }
                if (cancelledEnd(last, event)) { restore(); return; }
                const e = entry();
                if (!e) { restore(); cancel(); return; }
                if (tap) {
                    // podwójny tap → na ekran; pojedynczy → focus (zdejmowanie focusu — klik w tło).
                    // Tap na przycisku nie liczy się do podwójnego tapu: dwa szybkie „+” to nie „na ekran”.
                    const onButton = fromButton(event);
                    const t = performance.now(), prev = onButton ? -Infinity : lastTap.get(id) ?? -Infinity;
                    if (onButton) lastTap.delete(id); else lastTap.set(id, t);
                    if (t - prev < DOUBLE_TAP_MS) { lastTap.delete(id); cmd({ type: 'toScreen', id }); }
                    else if (e.presentation === 'card') cmd({ type: 'focus', id });
                    return;
                }
                let token = memo as GestureToken | undefined;
                if (!token) {
                    token = gestureToken(e, { w: containerRef.current?.clientWidth ?? 1, h: containerRef.current?.clientHeight ?? 1 });
                    cmd({ type: 'raise', id }); // przeciągana karta na wierzch (raise nie zmienia tożsamości gestu)
                }
                // zmiana spoza gestu w trakcie (agent, siatka, odtworzenie elementu) → anuluj bez zapisu
                if (isGestureStale(entry(), token)) { restore(); cancel(); return; }
                const el = cardRef.current;
                if (el) el.style.transform = `translate(calc(-50% + ${mx}px), calc(-50% + ${my}px)) scale(${visualScale(e.scale, e.presentation === 'focus')})`;
                if (last) {
                    restore();
                    const end = dragEndCommand(id, entry(), token, mx, my, sy === 1); // flick w dół na focusie = ukryj
                    if (end) cmd(end);
                }
                return token;
            },
            onPinch: ({ first, last, movement: [ms], memo, event, cancel, canceled }) => {
                if (canceled) { restore(); return memo; }
                if (first && fromControl(event)) { cancel(); return; }
                if (cancelledEnd(last, event)) { restore(); return; }
                const e = entry();
                if (!e) { restore(); cancel(); return; }
                const m = (memo as { token: GestureToken; scale: number } | undefined) ?? { token: gestureToken(e, { w: 1, h: 1 }), scale: e.scale };
                if (isGestureStale(entry(), m.token)) { restore(); cancel(); return; }
                const scale = clamp(m.scale * ms, SCALE_MIN, SCALE_MAX);
                const el = cardRef.current;
                if (el) el.style.transform = `translate(-50%, -50%) scale(${visualScale(scale, e.presentation === 'focus')})`;
                if (last) {
                    restore();
                    cmd({ type: 'resize', id, scale, rev: m.token.rev, instance: m.token.instance });
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
    // filterTaps: @use-gesture połyka (capture) click po geście, który nie był tapem — także po geście
    // zaczętym na kontrolce [data-nodrag] i anulowanym. Kliknięcie w kontrolkę zawsze do niej dociera.
    return (...args: Parameters<typeof bind>) => {
        const props = bind(...args) as ReturnType<typeof bind> & { onClickCapture?: (e: React.MouseEvent) => void };
        const swallowClick = props.onClickCapture;
        return { ...props, onClickCapture: (e: React.MouseEvent) => { if (!fromControl(e)) swallowClick?.(e); } };
    };
}

/** Uchwyt zmiany rozmiaru w rogu karty (desktop). */
export function useResizeHandle(id: string, cardRef: RefObject<HTMLElement>, baseTransform: () => string) {
    const cmd = userLayoutCommand; // komendy użytkownika: potwierdzenie zmiany prezentacji (P0.5)
    const restore = () => { if (cardRef.current) cardRef.current.style.transform = baseTransform(); };
    return useGesture({
        onDrag: ({ last, movement: [mx, my], memo, cancel, canceled, event }) => {
            event.stopPropagation();
            if (canceled) { restore(); return memo; }
            if (cancelledEnd(last, event)) { restore(); return; }
            const e = useAiUi.getState().layout[id];
            if (!e) { restore(); cancel(); return; }
            const m = (memo as { token: GestureToken; scale: number } | undefined) ?? { token: gestureToken(e, { w: 1, h: 1 }), scale: e.scale };
            if (isGestureStale(e, m.token)) { restore(); cancel(); return; }
            const scale = clamp(m.scale * (1 + (mx + my) / 400), SCALE_MIN, SCALE_MAX);
            const el = cardRef.current;
            if (el) el.style.transform = `translate(-50%, -50%) scale(${visualScale(scale, e.presentation === 'focus')})`;
            if (last) {
                restore();
                cmd({ type: 'resize', id, scale, rev: m.token.rev, instance: m.token.instance });
            }
            return m;
        },
    }, { drag: { pointer: { buttons: 1 } } });
}

/** Klawiatura karty: skróty tylko, gdy fokus ma sama karta (nie jej przyciski) — patrz keyCommand. */
export function cardKeyHandler(id: string) {
    return (ev: React.KeyboardEvent) => {
        const s = useAiUi.getState();
        const command = keyCommand(ev.key, id, s.layout[id], ev.target === ev.currentTarget);
        if (!command) return;
        ev.preventDefault();
        userLayoutCommand(command);
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
