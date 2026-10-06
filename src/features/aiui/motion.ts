'use client';

// P0.6 (plan v1.3.2, R5): ograniczony ruch (`prefers-reduced-motion: reduce`).
// Każda gałąź kamery w page.tsx osiąga stan końcowy bez wygładzania: kąt orbity, pozycja / target / FOV cinematic
// (intro, scroll „close”) i powrót z „close” do orbity. Kernel (store.ts) bez zmian: kąt i źródło `director`
// zachowują semantykę P3 — page.tsx podaje tickCamera cały czas tweenu, więc tween kończy się w jednej klatce.

import { useEffect, useRef } from 'react';
import { smoothstep01 } from './slots';
import { TWEEN_SECONDS } from './store';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** Czas dojazdu kamery intro → wide (s) przy zwykłym ruchu. */
export const ENTRY_SECONDS = 1.9;

/** Współczynnik wygładzania na klatkę (lerp ku celowi): zwykły ruch 1 - e^(-delta·k), ograniczony — 1 (od razu cel). */
export function smoothing(delta: number, k: number, reduced: boolean) {
    return reduced ? 1 : 1 - Math.exp(-delta * k);
}

/**
 * Krok tweenu kąta dla `tickCamera`: ograniczony ruch kończy tween w jednej klatce.
 * Kontrakt z kernelem (store.ts, I8): `tickCamera` używa `dt` wyłącznie do postępu tweenu (bez tweenu nic nie robi),
 * a okres łaski ręcznego suwaka liczy z `performance.now()` — więc podawanie TWEEN_SECONDS w każdej klatce jest
 * bezpieczne. Pilnuje tego `__tests__/motion.test.ts`.
 */
export function cameraTickSeconds(delta: number, reduced: boolean) {
    return reduced ? TWEEN_SECONDS : delta;
}

/** Postęp dojazdu intro → wide: podczas intro 0; ograniczony ruch — od razu 1. */
export function entryProgress({ introActive, elapsed, reduced }: { introActive: boolean; elapsed: number; reduced: boolean }) {
    if (introActive) return 0;
    return reduced ? 1 : smoothstep01(elapsed / ENTRY_SECONDS);
}

/** Preferencja systemowa jako ref (odczyt w pętli klatek bez re-renderów); śledzi zmianę w trakcie działania. */
export function useReducedMotionRef() {
    const ref = useRef(false);
    useEffect(() => {
        const mq = window.matchMedia(REDUCED_MOTION_QUERY);
        const update = () => { ref.current = mq.matches; };
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);
    return ref;
}
