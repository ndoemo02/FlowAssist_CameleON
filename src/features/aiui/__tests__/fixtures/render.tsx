// Harness testów renderowania (jsdom): react-dom/client + act, bez dodatkowych bibliotek.
// ProbeBoundary łapie błąd, który PRZESZEDŁ przez warstwy AI-to-UI — w aplikacji nad overlayem nie ma
// boundary, więc taki błąd odmontowałby całą stronę. Test sprawdza, że sonda pozostaje czysta.

import { Component, act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Stuby API przeglądarki, których jsdom nie ma (useCompact → matchMedia). */
export function installDomStubs() {
    if (!window.matchMedia) {
        window.matchMedia = (query: string) => ({
            matches: false, media: query, onchange: null,
            addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
            dispatchEvent: () => false,
        }) as MediaQueryList;
    }
}

export class ProbeBoundary extends Component<{ onError: (error: unknown) => void; children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error: unknown) { this.props.onError(error); }
    render() { return this.state.failed ? null : this.props.children; }
}

export interface Rendered {
    container: HTMLElement;
    /** Błędy, które wyszły poza testowany poddrzewo (dotarły do sondy). */
    escaped: unknown[];
    rerender(el: ReactNode): void;
    unmount(): void;
}

export function render(el: ReactNode): Rendered {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const escaped: unknown[] = [];
    const wrap = (node: ReactNode) => <ProbeBoundary onError={(e) => escaped.push(e)}>{node}</ProbeBoundary>;
    act(() => root.render(wrap(el)));
    return {
        container,
        escaped,
        rerender: (next) => act(() => root.render(wrap(next))),
        unmount: () => { act(() => root.unmount()); container.remove(); },
    };
}
