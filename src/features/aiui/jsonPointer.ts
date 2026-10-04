// Podzbiór RFC 6901 (JSON Pointer) używany przez A2UI do adresowania data modelu.
// setAt jest niemutowalne i kopiuje tylko gałąź na ścieżce (structural sharing).

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
        cur = (cur as Record<string, unknown>)[seg];
    }
    return cur;
}

export function setAt(doc: unknown, path: string, value: unknown): unknown {
    const segs = parsePointer(path);
    if (segs.length === 0) return value === undefined ? {} : value;
    return setIn(doc, segs, value);
}

function setIn(node: unknown, segs: string[], value: unknown): unknown {
    const [head, ...rest] = segs;
    const isArray = Array.isArray(node);
    const copy: Record<string, unknown> | unknown[] = isArray
        ? [...(node as unknown[])]
        : { ...(node !== null && typeof node === 'object' ? (node as Record<string, unknown>) : {}) };
    const container = copy as Record<string, unknown>;

    if (rest.length === 0) {
        if (value === undefined) {
            if (isArray) (copy as unknown[]).splice(Number(head), 1);
            else delete container[head];
        } else {
            container[head] = value;
        }
        return copy;
    }
    container[head] = setIn(container[head], rest, value);
    return copy;
}
