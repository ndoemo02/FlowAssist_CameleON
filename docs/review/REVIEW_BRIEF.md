# Review brief: CameleON (AI-to-UI), v1.3 P0

Krótka mapa dla niezależnego recenzenta (tylko odczyt). Branch `feat/aiui-prototype`, commit zawierający ten plik.
To kontekst, nie dowód poprawności: ADR-y opisują intencję i stan na dzień zapisu — weryfikuj w kodzie i testach.

## Zakres

**W zakresie:**
- `src/features/aiui/**` — kontrakt, katalog, reducer, koordynator (`store.ts`), układ, warstwy overlay, gesty, adapter sceny, transport mock, testy;
- część AI-to-UI w `src/app/page.tsx` (montaż warstw, `StudioModel` rejestrujący meshe ekranu, kamera/scroll, dev-hooki);
- `e2e/**` (Playwright + axe, tylko Chromium);
- `docs/adr/0001`–`0006`, `AGENTS.md`.

**Poza zakresem (nie analizować):**
- trasy i komponenty sprzed CameleONa: `src/app/archive/**`, `src/app/carbon`, `src/components/**` (poza tym, czego używa `page.tsx`), `safelayer/Lanyard.tsx`;
- `public/dev/*.html`, `public/cesium/`, `tactical_warsaw` i mapy Warszawy;
- wydajność assetów 3D, chroma-key avatara (odłożony), stylistyka;
- `docs/history/`, `artifacts/`, `.agent/`.

## Inwarianty kernela I1–I10 (pełne brzmienie: ADR 0001)

| | Skrót |
|---|---|
| I1 | Treść niezależna od reprezentacji: jeden widok na `id`, card ↔ focus ↔ screen bez kopiowania danych. |
| I2 | Własność: agent — treść, semantyka, reprezentacje, hint `card`/`focus`/`screen`, priorytet, akcje; klient — `x`, `y`, `scale`, `z`, `dismissed`. |
| I3 | Agent nie steruje geometrią układu (pola układu w propsach są ignorowane strukturalnie, nie odrzucane). |
| I4 | Reguły prezentacji P1–P10 (m.in. jeden element na ekranie, jeden w focusie, hint przy zmianie wartości, `dismissed` nadrzędne, P10: pierwsza obsługiwana reprezentacja). |
| I5 | Kolejność koordynatora: `parseEvent` → `reduce` → `reconcileLayout` → jeden `set()` → efekty. |
| I6 | Izolacja przebiegów (`runId`) i trwały stan terminalny; akcje tylko w `running`/`awaiting_action`. |
| I7 | Tożsamość gestu (`instance` + `rev`); gest nieaktualny lub anulowany nie zapisuje nic. |
| I8 | Arbitraż kamery (P3, okres łaski `MANUAL_GRACE_MS` = 2000 ms dla auto-poleceń agenta) i polityka ScreenAnchor (histerezy, tryb centered). |
| I9 | Zmiany formy są lokalne; akcja semantyczna niesie `itemId` + migawkę układu bez współrzędnych. |
| I10 | Zamknięty, zaufany katalog rendererów: bez HTML/JS/CSS/URL-i od agenta; nieznane → `FallbackCard` + `VALIDATION_FAILED`. |

Pliki kernela (zamrożone w v1.3): `reducer.ts`, `layout.ts`, koordynator w `store.ts`, `workspace.ts`,
`overlay/gestureLogic.ts`, `scene/measureScreen.ts`, `scene/ScreenAnchor.tsx`, `scene/anchorRegistry.ts`.
Powierzchnia protokołu (nie kernel): `contract.ts`, `catalog.ts`, `transport/types.ts`.

## Trzy osie protokołu (ADR 0002)

1. **Koperta A2UI:** `ACCEPTED_VERSIONS = {v0.9, v0.9.1}`; wychodzące zawsze `v0.9.1`; dokładnie jeden klucz payloadu (mieszane odrzucane — OBS-4).
2. **Katalog:** `flowassist/v2`, jeden identyfikator; rozszerzenie `SUPPORTED_REPRESENTATIONS` zmienia P10 → wymaga nowego katalogu lub handshake'u (P1.7).
3. **Profil transportowy:** `stage` i `narration` nieodwersjonowane; `AgentTransport` = `start/send/subscribe/stop`; obecnie wyłącznie **mock** (brak prawdziwej granicy sieciowej — ta wejdzie w P1.7 → P1.6).

