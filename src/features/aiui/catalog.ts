// Katalog flowassist/v2: czyste walidatory propsów (bez Reacta), używane przez resolveTree/resolveWorkspace.
// Każdy walidator zwraca null albo { path, message } — path względny do propsów komponentu.

import { CATALOG_ID, ITEM_KINDS, PRESENTATIONS, REPRESENTATIONS, type CatalogName, type ItemKind, type Representation } from './contract';

export type ValidationIssue = { path: string; message: string };
type Validator = (p: Record<string, unknown>) => ValidationIssue | null;

const issue = (path: string, message: string): ValidationIssue => ({ path, message });
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optional = (v: unknown, check: (x: unknown) => boolean) => v === undefined || check(v);
const oneOf = <T extends string>(...vals: T[]) => (v: unknown): v is T => vals.includes(v as T);

/** Sprawdza każdy element tablicy; zwraca pierwszy problem ze ścieżką `/<prop>/<i>/...`. */
function eachItem(prop: string, list: unknown, check: (item: Record<string, unknown>) => ValidationIssue | null, min = 0) {
    if (!Array.isArray(list)) return issue(`/${prop}`, 'oczekiwano tablicy');
    if (list.length < min) return issue(`/${prop}`, `oczekiwano co najmniej ${min} elementów`);
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!isObj(item)) return issue(`/${prop}/${i}`, 'oczekiwano obiektu');
        const r = check(item);
        if (r) return issue(`/${prop}/${i}${r.path}`, r.message);
    }
    return null;
}

export const TASK_STATUSES = ['queued', 'running', 'done', 'failed'] as const;
const isTaskStatus = oneOf(...TASK_STATUSES);
const isDelta = oneOf('up', 'down', 'flat');
const isVariant = oneOf('primary', 'secondary');

/** Walidatory widoków (komponenty React z v1) — treść reprezentacji i komponenty HUD/tasków. */
type ViewName = 'TaskList' | 'Chart' | 'InsightCards' | 'Approval' | 'DataTable' | 'MapView' | 'Presentation';

const views: Record<ViewName, Validator> = {
    TaskList: (p) => {
        if (!isObj(p.tasks)) return issue('/tasks', 'oczekiwano mapy id → task');
        for (const [id, t] of Object.entries(p.tasks)) {
            if (!isObj(t)) return issue(`/tasks/${id}`, 'oczekiwano obiektu');
            if (!isStr(t.title)) return issue(`/tasks/${id}/title`, 'wymagany tekst');
            if (!isTaskStatus(t.status)) return issue(`/tasks/${id}/status`, `status spoza ${TASK_STATUSES.join('|')}`);
            if (!isNum(t.progress) || t.progress < 0 || t.progress > 1) return issue(`/tasks/${id}/progress`, 'liczba 0..1');
            if (!optional(t.agent, isStr)) return issue(`/tasks/${id}/agent`, 'tekst');
            if (!optional(t.order, isNum)) return issue(`/tasks/${id}/order`, 'liczba');
            if (!optional(t.note, isStr)) return issue(`/tasks/${id}/note`, 'tekst');
        }
        return null;
    },
    Chart: (p) => {
        if (!oneOf('line', 'bar')(p.kind)) return issue('/kind', 'line | bar');
        if (!optional(p.title, isStr)) return issue('/title', 'tekst');
        return eachItem('series', p.series, (s) => {
            if (!isStr(s.label)) return issue('/label', 'wymagany tekst');
            return eachItem('points', s.points, (pt) =>
                (isStr(pt.x) || isNum(pt.x)) && isNum(pt.y) ? null : issue('', 'punkt {x: string|number, y: number}'), 1);
        }, 1);
    },
    InsightCards: (p) =>
        eachItem('items', p.items, (c) => {
            if (!isStr(c.title)) return issue('/title', 'wymagany tekst');
            if (!(isStr(c.value) || isNum(c.value))) return issue('/value', 'tekst lub liczba');
            if (!optional(c.delta, isDelta)) return issue('/delta', 'up | down | flat');
            if (!optional(c.note, isStr)) return issue('/note', 'tekst');
            return null;
        }, 1),
    Approval: (p) => {
        if (!isStr(p.title)) return issue('/title', 'wymagany tekst');
        if (!isStr(p.summary)) return issue('/summary', 'wymagany tekst');
        if (!optional(p.items, (v) => Array.isArray(v) && v.every(isStr))) return issue('/items', 'lista tekstów');
        return null;
    },
    DataTable: (p) => {
        if (!Array.isArray(p.columns) || !p.columns.every(isStr)) return issue('/columns', 'lista tekstów');
        if (!Array.isArray(p.rows)) return issue('/rows', 'oczekiwano tablicy wierszy');
        for (let i = 0; i < p.rows.length; i++) {
            const row = p.rows[i];
            if (!Array.isArray(row) || !row.every((c) => isStr(c) || isNum(c))) return issue(`/rows/${i}`, 'wiersz: lista tekstów/liczb');
        }
        return null;
    },
    MapView: (p) => {
        if (!optional(p.title, isStr)) return issue('/title', 'tekst');
        return eachItem('points', p.points, (pt) => {
            if (!isStr(pt.label)) return issue('/label', 'wymagany tekst');
            if (!isNum(pt.x) || pt.x < 0 || pt.x > 1) return issue('/x', 'liczba 0..1');
            if (!isNum(pt.y) || pt.y < 0 || pt.y > 1) return issue('/y', 'liczba 0..1');
            return null;
        });
    },
    Presentation: (p) =>
        eachItem('slides', p.slides, (s) => {
            if (!isStr(s.title)) return issue('/title', 'wymagany tekst');
            if (!Array.isArray(s.bullets) || !s.bullets.every(isStr)) return issue('/bullets', 'lista tekstów');
            return null;
        }, 1),
};

