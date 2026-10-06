'use client';

/**
 * Czy element może przyjąć fokus (P0.5): nadal w DOM i poza nieaktywną warstwą (`setLayerInert` ustawia `inert`
 * i `aria-hidden`). Używane przy oddawaniu fokusu openerowi — zniknięty albo nieaktywny opener nie dostaje fokusu.
 */
export function canTakeFocus(el: HTMLElement | null | undefined): el is HTMLElement {
    return Boolean(el && el.isConnected && !el.closest('[inert]') && !el.closest('[aria-hidden="true"]'));
}
