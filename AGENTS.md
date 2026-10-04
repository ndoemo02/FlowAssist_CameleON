# FlowAssistant (FlowAssist XR)
Immersywna scena 3D w przestrzeni galaktycznej.
Curved screen + AI avatar Amber. Audytowanie postepow projektow.

## Stack techniczny
- Next.js 14.2.0 + React 18 + TypeScript
- React Three Fiber + Drei
- Three.js 0.160 + framer-motion + GSAP
- Leva panel dev do strojenia kamery/sceny
- Tailwind CSS + lucide-react
- MapLibre / react-map-gl dla widokow mapowych
- Zustand: stan feature modules (`features/showcase`, `features/aiui`)
- Warstwa AI-to-UI: `src/features/aiui/` (kontrakt A2UI v0.9.1 + katalog `flowassist/v1`, mock agenta); plan: `C:\Develop\Flow Assist\PLAN_AI-to-UI_v1.md`
- Testy: vitest (`npm test`) dla czystej logiki AI-to-UI
- Avatar: VideoTexture + chroma key shader
- Generowanie wideo: VEO3 (magenta tlo) -> MatAnyone 2
- Planowane API: GitHub, Hugging Face

## Sciezki
- Projekt: C:\FlowAssistant
- Junction: C:\Develop\FlowAssistant

## Planowane rozszerzenie
- Agregacja nowosci z GitHub / Hugging Face per projekt
- Przestrzen organizacji pracy i sledzenia postepow
- Powiazanie z aktualnymi projektami wlasciciela

## Aktualny sprint
- [ ] Pipeline avatara: VEO3 -> MatAnyone 2 -> VideoTexture
- [ ] Integracja GitHub API
- [ ] Integracja Hugging Face API
- [ ] Widok agregacji nowosci per projekt

## E2E Testing — Perplexity Comet
Comet to przegladarka AI ktora nawiguje i klika jak realny uzytkownik.
Agent ktory skonczyl implementacje GENERUJE prompt ponizej.
Wynik testu wraca do wlasciciela i trafia do raportu sesji.

### Szablon promptu dla Comet
`
Jestes testerem aplikacji [NAZWA].
URL startowy: [URL]

Wykonaj kroki w tej kolejnosci:
1. [co kliknac / wpisac / czego sie spodziewac]
2. [krok 2]
3. [krok N]

Po kazdym kroku:
- Opisz co widzisz na ekranie
- Zaznacz PASS lub FAIL
- Przy FAIL: opisz dokladnie blad (tekst, element, screenshot jesli mozliwy)

Raport koncowy:
PASS: [kroki ktore przeszly]
FAIL: [kroki + opis bledu]
BLOKERY: [co uniemozliwia dalsze testowanie]
SUGESTIE: [co naprawic w pierwszej kolejnosci]
`

### Aktualny prompt E2E
`
Jestes testerem aplikacji FlowAssist XR.
URL startowy: http://127.0.0.1:3000

Wykonaj kroki w tej kolejnosci:
1. Otworz URL i poczekaj az animacja intro FlowAssist zniknie. Spodziewaj sie sceny 3D z galaktycznym tlem, zakrzywionym ekranem i napisem "Scroll to Explore".
2. Po intro obserwuj przez 2 sekundy kadr 3D. Spodziewaj sie plynnego dolotu kamery do szerokiego ujecia, bez przeskoku lub pustego canvasa.
3. Przewin strone w dol o okolo jeden ekran. Spodziewaj sie plynnego zblizenia kamery na ekran/scena, bez utraty menu i bez zasloniecia przez panel dev.
4. Wroc na gore strony. Spodziewaj sie plynnego powrotu do szerokiego ujecia.
5. Kliknij przycisk "360 View", ustaw suwak na okolo 90 stopni i sprawdz, czy kamera reaguje bez awarii oraz czy scena pozostaje widoczna. Ustaw suwak z powrotem na 0 i zamknij panel przyciskiem "360 View".
6. (AI-to-UI) Wroc na gore strony. Na dole kadru powinien byc przycisk "Zleć research: popyt na rezerwacje online" ze "Start". Kliknij go. Spodziewaj sie: po prawej panel "Research: rezerwacje online" z 3 zadaniami (Scout, Parser, Analyst), paski postepu rosnace do 100%, na dole napis z etykieta AMBER.
7. Poczekaj okolo 8 sekund. Spodziewaj sie plynnego obrotu kamery o 180 stopni (Back), zamkniecia panelu zadan i pojawienia sie panelu "Canvas agenta" z wykresem liniowym (2026 vs 2025), 3 kartami (+60%, Q3, 42%) i przyciskami akcji. Dane wykresu moga dojsc chwile po pojawieniu sie panelu (szkielet ladowania) - to poprawne.
8. Kliknij "Pokaż jako prezentację". Spodziewaj sie slajdu "Popyt rośnie" (1/3); strzalka → przechodzi do kolejnych slajdow.
9. Kliknij "Wyślij do akceptacji". Spodziewaj sie karty "Pilotaż asystenta 24/7" z przyciskami "Zatwierdź" i "Odrzuć".
10. Kliknij "Zatwierdź". Spodziewaj sie napisu "Zatwierdzone..." i po ok. 2 s plynnego powrotu kamery na Front oraz przycisku "Uruchom research ponownie".
11. Otworz http://127.0.0.1:3000/?demo=research w oknie o rozmiarze telefonu w poziomie (np. DevTools 844x390). Scenariusz startuje sam po intro. Sprawdz, ze przyciski akcji na Back sa widoczne i klikalne, a napisy nie nachodza na suwak ani panel zadan.

Po kazdym kroku:
- Opisz co widzisz na ekranie
- Zaznacz PASS lub FAIL
- Przy FAIL: opisz dokladnie blad (tekst, element, screenshot jesli mozliwy)

Raport koncowy:
PASS: [kroki ktore przeszly]
FAIL: [kroki + opis bledu]
BLOKERY: [co uniemozliwia dalsze testowanie]
SUGESTIE: [co naprawic w pierwszej kolejnosci]
`

