// Dokument profilu flowassist-transport/1 jako dane testowe: bloki JSON i blok reguł maszynowych (§15).
// Blok reguł jest normatywnym, ręcznie edytowanym literałem profilu (nie snapshotem — brak „-u”), więc służy też
// jako strażnik dryfu PROFILE_RULES.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// CRLF → LF: kopia robocza na Windows może mieć CRLF (core.autocrlf)
export const PROFILE_DOC = readFileSync(
    fileURLToPath(new URL('../../../../../docs/protocol/flowassist-transport-1.md', import.meta.url)), 'utf-8',
).replace(/\r\n/g, '\n');

/** Treść bloków ```json (także wciętych, np. przykład w elemencie listy). */
export const PROFILE_DOC_JSON_BLOCKS: string[] =
    Array.from(PROFILE_DOC.matchAll(/^[ \t]*```json\n([\s\S]*?)\n[ \t]*```/gm), (m) => m[1]); // bez spread: target tsconfig

const rulesBlock = PROFILE_DOC.match(/<!-- profile-rules:begin -->\s*```json\n([\s\S]*?)\n```\s*<!-- profile-rules:end -->/);
if (!rulesBlock) throw new Error('Brak bloku reguł maszynowych (<!-- profile-rules:begin/end -->) w dokumencie profilu');

/** Blok reguł maszynowych §15 (normatywne stałe profilu). */
export const PROFILE_DOC_RULES = JSON.parse(rulesBlock[1]);

/** Wiersze tabeli markdown z danej sekcji (pierwsza kolumna, bez nagłówka i separatora). */
export function tableFirstColumn(sectionHeading: string): string[] {
    const start = PROFILE_DOC.indexOf(sectionHeading);
    if (start < 0) throw new Error(`Brak sekcji „${sectionHeading}” w dokumencie profilu`);
    const lines = PROFILE_DOC.slice(start).split('\n');
    const rows: string[] = [];
    let inTable = false;
    for (const line of lines.slice(1)) {
        const t = line.trim();
        if (t.startsWith('|')) { inTable = true; rows.push(t); continue; }
        if (inTable) break;
    }
    return rows.slice(2).map((r) => r.split('|')[1].trim());
}
