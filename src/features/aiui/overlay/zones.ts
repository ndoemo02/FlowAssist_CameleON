'use client';

import { useAiUi } from '../store';

/** Strefy pionowe overlayu (px): napisy, dolna granica paneli, górny margines pod navbarem. */
export function useZones(compact: boolean) {
    const orbit = useAiUi((s) => s.ui.orbitPanel);
    const top = compact ? 60 : 84;
    if (compact) return { top, caption: 12, panel: orbit ? 176 : 84 };
    return { top, caption: orbit ? 180 : 64, panel: orbit ? 270 : 156 };
}
