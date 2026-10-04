'use client';

/**
 * Ustawia warstwę jako nieaktywną (inert): poza kolejnością Tab, bez kliknięć i bez fokusu.
 * Jeśli fokus był w środku — zdejmuje go, żeby niewidoczny panel nie przyjmował klawiatury.
 */
export function setLayerInert(el: HTMLElement | null, inert: boolean) {
    if (!el || el.inert === inert) return;
    el.inert = inert;
    if (inert) {
        el.setAttribute('aria-hidden', 'true');
        const active = document.activeElement as HTMLElement | null;
        if (active && el.contains(active)) active.blur();
    } else {
        el.removeAttribute('aria-hidden');
    }
}
