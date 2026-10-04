'use client';

import { motion } from 'framer-motion';
import type { ViewProps } from './types';

type Insight = { title: string; value: string | number; delta?: 'up' | 'down' | 'flat'; note?: string };

const DELTA = { up: { icon: '▲', cls: 'text-emerald-400' }, down: { icon: '▼', cls: 'text-rose-400' }, flat: { icon: '■', cls: 'text-white/40' } };

export default function InsightCards({ items }: ViewProps<{ items: Insight[] }>) {
    return (
        <div className="aiui-cards grid grid-cols-1 gap-3 sm:grid-cols-3">
            {items.map((c, i) => (
                <motion.div
                    key={c.title}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.12 }}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                    <p className="text-[11px] uppercase tracking-widest text-white/40">{c.title}</p>
                    <p className="mt-1 flex items-baseline gap-2 text-2xl font-medium text-cyan-300">
                        {c.value}
                        {c.delta && <span className={`text-xs ${DELTA[c.delta].cls}`}>{DELTA[c.delta].icon}</span>}
                    </p>
                    {c.note && <p className="mt-1 text-xs text-white/50">{c.note}</p>}
                </motion.div>
            ))}
        </div>
    );
}
