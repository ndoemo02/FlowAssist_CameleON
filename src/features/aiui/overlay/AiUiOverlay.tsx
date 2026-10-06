'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import SurfaceRenderer from '../SurfaceRenderer';
import type { Surface } from '../reducer';
import { resolveTree, type ResolvedNode } from '../resolveTree';
import { FOCUS_ANGLE, slotVisibility } from '../slots';
import { useAiUi, type ScenarioStatus } from '../store';
import { startValidationReporting } from '../validationReporting';
import HudLayer from './HudLayer';
import { setLayerInert } from './inert';
import { useFocusRescue } from './focusTarget';
import { ClientRegions, NarrationRegion, useClientAnnouncements } from './LiveRegions';
import ScreenLayer from './ScreenLayer';
import { useCompact } from './useCompact';
import WorkspaceLayer from './WorkspaceLayer';
import { useZones } from './zones';

// Warstwa DOM nad sceną 3D (screen-space), plan v1.2.1: stół roboczy (Back), ekran (Front, ScreenAnchor
// lub centered), HUD (status, taski, decyzje, napisy). Agent nie zna pozycji — tylko semantykę.
// Kontener ma pointer-events: none, żeby nie blokować OrbitControls — klikalne są tylko widoczne panele.

const DEMO_PROMPT = 'Zbadaj popyt na rezerwacje online w salonach usługowych w Warszawie';

export default function AiUiOverlay() {
    const compact = useCompact();
    useDemoAutostart();
    // VALIDATION_FAILED do agenta: ze stanu, raz na wystąpienie problemu (review #5)
    useEffect(() => startValidationReporting(), []);
    useClientAnnouncements(); // P0.5: komunikaty klienta dla czytników ekranu (bez przenoszenia fokusu)
    const root = useRef<HTMLDivElement>(null);
    useFocusRescue(root); // P0.5: fokus znikającego elementu trafia na bezpieczny cel, nie na <body>

    return (
        <div ref={root} className="pointer-events-none absolute inset-0 z-20">
            <NarrationRegion />
            <ClientRegions />
            <WorkspaceLayer compact={compact} />
            <ScreenLayer />
            <AgentStatus compact={compact} />
            <TasksDrawer compact={compact} />
            <HudLayer compact={compact} />
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

const STATUS_LABEL: Record<ScenarioStatus, string | null> = {
    idle: null,
    running: 'agent pracuje…',
    awaiting_action: 'czeka na Twoją decyzję',
    done: 'zakończone',
    error: 'błąd przebiegu',
};

/** HUD: status agenta (niezależny od kąta kamery). */
function AgentStatus({ compact }: { compact: boolean }) {
    const status = useAiUi((s) => s.scenario.status);
    const zones = useZones(compact);
    const label = STATUS_LABEL[status];
    if (!label) return null;
    return (
        <div className="absolute inset-x-0 flex justify-center" style={{ top: zones.top - (compact ? 4 : 8) }}>
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[11px] text-white/60">
                <span className={`h-1.5 w-1.5 rounded-full ${status === 'running' ? 'animate-pulse bg-cyan-400' : status === 'error' ? 'bg-rose-500' : 'bg-purple-400'}`} />
                {label}
            </span>
        </div>
    );
}

/** Licznik zadań ze ZWALIDOWANEGO drzewa (resolveTree), nigdy z surowych danych agenta. */
function countTasks(surface: Surface) {
    let done = 0, all = 0;
    const visit = (node: ResolvedNode) => {
        if (node.kind !== 'component') return;
        if (node.type === 'TaskList') {
            const tasks = Object.values(node.props.tasks as Record<string, { status: string }>);
            all += tasks.length;
            done += tasks.filter((t) => t.status === 'done').length;
        }
        node.children.forEach(visit);
    };
    const tree = resolveTree(surface);
    if (tree) visit(tree);
    return { done, all };
}

function TasksDrawer({ compact }: { compact: boolean }) {
    const tasks = useAiUi((s) => s.surfaces['tasks-drawer']);
    const open = useAiUi((s) => s.stage.drawer === 'open');
    const setDrawer = useAiUi((s) => s.setDrawer);
    const reserve = useZones(compact);
    const counts = useMemo(() => (tasks ? countTasks(tasks) : null), [tasks]);
    const tabRef = useRef<HTMLButtonElement>(null);
    const sheet = useRef<HTMLElement>(null);
    // compact: zamknięta szuflada jest tylko przesunięta poza ekran — bez inert byłaby w kolejności Tab (P0.5)
    useLayoutEffect(() => { if (compact) setLayerInert(sheet.current, !open); }, [compact, open, Boolean(counts)]);
    if (!tasks || !counts) return null;

    // Escape w liście zamyka szufladę i oddaje fokus przyciskowi (P0.5)
    const closeOnEscape = (e: React.KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        setDrawer('closed');
        tabRef.current?.focus();
    };
    const { done, all } = counts;
    const tab = (
        <button
            ref={tabRef}
            aria-expanded={open}
            onClick={() => setDrawer(open ? 'closed' : 'open')}
            className="pointer-events-auto rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[11px] text-white/70 hover:text-white"
        >
            {open ? 'Ukryj taski' : `Taski ${done}/${all}`}
        </button>
    );

    if (compact) {
        return (
            <>
                <div className="absolute right-3 z-10" style={{ bottom: open ? 'calc(45% + 8px)' : 12 }}>{tab}</div>
                <aside
                    ref={sheet}
                    aria-label="Lista tasków"
                    tabIndex={0}
                    onKeyDown={closeOnEscape}
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
                        role="group"
                        aria-label="Lista tasków"
                        tabIndex={0}
                        onKeyDown={closeOnEscape}
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
    const reserve = useZones(compact);
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
                        aria-hidden="true" // czytnikom tekst ogłasza stały NarrationRegion (P0.5); tu tylko obraz
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
    const reserve = useZones(compact);
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
