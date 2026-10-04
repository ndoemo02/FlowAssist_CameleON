'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import { REPRESENTATION_VIEWS } from '../registry';
import { useAiUi } from '../store';
import { resolveItem, type WorkspaceItemView } from '../workspace';
import { FallbackCard, PendingCard } from '../components/FallbackCard';
import type { Density } from '../components/types';

/**
 * Widok jednego elementu stołu: subskrybuje surface 'workspace', ale wynik jest memoizowany,
 * a treść (`content`) zachowuje referencję, gdy jej dane się nie zmieniły.
 */
export function useItemView(id: string): WorkspaceItemView {
    const surface = useAiUi((s) => s.surfaces.workspace);
    const view = useMemo(() => (surface ? resolveItem(surface, id) : ({ status: 'pending', id } as const)), [surface, id]);

    // Fallback zgłaszamy agentowi raz (A2UI error VALIDATION_FAILED).
    const reported = useRef<string | null>(null);
    useEffect(() => {
        if (view.status !== 'fallback') return;
        const key = `${view.reason}|${view.path}`;
        if (reported.current === key) return;
        reported.current = key;
        useAiUi.getState().reportClientError({ code: 'VALIDATION_FAILED', surfaceId: 'workspace', path: view.path, message: view.reason });
    }, [view]);
    return view;
}

/** Treść elementu w wybranej reprezentacji. memo: ta sama `content` → bez re-renderu widoku. */
export const ItemBody = memo(function ItemBody({ view, density = 'screen' }: { view: WorkspaceItemView; density?: Density }) {
    if (view.status === 'pending') return <PendingCard type={view.title ?? 'element'} />;
    if (view.status === 'fallback') return <FallbackCard type={view.title ?? view.id} reason={view.reason} path={view.path} />;
    return <RepresentationView representation={view.representation} content={view.content} density={density} />;
}, (a, b) => a.density === b.density && (a.view === b.view || (a.view.status === 'ready' && b.view.status === 'ready'
    && a.view.content === b.view.content && a.view.representation === b.view.representation)));

const RepresentationView = memo(function RepresentationView({ representation, content, density }: {
    representation: keyof typeof REPRESENTATION_VIEWS; content: Record<string, unknown>; density: Density;
}) {
    const View = REPRESENTATION_VIEWS[representation];
    return <View {...content} density={density} onAction={() => {}} />;
});

export const KIND_LABEL: Record<string, string> = { chart: 'wykres', kpi: 'KPI', table: 'tabela', map: 'mapa', slides: 'slajdy' };
