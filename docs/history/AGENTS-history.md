# Historia AGENTS.md (sprzed CameleONa)

> **HISTORYCZNE.** Ten plik zawiera fragmenty `AGENTS.md` z commita `6e96223`, które opisują
> stan sprzed CameleONa albo zostały zastąpione. Nie jest źródłem prawdy.
> Aktualne instrukcje i architektura: [`AGENTS.md`](../../AGENTS.md).
>
> Co się zdezaktualizowało:
> - nagłówek, ścieżki `C:\FlowAssistant` i „Aktualny sprint” (GitHub / Hugging Face, pipeline VEO3 → MatAnyone 2) — kierunek zastąpiony przez CameleON (AI-to-UI);
> - katalog `flowassist/v1` (surface `back-canvas`) — zastąpiony przez `flowassist/v2`;
> - Perplexity Comet jako tester E2E — **nieaktywny od 2026-10-04**: nawigowanie i klikanie jak użytkownik przeniesiono do płatnej funkcji „Computer Use”; kontrole przeglądarkowe wykonuje teraz `agent-browser`;
> - raporty sesji poniżej opisują stan z dnia ich napisania (np. 55 testów, `flowassist/v1`).
>
> Scenariusz E2E v1.2.1, zasady dla agentów i format raportu przeniesiono (bez wątków Comet) do aktualnego `AGENTS.md`.

---

## Dawny nagłówek, stack i sprint (stan z `6e96223`, bez zmian treści)

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


---

## Dawna sekcja „E2E Testing — Perplexity Comet” (wstęp i szablon)

> **Uwaga (2026-10-04):** Perplexity Comet nie może już testować UI — nawigowanie i klikanie jak użytkownik przeniesiono do płatnej funkcji „Computer Use”. Do czasu decyzji właściciela prompt poniżej służy jako scenariusz E2E dla dowolnego testera (człowiek lub agent przeglądarkowy). W sesji 2026-10-04 kontrole przeglądarkowe wykonano przez `agent-browser` (osobna instancja Chrome w trybie headless — nie koliduje z przeglądarką właściciela; na Windows wyjście CLI kierować do pliku, nie przez potok `|`, bo demon trzyma potok otwarty).

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

---

## Dawna tabela ról i zasady (stan z `6e96223`)

| Agent            | Rola                                | Czyta               | Aktualizuje |
| ---------------- | ----------------------------------- | ------------------- | ----------- |
| Codex Opus | Architektura, zlecone zmiany        | TAK                 | TAK         |
| Codex            | Cleanup, rutyna (AUDIT przed exec!) | TAK                 | TAK         |
| Antigravity      | Implementacja                       | TAK                 | TAK         |
| Perplexity Comet | E2E testing (klika jak uzytkownik) — **nieaktywny: testowanie UI przeniesione do płatnego „Computer Use”** | prompt z sekcji E2E | NIE         |

Zasady:
- Kazdy agent ZACZYNA od przeczytania tego pliku
- Kazdy agent KONCZY dopisujac raport sesji (format ponizej)
- Prompt E2E dla Comet generuje agent ktory skonczyl implementacje
- Nigdy nie dzialaj na podstawie ustnej instrukcji — tylko to co tu jest

## [AI] Instrukcja wejscia w projekt
Po otwarciu tego projektu wykonaj kolejno:
1. Przejrzyj strukture plikow i katalogów (ls / tree)
2. Znajdz package.json / requirements.txt / go.mod — zidentyfikuj stack
3. Uzupelnij sekcje [Stack techniczny] powyzej jesli pusta lub niekompletna
4. Jesli czegos nie wiesz — zapytaj wlasciciela ZANIM zaczniesz dzialac
5. Nie zakladaj — weryfikuj
6. Dopisz raport na koncu tego pliku po zakonczeniu pracy

---

## Raporty sesji (archiwum, najnowszy na górze)
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
