// ADR 0007 (P0.4): taksonomia stanów elementu.
// - Kategorie rozróżniamy po `status` + `path`, nie po tekście `reason` (komunikat dla człowieka).
// - „Raport” = problem z `scanSurfaces` (to samo źródło, z którego validationReporting wysyła VALIDATION_FAILED).
// - ST-1(b) to specyfikacja docelowa (decyzja właściciela 2026-10-06, zmiana kernela w resolveItem).
// - ST-2, ST-3 (rozstrzygnięte: zostają) i ST-4 (do decyzji) przypinają zachowanie obecne.

import { describe, expect, it } from 'vitest';
import { resolveItem, workspaceMeta, type WorkspaceItemView } from '../workspace';
import { resolveTree } from '../resolveTree';
import { scanSurfaces } from '../validationReporting';
import type { SurfaceId } from '../contract';
import type { Surface } from '../reducer';

const surface = (components: Surface['components'], data: Surface['data'] = {}): Surface =>
    ({ catalogId: 'flowassist/v2', components, data });
/** Stół z rootem Workspace; członkostwo domyślnie = wszystkie podane elementy. */
const ws = (items: Surface['components'], data: Surface['data'] = {}, children = Object.keys(items)) =>
    surface({ root: { id: 'root', component: 'Workspace', children }, ...items }, data);
const item = (id: string, extra: Record<string, unknown> = {}) => ({
    id, component: 'WorkspaceItem', kind: 'chart', title: 'Zapytania',
    content: { path: `/items/${id}` }, representations: ['chart2d'], ...extra,
});
const series = [{ label: '2026', points: [{ x: 'Q1', y: 1 }] }];
const chartData = (kind = 'line') => ({ items: { a: { kind, series } } });

const scan = (surfaceId: SurfaceId, s: Surface) => scanSurfaces({ [surfaceId]: s });
const reported = (surfaceId: SurfaceId, s: Surface) => scan(surfaceId, s).problems.map((p) => p.path);
const nodeStatus = (surfaceId: SurfaceId, s: Surface, id: string) => scan(surfaceId, s).nodes.get(JSON.stringify([surfaceId, id]));

describe('ADR 0007: stany WorkspaceItemView (stół)', () => {
    const cases: { name: string; s: Surface; expected: Partial<WorkspaceItemView> & { status: WorkspaceItemView['status'] } }[] = [
        { name: 'pending: komponent niedostarczony (id w Workspace.children)', s: ws({}, {}, ['a']), expected: { status: 'pending', id: 'a' } },
        { name: 'pending: treść (binding content) w drodze', s: ws({ a: item('a') }), expected: { status: 'pending', title: 'Zapytania' } },
        { name: 'fallback: zły typ komponentu', s: ws({ a: { id: 'a', component: 'Approval', title: 'X', summary: 'S' } }, chartData()),
            expected: { status: 'fallback', path: '/components/a/component' } },
        { name: 'fallback: złe propsy (presentation od agenta = dismissed)', s: ws({ a: item('a', { presentation: 'dismissed' }) }, chartData()),
            expected: { status: 'fallback', path: '/components/a/presentation' } },
        { name: 'fallback: reprezentacja niedozwolona dla rodzaju', s: ws({ a: item('a', { representations: ['table2d'] }) }, chartData()),
            expected: { status: 'fallback', path: '/components/a/representations/0' } },
        { name: 'fallback: brak obsługiwanej reprezentacji („unsupported”)', s: ws({ a: item('a', { representations: ['ribbon3d'] }) }, chartData()),
            expected: { status: 'fallback', path: '/components/a/representations' } },
        // ta sama ścieżka co „unsupported” — rozróżnia je tylko reason (ADR 0007)
        { name: 'fallback: pusta lista reprezentacji', s: ws({ a: item('a', { representations: [] }) }, chartData()),
            expected: { status: 'fallback', path: '/components/a/representations' } },
        { name: 'fallback: zła treść dla reprezentacji', s: ws({ a: item('a') }, chartData('pie')),
            expected: { status: 'fallback', path: '/components/a/content/kind' } },
        // ta sama ścieżka co zła treść i błąd renderu — tu odpada już walidacja propsów, przed validateContent
        { name: 'fallback: treść niebędąca obiektem (content: null) — błąd propsów', s: ws({ a: item('a', { content: null }) }),
            expected: { status: 'fallback', path: '/components/a/content' } },
        { name: 'ready', s: ws({ a: item('a') }, chartData()), expected: { status: 'ready', representation: 'chart2d' } },
    ];

    it.each(cases)('$name', ({ s, expected }) => {
        const view = resolveItem(s, 'a');
        expect(view).toMatchObject(expected);
        // raport tylko dla fallbacku, z tą samą ścieżką; stan węzła w raportowaniu = status widoku
        expect(reported('workspace', s)).toEqual(view.status === 'fallback' ? [view.path] : []);
        expect(nodeStatus('workspace', s, 'a')).toBe(view.status);
    });

    it('niedostarczony element jest w układzie jako szkielet (delivered: false), bez tytułu', () => {
        const s = ws({}, {}, ['a']);
        expect(workspaceMeta(s)).toEqual([{ id: 'a', delivered: false, hint: null, priority: 0 }]);
        expect(resolveItem(s, 'a')).toEqual({ status: 'pending', id: 'a' });
    });

    it('propsy sprawdzane dopiero po dotarciu treści: zły rodzaj przy treści w drodze to pending bez raportu', () => {
        const bad = item('a', { kind: 'pie' });
        expect(resolveItem(ws({ a: bad }), 'a')).toMatchObject({ status: 'pending' });
        expect(reported('workspace', ws({ a: bad }))).toEqual([]);
        expect(resolveItem(ws({ a: bad }, chartData()), 'a')).toMatchObject({ status: 'fallback', path: '/components/a/kind' });
    });

    it('zły typ komponentu jest rozpoznawany przed treścią (bez względu na dane)', () => {
        const s = ws({ a: { id: 'a', component: 'TaskList', tasks: { path: '/missing' } } });
        expect(resolveItem(s, 'a')).toMatchObject({ status: 'fallback', path: '/components/a/component' });
    });
});

