'use client';

import { Component, type ReactNode } from 'react';

// Lokalne boundary jednego widoku z danymi agenta (I10): błąd renderu daje fallback tej karty / węzła,
// a nie odmontowanie całej strony. Zmiana `resetKey` (nowe dane od agenta) ponawia render — widok wraca
// sam, gdy agent poprawi dane.

interface Props {
    resetKey: unknown;
    fallback: (error: Error) => ReactNode;
    onError: (error: Error) => void;
    children: ReactNode;
}

export default class RenderGuard extends Component<Props, { error: Error | null }> {
    state: { error: Error | null } = { error: null };

    static getDerivedStateFromError(error: unknown) {
        return { error: error instanceof Error ? error : new Error(String(error)) };
    }

    componentDidCatch(error: unknown) {
        this.props.onError(error instanceof Error ? error : new Error(String(error)));
    }

    componentDidUpdate(prev: Props) {
        if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
    }

    render() {
        return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
    }
}
