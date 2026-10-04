// Czysty resolver: płaska lista komponentów A2UI (adjacency list) + data model → drzewo węzłów.
// Nie zna Reacta — SurfaceRenderer tylko mapuje wynik na komponenty z registry.

import { isBinding, isCatalogName, type CatalogName } from './contract';
import { validateProps } from './catalog';
import { getAt } from './jsonPointer';
import type { Surface } from './reducer';

export const MAX_DEPTH = 8;

export type ResolvedNode =
    | { kind: 'component'; id: string; type: CatalogName; props: Record<string, unknown>; children: ResolvedNode[] }
    | { kind: 'pending'; id: string; type: CatalogName }
    | { kind: 'fallback'; id: string; type: string; reason: string; path?: string };

const STRUCTURAL = new Set(['id', 'component', 'children']);

export function resolveTree(surface: Surface, rootId = 'root'): ResolvedNode | null {
    if (!surface.components[rootId]) return null;
    return resolveNode(surface, rootId, new Set(), 0);
}

function resolveNode(surface: Surface, id: string, ancestors: Set<string>, depth: number): ResolvedNode {
    const def = surface.components[id];
    const type = def.component;

    if (ancestors.has(id)) return { kind: 'fallback', id, type, reason: `cykl w drzewie komponentów (${id})` };
    if (depth >= MAX_DEPTH) return { kind: 'fallback', id, type, reason: `przekroczona głębokość drzewa (${MAX_DEPTH})` };
    if (!isCatalogName(type)) return { kind: 'fallback', id, type, reason: `komponent spoza katalogu flowassist/v1` };

    const props: Record<string, unknown> = {};
    let pending = false;
    for (const [key, raw] of Object.entries(def)) {
        if (STRUCTURAL.has(key)) continue;
        if (isBinding(raw)) {
            const value = getAt(surface.data, raw.path);
            if (value === undefined) pending = true;
            props[key] = value;
        } else {
            props[key] = raw;
        }
    }
    // Dane z bindingu jeszcze nie dotarły (streaming) — to nie błąd, tylko szkielet.
    if (pending) return { kind: 'pending', id, type };

    const problem = validateProps(type, props);
    if (problem) {
        return { kind: 'fallback', id, type, reason: problem.message, path: `/components/${id}${problem.path}` };
    }

    const nextAncestors = new Set(ancestors).add(id);
    const children = (def.children ?? [])
        .filter((childId) => surface.components[childId]) // dzieci mogą dojść później
        .map((childId) => resolveNode(surface, childId, nextAncestors, depth + 1));

    return { kind: 'component', id, type, props, children };
}

/** Zbiera błędy walidacji z drzewa (do raportu VALIDATION_FAILED do agenta). */
export function collectFallbacks(node: ResolvedNode | null, out: Extract<ResolvedNode, { kind: 'fallback' }>[] = []) {
    if (!node) return out;
    if (node.kind === 'fallback') out.push(node);
    if (node.kind === 'component') node.children.forEach((c) => collectFallbacks(c, out));
    return out;
}
