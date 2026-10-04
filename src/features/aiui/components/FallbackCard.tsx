'use client';

// Bezpiecznik: komponent spoza katalogu lub ze złymi propsami. Nigdy nie renderuje treści od agenta jako HTML.
export function FallbackCard({ type, reason, path }: { type: string; reason: string; path?: string }) {
    return (
        <div className="rounded-xl border border-dashed border-amber-400/40 bg-amber-400/5 p-4 text-xs text-amber-200/80">
            <p className="font-medium">Nie mogę wyświetlić komponentu „{type}”</p>
            <p className="mt-1 text-amber-200/60">{reason}{path ? ` · ${path}` : ''}</p>
        </div>
    );
}

export function PendingCard({ type }: { type: string }) {
    return (
        <div className="animate-pulse rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="h-3 w-1/3 rounded bg-white/10" />
            <div className="mt-3 h-16 rounded bg-white/5" />
            <span className="sr-only">Ładowanie: {type}</span>
        </div>
    );
}
