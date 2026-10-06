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
 * pasek decyzji HUD. Kontenery warstw mają `data-focus-layer` i `tabIndex=-1` (fokus tylko programowy).
 */
export function safeFocusTarget(root: ParentNode = document): HTMLElement | null {
    for (const selector of ['[data-focus-layer="table"]', '[data-focus-layer="screen"]', '[data-focus-layer="hud"] button']) {
        const el = root.querySelector<HTMLElement>(selector);
        if (canTakeFocus(el)) return el;
    }
    return null;
}

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
            if (!last || (active && active !== document.body)) return;
            const lost = last;
            last = null;
            if (canTakeFocus(lost)) return; // użytkownik sam zdjął fokus — zostaje na <body>
            safeFocusTarget(root)?.focus();
        };
        const schedule = () => { if (!scheduled) { scheduled = true; queueMicrotask(check); } };
        const onFocusIn = (e: FocusEvent) => { last = e.target as HTMLElement; };
        const observer = new MutationObserver(schedule);
        observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert', 'aria-hidden'] });
        root.addEventListener('focusin', onFocusIn);
        root.addEventListener('focusout', schedule);
        return () => {
            observer.disconnect();
            root.removeEventListener('focusin', onFocusIn);
            root.removeEventListener('focusout', schedule);
        };
    }, [rootRef]);
}
