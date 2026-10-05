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
- komunikat musi mieć dokładnie jeden klucz typu (`createSurface` | `updateComponents` | `updateDataModel` | `deleteSurface`).

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

## Otwarte

1. **Polityka wersji koperty:** czy tolerancja `v0.9` na wejściu zostaje (i jak ją uzasadnić), czy zawężamy do `v0.9.1`. Do decyzji kod bez zmian, a korpus P0.2 dokumentuje obecne zachowanie.
2. **Mechanizm handshake'u** w specyfikacji A2UI v0.9.1 (metadane / inicjalizacja): sprawdzić w specyfikacji przed P1.7.
3. **Które zdarzenia AG-UI niosą sygnały lifecycle:** research przed P1.6. `RUN_FINISHED` dotyczy pojedynczego wywołania backendu, nie przebiegu CameleON.
