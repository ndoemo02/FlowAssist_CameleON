'use client';

import { Component, type ReactNode } from 'react';
import { sameSignature } from '../viewProps';

// Lokalne boundary jednego widoku z danymi agenta (I10): błąd renderu daje fallback tej karty / węzła,
// a nie odmontowanie całej strony. Zmiana `resetKeys` (nowe dane od agenta; porównanie płytkie) ponawia
// render — widok wraca sam, gdy agent poprawi dane.

interface Props {
    resetKeys: readonly unknown[];
    fallback: (error: Error) => ReactNode;
    onError: (error: Error) => void;
    /**
     * Zatwierdzony udany render: pierwszy render nowej instancji (np. remount panelu) albo render po ponowieniu
     * po błędzie — koniec wystąpienia błędu renderu tego widoku. Samo odmontowanie nim nie jest.
     */
    onRecover?: () => void;
    children: ReactNode;
}

export default class RenderGuard extends Component<Props, { error: Error | null }> {
    state: { error: Error | null } = { error: null };

    static getDerivedStateFromError(error: unknown) {
        return { error: error instanceof Error ? error : new Error(String(error)) };
    }

    componentDidMount() {
        if (!this.state.error) this.props.onRecover?.(); // pierwszy render bez błędu
    }

    componentDidCatch(error: unknown) {
        this.props.onError(error instanceof Error ? error : new Error(String(error)));
    }

    componentDidUpdate(prev: Props, prevState: { error: Error | null }) {
        const keysChanged = !sameSignature(prev.resetKeys, this.props.resetKeys);
        // zatwierdzony render bez błędu po stanie błędu albo po zmianie resetKeys (nowe dane / wariant) = udany render
        // BIEŻĄCEGO wariantu; o innych wariantach decyduje rejestr (validationReporting), nie ten boundary
        if (!this.state.error && (prevState.error || keysChanged)) this.props.onRecover?.();
        if (this.state.error && keysChanged) this.setState({ error: null });
    }

    render() {
        return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
    }
}
