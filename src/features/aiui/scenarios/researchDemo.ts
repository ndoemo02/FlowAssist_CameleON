// Scenariusz demonstracyjny "research" (v1.2, katalog flowassist/v2) — nagrana oś czasu zdarzeń A2UI
// + rozszerzeń sceny. Wszystkie liczby są danymi demonstracyjnymi (spójnymi wewnętrznie).
// Plan v1.2.1 II.8: taski → stół roboczy (3 elementy) → wykres na ekran → aktualizacja danych
// na ekranie → „Pogłęb” dokłada mapę → Approval w HUD.

import type { ScenarioScript, ScenarioStep } from '../transport/mockTransport';

const V = 'v0.9.1';
const CATALOG = 'flowassist/v2';
const create = (surfaceId: string) => ({ version: V, createSurface: { surfaceId, catalogId: CATALOG } });
const remove = (surfaceId: string) => ({ version: V, deleteSurface: { surfaceId } });
const components = (surfaceId: string, list: object[]) => ({ version: V, updateComponents: { surfaceId, components: list } });
const data = (surfaceId: string, path: string, value: unknown) => ({ version: V, updateDataModel: { surfaceId, path, value } });
const say = (text: string) => ({ narration: { text, speak: true } });
const task = (path: string, value: object) => data('tasks-drawer', `/tasks/${path}`, value);

const TASKS = {
    web: { title: 'Skan źródeł rynkowych', agent: 'Scout', order: 1 },
    data: { title: 'Ekstrakcja i czyszczenie danych', agent: 'Parser', order: 2 },
    analysis: { title: 'Analiza trendów i sezonowości', agent: 'Analyst', order: 3 },
};
const t = (id: keyof typeof TASKS, status: string, progress: number, note?: string) =>
    task(id, { ...TASKS[id], status, progress, ...(note ? { note } : {}) });

// ── elementy stołu roboczego (WorkspaceItem) ────────────────────────
const CHART = { id: 'chart-q', component: 'WorkspaceItem', kind: 'chart', title: 'Zapytania o rezerwacje online · Warszawa (dane demo)',
    content: { path: '/items/chart-q' }, representations: ['chart2d', 'ribbon3d'], priority: 1 };
const KPIS = { id: 'kpis', component: 'WorkspaceItem', kind: 'kpi', title: 'Najważniejsze wskaźniki',
    content: { path: '/items/kpis' }, representations: ['cards2d', 'kpi3d'], presentation: 'card', priority: 2 };
const DISTRICTS = { id: 'districts', component: 'WorkspaceItem', kind: 'table', title: 'Dzielnice · Q4',
    content: { path: '/items/districts' }, representations: ['table2d'], presentation: 'card', priority: 3,
    actions: [{ name: 'deepen', label: 'Pogłęb analizę', variant: 'primary' }] };
const MAP = { id: 'district-map', component: 'WorkspaceItem', kind: 'map', title: 'Warszawa · zapytania Q4 (schemat)',
    content: { path: '/items/district-map' }, representations: ['map2d'], presentation: 'card', priority: 4 };

const SERIES_2026 = { label: '2026', points: [{ x: 'Q1', y: 1240 }, { x: 'Q2', y: 1510 }, { x: 'Q3', y: 1980 }, { x: 'Q4', y: 2260 }] };
const SERIES_2025 = { label: '2025', points: [{ x: 'Q1', y: 980 }, { x: 'Q2', y: 1105 }, { x: 'Q3', y: 1290 }, { x: 'Q4', y: 1410 }] };
const SERIES_PLAN = { label: 'Plan 2026', points: [{ x: 'Q1', y: 1200 }, { x: 'Q2', y: 1500 }, { x: 'Q3', y: 1800 }, { x: 'Q4', y: 2100 }] };

