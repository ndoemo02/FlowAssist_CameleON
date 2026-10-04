// Anchory i sloty: jedyne miejsce, które tłumaczy semantykę agenta na scenę.
// Agent mówi "focus: back" i "surfaceId: back-canvas" — nigdy nie podaje współrzędnych.

import type { Focus, SurfaceId } from './contract';

/** Kąt orbity kamery dla semantycznego fokusu (ten sam układ co suwak 360°). */
export const FOCUS_ANGLE: Record<Focus, number> = { front: 0, back: Math.PI };

export type SlotLayout = 'center' | 'edge-right';

export const SLOTS: Record<SurfaceId, { focus: Focus | null; layout: SlotLayout }> = {
    'back-canvas': { focus: 'back', layout: 'center' },
    'tasks-drawer': { focus: null, layout: 'edge-right' }, // compact: bottom-sheet (CSS)
};

const TWO_PI = Math.PI * 2;

export function normalizeAngle(a: number): number {
    const n = ((a % TWO_PI) + TWO_PI) % TWO_PI;
    return n < 1e-6 || TWO_PI - n < 1e-6 ? 0 : n;
}

/** Najkrótsza różnica kątów w zakresie (-π, π]. */
export function shortestDelta(from: number, to: number): number {
    let d = (to - from) % TWO_PI;
    if (d > Math.PI) d -= TWO_PI;
    if (d <= -Math.PI) d += TWO_PI;
    return d;
}

export const smoothstep01 = (x: number) => {
    const t = Math.min(1, Math.max(0, x));
    return t * t * (3 - 2 * t);
};

/** Widoczność slotu (0..1) zależnie od odległości kątowej kamery od anchoru; zbucketowana co 0.1. */
export function slotVisibility(angle: number, anchor: number, fadeRange = Math.PI / 2): number {
    const d = Math.abs(shortestDelta(angle, anchor));
    return Math.round(smoothstep01(1 - d / fadeRange) * 10) / 10;
}
