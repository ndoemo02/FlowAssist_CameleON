'use client';

import { motion } from 'framer-motion';
import type { ViewProps } from './types';

type Task = { title: string; agent?: string; status: 'queued' | 'running' | 'done' | 'failed'; progress: number; order?: number; note?: string };

const STATUS: Record<Task['status'], { label: string; dot: string; bar: string }> = {
    queued: { label: 'w kolejce', dot: 'bg-white/30', bar: 'bg-white/20' },
    running: { label: 'pracuje', dot: 'bg-cyan-400 animate-pulse', bar: 'bg-gradient-to-r from-purple-500 to-cyan-400' },
    done: { label: 'gotowe', dot: 'bg-emerald-400', bar: 'bg-emerald-400/80' },
    failed: { label: 'błąd', dot: 'bg-rose-500', bar: 'bg-rose-500/80' },
};

export default function TaskList({ title, tasks }: ViewProps<{ title?: string; tasks: Record<string, Task> }>) {
    const list = Object.entries(tasks).sort(([a, ta], [b, tb]) => (ta.order ?? 99) - (tb.order ?? 99) || a.localeCompare(b));
    const done = list.filter(([, t]) => t.status === 'done').length;

    return (
        <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-medium text-white/90">{title ?? 'Zadania agentów'}</h3>
                <span className="text-[11px] font-mono text-purple-300">{done}/{list.length}</span>
            </div>
            <ul className="space-y-2">
                {list.map(([id, t]) => {
                    const s = STATUS[t.status];
                    return (
                        <motion.li
                            key={id}
                            layout
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                        >
                            <div className="flex items-center gap-2">
                                <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                                <span className="flex-1 truncate text-[13px] text-white/85">{t.title}</span>
                                {t.agent && <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/50">{t.agent}</span>}
                            </div>
                            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                                <motion.div className={`h-full ${s.bar}`} animate={{ width: `${Math.round(t.progress * 100)}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
                            </div>
                            <div className="mt-1.5 flex justify-between text-[10px] text-white/40">
                                <span>{t.note ?? s.label}</span>
                                <span className="font-mono">{Math.round(t.progress * 100)}%</span>
                            </div>
                        </motion.li>
                    );
                })}
            </ul>
        </div>
    );
}
