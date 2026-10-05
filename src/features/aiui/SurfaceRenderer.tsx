'use client';

import { memo, useMemo, type ReactNode } from 'react';
import type { SurfaceId } from './contract';
import { SLOT_UNAVAILABLE_REASON, TREE_VIEWS } from './registry';
import { resolveTree, type ResolvedNode } from './resolveTree';
import { useAiUi } from './store';
import { FallbackCard, PendingCard } from './components/FallbackCard';
import RenderGuard from './components/RenderGuard';
import { propsSignature, viewProps } from './viewProps';
import type { ActionHandler } from './components/types';
import { reportRenderProblem, resolveRenderProblem } from './validationReporting';

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
        if (!View) return <FallbackCard key={node.id} type={node.type} reason={SLOT_UNAVAILABLE_REASON} />;
        const path = `/components/${node.id}`;
        // błąd węzła na danych agenta = fallback tego węzła. Podpis propsów (płytki, bez serializacji):
        // render ponawiany tylko przy zmianie propsów, nie przy niezwiązanej zmianie surface'u.
        const signature = propsSignature(node.props);
        return (
            <RenderGuard
                key={node.id}
                resetKeys={signature}
                fallback={(error) => <FallbackCard type={node.type} reason={`błąd renderowania: ${error.message}`} path={path} />}
                onError={(error) => reportRenderProblem({ surfaceId, nodeId: node.id, path, message: `błąd renderowania: ${error.message}` }, 'slot', runId)}
                onRecover={() => resolveRenderProblem(surfaceId, node.id, 'slot', runId)}
            >
                <TreeNodeView View={View} props={node.props} onAction={(name, context) => sendAction(name, surfaceId, node.id, context)}>
                    {node.children.map(render)}
                </TreeNodeView>
            </RenderGuard>
        );
    };

    return render(tree);
});

type TreeView = NonNullable<(typeof TREE_VIEWS)[keyof typeof TREE_VIEWS]>;

/** Przygotowanie widoku węzła (propsy agenta → JSX) wewnątrz lokalnego boundary, nie przed nim. */
function TreeNodeView({ View, props, onAction, children }: { View: TreeView; props: Record<string, unknown>; onAction: ActionHandler; children: ReactNode }) {
    return <View {...viewProps(props)} onAction={onAction}>{children}</View>;
}
