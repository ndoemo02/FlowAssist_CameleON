'use client';

import { useEffect, useState } from 'react';
import type { ViewProps } from './types';

type Action = { name: string; label: string; variant?: 'primary' | 'secondary' };

export const buttonClass = (variant: Action['variant']) =>
    variant === 'primary'
        ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-lg shadow-purple-900/30 hover:brightness-110'
        : variant === 'secondary'
            ? 'text-white/60 hover:text-white'
            : 'border border-white/15 bg-white/5 text-white/85 hover:bg-white/10';

// Kliknięcie tylko wysyła akcję do agenta; widok zmieni dopiero jego odpowiedź.
export default function ActionBar({ actions, onAction }: ViewProps<{ actions: Action[] }>) {
    const [sent, setSent] = useState<string | null>(null);
    useEffect(() => setSent(null), [actions]);
    // Agent mógł odpowiedzieć bez zmiany widoku (np. nieobsługiwana akcja) — odblokuj po chwili.
    useEffect(() => {
        if (!sent) return;
        const t = setTimeout(() => setSent(null), 4000);
        return () => clearTimeout(t);
    }, [sent]);

    return (
        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-2 bg-gradient-to-t from-[#07040f] via-[#07040f]/95 to-transparent px-1 pb-1 pt-3">
            {actions.map((a) => (
                <button
                    key={a.name}
                    disabled={sent !== null}
                    onClick={() => { setSent(a.name); onAction(a.name); }}
                    className={`rounded-full px-4 py-2 text-xs font-medium transition disabled:cursor-wait disabled:opacity-50 ${buttonClass(a.variant)} ${sent === a.name ? 'ring-2 ring-cyan-400/60' : ''}`}
                >
                    {a.label}
                </button>
            ))}
        </div>
    );
}
