# Reset granicy odpowiedzialności — P1.7b (propozycja do akceptacji)

> **Status:** propozycja, 2026-10-07. **Nic nie jest zmienione w kodzie ani w repo.** P1.6 nie rozpoczęte.
> Wyzwalacz: `ARCHITECTURE DIRECTION UPDATE — stop` (właściciel). CameleON to **konsument i renderer prezentacji**, w
> metaforze właściciela manekin, który dostaje gotowe ubrania. CameleON **nie** zamienia surowego wyniku
> researchu w stan do wyrenderowania.
> Brief do rozesłania: `RESEARCH_BRIEF_Presentation_Contract_v1.md`.

## 0. Zamrożony stan P1.7b

| Co | Wartość |
|---|---|
| Branch / remote | `feat/aiui-prototype`, `cameleon` @ `6cca2dc` (P1.7a zamknięte: tag `p1.7a-closed` → `fdc79b6`) |
| Lokalnie, **bez pusha** | 13 commitów `3e7b69d..57787e5`, drzewo czyste |
| Dokument normatywny | `docs/protocol/flowassist-transport-1.md` @ `57787e5` |
| Kod P1.7b (bez zmiany zachowania) | `transport/profile.ts` (`PROFILE_RULES`), `contract.ts: parseEventDiagnostic` (D7), `transport/resyncPlan.ts` (A1+), schematy `schemas/flowassist-transport-1/*`, testy (vitest 643/643) |
| Review w toku | Astra: weryfikacja A1–A4 = NO-GO (A1, nowa sprzeczność 256 KiB) → A1+/A5 naniesione w `57787e5`. Ostatnie review Claude: GO WITH FIXES z decyzjami **M1b** (sieroty), **M2** (tablice niepodzielne), **L1b** (powtarzane `MESSAGE_TOO_LARGE`). **Wszystkie trzy znikają po resecie (§3)** |
| Koszt Astry dotąd (P1.7b) | $1.2876 + $0.6243 |

## 1. Diagnoza: skąd się wzięła złożoność

Profil P1.7b przyjął **cichy model**: agent jest właścicielem dowolnie dużego, przyrostowo budowanego stanu
(drzewo komponentów + data model edytowany wskaźnikami JSON), a klient musi go **zrekonstruować** po zerwaniu
połączenia.

Z tego wynikł łańcuch reguł:
- resync jako pełne odtworzenie stanu przez agenta (§7.4–§7.5);
- podział odtworzenia na części → transakcja `begin`/części/`complete` z limitami 1024 / 16 MiB (A1);
- puste miejsca w tablicach (D16), których JSON nie przenosi, → `null` + odtworzenie każdego miejsca osobną wiadomością (A2);
- kontrprzykład 1025 pustych miejsc → niezmiennik odtwarzalności z kanonicznym planem (A1+, `resyncPlan.ts`);
- zbyt duża część w transakcji → A5;
- sieroty komponentów, tablice niepodzielne, powtarzane `MESSAGE_TOO_LARGE` (otwarte decyzje M1b, M2, L1b).

Przy granicy właściciela **producent dostarcza ograniczony, gotowy artefakt prezentacyjny**:
- duże dane redukuje, agreguje albo paginuje producent;
- odtworzenie po zerwaniu to **ponowne pobranie migawki aktualnych artefaktów**, a nie odbudowa przyrostowego stanu;
- wszystkie powyższe reguły tracą przedmiot.

## 2. Macierz odpowiedzialności

Legenda: **P** — producent / aplikacja inference, **G** — transport / gateway (most AG-UI, magazyn migawek), **C** — klient CameleON.

