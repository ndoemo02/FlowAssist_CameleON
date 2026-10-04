'use client';

import { Component, type ReactNode } from 'react';

// Izoluje pojedynczy element sceny 3D: brak assetu (404) nie zabija całego Canvasu.
export default class SceneErrorBoundary extends Component<
    { name: string; children: ReactNode },
    { failed: boolean }
> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: unknown) {
        console.warn(`[Scene] "${this.props.name}" nie załadował się:`, error);
    }

    render() {
        return this.state.failed ? null : this.props.children;
    }
}