const isAction = (a: Record<string, unknown>) => {
    if (!isStr(a.name)) return issue('/name', 'wymagany tekst');
    if (!isStr(a.label)) return issue('/label', 'wymagany tekst');
    if (!optional(a.variant, isVariant)) return issue('/variant', 'primary | secondary');
    return null;
};

/** Dozwolone reprezentacje dla rodzaju elementu (pierwsza obsługiwana = domyślna, P10). */
export const KIND_REPRESENTATIONS: Record<ItemKind, Representation[]> = {
    chart: ['chart2d', 'ribbon3d', 'liquid3d'],
    kpi: ['cards2d', 'kpi3d'],
    table: ['table2d'],
    map: ['map2d'],
    slides: ['slides2d'],
};

/** Reprezentacje obsługiwane przez klienta w v1.2 i widok, który waliduje/rysuje ich treść. */
export const SUPPORTED_REPRESENTATIONS = {
    chart2d: 'Chart',
    cards2d: 'InsightCards',
    table2d: 'DataTable',
    map2d: 'MapView',
    slides2d: 'Presentation',
} as const satisfies Partial<Record<Representation, ViewName>>;
export type SupportedRepresentation = keyof typeof SUPPORTED_REPRESENTATIONS;

export const isSupportedRepresentation = (r: unknown): r is SupportedRepresentation =>
    typeof r === 'string' && r in SUPPORTED_REPRESENTATIONS;

/** Obsługiwane reprezentacje per rodzaj (rodzaje bez obsługiwanej reprezentacji pominięte). */
export type CatalogKinds = { readonly [K in ItemKind]?: readonly SupportedRepresentation[] };

/**
 * Część katalogowa capabilities klienta (oś 2, ADR 0002; P1.7a): identyfikator katalogu i to, co klient FAKTYCZNIE
 * rysuje — KIND_REPRESENTATIONS ∩ SUPPORTED_REPRESENTATIONS, w kolejności KIND_REPRESENTATIONS (informacyjnej: P10
 * bierze kolejność z listy agenta). Składanie z regułami profilu: transport/capabilities.ts.
 */
export function catalogCapabilities(): { catalogId: typeof CATALOG_ID; kinds: CatalogKinds } {
    const kinds: { [K in ItemKind]?: SupportedRepresentation[] } = {};
    for (const kind of ITEM_KINDS) {
        const supported = KIND_REPRESENTATIONS[kind].filter(isSupportedRepresentation);
        if (supported.length > 0) kinds[kind] = supported;
    }
    return { catalogId: CATALOG_ID, kinds };
}

/**
 * Propsy każdego komponentu katalogu (bez `id`, `component`, `children`), deklaratywnie — źródło dla reguły profilu
 * „bindingi tylko w propsach katalogu” (Q1, egzekwuje adapter P1.6). Parytet z components.schema.json pilnuje test;
 * walidatory poniżej pozostają autorytetem kształtu wartości.
 */
export const CATALOG_PROPS = {
    Workspace: [],
    WorkspaceItem: ['kind', 'title', 'representations', 'presentation', 'priority', 'actions', 'content'],
    TaskList: ['tasks'],
    Approval: ['title', 'summary', 'items'],
} as const satisfies Record<CatalogName, readonly string[]>;

const validators: Record<CatalogName, Validator> = {
    TaskList: views.TaskList,
    Approval: views.Approval,
    Workspace: () => null, // dzieci (kolejność i członkostwo) obsługuje resolveWorkspace
    WorkspaceItem: (p) => {
        if (!oneOf(...ITEM_KINDS)(p.kind)) return issue('/kind', ITEM_KINDS.join(' | '));
        if (!isStr(p.title)) return issue('/title', 'wymagany tekst');
        if (!Array.isArray(p.representations) || p.representations.length === 0
            || !p.representations.every((r) => (REPRESENTATIONS as readonly unknown[]).includes(r))) {
            return issue('/representations', `niepusta lista z ${REPRESENTATIONS.join('|')}`);
        }
        const allowed = KIND_REPRESENTATIONS[p.kind as ItemKind];
        const bad = (p.representations as Representation[]).findIndex((r) => !allowed.includes(r));
        if (bad >= 0) return issue(`/representations/${bad}`, `niedozwolona dla rodzaju ${String(p.kind)}`);
        if (!optional(p.presentation, oneOf(...PRESENTATIONS))) return issue('/presentation', PRESENTATIONS.join(' | '));
        if (!optional(p.priority, isNum)) return issue('/priority', 'liczba');
        if (p.actions !== undefined) {
            const r = eachItem('actions', p.actions, isAction);
            if (r) return r;
        }
        if (!isObj(p.content)) return issue('/content', 'oczekiwano obiektu treści');
        return null;
    },
};

export function validateProps(type: CatalogName, props: Record<string, unknown>): ValidationIssue | null {
    return validators[type](props);
}

/** Walidacja treści elementu dla wybranej reprezentacji (ścieżka względna do `content`). */
export function validateContent(rep: SupportedRepresentation, content: Record<string, unknown>): ValidationIssue | null {
    return views[SUPPORTED_REPRESENTATIONS[rep]](content);
}