const timeline: ScenarioStep[] = [
    { at: 0, event: say('Jasne. Uruchamiam trzech agentów: źródła, dane i analizę trendów.') },
    { at: 0, event: create('tasks-drawer') },
    { at: 0, event: components('tasks-drawer', [{ id: 'root', component: 'TaskList', title: 'Research: rezerwacje online', tasks: { path: '/tasks' } }]) },
    { at: 0, event: data('tasks-drawer', '/tasks', {
        web: { ...TASKS.web, status: 'queued', progress: 0 },
        data: { ...TASKS.data, status: 'queued', progress: 0 },
        analysis: { ...TASKS.analysis, status: 'queued', progress: 0 },
    }) },
    { at: 0, event: { stage: { drawer: 'open' } } },

    { at: 600, event: t('web', 'running', 0.15) },
    { at: 900, event: t('data', 'running', 0.1) },
    { at: 1300, event: t('web', 'running', 0.4, '12 źródeł') },
    { at: 1600, event: t('analysis', 'running', 0.05, 'czeka na dane') },
    { at: 2000, event: t('data', 'running', 0.45) },
    { at: 2500, event: t('web', 'running', 0.75, '27 źródeł') },
    { at: 2900, event: t('analysis', 'running', 0.3) },
    { at: 3300, event: t('data', 'running', 0.8, '3 840 rekordów') },
    { at: 3700, event: t('web', 'done', 1, '31 źródeł') },
    { at: 4300, event: t('data', 'done', 1, '3 840 rekordów') },
    { at: 4700, event: t('analysis', 'running', 0.7) },
    { at: 5400, event: t('analysis', 'done', 1, 'trend + sezonowość') },
    { at: 5600, event: say('Gotowe. Rozkładam wyniki na stole.') },

    // Stół roboczy: komponenty przed danymi (szkielety), dane dochodzą później (streaming).
    { at: 6500, event: create('workspace') },
    { at: 6500, event: components('workspace', [
        { id: 'root', component: 'Workspace', children: ['chart-q', 'kpis', 'districts'] },
        { ...CHART, presentation: 'card' }, KPIS, DISTRICTS,
    ]) },
    { at: 6500, event: { stage: { focus: 'back', drawer: 'closed' } } },
    { at: 7300, event: data('workspace', '/items/chart-q', { kind: 'line', series: [SERIES_2026, SERIES_2025] }) },
    { at: 7600, event: data('workspace', '/items/kpis', { items: [
        { title: 'Wzrost r/r', value: '+60%', delta: 'up', note: 'Q4 2026 vs Q4 2025' },
        { title: 'Najsilniejszy kwartał', value: 'Q3', delta: 'up', note: '+31% kwartał do kwartału' },
        { title: 'Bez odpowiedzi po godzinach', value: '42%', note: 'utracone rezerwacje' },
    ] }) },
    { at: 8200, event: data('workspace', '/items/districts', {
        columns: ['Dzielnica', 'Zapytania Q4', 'Bez odpowiedzi', 'Zmiana r/r'],
        rows: [
            ['Śródmieście', 640, '38%', '+72%'],
            ['Mokotów', 510, '44%', '+55%'],
            ['Wola', 430, '41%', '+68%'],
            ['Praga-Płd.', 360, '47%', '+49%'],
            ['Ursynów', 320, '39%', '+51%'],
        ],
    }) },
    { at: 8600, event: say('Na stole masz wykres, wskaźniki i tabelę dzielnic. Wykres pokażę na ekranie.') },

    // Hint agenta: wykres na ekran (P3 — kamera wraca na Front, jeśli użytkownik nie obraca ręcznie).
    { at: 10500, event: components('workspace', [{ ...CHART, presentation: 'screen' }]) },
    { at: 10800, event: say('Zapytania rosły przez cały rok, najmocniej w trzecim kwartale: o 31 procent kwartał do kwartału.') },
    // Aktualizacja danych elementu, który jest na ekranie (C6): dochodzi linia planu.
    { at: 14000, event: data('workspace', '/items/chart-q/series', [SERIES_2026, SERIES_2025, SERIES_PLAN]) },
    { at: 14200, event: say('Dorzucam linię planu: trzeci i czwarty kwartał są powyżej planu.') },
    { at: 17500, event: say('Możesz przesuwać karty na stole, wysłać dowolną na ekran albo poprosić o pogłębienie tabeli.') },

    // HUD: prośba o decyzję.
    { at: 19500, event: create('hud') },
    { at: 19500, event: components('hud', [{ id: 'root', component: 'Approval', title: 'Pilotaż asystenta 24/7',
        summary: 'Wdrożenie FlowAssist na 30 dni w dwóch dzielnicach z najwyższym odsetkiem nieobsłużonych zapytań.',
        items: ['Zakres: Mokotów, Praga-Płd.', 'Czas: 30 dni', 'Miernik sukcesu: −50% nieobsłużonych zapytań po godzinach'] }]) },
    { at: 19600, event: say('Kiedy będziesz gotowy, zatwierdź albo odrzuć pilotaż.') },
];

const deepen: ScenarioStep[] = [
    { at: 0, event: say('Dokładam mapę dzielnic.') },
    { at: 0, event: data('workspace', '/items/district-map', { points: [
        { label: 'Śródmieście', x: 0.5, y: 0.45 },
        { label: 'Mokotów', x: 0.5, y: 0.66 },
        { label: 'Wola', x: 0.36, y: 0.42 },
        { label: 'Praga-Płd.', x: 0.66, y: 0.52 },
        { label: 'Ursynów', x: 0.47, y: 0.86 },
    ] }) },
    { at: 300, event: components('workspace', [
        { id: 'root', component: 'Workspace', children: ['chart-q', 'kpis', 'districts', 'district-map'] },
        MAP,
        // Zmiana hintu KPI — jeśli użytkownik ukrył KPI, zostanie zignorowana (P5).
        { ...KPIS, presentation: 'focus' },
    ]) },
    { at: 1200, event: say('Najwięcej nieobsłużonych zapytań jest na Pradze-Południe i na Mokotowie.') },
];

const finish = (text: string): ScenarioStep[] => [
    { at: 0, event: say(text) },
    { at: 0, event: remove('hud') },
    { at: 1600, event: { stage: { focus: 'front' } } },
];

export const researchDemo: ScenarioScript = {
    id: 'research',
    timeline,
    responses: {
        deepen: { steps: deepen },
        approve: { terminal: true, steps: finish('Zatwierdzone. Zapisuję decyzję i wracam do rozmowy.') },
        reject: { terminal: true, steps: finish('Rozumiem, odrzucone. Mogę przygotować inny wariant, kiedy zechcesz.') },
    },
};
