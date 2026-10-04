# `features/aiui` — warstwa AI-to-UI (CameleON)

Stan opisany na commicie `6e96223`. Koncepcja i stan projektu: [`AGENTS.md`](../../../AGENTS.md).

Agent nie generuje kodu ani HTML. Emituje zdarzenia w kopercie **A2UI v0.9.1**
z katalogiem **`flowassist/v2`**, a klient renderuje z nich kontrolowane widoki.
Treść jest niezależna od reprezentacji: ten sam element przechodzi między kartą,
focusem i ekranem bez kopiowania danych.

## Przepływ danych

```
transport (MockTransport)
  └─ store.dispatch(raw, runId)          # zdarzenia spoza bieżącego runu są odrzucane
       ├─ parseEvent                     # contract.ts — guardy, nieznane zdarzenie = ignoruj
       ├─ reduce                         # reducer.ts — surface'y, komponenty, data model
       ├─ reconcileLayout                # layout.ts — członkostwo, hinty agenta, auto-layout
       ├─ jeden set()                    # surface'y + layout w jednym zapisie
       └─ efekty                         # kamera (stage.focus), TTS (speak), raport błędów do agenta

komenda użytkownika → store.layoutCommand → presentationReducer → jeden set() → efekty
akcja semantyczna   → store.sendAction    → buildAction (itemId + migawka układu) → transport
```

Po stanie terminalnym runu (`done` / `error`) store ignoruje kolejne statusy i zdarzenia
tego runu; mock przy decyzji terminalnej anuluje pozostałe odpowiedzi.

## Kontrakt (`contract.ts`, `catalog.ts`)

- Agent → klient: `createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`,
  plus rozszerzenia `stage { focus, drawer }` i `narration { text, speak }`.
- Klient → agent: `action` (`version`, `timestamp`, `sourceComponentId`, `context`)
  i `error` (`VALIDATION_FAILED`).
- Surface'y: `workspace`, `tasks-drawer`, `hud`.
- Komponenty: `Workspace` (`children` = członkostwo), `WorkspaceItem` (`kind`, `title`,
  `content` przez binding JSON Pointer, `representations`, `presentation` jako hint,
  `priority`, `actions`), `TaskList`, `Approval`.
- Reprezentacje obsługiwane: `chart2d`, `cards2d`, `table2d`, `map2d`, `slides2d`.
  `liquid3d`, `ribbon3d`, `kpi3d` są w katalogu, ale bez implementacji (v1.3).
  Używana jest pierwsza obsługiwana reprezentacja z listy; brak takiej → `FallbackCard`.

## Własność układu

| Agent | Klient / użytkownik |
|-------|---------------------|
| treść, semantyka, reprezentacje, akcje semantyczne | pozycja, rozmiar, kolejność warstw (z) |
| hint prezentacji `card` / `focus` / `screen` | stan `dismissed` (tylko lokalny) |

Agent nigdy nie wysyła współrzędnych. Zmiany formy nie trafiają do agenta.

Reguły (`layout.ts`, testy w `__tests__/layout.test.ts`):

- **P1, P2:** na ekranie co najwyżej jeden element; w focusie co najwyżej jeden.
- **P3:** komenda użytkownika „na ekran” zawsze obraca kamerę na Front. Hint agenta `screen`
  robi to tylko, jeśli w ostatnich 2 s nie było ręcznego obrotu.
  `stage.focus` zmienia się razem z ruchem kamery; ręczny obrót go nie zmienia.
- **P4:** hint agenta jest stosowany tylko przy zmianie wartości (`lastHint`).
- **P5:** `dismissed` jest nadrzędne wobec hintów agenta.
- **P6:** element jest aktywny tylko wtedy, gdy jest w `Workspace.children`. Element
  „niedostarczony” daje szkielet, a „usunięty” kasuje wpis. Ponowne dodanie id tworzy nowy wpis.
