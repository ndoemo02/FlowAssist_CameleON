# FlowAssist XR / CameleON

Immersyjne środowisko AI-to-UI osadzone w scenie 3D.
FlowAssist jest przestrzenią roboczą, a CameleON warstwą adaptacyjnego interfejsu,
która zamienia dane i działania agenta w dynamiczne reprezentacje UI.

> Ten plik jest głównym źródłem prawdy o projekcie dla ludzi i agentów.
> Szczegóły modułu AI-to-UI: [`src/features/aiui/README.md`](src/features/aiui/README.md).
> Materiały sprzed CameleONa (dawny sprint, stare raporty sesji): [`docs/history/AGENTS-history.md`](docs/history/AGENTS-history.md).

## Koncepcja

Scena 360° w przestrzeni galaktycznej:

- Front:
  - zakrzywiony ekran,
  - avatar Amber,
  - deep-view dla treści wymagających skupienia,
  - narracja / prezentacja wyników.

- Back:
  - Workspace,
  - karty, wykresy, KPI, tabele, mapy,
  - manipulacja przez użytkownika,
  - przyszłe reprezentacje przestrzenne / 3D.

- HUD:
  - taski,
  - status agenta,
  - narracja,
  - approval / decyzje.

Kluczowa zasada:
dane są niezależne od sposobu prezentacji.

Ten sam element może być pokazany jako:
card → focus → screen → później spatial/3D,
bez kopiowania danych.

## Stack techniczny

- Next.js 14.2
- React 18 + TypeScript
- React Three Fiber + Drei
- Three.js 0.160
- Framer Motion + GSAP
- Tailwind CSS
- lucide-react
- MapLibre / react-map-gl
- Zustand
- @use-gesture/react (gesty kart)
- Vitest
- Leva (panel strojenia, tylko dev / `?dev`)
- Avatar: VideoTexture + shader chroma-key — **nieukończony / odłożony**: shader istnieje, ale ustawienia (`keyColor #000000`, `similarity 0`) nie wycinają tła, więc zielone tło avatara jest widoczne

## AI-to-UI

Kod:
`src/features/aiui/`

Aktualny kontrakt:
`flowassist/v2` (koperta A2UI v0.9.1 + rozszerzenia `stage` i `narration`)

- surface'y: `workspace`, `tasks-drawer`, `hud`
- komponenty: `Workspace` (członkostwo przez `children`), `WorkspaceItem`, `TaskList`, `Approval`
- rodzaje elementów: `chart`, `kpi`, `table`, `map`, `slides`
- reprezentacje zaimplementowane: `chart2d`, `cards2d`, `table2d`, `map2d`, `slides2d`;
  `liquid3d`, `ribbon3d`, `kpi3d` są w katalogu, ale **nie mają implementacji** (v1.3)
- hint prezentacji od agenta: `card` / `focus` / `screen`; `dismissed` jest wyłącznie lokalny (użytkownik)

Model odpowiedzialności:

- agent:
  - treść,
  - semantyka,
  - dostępne reprezentacje,
  - hinty prezentacji,
  - akcje semantyczne.

- klient / użytkownik:
  - pozycja,
  - rozmiar,
  - kolejność warstw,
  - lokalne manipulacje,
  - finalny układ Workspace.

Agent nie wysyła surowych współrzędnych.
Zmiany formy (drag, resize, focus, ukryj) nie trafiają do agenta; akcja semantyczna
niesie `itemId` i migawkę układu (`screen`, `focus`, `dismissed`).

## Główne elementy AI-to-UI

- Workspace surface
- Tasks drawer
- HUD
- ScreenLayer
- ScreenAnchor
- WorkspaceLayer
- coordinator surface/layout
- presentation/layout state
- semantic actions
- mock transport agenta
- gesture layer
- keyboard accessibility
- hybrid screen mode

## ScreenAnchor

Tryb hybrydowy:

- desktop + landscape mobile:
  panel jest zakotwiczony w zakrzywionym ekranie sceny.

- portrait / narrow (proporcje < 1,2 lub szerokość < 600 px):
  centered deep-view.

Widoczność ma histerezę i jest zależna od:
- pokrycia widocznego obszaru ekranu (włączenie ≥ 82%, wyłączenie < 75%),
- kąta kamery od Frontu (włączenie ≤ 16°, wyłączenie > 20°).

