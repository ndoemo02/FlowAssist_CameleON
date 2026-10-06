# ADR 0002: Trzy osie zgodności protokołu

- **Status:** zaakceptowany (v1.3). Oś 2 doprecyzowana decyzją D2 (2026-10-06, właściciel + review Astry): obsługiwane reprezentacje to capabilities, nie katalog. Mechanizm handshake'u ustalony (P1.7a). Polityka przyjmowania wersji koperty: do zamknięcia w profilu (P1.7b).
- **Kontekst:**
  - `contract.ts`, `catalog.ts` i `transport/types.ts` to powierzchnia protokołu, nie zamrożony kernel.
  - Jeden numer wersji (np. `flowassist/v2.x`) mieszałby trzy niezależne rzeczy: kopertę A2UI, katalog komponentów oraz transport z rozszerzeniami aplikacji.
  - Sam numer minor nie zapewnia zgodności, bo parser przyjmuje dokładnie jeden identyfikator katalogu.
- **Decyzja:** zgodność opisujemy i wersjonujemy na trzech osobnych osiach.

## Oś 1: koperta A2UI

**Stan faktyczny (`contract.ts`):**
- **przychodzące:** `parseEvent` przyjmuje `version` ze zbioru `ACCEPTED_VERSIONS = {'v0.9', 'v0.9.1'}`. Tolerancja `v0.9` jest więc szersza, niż deklaruje dokumentacja (A2UI v0.9.1);
- **wychodzące:** `buildAction` i `buildError` zawsze wysyłają `A2UI_VERSION = 'v0.9.1'`;
- komunikat musi mieć **dokładnie jeden klucz payloadu**: `stage` | `narration` | `createSurface` | `updateComponents` | `updateDataModel` | `deleteSurface`. Mieszana koperta (np. `stage` + `createSurface`) jest odrzucana w całości (OBS-4, ADR 0005); pola niebędące payloadem (np. `version` przy rozszerzeniu) są ignorowane.

**Zasada:** oś śledzi wersję specyfikacji A2UI; nie numerujemy jej sami.

**Testy:** `contract.test.ts` („odrzuca obcy katalog, nieznany surface i złą wersję”, „odrzuca komunikat z dwoma typami naraz”). Tolerancji `v0.9` nie pokrywa żaden test, więc dokumentuje ją korpus P0.2.

## Oś 2: katalog

**Stan faktyczny:**
- `CATALOG_ID = 'flowassist/v2'`;
- `createSurface` z innym `catalogId` jest odrzucany przez `parseEvent`;
- reducer zapisuje surface z `CATALOG_ID`;
- katalog to: `CATALOG_NAMES`, `ITEM_KINDS`, `REPRESENTATIONS`, `PRESENTATIONS` (`contract.ts`) oraz `KIND_REPRESENTATIONS`, `SUPPORTED_REPRESENTATIONS` i walidatory (`catalog.ts`).

**Zasady:**
- nowy komponent, `kind` lub reprezentacja w kontrakcie oznacza nowy identyfikator katalogu;
- **rozszerzenie `SUPPORTED_REPRESENTATIONS`** (klient zaczyna rysować reprezentację, która już jest w kontrakcie) zmienia wynik P10 dla istniejących elementów (ADR 0001, I4). **Decyzja D2 (2026-10-06):** to zmiana **capabilities**, nie katalogu — klient deklaruje ją w rozszerzeniu `flowassist.kinds` handshake'u (oś 3), a identyfikator katalogu zostaje. Nowy identyfikator katalogu oznacza wyłącznie zmianę kontraktu komponentów (punkt wyżej).
  - Uzasadnienie: sam `catalogId` nie mówi, które reprezentacje klient obsługuje (dopuszczenie agenta na jego podstawie to zgadywanie), a osobne identyfikatory dla każdej kombinacji reprezentacji mnożą katalogi i mieszają osie 2 i 3.
  - Warunek: w profilu `flowassist-transport/1` rozszerzenie `flowassist` jest **obowiązkowe** po obu stronach. Agent A2UI, który podaje tylko `supportedCatalogIds`, nie przechodzi negocjacji (jawny błąd przed pierwszym zdarzeniem), więc nie zobaczy po cichu innego wyniku P10. Tryb bazowy A2UI bez rozszerzenia to w przyszłości osobny, jawnie wybierany profil, nie fallback.
  - Ta decyzja koryguje zdanie planu v1.3.2 (P1.7: „rozszerzenie listy obsługiwanych reprezentacji wymaga nowego identyfikatora katalogu”);