// ST-1(b), decyzja właściciela 2026-10-06: pending stołu = któryś binding bez danych (jak w drzewie slotu),
// a brak wymaganego propsa dosłownego (także content) to fallback z raportem.
describe('ADR 0007 ST-1(b): pending = nierozwiązany binding', () => {
    it('stół: wymagany prop (title) z bindingu bez danych przy obecnej treści → pending bez raportu; po dosłaniu → ready', () => {
        const a = item('a', { title: { path: '/meta/title' } });
        const early = ws({ a }, chartData());
        expect(resolveItem(early, 'a')).toMatchObject({ status: 'pending', id: 'a' });
        expect(reported('workspace', early)).toEqual([]);
        expect(nodeStatus('workspace', early, 'a')).toBe('pending');
        const late = ws({ a }, { ...chartData(), meta: { title: 'Zapytania' } });
        expect(resolveItem(late, 'a')).toMatchObject({ status: 'ready', title: 'Zapytania' });
        expect(reported('workspace', late)).toEqual([]);
    });

    it('stół: opcjonalny prop z bindingu bez danych (priority, presentation, actions) → pending; po dosłaniu → ready z wartościami', () => {
        const a = item('a', { priority: { path: '/m/p' }, presentation: { path: '/m/h' }, actions: { path: '/m/a' } });
        const early = ws({ a }, chartData());
        expect(resolveItem(early, 'a')).toMatchObject({ status: 'pending' });
        expect(reported('workspace', early)).toEqual([]);
        const late = ws({ a }, { ...chartData(), m: { p: 2, h: 'focus', a: [{ name: 'more', label: 'Więcej' }] } });
        expect(resolveItem(late, 'a')).toMatchObject({ status: 'ready', priority: 2, hint: 'focus', actions: [{ name: 'more', label: 'Więcej' }] });
    });

    it('stół: binding rozwiązany do złej wartości to nadal błąd propsów (null ≠ brak danych)', () => {
        const s = ws({ a: item('a', { title: { path: '/meta/title' } }) }, { ...chartData(), meta: { title: null } });
        expect(resolveItem(s, 'a')).toMatchObject({ status: 'fallback', path: '/components/a/title' });
        expect(reported('workspace', s)).toEqual(['/components/a/title']);
    });

    it('stół: WorkspaceItem bez propsa content (bez bindingu) → fallback /content z raportem', () => {
        const noContent = { id: 'a', component: 'WorkspaceItem', kind: 'chart', title: 'Zapytania', representations: ['chart2d'] };
        const s = ws({ a: noContent }, chartData());
        expect(resolveItem(s, 'a')).toMatchObject({ status: 'fallback', path: '/components/a/content' });
        expect(reported('workspace', s)).toEqual(['/components/a/content']);
    });

    it('binding na dowolnym propsie najwyższego poziomu, także spoza katalogu (I3), wstrzymuje element', () => {
        const s = ws({ a: item('a', { x: { path: '/layout/x' } }) }, chartData());
        expect(resolveItem(s, 'a')).toMatchObject({ status: 'pending' });
        expect(reported('workspace', s)).toEqual([]);
    });

    it('maskowanie: dosłowny błąd + binding bez danych → pending bez raportu, dopóki dane nie dojdą (jak w drzewie)', () => {
        const a = item('a', { kind: 'pie', priority: { path: '/m/p' } });
        expect(resolveItem(ws({ a }, chartData()), 'a')).toMatchObject({ status: 'pending' });
        expect(reported('workspace', ws({ a }, chartData()))).toEqual([]);
        expect(resolveItem(ws({ a }, { ...chartData(), m: { p: 1 } }), 'a')).toMatchObject({ status: 'fallback', path: '/components/a/kind' });
    });

    it('parytet z resolveTree dla własnego klucza __proto__ z bindingiem bez danych → pending', () => {
        const def = Object.assign(JSON.parse('{"__proto__":{"path":"/missing"}}'), item('a'));
        expect(Object.prototype.hasOwnProperty.call(def, '__proto__')).toBe(true);
        expect(resolveItem(ws({ a: def }, chartData()), 'a')).toMatchObject({ status: 'pending' });
    });

    // liczbę raportów w sekwencji (1 wystąpienie) sprawdza validationReporting.test.tsx: „zły tytuł z bindingu → …”
    it('ready → pending po usunięciu danych bindingu tytułu; stan węzła w raportowaniu: fallback ↔ pending', () => {
        const a = item('a', { title: { path: '/meta/title' } });
        expect(resolveItem(ws({ a }, { ...chartData(), meta: { title: 'T' } }), 'a')).toMatchObject({ status: 'ready' });
        expect(resolveItem(ws({ a }, chartData()), 'a')).toMatchObject({ status: 'pending' });
        // stan węzła w raportowaniu: fallback → pending → fallback; pending nie kończy wystąpienia (validationReporting.ts: sync)
        const bad = ws({ a }, { ...chartData(), meta: { title: 7 } });
        expect(nodeStatus('workspace', bad, 'a')).toBe('fallback');
        expect(nodeStatus('workspace', ws({ a }, chartData()), 'a')).toBe('pending');
    });

    it('granice: brak definicji nadal pending, zły typ nadal fallback przed bindingami', () => {
        expect(resolveItem(ws({}, {}, ['a']), 'a')).toEqual({ status: 'pending', id: 'a' });
        const wrong = ws({ a: { id: 'a', component: 'Approval', title: { path: '/missing' }, summary: 'S' } });
        expect(resolveItem(wrong, 'a')).toMatchObject({ status: 'fallback', path: '/components/a/component' });
    });

    it('drzewo slotu (HUD): nierozwiązany binding dowolnego propsa → pending, bez raportu', () => {
        const s = surface({ root: { id: 'root', component: 'Approval', title: { path: '/t' }, summary: 'S' } });
        expect(resolveTree(s)).toMatchObject({ kind: 'pending', id: 'root' });
        expect(reported('hud', s)).toEqual([]);
        expect(nodeStatus('hud', s, 'root')).toBe('pending');
    });
});