Poza zakresem panel jest wygaszony, nieklikalny i wyłączony z Tab (`inert`).
Gdy ekran jest zajęty lub trwa przebieg agenta, wideo ekranu jest wyciszone i przyciemnione.

ScreenAnchor przeszedł osobny spike wydajności i stabilności.

## Interakcje

Działają (desktop):

- tap → focus
- double tap → send to screen
- drag (karta wychodzi na wierzch)
- resize (uchwyt w prawym dolnym rogu)
- pinch / trackpad scale (ctrl + kółko)
- dismiss („Ukryj” lub flick w dół na karcie z focusem)
- restore hidden („Pokaż ukryte” → „Przywróć”)
- context menu (prawy klik) i przycisk „⋯” → akcje semantyczne
- klik w tło → zdjęcie focusu

Klawiatura:

- Tab przechodzi po kartach stołu (tylko gdy stół jest widoczny),
- skróty działają, gdy fokus jest na samej karcie (nie na jej przycisku):
  - strzałki → przesunięcie karty,
  - Enter → screen,
  - Delete → ukryj,
  - Escape → remove focus.

Compact (telefon):

- karty w poziomym pasku z natywnym scrollem,
- tap → focus, wszystkie operacje przyciskami na karcie,
- „− / +” zmienia szerokość karty w pasku,
- pinch tylko na treści panelu ekranu (lokalny zoom).

Nieobsługiwane: long press na iOS (menu akcji tylko przez contextmenu lub „⋯”).

