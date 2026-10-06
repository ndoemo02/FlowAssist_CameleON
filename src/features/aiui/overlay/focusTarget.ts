'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Czy element może przyjąć fokus (P0.5): nadal w DOM i poza nieaktywną warstwą (`setLayerInert` ustawia `inert`
 * i `aria-hidden`). Używane przy oddawaniu fokusu openerowi — zniknięty albo nieaktywny opener nie dostaje fokusu.
 */
export function canTakeFocus(el: HTMLElement | null | undefined): el is HTMLElement {
    return Boolean(el && el.isConnected && !el.closest('[inert]') && !el.closest('[aria-hidden="true"]'));
}

/**
 * Bezpieczny cel fokusu (P0.5, R7): kontener aktywnej warstwy (stół, panel ekranu), a gdy żadna nie jest aktywna —
 * pasek decyzji HUD; w ostateczności korzeń overlayu (nazwana grupa). Kontenery warstw mają `data-focus-layer` i `tabIndex=-1` (fokus tylko programowy).
 */
export function safeFocusTarget(root: ParentNode = document): HTMLElement | null {
    for (const selector of ['[data-focus-layer="table"]', '[data-focus-layer="screen"]', '[data-focus-layer="hud"] button']) {
        const el = root.querySelector<HTMLElement>(selector);
        if (canTakeFocus(el)) return el;
    }
    // ostateczny cel (Astra P0.5): korzeń overlayu — gdy nie ma stołu, ekranu ani decyzji (ostatnia karta, restart)
    const fallback = root instanceof HTMLElement && root.dataset.focusLayer === 'root'
        ? root : root.querySelector<HTMLElement>('[data-focus-layer="root"]');
    return canTakeFocus(fallback) ? fallback : null;
}

/**
 * Intencja fokusu na panelu ekranu (LOW-1, decyzja właściciela 2026-10-06): „Na ekran” wydane przez UŻYTKOWNIKA
 * z fokusem w overlayu. Do czasu aktywacji panelu (obrót kamery, kotwica) ratunek nie przenosi fokusu na pasek
 * decyzji; aktywny panel sam przejmuje fokus. Komendy agenta intencji nie tworzą. Wygasa po SCREEN_INTENT_MS.
 */
export const SCREEN_INTENT_MS = 8000;
let screenIntentUntil = 0;
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
export function requestScreenFocus() { screenIntentUntil = clock() + SCREEN_INTENT_MS; }
export function hasScreenFocusIntent() { return clock() <= screenIntentUntil; }
export function clearScreenFocusIntent() { screenIntentUntil = 0; }

/**
 * Ratunek fokusu w overlayu: gdy element z fokusem zniknie (usunięty element, odmontowany panel, decyzja) albo jego
 * warstwa stanie się nieaktywna, fokus — zamiast spaść na <body> — trafia na bezpieczny cel.
 * Fokus zdjęty przez użytkownika (np. klik w scenę: element nadal ważny) nie jest przywracany, a gdy fokus żyje
 * gdziekolwiek indziej, nic się nie dzieje — dane agenta nigdy nie zabierają fokusu.
 */
export function useFocusRescue(rootRef: RefObject<HTMLElement>) {
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        let last: HTMLElement | null = null; // ostatni element overlayu z fokusem
        let scheduled = false;
        const check = () => {
            scheduled = false;
            const active = document.activeElement;
            if (active && active !== document.body) {
                if (!root.contains(active)) last = null; // fokus żyje poza overlayem — nie jest już „naszym” fokusem
                return;
            }
            if (!last) return;
            const lost = last;
            last = null;
            if (canTakeFocus(lost)) return; // użytkownik sam zdjął fokus — zostaje na <body>
            if (hasScreenFocusIntent()) return; // LOW-1: fokus czeka na panel ekranu (przejmie go po aktywacji)
            // preventScroll: overlay jest w sekcji hero przewijanej strony — ratunek nie może przejąć viewportu
            safeFocusTarget(root)?.focus({ preventScroll: true });
        };
        const schedule = () => { if (!scheduled) { scheduled = true; queueMicrotask(check); } };
        const onFocusIn = (e: FocusEvent) => { last = e.target as HTMLElement; };
        const onFocusOut = (e: FocusEvent) => {
            const to = e.relatedTarget as Node | null;
            if (to && !root.contains(to)) last = null; // fokus przeszedł poza overlay (review P0.5 krok 3–4, HIGH-1)
            schedule();
        };
        const observer = new MutationObserver(schedule);
        observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert', 'aria-hidden'] });
        root.addEventListener('focusin', onFocusIn);
        root.addEventListener('focusout', onFocusOut);
        return () => {
            observer.disconnect();
            root.removeEventListener('focusin', onFocusIn);
            root.removeEventListener('focusout', onFocusOut);
        };
    }, [rootRef]);
}
