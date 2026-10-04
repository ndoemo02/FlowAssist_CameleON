'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import SurfaceRenderer from '../SurfaceRenderer';
import { FOCUS_ANGLE, slotVisibility } from '../slots';
import { useAiUi, type ScenarioStatus } from '../store';
import { useCompact } from './useCompact';

// Warstwa DOM nad sceną 3D (screen-space). Sloty wygaszają się wg kąta kamery; agent nie zna pozycji.
// Kontener ma pointer-events: none, żeby nie blokować OrbitControls — klikalne są tylko widoczne panele.

const DEMO_PROMPT = 'Zbadaj popyt na rezerwacje online w salonach usługowych w Warszawie';

export default function AiUiOverlay() {
    const compact = useCompact();
    useDemoAutostart();

    return (
        <div className="pointer-events-none absolute inset-0 z-20">
            <BackCanvas compact={compact} />
            <TasksDrawer compact={compact} />
            <NarrationCaption compact={compact} />
            <PromptPill compact={compact} />
        </div>
    );
}

/** ?demo=<scenariusz> — autostart po bramce gotowości (koniec intro). */
function useDemoAutostart() {
    const ready = useAiUi((s) => s.scene.ready);
    const started = useRef(false);
    useEffect(() => {
        if (!ready || started.current) return;
        const scenario = new URLSearchParams(window.location.search).get('demo');
        if (!scenario) return;
        started.current = true;
        useAiUi.getState().startScenario(scenario, DEMO_PROMPT);
    }, [ready]);
}

// ── strefy pionowe (px) ────────────────────────────────────────────
function useBottomReserve(compact: boolean) {
    const orbit = useAiUi((s) => s.ui.orbitPanel);
    if (compact) return { caption: 12, panel: orbit ? 176 : 84 };
    return { caption: orbit ? 180 : 64, panel: orbit ? 270 : 156 };
}

const STATUS_LABEL: Record<ScenarioStatus, string | null> = {
    idle: null,
    running: 'agent pracuje…',
    awaiting_action: 'czeka na Twoją decyzję',
    done: 'zakończone',
    error: 'błąd przebiegu',
};

function BackCanvas({ compact }: { compact: boolean }) {
    const hasSurface = useAiUi((s) => Boolean(s.surfaces['back-canvas']));
    const visibility = useAiUi((s) => slotVisibility(s.camera.angle, FOCUS_ANGLE.back));
    const status = useAiUi((s) => s.scenario.status);
    const reserve = useBottomReserve(compact);
    if (!hasSurface) return null;

    return (
        <section
            aria-label="Canvas agenta"
            className={`absolute left-1/2 flex w-[min(960px,calc(100%-32px))] flex-col rounded-2xl border border-white/10 transition-[opacity,transform] duration-200 ${
                compact ? 'bg-[#07040f]/95' : 'bg-[#07040f]/80 backdrop-blur-md'
            }`}
            style={{
                top: compact ? 60 : 84,
                maxHeight: `calc(100% - ${compact ? 60 : 84}px - ${reserve.panel}px)`,
                opacity: visibility,
                transform: `translateX(-50%) scale(${0.96 + 0.04 * visibility})`,
                visibility: visibility === 0 ? 'hidden' : 'visible',
                pointerEvents: visibility > 0.6 ? 'auto' : 'none',
            }}
        >
            <header className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                <span className="text-[11px] uppercase tracking-widest text-white/40">Canvas agenta</span>
                {STATUS_LABEL[status] && (
                    <span className="flex items-center gap-1.5 text-[11px] text-white/50">
                        <span className={`h-1.5 w-1.5 rounded-full ${status === 'running' ? 'animate-pulse bg-cyan-400' : status === 'error' ? 'bg-rose-500' : 'bg-purple-400'}`} />
                        {STATUS_LABEL[status]}
                    </span>
                )}
            </header>
            <div className={`min-h-0 flex-1 overflow-y-auto ${compact ? 'p-3' : 'p-4'}`}>
                <SurfaceRenderer surfaceId="back-canvas" />
            </div>
        </section>
    );
}

