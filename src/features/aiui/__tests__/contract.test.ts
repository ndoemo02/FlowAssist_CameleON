import { describe, expect, it } from 'vitest';
import { buildAction, buildError, parseEvent } from '../contract';

const V = 'v0.9.1';

describe('parseEvent: komunikaty A2UI', () => {
    it('akceptuje createSurface z katalogiem flowassist/v1', () => {
        const ev = parseEvent({ version: V, createSurface: { surfaceId: 'back-canvas', catalogId: 'flowassist/v1' } });
        expect(ev).not.toBeNull();
    });

    it('odrzuca obcy katalog, nieznany surface i złą wersję', () => {
        expect(parseEvent({ version: V, createSurface: { surfaceId: 'back-canvas', catalogId: 'other/v1' } })).toBeNull();
        expect(parseEvent({ version: V, createSurface: { surfaceId: 'nowhere', catalogId: 'flowassist/v1' } })).toBeNull();
        expect(parseEvent({ version: 'v0.8', createSurface: { surfaceId: 'back-canvas', catalogId: 'flowassist/v1' } })).toBeNull();
    });

    it('akceptuje updateComponents i odrzuca komponent bez id lub nazwy', () => {
        const ok = { version: V, updateComponents: { surfaceId: 'back-canvas', components: [{ id: 'root', component: 'Stack', children: [] }] } };
        expect(parseEvent(ok)).not.toBeNull();
        expect(parseEvent({ version: V, updateComponents: { surfaceId: 'back-canvas', components: [{ component: 'Stack' }] } })).toBeNull();
        expect(parseEvent({ version: V, updateComponents: { surfaceId: 'back-canvas', components: [{ id: 'x' }] } })).toBeNull();
    });

    it('akceptuje updateDataModel z JSON Pointerem lub bez ścieżki', () => {
        expect(parseEvent({ version: V, updateDataModel: { surfaceId: 'tasks-drawer', path: '/tasks/web', value: {} } })).not.toBeNull();
        expect(parseEvent({ version: V, updateDataModel: { surfaceId: 'tasks-drawer', value: {} } })).not.toBeNull();
        expect(parseEvent({ version: V, updateDataModel: { surfaceId: 'tasks-drawer', path: 'tasks' } })).toBeNull();
    });

    it('akceptuje deleteSurface', () => {
        expect(parseEvent({ version: V, deleteSurface: { surfaceId: 'tasks-drawer' } })).not.toBeNull();
    });

    it('odrzuca komunikat z dwoma typami naraz', () => {
        expect(parseEvent({
            version: V,
            deleteSurface: { surfaceId: 'tasks-drawer' },
            createSurface: { surfaceId: 'back-canvas', catalogId: 'flowassist/v1' },
        })).toBeNull();
    });
});

describe('parseEvent: rozszerzenia FlowAssist', () => {
    it('akceptuje stage z semantycznym fokusem i drawerem', () => {
        expect(parseEvent({ stage: { focus: 'back', drawer: 'closed' } })).not.toBeNull();
        expect(parseEvent({ stage: { focus: 'left' } })).toBeNull();
        expect(parseEvent({ stage: { x: 1, y: 2 } })).toBeNull();
    });

    it('akceptuje narration z tekstem lub null', () => {
        expect(parseEvent({ narration: { text: 'Cześć', speak: true } })).not.toBeNull();
        expect(parseEvent({ narration: { text: null } })).not.toBeNull();
        expect(parseEvent({ narration: { text: 42 } })).toBeNull();
    });

    it('odrzuca śmieci', () => {
        for (const raw of [null, 1, 'x', [], {}, { foo: 1 }]) expect(parseEvent(raw)).toBeNull();
    });
});

describe('koperty klient → agent (A2UI v0.9.1)', () => {
    it('buildAction zawiera version, timestamp ISO i sourceComponentId', () => {
        const msg = buildAction('open_approval', 'back-canvas', 'next', { a: 1 }, new Date('2026-10-04T10:00:00Z'));
        expect(msg).toEqual({
            version: V,
            action: {
                name: 'open_approval',
                surfaceId: 'back-canvas',
                sourceComponentId: 'next',
                timestamp: '2026-10-04T10:00:00.000Z',
                context: { a: 1 },
            },
        });
    });

    it('buildError tworzy VALIDATION_FAILED ze ścieżką', () => {
        expect(buildError({ code: 'VALIDATION_FAILED', surfaceId: 'back-canvas', path: '/components/chart/series', message: 'x' }))
            .toEqual({ version: V, error: { code: 'VALIDATION_FAILED', surfaceId: 'back-canvas', path: '/components/chart/series', message: 'x' } });
    });
});
