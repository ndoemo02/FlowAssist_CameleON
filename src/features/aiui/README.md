# `features/aiui` — warstwa AI-to-UI (CameleON)

Stan opisany na commicie `6e96223`. Koncepcja i stan projektu: [`AGENTS.md`](../../../AGENTS.md).

Agent nie generuje kodu ani HTML. Emituje zdarzenia w kopercie **A2UI v0.9.1**
z katalogiem **`flowassist/v2`**, a klient renderuje z nich kontrolowane widoki.
Treść jest niezależna od reprezentacji: ten sam element przechodzi między kartą,
focusem i ekranem bez kopiowania danych.

## Przepływ danych

```
transport (MockTransport)
  └─ store.transportDispatch(raw, runId) # runId wymagany; zdarzenia spoza bieżącego runu są odrzucane
                                         # (devDispatch(raw) — tylko dev-hook / testy, bez izolacji runów)
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
- `LiveRegions` + `announcer` + `userCommand` — regiony ogłoszeń dla czytników ekranu (P0.5), zawsze zamontowane,
  zmienia się tylko treść; ogłoszenia nigdy nie przenoszą fokusu:
  - **narracja agenta** (`data-region="narration"`, `role="status"`): jedyny region tekstu `store.narration.text`;
    wizualny napis `NarrationCaption` jest `aria-hidden`;
  - **lokalny status** (`data-region="status"`, polite): komunikaty klienta, osobno od narracji — potwierdzenia
    gestów użytkownika (`userLayoutCommand`: ukryto, przywrócono, na ekranie, na stole), start i koniec przebiegu,
    nowy element `ready` (raz w przebiegu), element nie do wyświetlenia (`fallback`, raz do naprawy), decyzja w HUD;
  - **alert** (`data-region="alert"`, `role="alert"`): tylko błąd blokujący (przebieg w `error`).

  Komendy układu z UI idą przez `userLayoutCommand` (opakowanie `store.layoutCommand`, kernel bez zmian);
  zmiany od agenta (hinty) nie są potwierdzane lokalnie — opisuje je narracja. Komunikaty z jednego kroku JS (paczka
  zdarzeń, np. dane + koniec przebiegu) są łączone w jeden, żeby się nie nadpisały. Testy: `__tests__/announcements.test.tsx`.
- **Fokus i klawiatura (P0.5)** — fokus przenosi wyłącznie działanie użytkownika, nigdy dane od agenta;
  Escape cofa o jeden poziom:
  - karta: Escape z wnętrza (treść, przyciski) wraca na kartę, na samej karcie zdejmuje focus; otwarte menu akcji
    ma pierwszeństwo — Escape je zamyka i oddaje fokus „⋯” (albo karcie, gdy otwarto je prawym klikiem);
  - przewijana treść karty (compact, karta z focusem) i panelu ekranu: `tabIndex=0`, `role="group"`, „Treść: <tytuł>”;
  - panel ekranu: „⋯” (nazwa „Akcje”, `aria-expanded`), Escape zamyka menu i oddaje fokus „⋯”;
  - decyzja w HUD: jeden stały landmark „Decyzja” (bez remountu przy rozwinięciu); pasek `aria-expanded`;
    otwarcie przenosi fokus na „Zwiń” (pierwszy przycisk panelu, nie „Zatwierdź”); Escape / „Zwiń” wracają na pasek;
  - szuflada tasków: przycisk `aria-expanded`, lista „Lista tasków” osiągalna z klawiatury, Escape zamyka i oddaje
    fokus przyciskowi; na compact zamknięta szuflada (tylko przesunięta) jest `inert`;
  - `focusTarget.canTakeFocus`: fokus wraca tylko do elementu w DOM i poza warstwą nieaktywną;
  - zamknięcie menu (Escape, kliknięcie akcji, zjechanie myszą z fokusem w menu) oddaje fokus „⋯”;
  - ratunek fokusu (`useFocusRescue`): kontener aktywnej warstwy → panel ekranu → pasek decyzji → w ostateczności
    korzeń overlayu (`role="group"` „Asystent CameleON”, `tabIndex=-1`); nigdy nie zabiera fokusu żyjącego gdzie indziej;
  - „Na ekran” od UŻYTKOWNIKA z fokusem w overlayu (LOW-1): intencja fokusu na ekranie (8 s) — ratunek nie idzie na
    pasek decyzji, a aktywny panel ekranu sam przejmuje fokus; komendy i hinty agenta intencji nie tworzą.

  Testy: `__tests__/focus.test.tsx`.

## Ograniczony ruch (`motion.ts`, P0.6)

Przy `prefers-reduced-motion: reduce` każda gałąź kamery osiąga stan końcowy bez wygładzania, a overlay ogranicza ruch:

- **kąt orbity:** `page.tsx` woła `tickCamera(cameraTickSeconds(delta, reduced))` — przy ograniczonym ruchu cały
  czas tweenu (`TWEEN_SECONDS`), więc tween kończy się w jednej klatce; kąt i źródło `director` zachowują semantykę P3,
  kernel (`store.ts`) bez zmian;
- **cinematic i orbita:** współczynniki `1 - e^(-delta·k)` (pozycja, target, FOV; dojazd z „close” do orbity) przez
  `smoothing(delta, k, reduced)` → 1; dojazd intro → wide (`entryProgress`) od razu 1. Mapowanie scrolla na kadr
  „close” zostaje (steruje nim użytkownik);
- **Framer Motion:** `MotionConfig reducedMotion="user"` w `AiUiOverlay` — Framer wycisza wtedy tylko ruch pozycyjny
  (transformy i `width`/`height`/`top`/`left`); przejścia `opacity` (pojawianie się napisów, HUD, staggery) i rysowanie
  linii wykresu (`pathLength`, `Chart.tsx`) nadal się animują — zgodnie z planem („tylko komponenty Framer”); pełne
  wyłączenie to osobna decyzja;
- **CSS:** `globals.css` — w `[data-aiui-overlay]` przejścia i animacje CSS (opacity warstw, szuflada, pulsowanie) bez ruchu.

Na żywo (zmiana preferencji w trakcie działania): kamera (`useReducedMotionRef`, odczyt w pętli klatek bez re-renderów)
i CSS (media query). Framer ustala preferencję przy montażu elementu, więc obejmuje tylko elementy zamontowane później.
Poza overlayem (decyzja właściciela 2026-10-06): galaktyka w tle (`StarField`, `motion.ts: galaxyPose`) przy
ograniczonym ruchu stoi — bez obrotu i „oddychania” skali. Napis z cząstek (`SwarmLogo`), intro powitalne,
„Scroll to Explore” i inne elementy strony — później.
Testy: `__tests__/motion.test.ts` (współczynniki, tween w jednej klatce ze źródłem `director`, kontrakt `tickCamera`
bez tweenu), e2e `motion.spec.ts` z `reducedMotion: 'reduce'`: brak kątów pośrednich i rzeczywista aktywacja
`ScreenAnchor`; kadr (pozycja, target, FOV — dev-hook `window.__cameraTrace` w `page.tsx`) skacze zamiast dojeżdżać
po Back → Front, po powrocie z „close” i po intro; okres łaski P3 przy ograniczonym ruchu (kamera i `stage.focus`
bez zmian). Test kontrolny bez ograniczonego ruchu dowodzi, że pomiar wykrywa wygładzanie.

## Adapter sceny (`scene/`)

Jedyne miejsce z referencjami Three.js; model A2UI ich nie zna.

- `anchorRegistry` — rejestr meshy ekranu (z komponentu `StudioModel` zdefiniowanego w `src/app/page.tsx`) i publikacja stanu kotwicy.
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
  (`running`, `awaiting_action`, `done`, `error`), `StartRequest` (z wymaganymi `capabilities`), `BackendCall`.
- `transport/mockTransport.ts` — deterministyczne odtwarzanie scenariusza, mnożnik `?speed=N`; egzekwuje negocjację
  i zgodę na wysyłkę tak samo jak przyszły adapter (`MOCK_SERVER_CAPABILITIES`).
- **Handshake możliwości (P1.7a, ADR 0002):**
  - `transport/profile.ts` — `TRANSPORT_PROFILE = 'flowassist-transport/1'` i `PROFILE_RULES` (reguły stałe dla profilu,
    niewysyłane: wersje koperty, prezentacje, limity, klucze zarezerwowane);
  - `transport/capabilities.ts` — `clientCapabilities()` (zamrożony snapshot: `a2uiClientCapabilities` pod kluczem
    `"v0.9"` + rozszerzenie `flowassist: { profile, kinds }`), `ServerCapabilities`, `negotiate()` w stałej kolejności
    0–5 z zamkniętą listą przyczyn porażki;
  - `transport/runPermission.ts` — zgoda na wywołania backendu **per przebieg**: tylko po udanej negocjacji, reset przy
    każdym `start` i `stop` (decyzja terminalna nie resetuje);
  - `catalog.ts: catalogCapabilities()` (obsługiwane reprezentacje per rodzaj) i `CATALOG_PROPS`;
  - `startScenario` liczy snapshot raz na przebieg; transport nigdy nie buduje capabilities sam.
  - Porażka negocjacji = status `error` z komunikatem `negotiation:<przyczyna>` przed pierwszym zdarzeniem.
  - Ramka zdarzeń, lifecycle, reconnect, wiązanie AG-UI: profil P1.7b, adapter P1.6.
- `scenarios/researchDemo.ts` — scenariusz `research` (`?demo=research`).
- Prawdziwy transport: adapter AG-UI w P1.6, po zamknięciu profilu `flowassist-transport/1` (P1.7b); musi przejść
  wspólny test zgodności `__tests__/transportConformance.ts` (zestaw przyjmuje transport asynchroniczny).

## Testy

`npm test` uruchamia pliki w `__tests__/`: `contract`, `reducer`, `layout`,
`workspace`, `gestureLogic`, `measureScreen`, `jsonPointer`, `resolveTree`, `loop`, `scenario`
(stan `6e96223`: 106 testów) oraz od v1.3:

- `replay` — korpus konformacji (`fixtures/corpus/`, `fixtures/research.ts`) odtwarzany przez koordynator
  (`fixtures/replay.ts`); ślady baseline w `fixtures/traces/`.
- `schema` — parytet schematów `schemas/flowassist-v2/` (koperta, propsy po rozwiązaniu bindingów,
  treść reprezentacji) z guardami runtime, na korpusie i mutacjach.
- Od P1.7a: `catalogCapabilities` (pochodne z katalogu, parytet `CATALOG_PROPS` ze schematem komponentów),
  `transportCapabilities` (strażnik dryfu jako ręczne literały, schematy upstream `schemas/a2ui-v0.9/` przez Ajv 2020,
  schemat `schemas/flowassist-transport-1/`, wszystkie kroki negocjacji), `runPermission`, `mockTransport`
  (wspólny test zgodności `transportConformance.ts` — ten sam zestaw musi przejść adapter P1.6), `storeCapabilities`.

Inwarianty i reguły: [`docs/adr/`](../../../docs/adr/). Kontrole przeglądarkowe opisuje `AGENTS.md` → „Testowanie”.