## Single Source of Truth — zasady dla wszystkich agentów
Ten plik AGENTS.md jest jedynym zrodlem prawdy o projekcie.
Kazdy agent czyta go na poczatku i dopisuje raport na koncu.

| Agent            | Rola                                | Czyta               | Aktualizuje |
| ---------------- | ----------------------------------- | ------------------- | ----------- |
| Codex Opus | Architektura, zlecone zmiany        | TAK                 | TAK         |
| Codex            | Cleanup, rutyna (AUDIT przed exec!) | TAK                 | TAK         |
| Antigravity      | Implementacja                       | TAK                 | TAK         |
| Perplexity Comet | E2E testing (klika jak uzytkownik)  | prompt z sekcji E2E | NIE         |

Zasady:
- Kazdy agent ZACZYNA od przeczytania tego pliku
- Kazdy agent KONCZY dopisujac raport sesji (format ponizej)
- Prompt E2E dla Comet generuje agent ktory skonczyl implementacje
- Nigdy nie dzialaj na podstawie ustnej instrukcji — tylko to co tu jest

## Format raportu sesji
Po kazdej sesji dopisz na gorze sekcji RAPORTY:

---
### Raport [DATA] — [AGENT: Codex/Codex/Antigravity]
**Co zrobiono:**
- [konkretna zmiana] w [plik] — [powod]

**Problemy:**
- [problem] — [proba rozwiazania]

**Nastepny krok:**
- [jedno konkretne zadanie na nastepna sesje]

**Status testow:**
- node --check: PASS / FAIL
- vitest: PASS X/Y / FAIL
- E2E Comet: PASS / FAIL / NIE WYKONANO
---

## [AI] Instrukcja wejscia w projekt
Po otwarciu tego projektu wykonaj kolejno:
1. Przejrzyj strukture plikow i katalogów (ls / tree)
2. Znajdz package.json / requirements.txt / go.mod — zidentyfikuj stack
3. Uzupelnij sekcje [Stack techniczny] powyzej jesli pusta lub niekompletna
4. Jesli czegos nie wiesz — zapytaj wlasciciela ZANIM zaczniesz dzialac
5. Nie zakladaj — weryfikuj
6. Dopisz raport na koncu tego pliku po zakonczeniu pracy

---
<!-- RAPORTY SESJI — najnowszy na gorze -->

