// @vitest-environment jsdom
// Review #7: panel spike'u ScreenAnchor (`?anchor=probe`) i hak `window.__screenAnchor` są narzędziem
// developerskim — w produkcji parametr URL nie może ich włączyć (jak `__aiui` i `__anchorRegistry`).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ScreenAnchorProbe from '../scene/ScreenAnchorProbe';
import { render, type Rendered } from './fixtures/render';

let r: Rendered | null = null;
const hook = () => (window as unknown as { __screenAnchor?: unknown }).__screenAnchor;

beforeEach(() => {
    window.history.replaceState({}, '', '/?anchor=probe');
    delete (window as unknown as { __screenAnchor?: unknown }).__screenAnchor;
});
afterEach(() => {
    r?.unmount();
    r = null;
    vi.unstubAllEnvs();
    window.history.replaceState({}, '', '/');
});

describe('ScreenAnchorProbe: tylko poza produkcją', () => {
    it('produkcja + ?anchor=probe: brak panelu i haka __screenAnchor', () => {
        vi.stubEnv('NODE_ENV', 'production');
        r = render(<ScreenAnchorProbe />);
        expect(r.container.textContent).not.toContain('ScreenAnchor · spike');
        expect(hook()).toBeUndefined();
    });

    it('development + ?anchor=probe: panel i hak działają jak dotąd', () => {
        vi.stubEnv('NODE_ENV', 'development');
        r = render(<ScreenAnchorProbe />);
        expect(r.container.textContent).toContain('ScreenAnchor · spike');
        expect(hook()).toBeDefined();
    });
});