| Obszar | P | G | C |
|---|---|---|---|
| Research, porównanie, filtrowanie, ekstrakcja punktów widzenia | ● | | |
| Normalizacja, strukturyzacja, agregacja, redukcja dużych danych | ● | | |
| Paginacja i dzielenie danych na porcje prezentacyjne | ● | | |
| Przygotowanie wykresu, tabeli, diagramu, slajdów (artefakt gotowy do prezentacji) | ● | | |
| Wybór preferowanych reprezentacji (kolejność) i hint prezentacji | ● | | |
| Stabilna tożsamość artefaktu (`artifactId`) i monotoniczna `revision` | ● | | |
| Tożsamość decyzji (`interruptId`: nowa decyzja = nowe id, N2) | ● | | |
| Budżet artefaktu (rozmiar, liczba wierszy i punktów) — **przestrzeganie** | ● | | |
| Budżet artefaktu — **egzekwowanie na wejściu** (limity, odrzucenie) | | ● | ● |
| Wiązanie AG-UI (HTTP+SSE), ramka `flowassist.frame`, `seq` | | ● | ● (kontrola) |
| Keep-alive SSE, limity czasu po stronie serwera | | ● | |
| Magazyn ostatnich rewizji artefaktów na wątek i **migawka do reconnect** | | ● | |
| Uwierzytelnianie, agregacja wielu aplikacji inference w jeden strumień | | ● | |
| Negocjacja capabilities (P1.7a) | | ● (deklaruje) | ● (negocjuje) |
| Walidacja kontraktu i katalogu (zamknięty katalog, I10) | | ● (opcjonalnie wcześniej) | ● (autorytatywnie) |
| Wybór obsługiwanej reprezentacji (P10), fallback z raportem | | | ● |
| Izolacja przebiegów (`runId`, I6), lifecycle, statusy | | | ● |
| `seq` i deduplikacja (D6), replay (§4.7), tożsamość biegu (N3) | | | ● |
| Limity wejścia (zdarzenie, wiadomość, artefakt, liczba artefaktów) | | ● | ● |
| Atomowe zastosowanie migawki i rewizji artefaktu | | | ● |
| Układ, prezentacja, kamera, fokus, a11y, gesty (I1–I10) | | | ● |
| Akcje semantyczne: jedno miejsce, brak replay (D12, M1, N1, N2) | | | ● |
| Obsługa akcji (np. „następna strona”, „pogłęb”) i nowa rewizja | ● | | |
| Raporty klienta (`VALIDATION_FAILED`, diagnostyka) → producent | | ● (przekazuje) | ● (wysyła) |

## 3. Reguły P1.7b: właściciel i werdykt

Werdykty:
- **KEEP** — zostaje bez zmian;
- **MOVE** — przenosi się do P albo G;
- **REMOVE** — znika, bo powstała tylko z założenia rekonstrukcji;
- **REWRITE** — zostaje w zmienionej postaci.

Kolumna „rekon.” oznacza regułę wprowadzoną **tylko** z powodu błędnego założenia, że CameleON odbudowuje albo przestrukturyzowuje duży stan producenta.

### 3.1 B1–B8 (sekcje profilu)

