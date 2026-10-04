// Katalog flowassist/v1: czyste walidatory propsów (bez Reacta), używane przez resolveTree.
// Każdy walidator zwraca null albo { path, message } — path względny do propsów komponentu.

import type { CatalogName } from './contract';

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

const validators: Record<CatalogName, Validator> = {
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
    Stack: (p) => {
        if (!optional(p.gap, isNum)) return issue('/gap', 'liczba');
        if (!optional(p.direction, oneOf('column', 'row'))) return issue('/direction', 'column | row');
        return null;
    },
    ActionBar: (p) =>
        eachItem('actions', p.actions, (a) => {
            if (!isStr(a.name)) return issue('/name', 'wymagany tekst');
            if (!isStr(a.label)) return issue('/label', 'wymagany tekst');
            if (!optional(a.variant, isVariant)) return issue('/variant', 'primary | secondary');
            return null;
        }, 1),
};

export function validateProps(type: CatalogName, props: Record<string, unknown>): ValidationIssue | null {
    return validators[type](props);
}
