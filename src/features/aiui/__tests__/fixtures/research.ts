// Pełny scenariusz `research` jako fixture korpusu — generowany z researchDemo.ts (bez duplikowania danych).
// Kolejność zdarzeń = kolejność `at` (stabilnie), statusy jak w MockTransport, akcje jak w UI.

import { researchDemo } from '../../scenarios/researchDemo';
import type { ScenarioStep } from '../../transport/mockTransport';
import type { Fixture, Step } from './replay';

const events = (steps: ScenarioStep[]): Step[] =>
    steps.map((s, i) => ({ s, i })).sort((a, b) => a.s.at - b.s.at || a.i - b.i).map(({ s }) => ({ event: s.event }));

export const researchFixture: Fixture = {
    id: '00-research-full',
    description: 'Pełny scenariusz research: oś czasu → awaiting_action → „Pogłęb” na tabeli dzielnic → awaiting_action → „Zatwierdź” → done.',
    steps: [
        { start: 'research' },
        ...events(researchDemo.timeline),
        { status: 'awaiting_action' },
        { settleCamera: true },
        { checkpoint: 'timeline-done' },
        { command: { type: 'toScreen', id: 'districts' } },
        { action: { name: 'deepen', surfaceId: 'workspace', source: 'districts', context: { itemId: 'districts' } } },
        { status: 'running' },
        ...events(researchDemo.responses.deepen.steps),
        { status: 'awaiting_action' },
        { checkpoint: 'deepened' },
        { action: { name: 'approve', surfaceId: 'hud', source: 'root' } },
        { status: 'running' },
        ...events(researchDemo.responses.approve.steps),
        { status: 'done' },
        { settleCamera: true },
        { checkpoint: 'approved' },
    ],
};
