'use client';

import type { ViewProps } from './types';

type Point = { label: string; x: number; y: number };

// Celowo statyczne SVG: bez drugiego kontekstu WebGL (maplibre już działa niżej na stronie).
export default function MapView({ title, points }: ViewProps<{ title?: string; points: Point[] }>) {
    const W = 600, H = 300;
    return (
        <figure className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            {title && <figcaption className="mb-2 text-sm text-white/80">{title}</figcaption>}
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
                <rect x="1" y="1" width={W - 2} height={H - 2} rx="14" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)" />
                <path d={`M ${W * 0.62} 0 C ${W * 0.55} ${H * 0.3}, ${W * 0.62} ${H * 0.55}, ${W * 0.58} ${H}`} fill="none" stroke="rgba(34,211,238,0.25)" strokeWidth="10" strokeLinecap="round" />
                {points.map((p) => (
                    <g key={p.label} transform={`translate(${p.x * W}, ${p.y * H})`}>
                        <circle r="14" fill="rgba(167,139,250,0.15)" />
                        <circle r="5" fill="#a78bfa" />
                        <text y="-12" textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.75)">{p.label}</text>
                    </g>
                ))}
            </svg>
        </figure>
    );
}
