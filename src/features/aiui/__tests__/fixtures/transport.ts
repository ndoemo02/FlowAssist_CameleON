// Atrapa transportu dla testów store'u i renderera (bez osi czasu i bez negocjacji):
// nadpisz tylko potrzebne metody. Jedno miejsce do aktualizacji przy addytywnych zmianach AgentTransport.

import type { AgentTransport } from '../../transport/types';

export const fakeTransport = (overrides: Partial<AgentTransport> = {}): AgentTransport => ({
    start() {},
    send() {},
    subscribe: () => () => {},
    stop() {},
    ...overrides,
});