- **P7:** restart i `deleteSurface('workspace')` czyszczą układ.
- **P8:** kolejność koordynatora jak wyżej.
- **P9:** auto-layout wg `priority`; karty nieprzesunięte przez użytkownika przestawiają się,
  gdy zmienia się liczba elementów.

**Tożsamość gestu:** gest zapamiętuje `instance` i `rev` wpisu. `rev` rośnie przy każdej
zmianie spoza gestu (hint agenta, przeliczenie siatki, zrzucenie z focusu lub ekranu).
Jeśli przy końcu gestu `instance` lub `rev` się nie zgadza, gest jest anulowany bez zapisu.
Logika gestów jest czysta i testowana w `overlay/gestureLogic.ts`.

## Warstwy (`overlay/`)

- `AiUiOverlay` — montuje warstwy, strefy pionowe (`zones`), tryb compact (`useCompact`);
  zawiera też część HUD: chip statusu agenta, `TasksDrawer` (surface `tasks-drawer`)
  i `NarrationCaption` (napisy Amber).
- `WorkspaceLayer` — stół roboczy na Back: karty DOM 2.5D. Każda karta subskrybuje
  własny wpis układu. W trybie compact karty są w poziomym pasku z natywnym scrollem.
- `ScreenLayer` — deep-view jednego elementu na Front, pozycjonowany przez `ScreenAnchor`.
- `HudLayer` — surface `hud`: decyzja agenta (`Approval`), widoczna niezależnie od kąta kamery.
- `OrbitSlider` — suwak 360°, jedyny subskrybent kąta kamery.
- `gestures` / `gestureLogic` — tap, double tap, drag, resize, pinch, flick w dół, klawiatura.
- `inert` — nieaktywna warstwa dostaje `inert` + `aria-hidden`, a fokus z niej jest zdejmowany.

## Adapter sceny (`scene/`)

Jedyne miejsce z referencjami Three.js; model A2UI ich nie zna.

- `anchorRegistry` — rejestr meshy ekranu (z `StudioModel`) i publikacja stanu kotwicy.
- `screenGeometry` — klaster meshy ekranu (bez rekwizytu `Object003`) i jego środek.
- `measureScreen` — rzut unii meshy, wewnętrzny prostokąt przycięty do viewportu.
- `ScreenAnchor` — bramka z histerezą: pokrycie (włączenie 0,82 / wyłączenie 0,75)
  i kąt od Frontu (włączenie 16° / wyłączenie 20°). Gdy proporcje < 1,2 albo szerokość
  < 600 px, włącza się tryb wyśrodkowany. Zapis do DOM jest imperatywny, bez stanu Reacta.
- `frontFit` — dopasowanie kadru Front: przesunięcie kamery wzdłuż osi widzenia,
  zależne od proporcji okna (referencja 1906 / 943).
- `ScreenAnchorProbe` — panel testowy spike'u (`?anchor=probe`).

Gdy ekran jest zajęty lub trwa run, `page.tsx` wycisza wideo ekranu i przyciemnia
jego materiał (kolor liniowy 0,07). Robi to też przy rejestracji meshy.

## Transport i scenariusze

- `transport/types.ts` — interfejs `AgentTransport`, statusy runu
  (`running`, `awaiting_action`, `done`, `error`).
- `transport/mockTransport.ts` — deterministyczne odtwarzanie scenariusza, mnożnik `?speed=N`.
- `scenarios/researchDemo.ts` — scenariusz `research` (`?demo=research`).
- Prawdziwy transport (SSE / inference.sh) jest odłożony.

## Testy

`npm test` uruchamia 106 testów w 10 plikach `__tests__/`: `contract`, `reducer`, `layout`,
`workspace`, `gestureLogic`, `measureScreen`, `jsonPointer`, `resolveTree`, `loop`, `scenario`.
Kontrole przeglądarkowe opisuje `AGENTS.md` → „Testowanie”.