function TasksDrawer({ compact }: { compact: boolean }) {
    const tasks = useAiUi((s) => s.surfaces['tasks-drawer']);
    const open = useAiUi((s) => s.stage.drawer === 'open');
    const setDrawer = useAiUi((s) => s.setDrawer);
    const reserve = useBottomReserve(compact);
    if (!tasks) return null;

    const all = Object.values((tasks.data.tasks ?? {}) as Record<string, { status: string }>);
    const done = all.filter((t) => t.status === 'done').length;
    const tab = (
        <button
            onClick={() => setDrawer(open ? 'closed' : 'open')}
            className="pointer-events-auto rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[11px] text-white/70 hover:text-white"
        >
            {open ? 'Ukryj taski' : `Taski ${done}/${all.length}`}
        </button>
    );

    if (compact) {
        return (
            <>
                <div className="absolute right-3 z-10" style={{ bottom: open ? 'calc(45% + 8px)' : 12 }}>{tab}</div>
                <aside
                    className="pointer-events-auto absolute inset-x-0 bottom-0 max-h-[45%] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#07040f]/95 p-3 transition-transform duration-300"
                    style={{ transform: open ? 'translateY(0)' : 'translateY(105%)' }}
                >
                    <SurfaceRenderer surfaceId="tasks-drawer" />
                </aside>
            </>
        );
    }

    return (
        <aside
            className="absolute right-4 top-[84px] flex w-[340px] flex-col items-end gap-2"
            style={{ maxHeight: `calc(100% - 84px - ${reserve.caption + 90}px)` }}
        >
            {tab}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ x: 48, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 48, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="pointer-events-auto min-h-0 w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#07040f]/80 p-4 backdrop-blur-md"
                    >
                        <SurfaceRenderer surfaceId="tasks-drawer" />
                    </motion.div>
                )}
            </AnimatePresence>
        </aside>
    );
}

function NarrationCaption({ compact }: { compact: boolean }) {
    const text = useAiUi((s) => s.narration.text);
    const drawerOpen = useAiUi((s) => s.stage.drawer === 'open');
    const hasTasks = useAiUi((s) => Boolean(s.surfaces['tasks-drawer']));
    const reserve = useBottomReserve(compact);
    const hidden = compact && drawerOpen; // na compact bottom-sheet i napisy nigdy naraz

    return (
        <div
            className={`absolute inset-x-0 flex justify-center pl-4 ${compact && hasTasks ? 'pr-28' : 'pr-4'}`}
            style={{ bottom: reserve.caption }}
        >
            <AnimatePresence mode="wait">
                {text && !hidden && (
                    <motion.p
                        key={text}
                        role="status"
                        aria-live="polite"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.25 }}
                        className={`max-w-[760px] rounded-2xl border border-white/10 bg-black/75 px-4 py-2.5 text-center text-white/90 shadow-2xl ${compact ? 'text-[13px]' : 'text-[15px]'}`}
                    >
                        <span className="mr-2 inline-flex items-center gap-1.5 align-middle text-[10px] uppercase tracking-widest text-cyan-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />Amber
                        </span>
                        {text}
                    </motion.p>
                )}
            </AnimatePresence>
        </div>
    );
}

function PromptPill({ compact }: { compact: boolean }) {
    const ready = useAiUi((s) => s.scene.ready);
    const status = useAiUi((s) => s.scenario.status);
    const onFront = useAiUi((s) => slotVisibility(s.camera.angle, FOCUS_ANGLE.front) > 0.6);
    const hasCaption = useAiUi((s) => Boolean(s.narration.text));
    const reserve = useBottomReserve(compact);
    const startScenario = useAiUi((s) => s.startScenario);

    const idle = status === 'idle' || status === 'done' || status === 'error';
    if (!ready || !idle || !onFront) return null;

    return (
        <div className="absolute inset-x-0 flex justify-center px-4" style={{ bottom: reserve.caption + (hasCaption ? (compact ? 64 : 72) : 0) }}>
            <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => startScenario('research', DEMO_PROMPT)}
                className="pointer-events-auto group flex max-w-full items-center gap-3 rounded-full border border-white/15 bg-black/70 py-2 pl-4 pr-2 text-left text-sm text-white/80 shadow-2xl hover:border-purple-400/50"
            >
                <span className="text-purple-300">✦</span>
                <span className="truncate">{status === 'idle' ? 'Zleć research: popyt na rezerwacje online' : 'Uruchom research ponownie'}</span>
                <span className="rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 px-3 py-1 text-xs font-medium text-white">Start</span>
            </motion.button>
        </div>
    );
}
