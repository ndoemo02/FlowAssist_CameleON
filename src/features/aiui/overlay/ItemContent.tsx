'use client';

import { memo, useMemo } from 'react';
import { REPRESENTATION_VIEWS } from '../registry';
import { useAiUi } from '../store';
import { resolveItem, type WorkspaceItemView } from '../workspace';
import { FallbackCard, PendingCard } from '../components/FallbackCard';
import RenderGuard from '../components/RenderGuard';
import type { Density } from '../components/types';
import { viewProps } from '../viewProps';
import { reportRenderProblem, resolveRenderProblem } from '../validationReporting';

/**
 * Widok jednego elementu stołu: subskrybuje surface 'workspace', ale wynik jest memoizowany,
 * a treść (`content`) zachowuje referencję, gdy jej dane się nie zmieniły.
 * Fallbacki walidacji raportuje validationReporting (ze stanu), nie widok — review #5.
 */
export function useItemView(id: string): WorkspaceItemView {
    const surface = useAiUi((s) => s.surfaces.workspace);
    return useMemo(() => (surface ? resolveItem(surface, id) : ({ status: 'pending', id } as const)), [surface, id]);
}

/** Treść elementu w wybranej reprezentacji. memo: ta sama `content` → bez re-renderu widoku. */
export const ItemBody = memo(function ItemBody({ view, density = 'screen' }: { view: WorkspaceItemView; density?: Density }) {
    const runId = useAiUi((s) => s.scenario.runId); // pochodzenie raportu = przebieg z chwili renderu
    if (view.status === 'pending') return <PendingCard type={view.title ?? 'element'} />;
    if (view.status === 'fallback') return <FallbackCard type={view.title ?? view.id} reason={view.reason} path={view.path} />;
    const path = `/components/${view.id}/content`;
    // błąd widoku na danych agenta = fallback tej karty; nowa treść (resetKey) ponawia render
    return (
        <RenderGuard
            resetKeys={[view.content]}
            fallback={(error) => <FallbackCard type={view.title} reason={`błąd renderowania: ${error.message}`} path={path} />}
            onError={(error) => reportRenderProblem({ surfaceId: 'workspace', nodeId: view.id, path, message: `błąd renderowania: ${error.message}` }, runId)}
            onRecover={() => resolveRenderProblem('workspace', view.id)}
        >
            <RepresentationView representation={view.representation} content={view.content} density={density} />
        </RenderGuard>
    );
}, (a, b) => a.density === b.density && (a.view === b.view || (a.view.status === 'ready' && b.view.status === 'ready'
    && a.view.content === b.view.content && a.view.representation === b.view.representation)));

const RepresentationView = memo(function RepresentationView({ representation, content, density }: {
    representation: keyof typeof REPRESENTATION_VIEWS; content: Record<string, unknown>; density: Density;
}) {
    const View = REPRESENTATION_VIEWS[representation];
    return <View {...viewProps(content)} density={density} onAction={() => {}} />;
});

export const KIND_LABEL: Record<string, string> = { chart: 'wykres', kpi: 'KPI', table: 'tabela', map: 'mapa', slides: 'slajdy' };
