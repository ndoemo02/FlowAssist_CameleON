// Scenariusz demonstracyjny "research" — nagrana oś czasu zdarzeń A2UI + rozszerzeń sceny.
// Wszystkie liczby są danymi demonstracyjnymi (spójnymi wewnętrznie), nie realnym badaniem.

import type { ScenarioScript, ScenarioStep } from '../transport/mockTransport';

const V = 'v0.9.1';
const create = (surfaceId: string) => ({ version: V, createSurface: { surfaceId, catalogId: 'flowassist/v1' } });
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

const NEXT_ACTIONS = [
    { name: 'deepen', label: 'Pogłęb analizę' },
    { name: 'open_presentation', label: 'Pokaż jako prezentację' },
    { name: 'open_approval', label: 'Wyślij do akceptacji', variant: 'primary' },
    { name: 'back', label: 'Wróć do rozmowy', variant: 'secondary' },
];

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
    { at: 5600, event: say('Gotowe. Przechodzę do wyników.') },

    // Komponenty trafiają na canvas przed danymi — dane dochodzą sekundę później (streaming).
    { at: 6500, event: create('back-canvas') },
    { at: 6500, event: components('back-canvas', [
        { id: 'root', component: 'Stack', children: ['chart', 'cards', 'next'] },
        { id: 'chart', component: 'Chart', kind: 'line', title: 'Zapytania o rezerwacje online · Warszawa (dane demo)', series: { path: '/chart/series' } },
        { id: 'cards', component: 'InsightCards', items: { path: '/insights' } },
        { id: 'next', component: 'ActionBar', actions: NEXT_ACTIONS },
    ]) },
    { at: 6500, event: { stage: { focus: 'back', drawer: 'closed' } } },
    { at: 7500, event: data('back-canvas', '/chart/series', [
        { label: '2026', points: [{ x: 'Q1', y: 1240 }, { x: 'Q2', y: 1510 }, { x: 'Q3', y: 1980 }, { x: 'Q4', y: 2260 }] },
        { label: '2025', points: [{ x: 'Q1', y: 980 }, { x: 'Q2', y: 1105 }, { x: 'Q3', y: 1290 }, { x: 'Q4', y: 1410 }] },
    ]) },
    { at: 7500, event: data('back-canvas', '/insights', [
        { title: 'Wzrost r/r', value: '+60%', delta: 'up', note: 'Q4 2026 vs Q4 2025' },
        { title: 'Najsilniejszy kwartał', value: 'Q3', delta: 'up', note: '+31% kwartał do kwartału' },
        { title: 'Bez odpowiedzi po godzinach', value: '42%', note: 'utracone rezerwacje' },
    ]) },
    { at: 8200, event: say('Zapytania o rezerwacje online rosły przez cały rok, najmocniej w trzecim kwartale: o 31 procent kwartał do kwartału.') },
    { at: 11800, event: say('Największy potencjał jest po godzinach pracy: 42 procent zapytań zostaje bez odpowiedzi. Co robimy dalej?') },
];

const deepen: ScenarioStep[] = [
    { at: 0, event: say('Rozbijam wynik na dzielnice.') },
    { at: 0, event: data('back-canvas', '/table', {
        columns: ['Dzielnica', 'Zapytania Q4', 'Bez odpowiedzi', 'Zmiana r/r'],
        rows: [
            ['Śródmieście', 640, '38%', '+72%'],
            ['Mokotów', 510, '44%', '+55%'],
            ['Wola', 430, '41%', '+68%'],
            ['Praga-Płd.', 360, '47%', '+49%'],
            ['Ursynów', 320, '39%', '+51%'],
        ],
    }) },
    { at: 0, event: data('back-canvas', '/map', [
        { label: 'Śródmieście', x: 0.5, y: 0.45 },
        { label: 'Mokotów', x: 0.5, y: 0.66 },
        { label: 'Wola', x: 0.36, y: 0.42 },
        { label: 'Praga-Płd.', x: 0.66, y: 0.52 },
        { label: 'Ursynów', x: 0.47, y: 0.86 },
    ]) },
    { at: 400, event: components('back-canvas', [
        { id: 'root', component: 'Stack', children: ['table', 'map', 'next-deep'] },
        { id: 'table', component: 'DataTable', columns: { path: '/table/columns' }, rows: { path: '/table/rows' } },
        { id: 'map', component: 'MapView', title: 'Warszawa · zapytania Q4 (schemat)', points: { path: '/map' } },
        { id: 'next-deep', component: 'ActionBar', actions: NEXT_ACTIONS.filter((a) => a.name !== 'deepen') },
    ]) },
    { at: 1200, event: say('Najwięcej nieobsłużonych zapytań jest na Pradze-Południe i na Mokotowie.') },
];

const openPresentation: ScenarioStep[] = [
    { at: 0, event: data('back-canvas', '/slides', [
        { title: 'Popyt rośnie', bullets: ['+60% zapytań r/r (Q4)', 'Najmocniejszy Q3: +31% q/q', 'Dane demonstracyjne'] },
        { title: 'Gdzie tracimy klientów', bullets: ['42% zapytań po godzinach bez odpowiedzi', 'Najwięcej: Praga-Płd. (47%) i Mokotów (44%)'] },
        { title: 'Rekomendacja', bullets: ['Asystent głosowy 24/7 do rezerwacji', 'Pilotaż: Mokotów i Praga-Płd.', 'Miernik: odsetek obsłużonych zapytań'] },
    ]) },
    { at: 300, event: components('back-canvas', [
        { id: 'root', component: 'Stack', children: ['deck', 'next-deck'] },
        { id: 'deck', component: 'Presentation', slides: { path: '/slides' } },
        { id: 'next-deck', component: 'ActionBar', actions: NEXT_ACTIONS.filter((a) => a.name === 'open_approval' || a.name === 'back') },
    ]) },
    { at: 300, event: say('Przygotowałam trzy slajdy z najważniejszymi wnioskami.') },
];

const openApproval: ScenarioStep[] = [
    { at: 300, event: components('back-canvas', [
        { id: 'root', component: 'Approval', title: 'Pilotaż asystenta 24/7',
          summary: 'Wdrożenie FlowAssist na 30 dni w dwóch dzielnicach z najwyższym odsetkiem nieobsłużonych zapytań.',
          items: ['Zakres: Mokotów, Praga-Płd.', 'Czas: 30 dni', 'Miernik sukcesu: −50% nieobsłużonych zapytań po godzinach'] },
    ]) },
    { at: 300, event: say('Podsumowanie czeka na Twoją decyzję.') },
];

const finish = (text: string): ScenarioStep[] => [
    { at: 0, event: say(text) },
    { at: 1600, event: { stage: { focus: 'front' } } },
];

export const researchDemo: ScenarioScript = {
    id: 'research',
    timeline,
    responses: {
        deepen: { steps: deepen },
        open_presentation: { steps: openPresentation },
        open_approval: { steps: openApproval },
        approve: { terminal: true, steps: finish('Zatwierdzone. Zapisuję decyzję i wracam do rozmowy.') },
        reject: { terminal: true, steps: finish('Rozumiem, odrzucone. Mogę przygotować inny wariant, kiedy zechcesz.') },
        back: { terminal: true, steps: finish('Wracam do rozmowy.') },
    },
};
