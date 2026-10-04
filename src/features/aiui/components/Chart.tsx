'use client';

import { motion } from 'framer-motion';
import type { ViewProps } from './types';

type Series = { label: string; points: { x: string | number; y: number }[] };

const COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#94a3b8'];
// Układ współrzędnych zależny od gęstości: na karcie mniejszy viewBox → czytelne etykiety po skalowaniu.
const GEOM = {
    screen: { W: 600, H: 240, PAD: { l: 44, r: 16, t: 16, b: 28 }, font: 11 },
    card: { W: 320, H: 170, PAD: { l: 38, r: 10, t: 10, b: 22 }, font: 12 },
};

/** "Ładny" krok osi (1, 2, 2.5, 5 × 10^n), żeby etykiety nie były w stylu 2486. */
function niceStep(raw: number) {
    const exp = Math.floor(Math.log10(raw));
    const f = raw / 10 ** exp;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * 10 ** exp;
}

export default function Chart({ kind, title, series, density = 'screen' }: ViewProps<{ kind: 'line' | 'bar'; title?: string; series: Series[] }>) {
    const { W, H, PAD, font } = GEOM[density];
    const xs = series[0].points.map((p) => String(p.x));
    const rawMax = Math.max(...series.flatMap((s) => s.points.map((p) => p.y)), 1);
    const step = niceStep(rawMax / 4);
    const maxY = Math.ceil((rawMax * 1.05) / step) * step;
    const innerW = W - PAD.l - PAD.r, innerH = H - PAD.t - PAD.b;
    const xAt = (i: number) => PAD.l + (xs.length === 1 ? innerW / 2 : (i / (xs.length - 1)) * innerW);
    const yAt = (v: number) => PAD.t + innerH - (v / maxY) * innerH;
    const ticks = Array.from({ length: Math.round(maxY / step) + 1 }, (_, i) => i * step);
    const slot = innerW / xs.length, barW = (slot * 0.7) / series.length;

    return (
        <figure className={`rounded-xl border border-white/10 bg-white/[0.03] ${density === 'card' ? 'p-2' : 'p-4'}`}>
            {title && <figcaption className="mb-2 text-sm text-white/80">{title}</figcaption>}
            <svg viewBox={`0 0 ${W} ${H}`} className={`h-auto w-full ${density === 'screen' ? 'max-h-[32vh]' : ''}`} role="img" aria-label={title}>
                {ticks.map((v) => (
                    <g key={v}>
                        <line x1={PAD.l} x2={W - PAD.r} y1={yAt(v)} y2={yAt(v)} stroke="rgba(255,255,255,0.08)" />
                        <text x={PAD.l - 8} y={yAt(v) + 4} textAnchor="end" fontSize={font} fill="rgba(255,255,255,0.4)">{v.toLocaleString('pl-PL')}</text>
                    </g>
                ))}
                {xs.map((x, i) => (
                    <text key={x} x={kind === 'bar' ? PAD.l + slot * (i + 0.5) : xAt(i)} y={H - 8} textAnchor="middle" fontSize={font} fill="rgba(255,255,255,0.5)">{x}</text>
                ))}
                {series.map((s, si) => {
                    const color = COLORS[si % COLORS.length];
                    if (kind === 'bar') {
                        return s.points.map((p, i) => (
                            <motion.rect
                                key={`${s.label}-${i}`}
                                x={PAD.l + slot * i + slot * 0.15 + barW * si}
                                width={barW - 2}
                                rx={3}
                                fill={color}
                                initial={{ y: yAt(0), height: 0 }}
                                animate={{ y: yAt(p.y), height: yAt(0) - yAt(p.y) }}
                                transition={{ duration: 0.6, delay: i * 0.05 }}
                            />
                        ));
                    }
                    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${xAt(i)},${yAt(p.y)}`).join(' ');
                    return (
                        <g key={s.label}>
                            <motion.path d={d} fill="none" stroke={color} strokeWidth={si === 0 ? 3 : 2} strokeOpacity={si === 0 ? 1 : 0.6}
                                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: 'easeInOut' }} />
                            {s.points.map((p, i) => <circle key={i} cx={xAt(i)} cy={yAt(p.y)} r={si === 0 ? 4 : 3} fill={color} />)}
                        </g>
                    );
                })}
            </svg>
            <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-white/60">
                {series.map((s, si) => (
                    <span key={s.label} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: COLORS[si % COLORS.length] }} />{s.label}
                    </span>
                ))}
            </div>
        </figure>
    );
}
