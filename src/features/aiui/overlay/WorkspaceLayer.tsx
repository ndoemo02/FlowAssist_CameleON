'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAiUi } from '../store';
import { FOCUS_ANGLE, slotVisibility } from '../slots';
import { workspaceChildren } from '../workspace';
import ActionBar from '../components/ActionBar';
import { cardKeyHandler, useCardGestures, useResizeHandle, visualScale } from './gestures';
import { ItemBody, KIND_LABEL, useItemView } from './ItemContent';
import { useZones } from './zones';
import { setLayerInert } from './inert';
import { userLayoutCommand } from './userCommand';
import { canTakeFocus } from './focusTarget';

// Stół roboczy (Back 180°, plan v1.2.1 II.2/II.6): karty 2.5D w DOM.
// Każda karta subskrybuje WŁASNY wpis układu — zmiana jednego elementu nie renderuje pozostałych.

const EMPTY: string[] = [];
const BASE_W = 300; // px szerokości karty przy scale = 1 (desktop)

/** Compact: rozmiar karty („− / +”) to jej szerokość w pasku (78vw / 360px przy scale = 1, w granicach 0.75–1.25). */
const compactWidth = (scale: number) => {
    const s = Math.min(1.25, Math.max(0.75, scale));
    return `min(${Math.round(78 * s)}vw, ${Math.round(360 * s)}px)`;
};

export default function WorkspaceLayer({ compact }: { compact: boolean }) {
    const ids = useAiUi(useShallow((s) => workspaceChildren(s.surfaces.workspace) ?? EMPTY));
    const visibility = useAiUi((s) => slotVisibility(s.camera.angle, FOCUS_ANGLE.back));
    const zones = useZones(compact);
    const container = useRef<HTMLDivElement>(null);
    const section = useRef<HTMLElement>(null);
    // stół widoczny tylko z Back: przy częściowej widoczności poza Tab i bez fokusu (jak panel ekranu)
    useLayoutEffect(() => setLayerInert(section.current, visibility <= 0.6), [visibility, ids.length]);
    if (ids.length === 0) return null;

    const blurOnBackground = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) userLayoutCommand({ type: 'blur' });
    };

    return (
        <section
            ref={section}
            aria-label="Stół roboczy"
            data-focus-layer="table"
            tabIndex={-1} // bezpieczny cel fokusu (tylko programowo, P0.5)
            className="absolute inset-x-0 outline-none transition-opacity duration-200 focus-visible:ring-1 focus-visible:ring-cyan-400/40"
            style={{
                top: zones.top, bottom: zones.panel, opacity: visibility,
                visibility: visibility === 0 ? 'hidden' : 'visible',
                pointerEvents: visibility > 0.6 ? 'auto' : 'none',
            }}
        >
            <HiddenItems compact={compact} />
            {compact ? (
                <div className="flex h-full snap-x snap-mandatory items-stretch gap-3 overflow-x-auto px-4 py-1 [scrollbar-width:thin]" onClick={blurOnBackground}>
                    {ids.map((id) => <WorkspaceCard key={id} id={id} compact containerRef={container} />)}
                </div>
            ) : (
                <div className="absolute inset-0" style={{ perspective: 1400 }} onClick={blurOnBackground}>
                    {/* Bez `preserve-3d`: karty są współpłaszczyznowe z kontenerem, a we wspólnym kontekście 3D
                        hit-test Chromium trafiał w kontener zamiast w kartę (E2E-1, ADR 0006). Obraz bez zmian. */}
                    <div ref={container} className="absolute inset-x-6 inset-y-2" style={{ transform: 'rotateX(6deg)' }} onClick={blurOnBackground}>
                        {ids.map((id) => <WorkspaceCard key={id} id={id} compact={false} containerRef={container} />)}
                    </div>
                </div>
            )}
        </section>
    );
}