describe('ADR 0007 ST-4: układ czyta hint i priorytet z dosłownej definicji', () => {
    it('presentation i priority z bindingu nie trafiają do workspaceMeta, choć widok ready ma je rozwiązane', () => {
        const a = item('a', { presentation: { path: '/m/h' }, priority: { path: '/m/p' } });
        const s = ws({ a }, { ...chartData(), m: { h: 'screen', p: 5 } });
        expect(resolveItem(s, 'a')).toMatchObject({ status: 'ready', hint: 'screen', priority: 5 });
        expect(workspaceMeta(s)).toEqual([{ id: 'a', delivered: true, hint: null, priority: 0 }]);
    });
});

describe('ADR 0007: drzewo slotu — wynik resolvera a raport struktury', () => {
    it('Workspace w HUD z nierozwiązanym bindingiem: resolver daje pending, raportowanie — błąd struktury z definicji (FU-1)', () => {
        const s = surface({ root: { id: 'root', component: 'Workspace', children: [], note: { path: '/missing' } } });
        expect(resolveTree(s)).toMatchObject({ kind: 'pending', id: 'root' });
        expect(nodeStatus('hud', s, 'root')).toBe('fallback');
        expect(reported('hud', s)).toEqual(['/components/root/component']);
    });
});

describe('ADR 0007 ST-2: członek niedostarczony', () => {
    it('stół: id w children bez komponentu → szkielet (pending) i stan węzła', () => {
        const s = ws({}, {}, ['late']);
        expect(resolveItem(s, 'late')).toMatchObject({ status: 'pending' });
        expect(nodeStatus('workspace', s, 'late')).toBe('pending');
    });

    it('drzewo slotu: dziecko z children bez komponentu jest pomijane — brak węzła, brak stanu', () => {
        const s = surface({ root: { id: 'root', component: 'Approval', title: 'T', summary: 'S', children: ['late'] } });
        const tree = resolveTree(s);
        expect(tree).toMatchObject({ kind: 'component', id: 'root', children: [] });
        expect(nodeStatus('hud', s, 'late')).toBeUndefined();
        expect(reported('hud', s)).toEqual([]);
    });
});

describe('ADR 0007 ST-3: tytuł w pending i fallback', () => {
    it('pending i fallback niosą title tylko jako dosłowny tekst (tytuł z bindingu znika)', () => {
        const bound = item('a', { title: { path: '/meta/title' } });
        const meta = { meta: { title: 'Z bindingu' } };
        expect(resolveItem(ws({ a: bound }, meta), 'a')).toEqual({ status: 'pending', id: 'a', title: undefined });
        expect(resolveItem(ws({ a: bound }, { ...meta, ...chartData('pie') }), 'a')).toMatchObject({ status: 'fallback', title: undefined });
        expect(resolveItem(ws({ a: bound }, { ...meta, ...chartData() }), 'a')).toMatchObject({ status: 'ready', title: 'Z bindingu' });
    });
});
