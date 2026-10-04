'use client';

import { useEffect, useRef, useState } from 'react';
import { subscribeAnchor, getAnchorState } from './anchorRegistry';

// SPIKE (krok 1 v1.2.1): panel testowy przyklejony do rzutu ekranu (tryb anchor) albo wyśrodkowany
// (tryb centered — fallback dla portrait/wąskich). Włączany tylko ?anchor=probe. Aktualizacje imperatywne.

export default function ScreenAnchorProbe() {
    const [enabled, setEnabled] = useState(false);
    useEffect(() => setEnabled(new URLSearchParams(window.location.search).get('anchor') === 'probe'), []);
    return enabled ? <Probe /> : null;
}

const CENTERED_CLASS = 'left-1/2 top-[18%] w-[calc(100%-32px)] max-w-[520px] -translate-x-1/2';

function Probe() {
    const panel = useRef<HTMLDivElement>(null);
    const outline = useRef<HTMLDivElement>(null);
    const centered = useRef<HTMLDivElement>(null);
    const readout = useRef<HTMLPreElement>(null);
    const [clicks, setClicks] = useState(0);

    useEffect(() => {
        let publishes = 0, toggles = 0, lastActive: boolean | null = null, lastText = 0;
        const unsub = subscribeAnchor((s) => {
            publishes++;
            if (lastActive !== null && lastActive !== s.active) toggles++;
            lastActive = s.active;

            const p = panel.current, o = outline.current, c = centered.current;
            if (p) {
                if (s.panel) {
                    p.style.transform = `translate(${s.panel.x}px, ${s.panel.y}px)`;
                    p.style.width = `${s.panel.w}px`;
                    p.style.height = `${s.panel.h}px`;
                }
                p.style.opacity = s.active ? '1' : '0';
                p.style.pointerEvents = s.active ? 'auto' : 'none';
            }
            if (o) {
                o.style.display = s.outer && s.mode === 'anchor' ? 'block' : 'none';
                if (s.outer) {
                    o.style.transform = `translate(${s.outer.x}px, ${s.outer.y}px)`;
                    o.style.width = `${s.outer.w}px`;
                    o.style.height = `${s.outer.h}px`;
                }
            }
            if (c) c.style.display = s.mode === 'centered' ? 'flex' : 'none';

            const now = performance.now();
            if (readout.current && now - lastText > 100) {
                lastText = now;
                readout.current.textContent =
                    `mode: ${s.mode}  active: ${s.active} (${s.reason})\n` +
                    `angle: ${s.angleDeg.toFixed(1)}°  coverage: ${(s.coverage * 100).toFixed(1)}%  outer vis: ${(s.visibleFraction * 100).toFixed(1)}%\n` +
                    `panel: ${s.panel ? `${s.panel.w.toFixed(0)}×${s.panel.h.toFixed(0)} @ ${s.panel.x.toFixed(0)},${s.panel.y.toFixed(0)}` : '—'}\n` +
                    `points: ${s.pointCount}  compute: ${s.computeMs.toFixed(3)} ms  publishes: ${publishes}  toggles: ${toggles}`;
            }
        });
        (window as unknown as { __screenAnchor: unknown }).__screenAnchor = {
            get: getAnchorState, publishes: () => publishes, toggles: () => toggles,
        };
        return unsub;
    }, []);

    const content = (
        <>
            <div>
                <p className="text-[11px] uppercase tracking-widest text-cyan-300">ScreenAnchor · spike</p>
                <p className="text-2xl font-medium">Zapytania Q1–Q4</p>
                <p className="text-sm text-white/70">Tekst 14 px: czytelność na ekranie sceny</p>
                <p className="text-xs text-white/50">Tekst 12 px: drobne etykiety i źródła</p>
            </div>
            <div className="flex items-end justify-between">
                <button onClick={() => setClicks((n) => n + 1)} className="rounded-full bg-cyan-500 px-4 py-2 text-xs font-medium text-black">
                    Klik test ({clicks})
                </button>
                <span className="text-[10px] text-white/40">↘ róg</span>
            </div>
        </>
    );
    const grid = { backgroundImage: 'linear-gradient(rgba(34,211,238,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.15) 1px, transparent 1px)', backgroundSize: '10% 10%' };

    return (
        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
            <div ref={outline} className="absolute left-0 top-0 border border-dashed border-amber-400/70" style={{ display: 'none' }} />
            <div ref={panel} className="absolute left-0 top-0 flex flex-col justify-between overflow-hidden rounded-lg border-2 border-cyan-400 bg-[#07040f]/80 p-3 text-white transition-opacity duration-150" style={{ opacity: 0, ...grid }}>
                {content}
            </div>
            <div ref={centered} className={`pointer-events-auto absolute ${CENTERED_CLASS} h-56 flex-col justify-between rounded-2xl border-2 border-purple-400 bg-[#07040f]/90 p-4 text-white`} style={{ display: 'none', ...grid }}>
                {content}
            </div>
            <pre ref={readout} className="absolute left-3 top-16 rounded bg-black/80 p-2 font-mono text-[11px] leading-4 text-amber-200" />
        </div>
    );
}
