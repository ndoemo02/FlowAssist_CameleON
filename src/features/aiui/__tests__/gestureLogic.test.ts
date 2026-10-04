import { describe, expect, it } from 'vitest';
import { dragEndCommand, gestureToken, isGestureStale, keyCommand } from '../overlay/gestureLogic';
import { presentationReducer, reconcileLayout, type ItemMeta, type Layout } from '../layout';

const item = (id: string, hint: ItemMeta['hint'] = 'card', priority = 0): ItemMeta => ({ id, hint, priority, delivered: true });
const reconcile = (prev: Layout, items: ItemMeta[] | null) => reconcileLayout(prev, items).layout;
const cmd = (l: Layout, c: Parameters<typeof presentationReducer>[1]) => presentationReducer(l, c).layout;
const DIM = { w: 1000, h: 500 };

describe('tożsamość gestu (Astra #1)', () => {
    it('usunięcie i ponowne dodanie tego samego id unieważnia stary gest', () => {
        let l = reconcile({}, [item('a'), item('b')]);
        const token = gestureToken(l.a, DIM);
        l = reconcile(l, [item('b')]);              // agent usuwa 'a'
        l = reconcile(l, [item('a'), item('b')]);   // …i dodaje ponownie to samo id
        expect(isGestureStale(l.a, token)).toBe(true);
        expect(dragEndCommand('a', l.a, token, 300, 0, false)).toBeNull();
        // nawet gdyby komenda dotarła do reducera — odrzucona po instancji
        const r = presentationReducer(l, { type: 'move', id: 'a', x: 0.93, y: 0.5, rev: token.rev, instance: token.instance });
        expect(r.changed).toBe(false);
    });

    it('flick (dismiss) po zmianie od agenta jest odrzucany', () => {
        let l = reconcile({}, [item('a')]);
        l = cmd(l, { type: 'focus', id: 'a' });
        const token = gestureToken(l.a, DIM);
        l = reconcile(l, [item('a', 'screen')]);    // agent: rev++
        expect(dragEndCommand('a', l.a, token, 0, 120, true)).toBeNull();
        const r = presentationReducer(l, { type: 'dismiss', id: 'a', rev: token.rev, instance: token.instance });
        expect(r.changed).toBe(false);
        expect(r.layout.a.presentation).toBe('screen');
    });

    it('automatyczne przesunięcie siatki (P9) unieważnia gest', () => {
        let l = reconcile({}, [item('a', 'card', 1), item('b', 'card', 2)]);
        const token = gestureToken(l.a, DIM);
        l = reconcile(l, [item('a', 'card', 1), item('b', 'card', 2), item('c', 'card', 3)]); // reflow
        expect(isGestureStale(l.a, token)).toBe(true);
    });

    it('odebranie focusu przez agenta unieważnia gest na tej karcie', () => {
        let l = reconcile({}, [item('a', 'card'), item('b', 'card')]);
        l = cmd(l, { type: 'focus', id: 'a' });
        const token = gestureToken(l.a, DIM);
        l = reconcile(l, [item('a', 'card'), item('b', 'focus')]); // agent daje focus 'b' → 'a' zdegradowana
        expect(l.a.presentation).toBe('card');
        expect(isGestureStale(l.a, token)).toBe(true);
    });

    it('świeży gest: przesunięcie lub flick na focusie', () => {
        let l = reconcile({}, [item('a')]);
        let token = gestureToken(l.a, DIM);
        expect(dragEndCommand('a', l.a, token, 100, 50, false)).toMatchObject({ type: 'move', x: l.a.x + 0.1, y: l.a.y + 0.1 });
        l = cmd(l, { type: 'focus', id: 'a' });
        token = gestureToken(l.a, DIM);
        expect(dragEndCommand('a', l.a, token, 0, 120, true)).toMatchObject({ type: 'dismiss', id: 'a', rev: token.rev, instance: token.instance });
    });
});

describe('klawiatura karty (Astra #5)', () => {
    const l = reconcile({}, [item('a')]);

    it('zdarzenia z przycisków wewnątrz karty są ignorowane', () => {
        expect(keyCommand('Enter', 'a', l.a, false)).toBeNull();
        expect(keyCommand('ArrowRight', 'a', l.a, false)).toBeNull();
    });

    it('karta z fokusem: Enter = na ekran, strzałki = przesuń, Delete = ukryj, Escape = zdejmij focus', () => {
        expect(keyCommand('Enter', 'a', l.a, true)).toEqual({ type: 'toScreen', id: 'a' });
        expect(keyCommand('ArrowRight', 'a', l.a, true)).toMatchObject({ type: 'move', id: 'a', x: l.a.x + 0.02, instance: l.a.instance });
        expect(keyCommand('Delete', 'a', l.a, true)).toEqual({ type: 'dismiss', id: 'a' });
        expect(keyCommand('Escape', 'a', l.a, true)).toEqual({ type: 'blur' });
        expect(keyCommand('x', 'a', l.a, true)).toBeNull();
    });
});
