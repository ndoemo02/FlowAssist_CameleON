'use client';

// Lokalne ogłoszenia klienta (P0.5, plan v1.3.2 R7) — osobne od narracji agenta (store.narration.text ma własny
// region), żeby potwierdzenia gestów i komunikaty klienta nie nadpisywały narracji.
// - status: uprzejme (polite) — gesty, start/koniec przebiegu, nowy element, decyzja, element nie do wyświetlenia;
// - alert: tylko błąd blokujący (przebieg w `error`).
// `seq` rośnie przy każdym komunikacie: region wstawia nowy węzeł, więc czytnik ogłasza także powtórzony tekst.

import { create } from 'zustand';

type Message = { text: string; seq: number };
interface AnnouncerState { status: Message; alert: Message }

const EMPTY: Message = { text: '', seq: 0 };
export const useAnnouncer = create<AnnouncerState>(() => ({ status: EMPTY, alert: EMPTY }));

export function announce(text: string) {
    useAnnouncer.setState((s) => ({ status: { text, seq: s.status.seq + 1 } }));
}

export function alertAnnounce(text: string) {
    useAnnouncer.setState((s) => ({ alert: { text, seq: s.alert.seq + 1 } }));
}

/** Nowy przebieg: nieaktualny błąd nie zostaje w DOM (tryb przeglądania czytnika trafiłby na niego). */
export function clearAlert() {
    useAnnouncer.setState((s) => (s.alert.text ? { alert: { text: '', seq: s.alert.seq + 1 } } : s));
}

/** Testy: wyczyść komunikaty. */
export function resetAnnouncer() {
    useAnnouncer.setState({ status: EMPTY, alert: EMPTY });
}
