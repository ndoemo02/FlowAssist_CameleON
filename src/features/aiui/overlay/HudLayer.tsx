'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import SurfaceRenderer from '../SurfaceRenderer';
import { useAiUi } from '../store';
import { useZones } from './zones';

// HUD (plan v1.2.1 II.2): decyzje agenta (Approval) — widoczne niezależnie od kąta kamery.
// Domyślnie zwinięty pasek nad napisami (nie zasłania ekranu na Froncie); pełna karta na żądanie.
// Fokus (P0.5): jeden stały landmark „Decyzja” (bez remountu przy rozwinięciu); otwarcie przez użytkownika przenosi
// fokus na „Zwiń” (pierwszy przycisk panelu — nie „Zatwierdź”, żeby powtórzony Enter nie zatwierdził decyzji);
// Escape i „Zwiń” wracają na pasek. Pojawienie się decyzji od agenta nie rusza fokusu.
export default function HudLayer({ compact }: { compact: boolean }) {
    const root = useAiUi((s) => s.surfaces.hud?.components.root);
    const drawerOpen = useAiUi((s) => s.stage.drawer === 'open');
    const zones = useZones(compact);
    const [expanded, setExpanded] = useState(false);
    const bar = useRef<HTMLButtonElement>(null);
    const collapseButton = useRef<HTMLButtonElement>(null);
    const focusAfter = useRef<'bar' | 'collapse' | null>(null); // fokus tylko po działaniu użytkownika
    useEffect(() => { if (!root) setExpanded(false); }, [root]);
    useEffect(() => {
        const target = focusAfter.current;
        focusAfter.current = null;
        if (target) (target === 'bar' ? bar : collapseButton).current?.focus();
    }, [expanded]);

    const hidden = compact && drawerOpen; // compact: bottom-sheet tasków i HUD nigdy naraz
    const title = typeof root?.title === 'string' ? root.title : 'Decyzja';
    const open = () => { focusAfter.current = 'collapse'; setExpanded(true); };
    const collapse = () => { focusAfter.current = 'bar'; setExpanded(false); };

    return (
        <AnimatePresence>
            {root && !hidden && (
                <motion.aside
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    aria-label="Decyzja"
                    onKeyDown={(e) => { if (e.key === 'Escape' && expanded) { e.stopPropagation(); collapse(); } }}
                    className="pointer-events-auto absolute inset-x-0 z-30 flex justify-center px-3"
                    style={{ bottom: zones.caption + (compact ? 56 : 72) }}
                >
                    {expanded ? (
                        <div className="w-full max-w-[420px]">
                            <div className="mb-1.5 flex justify-end">
                                <button ref={collapseButton} aria-expanded="true" onClick={collapse} className="rounded-full border border-white/10 bg-black/70 px-3 py-1 text-[11px] text-white/70 hover:text-white">
                                    Zwiń
                                </button>
                            </div>
                            <SurfaceRenderer surfaceId="hud" />
                        </div>
                    ) : (
                        <button
                            ref={bar}
                            aria-expanded="false"
                            onClick={open}
                            className="flex max-w-full items-center gap-3 rounded-full border border-purple-400/40 bg-black/75 py-1.5 pl-4 pr-1.5 text-left text-[13px] text-white/85 shadow-2xl hover:border-purple-300/70"
                        >
                            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-purple-400" />
                            <span className="truncate"><span className="text-purple-300">Decyzja:</span> {title}</span>
                            <span className="shrink-0 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 px-3 py-1 text-[11px] font-medium text-white">Szczegóły</span>
                        </button>
                    )}
                </motion.aside>
            )}
        </AnimatePresence>
    );
}
