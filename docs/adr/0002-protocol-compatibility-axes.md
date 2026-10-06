# ADR 0002: Trzy osie zgodności protokołu

- **Status:** zaakceptowany (v1.3). Polityka przyjmowania wersji koperty jest **otwarta** (sekcja „Otwarte”).
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
- **rozszerzenie `SUPPORTED_REPRESENTATIONS`** (klient zaczyna rysować reprezentację, która już jest w kontrakcie) zmienia wynik P10 dla istniejących elementów (ADR 0001, I4). Wymaga więc nowego identyfikatora katalogu albo handshake'u możliwości (P1.7), żeby agent wiedział, co klient obsługuje;
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
- handshake możliwości (P1.7): wersja koperty, identyfikator katalogu, **obsługiwane** reprezentacje i rodzaje z `catalog.ts`;
- sygnały lifecycle przebiegu. Status wynika z sygnałów semantycznych, nigdy z fizycznego końca strumienia (EOF);
- stan połączenia jako oś niezależną od `RunStatus` (adapter, P1.6).

Zmiany w `AgentTransport` są addytywne.

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

## Otwarte

1. **Polityka wersji koperty:** czy tolerancja `v0.9` na wejściu zostaje (i jak ją uzasadnić), czy zawężamy do `v0.9.1`. Do decyzji kod bez zmian, a korpus P0.2 dokumentuje obecne zachowanie.
2. **Mechanizm handshake'u** w specyfikacji A2UI v0.9.1 (metadane / inicjalizacja): sprawdzić w specyfikacji przed P1.7.
3. **Które zdarzenia AG-UI niosą sygnały lifecycle:** research przed P1.6. `RUN_FINISHED` dotyczy pojedynczego wywołania backendu, nie przebiegu CameleON.
4. **Indeks tablicy ≥ długości:** kanoniczny indeks równy długości tablicy dziś ją wydłuża, a większy tworzy dziury
   (`[ , , x]`). Nieobjęte decyzją z review #4 — do rozstrzygnięcia (odrzucać czy dopuszczać).