- przyjmowanie kilku katalogów naraz to jawna zmiana `contract.ts` z testami, nie skutek uboczny podbicia numeru;
- nowa wartość `presentation` (np. `spatial`) **nie** jest zmianą katalogu, tylko decyzją o kernelu (`layout.ts`).

## Oś 3: profil transportowy

**Stan faktyczny:**
- rozszerzenia aplikacji `stage { focus, drawer }` i `narration { text, speak }` są **nieodwersjonowane**: `parseEvent` rozpoznaje je przed sprawdzeniem `version`;
- `AgentTransport` (`transport/types.ts`): `start(runId, request)`, `send(message)`, `subscribe(onEvent, onStatus)`, `stop()`;
- izolacja przebiegów przez `runId` tagowany przez transport;
- brak identyfikatorów zdarzeń, sekwencji, handshake'u i reconnectu.

**Zasada:** profil transportowy (roboczo `flowassist-transport/1`) jest wersjonowany osobno i obejmuje:
- rozszerzenia aplikacji (`stage`, `narration`);
- ramkę zdarzenia: identyfikator i sekwencja w obrębie przebiegu. Ramka jest częścią transportu, nie komunikatów A2UI;
- handshake możliwości (P1.7a, sekcja niżej): identyfikator katalogu i **obsługiwane** reprezentacje per rodzaj z `catalog.ts`; reguły stałe dla wersji profilu (wersje koperty, limity, klucze zarezerwowane) nie są wysyłane;
- sygnały lifecycle przebiegu. Status wynika z sygnałów semantycznych, nigdy z fizycznego końca strumienia (EOF);
- stan połączenia jako oś niezależną od `RunStatus` (adapter, P1.6).

Zmiany w `AgentTransport` są addytywne.

### Handshake możliwości (P1.7a)

Mechanizm (zweryfikowany 2026-10-06 na normatywnych schematach A2UI `client_capabilities.json` i `server_capabilities.json`,
v0.9 ≡ v0.9.1): capabilities jadą w **metadanych transportu**, nie jako komunikat A2UI. Obiekt standardowy jest zagnieżdżony
pod kluczem wersji: `a2uiClientCapabilities: { "v0.9": { supportedCatalogIds } }`; po stronie serwera `supportedCatalogIds`
jest opcjonalne, a `acceptsInlineCatalogs` domyślnie `false`. Katalogów inline nie używamy (I10).

- **Klient:** `StartRequest.capabilities = { a2uiClientCapabilities, flowassist: { profile, kinds } }`; rozszerzenie
  `flowassist` leży **poza** obiektem A2UI. Wartość liczy `startScenario` raz na przebieg i zamraża; adapter jej nie buduje.
- **Serwer:** `AgentTransport.serverCapabilities()` → `{ transportProfiles, a2uiServerCapabilities, flowassist?: { kinds } }`
  albo `null` (nieznane).
- **Negocjacja** (czysta funkcja, stała kolejność, pierwsza porażka wygrywa): 0 capabilities serwera znane → 1 wspólny
  profil → 2 poprawny kształt A2UI → 3 wspólny `catalogId` → 4 rozszerzenie `flowassist` (zły kształt = błąd; nieznane,
  poprawnie utypowane rodzaje i reprezentacje są pomijane) → 5 niepuste przecięcie reprezentacji per rodzaj. Porażka =
  `error` przebiegu przed pierwszym zdarzeniem, nigdy cichy fallback. Kontrola `catalogId` w `parseEvent` zostaje jako
  druga linia obrony; reprezentację spoza obsługi klienta P10 i tak zamienia w fallback z raportem.
- **Zgoda na wysyłkę jest per przebieg:** ustanawia ją wyłącznie udana negocjacja danego przebiegu; każdy `start`
  i `stop` ją resetuje. Po porażce albo `stop` żadne `send` nie trafia do backendu.
- Ramka zdarzeń, lifecycle, reconnect, raportowanie odrzuconych kopert i wiązanie z AG-UI: zamknięcie profilu (P1.7b),
  implementacja w P1.6.

## Schematy (P0.3)