const WorkspaceCard = memo(function WorkspaceCard({ id, compact, containerRef }: { id: string; compact: boolean; containerRef: RefObject<HTMLDivElement> }) {
    const entry = useAiUi((s) => s.layout[id]);
    const view = useItemView(id);
    const card = useRef<HTMLDivElement>(null);
    const menuButton = useRef<HTMLButtonElement>(null);
    const [menu, setMenu] = useState(false);
    // A11Y-1 (review P0.5): klawiatura nie wprowadza karty w focus, więc kontrolki („−/+”, „Ukryj”, „Na ekran”, „⋯”)
    // pokazujemy, gdy fokus KLAWIATURY jest w karcie (:focus-visible). Fokus myszą (klik, drag) nie zmienia wyglądu;
    // kontrolki chowa dopiero wyjście fokusu z karty (klik myszą w kontrolkę ich nie chowa).
    const [keyboardWithin, setKeyboardWithin] = useState(false);
    // karta znika ze stołu (ukryta, na ekranie, usunięta): menu i kontrolki z fokusu klawiatury nie przeżywają tego
    // (komponent zostaje zamontowany i rysuje null / ślad na stole, więc stan lokalny trzeba wyzerować — P0.5, R7)
    const presentation = entry?.presentation;
    useEffect(() => {
        if (presentation !== 'card' && presentation !== 'focus') { setMenu(false); setKeyboardWithin(false); }
    }, [presentation]);
    // ważność właściciela (P0.5): menu zamyka się, gdy stół przestaje być aktywny (visibility ≤ 0.6)
    const tableActive = useAiUi((s) => slotVisibility(s.camera.angle, FOCUS_ANGLE.back) > 0.6);
    useEffect(() => { if (!tableActive) setMenu(false); }, [tableActive]);
    // Escape zamyka menu i oddaje fokus „⋯” (albo karcie, gdy menu otwarto prawym klikiem i „⋯” nie ma) — P0.5
    const closeMenu = () => {
        setMenu(false);
        const target = canTakeFocus(menuButton.current) ? menuButton.current : card.current;
        if (canTakeFocus(target)) target.focus();
    };

    const focused = entry?.presentation === 'focus';
    const scale = visualScale(entry?.scale ?? 1, focused);
    const baseTransform = useCallback(() => {
        const e = useAiUi.getState().layout[id];
        return `translate(-50%, -50%) scale(${visualScale(e?.scale ?? 1, e?.presentation === 'focus')})`;
    }, [id]);

    const bind = useCardGestures({ id, cardRef: card, containerRef, baseTransform, onMenu: () => setMenu(true), enabled: !compact });
    const resize = useResizeHandle(id, card, baseTransform);

    if (!entry || entry.presentation === 'dismissed') return null;
    const cmd = userLayoutCommand; // komendy użytkownika: potwierdzenie zmiany prezentacji (P0.5)
    const title = view.status !== 'pending' || view.title ? view.title ?? id : 'Ładowanie…';

    if (entry.presentation === 'screen') {
        // Element jest na ekranie (Front) — na stole zostaje tylko lekki ślad z powrotem
        return (
            <button
                data-nodrag
                onClick={() => cmd({ type: 'toCard', id })}
                className={`${compact ? 'relative shrink-0 snap-center' : 'absolute -translate-x-1/2 -translate-y-1/2'} rounded-xl border border-dashed border-cyan-400/40 bg-black/40 px-3 py-2 text-[11px] text-cyan-200/80 hover:text-white`}
                style={compact ? undefined : { left: `${entry.x * 100}%`, top: `${entry.y * 100}%`, zIndex: entry.z }}
            >
                ▶ {title} — na ekranie (wróć na stół)
            </button>
        );
    }

    const controls = (
        <div data-nodrag className="flex flex-wrap items-center gap-1.5 border-t border-white/10 px-3 py-2">
            <CardButton onClick={() => cmd({ type: 'toScreen', id })} primary>Na ekran</CardButton>
            {/* skala liczona z bieżącego stanu w chwili kliknięcia (szybkie kliknięcia nie gubią kroków) */}
            <CardButton onClick={() => cmd({ type: 'resize', id, scale: (useAiUi.getState().layout[id]?.scale ?? 1) / 1.15 })} label="Zmniejsz">−</CardButton>
            <CardButton onClick={() => cmd({ type: 'resize', id, scale: (useAiUi.getState().layout[id]?.scale ?? 1) * 1.15 })} label="Powiększ">+</CardButton>
            <CardButton onClick={() => cmd({ type: 'dismiss', id })}>Ukryj</CardButton>
            {view.status === 'ready' && view.actions.length > 0 && (
                <CardButton onClick={() => setMenu((m) => !m)} label="Akcje" expanded={menu} buttonRef={menuButton}>⋯</CardButton>
            )}
        </div>
    );

    return (
        <article
            ref={card}
            {...bind()}
            tabIndex={0}
            onFocus={(e) => { if (isKeyboardFocus(e.target)) setKeyboardWithin(true); }}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboardWithin(false); }}
            onKeyDown={(ev) => {
                // otwarte menu ma pierwszeństwo przed skrótem Escape karty (zdjęcie focusu)
                if (menu && ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeMenu(); return; }
                // Escape z wnętrza karty (treść, przyciski) wraca na kartę; dopiero na samej karcie zdejmuje focus
                if (ev.key === 'Escape' && ev.target !== ev.currentTarget) { ev.preventDefault(); ev.stopPropagation(); card.current?.focus(); return; }
                cardKeyHandler(id)(ev);
            }}
            onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}
            onClick={(e) => { if (compact && entry.presentation === 'card' && !(e.target as HTMLElement).closest('[data-nodrag]')) cmd({ type: 'focus', id }); }}
            aria-label={title}
            className={`${compact ? 'relative h-full shrink-0 snap-center' : 'absolute touch-none select-none'} flex flex-col overflow-hidden rounded-2xl border bg-[#07040f]/90 text-white shadow-2xl outline-none transition-[box-shadow,border-color] ${
                focused ? 'border-cyan-400/60 shadow-cyan-900/40' : 'border-white/10 hover:border-white/25'
            } ${compact ? '' : 'cursor-grab active:cursor-grabbing'}`}
            style={compact
                ? { width: compactWidth(entry.scale) }
                : { left: `${entry.x * 100}%`, top: `${entry.y * 100}%`, width: BASE_W, transform: `translate(-50%, -50%) scale(${scale})`, zIndex: entry.z }}
        >
            <header className="flex items-center justify-between gap-2 px-3 pt-2.5">
                <h3 className="truncate text-[13px] font-medium text-white/90">{title}</h3>
                {view.status === 'ready' && <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/50">{KIND_LABEL[view.kind]}</span>}
            </header>
            {/* przewijana treść (compact, karta z focusem) osiągalna z klawiatury (A11Y-3, P0.5); bez focusu przycięta */}
            <div
                className={`p-3 ${compact ? 'min-h-0 flex-1 overflow-auto' : focused ? 'max-h-[340px] overflow-auto' : 'max-h-[200px] overflow-hidden'}`}
                data-nodrag={focused ? true : undefined}
                {...(compact || focused ? { tabIndex: 0, role: 'group', 'aria-label': `Treść: ${title}` } : {})}
            >
                <ItemBody view={view} density="card" />
            </div>
            {(focused || compact || keyboardWithin) && controls}
            {menu && view.status === 'ready' && (
                <div data-nodrag className="border-t border-white/10 px-3 pb-2" onMouseLeave={() => setMenu(false)}>
                    <ActionBar
                        actions={view.actions}
                        onAction={(name) => { setMenu(false); useAiUi.getState().sendAction(name, 'workspace', id, { itemId: id }); }}
                    />
                </div>
            )}
            {!compact && (
                // uchwyt tylko dla wskaźnika — klawiatura zmienia rozmiar przyciskami „−/+” (A11Y-1)
                <div data-nodrag data-resize-handle {...resize()} aria-hidden="true" className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none bg-[linear-gradient(135deg,transparent_50%,rgba(255,255,255,0.35)_50%)]" />
            )}
        </article>
    );
});

