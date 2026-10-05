# Review brief: CameleON (AI-to-UI), v1.3 P0

Krótka mapa dla niezależnego recenzenta (tylko odczyt). Branch `feat/aiui-prototype`, commit zawierający ten plik.
To kontekst, nie dowód poprawności: ADR-y opisują intencję i stan na dzień zapisu — weryfikuj w kodzie i testach.

> **Status (2026-10-05):** pełny review `61209b8` wykonany (Opus → Astra: GO WITH FIXES). Poprawki są na branchu do
> `1f12885`; weryfikacja Astry runda 1 (2 ISSUE) zamknięta do `9d3e901`, runda 2 (2 ISSUE) do `e820e0d`,
> runda 3 (1 ISSUE) do `84096ff` (kod). Weryfikacja bez ponownego pełnego audytu:
> [`VERIFICATION_BRIEF.md`](VERIFICATION_BRIEF.md) (rundy 2–4 na końcu).

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
- Dev-hooki `window.__aiui`, `__anchorRegistry` i `__screenAnchor` (`?anchor=probe`) istnieją tylko poza produkcją (R#7: sonda bramkowana od `544fb31`; w bundlu `next build` brak kodu sondy).
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
| R#1 | Zrealizowane `9367eb5` — wrogie dane agenta (`ref`, `null` w taskach, skrajne liczby) nie wychodzą poza kartę / węzeł; lokalne boundary z odzyskaniem | `viewProps.ts`, `components/RenderGuard.tsx` |
| R#2 | Zrealizowane `5d46bc6` — callback `canceled` nie zapisuje; klik w `[data-nodrag]` nie jest połykany | `overlay/gestures.ts` |
| R#3 | Zrealizowane `39af130` (kernel, zgoda właściciela) — siatka P9 przy zmianie zbioru id | ADR 0001, `layout.ts` |
| R#4 | Zrealizowane `0aad0f3` — kanoniczne indeksy tablic w JSON Pointer, odrzucenie bez zmiany dokumentu | ADR 0002, `jsonPointer.ts` |
| R#5 | Zrealizowane `2f0dfcc` — `VALIDATION_FAILED` raz na wystąpienie, z pochodzeniem przebiegu; reszta = FU-1 | `validationReporting.ts`, AGENTS.md |
| R#6 | Odłożone do P1.6 (FU-2) — `dispatch(raw)` bez `runId` | AGENTS.md |
| R#7 | Zrealizowane `544fb31` — `?anchor=probe` tylko poza produkcją | `scene/ScreenAnchorProbe.tsx` |
| NEW-1 | Zrealizowane `1f12885` — tap na przycisku karty nie liczy się do podwójnego tapu („+ +” ≠ ekran) | `overlay/gestures.ts` |
| V-R#1 | Zrealizowane `e20be49` — regresja z `2f0dfcc`: brak głębokiej serializacji propsów przed boundary (płytki podpis, przygotowanie widoku pod boundary) | `SurfaceRenderer.tsx`, `viewProps.ts` |
| V-R#5 | Zrealizowane `9d3e901` — wystąpienie kończy się dopiero odzyskaniem (walidacja `ready` lub udany render po ponowieniu) | `validationReporting.ts`, `RenderGuard.tsx`, ADR 0003 |
| V2-R#5a | Zrealizowane `df55d09` — udany render po remoncie (nowa instancja boundary) też kończy wystąpienie błędu renderu | `RenderGuard.tsx`, `validationReporting.ts` |
| V2-R#5b | Zrealizowane `e820e0d` — obecność węzła w drzewie slotu = członkostwo w grafie definicji; pending rodzica nie kończy wystąpień dzieci | `validationReporting.ts` |
| V3-R#5 | Zrealizowane `84096ff` — odzyskanie i deduplikacja błędu renderu per wariant renderowania (`card` / `screen` / `slot`) przy wspólnym wystąpieniu; udany render jednego wariantu nie zamyka błędu innego | `validationReporting.ts`, ADR 0003 |
| FU-1..3 | OPEN — przed P1.6 (FU-3: głęboka ścieżka `updateDataModel` przepełnia stos w `dispatch`; kryterium akceptacji w AGENTS.md) | AGENTS.md |

Świadome luki testów: kierunek agent → klient dla I3 pokrywa korpus replay (P0.2), nie test jednostkowy;
`raise`/`focus`/`toScreen` celowo bez tokenu gestu (I7). `VALIDATION_FAILED` z warstwy UI pokrywają od R#5 testy jsdom
(`validationReporting.test.tsx`); replay korpusu go nie widzi (raportuje warstwa UI, nie koordynator).

## Weryfikacja lokalna

- `npm test` — vitest (226 testów na `84096ff`: kontrakt, reducer, układ, gesty, replay korpusu, parytet schematów,
  render DOM w jsdom — `*.test.tsx`).
- `npx tsc --noEmit` — oczekiwany dokładnie 1 znany błąd (`safelayer/Lanyard.tsx`); każdy inny to regresja.
- `npm run test:e2e` — wymaga ~4 GB wolnej pamięci; timeouty przy pamięci zajętej > 80% są środowiskowe.
- `npx next build` — nie uruchamiać, gdy działa `next dev` na tym samym katalogu: build nadpisuje `.next` i serwer dev
  (np. e2e na porcie 3100) zwraca 404 na chunki — po buildzie zrestartować serwer dev.

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
