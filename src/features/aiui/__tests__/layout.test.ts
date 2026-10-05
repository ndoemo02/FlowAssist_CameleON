import { describe, expect, it } from 'vitest';
import { autoSlot, layoutSnapshot, presentationReducer, reconcileLayout, type ItemMeta, type Layout } from '../layout';

const item = (id: string, hint: ItemMeta['hint'] = 'card', priority = 0, delivered = true): ItemMeta => ({ id, hint, priority, delivered });
const reconcile = (prev: Layout, items: ItemMeta[] | null) => reconcileLayout(prev, items).layout;
const cmd = (l: Layout, c: Parameters<typeof presentationReducer>[1]) => presentationReducer(l, c).layout;

describe('reconcileLayout', () => {
    it('nowe elementy dostają auto-layout wg priorytetu (P9) i prezentację z hintu', () => {
        const l = reconcile({}, [item('b', 'card', 2), item('a', 'card', 1), item('c', 'focus', 3)]);
        expect(l.a).toMatchObject({ presentation: 'card', ...autoSlot(0, 3) });
        expect(l.b).toMatchObject(autoSlot(1, 3));
        expect(l.c.presentation).toBe('focus');
    });

    it('P9: nowy element przelicza siatkę dla kart nieprzesuniętych; przesunięte zostają', () => {
        let l = reconcile({}, [item('a', 'card', 1), item('b', 'card', 2), item('c', 'card', 3)]);
        l = cmd(l, { type: 'move', id: 'b', x: 0.9, y: 0.9, rev: l.b.rev });
        l = reconcile(l, [item('a', 'card', 1), item('b', 'card', 2), item('c', 'card', 3), item('d', 'card', 4)]);
        expect(l.a).toMatchObject(autoSlot(0, 4));
        expect(l.d).toMatchObject(autoSlot(3, 4));
        expect(l.b).toMatchObject({ x: 0.9, y: 0.9 });
        expect(l.d.x === l.a.x && l.d.y === l.a.y).toBe(false);
    });

    // Review #3: podmiana członkostwa bez zmiany liczby kart ([a,b,c] → [a,c,d]) dawała c i d w tym samym slocie.
    it('P9: podmiana członkostwa (ta sama liczba kart) przelicza siatkę — nowa karta nie ląduje na starej', () => {
        let l = reconcile({}, [item('a', 'card', 1), item('b', 'card', 2), item('c', 'card', 3)]);
        l = reconcile(l, [item('a', 'card', 1), item('c', 'card', 3), item('d', 'card', 4)]);
        expect(l.a).toMatchObject(autoSlot(0, 3));
        expect(l.c).toMatchObject(autoSlot(1, 3));
        expect(l.d).toMatchObject(autoSlot(2, 3));
        expect(l.c.x === l.d.x && l.c.y === l.d.y).toBe(false);
    });

    it('P9: przy podmianie członkostwa karta przesunięta przez użytkownika zostaje; rev rośnie tylko przesuniętym przez siatkę', () => {
        let l = reconcile({}, [item('a', 'card', 1), item('b', 'card', 2), item('c', 'card', 3)]);
        l = cmd(l, { type: 'move', id: 'c', x: 0.9, y: 0.9, rev: l.c.rev });
        const before = l;
        l = reconcile(l, [item('a', 'card', 1), item('c', 'card', 3), item('d', 'card', 4)]);
        expect(l.c).toMatchObject({ x: 0.9, y: 0.9, moved: true, rev: before.c.rev });
        expect(l.a).toMatchObject({ ...autoSlot(0, 3), rev: before.a.rev }); // slot bez zmian → gest na a nie jest unieważniany
        expect(l.d).toMatchObject(autoSlot(2, 3));
    });

    it('bez zmian zwraca tę samą referencję', () => {
        const l = reconcile({}, [item('a')]);
        expect(reconcileLayout(l, [item('a')]).layout).toBe(l);
    });

    it('P4: hint stosowany tylko przy zmianie wartości; ponowny ten sam hint nie cofa zmian użytkownika', () => {
        let l = reconcile({}, [item('a', 'card')]);
        l = cmd(l, { type: 'focus', id: 'a' });
        expect(reconcile(l, [item('a', 'card')]).a.presentation).toBe('focus'); // ten sam hint 'card' — bez zmian
        const changed = reconcileLayout(l, [item('a', 'screen')]);
        expect(changed.layout.a.presentation).toBe('screen');
        expect(changed.screenHint).toBe(true);
        expect(changed.layout.a.rev).toBe(l.a.rev + 1);
    });

    it('P5: dismissed od użytkownika jest nadrzędne wobec zmiany hintu agenta', () => {
        let l = reconcile({}, [item('kpi', 'card')]);
        l = cmd(l, { type: 'dismiss', id: 'kpi' });
        const r = reconcileLayout(l, [item('kpi', 'screen')]);
        expect(r.layout.kpi.presentation).toBe('dismissed');
        expect(r.layout.kpi.lastHint).toBe('screen');
        expect(r.screenHint).toBe(false);
        // po przywróceniu przez użytkownika kolejna zmiana hintu znów działa
        const restored = cmd(r.layout, { type: 'restore', id: 'kpi' });
        expect(restored.kpi.presentation).toBe('card');
        expect(reconcile(restored, [item('kpi', 'focus')]).kpi.presentation).toBe('focus');
    });

    it('P1/P2: co najwyżej jeden element na ekranie i w focusie (nowszy hint wygrywa)', () => {
        let l = reconcile({}, [item('a', 'screen'), item('b', 'card')]);
        l = reconcile(l, [item('a', 'screen'), item('b', 'screen')]);
        expect(l.b.presentation).toBe('screen');
        expect(l.a.presentation).toBe('card');
    });

    it('P6: niedostarczone dziecko ma zarezerwowany wpis; hint stosowany po dostarczeniu', () => {
        let l = reconcile({}, [item('a'), item('late', null, 0, false)]);
        expect(l.late).toMatchObject({ presentation: 'card', lastHint: null });
        l = reconcile(l, [item('a'), item('late', 'screen')]);
        expect(l.late.presentation).toBe('screen');
    });

    it('P6: usunięcie z listy dzieci kasuje wpis; ponowne dodanie = świeży wpis bez dismissed', () => {
        let l = reconcile({}, [item('a'), item('b')]);
        l = cmd(l, { type: 'dismiss', id: 'b' });
        l = reconcile(l, [item('a')]);
        expect(l.b).toBeUndefined();
        l = reconcile(l, [item('a'), item('b')]);
        expect(l.b.presentation).toBe('card');
    });

    it('P7: brak surface’u/roota resetuje układ', () => {
        const l = reconcile({}, [item('a')]);
        expect(reconcile(l, null)).toEqual({});
    });
});