---
### Raport 2026-10-04 — AGENT: Claude Code (Opus 5.5)
**Co zrobiono:**
- Naprawiono crash HEAD (`Could not load /models/Flowassist3d/scene.gltf … 404`, plik usunięty w 35bb81b): galaktyka przywrócona z historii do `public/models/galaxy/` (gltf + bin + licencja CC-BY-4.0), ścieżka w `StarField` — `src/app/page.tsx`.
- `Avatar` znów widoczny domyślnie; każdy model sceny w `SceneErrorBoundary` (`src/components/SceneErrorBoundary.tsx`) — brak assetu nie zabija już całego Canvasu.
- Nowa warstwa AI-to-UI `src/features/aiui/`: kontrakt (A2UI v0.9.1 + rozszerzenia `stage`/`narration`), czysty reducer, JSON Pointer, resolver drzewa, store zustand z directorem kamery (Front 0° ↔ Back 180°), `MockTransport` z cyklem przebiegu (`runId`, bramka gotowości po intro), scenariusz `research`, katalog 7 widoków (TaskList, Chart, InsightCards, DataTable, MapView, Presentation, Approval) + Stack/ActionBar/Fallback, overlay DOM (Back canvas, drawer Tasks, globalne napisy, pill startowy).
- Suwak 360° wydzielony do `features/aiui/overlay/OrbitSlider.tsx` (ten sam wygląd); `HomePage` nie subskrybuje store'u — 0 renderów strony podczas obrotu kamery (zmierzone).
- `CameraSetup`: kąt czytany ze store'u w `useFrame`; gałąź orbit z tłumionym dojazdem zamiast skoku z cue `close`.
- Leva i `setDebug` co klatkę tylko w dev (`src/lib/devTools.ts`; `?dev` wymusza, `?demo` wyłącza); naprawiona hydracja SSR panelu Leva.
- `tailwind.config.js`: dodano `./src/features/**` do `content` (wcześniej klasy z `features/*` nie były generowane — dotyczyło też `features/showcase`).

**Problemy:**
- Karta przeglądarki w tle wstrzymuje `requestAnimationFrame` → `IntroOverlay` nie kończy się i scenariusz nie startuje, dopóki karta nie jest widoczna (zachowanie przeglądarki, nie błąd; istotne przy testach automatycznych).
- Na compact (np. 844×390) otwarty bottom-sheet z taskami chowa napisy (reguła: nigdy oba naraz) — pierwsze zdanie narracji jest wtedy niewidoczne.
- `npm install` (npm 12) przepisał format `package-lock.json` — duży diff bez zmian zależności poza `vitest`.

**Nastepny krok:**
- Zatwierdzić kierunek v2: `SseTransport` + `/api/agent` → agent inference.sh z katalogiem `flowassist/v1` w system prompcie (oraz decyzja o przywróceniu wideo-intro `public/Freeflow Mind XR_123929.mp4`).

**Status testow:**
- vitest: PASS 55/55
- tsc (zakres `src/features/aiui`, `src/app/page.tsx`, nowe pliki): PASS
- next build: PASS
- E2E ręczne w Chrome (desktop 1920×889 + iframe 840×386): PASS — pełny scenariusz, prezentacja, akceptacja, powrót na Front, ręczny suwak w trakcie tweena
- E2E Comet: NIE WYKONANO (prompt zaktualizowany wyżej)

---
### Raport 2026-05-29 - AGENT: Codex
**Co zrobiono:**
- Dodano cinematic camera cues w src/app/page.tsx - plynne wejscie po intro oraz scroll push-in z kadru szerokiego do bliskiego.
- Dodano osobne cue-punkty mobile/desktop w src/app/page.tsx - animacja zachowuje sensowny kadr na telefonie i desktopie.
- Wyciszono spam logow OrbitControls/ScreenFrame w src/app/page.tsx - konsola dev zostaje czytelna podczas animacji.
- Uzupelniono stack i prompt E2E Comet w AGENTS.md - dokumentacja odzwierciedla aktualny Next/R3F stack i scenariusz testu.

**Problemy:**
- `npx tsc --noEmit` obejmuje archive/legacy/_BACKUP katalogi i zwraca stare bledy spoza aktualnej zmiany - sprawdzono filtr dla `src/app/page.tsx`, bez nowych bledow.
- `npm run build` skompilowal i wygenerowal strony, ale po finalizacji Next static worker zalogowal OOM (`Zone Allocation failed`) - do obserwacji przy kolejnych buildach.

**Nastepny krok:**
- Dopracowac wejscie samego avatara i ekranu: fade/scale ring, opoznione pojawienie Amber oraz delikatny light sweep po ekranie.

**Status testow:**
- node --check: NIE WYKONANO (zmiana w TSX/Next)
- vitest: NIE WYKONANO (brak skonfigurowanego vitest w package.json)
- next build: PASS z ostrzezeniem OOM static worker po finalizacji
- E2E Comet: NIE WYKONANO
---