/** Fokus z klawiatury (`:focus-visible`); bez wsparcia selektora (np. jsdom) — traktujemy jak klawiaturę. */
function isKeyboardFocus(el: EventTarget) {
    try { return (el as Element).matches(':focus-visible'); } catch { return true; }
}

function CardButton({ onClick, children, primary, label, expanded, buttonRef }: {
    onClick: () => void; children: React.ReactNode; primary?: boolean; label?: string; expanded?: boolean; buttonRef?: RefObject<HTMLButtonElement>;
}) {
    return (
        <button
            ref={buttonRef}
            data-nodrag
            aria-label={label}
            aria-expanded={expanded}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${primary ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white' : 'border border-white/15 bg-white/5 text-white/80 hover:bg-white/10'}`}
        >
            {children}
        </button>
    );
}

/** „Pokaż ukryte” → „Przywróć” (P5: przywrócenie wyłącznie przez użytkownika). */
function HiddenItems({ compact }: { compact: boolean }) {
    const hidden = useAiUi(useShallow((s) => Object.keys(s.layout).filter((id) => s.layout[id].presentation === 'dismissed')));
    const titles = useAiUi(useShallow((s) => hidden.map((id) => {
        const t = s.surfaces.workspace?.components[id]?.title;
        return typeof t === 'string' ? t : id;
    })));
    const [open, setOpen] = useState(false);
    if (hidden.length === 0) return null;
    return (
        <div data-nodrag className={`absolute z-[1000] ${compact ? 'right-3 top-0' : 'left-6 top-0'}`}>
            <button onClick={() => setOpen((o) => !o)} className="rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[11px] text-white/70 hover:text-white">
                Pokaż ukryte ({hidden.length})
            </button>
            {open && (
                <ul className="mt-1.5 space-y-1 rounded-xl border border-white/10 bg-black/85 p-2">
                    {hidden.map((id, i) => (
                        <li key={id} className="flex items-center justify-between gap-3 text-[11px] text-white/70">
                            <span className="truncate">{titles[i]}</span>
                            <button onClick={() => userLayoutCommand({ type: 'restore', id })} className="rounded-full border border-white/15 px-2 py-0.5 text-white/80 hover:bg-white/10">
                                Przywróć
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
