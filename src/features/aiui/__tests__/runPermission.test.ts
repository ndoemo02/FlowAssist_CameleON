// RunPermission (P1.7a): zgoda na wywołania backendu per przebieg — reguła wspólna dla mocka i adaptera P1.6.
// Testowana bezpośrednio: implementacja transportu nie musi wołać stop() przed start(), więc reset w begin()
// jest jedyną gwarancją, że porażka nowego przebiegu nie zostawia zgody poprzedniego.

import { describe, expect, it } from 'vitest';
import { clientCapabilities } from '../transport/capabilities';
import { MOCK_SERVER_CAPABILITIES } from '../transport/mockTransport';
import { RunPermission } from '../transport/runPermission';

const request = () => ({ scenario: 's', capabilities: clientCapabilities() });
const ok = () => MOCK_SERVER_CAPABILITIES;

describe('RunPermission', () => {
    it('udana negocjacja ustanawia zgodę z TYM obiektem capabilities', () => {
        const p = new RunPermission();
        const req = request();
        const n = p.begin(1, req, ok);
        expect(n.ok).toBe(true);
        expect(p.active?.runId).toBe(1);
        expect(p.active?.capabilities).toBe(req.capabilities);
        expect(p.active?.negotiation).toBe(n);
    });

    it('nowy begin bez stop: porażka B cofa zgodę A', () => {
        const p = new RunPermission();
        p.begin(1, request(), ok);
        const n = p.begin(2, request(), () => null);
        expect(n).toEqual({ ok: false, reason: 'SERVER_CAPABILITIES_UNKNOWN' });
        expect(p.active).toBeNull();
    });

    it('wyjątek przy pobieraniu capabilities = nieznane; zgoda poprzedniego przebiegu cofnięta', () => {
        const p = new RunPermission();
        p.begin(1, request(), ok);
        const n = p.begin(2, request(), () => { throw new Error('brak agent card'); });
        expect(n).toEqual({ ok: false, reason: 'SERVER_CAPABILITIES_UNKNOWN' });
        expect(p.active).toBeNull();
    });

    it('wyjątek W TRAKCIE negocjacji (getter w capabilities) = jawna porażka INVALID, nie wyjątek; zgoda cofnięta', () => {
        const p = new RunPermission();
        p.begin(1, request(), ok);
        const hostile = { get transportProfiles(): string[] { throw new Error('boom'); } };
        let n: ReturnType<RunPermission['begin']> | undefined;
        expect(() => { n = p.begin(2, request(), () => hostile); }).not.toThrow();
        expect(n).toEqual({ ok: false, reason: 'SERVER_CAPABILITIES_INVALID' });
        expect(p.active).toBeNull();
    });

    it('udany begin B zastępuje A (runId i capabilities B)', () => {
        const p = new RunPermission();
        p.begin(1, request(), ok);
        const b = request();
        p.begin(2, b, ok);
        expect(p.active?.runId).toBe(2);
        expect(p.active?.capabilities).toBe(b.capabilities);
    });

    it('revoke cofa zgodę do następnego udanego begin', () => {
        const p = new RunPermission();
        p.begin(1, request(), ok);
        p.revoke();
        expect(p.active).toBeNull();
        p.begin(2, request(), ok);
        expect(p.active?.runId).toBe(2);
    });
});