## Uruchamianie

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest
npm run build
```

Parametry URL (dev / demo):

- `?demo=research` — autostart scenariusza po intro (ukrywa Leva)
- `?speed=N` — mnożnik prędkości mock transportu
- `?anchor=probe` — panel testowy ze spike'u ScreenAnchor (tylko poza produkcją; zostaje do czasu potwierdzenia warstwy ekranu)
- `?dev` — wymusza panel Leva

Haki dev w konsoli: `window.__aiui` (store), `window.__anchorRegistry`
(`getScreenMeshes`, `getAnchorState`), `window.__screenAnchor` (tylko z `?anchor=probe`).

TypeScript: globalny `npx tsc --noEmit` po sprzątaniu repo (2026-10-05) zwraca 1 znany błąd
w nieużywanym `src/app/components/safelayer/Lanyard.tsx` (zostawiony decyzją właściciela);
każdy inny błąd jest regresją.

## Stan implementacji

Branch:
`feat/aiui-prototype`

Checkpointy:

- `0b6007d` — v1.1 + ScreenAnchor spike
- `8c6e4ca` — v1.2.1, kroki 2–6
- `2e2debc` — cleanup tekstur
- `6e96223` — poprawki po review Astry + AGENTS.md

Stan na `6e96223`:

- 106/106 testów PASS (10 plików w `src/features/aiui/__tests__/`)
- TypeScript clean (zakres `src/features/aiui`, `src/app/page.tsx`)
- niezależny review Astry: GO WITH FIXES
- wszystkie 7 uwag z review poprawione
- runtime sprawdzany przez osobny agent-browser
- agent-browser nie korzysta z aktywnego Chrome użytkownika

## Obecny scenariusz demo

1. agent rozpoczyna zadanie
2. pojawiają się taski
3. Workspace dostaje elementy strumieniowo
4. skeletony zastępowane są danymi
5. agent może wysłać element na główny ekran
6. kamera wraca na Front
7. użytkownik może manipulować kartami
8. „Pogłęb” może dostarczyć nowe elementy
9. approval w HUD kończy przebieg

Terminalny stan runu jest trwały i nie może zostać reaktywowany
przez spóźnioną odpowiedź transportu.

## Testowanie

### Testy jednostkowe

`npm test` — vitest dla czystej logiki (`contract`, `reducer`, `layout`, `workspace`,
`gestureLogic`, `measureScreen`, `jsonPointer`, `resolveTree`, `loop`, `scenario`).
Bez testów renderowania 3D. Testy renderowania DOM (`*.test.tsx`) działają w jsdom
(komentarz `@vitest-environment jsdom`, harness `__tests__/fixtures/render.tsx`), np. `hostileRender`
— wrogie dane agenta nie mogą wyjść poza kartę / węzeł.

Od v1.3 (P0.2, P0.3) dochodzą:

- `replay` — korpus fixture'ów (`__tests__/fixtures/corpus/*.json` + scenariusz `research`) odtwarzany
  przez koordynator; ślady baseline w `__tests__/fixtures/traces/` (stan, efekty, komunikaty wychodzące).
  Zmiana śladu = zmiana zachowania do przeglądu. Ustalenia: `docs/adr/0005-observed-behaviors.md`.
- `schema` — warstwowy parytet JSON Schema (`src/features/aiui/schemas/flowassist-v2/`) z guardami
  `parseEvent` / `validateProps` / `validateContent` na korpusie i jego mutacjach. Ajv tylko w testach;
  autorytetem runtime pozostają guardy.

### Testy przeglądarkowe: Playwright + axe (od v1.3, P0.1)

`npm run test:e2e` — deterministyczna regresja DOM w `e2e/` (autorytatywna; zastępuje dawne skrypty `agent-browser`).

- Tylko Chromium (`npx playwright install chromium`); projekty `desktop` (1440×900) i `compact` (844×390, dotyk).
- `webServer` używa `next dev` na porcie `E2E_PORT` (domyślnie 3100), z `reuseExistingServer` — dev-hook
  `window.__aiui` istnieje tylko poza produkcją. Stan ustawiany przez `__aiui` (bez osi czasu mocka).
- Jeden worker, bez ponowień (flaki mają być widoczne). Trace i zrzut przy błędzie w `test-results/`.
- axe-core (WCAG 2.1 A/AA) w zakresie overlayu CameleON; baseline w `e2e/__snapshots__/` — nowe naruszenie = czerwony test.
  Axe nie zastępuje testów fokusu, gestów ani czytnika ekranu.
- WebGL headless = SwiftShader: logika i hit-testing tak, FPS nie.
- Ustalenia harnessu (m.in. E2E-1: hit-testing kart w kontenerze 3D; baseline axe): `docs/adr/0006-browser-harness-findings.md`.

### Eksploracja: agent-browser

Do eksploracji i odtwarzania błędów (nie jako wyrocznia regresji) służy `agent-browser` — osobna instancja Chrome w trybie headless,
w izolowanej sesji (`--session <nazwa>`). Nie koliduje z przeglądarką właściciela
i nie zatrzymuje się, gdy okno jest zasłonięte.

- Na maszynie właściciela CLI nie jest w PATH:
  `C:\Users\frees\AppData\Local\hermes\tools\agent-browser-0.26.0-win32-x64\bin\agent-browser-win32-x64.exe`
  (`npx skills add …agent-browser` instaluje tylko opis skilla, nie CLI).
- **Nie przepuszczaj wyjścia przez potok** (`| tail`, `| head`): demon dziedziczy stdout
  i powłoka się zawiesza. Kieruj wyjście do pliku:
  `"$AB" --session flow <cmd> > out.txt 2>&1 < /dev/null; cat out.txt`.
- Rzeczywiste zdarzenia myszy CDP (`mouse move/down/up`) obsługują drag `@use-gesture`.
- WebGL w headless jest programowy (SwiftShader): wystarcza do logiki i kliknięć, nie do pomiaru FPS.
- Karta przeglądarki w tle wstrzymuje `requestAnimationFrame` — w zwykłym Chrome intro
  i scenariusz nie ruszą, dopóki karta nie jest widoczna.

### Scenariusz E2E v1.2.1

Checklista dla dowolnego testera (człowiek lub agent przeglądarkowy).
URL startowy: `http://127.0.0.1:3000`

1. Otwórz URL i poczekaj, aż animacja intro FlowAssist zniknie. Spodziewaj się sceny 3D z galaktycznym tłem, zakrzywionym ekranem i napisem „Scroll to Explore”.
2. Po intro obserwuj przez 2 sekundy kadr 3D. Spodziewaj się płynnego dolotu kamery do kadru Front: zakrzywiony ekran z wideo, po lewej avatar Amber na podeście z cyjanowym pierścieniem. Bez przeskoku i bez pustego canvasa. Na dole przycisk „Zleć research: popyt na rezerwacje online” ze „Start”.
3. Przewiń stronę w dół o około jeden ekran, potem wróć na górę. Spodziewaj się płynnego zbliżenia i powrotu kamery, bez utraty menu.
4. Kliknij „360 View”, ustaw suwak na około 90°, potem z powrotem na 0. Kamera reaguje płynnie, scena pozostaje widoczna. Zamknij panel przyciskiem „360 View”.
5. Kliknij „Start” w przycisku „Zleć research”. Spodziewaj się: u góry chip „agent pracuje…”, po prawej panel „Research: rezerwacje online” z 3 zadaniami (Scout, Parser, Analyst) i paskami postępu do 100%, na dole napis z etykietą AMBER. Wideo na ekranie sceny wycisza się i przyciemnia.
6. Poczekaj około 7 sekund. Spodziewaj się obrotu kamery o 180° (Back), zamknięcia panelu zadań i stołu roboczego z 3 kartami: wykres „Zapytania o rezerwacje online…”, „Najważniejsze wskaźniki” (+60%, Q3, 42%), tabela „Dzielnice · Q4”. Karty mogą przez chwilę pokazywać szkielet ładowania — to poprawne.
7. Poczekaj około 3 sekund. Agent wysyła wykres na ekran: kamera sama wraca na Front, a wykres pojawia się w panelu dopasowanym do zakrzywionego ekranu (przyciski „Na stół” i „Ukryj”). Po chwili na wykresie dochodzi trzecia linia „Plan 2026”. Pod napisami pojawia się pasek „Decyzja: Pilotaż asystenta 24/7” z przyciskiem „Szczegóły”.
8. Kliknij „Na stół” w panelu ekranu, potem w „360 View” ustaw suwak na 180° (Back) i zamknij panel suwaka. Na stole kliknij jedną kartę — powinna się powiększyć i pokazać przyciski „Na ekran”, „−”, „+”, „Ukryj”. Kliknij w puste tło — karta wraca do normalnego rozmiaru.
9. Przeciągnij dowolną kartę myszą w inne miejsce stołu — powinna zostać tam, gdzie ją upuszczono. Przeciągnij uchwyt w prawym dolnym rogu karty — karta zmienia rozmiar.
10. Kliknij kartę „Najważniejsze wskaźniki”, potem „Ukryj”. Karta znika, u góry pojawia się „Pokaż ukryte (1)”. Kliknij go i „Przywróć” — karta wraca.
11. Kliknij dwukrotnie kartę „Dzielnice · Q4”. Kamera wraca na Front, tabela pojawia się w panelu ekranu. Kliknij „⋯”, potem „Pogłęb analizę”. Na stole (Back) powinna dojść czwarta karta — mapa „Warszawa · zapytania Q4 (schemat)” — a napis Amber wspomina Pragę-Południe i Mokotów.
12. Kliknij pasek „Decyzja…” → „Szczegóły”, potem „Zatwierdź”. Spodziewaj się napisu „Zatwierdzone…”, zniknięcia karty decyzji, powrotu kamery na Front i przycisku „Uruchom research ponownie”. Gdy na ekranie nie ma już żadnej karty, wideo wraca do pełnej jasności.
13. Otwórz `http://127.0.0.1:3000/?demo=research` w oknie telefonu w poziomie (np. 844×390). Scenariusz startuje sam po intro. Na Back karty są w poziomym pasku przewijanym palcem/myszką, każda ma przyciski; „Na ekran” wysyła kartę do panelu na zakrzywionym ekranie. Napisy nie nachodzą na pasek kart.
14. Otwórz ten sam URL w oknie telefonu w pionie (np. 390×844). Element wysłany na ekran pokazuje się jako wyśrodkowany panel nad sceną (nie na zakrzywionym ekranie).

Po każdym kroku: opis tego, co widać, PASS lub FAIL, a przy FAIL dokładny opis błędu
(tekst, element, zrzut ekranu, jeśli możliwy). Raport końcowy: PASS / FAIL / BLOKERY / SUGESTIE.

## Zasady dla agentów

- Każdy agent zaczyna od przeczytania tego pliku.
- Nie zakładaj — weryfikuj w kodzie i testach. Jeśli czegoś nie wiesz, zapytaj właściciela, zanim zaczniesz działać.
- Właściciel bramkuje etapy: plan → niezależny review (Astra, tylko odczyt) → implementacja → checkpoint commit. Nie przechodź do kolejnego etapu, nie commituj i nie pushuj bez wyraźnej zgody.
- Nie rozszerzaj zakresu i nie sprzątaj niezwiązanego kodu legacy.
- Po zakończeniu implementacji zaktualizuj scenariusz E2E powyżej, jeśli zmieniło się zachowanie.
- Agent kończy sesję raportem w formacie poniżej.

| Agent | Rola |
| ----- | ---- |
| Claude Code | implementacja AI-to-UI, kontrole agent-browser |
| Astra (GPT) | niezależny review planu i kodu, tylko odczyt |
| Codex Opus | architektura, zlecone zmiany |
| Codex | cleanup, rutyna (audit przed wykonaniem) |
| Antigravity | implementacja |

## Format raportu sesji

```
### Raport [DATA] — [AGENT]
**Co zrobiono:**
- [konkretna zmiana] w [plik] — [powód]

**Problemy:**
- [problem] — [próba rozwiązania]

**Następny krok:**
- [jedno konkretne zadanie na następną sesję]

**Status testów:**
- vitest: PASS X/Y / FAIL
- tsc (zakres aiui + page.tsx): PASS / FAIL
- next build: PASS / FAIL / NIE WYKONANO
- E2E (agent-browser lub ręcznie): PASS / FAIL / NIE WYKONANO
```

## Aktualne priorytety

v1.3 — wydanie utwardzające i adapterowe. Kernel CameleONa (inwarianty I1–I10) bez zmian.
Plan: `C:\Develop\Flow Assist\PLAN_v1.3_proposal.md` (v1.3.2 FINAL, poza repo).

- **P0 (hardening, start od razu):**
  - Playwright + axe (tylko Chromium);
  - korpus fixture'ów z replay (stan, efekty, komunikaty wychodzące);
  - JSON Schema jako warstwowy test konformacji (Ajv tylko w testach);
  - taksonomia stanów elementu;
  - dostępność natywnym HTML (regiony ogłoszeń, Escape, fokus);
  - reduced motion;
  - ADR-y.
- **P1 (obowiązkowo):** handshake możliwości → jeden adapter AG-UI (dowód wymienności mocka na prawdziwy transport).
- **Follow-upy przed P1.6** (review 2026-10-05, `docs/review/REVIEW_BRIEF.md`):
  - **FU-1 (reszta #5):** dwa fallbacki nie są zgłaszane agentowi jako `VALIDATION_FAILED` (`validationReporting.ts` ich nie widzi):
    komponent spoza slotu („komponent niedostępny w tym slocie”, np. root HUD = `Workspace`)
    oraz root surface'u `workspace` niebędący `Workspace` (stół się nie rysuje, bez raportu);
  - **FU-2 (#6, odłożone):** `store.dispatch(raw)` bez `runId` omija izolację I6. Oddzielić wejście
    developerskie od transportowego razem z adapterem (zmiana kernela).
- **P1 (warunkowo):** Radix albo React Aria, tylko jeśli po P0 natywna mechanika menu i fokusu okaże się krucha.
- **Poza v1.3:** spike'i gestów, wykresów i tabel. Eksperymenty P2 (MCP Apps, Drei Html, graph2d, Vega-Lite, MapLibre) w v1.4.

Szeroki zewnętrzny audit wzorców i bibliotek został wykonany (`C:\Develop\Flow Assist\Sonnet Perplexity Reserach.md`).
Od teraz research robimy tylko dla konkretnej zależności, tuż przed jej spike'iem.

## Odłożone

- loader z cząstek (krok 7 planu v1.2.1)
- chroma-key avatara (zielone tło nadal widoczne)
- finalna strefa wykluczenia Amber po keyingu
- test na fizycznym telefonie i kalibracja kadru mobile
- ponowny test histerezy po zmianie dopasowania kamery
- long press na iOS
- spatial representations:
  - liquid3d
  - ribbon3d
  - kpi3d
- compare/group/stash
- prawdziwy transport agenta (SSE / inference.sh zamiast mocka)

Plan i decyzje: `C:\Develop\Flow Assist\PLAN_AI-to-UI_v1.md` (poza repo).
