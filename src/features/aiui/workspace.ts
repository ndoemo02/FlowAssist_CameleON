// Czysty resolver stołu roboczego: surface 'workspace' (Workspace + WorkspaceItem) → widoki elementów.
// Aktywność = członkostwo w Workspace.children (P6); reprezentacja = pierwsza obsługiwana (P10).

import { isBinding, type ItemKind, type Presentation } from './contract';
import { isSupportedRepresentation, validateContent, validateProps, type SupportedRepresentation } from './catalog';
import { getAt } from './jsonPointer';
import type { ItemMeta } from './layout';
import type { Surface } from './reducer';

export interface ItemAction { name: string; label: string; variant?: 'primary' | 'secondary' }

export type WorkspaceItemView =
    | {
        status: 'ready'; id: string; kind: ItemKind; title: string; representation: SupportedRepresentation;
        content: Record<string, unknown>; actions: ItemAction[]; priority: number; hint: Presentation | null;
    }
    | { status: 'pending'; id: string; title?: string }                    // komponent lub dane jeszcze nie dotarły
    | { status: 'fallback'; id: string; title?: string; reason: string; path: string };

/** Lista aktywnych id (kolejność z Workspace.children) albo null, gdy brak roota Workspace. */
export function workspaceChildren(surface: Surface | undefined): string[] | null {
    const root = surface?.components.root;
    if (!root || root.component !== 'Workspace') return null;
    return Array.isArray(root.children) ? root.children.filter((c): c is string => typeof c === 'string') : [];
}

/** Metadane do uzgodnienia układu (bez rozwiązywania treści). */
export function workspaceMeta(surface: Surface | undefined): ItemMeta[] | null {
    const ids = workspaceChildren(surface);
    if (!ids || !surface) return null;
    return ids.map((id) => {
        const c = surface.components[id];
        const delivered = Boolean(c && c.component === 'WorkspaceItem');
        const hint = delivered && typeof c.presentation === 'string' ? (c.presentation as Presentation) : null;
        return { id, delivered, hint: hint === 'card' || hint === 'focus' || hint === 'screen' ? hint : null, priority: delivered && typeof c.priority === 'number' ? c.priority : 0 };
    });
}

/** Rozwiązuje jeden element (dane z bindingu, walidacja, wybór reprezentacji). */
export function resolveItem(surface: Surface, id: string): WorkspaceItemView {
    const def = surface.components[id];
    if (!def) return { status: 'pending', id };
    const title = typeof def.title === 'string' ? def.title : undefined;
    if (def.component !== 'WorkspaceItem') {
        return { status: 'fallback', id, title, reason: `oczekiwano WorkspaceItem, jest ${def.component}`, path: `/components/${id}/component` };
    }

    // pending = któryś binding bez danych (jak w resolveTree); brak propsa dosłownego to błąd walidacji (ADR 0007, ST-1)
    const props: Record<string, unknown> = {};
    let pending = false;
    for (const [k, v] of Object.entries(def)) {
        if (k === 'id' || k === 'component' || k === 'children') continue;
        if (isBinding(v)) {
            // decyzja z wartości lokalnej, nie z odczytu props[k] (klucz `__proto__` od agenta) — jak w resolveTree
            const value = getAt(surface.data, v.path);
            if (value === undefined) pending = true;
            props[k] = value;
        } else {
            props[k] = v;
        }
    }
    if (pending) return { status: 'pending', id, title }; // dane jeszcze w drodze

    const problem = validateProps('WorkspaceItem', props);
    if (problem) return { status: 'fallback', id, title, reason: problem.message, path: `/components/${id}${problem.path}` };

    const representation = (props.representations as unknown[]).find(isSupportedRepresentation);
    if (!representation) {
        return { status: 'fallback', id, title, reason: 'brak reprezentacji obsługiwanej przez klienta', path: `/components/${id}/representations` };
    }
    const content = props.content as Record<string, unknown>;
    const bad = validateContent(representation, content);
    if (bad) return { status: 'fallback', id, title, reason: bad.message, path: `/components/${id}/content${bad.path}` };

    return {
        status: 'ready', id, kind: props.kind as ItemKind, title: props.title as string, representation, content,
        actions: (props.actions as ItemAction[] | undefined) ?? [], priority: (props.priority as number | undefined) ?? 0,
        hint: (props.presentation as Presentation | undefined) ?? null,
    };
}