describe('presentationReducer', () => {
    const base = () => reconcile({}, [item('a'), item('b'), item('c')]);

    it('toScreen zawsze prosi o kamerę na Front (P3) i zrzuca poprzedni ekran do card (P1)', () => {
        let r = presentationReducer(base(), { type: 'toScreen', id: 'a' });
        expect(r.cameraFront).toBe(true);
        r = presentationReducer(r.layout, { type: 'toScreen', id: 'b' });
        expect(r.layout.a.presentation).toBe('card');
        expect(r.layout.b.presentation).toBe('screen');
    });

    it('focus: jeden naraz, podnosi kartę na wierzch', () => {
        let l = cmd(base(), { type: 'focus', id: 'a' });
        l = cmd(l, { type: 'focus', id: 'b' });
        expect(l.a.presentation).toBe('card');
        expect(l.b.presentation).toBe('focus');
        expect(l.b.z).toBeGreaterThan(l.a.z);
        expect(cmd(l, { type: 'blur' }).b.presentation).toBe('card');
    });

    it('move: zapis tylko przy niezmienionym rev (anulowanie gestu po zmianie od agenta)', () => {
        const l = base();
        expect(cmd(l, { type: 'move', id: 'a', x: 0.2, y: 0.3, rev: l.a.rev }).a).toMatchObject({ x: 0.2, y: 0.3, moved: true });
        const agentChanged = reconcile(l, [item('a', 'focus'), item('b'), item('c')]); // rev++
        const r = presentationReducer(agentChanged, { type: 'move', id: 'a', x: 0.9, y: 0.9, rev: l.a.rev });
        expect(r.changed).toBe(false);
        expect(r.layout.a.x).toBe(agentChanged.a.x);
    });

    it('komenda na usuniętym elemencie jest anulowana bez odtwarzania wpisu', () => {
        const l = reconcile(base(), [item('b'), item('c')]);
        const r = presentationReducer(l, { type: 'move', id: 'a', x: 0.1, y: 0.1, rev: 0 });
        expect(r.changed).toBe(false);
        expect(r.layout.a).toBeUndefined();
    });

    it('resize przycina do zakresu; dismissed nie zmienia rozmiaru', () => {
        expect(cmd(base(), { type: 'resize', id: 'a', scale: 5 }).a.scale).toBe(2);
        expect(cmd(base(), { type: 'resize', id: 'a', scale: 0.1 }).a.scale).toBe(0.6);
        const d = cmd(base(), { type: 'dismiss', id: 'a' });
        expect(presentationReducer(d, { type: 'resize', id: 'a', scale: 1.5 }).changed).toBe(false);
    });

    it('layoutSnapshot: bez współrzędnych', () => {
        let l = cmd(base(), { type: 'toScreen', id: 'a' });
        l = cmd(l, { type: 'focus', id: 'b' });
        l = cmd(l, { type: 'dismiss', id: 'c' });
        expect(layoutSnapshot(l)).toEqual({ screen: 'a', focus: 'b', dismissed: ['c'] });
    });
});