| Reguła | Sekcja | Właściciel | Werdykt | Rekon. | Uwagi |
|---|---|---|---|---|---|
| B1 tożsamość `threadId`/`runId`, mapowanie | §4.1 | G+C | KEEP | — | |
| B1 biegi sekwencyjne | §4.2 | C | KEEP | — | |
| B1 rodzaje biegów start/akcja/**resync** | §4.3 | C | REWRITE | częściowo | resync → „migawka” (żądanie stanu z magazynu G) |
| B1 `RunAgentInput` (`forwardedProps.flowassist`) | §4.4 | C | KEEP | — | `resync` → `snapshot` |
| B1 ramka `CUSTOM flowassist.frame` | §4.5 | G+C | KEEP | — | |
| B1 warstwy walidacji (A4): koperta fatalnie, treść niefatalnie | §4.5 | C | KEEP | — | |
| B1 warstwa sterująca `resync.begin/complete` | §4.5, §7.7 | C | REWRITE | tak | tylko `snapshot.begin/complete` bez liczenia części i bez planu |
| B1 inne zdarzenia AG-UI ignorowane | §4.6 | C | KEEP | — | |
| B1 replay historii, tożsamość biegu (N3) | §4.7–§4.8 | C | KEEP | — | |
| B2 AG-UI major 1 (D18) | §2.4 | G+C | KEEP | — | |
| B2 capabilities, negocjacja, źródło (D9) | §3 | G+C | REWRITE | — | doszłyby wersja kontraktu prezentacji i budżety artefaktu |
| B2 `seq`, reset, deduplikacja (D6) | §5 | C | KEEP | — | |
| B2 lifecycle (D10, D11), koniec invocation | §6 | C | KEEP | — | |
| B2 klasyfikacja awarii (M2) | §7.1 | C | KEEP | — | A5 znika z tabeli |
| B2 limity czasu (H1) | §7.2 | G (keep-alive) + C (timeouty) | MOVE + KEEP | — | obowiązek keep-alive przechodzi na gateway |
| B2 stan połączenia, próby, `offline` (D14) | §7.3 | C | KEEP | — | |
| B2 bieg resync (zawartość wejścia, porzucenie interruptu) | §7.4 | C | REWRITE | częściowo | resync = żądanie migawki; porzucenie niepokrytego interruptu zostaje |
| B2 obowiązek agenta przy resync (pełne odtworzenie, podział, puste miejsca, przejęcie trwającej pracy) | §7.5 | P | MOVE + REMOVE | tak | migawkę wydaje G z magazynu; podział i puste miejsca znikają; przejęcie pracy przechodzi na G/P |
| B2 resync bez resetu układu; usuwanie nieaktualnych (A3) | §7.6 | C | REWRITE | częściowo | semantyka migawki: artefakt nieobecny w migawce jest usuwany, a obecne zachowują układ |
| B2 transakcja resync: części, 1024 / 16 MiB | §7.7 | C | REWRITE | tak | migawka ≤ N artefaktów × ≤ 256 KiB = ograniczona z konstrukcji; atomowe zastosowanie **zostaje** |
| B2 niezmiennik odtwarzalności, kanoniczny plan (A1+) | §7.8 | C | **REMOVE** | tak | zastąpiony budżetem artefaktów (liczba × rozmiar) |
| B3 raportowanie, kody, `path`, dostarczenie (D7, D13) | §11 | C | KEEP / REWRITE | — | ścieżki oparte na `artifactId`; usunąć `RESYNC_*` |
| B4 obiekty zamknięte (D17), atomowość | §10.1–§10.2 | C | KEEP | — | |
| B4 binding, Q1, ST-4 (a) | §10.3–§10.5 | C | REWRITE | częściowo | jeśli treść artefaktu jedzie w całości, bindingi upraszczają się do `/artifacts/{id}` |
| B4 identyfikatory (D19), klucze zarezerwowane (FU-4) | §10.6, §10.10 | C | KEEP | — | |
| B4a limity zdarzenia i wiadomości (D15), świeżość JSON | §10.8–§10.9 | G+C | KEEP / REWRITE | — | dochodzi budżet artefaktu i migawki |
| **B4b** tablice: indeks ≤ długość, puste miejsca (D16) | §10.7 | C (kernel P1.6) | **REMOVE / REWRITE** | tak | kontrakt v1 zakazuje głębokich ścieżek: treść zastępowana w całości. Zmiana `setAt` i raport z reducera stają się zbędne |
| B5 wersje koperty A2UI | §2.1 | C | KEEP | — | |
| B6 akcje, jedno miejsce, brak replay, interrupt (D12, M1, N1, N2) | §8 | C (+P: tożsamość) | KEEP | — | dochodzą akcje paginacji obsługiwane przez P |
| B7 `stage` / `narration` | §9 | C | KEEP | — | |
| B8 katalog = kontrakt komponentów; capabilities = reprezentacje (D2) | §2.2 | C | REWRITE | — | rodzaje artefaktów (np. `diagram`, `text`) to decyzja katalogowa |

### 3.2 Decyzje D / H / M / N / A

| Decyzja | Właściciel | Werdykt | Rekon. | Uwagi |
|---|---|---|---|---|
| D1, D2, D4, D5, D8 (P1.7a) | C | KEEP | — | zamknięte i wypchnięte |
| D3 profil w repo + schematy | C | KEEP | — | |
| D6 ramki `CUSTOM`, `seq`, deduplikacja | G+C | KEEP | — | |
| D7 `parseEventDiagnostic` | C | KEEP | — | `contract.ts`, bez zmiany zachowania |
| D9 `ServerCapabilities` z konfiguracji | G+C | KEEP | — | |
| D10 `awaiting_action` = interrupt; akcja w `resume` | P+C | KEEP | — | |
| D11 `cancelled` | C (kernel P1.6) | KEEP | — | |
| D12 + M1 + N1 + N2 jedno miejsce na akcję, `expectedInterruptId` | C (+P: N2) | KEEP | — | |
| D13 raporty przy następnym biegu | C | KEEP | — | |
| D14 resync 1/2/4 s, `offline` | C | KEEP | — | źródłem stanu jest migawka G |
| D15 limity 1 MiB / 256 KiB | G+C | KEEP | — | dochodzi budżet artefaktu |
| **D16** tablice, puste miejsca | C | **REMOVE / REWRITE** | tak | patrz B4b |
| D17 obiekty zamknięte | C | KEEP | — | |
| D18 AG-UI major 1 | G+C | KEEP | — | |
| D19 znaki w `id` | C | KEEP | — | dotyczy też `artifactId` |
| D20 addytywne API transportu | C | REWRITE | — | `BackendCall 'resync'` → `'snapshot'` |
| H1 limity czasu | G+C | KEEP / MOVE | — | keep-alive przechodzi na G |
| M2 klasyfikacja awarii | C | KEEP | — | |
| N3 tożsamość biegu żądanego | C | KEEP | — | |
| Reguła niepewnej akcji (`cancelled` w resync) | C | KEEP | — | |
| **A1** transakcja z częściami 1024 / 16 MiB | C | **REWRITE** | tak | atomowa migawka bez liczenia części |
| **A1+** niezmiennik odtwarzalności, kanoniczny plan | C | **REMOVE** | tak | |
| **A2** puste miejsca: `null` + odtworzenie | P+C | **REMOVE** | tak | |
| A3 usuwanie nieaktualnych przy uzgadnianiu | C | REWRITE | częściowo | semantyka migawki artefaktów |
| A4 warstwy walidacji | C | KEEP | — | |
| **A5** część > 256 KiB w transakcji | C | **REMOVE / REWRITE** | tak | artefakt > budżetu → odrzucenie artefaktu z raportem |
| Otwarte po review: M1b, M2 (tablice), L1b | — | **REMOVE** (bez przedmiotu) | tak | |

## 4. Presentation Contract v1 (szkic)

**Cel:** jedna wspólna umowa, przez którą **dowolna** aplikacja inference (research, „Send to Table/Chart UI”,
„Send to Diagram UI”, „Send to Screen Viewer”) dostarcza CameleON **gotowy, ograniczony artefakt**.

### 4.1 Artefakt

```json
{
  "contract": "cameleon.presentation/1",
  "artifactId": "art-market-2026q4",
  "revision": 3,
  "kind": "chart",
  "title": "Zapytania o rezerwacje online",
  "summary": "Wzrost o 60% r/r w Q3.",
  "representations": ["chart2d"],
  "presentation": { "hint": "card", "priority": 50 },
  "content": { "...": "treść zależna od kind, gotowa do prezentacji, w budżecie" },
  "paging": { "page": 1, "pageCount": 4 },
  "actions": [{ "name": "deepen", "label": "Pogłęb analizę" }, { "name": "next_page", "label": "Dalej" }],
  "provenance": { "producer": "research-app@1.2.0", "generatedAt": "2026-10-07T10:00:00Z", "sources": [{ "title": "…", "url": "…" }] }
}
```

- `artifactId`:
  - stały i nadawany przez producenta;
  - znaki według D19 (bez `/` i `~`), np. `[A-Za-z0-9._-]{1,64}`;
  - nazwy zarezerwowane są zakazane (FU-4).
- `revision`:
  - liczba całkowita, monotoniczna per `artifactId`;
  - klient stosuje tylko rewizję **nowszą** niż posiadana, a starszą i równą ignoruje (idempotencja reconnect i replay);
  - deduplikacja odbywa się po (`artifactId`, `revision`), nigdy po treści.
- `content`: kompletna, ograniczona treść dla `kind`. **Nie ma częściowych aktualizacji głębokimi ścieżkami.** Nowa treść oznacza nową rewizję całego artefaktu.
- `representations`:
  - kolejność preferencji producenta;
  - klient wybiera pierwszą obsługiwaną (P10), a bez obsługiwanej daje fallback z raportem.
- `paging`: **producent** dzieli dane na strony. Inną stronę dostarcza nowa rewizja albo osobny artefakt po akcji `next_page`.
- `provenance`: metadane informacyjne, bez wpływu na renderowanie (I10). Bez HTML, JS ani URL-i obrazów do renderowania.

### 4.2 Budżety (propozycja do potwierdzenia researchem, Q9)

| Kind | Budżet treści |
|---|---|
| `chart` | ≤ 8 serii × ≤ 500 punktów |
| `table` | ≤ 12 kolumn × ≤ 200 wierszy na stronę |
| `kpi` | ≤ 12 kafli |
| `map` | ≤ 200 punktów |
| `slides` | ≤ 20 slajdów, ≤ 1 200 znaków na slajd |
| `diagram` (nowy?) | ≤ 100 węzłów, ≤ 200 krawędzi |
| `text` (nowy?) | ≤ 4 000 znaków |
| każdy artefakt | ≤ 256 KiB po serializacji |
| workspace | ≤ 32 artefakty, migawka ≤ 32 × 256 KiB = 8 MiB, ograniczona **z konstrukcji** |

Przekroczenie budżetu oznacza **odrzucenie artefaktu z raportem**. Stan pozostaje poprzedni, a przebieg trwa.

### 4.3 Operacje (wiadomości profilu w ramkach `flowassist.frame`)

| Operacja | Znaczenie |
|---|---|
| `artifact.upsert` | cały artefakt; zastępuje atomowo starszą rewizję |
| `artifact.remove` | `{ artifactId, revision }`; tombstone |
| `workspace.order` (opcjonalnie) | kolejność i członkostwo artefaktów (dziś `Workspace.children`) |
| `stage`, `narration` | bez zmian (§9) |
| `decision` | karta decyzji powiązana z `interruptId` (dziś `Approval` w HUD) |
| `snapshot.begin` … upserty … `snapshot.complete { artifactIds }` | **migawka** stanu workspace przy starcie i reconnect. Wydaje ją gateway z magazynu. Klient stosuje ją atomowo: artefakty spoza listy usuwa, a układ obecnych zachowuje (I9, P6) |

### 4.4 Nośnik — decyzja otwarta (R-1)

- **(a) Rekomendacja: ograniczony profil A2UI.** Artefakt = jeden `WorkspaceItem` (komponent) + treść w data modelu pod `/artifacts/{artifactId}`, **zawsze w całości** (bez głębszych ścieżek).
  - Tłumaczenie artefakt → A2UI robi gateway.
  - Klient zachowuje kernel i inwestycje P0 / P1.7a / P1.7b; profil dostaje regułę „tylko ścieżki artefaktów”.
- **(b) Natywne wiadomości `artifact.*`** w kliencie.
  - Czystsze semantycznie, ale to nowy kontrakt wejścia (`contract.ts`) i zmiany kernela (koordynator, workspace).

### 4.5 Odpowiedzialność CameleON w v1 (zachowana)

- walidacja: koperta, katalog, budżety i limity;
- capabilities i obsługiwane reprezentacje;
- izolacja przebiegów;
- `seq` i deduplikacja (także po rewizji);
- tożsamość interruptu i jedno miejsce na akcję;
- atomowe zastosowanie migawki i rewizji;
- fallback i raport renderera;
- układ i prezentacja.

## 5. Pliki i commity, których dotknie reset (po akceptacji)

| Element | Commity | Zmiana |
|---|---|---|
| `docs/protocol/flowassist-transport-1.md` | `3e7b69d`, `d9729fa`, `7c0d466`, `3483f94`, `57787e5` | §4.3–§4.5 (sterowanie), §7.4–§7.8 (resync → migawka; usunąć §7.8), §10.7 (B4b), §10.8 (A5, niezmiennik), §11.2 (`RESYNC_*`), §13, §14, §15 (`resync`), §16 (A1–A5) |
| `src/features/aiui/transport/resyncPlan.ts`, `__tests__/resyncPlan.test.ts` | `57787e5` | **usunąć** |
| `schemas/flowassist-transport-1/control.schema.json` | `7c0d466` | przepisać na `snapshot.begin/complete` albo usunąć |
| `schemas/flowassist-transport-1/frame.schema.json`, `message.schema.json` | `b4f64e1`, `d9729fa`, `7c0d466` | zostają (koperta, obiekty zamknięte); ewentualnie reguła ścieżek artefaktów |
| `transport/profile.ts` (`RESYNC_TRANSACTION`, kody `RESYNC_*`) + literały w `transportCapabilities.test.ts` | `7c0d466` | przepisać na budżety artefaktu i migawki |
| `__tests__/profileSchemas.test.ts` (warstwa sterująca, przykład §7.7) | `7c0d466`, `3483f94` | przepisać |
| ADR 0002 „Otwarte” 4 (D16) | `6cca2dc`, `3e7b69d` | przepisać: tablice bez znaczenia przy treści w całości |
| `PLAN_P1.7b_profile.md` (poza repo) | — | nowa wersja planu po akceptacji |
| **Bez zmian** | `fbcb8c4`, `84f22c6`, `8ff3762` (`PROFILE_RULES` poza resync, D7) | |
| **Bez zmian** | P1.7a (`fdc79b6`) | |
| **Bez zmian** | kernel i inwarianty I1–I10 | |

Uniknięte zmiany kernela, które profil zapowiadał na P1.6:
- D16 (`setAt`) wraz z raportem z reducera;
- sprawdzanie niezmiennika odtwarzalności w koordynatorze.

Zostaje **atomowe wejście koordynatora dla migawki** (A1 → REWRITE).

## 6. Decyzje do akceptacji przed jakąkolwiek implementacją

1. Granica odpowiedzialności z §2 (P / G / C).
2. Werdykty z §3, w szczególności:
   - REMOVE: A1+, A2, A5, D16/B4b oraz M1b, M2, L1b;
   - REWRITE: A1 (migawka) i A3.
3. Presentation Contract v1 (§4): kształt artefaktu, operacje, budżety po researchu.
4. R-1, nośnik: ograniczony profil A2UI (rekomendacja) albo natywne `artifact.*`.
5. Czy gateway (G) jest osobnym komponentem, który dostarczamy w P1.6, czy w tej iteracji zastępuje go mock.
6. Los 13 lokalnych commitów:
   - rekomendacja: zostają jako historia (bez rewrite), a reset idzie nowymi commitami po akceptacji;
   - pushu nie robię bez Twojej zgody.

Pytania badawcze: `RESEARCH_BRIEF_Presentation_Contract_v1.md`.
