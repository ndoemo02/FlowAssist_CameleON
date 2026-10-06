'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAiUi } from '../store';
import { FOCUS_ANGLE, slotVisibility } from '../slots';
import { subscribeAnchor } from '../scene/anchorRegistry';
import type { AnchorMode } from '../scene/measureScreen';
import type { AnchorState } from '../scene/anchorRegistry';
import ActionBar from '../components/ActionBar';
import { useScreenPinch } from './gestures';
import { setLayerInert } from './inert';
import { ItemBody, KIND_LABEL, useItemView } from './ItemContent';

// Ekran (Front 0°, deep view — plan v1.2.1 II.2, wariant hybrydowy po spike #2):
// - mode 'anchor' (desktop / landscape): panel przyklejony do rzutu ekranu sceny, aktywny w zakresie bramki,
// - mode 'centered' (portrait / narrow): wyśrodkowany panel, widoczny gdy kamera patrzy na Front.
// Pozycja przyklejonego panelu ustawiana imperatywnie (bez re-renderów przy ruchu kamery).

export default function ScreenLayer() {
    const screenId = useAiUi((s) => Object.keys(s.layout).find((id) => s.layout[id].presentation === 'screen') ?? null);
    return screenId ? <ScreenPanel key={screenId} id={screenId} /> : null;
}

function ScreenPanel({ id }: { id: string }) {
    const view = useItemView(id);
    const panel = useRef<HTMLDivElement>(null);
    const [mode, setMode] = useState<AnchorMode>('anchor');
    const frontVisible = useAiUi((s) => slotVisibility(s.camera.angle, FOCUS_ANGLE.front));
    const [menu, setMenu] = useState(false);
    const [zoom, setZoom] = useState(1);
    const zoomRef = useRef(1);
    zoomRef.current = zoom;
    const pinch = useScreenPinch(setZoom, () => zoomRef.current);

    // Ostatni stan anchora nakładany imperatywnie — także po każdym renderze Reacta,
    // żeby re-render (zoom, nowe dane) nie zgubił pozycji/widoczności panelu.
    const anchor = useRef<AnchorState | null>(null);
    const apply = () => {
        const el = panel.current, s = anchor.current;
        if (!el) return;
        if (!s || s.mode !== 'anchor') {
            el.style.transform = el.style.width = el.style.height = '';
            if (!s) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; setLayerInert(el, true); }
            return;
        }
        if (s.panel) {
            el.style.transform = `translate(${s.panel.x}px, ${s.panel.y}px)`;
            el.style.width = `${s.panel.w}px`;
            el.style.height = `${s.panel.h}px`;
        }
        el.style.opacity = s.active ? '1' : '0';
        el.style.pointerEvents = s.active ? 'auto' : 'none';
        setLayerInert(el, !s.active); // niewidoczny panel nie może przyjmować Tab/Enter
    };
    // Subskrypcja ScreenAnchor uruchamia pomiar w Canvasie tylko wtedy, gdy coś jest na ekranie.
    useEffect(() => subscribeAnchor((s) => {
        anchor.current = s;
        setMode((m) => (m === s.mode ? m : s.mode));
        apply();
    }), []);
    useLayoutEffect(apply);
    // tryb centered: aktywny tylko, gdy kamera patrzy na Front
    useLayoutEffect(() => { if (mode === 'centered') setLayerInert(panel.current, frontVisible <= 0.6); }, [mode, frontVisible]);

    const cmd = useAiUi.getState().layoutCommand;
    const title = view.status !== 'pending' || view.title ? view.title ?? id : 'Ładowanie…';
    const centered = mode === 'centered';

    return (
        <section
            ref={panel}
            aria-label={`Ekran: ${title}`}
            className={`absolute flex flex-col overflow-hidden border text-white transition-opacity duration-150 ${
                centered
                    ? 'left-1/2 top-[14%] max-h-[62%] w-[calc(100%-32px)] max-w-[560px] -translate-x-1/2 rounded-2xl border-cyan-400/40 bg-[#07040f]/95'
                    : 'left-0 top-0 rounded-lg border-cyan-400/30 bg-[#07040f]/90'
            }`}
            style={centered
                ? { opacity: frontVisible, pointerEvents: frontVisible > 0.6 ? 'auto' : 'none', visibility: frontVisible === 0 ? 'hidden' : 'visible' }
                : undefined}
        >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                    <h2 className="truncate text-[13px] font-medium">{title}</h2>
                    {view.status === 'ready' && <span className="hidden shrink-0 text-[10px] text-white/40 sm:inline">{KIND_LABEL[view.kind]}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {zoom > 1 && <ScreenButton onClick={() => setZoom(1)}>100%</ScreenButton>}
                    {view.status === 'ready' && view.actions.length > 0 && <ScreenButton onClick={() => setMenu((m) => !m)}>⋯</ScreenButton>}
                    <ScreenButton onClick={() => cmd({ type: 'toCard', id })}>Na stół</ScreenButton>
                    <ScreenButton onClick={() => cmd({ type: 'dismiss', id })}>Ukryj</ScreenButton>
                </div>
            </header>
            {menu && view.status === 'ready' && (
                <div className="shrink-0 border-b border-white/10 px-3 pb-2">
                    <ActionBar actions={view.actions} onAction={(name) => { setMenu(false); useAiUi.getState().sendAction(name, 'workspace', id, { itemId: id }); }} />
                </div>
            )}
            {/* pinch tylko na treści ekranu; touch-action pozwala przewijać, a pinch trafia do nas */}
            {/* przewijana treść osiągalna z klawiatury (A11Y-3) */}
            <div {...pinch()} tabIndex={0} role="group" aria-label={`Treść: ${title}`} className="min-h-0 flex-1 overflow-auto p-3" style={{ touchAction: 'pan-x pan-y' }}>
                <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', width: `${100 / zoom}%` }}>
                    <ItemBody view={view} />
                </div>
            </div>
        </section>
    );
}

function ScreenButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
    return (
        <button onClick={onClick} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/80 hover:bg-white/10">
            {children}
        </button>
    );
}
