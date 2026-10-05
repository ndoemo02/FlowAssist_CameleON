// Podzbiór RFC 6901 (JSON Pointer) używany przez A2UI do adresowania data modelu.
// setAt jest niemutowalne i kopiuje tylko gałąź na ścieżce (structural sharing).
//
// Kontrakt (review #4, ADR 0002): segment adresujący tablicę musi być kanonicznym indeksem
// (`0` albo cyfra 1–9 i dalsze cyfry). `-`, indeksy ujemne i niekanoniczne są odrzucane — setAt zwraca
// wtedy ten sam dokument (bez semantyki append dla `-`). Odczyt i zapis dotyczą tylko własnych właściwości.

const CANONICAL_INDEX = /^(0|[1-9][0-9]*)$/;

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export function parsePointer(path: string): string[] {
    if (path === '' || path === '/') return [];
    return path
        .replace(/^\//, '')
        .split('/')
        .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'));
}

export function getAt(doc: unknown, path: string): unknown {
    let cur: unknown = doc;
    for (const seg of parsePointer(path)) {
        if (cur === null || typeof cur !== 'object') return undefined;
        if (Array.isArray(cur) ? !CANONICAL_INDEX.test(seg) : !hasOwn(cur, seg)) return undefined;
        cur = (cur as Record<string, unknown>)[seg];
    }
    return cur;
}

const REJECTED = Symbol('rejected');

export function setAt(doc: unknown, path: string, value: unknown): unknown {
    const segs = parsePointer(path);
    if (segs.length === 0) return value === undefined ? {} : value;
    const next = setIn(doc, segs, value);
    return next === REJECTED ? doc : next;
}

function setIn(node: unknown, segs: string[], value: unknown): unknown {
    const [head, ...rest] = segs;
    const isArray = Array.isArray(node);
    if (isArray && !CANONICAL_INDEX.test(head)) return REJECTED;
    const copy: Record<string, unknown> | unknown[] = isArray
        ? [...(node as unknown[])]
        : { ...(node !== null && typeof node === 'object' ? (node as Record<string, unknown>) : {}) };
    const container = copy as Record<string, unknown>;
    // defineProperty: klucz "__proto__" ma być własną właściwością danych, nie zmianą prototypu kopii
    const put = (v: unknown) => Object.defineProperty(container, head, { value: v, writable: true, enumerable: true, configurable: true });

    if (rest.length === 0) {
        if (value === undefined) {
            if (isArray) (copy as unknown[]).splice(Number(head), 1);
            else delete container[head];
        } else {
            put(value);
        }
        return copy;
    }
    const child = setIn(hasOwn(container, head) ? container[head] : undefined, rest, value);
    if (child === REJECTED) return REJECTED;
    put(child);
    return copy;
}
