import type { ScenarioScript } from '../transport/mockTransport';
import { researchDemo } from './researchDemo';

export const SCENARIOS: Record<string, ScenarioScript> = {
    [researchDemo.id]: researchDemo,
};
