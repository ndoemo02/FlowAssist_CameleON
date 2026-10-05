'use client';

import { memo, useMemo } from 'react';
import type { SurfaceId } from './contract';
import { TREE_VIEWS } from './registry';
import { resolveTree, type ResolvedNode } from './resolveTree';
import { useAiUi } from './store';
import { FallbackCard, PendingCard } from './components/FallbackCard';
import RenderGuard from './components/RenderGuard';
import { viewProps } from './viewProps';
import { reportRenderProblem } from './validationReporting';

// Cienki render: całą logikę (bindingi, walidacja, cykle) robi czysty resolveTree.
// memo: zmiana widoczności slotu (tween kamery) nie re-renderuje treści surface'u.
export default memo(function SurfaceRenderer({ surfaceId }: { surfaceId: SurfaceId }) {
    const surface = useAiUi((s) => s.surfaces[surfaceId]);
    const sendAction = useAiUi((s) => s.sendAction);
    const runId = useAiUi((s) => s.scenario.runId); // pochodzenie raportu = przebieg z chwili renderu
    const tree = useMemo(() => (surface ? resolveTree(surface) : null), [surface]);
    // Fallbacki walidacji raportuje validationReporting (ze stanu, raz na wystąpienie), nie ten widok — review #5.

    if (!tree) return null;

    const render = (node: ResolvedNode): JSX.Element => {
        if (node.kind === 'pending') return <PendingCard key={node.id} type={node.type} />;
        if (node.kind === 'fallback') return <FallbackCard key={node.id} type={node.type} reason={node.reason} path={node.path} />;
        const View = TREE_VIEWS[node.type];
        if (!View) return <FallbackCard key={node.id} type={node.type} reason="komponent niedostępny w tym slocie" />;
        const path = `/components/${node.id}`;
        // błąd węzła na danych agenta = fallback tego węzła. Klucz = treść propsów (resolveTree tworzy nowe
        // obiekty przy każdej zmianie surface'u): render ponawiany i raportowany tylko przy zmianie propsów.
        const dataKey = JSON.stringify(node.props);
        return (
            <RenderGuard
                key={node.id}
                resetKey={dataKey}
                fallback={(error) => <FallbackCard type={node.type} reason={`błąd renderowania: ${error.message}`} path={path} />}
                onError={(error) => reportRenderProblem({ surfaceId, nodeId: node.id, path, message: `błąd renderowania: ${error.message}` }, dataKey, runId)}
            >
                <View {...viewProps(node.props)} onAction={(name: string, context?: Record<string, unknown>) => sendAction(name, surfaceId, node.id, context)}>
                    {node.children.map(render)}
                </View>
            </RenderGuard>
        );
    };

    return render(tree);
});
