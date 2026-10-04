'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import type { ViewProps } from './types';

type Slide = { title: string; bullets: string[] };

// Numer slajdu to stan czysto prezentacyjny — dozwolony lokalnie.
export default function Presentation({ slides }: ViewProps<{ slides: Slide[] }>) {
    const [i, setI] = useState(0);
    const idx = Math.min(i, slides.length - 1);
    const s = slides[idx];

    return (
        <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-6">
            <AnimatePresence mode="wait">
                <motion.div key={idx} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
                    <p className="text-[11px] font-mono text-purple-300">{idx + 1} / {slides.length}</p>
                    <h3 className="mt-1 text-2xl font-medium text-white">{s.title}</h3>
                    <ul className="mt-4 space-y-2">
                        {s.bullets.map((b) => <li key={b} className="flex gap-2 text-white/75"><span className="text-cyan-400">—</span>{b}</li>)}
                    </ul>
                </motion.div>
            </AnimatePresence>
            <div className="mt-6 flex items-center justify-between">
                <div className="flex gap-1.5">
                    {slides.map((_, k) => (
                        <button key={k} aria-label={`Slajd ${k + 1}`} onClick={() => setI(k)} className={`h-1.5 rounded-full transition-all ${k === idx ? 'w-6 bg-cyan-400' : 'w-1.5 bg-white/25'}`} />
                    ))}
                </div>
                <div className="flex gap-2 text-xs">
                    <button disabled={idx === 0} onClick={() => setI(idx - 1)} className="rounded-full border border-white/15 px-3 py-1.5 text-white/70 disabled:opacity-30">←</button>
                    <button disabled={idx === slides.length - 1} onClick={() => setI(idx + 1)} className="rounded-full border border-white/15 px-3 py-1.5 text-white/70 disabled:opacity-30">→</button>
                </div>
            </div>
        </div>
    );
}