## Granica zaufania AI → UI (stan dziś)

- Wejście agenta: `contract.ts: parseEvent` → walidatory `catalog.ts` → lokalne widoki `registry.tsx`. Ajv tylko w testach; autorytetem runtime są guardy.
- Dev-hooki `window.__aiui`, `__anchorRegistry` (i `__screenAnchor` z `?anchor=probe`) mają istnieć tylko poza produkcją — warto zweryfikować bramkowanie.
- Prawdziwe niezaufane dane z sieci pojawią się dopiero z adapterem AG-UI; review bezpieczeństwa tej granicy jest zaplanowany osobno (P1.7/P1.6).

## Znane i rozstrzygnięte (nie zgłaszać ponownie bez nowego dowodu)

| Id | Stan | Gdzie |
|---|---|---|
| OBS-1 | OPEN — ciche odrzucenie niezgodnej koperty; rekomendacja: odpowiedź `VALIDATION_FAILED` w adapterze P1.6 | ADR 0005 |
| OBS-2 | Zrealizowane — `stage.focus` agenta respektuje okres łaski | ADR 0005, `store.ts` |
| OBS-3 | OPEN — tolerancja `v0.9` (decyzja w protocol hardening) | ADR 0005 |
| OBS-4 | Zrealizowane — mieszane koperty odrzucane | ADR 0005, `contract.ts` |
| OBS-5/6 | FYI — przywrócenie daje `card`; pola układu od agenta ignorowane; `dismissed` od agenta → fallback całego elementu | ADR 0005 |
| E2E-1 | Zrealizowane — kontener stołu bez `preserve-3d` | ADR 0006 |
| E2E-2 | Zrealizowane — `pointercancel`/`touchcancel` nie zapisują geometrii (pinch bez testu e2e) | ADR 0006, `overlay/gestures.ts` |
| FLAKE-1 | OPEN — sporadycznie meshe ekranu nie rejestrują się w 90 s; tropy: wideo/Suspense, brak pamięci | ADR 0006 |
| FLAKE-2 | Obserwowany — podwójny tap (okno 350 ms) pod obciążeniem | ADR 0006 |
| A11Y-1..3 | Zaplanowane na P0.5 (baseline axe) | ADR 0006 |

Świadome luki testów: kierunek agent → klient dla I3 pokrywa korpus replay (P0.2), nie test jednostkowy;
`VALIDATION_FAILED` z warstwy UI widać tylko w przeglądarce; `raise`/`focus`/`toScreen` celowo bez tokenu gestu (I7).

## Weryfikacja lokalna

- `npm test` — vitest (155 testów: kontrakt, reducer, układ, gesty, replay korpusu, parytet schematów).
- `npx tsc --noEmit` — oczekiwany dokładnie 1 znany błąd (`safelayer/Lanyard.tsx`); każdy inny to regresja.
- `npm run test:e2e` — wymaga ~4 GB wolnej pamięci; timeouty przy pamięci zajętej > 80% są środowiskowe.

## Prompt startowy (do wklejenia w nowej sesji)

> Review the current `feat/aiui-prototype` branch as an independent read-only reviewer.
>
> Scope: `src/features/aiui/**`; relevant AIUI code in `src/app/page.tsx`; `e2e/**`; `docs/adr/**` related to AIUI; `AGENTS.md`. Start by reading `docs/review/REVIEW_BRIEF.md`.
>
> Do not modify files.
>
> Primary goals:
> - find correctness bugs across module boundaries,
> - verify invariants I1–I10,
> - inspect protocol parsing/validation/schema parity,
> - inspect run isolation and lifecycle semantics,
> - inspect camera arbitration and manual-grace behavior,
> - inspect gesture identity/cancellation semantics,
> - inspect AI→UI trust boundaries and unsafe rendering/input paths,
> - inspect whether tests genuinely cover the stated invariants rather than merely mirroring implementation.
>
> Treat `REVIEW_BRIEF.md`, ADR 0005 and ADR 0006 as context, not as proof that behavior is correct. Ignore legacy/archive material outside the active branch scope.
>
> Report only actionable findings. For each finding include: severity; affected invariant or contract; exact file/symbol; concrete failure scenario; why current tests do or do not catch it; minimal recommended fix direction. Do not propose broad rewrites unless a specific bug cannot be fixed locally.
>
> End with: GO / GO WITH FIXES / NO-GO; top 3 risks; missing tests; areas that appear sound.
