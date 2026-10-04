'use client';

import { useState } from 'react';
import { buttonClass } from './ActionBar';
import type { ViewProps } from './types';

export default function Approval({ title, summary, items, onAction }: ViewProps<{ title: string; summary: string; items?: string[] }>) {
    const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
    const decide = (d: 'approve' | 'reject') => { setDecision(d); onAction(d); };

    return (
        <div className="rounded-xl border border-purple-400/30 bg-gradient-to-br from-purple-500/10 to-cyan-500/5 p-5">
            <p className="text-[11px] uppercase tracking-widest text-purple-300">Wymaga akceptacji</p>
            <h3 className="mt-1 text-xl font-medium text-white">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{summary}</p>
            {items && (
                <ul className="mt-4 space-y-1.5">
                    {items.map((it) => (
                        <li key={it} className="flex gap-2 text-sm text-white/80"><span className="text-cyan-400">✓</span>{it}</li>
                    ))}
                </ul>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
                <button disabled={decision !== null} onClick={() => decide('approve')} className={`rounded-full px-5 py-2 text-xs font-medium transition disabled:opacity-50 ${buttonClass('primary')}`}>
                    Zatwierdź
                </button>
                <button disabled={decision !== null} onClick={() => decide('reject')} className={`rounded-full px-5 py-2 text-xs font-medium transition disabled:opacity-50 ${buttonClass(undefined)}`}>
                    Odrzuć
                </button>
            </div>
        </div>
    );
}
