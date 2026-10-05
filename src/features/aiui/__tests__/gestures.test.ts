// Review #2 (I7): gest anulowany nie zapisuje nic. @use-gesture po `cancel()` woła handler jeszcze raz
// (setTimeout → compute → emit) z `first: false, last: true, canceled: true`, a przy pointer capture —
// przy każdym kolejnym ruchu aż do puszczenia przycisku. Testy odtwarzają tę sekwencję biblioteki
// (@use-gesture/core 10.3.1: DragEngine/PinchEngine.cancel) na prawdziwych handlerach z gestures.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayoutEntry } from '../layout';
import { useAiUi } from '../store';
import { useCardGestures, useResizeHandle } from '../overlay/gestures';

type Handler = (state: Record<string, unknown>) => unknown;
const captured = vi.hoisted(() => [] as Record<string, (state: Record<string, unknown>) => unknown>[]);
vi.mock('@use-gesture/react', () => ({
    useGesture: (handlers: Record<string, Handler>) => { captured.push(handlers); return () => ({}); },
}));

const entry = (patch: Partial<LayoutEntry> = {}): LayoutEntry => ({
    presentation: 'focus', x: 0.5, y: 0.5, scale: 1, z: 1, lastHint: null, instance: 1, rev: 0, moved: false, ...patch,
});
const cardRef = { current: { style: { transform: '' } } as unknown as HTMLElement };
const containerRef = { current: { clientWidth: 1000, clientHeight: 500 } as unknown as HTMLElement };
const base = () => 'translate(-50%, -50%) scale(1)';
/** Zdarzenie z celem wewnątrz [data-nodrag] (przycisk, treść karty w focusie) albo poza nim. */
const ev = (type: string, inControl: boolean) => ({ type, target: { closest: () => (inControl ? {} : null) }, stopPropagation() {} });

let writes = 0;
let unsub: () => void = () => {};
const cancel = vi.fn();

beforeEach(() => {
    captured.length = 0;
    cancel.mockClear();
    useAiUi.setState({ layout: { a: entry() } });
    writes = 0;
    unsub = useAiUi.subscribe((s, p) => { if (s.layout !== p.layout) writes++; });
});
afterEach(() => unsub());

function cardHandlers(id = 'a') {
    useCardGestures({ id, cardRef: cardRef as never, containerRef: containerRef as never, baseTransform: base, onMenu: () => {}, enabled: true });
    return captured[0];
}

describe('gest zaczęty na [data-nodrag] i anulowany (fromControl → cancel)', () => {
    it('drag: końcowe callbacki z canceled nie zapisują ani move, ani raise', () => {
        const { onDrag } = cardHandlers();
        const common = { tap: false, movement: [30, 0], swipe: [0, 0], cancel };
        // 1. pierwsza intencjonalna klatka na kontrolce → handler woła cancel()
        const memo = onDrag({ ...common, first: true, last: false, canceled: false, memo: undefined, event: ev('pointermove', true) });
        expect(cancel).toHaveBeenCalledTimes(1);
        // 2. callback biblioteki po cancel() (setTimeout) i 3. kolejny ruch przy pointer capture
        const memo2 = onDrag({ ...common, first: false, last: true, canceled: true, memo, event: ev('pointermove', true) });
        onDrag({ ...common, first: false, last: true, canceled: true, memo: memo2 ?? memo, event: ev('pointermove', true) });
        expect(writes).toBe(0);
        expect(useAiUi.getState().layout.a).toEqual(entry());
    });

    it('pinch: końcowy callback z canceled nie zapisuje resize', () => {
        const { onPinch } = cardHandlers();
        const common = { movement: [1.3, 0], cancel };
        const memo = onPinch({ ...common, first: true, last: false, canceled: false, memo: undefined, event: ev('wheel', true) });
        expect(cancel).toHaveBeenCalledTimes(1);
        onPinch({ ...common, first: false, last: true, canceled: true, memo, event: ev('wheel', true) });
        expect(writes).toBe(0);
        expect(useAiUi.getState().layout.a.scale).toBe(1);
    });
});

// Tap kończący gest (pointerup, bez ruchu): `target.closest` odpowiada jak przycisk karty (button wewnątrz
// [data-nodrag]) albo jak treść karty w focusie (sam [data-nodrag], bez przycisku).
const tapOn = (where: 'button' | 'content') => ({
    type: 'pointerup', stopPropagation() {},
    target: { closest: (sel: string) => (sel.includes('[data-nodrag]') || (where === 'button' && sel.includes('button')) ? {} : null) },
});
const tap = (onDrag: Handler, where: 'button' | 'content') =>
    onDrag({ first: false, last: true, tap: true, canceled: false, memo: undefined, movement: [0, 0], swipe: [0, 0], cancel, event: tapOn(where) });

describe('podwójny tap (toScreen) nie liczy tapów na przyciskach karty', () => {
    it('dwa szybkie kliknięcia „+” nie wysyłają karty w focusie na ekran', () => {
        useAiUi.setState({ layout: { 'plus2': entry({ presentation: 'focus' }) } }); // osobne id: lastTap to stan modułu
        const { onDrag } = cardHandlers('plus2');
        tap(onDrag, 'button');
        tap(onDrag, 'button');
        expect(useAiUi.getState().layout['plus2'].presentation).toBe('focus');
    });

    it('kliknięcie przycisku i zaraz tap na treść też nie jest podwójnym tapem', () => {
        useAiUi.setState({ layout: { 'plus-content': entry({ presentation: 'focus' }) } }); // osobne id: lastTap to stan modułu
        const { onDrag } = cardHandlers('plus-content');
        tap(onDrag, 'button');
        tap(onDrag, 'content');
        expect(useAiUi.getState().layout['plus-content'].presentation).toBe('focus');
    });

    it('podwójny tap na treść karty w focusie nadal wysyła ją na ekran', () => {
        useAiUi.setState({ layout: { 'content2': entry({ presentation: 'focus' }) } }); // osobne id: lastTap to stan modułu
        const { onDrag } = cardHandlers('content2');
        tap(onDrag, 'content');
        tap(onDrag, 'content');
        expect(useAiUi.getState().layout['content2'].presentation).toBe('screen');
    });
});

describe('callback z canceled = true nigdy nie zapisuje (kontrakt handlerów)', () => {
    it('uchwyt zmiany rozmiaru: canceled przy last nie zapisuje skali', () => {
        useResizeHandle('a', cardRef as never, base);
        const { onDrag } = captured[0];
        onDrag({ first: false, last: true, canceled: true, memo: undefined, movement: [40, 40], cancel, event: ev('pointermove', false) });
        expect(writes).toBe(0);
        expect(useAiUi.getState().layout.a.scale).toBe(1);
    });

    it('drag karty: canceled przy last (poza kontrolką) nie zapisuje', () => {
        const { onDrag } = cardHandlers();
        onDrag({ first: false, last: true, canceled: true, tap: false, memo: undefined, movement: [30, 0], swipe: [0, 0], cancel, event: ev('pointermove', false) });
        expect(writes).toBe(0);
    });
});