Pochodna specyfikacja osi 1 i 2: `src/features/aiui/schemas/flowassist-v2/` (koperty agent → klient i klient → agent, propsy
komponentów po rozwiązaniu bindingów, treść reprezentacji). Parytet z guardami runtime pilnuje `__tests__/schema.test.ts`
(korpus + mutacje). Schematy nie są używane w runtime; zmiana guardów pod schemat to jawna zmiana kontraktu.

## Ścieżki `updateDataModel` (JSON Pointer)

**Decyzja (review #4, 2026-10-05, właściciel):** ścieżka to RFC 6901 z jednym zaostrzeniem dla tablic.

- Segment adresujący tablicę musi być **kanonicznym indeksem**: `0` albo cyfra 1–9 i dalsze cyfry.
- `-`, indeksy ujemne i niekanoniczne (`01`, `1.5`, `foo`, `length`, …) są **odrzucane**: dokument zostaje bez zmian
  (`setAt` zwraca tę samą referencję). Dotyczy to też segmentów pośrednich.
- **Bez semantyki append** dla `-` (JSON Patch jej używa, A2UI tego nie wymaga).
- Klucze obiektów nie podlegają tej regule (`-` czy `01` w obiekcie to zwykłe klucze).
- Odczyt (bindingi) widzi tylko własne właściwości; klucz `__proto__` jest zapisywany jako zwykła własna właściwość.

Odrzucenie jest dziś ciche (bez `VALIDATION_FAILED`): raport wymagałby zmiany reducera (kernel).
Schematy nie wyrażają tej reguły (zależy od kształtu danych), więc kontrakt pilnuje `__tests__/dataModelContract.test.ts`.

## Limity zasobów protokołu (FU-3)

**Decyzja (2026-10-06, właściciel):** niezaufane zdarzenie ma limit rozmiaru, zanim dotknie stanu. Limity są w jednym
miejscu: `contract.ts: PROTOCOL_LIMITS`, sprawdzane w `parseEvent` (przed reducerem, dla każdej ścieżki wejścia).

| Limit | Wartość | Uzasadnienie |
|---|---|---|
| `updateDataModel.path` — długość | ≤ 512 punktów kodowych Unicode | scenariusz research: < 40 znaków |
| `updateDataModel.path` — segmenty | ≤ 32 | scenariusz research: 2–3; ~10 tys. segmentów przepełniało stos w rekurencyjnym `setAt` |

- **Jednostka długości: punkty kodowe Unicode** — ta sama co `maxLength` w JSON Schema (para surogatów UTF-16 = 1),
  żeby guard i schemat miały ten sam kontrakt (weryfikacja Astry: ścieżka z emoji o 513 jednostkach UTF-16 i 257 punktach
  kodowych była odrzucana przez runtime, a przyjmowana przez schemat).
- Długość sprawdzana najpierw, z wczesnym wyjściem (≤ 512 jednostek UTF-16 → mieści się; > 1024 → nie mieści się;
  liczenie tylko pomiędzy); segmenty liczone dopiero dla krótkiego napisu.
- Zdarzenie ponad limitem jest odrzucane w całości: brak (częściowej) zmiany stanu, brak wyjątku, kolejne zdarzenia
  obsługiwane normalnie (`__tests__/dataModelLimits.test.ts`, także próg i próg + 1).
- JSON Schema: `maxLength: 512` i `pattern: ^(/[^/]*){0,32}$`; parytet z guardem w `schema.test.ts`.
- **Odrzucenie jest ciche** (ostrzeżenie w konsoli), tak jak każda niezgodna koperta. **Decyzja właściciela
  (2026-10-06):** zostaje ciche do P1.6; odpowiedź `VALIDATION_FAILED` na odrzucone koperty (także przekroczenie
  limitów) implementujemy dopiero w adapterze P1.6 (OBS-1, ADR 0005).

## Klucze zarezerwowane (FU-4)

**Decyzja (2026-10-06, właściciel):** granica protokołu odrzuca nazwy `__proto__`, `constructor`, `prototype`
(`contract.ts: RESERVED_KEYS`), sprawdzane w `parseEvent` przed reducerem, dla każdej ścieżki wejścia:

- jako **klucz własny na dowolnym poziomie ładunku** (koperta, `stage`, `narration`, propsy komponentów, wartość
  `updateDataModel` — także głęboko w obiektach i tablicach). `JSON.parse` tworzy własne `__proto__`, które przy
  kopiowaniu do zwykłego obiektu zmienia jego prototyp (dziedziczone pola trafiałyby do walidatorów, ADR 0007 Q3);
- jako **wartość, która później staje się kluczem**: `id` komponentu (`reducer.ts`: `next[c.id] = c` — mapa
  komponentów), wpis `children`, segment ścieżki data modelu.

Skan jest iteracyjny (ładunki bywają bardzo głębokie — 12 000 poziomów bez przepełnienia stosu) i pomija cykle.
Odrzucenie jest ciche, jak każda niezgodna koperta (OBS-1: odpowiedź `VALIDATION_FAILED` w adapterze P1.6); stan
bez zmian, kolejne zdarzenia obsługiwane, `Object.prototype` nietknięty (`__tests__/reservedKeys.test.ts`).
JSON Schema: `$defs.noReservedKeys` (rekurencyjnie `propertyNames` + `additionalProperties` + `items`), `not enum` dla
`id` i `children`, wykluczenie segmentu w `pattern` ścieżki; parytet z guardem w `schema.test.ts`.
Nazwy podobne (`constructorName`, `proto`, `__proto`) i wartości tekstowe `"__proto__"` są przyjmowane.

**Założenia i granice (review FU-4, 2026-10-06):**
- Guard sprawdza **migawkę** danych, a store zachowuje referencje do wejścia (bez kopii). Ochrona obowiązuje więc dla
  **świeżego wyniku `JSON.parse`**, którego wywołujący nie zatrzymuje ani nie mutuje. Obiekty zbudowane w JS (gettery
  zwracające różne wartości przy kolejnych odczytach, Proxy ze zmiennym `ownKeys`, mutacja po dispatch) są poza modelem
  zagrożeń — osiągalne dziś tylko przez dev-hook (`devDispatch`, wyłączony w produkcji). Adapter P1.6 parsuje każdy
  komunikat świeżo (albo robi round-trip JSON) — do zapisania w profilu (P1.7b).
- Koszt skanu jest liniowy w rozmiarze ładunku (rząd kosztu samego `JSON.parse`; 1 mln obiektów ≈ 0,2 s). Limitu
  rozmiaru komunikatu dziś nie ma (FU-3 ogranicza tylko ścieżkę) — limit bajtów **przed** `JSON.parse` należy do adaptera
  P1.6 (do zapisania w profilu, P1.7b).
- Klucz własny `constructor` albo `prototype` także w legalnych danych (np. id w mapie, nazwa kolumny) odrzuca cały
  komunikat — świadoma konsekwencja decyzji, do opisania w profilu (P1.7b).
- Parytet schematu: wzorzec ścieżki sprawdza segmenty przez `[^/]*`, nie przez `.` (`.` nie dopasowuje znaku końca linii,
  więc `/a
/__proto__` przechodziło przez schemat, choć guard je odrzucał); przypadki brzegowe w `schema.test.ts`.

## Otwarte

1. **Polityka wersji koperty:** czy tolerancja `v0.9` na wejściu zostaje (i jak ją uzasadnić), czy zawężamy do `v0.9.1`. Do decyzji kod bez zmian, a korpus P0.2 dokumentuje obecne zachowanie. Kandydat na uzasadnienie: schematy upstream v0.9.1 same przyjmują `version ∈ {"v0.9","v0.9.1"}`. Zamknięcie w dokumencie profilu (P1.7b).
2. ~~**Mechanizm handshake'u**~~ — **zamknięte (2026-10-06):** metadane transportu, kształt wg schematów upstream (sekcja „Handshake możliwości”).
3. **Które zdarzenia AG-UI niosą sygnały lifecycle:** research przed P1.6. `RUN_FINISHED` dotyczy pojedynczego wywołania backendu, nie przebiegu CameleON.
4. **Indeks tablicy ≥ długości:** kanoniczny indeks równy długości tablicy dziś ją wydłuża, a większy tworzy dziury
   (`[ , , x]`). Nieobjęte decyzją z review #4 — do rozstrzygnięcia (odrzucać czy dopuszczać).
   **Przypisane do P1.7b jako B4b** (właściciel, 2026-10-06): regułę normatywną ustala dokument profilu,
   a jej egzekwowanie w kodzie (`jsonPointer.ts: setAt`, zmiana kontraktu) wymaga osobnej zgody.
