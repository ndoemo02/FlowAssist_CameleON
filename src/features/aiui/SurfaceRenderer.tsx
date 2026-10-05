'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import type { SurfaceId } from './contract';
import { TREE_VIEWS } from './registry';
import { collectFallbacks, resolveTree, type ResolvedNode } from './resolveTree';
import { useAiUi } from './store';
import { FallbackCard, PendingCard } from './components/FallbackCard';
import RenderGuard from './components/RenderGuard';
import { viewProps } from './viewProps';

// Cienki render: całą logikę (bindingi, walidacja, cykle) robi czysty resolveTree.
// memo: zmiana widoczności slotu (tween kamery) nie re-renderuje treści surface'u.
export default memo(function SurfaceRenderer({ surfaceId }: { surfaceId: SurfaceId }) {
    const surface = useAiUi((s) => s.surfaces[surfaceId]);
    const sendAction = useAiUi((s) => s.sendAction);
    const reportClientError = useAiUi((s) => s.reportClientError);
    const tree = useMemo(() => (surface ? resolveTree(surface) : null), [surface]);

    // Każdy odrzucony komponent zgłaszamy agentowi raz (A2UI error VALIDATION_FAILED).
    const reported = useRef(new Set<string>());
    useEffect(() => {
        for (const f of collectFallbacks(tree)) {
            const key = `${f.id}|${f.reason}`;
            if (reported.current.has(key)) continue;
            reported.current.add(key);
            reportClientError({ code: 'VALIDATION_FAILED', surfaceId, path: f.path ?? `/components/${f.id}`, message: f.reason });
        }
    }, [tree, surfaceId, reportClientError]);

    if (!tree) return null;

    const render = (node: ResolvedNode): JSX.Element => {
        if (node.kind === 'pending') return <PendingCard key={node.id} type={node.type} />;
        if (node.kind === 'fallback') return <FallbackCard key={node.id} type={node.type} reason={node.reason} path={node.path} />;
        const View = TREE_VIEWS[node.type];
        if (!View) return <FallbackCard key={node.id} type={node.type} reason="komponent niedostępny w tym slocie" />;
        const path = `/components/${node.id}`;
        // błąd węzła na danych agenta = fallback tego węzła; nowe propsy (resetKey) ponawiają render
        return (
            <RenderGuard
                key={node.id}
                resetKey={node.props}
                fallback={(error) => <FallbackCard type={node.type} reason={`błąd renderowania: ${error.message}`} path={path} />}
                onError={(error) => reportClientError({ code: 'VALIDATION_FAILED', surfaceId, path, message: `błąd renderowania: ${error.message}` })}
            >
                <View {...viewProps(node.props)} onAction={(name: string, context?: Record<string, unknown>) => sendAction(name, surfaceId, node.id, context)}>
                    {node.children.map(render)}
                </View>
            </RenderGuard>
        );
    };

    return render(tree);
});
